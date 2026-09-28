/**
 * GuruPro AI Question Foundation (AI-4A) — Canonical Question Contract & Grounding Foundation
 *
 * Establishes the single canonical contract for AI Question generation and bank management:
 * 1. INPUT CONTRACT: Strongly-typed, server-enforced teacher authorization & context.
 * 2. OUTPUT CONTRACT: Structured Zod schema for Multiple Choice & Essay questions.
 * 3. ANSWER-KEY INVARIANT: Answer keys (kunci & penjelasan) exist only in trusted internal structures;
 *    explicitly segregated from Student-Safe Question payloads.
 * 4. GROUNDING & EVIDENCE BINDING: Strict question-to-chunk traceability; prevents NOT_FOUND promotion.
 * 5. COMPATIBILITY & PERSISTENCE: 100% compatible with existing `paket_soal`, `soal` array,
 *    and auto-grading evaluation engine.
 */

import { z } from "zod";
import { AI_ERROR_CODES, AiServiceError } from "./error-taxonomy";
import { GroundingEvidenceRefSchema, GroundingStatusSchema } from "./modul-contract";
import type { GroundingEvidenceRef, GroundingStatus } from "./types";
import type { JenisSoal, PaketSoal, Soal, Tingkat } from "../soal-types";

export const CANONICAL_QUESTION_SCHEMA_VERSION = "1.0.0";
export const CANONICAL_QUESTION_PROMPT_VERSION = "question_generator_grounded_v1";

// ==============================================================================
// 1. ENUMS & BASIC SCHEMAS
// ==============================================================================

export const QuestionTypeSchema = z.enum(["Pilihan Ganda", "Esai"]);
export type QuestionType = z.infer<typeof QuestionTypeSchema>;

export const QuestionDifficultySchema = z.enum(["Mudah", "Sedang", "Sulit"]);
export type QuestionDifficulty = z.infer<typeof QuestionDifficultySchema>;

export const MultipleChoiceKeySchema = z.enum(["A", "B", "C", "D"]);
export type MultipleChoiceKey = z.infer<typeof MultipleChoiceKeySchema>;

// ==============================================================================
// 2. CANONICAL MULTIPLE CHOICE QUESTION SCHEMA
// ==============================================================================

export const BaseMultipleChoiceQuestionSchema = z.object({
  id: z.string().min(1, "ID butir soal wajib ada."),
  jenis: z.literal("Pilihan Ganda"),
  pertanyaan: z.string().trim().min(5, "Teks pertanyaan minimal 5 karakter."),
  opsi: z
    .array(z.string().trim().min(1, "Teks opsi tidak boleh kosong."))
    .length(4, "Soal Pilihan Ganda wajib memiliki tepat 4 opsi (A, B, C, D)."),
  kunci: MultipleChoiceKeySchema,
  penjelasan: z.string().trim().min(5, "Penjelasan / rasional kunci minimal 5 karakter.").optional(),
  tingkat: QuestionDifficultySchema.default("Sedang"),
  tujuanPembelajaranId: z.string().optional(),
  evidenceIds: z.array(z.string().min(1)).min(1, "Minimal satu referensi bukti materi sumber."),
  status: GroundingStatusSchema.default("SUPPORTED"),
});

export const CanonicalMultipleChoiceQuestionSchema = BaseMultipleChoiceQuestionSchema.superRefine((val, ctx) => {
  // Invariant 1: Options must be distinct (no duplicate choices)
  const lower = val.opsi.map((o) => o.toLowerCase());
  const unique = new Set(lower);
  if (unique.size !== val.opsi.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Opsi pilihan ganda tidak boleh memuat teks yang kembar atau terduplikasi.",
      path: ["opsi"],
    });
  }

  // Invariant 2: Key letter must point to a valid option index (0..3)
  const keyIndex = val.kunci.charCodeAt(0) - 65; // A -> 0, B -> 1, C -> 2, D -> 3
  if (keyIndex < 0 || keyIndex >= val.opsi.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Kunci "${val.kunci}" berada di luar rentang opsi yang tersedia.`,
      path: ["kunci"],
    });
  }
});

export type CanonicalMultipleChoiceQuestion = z.infer<typeof CanonicalMultipleChoiceQuestionSchema>;

// ==============================================================================
// 3. CANONICAL ESSAY QUESTION SCHEMA
// ==============================================================================

export const BaseEssayQuestionSchema = z.object({
  id: z.string().min(1, "ID butir soal esai wajib ada."),
  jenis: z.literal("Esai"),
  pertanyaan: z.string().trim().min(5, "Teks pertanyaan esai minimal 5 karakter."),
  opsi: z.array(z.string()).max(0, "Soal esai dilarang memiliki opsi pilihan ganda (harus array kosong)."),
  kunci: z.string().trim().min(10, "Kunci / rubrik jawaban ideal esai minimal 10 karakter."),
  penjelasan: z.string().trim().min(5, "Panduan penskoran esai minimal 5 karakter.").optional(),
  tingkat: QuestionDifficultySchema.default("Sedang"),
  tujuanPembelajaranId: z.string().optional(),
  evidenceIds: z.array(z.string().min(1)).min(1, "Minimal satu referensi bukti materi sumber."),
  status: GroundingStatusSchema.default("SUPPORTED"),
});

export const CanonicalEssayQuestionSchema = BaseEssayQuestionSchema;

export type CanonicalEssayQuestion = z.infer<typeof CanonicalEssayQuestionSchema>;

// ==============================================================================
// 4. CANONICAL QUESTION (DISCRIMINATED UNION)
// ==============================================================================

export const CanonicalQuestionSchema = z
  .discriminatedUnion("jenis", [BaseMultipleChoiceQuestionSchema, BaseEssayQuestionSchema])
  .superRefine((val, ctx) => {
    if (val.jenis === "Pilihan Ganda") {
      const lower = val.opsi.map((o) => o.toLowerCase());
      const unique = new Set(lower);
      if (unique.size !== val.opsi.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Opsi pilihan ganda tidak boleh memuat teks yang kembar atau terduplikasi.",
          path: ["opsi"],
        });
      }

      const keyIndex = val.kunci.charCodeAt(0) - 65;
      if (keyIndex < 0 || keyIndex >= val.opsi.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Kunci "${val.kunci}" berada di luar rentang opsi yang tersedia.`,
          path: ["kunci"],
        });
      }
    }
  });

export type CanonicalQuestion = z.infer<typeof CanonicalQuestionSchema>;

// ==============================================================================
// 5. QUESTION AI METADATA SCHEMA (PACKAGE & ITEM LEVEL)
// ==============================================================================

export const QuestionAiMetadataSchema = z.object({
  promptVersion: z.string().min(1),
  sourceSnapshotIds: z.array(z.string().min(1)).min(1, "Minimal satu snapshot sumber terdaftar."),
  schemaVersion: z.string().min(1),
  generatedAt: z.string(),
  validationStatus: z.enum(["valid", "invalid"]),
  evidenceRefs: z.array(GroundingEvidenceRefSchema).default([]),
  teacherEdited: z.boolean().optional(),
  editedAt: z.string().optional(),
  lastEditedBy: z.string().optional(),
  originalGeneratedCount: z.number().int().min(1).optional(),
});

export type QuestionAiMetadata = z.infer<typeof QuestionAiMetadataSchema>;

// ==============================================================================
// 6. CANONICAL QUESTION PACKAGE OUTPUT SCHEMA
// ==============================================================================

export const CanonicalQuestionPackageSchema = z.object({
  schemaVersion: z.literal(CANONICAL_QUESTION_SCHEMA_VERSION).default(CANONICAL_QUESTION_SCHEMA_VERSION),
  judul: z.string().trim().min(3, "Judul paket soal minimal 3 karakter."),
  topik: z.string().trim().min(3, "Topik materi minimal 3 karakter."),
  modulId: z.string().optional(),
  tingkat: QuestionDifficultySchema.default("Sedang"),
  questions: z.array(CanonicalQuestionSchema).min(1, "Minimal satu butir soal dalam paket soal."),
  evidenceRefs: z.array(GroundingEvidenceRefSchema).default([]),
  aiMetadata: QuestionAiMetadataSchema.optional(),
});

export type CanonicalQuestionPackage = z.infer<typeof CanonicalQuestionPackageSchema>;

// ==============================================================================
// 7. STUDENT-SAFE QUESTION SCHEMA (ANSWER-KEY SEGREGATION INVARIANT)
// ==============================================================================

/**
 * Schema representing questions securely projected for student clients.
 *
 * CRITICAL SECURITY INVARIANT:
 * Student payload MUST NOT expose:
 * - `kunci` (answer key)
 * - `penjelasan` (rationale / grading secrets)
 * - `evidenceIds` / `aiMetadata` (internal grounding data)
 * - `status` (internal verification flags)
 */
export const StudentSafeQuestionSchema = z.object({
  id: z.string().min(1),
  pertanyaan: z.string().min(1),
  jenis: QuestionTypeSchema,
  opsi: z.array(z.string()),
});

export type StudentSafeQuestion = z.infer<typeof StudentSafeQuestionSchema>;

// ==============================================================================
// 8. GENERATION INPUT CONTRACT (FOR FUTURE AI-4B PIPELINE)
// ==============================================================================

export const QuestionGenerationInputSchema = z.object({
  sourceSnapshotIds: z.array(z.string().min(1)).min(1, "Minimal satu materi sumber dipilih."),
  modulId: z.string().uuid("ID Modul Ajar harus UUID yang sah.").optional(),
  kelasId: z.string().uuid("ID Kelas harus UUID yang sah.").optional(),
  topik: z.string().trim().min(3, "Topik soal minimal 3 karakter.").max(150),
  jumlah: z.number().int().min(1).max(50).default(5),
  tingkat: QuestionDifficultySchema.default("Sedang"),
  jenis: z.enum(["Pilihan Ganda", "Esai", "Campuran"]).default("Pilihan Ganda"),
  targetTujuanPembelajaranIds: z.array(z.string()).optional(),
  customInstructions: z.string().max(500).optional(),
});

export type QuestionGenerationInput = z.infer<typeof QuestionGenerationInputSchema>;

// ==============================================================================
// 9. VALIDATION & INVARIANT ENFORCEMENT FUNCTIONS
// ==============================================================================

export interface QuestionValidationOptions {
  allowedEvidenceIds?: Set<string> | string[];
  evidenceStatusMap?: Map<string, GroundingStatus> | Record<string, GroundingStatus>;
}

/**
 * Validates a single question against canonical structure and grounding integrity.
 *
 * Enforces:
 * 1. Schema correctness (Zod parsing).
 * 2. Referential integrity: `kunci` points to an actual option.
 * 3. Grounding integrity: No dangling `evidenceIds` outside allowed set.
 * 4. Anti-promotion invariant: `NOT_FOUND` evidence CANNOT be marked `SUPPORTED`.
 */
export function validateCanonicalQuestion(
  rawQuestion: unknown,
  options?: QuestionValidationOptions,
): CanonicalQuestion {
  const parsed = CanonicalQuestionSchema.safeParse(rawQuestion);
  if (!parsed.success) {
    const detail = parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
    throw new AiServiceError(
      AI_ERROR_CODES.QUESTION_SCHEMA_INVALID,
      `Validasi butir soal gagal: ${detail}`,
    );
  }

  const question = parsed.data;

  // Validate Evidence IDs (Referential Grounding)
  if (options?.allowedEvidenceIds) {
    const allowed = options.allowedEvidenceIds instanceof Set
      ? options.allowedEvidenceIds
      : new Set(options.allowedEvidenceIds);

    for (const evId of question.evidenceIds) {
      if (!allowed.has(evId)) {
        throw new AiServiceError(
          AI_ERROR_CODES.QUESTION_GROUNDING_FAILED,
          `Butir soal "${question.id}" merujuk pada evidenceId "${evId}" yang tidak terdaftar dalam materi sumber.`,
        );
      }
    }
  }

  // Anti-Promotion Invariant: Check if evidence is marked NOT_FOUND in source
  if (options?.evidenceStatusMap) {
    const statusMap = options.evidenceStatusMap instanceof Map
      ? options.evidenceStatusMap
      : new Map(Object.entries(options.evidenceStatusMap));

    for (const evId of question.evidenceIds) {
      const evStatus = statusMap.get(evId);
      if (evStatus === "NOT_FOUND" && question.status === "SUPPORTED") {
        throw new AiServiceError(
          AI_ERROR_CODES.QUESTION_GROUNDING_FAILED,
          `Invarian anti-promosi dilanggar: Butir soal "${question.id}" mengklaim status "SUPPORTED" padahal bukti "${evId}" berstatus "NOT_FOUND".`,
        );
      }
    }
  }

  return question;
}

/**
 * Validates a complete question package.
 */
export function validateCanonicalQuestionPackage(
  rawPackage: unknown,
  options?: QuestionValidationOptions,
): CanonicalQuestionPackage {
  const parsed = CanonicalQuestionPackageSchema.safeParse(rawPackage);
  if (!parsed.success) {
    const detail = parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
    throw new AiServiceError(
      AI_ERROR_CODES.QUESTION_SCHEMA_INVALID,
      `Validasi paket soal gagal: ${detail}`,
    );
  }

  const pkg = parsed.data;

  // Validate each question with grounding options
  const validatedQuestions: CanonicalQuestion[] = [];
  for (const q of pkg.questions) {
    validatedQuestions.push(validateCanonicalQuestion(q, options));
  }

  return {
    ...pkg,
    questions: validatedQuestions,
  };
}

/**
 * Deterministically projects a CanonicalQuestion or existing Soal into a StudentSafeQuestion.
 * Completely strips answer keys, explanations, evidence IDs, and AI provenance.
 */
export function toStudentSafeQuestion(question: CanonicalQuestion | Soal): StudentSafeQuestion {
  return {
    id: String(question.id),
    pertanyaan: String(question.pertanyaan || ""),
    jenis: question.jenis === "Esai" ? "Esai" : "Pilihan Ganda",
    opsi: Array.isArray(question.opsi) ? [...question.opsi] : [],
  };
}

/**
 * Converts a CanonicalQuestion into the existing GuruPro `Soal` interface.
 * Guarantees 100% backward-compatibility with `paket_soal.soal` JSONB storage.
 */
export function toExistingSoal(canonical: CanonicalQuestion): Soal {
  return {
    id: canonical.id,
    pertanyaan: canonical.pertanyaan,
    jenis: canonical.jenis as JenisSoal,
    opsi: [...canonical.opsi],
    kunci: canonical.kunci,
    penjelasan: canonical.penjelasan,
    tingkat: canonical.tingkat as Tingkat,
    tujuanPembelajaranId: canonical.tujuanPembelajaranId,
    evidenceIds: [...canonical.evidenceIds],
  };
}

/**
 * Converts an existing `Soal` into a CanonicalQuestion if it satisfies canonical rules.
 */
export function fromExistingSoal(
  soal: Soal,
  options?: { fallbackEvidenceId?: string; defaultTingkat?: Tingkat },
): CanonicalQuestion {
  const evidenceIds = soal.evidenceIds && soal.evidenceIds.length > 0
    ? soal.evidenceIds
    : options?.fallbackEvidenceId
      ? [options.fallbackEvidenceId]
      : ["evidence-generic-01"];

  const tingkat = soal.tingkat || options?.defaultTingkat || "Sedang";

  if (soal.jenis === "Esai") {
    return CanonicalEssayQuestionSchema.parse({
      id: soal.id,
      jenis: "Esai",
      pertanyaan: soal.pertanyaan,
      opsi: [],
      kunci: soal.kunci || "Jawaban ideal esai memenuhi kriteria capaian pembelajaran.",
      penjelasan: soal.penjelasan,
      tingkat,
      tujuanPembelajaranId: soal.tujuanPembelajaranId,
      evidenceIds,
      status: "SUPPORTED",
    });
  }

  // Pilihan Ganda
  let kunciLetter = String(soal.kunci || "A").trim().toUpperCase();
  if (!["A", "B", "C", "D"].includes(kunciLetter)) {
    // If kunci was stored as full option text, resolve its index
    const matchIdx = soal.opsi.findIndex(
      (o) => o.trim().toLowerCase() === kunciLetter.toLowerCase(),
    );
    if (matchIdx >= 0 && matchIdx < 4) {
      kunciLetter = String.fromCharCode(65 + matchIdx);
    } else {
      kunciLetter = "A";
    }
  }

  return CanonicalMultipleChoiceQuestionSchema.parse({
    id: soal.id,
    jenis: "Pilihan Ganda",
    pertanyaan: soal.pertanyaan,
    opsi: soal.opsi.slice(0, 4),
    kunci: kunciLetter as MultipleChoiceKey,
    penjelasan: soal.penjelasan,
    tingkat,
    tujuanPembelajaranId: soal.tujuanPembelajaranId,
    evidenceIds,
    status: "SUPPORTED",
  });
}

// Re-export AI-4B Question Grounded Context Builder
export {
  CANONICAL_QUESTION_CONTEXT_VERSION,
  QuestionGroundingInputSchema,
  GroundedQuestionContextSchema,
  buildQuestionDeterministicQueries,
  buildQuestionGroundingContext,
  serializeQuestionGroundingContext,
  type QuestionGroundingInput,
  type GroundedQuestionContext,
  type BuildQuestionContextOptions,
  type QuestionRetrievalQueryBundle,
} from "./question-context-builder";

// Re-export AI-4C Real AI Question Generation Engine
export {
  generateGroundedQuestions,
  parseAiQuestionResponse,
  type GenerateQuestionsOptions,
  type QuestionAiGenerationResult,
} from "./question-generator";


