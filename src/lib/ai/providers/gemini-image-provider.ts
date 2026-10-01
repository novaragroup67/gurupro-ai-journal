/**
 * ==============================================================================
 * GURUPRO AI: GOOGLE GEMINI IMAGE GENERATION PROVIDER ADAPTER (VIS-1B)
 * ==============================================================================
 *
 * Implements the IllustrationGenerationProvider boundary interface for Google
 * Gemini multimodal image generation models (e.g. gemini-2.5-flash-image).
 *
 * Features:
 * - Translates canonical IllustrationGenerationRequest into Gemini contents payload
 * - Injects negative prompt and text policy directives
 * - Extracts inlineData image bytes (base64)
 * - Normalizes safety blocks and quota errors
 * - Image binary validation before marking as succeeded
 * - Bounded retry policy on transient failures (max 2)
 * - Zero mock SVG fallback on failure
 */

import { AI_ERROR_CODES, AiServiceError } from "../error-taxonomy";
import { getServerEnv } from "../ai-service";
import { assertValidImageBinary } from "../image-validator";
import type {
  IllustrationGenerationProvider,
  IllustrationGenerationRequest,
  IllustrationGenerationResult,
} from "../illustration-generation-contract";

const MAX_BOUNDED_RETRIES = 2;
const DEFAULT_TIMEOUT_MS = 60000;

export interface GeminiImageProviderOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export class GeminiImageProvider implements IllustrationGenerationProvider {
  readonly providerName = "gemini";
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(options?: GeminiImageProviderOptions) {
    this.apiKey = options?.apiKey || getServerEnv("GEMINI_API_KEY");
    this.model = options?.model || getServerEnv("GEMINI_IMAGE_MODEL") || "gemini-2.5-flash-image";
    this.baseUrl =
      options?.baseUrl ||
      getServerEnv("GEMINI_BASE_URL") ||
      "https://generativelanguage.googleapis.com/v1beta";
    this.fetchFn = options?.fetchFn || globalThis.fetch;
  }

  async validateRequest(
    request: IllustrationGenerationRequest
  ): Promise<{ valid: boolean; reason?: string }> {
    if (!request) {
      return { valid: false, reason: "Permintaan generasi gambar kosong." };
    }
    if (request.targetType !== "illustration") {
      return {
        valid: false,
        reason: `Target '${request.targetType}' tidak didukung oleh provider gambar.`,
      };
    }
    if (!request.assembledPrompt || !request.assembledPrompt.fullPrompt) {
      return { valid: false, reason: "Prompt terstruktur belum dirakit." };
    }
    return { valid: true };
  }

  private isTransientError(status: number, message: string): boolean {
    if (status === 500 || status === 502 || status === 503 || status === 504) {
      return true;
    }
    const lower = message.toLowerCase();
    if (lower.includes("timeout") || lower.includes("econnreset") || lower.includes("socket hang up")) {
      return true;
    }
    return false;
  }

  normalizeResult(
    rawOutput: any,
    request: IllustrationGenerationRequest
  ): IllustrationGenerationResult {
    const genId = `gen_ill_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`;
    const now = new Date().toISOString();

    const candidate = rawOutput?.candidates?.[0];
    if (!candidate) {
      return {
        generationId: genId,
        requestId: request.requestId,
        status: "failed",
        provider: this.providerName,
        model: this.model,
        createdAt: now,
        error: {
          code: AI_ERROR_CODES.GENERATION_FAILED,
          message: "Tidak ada kandidat visual yang dihasilkan oleh Gemini.",
          isRetryable: false,
        },
      };
    }

    if (candidate.finishReason === "SAFETY") {
      return {
        generationId: genId,
        requestId: request.requestId,
        status: "failed",
        provider: this.providerName,
        model: this.model,
        createdAt: now,
        error: {
          code: AI_ERROR_CODES.AI_SAFETY_BLOCKED,
          message: "Generasi gambar diblokir oleh kebijakan keamanan konten Gemini (SAFETY).",
          isRetryable: false,
        },
      };
    }

    const parts = candidate.content?.parts;
    let b64Data: string | undefined;
    let mimeType = "image/png";

    if (Array.isArray(parts)) {
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          b64Data = part.inlineData.data;
          mimeType = part.inlineData.mimeType || "image/png";
          break;
        }
      }
    }

    if (!b64Data) {
      return {
        generationId: genId,
        requestId: request.requestId,
        status: "failed",
        provider: this.providerName,
        model: this.model,
        createdAt: now,
        error: {
          code: AI_ERROR_CODES.GENERATION_FAILED,
          message: "Respon Gemini tidak menyertakan artefak visual gambar (inlineData kosong).",
          isRetryable: false,
        },
      };
    }

    const assetRef = b64Data.startsWith("data:") ? b64Data : `data:${mimeType};base64,${b64Data}`;

    try {
      const val = assertValidImageBinary(b64Data, request.generationParameters.aspectRatio);
      return {
        generationId: genId,
        requestId: request.requestId,
        status: "succeeded",
        assetReference: assetRef,
        mimeType: val.mimeType,
        width: val.width,
        height: val.height,
        provider: this.providerName,
        model: this.model,
        createdAt: now,
      };
    } catch (err: any) {
      return {
        generationId: genId,
        requestId: request.requestId,
        status: "failed",
        provider: this.providerName,
        model: this.model,
        createdAt: now,
        error: {
          code: AI_ERROR_CODES.GENERATION_FAILED,
          message: `Validasi gambar Gemini gagal: ${err.message}`,
          isRetryable: false,
        },
      };
    }
  }

  async generate(request: IllustrationGenerationRequest): Promise<IllustrationGenerationResult> {
    const key = this.apiKey;
    if (!key) {
      throw new AiServiceError(
        AI_ERROR_CODES.AI_PROVIDER_ERROR,
        "Kunci API Gemini (GEMINI_API_KEY) belum dikonfigurasi di server environment."
      );
    }

    const validation = await this.validateRequest(request);
    if (!validation.valid) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        validation.reason || "Permintaan generasi gambar tidak valid."
      );
    }

    const promptParts = [request.assembledPrompt.fullPrompt];
    if (request.textPolicy.mustNotAppear && request.textPolicy.mustNotAppear.length > 0) {
      promptParts.push(
        `Negative Constraints: DO NOT include: ${request.textPolicy.mustNotAppear.join(", ")}.`
      );
    }
    if (!request.textPolicy.allowModelInventedText) {
      promptParts.push(
        "Text Constraints: DO NOT invent messy labels or phantom text. Clean visual composition only."
      );
    }

    const payload = {
      contents: [
        {
          parts: [{ text: promptParts.join("\n\n") }],
        },
      ],
      generationConfig: {
        responseModalities: ["IMAGE"],
      },
    };

    const endpoint = `${this.baseUrl.replace(/\/+$/, "")}/models/${this.model}:generateContent?key=${key}`;

    let attempt = 0;
    let lastError: Error | null = null;
    let rawResponse: any = null;

    while (attempt <= MAX_BOUNDED_RETRIES) {
      attempt++;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

      try {
        const res = await this.fetchFn(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          let errData: any = {};
          try {
            errData = await res.json();
          } catch {}

          const status = res.status;
          const errMsg = errData?.error?.message || `Gemini API HTTP ${status}: ${res.statusText}`;

          if (status === 429) {
            return {
              generationId: `gen_ill_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`,
              requestId: request.requestId,
              status: "failed",
              provider: this.providerName,
              model: this.model,
              createdAt: new Date().toISOString(),
              error: {
                code: AI_ERROR_CODES.AI_QUOTA_EXCEEDED,
                message:
                  "Kuota generasi gambar Gemini telah habis atau belum aktif di proyek Google Cloud Anda.",
                isRetryable: false,
              },
            };
          }

          if (status === 400 || status === 403) {
            return {
              generationId: `gen_ill_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`,
              requestId: request.requestId,
              status: "failed",
              provider: this.providerName,
              model: this.model,
              createdAt: new Date().toISOString(),
              error: {
                code: AI_ERROR_CODES.AI_PROVIDER_ERROR,
                message: errMsg,
                isRetryable: false,
              },
            };
          }

          if (this.isTransientError(status, errMsg) && attempt <= MAX_BOUNDED_RETRIES) {
            lastError = new Error(errMsg);
            await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
            continue;
          }

          return {
            generationId: `gen_ill_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`,
            requestId: request.requestId,
            status: "failed",
            provider: this.providerName,
            model: this.model,
            createdAt: new Date().toISOString(),
            error: {
              code: AI_ERROR_CODES.AI_PROVIDER_ERROR,
              message: errMsg,
              isRetryable: this.isTransientError(status, errMsg),
            },
          };
        }

        rawResponse = await res.json();
        break;
      } catch (err: any) {
        clearTimeout(timeoutId);
        const isTimeout = err.name === "AbortError" || err.message?.includes("aborted");
        const errMsg = isTimeout
          ? `Koneksi ke Gemini image API timeout (${DEFAULT_TIMEOUT_MS}ms).`
          : err.message || "Kegagalan jaringan ke provider Gemini.";

        if (attempt <= MAX_BOUNDED_RETRIES) {
          lastError = new Error(errMsg);
          await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
          continue;
        }

        return {
          generationId: `gen_ill_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`,
          requestId: request.requestId,
          status: "failed",
          provider: this.providerName,
          model: this.model,
          createdAt: new Date().toISOString(),
          error: {
            code: isTimeout ? AI_ERROR_CODES.AI_TIMEOUT : AI_ERROR_CODES.AI_PROVIDER_ERROR,
            message: errMsg,
            isRetryable: true,
          },
        };
      }
    }

    if (!rawResponse) {
      return {
        generationId: `gen_ill_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`,
        requestId: request.requestId,
        status: "failed",
        provider: this.providerName,
        model: this.model,
        createdAt: new Date().toISOString(),
        error: {
          code: AI_ERROR_CODES.AI_PROVIDER_ERROR,
          message: lastError?.message || "Generasi gambar gagal setelah batas retry tercapai.",
          isRetryable: false,
        },
      };
    }

    return this.normalizeResult(rawResponse, request);
  }
}
