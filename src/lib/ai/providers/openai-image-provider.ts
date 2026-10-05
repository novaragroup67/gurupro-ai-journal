/**
 * ==============================================================================
 * GURUPRO AI: OPENAI IMAGE GENERATION PROVIDER ADAPTER (VIS-1B)
 * ==============================================================================
 *
 * Implements the IllustrationGenerationProvider boundary interface for OpenAI
 * image generation models (such as gpt-image-1-mini or gpt-image-1).
 *
 * Features:
 * - Translates canonical IllustrationGenerationRequest into provider payload
 * - Maps aspect ratio and dimensions
 * - Embeds strict text policy constraints & negative guidance
 * - Bounded retry policy on transient errors (429, 503, network timeouts; max 2)
 * - Deterministic safety/content policy fail-fast (zero retries on rejection)
 * - Zero mock fallback on failure (always returns failed status)
 * - Image binary validation before marking as succeeded
 */

import { AI_ERROR_CODES, AiServiceError, normalizeAiError } from "../error-taxonomy";
import { getServerEnv } from "../ai-service";
import { assertValidImageBinary } from "../image-validator";
import type {
  IllustrationGenerationProvider,
  IllustrationGenerationRequest,
  IllustrationGenerationResult,
  IllustrationAspectRatio,
} from "../illustration-generation-contract";

const MAX_BOUNDED_RETRIES = 2;
const DEFAULT_TIMEOUT_MS = 60000;

export interface OpenAiImageProviderOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export class OpenAiImageProvider implements IllustrationGenerationProvider {
  readonly providerName = "openai";
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(options?: OpenAiImageProviderOptions) {
    this.apiKey = options?.apiKey || getServerEnv("OPENAI_API_KEY");
    this.model = options?.model || getServerEnv("OPENAI_IMAGE_MODEL") || "gpt-image-2";
    this.baseUrl = options?.baseUrl || getServerEnv("OPENAI_BASE_URL") || "https://api.openai.com/v1";
    this.fetchFn = options?.fetchFn || globalThis.fetch;
  }

  /**
   * Resolves target resolution based on requested aspect ratio and model constraints.
   */
  private resolveDimensions(aspectRatio: IllustrationAspectRatio): { size: string; width: number; height: number } {
    switch (aspectRatio) {
      case "16:9":
        return { size: "1536x864", width: 1536, height: 864 };
      case "9:16":
        return { size: "864x1536", width: 864, height: 1536 };
      case "4:3":
        return { size: "1024x768", width: 1024, height: 768 };
      case "3:4":
        return { size: "768x1024", width: 768, height: 1024 };
      case "1:1":
      default:
        return { size: "1024x1024", width: 1024, height: 1024 };
    }
  }

  /**
   * Validates canonical request against OpenAI image provider capabilities.
   */
  async validateRequest(request: IllustrationGenerationRequest): Promise<{ valid: boolean; reason?: string }> {
    if (!request) {
      return { valid: false, reason: "Permintaan generasi gambar kosong." };
    }
    if (request.targetType !== "illustration") {
      return {
        valid: false,
        reason: `Target '${request.targetType}' tidak didukung oleh provider gambar. Hanya 'illustration' yang diizinkan.`,
      };
    }
    if (!request.assembledPrompt || !request.assembledPrompt.fullPrompt) {
      return { valid: false, reason: "Prompt terstruktur belum dirakit." };
    }
    return { valid: true };
  }

  /**
   * Determines if an error is transient and retryable.
   */
  private isTransientError(status: number, message: string): boolean {
    if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
      return true;
    }
    const lower = message.toLowerCase();
    if (
      lower.includes("timeout") ||
      lower.includes("econnreset") ||
      lower.includes("socket hang up") ||
      lower.includes("overloaded") ||
      lower.includes("rate limit")
    ) {
      return true;
    }
    return false;
  }

  /**
   * Translates the canonical request into OpenAI image generation payload.
   */
  private buildPayload(request: IllustrationGenerationRequest): {
    model: string;
    prompt: string;
    n: number;
    size?: string;
  } {
    const dim = this.resolveDimensions(request.generationParameters.aspectRatio);

    // Enhance prompt with text policy negative constraints if present
    const promptParts = [request.assembledPrompt.fullPrompt];

    if (request.textPolicy.mustNotAppear && request.textPolicy.mustNotAppear.length > 0) {
      promptParts.push(
        `Negative Constraints: Absolutely DO NOT include any of the following text, labels, or watermarks: ${request.textPolicy.mustNotAppear.join(", ")}.`
      );
    }

    if (request.textPolicy.allowModelInventedText === false) {
      promptParts.push(
        "Text Policy: DO NOT invent, hallucinate, or render unreadable pseudo-text, random gibberish, or messy labels. Visual composition must remain crisp, pedagogically grounded, and clean."
      );
    }

    return {
      model: this.model,
      prompt: promptParts.join("\n\n"),
      n: 1,
      size: dim.size,
    };
  }

  /**
   * Normalizes raw provider response into canonical IllustrationGenerationResult.
   */
  normalizeResult(
    rawOutput: any,
    request: IllustrationGenerationRequest
  ): IllustrationGenerationResult {
    const genId = `gen_ill_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`;
    const now = new Date().toISOString();

    if (!rawOutput || !rawOutput.data || !Array.isArray(rawOutput.data) || rawOutput.data.length === 0) {
      return {
        generationId: genId,
        requestId: request.requestId,
        status: "failed",
        provider: this.providerName,
        model: this.model,
        createdAt: now,
        error: {
          code: AI_ERROR_CODES.GENERATION_FAILED,
          message: "Provider OpenAI tidak mengembalikan artefak gambar.",
          isRetryable: false,
        },
      };
    }

    const firstItem = rawOutput.data[0];
    const b64Data = firstItem.b64_json;
    const urlData = firstItem.url;
    const providerReqId = firstItem.generation_id || rawOutput.id || undefined;

    if (!b64Data && !urlData) {
      return {
        generationId: genId,
        requestId: request.requestId,
        status: "failed",
        provider: this.providerName,
        model: this.model,
        providerRequestId: providerReqId,
        createdAt: now,
        error: {
          code: AI_ERROR_CODES.GENERATION_FAILED,
          message: "Data gambar kosong dari respon OpenAI.",
          isRetryable: false,
        },
      };
    }

    // Determine data URL format
    const assetRef = b64Data
      ? (b64Data.startsWith("data:") ? b64Data : `data:image/png;base64,${b64Data}`)
      : urlData;

    // Validate binary content if base64 is available
    let validatedMime = "image/png";
    let validatedWidth = 1024;
    let validatedHeight = 1024;

    if (b64Data) {
      try {
        const val = assertValidImageBinary(b64Data, request.generationParameters.aspectRatio);
        validatedMime = val.mimeType;
        validatedWidth = val.width;
        validatedHeight = val.height;
      } catch (err: any) {
        return {
          generationId: genId,
          requestId: request.requestId,
          status: "failed",
          provider: this.providerName,
          model: this.model,
          providerRequestId: providerReqId,
          createdAt: now,
          error: {
            code: AI_ERROR_CODES.GENERATION_FAILED,
            message: `Validasi binary gambar gagal: ${err.message}`,
            isRetryable: false,
          },
        };
      }
    }

    return {
      generationId: genId,
      requestId: request.requestId,
      status: "succeeded",
      assetReference: assetRef,
      mimeType: validatedMime,
      width: validatedWidth,
      height: validatedHeight,
      provider: this.providerName,
      model: this.model,
      providerRequestId: providerReqId,
      createdAt: now,
    };
  }

  /**
   * Executes real image generation via OpenAI API with bounded retry.
   */
  async generate(request: IllustrationGenerationRequest): Promise<IllustrationGenerationResult> {
    const key = this.apiKey;
    if (!key) {
      throw new AiServiceError(
        AI_ERROR_CODES.AI_PROVIDER_ERROR,
        "Kunci API OpenAI (OPENAI_API_KEY) belum dikonfigurasi di server environment."
      );
    }

    const validation = await this.validateRequest(request);
    if (!validation.valid) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        validation.reason || "Permintaan generasi ilustrasi tidak valid."
      );
    }

    const payload = this.buildPayload(request);
    const endpoint = `${this.baseUrl.replace(/\/+$/, "")}/images/generations`;

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
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
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
          const errMsg =
            errData?.error?.message ||
            `OpenAI image API mengembalikan HTTP ${status}: ${res.statusText}`;

          // Check if safety or policy rejection
          if (
            errData?.error?.code === "content_policy_violation" ||
            status === 400 ||
            status === 401 ||
            status === 403
          ) {
            // Deterministic error — NEVER retry
            return {
              generationId: `gen_ill_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`,
              requestId: request.requestId,
              status: "failed",
              provider: this.providerName,
              model: this.model,
              createdAt: new Date().toISOString(),
              error: {
                code:
                  errData?.error?.code === "content_policy_violation"
                    ? AI_ERROR_CODES.AI_SAFETY_BLOCKED
                    : AI_ERROR_CODES.AI_PROVIDER_ERROR,
                message:
                  errData?.error?.code === "content_policy_violation"
                    ? "Permintaan visual ditolak oleh filter keamanan konten provider (safety policy)."
                    : errMsg,
                isRetryable: false,
              },
            };
          }

          if (this.isTransientError(status, errMsg) && attempt <= MAX_BOUNDED_RETRIES) {
            lastError = new Error(errMsg);
            // Exponential backoff wait (1s, 2s)
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
        break; // Succeeded
      } catch (err: any) {
        clearTimeout(timeoutId);
        const isTimeout = err.name === "AbortError" || err.message?.includes("aborted");
        const errMsg = isTimeout
          ? `Koneksi ke OpenAI image API melampaui batas waktu (${DEFAULT_TIMEOUT_MS}ms).`
          : err.message || "Kegagalan jaringan ke provider OpenAI.";

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
