/**
 * ==============================================================================
 * GURUPRO AI: ILLUSTRATION PROVIDER FACTORY (VIS-1B)
 * ==============================================================================
 *
 * Resolves the active server-authoritative IllustrationGenerationProvider
 * based on available server environment variables and credentials.
 *
 * Priority order:
 * 1. Test Mock Provider (if registered in test runner)
 * 2. OpenAI Image Provider (if OPENAI_API_KEY is configured)
 * 3. Gemini Image Provider (if GEMINI_API_KEY is configured)
 * 4. Fails closed with PROVIDER_UNAVAILABLE
 */

import { AI_ERROR_CODES, AiServiceError } from "../error-taxonomy";
import { getServerEnv } from "../ai-service";
import type { IllustrationGenerationProvider } from "../illustration-generation-contract";
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

  // 2. OpenAI Image Provider (if key is set)
  const openAiKey = getServerEnv("OPENAI_API_KEY");
  if (openAiKey && openAiKey.trim().length > 0) {
    return new OpenAiImageProvider({ apiKey: openAiKey.trim() });
  }

  // 3. Gemini Image Provider (if key is set)
  const geminiKey = getServerEnv("GEMINI_API_KEY");
  if (geminiKey && geminiKey.trim().length > 0) {
    return new GeminiImageProvider({ apiKey: geminiKey.trim() });
  }

  throw new AiServiceError(
    AI_ERROR_CODES.PROVIDER_UNAVAILABLE,
    "Konfigurasi provider AI belum siap: Kunci API gambar (OPENAI_API_KEY atau GEMINI_API_KEY) belum disetel pada server environment."
  );
}
