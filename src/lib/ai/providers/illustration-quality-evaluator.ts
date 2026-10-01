/**
 * ==============================================================================
 * GURUPRO AI: ILLUSTRATION QUALITY EVALUATOR PROVIDER BOUNDARY (VIS-1E)
 * ==============================================================================
 *
 * Implements the provider-independent AI vision evaluation interface for analyzing
 * generated illustration images against immutable approved outline and style snapshots.
 *
 * Features:
 * - Provider-independent boundary interface (IllustrationQualityEvaluator)
 * - Multimodal image payload (data URL base64) passed alongside structured prompt
 * - OpenAI-compatible vision completions (Lovable Gateway, OpenAI, Gemini)
 * - Strict schema validation with Zod (fails closed on malformed AI output)
 * - Bounded retries (max 2) on transient network / rate-limit failures
 * - In-memory mock evaluator registration for deterministic automated tests
 */

import { z } from "zod";
import { AI_ERROR_CODES, AiServiceError, normalizeAiError } from "../error-taxonomy";
import { getServerEnv } from "../ai-service";
import { getRegisteredPrompt } from "../prompts-registry";
import {
  type IllustrationQualitySemanticResult,
  IllustrationQualitySemanticResultSchema,
  CANONICAL_ILLUSTRATION_QUALITY_EVALUATOR_VERSION,
} from "../illustration-quality-contract";
import type { ApprovedOutlineSnapshot, ApprovedStyleSnapshot } from "../illustration-review-contract";

export interface IllustrationQualityEvaluationRequest {
  assetId: string;
  assetHash: string;
  imageBytes: Uint8Array;
  mimeType: string;
  approvedOutline: ApprovedOutlineSnapshot;
  approvedStyle: ApprovedStyleSnapshot;
  groundingSnapshot?: {
    sourceReferences?: string[];
    evidenceReferences?: string[];
    subjectDiscipline?: string;
    audienceLevel?: string;
    curriculumContext?: string;
  };
  textPolicy?: any;
}

export interface IllustrationQualityEvaluator {
  readonly providerName: string;
  readonly modelName: string;
  evaluate(request: IllustrationQualityEvaluationRequest): Promise<IllustrationQualitySemanticResult>;
}

const DEFAULT_TIMEOUT_MS = 60000;
const MAX_BOUNDED_RETRIES = 2;

// ==============================================================================
// 1. JSON EXTRACTION HELPER
// ==============================================================================

function extractJsonText(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/gi, "")
    .replace(/```$/g, "")
    .trim();
  const start = cleaned.search(/[[{]/);
  const text = start >= 0 ? cleaned.slice(start) : cleaned;
  const lastBrace = text.lastIndexOf("}");
  const lastBracket = text.lastIndexOf("]");
  const end = Math.max(lastBrace, lastBracket);
  if (end > 0) {
    return text.slice(0, end + 1);
  }
  return text;
}

// ==============================================================================
// 2. OPENAI-COMPATIBLE MULTIMODAL VISION EVALUATOR ADAPTER
// ==============================================================================

export interface OpenAiCompatibleVisionOptions {
  providerName: string;
  endpoint: string;
  apiKey: string;
  model: string;
  customHeaders?: Record<string, string>;
  fetchFn?: typeof fetch;
}

export class OpenAiCompatibleVisionQualityEvaluator implements IllustrationQualityEvaluator {
  readonly providerName: string;
  readonly modelName: string;
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly customHeaders: Record<string, string>;
  private readonly fetchFn: typeof fetch;

  constructor(options: OpenAiCompatibleVisionOptions) {
    this.providerName = options.providerName || "openai";
    this.modelName = options.model || "gpt-4o-mini";
    this.endpoint = options.endpoint || "https://api.openai.com/v1/chat/completions";
    this.apiKey = options.apiKey;
    this.customHeaders = options.customHeaders || {};
    this.fetchFn = options.fetchFn || globalThis.fetch;
  }

  async evaluate(
    request: IllustrationQualityEvaluationRequest
  ): Promise<IllustrationQualitySemanticResult> {
    const promptDef = getRegisteredPrompt(CANONICAL_ILLUSTRATION_QUALITY_EVALUATOR_VERSION);

    // Build context dictionary
    const userPromptText = promptDef.buildUserPrompt({
      outlineTitle: request.approvedOutline.title,
      outlineVersion: request.approvedOutline.version,
      outlineObjective: request.approvedOutline.objective,
      outlineMainSubject: request.approvedOutline.mainSubject,
      outlineSupportingElements: request.approvedOutline.supportingElements,
      outlineEnvironment: request.approvedOutline.environment,
      outlineComposition: request.approvedOutline.composition,
      outlineEducationalFocus: request.approvedOutline.educationalFocus,
      outlineVisualDetails: request.approvedOutline.visualDetails,
      outlineThingsToAvoid: request.approvedOutline.thingsToAvoid || [],
      styleId: request.approvedStyle.id,
      styleName: request.approvedStyle.name,
      styleVersion: request.approvedStyle.version,
      styleVisualRules: request.approvedStyle.visualRules,
      textPolicy: request.textPolicy || {},
      subjectDiscipline: request.groundingSnapshot?.subjectDiscipline,
      audienceLevel: request.groundingSnapshot?.audienceLevel,
      curriculumContext: request.groundingSnapshot?.curriculumContext,
      evidenceReferences: request.groundingSnapshot?.evidenceReferences || [],
    });

    // Convert raw binary to base64 data URL
    const base64Data = Buffer.from(request.imageBytes).toString("base64");
    const dataUrl = `data:${request.mimeType};base64,${base64Data}`;

    const headers: Record<string, string> = {
      "content-type": "application/json",
      authorization: `Bearer ${this.apiKey}`,
      ...this.customHeaders,
    };

    const payload = {
      model: this.modelName,
      messages: [
        {
          role: "system",
          content: promptDef.systemPrompt,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: userPromptText,
            },
            {
              type: "image_url",
              image_url: {
                url: dataUrl,
                detail: "high",
              },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2, // Low temperature for consistent, objective evaluation
      max_tokens: 3000,
    };

    let lastError: unknown = null;

    for (let attempt = 0; attempt <= MAX_BOUNDED_RETRIES; attempt++) {
      try {
        const response = await this.fetchFn(this.endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
        });

        if (!response.ok) {
          let errBody = "";
          try {
            errBody = await response.text();
          } catch {}

          if (response.status === 401 || response.status === 403) {
            throw new AiServiceError(
              AI_ERROR_CODES.AUTH_ERROR,
              "Autentikasi penyedia visi AI gagal. Kunci API tidak valid atau telah kedaluwarsa."
            );
          }
          if (response.status === 429) {
            throw new AiServiceError(
              AI_ERROR_CODES.AI_RATE_LIMIT,
              "Penyedia visi AI mengembalikan batas kuota rate limit (HTTP 429)."
            );
          }
          if (response.status >= 500) {
            throw new AiServiceError(
              AI_ERROR_CODES.AI_PROVIDER_ERROR,
              `Penyedia visi AI mengalami gangguan internal (HTTP ${response.status}): ${errBody.slice(0, 150)}`
            );
          }

          throw new AiServiceError(
            AI_ERROR_CODES.AI_PROVIDER_ERROR,
            `Permintaan evaluasi mutu gambar AI gagal (HTTP ${response.status}): ${errBody.slice(0, 150)}`
          );
        }

        const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const rawContent = json.choices?.[0]?.message?.content;
        if (!rawContent || !rawContent.trim()) {
          throw new AiServiceError(
            AI_ERROR_CODES.AI_OUTPUT_INVALID,
            "Penyedia visi AI mengembalikan respons evaluasi kosong."
          );
        }

        const jsonStr = extractJsonText(rawContent);
        let parsed: any;
        try {
          parsed = JSON.parse(jsonStr);
        } catch (jsonErr: any) {
          throw new AiServiceError(
            AI_ERROR_CODES.AI_OUTPUT_INVALID,
            `Format keluaran evaluator visi AI bukan JSON valid: ${jsonErr.message}`
          );
        }

        // Schema validation (Fail-closed)
        const parseResult = IllustrationQualitySemanticResultSchema.safeParse(parsed);
        if (!parseResult.success) {
          const errors = parseResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
          throw new AiServiceError(
            AI_ERROR_CODES.AI_OUTPUT_INVALID,
            `Keluaran evaluator visi AI tidak memenuhi kontrak kanonikal: ${errors}`
          );
        }

        return {
          ...parseResult.data,
          evaluatorMetadata: {
            provider: this.providerName,
            model: this.modelName,
            evaluatorVersion: CANONICAL_ILLUSTRATION_QUALITY_EVALUATOR_VERSION,
          },
        };
      } catch (err: unknown) {
        lastError = err;
        const normalized = normalizeAiError(err);

        // Retry only if retryable and attempts remain
        if (normalized.isRetryable && attempt < MAX_BOUNDED_RETRIES) {
          const delay = Math.min(2000, 400 * Math.pow(2, attempt) + Math.random() * 200);
          await new Promise((res) => setTimeout(res, delay));
          continue;
        }

        throw normalized;
      }
    }

    throw normalizeAiError(lastError);
  }
}

// ==============================================================================
// 3. FACTORY & MOCK REGISTRY
// ==============================================================================

let _mockEvaluator: IllustrationQualityEvaluator | null = null;

export function setMockIllustrationQualityEvaluator(evaluator: IllustrationQualityEvaluator | null): void {
  _mockEvaluator = evaluator;
}

export function getMockIllustrationQualityEvaluator(): IllustrationQualityEvaluator | null {
  return _mockEvaluator;
}

export function resolveIllustrationQualityEvaluator(): IllustrationQualityEvaluator {
  if (_mockEvaluator) {
    return _mockEvaluator;
  }

  // 1. Lovable AI Gateway
  const lovableKey = getServerEnv("LOVABLE_API_KEY");
  if (lovableKey && lovableKey.trim().length > 0) {
    const customModel = getServerEnv("AI_MODEL");
    return new OpenAiCompatibleVisionQualityEvaluator({
      providerName: "lovable",
      endpoint: getServerEnv("AI_ENDPOINT") || "https://ai.gateway.lovable.dev/v1/chat/completions",
      apiKey: lovableKey.trim(),
      model: customModel || "google/gemini-2.5-flash",
      customHeaders: {
        "lovable-api-key": lovableKey.trim(),
      },
    });
  }

  // 2. Google Gemini via OpenAI-compatible endpoint
  const geminiKey = getServerEnv("GEMINI_API_KEY");
  if (geminiKey && geminiKey.trim().length > 0) {
    const customModel = getServerEnv("AI_MODEL");
    return new OpenAiCompatibleVisionQualityEvaluator({
      providerName: "gemini",
      endpoint:
        getServerEnv("AI_ENDPOINT") ||
        "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      apiKey: geminiKey.trim(),
      model: customModel || "gemini-2.5-flash",
    });
  }

  // 3. OpenAI Vision (gpt-4o-mini)
  const openAiKey = getServerEnv("OPENAI_API_KEY");
  if (openAiKey && openAiKey.trim().length > 0) {
    const customModel = getServerEnv("AI_MODEL");
    return new OpenAiCompatibleVisionQualityEvaluator({
      providerName: "openai",
      endpoint: getServerEnv("AI_ENDPOINT") || "https://api.openai.com/v1/chat/completions",
      apiKey: openAiKey.trim(),
      model: customModel || "gpt-4o-mini",
    });
  }

  throw new AiServiceError(
    AI_ERROR_CODES.PROVIDER_UNAVAILABLE,
    "Konfigurasi evaluator visi AI belum siap: Kunci API (LOVABLE_API_KEY, GEMINI_API_KEY, atau OPENAI_API_KEY) belum disetel pada server environment."
  );
}
