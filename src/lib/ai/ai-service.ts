/**
 * GuruPro AI Foundation (AI-0) — Single Server-Side AI Service Layer
 *
 * Owns:
 * - Provider/gateway invocation with timeout (60s default)
 * - Server-only environment resolution (strictly disallowing VITE_*)
 * - Strict authorization checks (teacher role required)
 * - Rate limiting and concurrency guards
 * - Bounded retry policy on transient errors
 * - Error taxonomy normalization
 * - Schema-based structured output parsing & validation
 * - Grounding and evidence attachment
 * - Sanitized observability logging to system_logs
 */

import { supabase } from "@/integrations/supabase/client";
import { AI_ERROR_CODES, AiServiceError, normalizeAiError } from "./error-taxonomy";
import { checkAndAcquireRateSlot } from "./rate-limiter";
import { retrieveSourceContext } from "./retriever";
import { evaluateGroundingAgainstSource } from "./grounding";
import type {
  AiModelConfig,
  AiRequestContract,
  AiUsageMetadata,
  GroundedSection,
  GroundingEvidenceRef,
} from "./types";

const DEFAULT_TIMEOUT_MS = 60000;
const MAX_BOUNDED_RETRIES = 2;

function getServerEnv(name: string): string | undefined {
  if (name.startsWith("VITE_")) {
    // Security Guard: Never allow private AI secrets to be read from VITE_* variables
    return undefined;
  }
  const cfEnv = (globalThis as any).__CLOUDFLARE_ENV__;
  if (cfEnv && typeof cfEnv === "object" && typeof cfEnv[name] === "string" && cfEnv[name].trim()) {
    return cfEnv[name].trim();
  }
  if (
    typeof process !== "undefined" &&
    process.env &&
    typeof process.env[name] === "string" &&
    process.env[name].trim()
  ) {
    return process.env[name].trim();
  }
  return undefined;
}

export function resolveServerAiConfig(): AiModelConfig {
  const lovableKey = getServerEnv("LOVABLE_API_KEY");
  const geminiKey = getServerEnv("GEMINI_API_KEY");
  const openAiKey = getServerEnv("OPENAI_API_KEY");
  const customModel = getServerEnv("AI_MODEL");
  const customEndpoint = getServerEnv("AI_ENDPOINT");

  if (lovableKey) {
    return {
      provider: "lovable",
      endpoint: customEndpoint || "https://ai.gateway.lovable.dev/v1/chat/completions",
      model: customModel || "google/gemini-2.5-flash",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${lovableKey}`,
        "lovable-api-key": lovableKey,
      },
    };
  }

  if (geminiKey) {
    return {
      provider: "gemini",
      endpoint:
        customEndpoint ||
        "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      model: customModel || "gemini-2.0-flash",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${geminiKey}`,
      },
    };
  }

  if (openAiKey) {
    return {
      provider: "openai",
      endpoint: customEndpoint || "https://api.openai.com/v1/chat/completions",
      model: customModel || "gpt-4o-mini",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${openAiKey}`,
      },
    };
  }

  throw new AiServiceError(
    AI_ERROR_CODES.AI_PROVIDER_ERROR,
    "Konfigurasi AI server belum siap: Kunci API (LOVABLE_API_KEY, GEMINI_API_KEY, atau OPENAI_API_KEY) belum disetel pada server environment.",
  );
}

export function hasServerAiKey(): boolean {
  try {
    resolveServerAiConfig();
    return true;
  } catch {
    return false;
  }
}

async function recordAiOperationLog(meta: AiUsageMetadata): Promise<void> {
  try {
    // Sanitized context payload: strictly excludes secrets and long raw prompts
    const logPayload = {
      userId: meta.userId,
      feature: meta.feature,
      promptVersion: meta.promptVersion,
      model: meta.model,
      provider: meta.provider,
      latencyMs: meta.latencyMs,
      inputCharCount: meta.inputCharCount,
      outputCharCount: meta.outputCharCount,
      errorCode: meta.errorCode || null,
      sourceId: meta.sourceId || null,
    };

    await supabase.rpc("log_system_event", {
      _level: meta.status === "success" ? "info" : "warn",
      _event_type: meta.status === "success" ? "ai_request_completed" : "ai_request_failed",
      _message: `AI operation "${meta.feature}" (${meta.promptVersion}) ${meta.status} in ${meta.latencyMs}ms.`,
      _context: logPayload,
    });
  } catch {
    // Logging failure should never crash the primary AI operation
  }
}

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

/**
 * Invokes the external AI provider gateway with bounded exponential backoff retry.
 */
async function invokeAiProviderWithRetry(
  systemPrompt: string,
  userPrompt: string,
  config: AiModelConfig,
  timeoutMs: number,
  maxRetries: number,
): Promise<string> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(config.endpoint, {
        method: "POST",
        headers: config.headers,
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          temperature: config.temperature ?? 0.3,
          max_tokens: config.maxTokens ?? 3000,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        let errBody = "";
        try {
          errBody = await response.text();
        } catch {}

        if (response.status === 401 || response.status === 403) {
          throw new AiServiceError(
            AI_ERROR_CODES.AUTH_ERROR,
            "Autentikasi penyedia AI gagal. Kunci API tidak valid atau telah kedaluwarsa.",
          );
        }
        if (response.status === 429) {
          throw new AiServiceError(
            AI_ERROR_CODES.AI_RATE_LIMIT,
            "Penyedia AI mengembalikan batas kuota rate limit (HTTP 429).",
          );
        }
        if (response.status >= 500) {
          throw new AiServiceError(
            AI_ERROR_CODES.AI_PROVIDER_ERROR,
            `Penyedia AI mengalami gangguan internal (HTTP ${response.status}): ${errBody.slice(0, 150)}`,
          );
        }

        throw new AiServiceError(
          AI_ERROR_CODES.AI_PROVIDER_ERROR,
          `Permintaan AI gagal (HTTP ${response.status}): ${errBody.slice(0, 150)}`,
        );
      }

      const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = json.choices?.[0]?.message?.content;
      if (!content || !content.trim()) {
        throw new AiServiceError(
          AI_ERROR_CODES.AI_OUTPUT_INVALID,
          "Penyedia AI mengembalikan respons kosong.",
        );
      }

      return content;
    } catch (err: unknown) {
      lastError = err;
      const normalized = normalizeAiError(err);

      // Only retry if retryable and attempts remain
      if (normalized.isRetryable && attempt < maxRetries) {
        const delay = Math.min(2000, 300 * Math.pow(2, attempt) + Math.random() * 200);
        await new Promise((res) => setTimeout(res, delay));
        continue;
      }
      throw normalized;
    }
  }

  throw normalizeAiError(lastError);
}

export class AiService {
  /**
   * Generates a validated structured AI response adhering strictly to schema.
   */
  public static async generateStructured<T>(contract: AiRequestContract<T>): Promise<T> {
    const startTime = Date.now();
    const releaseRate = checkAndAcquireRateSlot(contract.userId);

    try {
      // 1. Role & authorization verification
      if (contract.userRole !== "guru") {
        throw new AiServiceError(
          AI_ERROR_CODES.ROLE_FORBIDDEN,
          "Operasi AI hanya diizinkan untuk peran Guru.",
        );
      }

      // 2. Input size & request contract validation
      if (!contract.userPrompt || !contract.userPrompt.trim()) {
        throw new AiServiceError(AI_ERROR_CODES.INVALID_REQUEST, "Prompt pengguna tidak boleh kosong.");
      }
      if (contract.userPrompt.length > 20000) {
        throw new AiServiceError(AI_ERROR_CODES.INVALID_REQUEST, "Panjang prompt melebihi batas 20.000 karakter.");
      }

      const config = { ...resolveServerAiConfig(), ...contract.modelConfig };
      const timeoutMs = contract.timeoutMs || DEFAULT_TIMEOUT_MS;
      const maxRetries = contract.maxRetries ?? MAX_BOUNDED_RETRIES;
      const systemPrompt = contract.systemPrompt || "Anda adalah asisten AI akademik yang akurat dan berbasis fakta.";

      // 3. Invoke provider gateway
      const rawText = await invokeAiProviderWithRetry(
        systemPrompt,
        contract.userPrompt,
        config,
        timeoutMs,
        maxRetries,
      );

      // 4. Parse JSON
      const jsonText = extractJsonText(rawText);
      let parsedData: unknown;
      try {
        parsedData = JSON.parse(jsonText);
      } catch {
        throw new AiServiceError(
          AI_ERROR_CODES.AI_OUTPUT_INVALID,
          "Respons AI bukan merupakan format JSON yang valid.",
        );
      }

      // 5. Schema validation
      let validatedResult: T;
      if (contract.schemaValidator) {
        try {
          validatedResult = contract.schemaValidator(parsedData);
        } catch (validationErr: any) {
          throw new AiServiceError(
            AI_ERROR_CODES.AI_OUTPUT_INVALID,
            `Validasi skema AI gagal: ${validationErr?.message || "Format output tidak sesuai"}`,
          );
        }
      } else {
        validatedResult = parsedData as T;
      }

      // 6. Record safe observability metrics
      await recordAiOperationLog({
        userId: contract.userId,
        feature: contract.feature,
        promptVersion: contract.promptVersion,
        model: config.model,
        provider: config.provider,
        latencyMs: Date.now() - startTime,
        inputCharCount: contract.userPrompt.length,
        outputCharCount: rawText.length,
        timestamp: new Date().toISOString(),
        status: "success",
        sourceId: contract.sourceSnapshotId,
      });

      return validatedResult;
    } catch (err: unknown) {
      const normalized = normalizeAiError(err);
      await recordAiOperationLog({
        userId: contract.userId,
        feature: contract.feature,
        promptVersion: contract.promptVersion,
        model: "unknown",
        provider: "unknown",
        latencyMs: Date.now() - startTime,
        inputCharCount: contract.userPrompt?.length || 0,
        outputCharCount: 0,
        timestamp: new Date().toISOString(),
        status: "error",
        errorCode: normalized.code,
        sourceId: contract.sourceSnapshotId,
      });
      throw normalized;
    } finally {
      releaseRate();
    }
  }

  /**
   * Generates free-form text with strict timeout and rate limits.
   */
  public static async generateText(contract: AiRequestContract<string>): Promise<string> {
    return this.generateStructured<string>({
      ...contract,
      schemaValidator: (val) => String(val),
    });
  }

  /**
   * Generates structured content and evaluates source grounding & evidence references.
   * If facts are missing from source (Case G), flags them as NOT_FOUND instead of inventing facts.
   */
  public static async generateWithEvidence<T>(
    contract: AiRequestContract<T>,
  ): Promise<GroundedSection<T>> {
    const content = await this.generateStructured<T>(contract);
    const evidenceList: GroundingEvidenceRef[] = [];
    const unsupportedClaims: string[] = [];

    // If a source snapshot is attached, evaluate grounding
    if (contract.sourceSnapshotId) {
      const retrieval = await retrieveSourceContext({
        sourceId: contract.sourceSnapshotId,
        userId: contract.userId,
      });

      // Sample key claims from generated output to verify against source
      const claimsToVerify = Array.isArray((content as any)?.sections)
        ? (content as any).sections.map((s: any) => s.judul || s.isi)
        : [contract.userPrompt];

      for (const claim of claimsToVerify) {
        if (typeof claim === "string" && claim.trim()) {
          const evalResult = evaluateGroundingAgainstSource({
            claim,
            sourceChunks: retrieval.retrievedChunks,
            sourceId: retrieval.sourceId,
            sourceTitle: retrieval.sourceTitle,
          });

          evidenceList.push({
            sourceId: retrieval.sourceId,
            sourceTitle: retrieval.sourceTitle,
            chunkId: evalResult.matchedChunkId,
            snippet: evalResult.evidenceSnippet,
            status: evalResult.status,
          });

          if (evalResult.status === "NOT_FOUND") {
            unsupportedClaims.push(claim);
          }
        }
      }
    }

    const isFullyGrounded = unsupportedClaims.length === 0;
    return {
      content,
      evidence: evidenceList,
      unsupportedClaims: unsupportedClaims.length > 0 ? unsupportedClaims : undefined,
      isFullyGrounded,
    };
  }
}
