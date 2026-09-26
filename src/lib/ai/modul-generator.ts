/**
 * GuruPro AI Foundation (AI-2C) — Real AI Modul Ajar Generation Engine
 *
 * Implements the server-side generation pipeline:
 * VALIDATE INPUT
 *   -> BUILD GROUNDED CONTEXT (AI-2B)
 *   -> EVALUATE PRECONDITIONS (Anti-Hallucination Gate)
 *   -> BUILD GROUNDED PROMPT (AI Prompt Registry v1)
 *   -> CALL AI PROVIDER (Lovable / Gemini / OpenAI with Bounded Retries)
 *   -> PARSE & VALIDATE SCHEMA (GroundedModulAjarOutputSchema v1.0.0)
 *   -> VALIDATE EVIDENCE PROVENANCE & GROUNDING POST-CHECK
 *   -> MAP TO CANONICAL DRAFT (status: 'Draft')
 *   -> RETURN VALIDATED DRAFT RESULT READY FOR AI-2D
 */

import { supabase } from "@/integrations/supabase/client";
import { AI_ERROR_CODES, AiServiceError, normalizeAiError } from "./error-taxonomy";
import {
  type GroundedModulAjarOutput,
  type ModulAiMetadata,
  type ModulGenerationInput,
  type ModulGroundingContext,
  type SectionCoverageReport,
  type TeacherAcademicContext,
  CANONICAL_OUTPUT_SCHEMA_VERSION,
  CANONICAL_PROMPT_VERSION,
  mapGroundedOutputToModulDraft,
  parseAiModulResponse,
  validateGroundedModulAjarOutput,
} from "./modul-contract";
import {
  buildModulGroundingContext,
  serializeModulGroundingContext,
  type BuildContextOptions,
} from "./modul-context-builder";
import { getRegisteredPrompt } from "./prompts-registry";
import { checkAndAcquireRateSlot } from "./rate-limiter";
import { resolveServerAiConfig } from "./ai-service";
import type { AiModelConfig, AiSourceSnapshot } from "./types";
import type { Modul } from "../modul-types";

const DEFAULT_TIMEOUT_MS = 60000;
const MAX_TRANSIENT_RETRIES = 2;

export interface GenerateModulAjarOptions extends BuildContextOptions {
  timeoutMs?: number;
  maxRetries?: number;
  mockProviderCall?: (systemPrompt: string, userPrompt: string) => Promise<string>;
  modelConfig?: Partial<AiModelConfig>;
}

export interface ModulAiGenerationResult {
  status: "success" | "error";
  output?: GroundedModulAjarOutput;
  draftModul?: Omit<Modul, "id" | "createdAt" | "updatedAt">;
  metadata: {
    promptVersion: string;
    schemaVersion: string;
    provider: string;
    model: string;
    latencyMs: number;
    retryCount: number;
    isTruncated: boolean;
    hasConflicts: boolean;
    conflictCount: number;
  };
  grounding: {
    hasUsableEvidence: boolean;
    evidenceCount: number;
    coverage: SectionCoverageReport;
    validationStatus: "valid" | "invalid";
  };
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Invokes the AI provider via HTTP with transient retry support.
 */
async function callAiProviderWithRetry(
  systemPrompt: string,
  userPrompt: string,
  config: AiModelConfig,
  timeoutMs: number,
  maxRetries: number,
  options: GenerateModulAjarOptions,
): Promise<{ text: string; retryCount: number }> {
  // Testing Adapter Hook
  if (options.mockProviderCall) {
    const mockText = await options.mockProviderCall(systemPrompt, userPrompt);
    return { text: mockText, retryCount: 0 };
  }

  let lastError: unknown = null;
  let retryCount = 0;

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
          temperature: config.temperature ?? 0.2, // Conservative temperature for factual educational fidelity
          max_tokens: config.maxTokens ?? 3500,
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
          AI_ERROR_CODES.PROVIDER_MALFORMED_OUTPUT,
          "Penyedia AI mengembalikan respons kosong.",
        );
      }

      return { text: content, retryCount };
    } catch (err: unknown) {
      lastError = err;
      const normalized = normalizeAiError(err);

      if (normalized.isRetryable && attempt < maxRetries) {
        retryCount++;
        const delay = Math.min(2500, 400 * Math.pow(2, attempt) + Math.random() * 200);
        await new Promise((res) => setTimeout(res, delay));
        continue;
      }
      throw normalized;
    }
  }

  throw normalizeAiError(lastError);
}

/**
 * Executes post-generation grounding checks against the supplied context evidence.
 * Prevents phantom entities and claims from masquerading as source facts.
 */
function performGroundingPostCheck(
  output: GroundedModulAjarOutput,
  context: ModulGroundingContext,
): void {
  const validEvidenceIdSet = new Set(context.evidenceItems.map((e) => e.evidenceId));
  const validChunkIdSet = new Set(context.evidenceItems.map((e) => e.chunkId));
  const validSourceIdSet = new Set(context.sourceMetadata.map((s) => s.sourceId));

  // 1. Evidence existence and provenance checks
  for (const obj of output.tujuanPembelajaran) {
    for (const eid of obj.evidenceIds) {
      if (!validEvidenceIdSet.has(eid) && !validChunkIdSet.has(eid)) {
        throw new AiServiceError(
          AI_ERROR_CODES.GROUNDING_FAILED,
          `Tujuan pembelajaran "${obj.id}" merujuk pada evidenceId "${eid}" yang tidak terdaftar di konteks sumber.`,
        );
      }
    }
  }

  for (const sec of output.sections) {
    for (const eid of sec.evidenceIds) {
      if (!validEvidenceIdSet.has(eid) && !validChunkIdSet.has(eid)) {
        throw new AiServiceError(
          AI_ERROR_CODES.GROUNDING_FAILED,
          `Bab materi "${sec.judul}" merujuk pada evidenceId "${eid}" yang tidak terdaftar di konteks sumber.`,
        );
      }
    }
  }

  for (const phase of ["pendahuluan", "inti", "penutup"] as const) {
    const act = output.kegiatanPembelajaran[phase];
    if (act?.evidenceIds) {
      for (const eid of act.evidenceIds) {
        if (!validEvidenceIdSet.has(eid) && !validChunkIdSet.has(eid)) {
          throw new AiServiceError(
            AI_ERROR_CODES.GROUNDING_FAILED,
            `Kegiatan pembelajaran (${phase}) merujuk pada evidenceId "${eid}" yang tidak terdaftar di konteks sumber.`,
          );
        }
      }
    }
  }

  // 2. Strict tenant / source ownership verification
  for (const ref of output.evidenceRefs) {
    if (!validSourceIdSet.has(ref.sourceId)) {
      throw new AiServiceError(
        AI_ERROR_CODES.GROUNDING_FAILED,
        `Referensi bukti merujuk pada sourceId "${ref.sourceId}" yang tidak ada dalam daftar materi terpilih.`,
      );
    }
  }
}

/**
 * Logs generation operation safely to system_logs.
 * Strictly avoids logging secrets, private tokens, or unnecessary raw documents.
 */
async function recordGenerationLog(meta: {
  teacherId: string;
  kelasId: string;
  sourceCount: number;
  promptVersion: string;
  provider: string;
  model: string;
  latencyMs: number;
  retryCount: number;
  status: "success" | "error";
  errorCode?: string;
}): Promise<void> {
  try {
    await supabase.rpc("log_system_event", {
      _level: meta.status === "success" ? "info" : "warn",
      _event_type: meta.status === "success" ? "ai_modul_generated" : "ai_modul_failed",
      _message: `AI Modul Ajar generation ${meta.status} for class ${meta.kelasId} in ${meta.latencyMs}ms.`,
      _context: {
        teacherId: meta.teacherId,
        kelasId: meta.kelasId,
        sourceCount: meta.sourceCount,
        promptVersion: meta.promptVersion,
        provider: meta.provider,
        model: meta.model,
        latencyMs: meta.latencyMs,
        retryCount: meta.retryCount,
        errorCode: meta.errorCode || null,
      },
    });
  } catch {
    // Logging failure must never block application execution
  }
}

/**
 * Main AI-2C Server-Side Generation Pipeline.
 *
 * Generates a validated Modul Ajar draft grounded strictly in the supplied source material.
 * Rejects unsupported topics, malformed responses, and dangling evidence references.
 */
export async function generateGroundedModulAjar(
  rawInput: unknown,
  authContext: TeacherAcademicContext,
  options: GenerateModulAjarOptions = {},
): Promise<ModulAiGenerationResult> {
  const startTime = Date.now();
  const promptVersion = CANONICAL_PROMPT_VERSION;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? MAX_TRANSIENT_RETRIES;

  // 1. Build & validate Grounded Context via AI-2B
  const groundedContext = await buildModulGroundingContext(rawInput, authContext, options);
  const input = groundedContext.generationInput;

  // 2. Precondition Inspection: Anti-Hallucination Gate
  // If the source does NOT support the core topic, refuse to generate to prevent hallucination!
  if (
    !groundedContext.hasUsableEvidence ||
    groundedContext.sectionCoverage.topicMaterial.status === "INSUFFICIENT_EVIDENCE"
  ) {
    throw new AiServiceError(
      AI_ERROR_CODES.INSUFFICIENT_EVIDENCE,
      `Topik "${input.topik}" tidak ditemukan atau tidak didukung secara memadai oleh materi sumber yang dipilih. Silakan pilih sumber materi yang relevan atau ubah topik pembelajaran.`,
    );
  }

  // 3. Acquire Rate Limiting Slot
  const releaseRate = checkAndAcquireRateSlot(authContext.teacherId);

  // 4. Resolve AI Model Configuration
  let config: AiModelConfig;
  if (options.mockProviderCall) {
    config = {
      provider: "lovable",
      endpoint: "mock://internal-test",
      model: "google/gemini-2.5-flash",
      headers: {},
      ...options.modelConfig,
    };
  } else {
    config = {
      ...resolveServerAiConfig(),
      ...options.modelConfig,
    };
  }

  // 5. Construct Grounded Prompt
  const registeredPrompt = getRegisteredPrompt(promptVersion);
  const serializedContext = serializeModulGroundingContext(groundedContext);
  const systemPrompt = registeredPrompt.systemPrompt;
  const userPrompt = registeredPrompt.buildUserPrompt({
    sourceContent: serializedContext,
    topik: input.topik,
    mapel: groundedContext.academicContext.mapel,
    kelas: groundedContext.academicContext.kelasLabel,
    fase: groundedContext.academicContext.targetFase,
    alokasiWaktu: groundedContext.academicContext.alokasiWaktu,
  });

  let rawResponseText = "";
  let totalRetries = 0;

  try {
    // 6. Invoke AI Provider with transient retries
    const providerResult = await callAiProviderWithRetry(
      systemPrompt,
      userPrompt,
      config,
      timeoutMs,
      maxRetries,
      options,
    );
    rawResponseText = providerResult.text;
    totalRetries += providerResult.retryCount;

    // 7. Parse & Validate Structured JSON Output
    let parsedOutput: GroundedModulAjarOutput;
    try {
      parsedOutput = parseAiModulResponse(rawResponseText);
    } catch (parseErr: any) {
      // Bounded correction retry on malformed JSON (max 1 correction attempt)
      if (options.mockProviderCall) {
        throw parseErr;
      }
      try {
        totalRetries++;
        const correctionPrompt = `${userPrompt}\n\nPERINGATAN KRUSIAL: Respons sebelumnya gagal di-parse sebagai JSON yang valid (${parseErr?.message}). Harap perbaiki dan balas HANYA JSON murni yang sesuai skema tanpa komentar apapun.`;
        const corrected = await callAiProviderWithRetry(
          systemPrompt,
          correctionPrompt,
          config,
          timeoutMs,
          1,
          options,
        );
        parsedOutput = parseAiModulResponse(corrected.text);
      } catch (retryErr: any) {
        throw new AiServiceError(
          AI_ERROR_CODES.PROVIDER_MALFORMED_OUTPUT,
          `Penyedia AI gagal menghasilkan keluaran JSON terstruktur yang valid setelah perbaikan: ${retryErr?.message || parseErr?.message}`,
        );
      }
    }

    // 8. Grounding Contract & Post-Check Verification
    validateGroundedModulAjarOutput(parsedOutput);
    performGroundingPostCheck(parsedOutput, groundedContext);

    // 9. Map into Canonical Modul Draft (status: 'Draft' strictly enforced)
    const draftModul = mapGroundedOutputToModulDraft(parsedOutput, {
      promptVersion,
      sourceSnapshotIds: input.sourceSnapshotIds,
      kelasId: input.kelasId,
      sumberJudul: groundedContext.sourceMetadata.map((s) => s.sourceTitle).join("; "),
    });

    const latencyMs = Date.now() - startTime;

    // 10. Record safe observability metrics
    await recordGenerationLog({
      teacherId: authContext.teacherId,
      kelasId: input.kelasId,
      sourceCount: groundedContext.sourceMetadata.length,
      promptVersion,
      provider: config.provider,
      model: config.model,
      latencyMs,
      retryCount: totalRetries,
      status: "success",
    });

    return {
      status: "success",
      output: parsedOutput,
      draftModul,
      metadata: {
        promptVersion,
        schemaVersion: CANONICAL_OUTPUT_SCHEMA_VERSION,
        provider: config.provider,
        model: config.model,
        latencyMs,
        retryCount: totalRetries,
        isTruncated: groundedContext.contextBudgetSummary.isTruncated,
        hasConflicts: groundedContext.sourceConflicts.length > 0,
        conflictCount: groundedContext.sourceConflicts.length,
      },
      grounding: {
        hasUsableEvidence: groundedContext.hasUsableEvidence,
        evidenceCount: groundedContext.evidenceItems.length,
        coverage: groundedContext.sectionCoverage,
        validationStatus: "valid",
      },
    };
  } catch (err: unknown) {
    const normalized = normalizeAiError(err);
    const latencyMs = Date.now() - startTime;

    await recordGenerationLog({
      teacherId: authContext.teacherId,
      kelasId: input.kelasId,
      sourceCount: groundedContext?.sourceMetadata?.length || 0,
      promptVersion,
      provider: config?.provider || "unknown",
      model: config?.model || "unknown",
      latencyMs,
      retryCount: totalRetries,
      status: "error",
      errorCode: normalized.code,
    });

    throw normalized;
  } finally {
    releaseRate();
  }
}
