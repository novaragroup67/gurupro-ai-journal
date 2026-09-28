/**
 * GuruPro AI Question Foundation (AI-4C) — Real AI Question Generation Engine
 *
 * Implements the server-side question generation pipeline:
 * VALIDATE REQUEST & TEACHER AUTHORIZATION
 *   -> BUILD / VERIFY GROUNDED CONTEXT (AI-4B)
 *   -> PRECONDITION GATE (Anti-Hallucination: INSUFFICIENT fails closed before LLM)
 *   -> RATE LIMIT ACQUISITION (Teacher concurrency guard)
 *   -> RESOLVE SERVER AI CONFIG (Server-only credentials)
 *   -> BUILD GROUNDED QUESTION PROMPT (prompts-registry: question_generator_grounded_v1)
 *   -> CALL AI PROVIDER (Lovable / Gemini / OpenAI with transient retries)
 *   -> PARSE & NORMALIZE STRUCTURED OUTPUT (Markdown fence stripping & JSON validation)
 *   -> VALIDATE CANONICAL QUESTION PACKAGE (AI-4A Zod contract & answer-key integrity)
 *   -> VALIDATE EVIDENCE PROVENANCE & ANTI-PROMOTION INVARIANT
 *   -> VALIDATE REQUESTED QUESTION COUNT (Bounded correction retry on mismatch)
 *   -> PERSIST DRAFT TO PAKET_SOAL (status: 'Draft' strictly enforced)
 *   -> LOG OBSERVABILITY (Non-sensitive telemetry)
 *   -> PROJECT STUDENT-SAFE PAYLOAD (Answer-key segregation)
 *   -> RETURN CANONICAL RESULT READY FOR AI-4D
 *
 * INVARIANT:
 * AI-4C never invents fake/placeholder questions upon failure. Fails safely.
 */

import { supabase } from "@/integrations/supabase/client";
import { AI_ERROR_CODES, AiServiceError, normalizeAiError } from "./error-taxonomy";
import {
  type CanonicalQuestion,
  type CanonicalQuestionPackage,
  type QuestionAiMetadata,
  type StudentSafeQuestion,
  CanonicalQuestionPackageSchema,
  CANONICAL_QUESTION_PROMPT_VERSION,
  CANONICAL_QUESTION_SCHEMA_VERSION,
  toExistingSoal,
  toStudentSafeQuestion,
  validateCanonicalQuestionPackage,
} from "./question-contract";
import {
  type BuildQuestionContextOptions,
  type GroundedQuestionContext,
  type QuestionGroundingInput,
  buildQuestionGroundingContext,
  serializeQuestionGroundingContext,
} from "./question-context-builder";
import { getRegisteredPrompt } from "./prompts-registry";
import { checkAndAcquireRateSlot } from "./rate-limiter";
import { resolveServerAiConfig } from "./ai-service";
import type { AiModelConfig } from "./types";
import type { TeacherAcademicContext } from "./modul-contract";
import type { PaketSoal } from "../soal-types";

const DEFAULT_TIMEOUT_MS = 60000;
const MAX_TRANSIENT_RETRIES = 2;

export interface GenerateQuestionsOptions extends BuildQuestionContextOptions {
  timeoutMs?: number;
  maxRetries?: number;
  mockProviderCall?: (systemPrompt: string, userPrompt: string) => Promise<string>;
  modelConfig?: Partial<AiModelConfig>;
  persistDraft?: boolean;
}

export interface QuestionAiGenerationResult {
  status: "success" | "error";
  package?: CanonicalQuestionPackage;
  questions?: CanonicalQuestion[];
  persistedPackageId?: string;
  persistedPackage?: PaketSoal;
  studentSafeQuestions?: StudentSafeQuestion[];
  metadata: {
    promptVersion: string;
    schemaVersion: string;
    provider: string;
    model: string;
    latencyMs: number;
    retryCount: number;
    requestedCount: number;
    generatedCount: number;
    isTruncated: boolean;
    hasConflicts: boolean;
    conflictCount: number;
    sourceSnapshotIds?: string[];
  };
  grounding: {
    evidenceSufficiency: "SUFFICIENT" | "INSUFFICIENT" | "CONFLICTED";
    hasUsableEvidence: boolean;
    evidenceCount: number;
    validationStatus: "valid" | "invalid";
  };
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Invokes the server AI provider via HTTP with transient retry support.
 */
async function callAiProviderWithRetry(
  systemPrompt: string,
  userPrompt: string,
  config: AiModelConfig,
  timeoutMs: number,
  maxRetries: number,
  options: GenerateQuestionsOptions,
): Promise<{ text: string; retryCount: number }> {
  // Testing Adapter Hook (Allows deterministic mocking in automated test suite)
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
          temperature: config.temperature ?? 0.2, // Conservative temperature for factual assessment fidelity
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
 * Parses and strips markdown code fences or surrounding whitespace from AI output.
 * Normalizes raw JSON into CanonicalQuestionPackage structure.
 */
export function parseAiQuestionResponse(
  rawText: string,
  defaultMeta: { topik: string; tingkat?: "Mudah" | "Sedang" | "Sulit"; modulId?: string },
): CanonicalQuestionPackage {
  if (!rawText || !rawText.trim()) {
    throw new AiServiceError(
      AI_ERROR_CODES.PROVIDER_MALFORMED_OUTPUT,
      "Respons penyedia AI kosong atau tidak terbaca.",
    );
  }

  // 1. Strip markdown fences if present (```json ... ```)
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }

  // 2. Parse JSON
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err: any) {
    throw new AiServiceError(
      AI_ERROR_CODES.PROVIDER_MALFORMED_OUTPUT,
      `Gagal mem-parse keluaran AI sebagai JSON yang valid: ${err.message}`,
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new AiServiceError(
      AI_ERROR_CODES.PROVIDER_MALFORMED_OUTPUT,
      "Keluaran AI bukan merupakan objek JSON.",
    );
  }

  // 3. Normalization: If model returned an array of questions or { questions: [...] } / { soal: [...] }
  let questionsArray: any[] = [];
  if (Array.isArray(parsed)) {
    questionsArray = parsed;
  } else if (Array.isArray(parsed.questions)) {
    questionsArray = parsed.questions;
  } else if (Array.isArray(parsed.soal)) {
    questionsArray = parsed.soal;
  } else if (parsed.question && typeof parsed.question === "object") {
    questionsArray = [parsed.question];
  }

  const judul = typeof parsed.judul === "string" && parsed.judul.trim().length >= 3
    ? parsed.judul.trim()
    : `Paket Soal: ${defaultMeta.topik}`;

  const normalizedPackage: CanonicalQuestionPackage = {
    schemaVersion: CANONICAL_QUESTION_SCHEMA_VERSION,
    judul,
    topik: defaultMeta.topik,
    modulId: defaultMeta.modulId,
    tingkat: defaultMeta.tingkat || "Sedang",
    questions: questionsArray,
    evidenceRefs: Array.isArray(parsed.evidenceRefs) ? parsed.evidenceRefs : [],
  };

  return normalizedPackage;
}

/**
 * Validates that every evidence ID in the generated questions refers to an authentic
 * chunk in the GroundedQuestionContext. Rejects fabricated IDs.
 */
function performEvidenceIntegrityCheck(
  pkg: CanonicalQuestionPackage,
  context: GroundedQuestionContext,
): void {
  const allowedEvidenceIdSet = new Set(context.evidenceItems.map((e) => e.evidenceId));
  const allowedSourceIdSet = new Set(context.sourceMetadata.map((s) => s.sourceId));

  const evidenceStatusMap = new Map<string, "SUPPORTED" | "INFERRED" | "NOT_FOUND">();
  for (const item of context.evidenceItems) {
    evidenceStatusMap.set(item.evidenceId, item.status);
  }

  // Validate entire package against AI-4A schema and evidence boundaries
  validateCanonicalQuestionPackage(pkg, {
    allowedEvidenceIds: allowedEvidenceIdSet,
    evidenceStatusMap,
  });

  // Verify evidenceRefs source provenance
  for (const ref of pkg.evidenceRefs) {
    if (!allowedSourceIdSet.has(ref.sourceId)) {
      throw new AiServiceError(
        AI_ERROR_CODES.QUESTION_GROUNDING_FAILED,
        `Referensi bukti merujuk pada sourceId "${ref.sourceId}" yang tidak ada dalam daftar materi sumber terverifikasi.`,
      );
    }
  }
}

/**
 * Logs question generation operation safely to system_logs.
 * Strictly avoids logging secrets, private tokens, or answers into public logs.
 */
async function recordQuestionGenerationLog(meta: {
  teacherId: string;
  kelasId?: string;
  sourceCount: number;
  promptVersion: string;
  provider: string;
  model: string;
  requestedCount: number;
  generatedCount: number;
  latencyMs: number;
  retryCount: number;
  status: "success" | "error";
  errorCode?: string;
}): Promise<void> {
  try {
    await supabase.rpc("log_system_event", {
      _level: meta.status === "success" ? "info" : "warn",
      _event_type: meta.status === "success" ? "ai_question_generated" : "ai_question_failed",
      _message: `AI Question generation ${meta.status} (${meta.generatedCount}/${meta.requestedCount} soal) in ${meta.latencyMs}ms.`,
      _context: {
        teacherId: meta.teacherId,
        kelasId: meta.kelasId || null,
        sourceCount: meta.sourceCount,
        promptVersion: meta.promptVersion,
        provider: meta.provider,
        model: meta.model,
        requestedCount: meta.requestedCount,
        generatedCount: meta.generatedCount,
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
 * Main AI-4C Server-Side Question Generation Pipeline.
 *
 * Consumes:
 * - `GroundedQuestionContext` (from AI-4B) OR raw `QuestionGroundingInput` + `TeacherAcademicContext`.
 *
 * Guarantees:
 * 1. Hard dependency on AI-4B GroundedQuestionContext.
 * 2. Precondition Gate: Insufficient evidence fails closed immediately without calling LLM.
 * 3. Exact Value Preservation (numbers, formulas, IP addresses, subnets, ports, commands).
 * 4. Structured Output matching AI-4A CanonicalQuestionPackageSchema.
 * 5. Complete Answer-Key Segregation (internal package has keys, studentSafeQuestions does not).
 * 6. Bounded retries on transient errors and malformed output.
 * 7. Optional Draft persistence to `public.paket_soal` with status 'Draft'.
 */
export async function generateGroundedQuestions(
  rawInput: QuestionGroundingInput | GroundedQuestionContext | unknown,
  authContext: TeacherAcademicContext,
  options: GenerateQuestionsOptions = {},
): Promise<QuestionAiGenerationResult> {
  const startTime = Date.now();
  const promptVersion = CANONICAL_QUESTION_PROMPT_VERSION;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? MAX_TRANSIENT_RETRIES;

  // 1. Teacher Authorization Guard
  if (authContext.teacherRole !== "guru") {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Operasi pembuatan soal AI hanya diizinkan untuk akun dengan peran Guru.",
    );
  }

  if (authContext.verificationStatus !== "terverifikasi") {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      `Akun guru berstatus "${authContext.verificationStatus}". Hanya guru terverifikasi yang dapat menggunakan AI.`,
    );
  }

  // 2. Resolve or Build GroundedQuestionContext via AI-4B
  let groundedContext: GroundedQuestionContext;
  if (
    rawInput &&
    typeof rawInput === "object" &&
    "contextVersion" in rawInput &&
    (rawInput as any).contextVersion === "1.0.0" &&
    "evidenceSufficiency" in rawInput
  ) {
    // Already an AI-4B GroundedQuestionContext
    groundedContext = rawInput as GroundedQuestionContext;
  } else {
    // Build context deterministically via AI-4B
    groundedContext = await buildQuestionGroundingContext(rawInput, authContext, options);
  }

  const target = groundedContext.groundingTarget;
  const requestedCount = target.jumlah;

  // 3. Precondition Gate: Anti-Hallucination & Fail-Closed
  // If AI-4B reports INSUFFICIENT or has no usable evidence, refuse to call LLM!
  if (
    !groundedContext.hasUsableEvidence ||
    groundedContext.evidenceSufficiency === "INSUFFICIENT"
  ) {
    throw new AiServiceError(
      AI_ERROR_CODES.INSUFFICIENT_EVIDENCE,
      `Topik soal "${target.topik}" tidak ditemukan atau tidak didukung secara memadai oleh materi sumber yang dipilih. Pilih materi sumber yang sesuai sebelum membuat butir soal.`,
    );
  }

  // 4. Acquire Rate Limiting Slot
  const releaseRate = checkAndAcquireRateSlot(authContext.teacherId);

  // 5. Resolve AI Model Configuration (Server-side credentials)
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

  // 6. Construct Grounded Prompt from Central Registry
  const registeredPrompt = getRegisteredPrompt(promptVersion);
  const serializedContext = serializeQuestionGroundingContext(groundedContext);
  const systemPrompt = registeredPrompt.systemPrompt;
  const userPrompt = registeredPrompt.buildUserPrompt({
    sourceContent: serializedContext,
    topik: target.topik,
    mapel: target.mapel || groundedContext.academicContext.mapel,
    kelas: groundedContext.academicContext.kelasLabel,
    jenis: target.jenis,
    tingkat: target.tingkat,
    jumlah: requestedCount,
    tujuanPembelajaran: target.targetTujuanPembelajaranIds?.join(", "),
    customInstructions: options.additionalTeacherPrompt,
  });

  let rawResponseText = "";
  let totalRetries = 0;

  try {
    // 7. Invoke AI Provider with transient retries
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

    // 8. Parse & Normalize Structured JSON Output
    let parsedPackage: CanonicalQuestionPackage;
    try {
      parsedPackage = parseAiQuestionResponse(rawResponseText, {
        topik: target.topik,
        tingkat: target.tingkat,
        modulId: target.modulId,
      });
    } catch (parseErr: any) {
      // Bounded correction retry on malformed JSON (max 1 correction attempt)
      if (options.mockProviderCall) {
        throw parseErr;
      }
      try {
        totalRetries++;
        const correctionPrompt = `${userPrompt}\n\nPERINGATAN KRUSIAL: Respons sebelumnya gagal di-parse sebagai JSON paket soal yang valid (${parseErr?.message}). Balas HANYA JSON murni yang sesuai skema CanonicalQuestionPackage tanpa markdown di luar JSON.`;
        const corrected = await callAiProviderWithRetry(
          systemPrompt,
          correctionPrompt,
          config,
          timeoutMs,
          1,
          options,
        );
        parsedPackage = parseAiQuestionResponse(corrected.text, {
          topik: target.topik,
          tingkat: target.tingkat,
          modulId: target.modulId,
        });
      } catch (retryErr: any) {
        throw new AiServiceError(
          AI_ERROR_CODES.PROVIDER_MALFORMED_OUTPUT,
          `Penyedia AI gagal menghasilkan keluaran JSON terstruktur yang valid setelah perbaikan: ${retryErr?.message || parseErr?.message}`,
        );
      }
    }

    // 9. Validate Evidence Integrity & AI-4A Canonical Schema
    performEvidenceIntegrityCheck(parsedPackage, groundedContext);

    // 10. Question Count Validation with Bounded Correction Retry
    if (parsedPackage.questions.length !== requestedCount) {
      if (!options.mockProviderCall && totalRetries < maxRetries + 1) {
        try {
          totalRetries++;
          const countCorrectionPrompt = `${userPrompt}\n\nPERINGATAN KRUSIAL: Jumlah soal yang dihasilkan (${parsedPackage.questions.length}) tidak sesuai dengan target yang diminta (${requestedCount}). Harap hasilkan TEPAT ${requestedCount} butir soal. Balas HANYA JSON murni.`;
          const countCorrected = await callAiProviderWithRetry(
            systemPrompt,
            countCorrectionPrompt,
            config,
            timeoutMs,
            1,
            options,
          );
          const reParsed = parseAiQuestionResponse(countCorrected.text, {
            topik: target.topik,
            tingkat: target.tingkat,
            modulId: target.modulId,
          });
          performEvidenceIntegrityCheck(reParsed, groundedContext);
          if (reParsed.questions.length === requestedCount) {
            parsedPackage = reParsed;
          }
        } catch {
          // Fall through to strict count check
        }
      }

      if (parsedPackage.questions.length !== requestedCount) {
        throw new AiServiceError(
          AI_ERROR_CODES.QUESTION_COUNT_MISMATCH,
          `Jumlah butir soal yang dihasilkan AI (${parsedPackage.questions.length}) tidak sesuai dengan jumlah yang diminta (${requestedCount}).`,
        );
      }
    }

    // 11. Attach Canonical AI Provenance Metadata
    const generatedAtIso = new Date().toISOString();
    const sourceSnapshotIds = groundedContext.sourceMetadata.map((s) => s.sourceId);

    const aiMetadata: QuestionAiMetadata = {
      promptVersion,
      sourceSnapshotIds,
      schemaVersion: CANONICAL_QUESTION_SCHEMA_VERSION,
      generatedAt: generatedAtIso,
      validationStatus: "valid",
      evidenceRefs: parsedPackage.evidenceRefs,
      originalGeneratedCount: parsedPackage.questions.length,
    };

    parsedPackage.aiMetadata = aiMetadata;

    // 12. Optional Draft Persistence to 'paket_soal' in Supabase
    let persistedPackageId: string | undefined = undefined;
    let persistedPackage: PaketSoal | undefined = undefined;

    if (options.persistDraft) {
      const kelasList = groundedContext.academicContext.kelasLabel
        ? [groundedContext.academicContext.kelasLabel]
        : [];

      const { data: inserted, error: insertErr } = await supabase
        .from("paket_soal")
        .insert({
          user_id: authContext.teacherId,
          judul: parsedPackage.judul,
          topik: parsedPackage.topik,
          modul_id: target.modulId || null,
          status: "Draft", // Strict Draft Invariant: never auto-publish
          kelas: kelasList,
          soal: parsedPackage.questions.map(toExistingSoal) as never,
          ai_metadata: aiMetadata as never,
        })
        .select("*")
        .single();

      if (insertErr) {
        console.error("[generateGroundedQuestions] Database insert error:", insertErr);
        throw new AiServiceError(
          AI_ERROR_CODES.PERSISTENCE_ERROR,
          `Gagal menyimpan draf paket soal ke database: ${insertErr.message}`,
        );
      }

      if (inserted) {
        persistedPackageId = inserted.id;
        persistedPackage = {
          id: inserted.id,
          judul: inserted.judul,
          topik: inserted.topik,
          modulId: inserted.modul_id || undefined,
          status: inserted.status,
          kelas: Array.isArray(inserted.kelas) ? inserted.kelas : [],
          soal: Array.isArray(inserted.soal) ? inserted.soal : [],
          createdAt: inserted.created_at,
          ai_metadata: inserted.ai_metadata,
        };
      }
    }

    // 13. Project Student-Safe Questions (Answer-Key Segregation Invariant)
    const studentSafeQuestions = parsedPackage.questions.map(toStudentSafeQuestion);

    const latencyMs = Date.now() - startTime;

    // 14. Record Safe Observability Log
    await recordQuestionGenerationLog({
      teacherId: authContext.teacherId,
      kelasId: target.kelasId,
      sourceCount: groundedContext.sourceMetadata.length,
      promptVersion,
      provider: config.provider,
      model: config.model,
      requestedCount,
      generatedCount: parsedPackage.questions.length,
      latencyMs,
      retryCount: totalRetries,
      status: "success",
    });

    return {
      status: "success",
      package: parsedPackage,
      questions: parsedPackage.questions,
      persistedPackageId,
      persistedPackage,
      studentSafeQuestions,
      metadata: {
        promptVersion,
        schemaVersion: CANONICAL_QUESTION_SCHEMA_VERSION,
        provider: config.provider,
        model: config.model,
        latencyMs,
        retryCount: totalRetries,
        requestedCount,
        generatedCount: parsedPackage.questions.length,
        isTruncated: groundedContext.contextBudgetSummary.isTruncated,
        hasConflicts: groundedContext.sourceConflicts.length > 0,
        conflictCount: groundedContext.sourceConflicts.length,
        sourceSnapshotIds,
      },
      grounding: {
        evidenceSufficiency: groundedContext.evidenceSufficiency,
        hasUsableEvidence: groundedContext.hasUsableEvidence,
        evidenceCount: groundedContext.evidenceItems.length,
        validationStatus: "valid",
      },
    };
  } catch (err: unknown) {
    const normalized = normalizeAiError(err);
    const latencyMs = Date.now() - startTime;

    await recordQuestionGenerationLog({
      teacherId: authContext.teacherId,
      kelasId: target.kelasId,
      sourceCount: groundedContext?.sourceMetadata?.length || 0,
      promptVersion,
      provider: config?.provider || "unknown",
      model: config?.model || "unknown",
      requestedCount,
      generatedCount: 0,
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
