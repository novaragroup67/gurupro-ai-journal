/**
 * ==============================================================================
 * GURUPRO AI: ILLUSTRATION PROVIDER FACTORY (VIS-1B & AI-CORE-RECOVERY-1)
 * ==============================================================================
 *
 * Resolves the active server-authoritative IllustrationGenerationProvider
 * based on available server environment variables and credentials.
 *
 * Strategy:
 * 1. Test Mock Provider (if registered in test runner)
 * 2. Dual-Provider Router (routes between Gemini gemini-3.1-flash-image and OpenAI gpt-image-2
 *    with bounded failover on retryable transient errors, and strict fail-closed safety block)
 * 3. Fails closed with PROVIDER_UNAVAILABLE if no API credentials configured
 */

import { AI_ERROR_CODES, AiServiceError } from "../error-taxonomy";
import { getServerEnv } from "../ai-service";
import type { IllustrationGenerationProvider } from "../illustration-generation-contract";
import { DualIllustrationRouter } from "./dual-illustration-router";
import { OpenAiImageProvider } from "./openai-image-provider";
import { GeminiImageProvider } from "./gemini-image-provider";

let _mockProvider: IllustrationGenerationProvider | null = null;

/**
 * Registers an in-memory mock provider for automated testing.
 */
export function setMockIllustrationProvider(provider: IllustrationGenerationProvider | null): void {
  _mockProvider = provider;
}

/**
 * Retrieves the currently active test mock provider, if any.
 */
export function getMockIllustrationProvider(): IllustrationGenerationProvider | null {
  return _mockProvider;
}

/**
 * Resolves the authoritative illustration generation provider.
 */
export function resolveIllustrationGenerationProvider(): IllustrationGenerationProvider {
  // 1. In-memory mock for automated unit/integration tests
  if (_mockProvider) {
    return _mockProvider;
  }

  const geminiKey = getServerEnv("GEMINI_API_KEY");
  const openAiKey = getServerEnv("OPENAI_API_KEY");

  // 2. Dual-Provider Router if at least one API key is present
  if ((geminiKey && geminiKey.trim().length > 0) || (openAiKey && openAiKey.trim().length > 0)) {
    return new DualIllustrationRouter({
      geminiApiKey: geminiKey?.trim(),
      openAiApiKey: openAiKey?.trim(),
    });
  }

  throw new AiServiceError(
    AI_ERROR_CODES.PROVIDER_UNAVAILABLE,
    "Konfigurasi provider AI belum siap: Kunci API gambar (GEMINI_API_KEY atau OPENAI_API_KEY) belum disetel pada server environment."
  );
}
