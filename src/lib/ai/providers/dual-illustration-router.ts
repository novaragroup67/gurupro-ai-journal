/**
 * ==============================================================================
 * GURUPRO AI: DUAL-PROVIDER ILLUSTRATION ROUTER (AI-CORE-RECOVERY-1)
 * ==============================================================================
 *
 * Implements high-resilience multi-provider image generation routing between
 * Google Gemini (gemini-3.1-flash-image) and OpenAI (gpt-image-2).
 *
 * Routing Rules:
 * 1. Primary provider selected by AI_IMAGE_PRIMARY (default: "gemini")
 * 2. Fallback provider selected by AI_IMAGE_FALLBACK (default: "openai")
 * 3. Bounded automatic failover upon retryable/transient upstream failures:
 *    - Rate limits (429 / AI_RATE_LIMIT)
 *    - Gateway timeouts / Upstream outages (500, 502, 503, 504)
 *    - Network connection reset / fetch failures
 * 4. STRICT FAIL-CLOSED SAFETY GATE:
 *    - Prompt safety violations (AI_SAFETY_BLOCKED) NEVER trigger failover.
 *    - The router fails immediately with AI_SAFETY_BLOCKED.
 * 5. Provider provenance tracking:
 *    - Generation result records which provider and model ultimately generated the asset.
 *    - Includes failover metadata if secondary was engaged.
 */

import { AI_ERROR_CODES, AiServiceError } from "../error-taxonomy";
import { getServerEnv } from "../ai-service";
import { trackProductEvent, PRODUCT_EVENT_NAMES } from "../../analytics/product-events";
import type {
  IllustrationGenerationProvider,
  IllustrationGenerationRequest,
  IllustrationGenerationResult,
} from "../illustration-generation-contract";
import { GeminiImageProvider } from "./gemini-image-provider";
import { OpenAiImageProvider } from "./openai-image-provider";

export interface DualIllustrationRouterOptions {
  primaryProvider?: IllustrationGenerationProvider;
  fallbackProvider?: IllustrationGenerationProvider;
  primaryName?: "gemini" | "openai";
  fallbackName?: "gemini" | "openai";
  geminiApiKey?: string;
  openAiApiKey?: string;
}

export class DualIllustrationRouter implements IllustrationGenerationProvider {
  readonly providerName = "dual-router";
  readonly primaryProvider: IllustrationGenerationProvider;
  readonly fallbackProvider?: IllustrationGenerationProvider;

  constructor(options?: DualIllustrationRouterOptions) {
    if (options?.primaryProvider) {
      this.primaryProvider = options.primaryProvider;
      this.fallbackProvider = options.fallbackProvider;
      return;
    }

    const geminiKey = options?.geminiApiKey || getServerEnv("GEMINI_API_KEY");
    const openAiKey = options?.openAiApiKey || getServerEnv("OPENAI_API_KEY");

    const preferredPrimary = (
      options?.primaryName ||
      getServerEnv("AI_IMAGE_PRIMARY") ||
      "gemini"
    ).toLowerCase();

    const preferredFallback = (
      options?.fallbackName ||
      getServerEnv("AI_IMAGE_FALLBACK") ||
      (preferredPrimary === "gemini" ? "openai" : "gemini")
    ).toLowerCase();

    let primary: IllustrationGenerationProvider | null = null;
    let fallback: IllustrationGenerationProvider | null = null;

    if (preferredPrimary === "gemini" && geminiKey && geminiKey.trim().length > 0) {
      primary = new GeminiImageProvider({ apiKey: geminiKey.trim() });
    } else if (preferredPrimary === "openai" && openAiKey && openAiKey.trim().length > 0) {
      primary = new OpenAiImageProvider({ apiKey: openAiKey.trim() });
    }

    // If preferred primary wasn't available, check the other key
    if (!primary) {
      if (geminiKey && geminiKey.trim().length > 0) {
        primary = new GeminiImageProvider({ apiKey: geminiKey.trim() });
      } else if (openAiKey && openAiKey.trim().length > 0) {
        primary = new OpenAiImageProvider({ apiKey: openAiKey.trim() });
      }
    }

    // Set fallback if key is available and distinct from primary
    if (primary) {
      if (primary.providerName === "gemini" && openAiKey && openAiKey.trim().length > 0) {
        fallback = new OpenAiImageProvider({ apiKey: openAiKey.trim() });
      } else if (primary.providerName === "openai" && geminiKey && geminiKey.trim().length > 0) {
        fallback = new GeminiImageProvider({ apiKey: geminiKey.trim() });
      }
    }

    if (!primary) {
      throw new AiServiceError(
        AI_ERROR_CODES.PROVIDER_UNAVAILABLE,
        "Konfigurasi dual-provider AI belum siap: Kunci API gambar (GEMINI_API_KEY atau OPENAI_API_KEY) belum disetel pada server environment."
      );
    }

    this.primaryProvider = primary;
    this.fallbackProvider = fallback || undefined;
  }

  async validateRequest(
    request: IllustrationGenerationRequest
  ): Promise<{ valid: boolean; reason?: string }> {
    return this.primaryProvider.validateRequest(request);
  }

  private isRetryableFailoverError(err: any): boolean {
    if (!err) return false;

    // Invariant: Safety blocks MUST NOT failover
    if (
      err.code === AI_ERROR_CODES.AI_SAFETY_BLOCKED ||
      err.code === "AI_SAFETY_BLOCKED" ||
      err.message?.toLowerCase().includes("safety") ||
      err.message?.toLowerCase().includes("kebijakan keselamatan")
    ) {
      return false;
    }

    // Invariant: Invalid user request/parameters MUST NOT failover
    if (
      err.code === AI_ERROR_CODES.INVALID_REQUEST ||
      err.code === AI_ERROR_CODES.INVALID_PARAMETERS
    ) {
      return false;
    }

    // Transient errors eligible for failover
    const isRateLimit =
      err.code === AI_ERROR_CODES.AI_RATE_LIMIT ||
      err.statusCode === 429 ||
      err.message?.includes("429") ||
      err.message?.toLowerCase().includes("rate limit") ||
      err.message?.toLowerCase().includes("quota");

    const isUpstreamFailure =
      err.code === AI_ERROR_CODES.AI_UPSTREAM_ERROR ||
      err.code === AI_ERROR_CODES.AI_PROVIDER_ERROR ||
      err.code === AI_ERROR_CODES.GENERATION_FAILED ||
      err.code === AI_ERROR_CODES.PROVIDER_UNAVAILABLE ||
      err.code === AI_ERROR_CODES.AI_TIMEOUT ||
      err.statusCode === 500 ||
      err.statusCode === 502 ||
      err.statusCode === 503 ||
      err.statusCode === 504 ||
      err.message?.includes("500") ||
      err.message?.includes("502") ||
      err.message?.includes("503") ||
      err.message?.includes("504") ||
      err.message?.toLowerCase().includes("unavailable") ||
      err.message?.toLowerCase().includes("timeout") ||
      err.message?.toLowerCase().includes("network") ||
      err.message?.toLowerCase().includes("econnreset");

    return isRateLimit || isUpstreamFailure;
  }

  async generate(
    request: IllustrationGenerationRequest
  ): Promise<IllustrationGenerationResult> {
    let primaryErr: any = null;

    try {
      // 1. Try Primary Provider
      const result = await this.primaryProvider.generate(request);
      if (result.status === "succeeded") {
        trackProductEvent({
          eventName: PRODUCT_EVENT_NAMES.AI_GENERATION_SUCCESS,
          feature: "ai_core",
          metadata: { provider: this.primaryProvider.providerName, requestId: request.requestId },
        });
        return result;
      }
      primaryErr = result.error || {
        code: AI_ERROR_CODES.GENERATION_FAILED,
        message: "Generasi ilustrasi gagal pada provider utama.",
        isRetryable: true,
      };
    } catch (err: any) {
      primaryErr = err;
    }

    // 2. Strict Safety Block Check: NEVER failover on safety violations
    if (
      primaryErr.code === AI_ERROR_CODES.AI_SAFETY_BLOCKED ||
      primaryErr.code === "AI_SAFETY_BLOCKED" ||
      primaryErr.message?.toLowerCase().includes("safety") ||
      primaryErr.message?.toLowerCase().includes("kebijakan keselamatan")
    ) {
      console.warn(
        `[DualIllustrationRouter] Primary provider (${this.primaryProvider.providerName}) triggered safety block. Aborting without failover.`
      );
      trackProductEvent({
        eventName: PRODUCT_EVENT_NAMES.AI_GENERATION_FAILURE,
        feature: "ai_core",
        metadata: {
          provider: this.primaryProvider.providerName,
          code: "AI_SAFETY_BLOCKED",
          safety_blocked: true,
          requestId: request.requestId,
        },
      });
      if (primaryErr instanceof Error) throw primaryErr;
      throw new AiServiceError(
        AI_ERROR_CODES.AI_SAFETY_BLOCKED,
        primaryErr.message || "Generasi gambar diblokir oleh kebijakan keamanan konten (SAFETY)."
      );
    }

    // 3. Check if Fallback is available and error is eligible
    if (this.fallbackProvider && this.isRetryableFailoverError(primaryErr)) {
      console.warn(
        `[DualIllustrationRouter] Primary provider (${this.primaryProvider.providerName}) failed with retryable error (${primaryErr.message || primaryErr.code}). Failing over to ${this.fallbackProvider.providerName}...`
      );
      trackProductEvent({
        eventName: PRODUCT_EVENT_NAMES.AI_PROVIDER_FAILOVER,
        feature: "ai_core",
        metadata: {
          from: this.primaryProvider.providerName,
          to: this.fallbackProvider.providerName,
          error: primaryErr.message || primaryErr.code,
          requestId: request.requestId,
        },
      });

      try {
        const fallbackResult = await this.fallbackProvider.generate(request);
        if (fallbackResult.status === "failed") {
          throw new AiServiceError(
            fallbackResult.error?.code || AI_ERROR_CODES.AI_UPSTREAM_ERROR,
            fallbackResult.error?.message || "Fallback provider gagal menghasilkan gambar."
          );
        }
        trackProductEvent({
          eventName: PRODUCT_EVENT_NAMES.AI_GENERATION_SUCCESS,
          feature: "ai_core",
          metadata: {
            provider: this.fallbackProvider.providerName,
            failover: true,
            requestId: request.requestId,
          },
        });
        // Mark failover in result metadata for auditability
        return {
          ...fallbackResult,
          metadata: {
            ...(fallbackResult as any).metadata,
            failoverUsed: true,
            primaryProvider: this.primaryProvider.providerName,
            primaryError: primaryErr.message || primaryErr.code,
            resolvedProvider: this.fallbackProvider.providerName,
          },
        };
      } catch (fallbackErr: any) {
        console.error(
          `[DualIllustrationRouter] Fallback provider (${this.fallbackProvider.providerName}) also failed:`,
          fallbackErr
        );
        trackProductEvent({
          eventName: PRODUCT_EVENT_NAMES.AI_PROVIDER_UNAVAILABLE,
          feature: "ai_core",
          metadata: {
            primary: this.primaryProvider.providerName,
            fallback: this.fallbackProvider.providerName,
            requestId: request.requestId,
          },
        });
        throw new AiServiceError(
          fallbackErr.code || AI_ERROR_CODES.AI_UPSTREAM_ERROR,
          `Generasi ilustrasi gagal pada provider utama (${this.primaryProvider.providerName}: ${primaryErr.message}) dan fallback (${this.fallbackProvider.providerName}: ${fallbackErr.message}).`
        );
      }
    }

    // No fallback or non-retryable error
    if (primaryErr instanceof Error) {
      throw primaryErr;
    }
    throw new AiServiceError(
      primaryErr.code || AI_ERROR_CODES.AI_PROVIDER_ERROR,
      primaryErr.message || "Generasi ilustrasi gagal pada provider utama."
    );
  }

  normalizeResult(
    rawOutput: unknown,
    request: IllustrationGenerationRequest
  ): IllustrationGenerationResult {
    return this.primaryProvider.normalizeResult(rawOutput, request);
  }
}
