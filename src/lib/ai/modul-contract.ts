/**
 * GuruPro AI Foundation (AI-2A) — Canonical Modul Ajar Generation Contract & Output Schema
 *
 * Establishes the single canonical contract for AI Modul Ajar generation:
 * 1. INPUT CONTRACT: Strongly-typed, server-enforced teacher authorization & class ownership.
 * 2. OUTPUT CONTRACT: Structured JSON schema (Zod-validated) compatible with Kurikulum Merdeka.
 * 3. EVIDENCE & GROUNDING CONTRACT: Strict claim-to-chunk traceability; prevents NOT_FOUND promotion.
 * 4. PERSISTENCE MAPPING: Clean mapping into existing `public.moduls` with draft lifecycle preservation.
 */

import { z } from "zod";
import { AI_ERROR_CODES, AiServiceError } from "./error-taxonomy";
import type { GroundingEvidenceRef, GroundingStatus } from "./types";
import type { Modul, ModulSection, ModulStatus, SumberTipe } from "../modul-types";

export const CANONICAL_OUTPUT_SCHEMA_VERSION = "1.0.0";
export const CANONICAL_PROMPT_VERSION = "modul_ajar_grounded_v1";

// ==============================================================================
// 1. GENERATION INPUT CONTRACT & SCHEMA
// ==============================================================================

export const ModulGenerationInputSchema = z.object({
  sourceSnapshotIds: z.array(z.string().min(1)).min(1, "Minimal satu snapshot materi sumber wajib dipilih."),
  kelasId: z.string().uuid("ID Kelas harus berformat UUID yang valid."),
  topik: z.string().trim().min(3, "Topik materi minimal 3 karakter.").max(150, "Topik materi maksimal 150 karakter."),
  mapel: z.string().trim().min(2, "Mata pelajaran minimal 2 karakter.").optional(),
  targetFase: z.enum(["A", "B", "C", "D", "E", "F"]).default("E"),
  alokasiWaktu: z.string().trim().min(3).default("2 x 45 menit"),
  generationOptions: z.object({
    includeActivities: z.boolean().default(true),
    includeAssessmentRubric: z.boolean().default(true),
    additionalTeacherPrompt: z.string().max(500).optional(),
  }).optional().default({}),
});

export type ModulGenerationInput = z.infer<typeof ModulGenerationInputSchema>;

export interface TeacherAcademicContext {
  teacherId: string;
  teacherRole: string;
  verificationStatus: string;
  teacherClasses: Array<{
    id: string;
    namaKelas: string;
    tingkat: string;
    mapel?: string;
    tahunAjaran?: string;
    guruId: string;
  }>;
  availableSourceSnapshots: Array<{
    id: string;
    userId: string;
    sourceTitle?: string;
    contentHash: string;
  }>;
}

export interface ValidatedGenerationContext {
  input: ModulGenerationInput;
  teacherId: string;
  targetClass: {
    id: string;
    namaKelas: string;
    tingkat: string;
    kelasLabel: string;
    mapel: string;
    tahunAjaran?: string;
  };
  verifiedSources: Array<{
    id: string;
    sourceTitle?: string;
    contentHash: string;
  }>;
}

/**
 * Validates generation input against authenticated server-side teacher context.
 * Strictly prevents client-side identity spoofing and cross-teacher resource access.
 */
export function validateModulGenerationInput(
  rawInput: unknown,
  context: TeacherAcademicContext,
): ValidatedGenerationContext {
  // Security Guard: Prohibit client from providing authoritative identity fields
  if (rawInput && typeof rawInput === "object") {
    const forbiddenFields = ["userId", "teacherId", "ownerId", "role", "statusVerifikasi"];
    for (const field of forbiddenFields) {
      if (field in (rawInput as Record<string, unknown>)) {
        throw new AiServiceError(
          AI_ERROR_CODES.INVALID_REQUEST,
          `Parameter "${field}" tidak diizinkan dikirim oleh klien. Identitas diverifikasi dari sesi login server.`,
        );
      }
    }
  }

  // 1. Teacher Authorization Boundary
  if (context.teacherRole !== "guru") {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Operasi AI Modul Ajar hanya diizinkan untuk akun dengan peran Guru.",
    );
  }

  if (context.verificationStatus !== "terverifikasi") {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      `Akun guru berstatus "${context.verificationStatus}". Hanya guru terverifikasi yang dapat menggunakan AI.`,
    );
  }

  // 2. Validate input schema
  const parsed = ModulGenerationInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const errorDetail = parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      `Validasi parameter pembuatan modul gagal: ${errorDetail}`,
    );
  }

  const input = parsed.data;

  // 3. Academic Context Integrity: Verify target class ownership
  const targetClass = context.teacherClasses.find((k) => k.id === input.kelasId);
  if (!targetClass) {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Kelas yang dipilih tidak ditemukan dalam daftar kelas yang diampu oleh Anda.",
    );
  }

  if (targetClass.guruId !== context.teacherId) {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Anda tidak memiliki wewenang untuk membuat modul pada kelas milik guru lain.",
    );
  }

  // 4. Source Snapshot Ownership: Verify all requested snapshots belong to teacher
  const verifiedSources: ValidatedGenerationContext["verifiedSources"] = [];
  for (const snapId of input.sourceSnapshotIds) {
    const snap = context.availableSourceSnapshots.find((s) => s.id === snapId);
    if (!snap) {
      throw new AiServiceError(
        AI_ERROR_CODES.RETRIEVAL_ERROR,
        `Materi sumber "${snapId}" tidak ditemukan atau belum diserap.`,
      );
    }
    if (snap.userId !== context.teacherId) {
      throw new AiServiceError(
        AI_ERROR_CODES.ROLE_FORBIDDEN,
        `Akses sumber ditolak: Materi sumber "${snapId}" milik guru lain dan tidak dapat diakses.`,
      );
    }
    verifiedSources.push({
      id: snap.id,
      sourceTitle: snap.sourceTitle,
      contentHash: snap.contentHash,
    });
  }

  const resolvedMapel = input.mapel?.trim() || targetClass.mapel?.trim() || "Mata Pelajaran Kejuruan";
  const kelasLabel = `${targetClass.tingkat} ${targetClass.namaKelas}`.trim();

  return {
    input,
    teacherId: context.teacherId,
    targetClass: {
      id: targetClass.id,
      namaKelas: targetClass.namaKelas,
      tingkat: targetClass.tingkat,
      kelasLabel,
      mapel: resolvedMapel,
      tahunAjaran: targetClass.tahunAjaran,
    },
    verifiedSources,
  };
}

// ==============================================================================
// 1.5. GROUNDED CONTEXT CONTRACT (AI-2B)
// ==============================================================================

export const GroundingEvidenceItemSchema = z.object({
  evidenceId: z.string().min(1),
  sourceId: z.string().min(1),
  chunkId: z.string().min(1),
  sourceTitle: z.string().min(1),
  sectionTitle: z.string().optional(),
  chunkIndex: z.number().int().min(0),
  content: z.string().min(1),
  snippet: z.string().min(1),
  relevanceScore: z.number().min(0).max(1),
  status: z.enum(["SUPPORTED", "INFERRED", "NOT_FOUND"]),
});

export type GroundingEvidenceItem = z.infer<typeof GroundingEvidenceItemSchema>;

export const SectionCoverageItemSchema = z.object({
  hasEvidence: z.boolean(),
  score: z.number().min(0).max(1),
  status: z.enum(["SUFFICIENT", "INSUFFICIENT_EVIDENCE"]),
  supportingEvidenceIds: z.array(z.string()),
});

export const SectionCoverageReportSchema = z.object({
  topicMaterial: SectionCoverageItemSchema,
  learningObjectives: SectionCoverageItemSchema,
  activitiesProcedures: SectionCoverageItemSchema,
  assessmentRubric: SectionCoverageItemSchema,
});

export type SectionCoverageReport = z.infer<typeof SectionCoverageReportSchema>;

export const SourceConflictItemSchema = z.object({
  term: z.string().min(1),
  conflictType: z.enum(["NUMERIC_MISMATCH", "CONTRADICTION"]),
  sourceA: z.object({
    sourceId: z.string(),
    sourceTitle: z.string(),
    snippet: z.string(),
  }),
  sourceB: z.object({
    sourceId: z.string(),
    sourceTitle: z.string(),
    snippet: z.string(),
  }),
  description: z.string(),
});

export type SourceConflictItem = z.infer<typeof SourceConflictItemSchema>;

export const ModulGroundingContextSchema = z.object({
  contextVersion: z.literal("1.0.0").default("1.0.0"),
  generationInput: ModulGenerationInputSchema,
  academicContext: z.object({
    teacherId: z.string().min(1),
    teacherName: z.string().optional(),
    kelasId: z.string().min(1),
    namaKelas: z.string().min(1),
    tingkat: z.string().min(1),
    kelasLabel: z.string().min(1),
    mapel: z.string().min(1),
    tahunAjaran: z.string().optional(),
    targetFase: z.enum(["A", "B", "C", "D", "E", "F"]),
    alokasiWaktu: z.string().min(1),
  }),
  pedagogicalConstraints: z.object({
    pendekatan: z.string().optional(),
    profilPelajarPancasila: z.array(z.string()).optional(),
    customInstructions: z.string().optional(),
    targetPertemuanCount: z.number().int().positive().optional(),
    includeActivities: z.boolean().default(true),
    includeAssessmentRubric: z.boolean().default(true),
  }),
  sourceMetadata: z.array(
    z.object({
      sourceId: z.string(),
      sourceTitle: z.string(),
      sourceType: z.string(),
      contentHash: z.string(),
      totalChunks: z.number().int().min(0),
      order: z.number().int().min(0),
    }),
  ),
  evidenceItems: z.array(GroundingEvidenceItemSchema),
  sectionCoverage: SectionCoverageReportSchema,
  sourceConflicts: z.array(SourceConflictItemSchema).default([]),
  contextBudgetSummary: z.object({
    totalSourcesCount: z.number().int().min(0),
    retrievedChunksCount: z.number().int().min(0),
    deduplicatedChunksCount: z.number().int().min(0),
    totalWordCount: z.number().int().min(0),
    isTruncated: z.boolean().default(false),
  }),
  hasUsableEvidence: z.boolean(),
});

export type ModulGroundingContext = z.infer<typeof ModulGroundingContextSchema>;

// ==============================================================================
// 2. CANONICAL STRUCTURED OUTPUT CONTRACT & SCHEMA
// ==============================================================================

export const GroundingStatusSchema = z.enum(["SUPPORTED", "INFERRED", "NOT_FOUND"]);

export const GroundingEvidenceRefSchema = z.object({
  sourceId: z.string().min(1),
  chunkId: z.string().optional(),
  sourceTitle: z.string().optional(),
  snippet: z.string().optional(),
  status: GroundingStatusSchema,
  relevanceScore: z.number().min(0).max(1).optional(),
});

export const GroundedObjectiveSchema = z.object({
  id: z.string().min(1),
  deskripsi: z.string().trim().min(10, "Deskripsi capaian pembelajaran terlalu singkat."),
  evidenceIds: z.array(z.string()).default([]),
  status: GroundingStatusSchema,
});

export const GroundedSectionSchema = z.object({
  id: z.string().min(1),
  judul: z.string().trim().min(3, "Judul bab/bagian minimal 3 karakter."),
  poin: z.array(z.string().trim().min(3)).min(1, "Minimal satu poin capaian per bab."),
  isi: z.string().trim().min(30, "Uraian materi per bab minimal 30 karakter."),
  evidenceIds: z.array(z.string()).default([]),
  status: GroundingStatusSchema,
  keyTerms: z.array(z.string()).optional(),
  ilustrasi: z.string().optional(),
});

export const LearningPhaseActivitySchema = z.object({
  alokasiMenit: z.number().int().positive().optional(),
  aktivitas: z.array(z.string().trim().min(5)).min(1, "Minimal satu butir kegiatan pembelajaran."),
  evidenceIds: z.array(z.string()).optional().default([]),
});

export const LearningActivitiesSchema = z.object({
  pendahuluan: LearningPhaseActivitySchema,
  inti: LearningPhaseActivitySchema,
  penutup: LearningPhaseActivitySchema,
});

export const PedagogicalAssessmentSchema = z.object({
  kriteria: z.array(z.string().trim().min(5)).min(1, "Minimal satu kriteria ketuntasan tujuan pembelajaran."),
  teknik: z.string().trim().min(3, "Teknik asesmen wajib ditentukan (misal: Tes Formatif, Unjuk Kerja)."),
  instrumen: z.string().trim().min(3, "Instrumen asesmen wajib ditentukan (misal: Lembar Observasi, Rubrik)."),
});

export const GroundedModulAjarOutputSchema = z.object({
  schemaVersion: z.literal(CANONICAL_OUTPUT_SCHEMA_VERSION).default(CANONICAL_OUTPUT_SCHEMA_VERSION),
  judul: z.string().trim().min(3, "Judul modul ajar minimal 3 karakter."),
  mapel: z.string().trim().min(2, "Mata pelajaran wajib diisi."),
  kelas: z.string().trim().min(2, "Kelas wajib diisi."),
  fase: z.enum(["A", "B", "C", "D", "E", "F"]),
  alokasiWaktu: z.string().trim().min(3, "Alokasi waktu wajib ditentukan."),
  ringkasan: z.string().trim().min(20, "Ringkasan modul minimal 20 karakter."),
  tujuanPembelajaran: z.array(GroundedObjectiveSchema).min(1, "Minimal satu tujuan pembelajaran wajib ada."),
  sections: z.array(GroundedSectionSchema).min(1, "Minimal satu bab materi pokok wajib ada."),
  kegiatanPembelajaran: LearningActivitiesSchema,
  asesmen: PedagogicalAssessmentSchema,
  catatanKeterbatasan: z.string().trim().optional(),
  evidenceRefs: z.array(GroundingEvidenceRefSchema).default([]),
});

export type GroundedObjective = z.infer<typeof GroundedObjectiveSchema>;
export type GroundedSection = z.infer<typeof GroundedSectionSchema>;
export type LearningActivities = z.infer<typeof LearningActivitiesSchema>;
export type PedagogicalAssessment = z.infer<typeof PedagogicalAssessmentSchema>;
export type GroundedModulAjarOutput = z.infer<typeof GroundedModulAjarOutputSchema>;

// ==============================================================================
// 3. PERSISTENCE METADATA & DOMAIN MAPPING
// ==============================================================================

export interface ModulAiMetadata {
  promptVersion: string;
  sourceSnapshotIds: string[];
  schemaVersion: string;
  generatedAt: string;
  validationStatus: "valid" | "invalid";
  evidenceRefs: GroundingEvidenceRef[];
  tujuanPembelajaran: GroundedObjective[];
  kegiatanPembelajaran: LearningActivities;
  asesmen: PedagogicalAssessment;
  catatanKeterbatasan?: string;
}

export const ModulAiMetadataSchema = z.object({
  promptVersion: z.string().min(1),
  sourceSnapshotIds: z.array(z.string().min(1)),
  schemaVersion: z.string().min(1),
  generatedAt: z.string().datetime(),
  validationStatus: z.enum(["valid", "invalid"]),
  evidenceRefs: z.array(GroundingEvidenceRefSchema),
  tujuanPembelajaran: z.array(GroundedObjectiveSchema),
  kegiatanPembelajaran: LearningActivitiesSchema,
  asesmen: PedagogicalAssessmentSchema,
  catatanKeterbatasan: z.string().optional(),
});

// ==============================================================================
// 4. VALIDATION & PARSING FUNCTIONS
// ==============================================================================

/**
 * Validates that an output object satisfies the canonical schema and grounding invariants:
 * - Output must conform strictly to GroundedModulAjarOutputSchema.
 * - Evidence reference IDs in objectives and sections must exist in evidenceRefs.
 * - Items with NOT_FOUND evidence cannot be marked SUPPORTED (Anti-Hallucination Invariant).
 */
export function validateGroundedModulAjarOutput(output: unknown): GroundedModulAjarOutput {
  const parsed = GroundedModulAjarOutputSchema.safeParse(output);
  if (!parsed.success) {
    const details = parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
    throw new AiServiceError(
      AI_ERROR_CODES.PROVIDER_MALFORMED_OUTPUT,
      `Validasi skema keluaran Modul Ajar AI gagal: ${details}`,
    );
  }

  const data = parsed.data;

  // Build index of valid evidence IDs
  const validEvidenceIds = new Set<string>();
  const evidenceStatusMap = new Map<string, GroundingStatus>();

  for (const ref of data.evidenceRefs) {
    if (ref.chunkId) {
      validEvidenceIds.add(ref.chunkId);
      evidenceStatusMap.set(ref.chunkId, ref.status);
    }
    if (ref.sourceId) {
      validEvidenceIds.add(ref.sourceId);
      if (!ref.chunkId) {
        evidenceStatusMap.set(ref.sourceId, ref.status);
      }
    }
  }

  // Verify objectives grounding & reference integrity
  for (const obj of data.tujuanPembelajaran) {
    for (const eid of obj.evidenceIds) {
      if (!validEvidenceIds.has(eid)) {
        throw new AiServiceError(
          AI_ERROR_CODES.GROUNDING_FAILED,
          `Referensi bukti "${eid}" pada tujuan pembelajaran "${obj.id}" tidak ditemukan dalam daftar evidenceRefs.`,
        );
      }
      const refStatus = evidenceStatusMap.get(eid);
      if (refStatus === "NOT_FOUND" && obj.status === "SUPPORTED") {
        throw new AiServiceError(
          AI_ERROR_CODES.GROUNDING_FAILED,
          `Invarian Grounding dilanggar: Tujuan pembelajaran "${obj.id}" mengklaim status SUPPORTED padahal bukti rujukan berstatus NOT_FOUND.`,
        );
      }
    }
  }

  // Verify sections grounding & reference integrity
  for (const sec of data.sections) {
    for (const eid of sec.evidenceIds) {
      if (!validEvidenceIds.has(eid)) {
        throw new AiServiceError(
          AI_ERROR_CODES.GROUNDING_FAILED,
          `Referensi bukti "${eid}" pada bab "${sec.judul}" tidak ditemukan dalam daftar evidenceRefs.`,
        );
      }
      const refStatus = evidenceStatusMap.get(eid);
      if (refStatus === "NOT_FOUND" && sec.status === "SUPPORTED") {
        throw new AiServiceError(
          AI_ERROR_CODES.GROUNDING_FAILED,
          `Invarian Grounding dilanggar: Bab materi "${sec.judul}" mengklaim status SUPPORTED padahal bukti rujukan berstatus NOT_FOUND.`,
        );
      }
    }
  }

  return data;
}

/**
 * Safely parses raw text or JSON response from an AI provider into canonical Modul Ajar output.
 * Strips codeblocks and enforces strict schema compliance.
 */
export function parseAiModulResponse(raw: unknown): GroundedModulAjarOutput {
  if (raw === null || raw === undefined) {
    throw new AiServiceError(
      AI_ERROR_CODES.PROVIDER_MALFORMED_OUTPUT,
      "Respons AI kosong atau tidak terdefinisi.",
    );
  }

  let jsonCandidate: unknown = raw;

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) {
      throw new AiServiceError(
        AI_ERROR_CODES.PROVIDER_MALFORMED_OUTPUT,
        "Respons teks dari penyedia AI kosong.",
      );
    }

    // Strip markdown code fences if wrapped in ```json ... ``` or ``` ... ```
    const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    const cleaned = fenceMatch ? fenceMatch[1] : trimmed;

    try {
      jsonCandidate = JSON.parse(cleaned);
    } catch (parseErr: any) {
      throw new AiServiceError(
        AI_ERROR_CODES.PROVIDER_MALFORMED_OUTPUT,
        `Gagal mengurai respons JSON dari AI: ${parseErr?.message || "Format JSON tidak valid."}`,
      );
    }
  }

  return validateGroundedModulAjarOutput(jsonCandidate);
}

// ==============================================================================
// 5. APPLICATION DOMAIN MAPPING
// ==============================================================================

export interface MapModulDraftOptions {
  promptVersion?: string;
  sourceSnapshotIds: string[];
  kelasId?: string;
  sumberTipe?: SumberTipe;
  sumberInput?: string;
  sumberUrl?: string;
  sumberJudul?: string;
  sumberKutipan?: string;
}

/**
 * Maps canonical grounded output into GuruPro's standard Modul domain entity.
 * Guarantees:
 * - Status is strictly "Draft" upon generation.
 * - Sections map 1:1 to ModulSection for existing editor and PDF exporter compatibility.
 * - Structured objectives, activities, assessments, and evidence are preserved in aiMetadata.
 */
export function mapGroundedOutputToModulDraft(
  output: GroundedModulAjarOutput,
  options: MapModulDraftOptions,
): Omit<Modul, "id" | "createdAt" | "updatedAt"> {
  const sections: ModulSection[] = output.sections.map((s) => ({
    id: s.id,
    judul: s.judul,
    poin: s.poin,
    isi: s.isi,
    ilustrasi: s.ilustrasi,
  }));

  // Build clean summary combining pedagogical objectives and overview
  const objectiveLines = output.tujuanPembelajaran.map((t) => `- ${t.deskripsi}`).join("\n");
  const combinedRingkasan = [
    output.ringkasan,
    `Tujuan Pembelajaran:\n${objectiveLines}`,
    output.catatanKeterbatasan ? `Catatan Keterbatasan Sumber: ${output.catatanKeterbatasan}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const aiMetadata: ModulAiMetadata = {
    promptVersion: options.promptVersion || CANONICAL_PROMPT_VERSION,
    sourceSnapshotIds: options.sourceSnapshotIds,
    schemaVersion: output.schemaVersion,
    generatedAt: new Date().toISOString(),
    validationStatus: "valid",
    evidenceRefs: output.evidenceRefs,
    tujuanPembelajaran: output.tujuanPembelajaran,
    kegiatanPembelajaran: output.kegiatanPembelajaran,
    asesmen: output.asesmen,
    catatanKeterbatasan: output.catatanKeterbatasan,
  };

  return {
    judul: output.judul,
    kelas: output.kelas,
    kelasId: options.kelasId,
    mapel: output.mapel,
    status: "Draft", // Invariant: AI generation must never auto-publish
    sumberTipe: options.sumberTipe || "eBook / Dokumen",
    sumberInput: options.sumberInput || "",
    sumberUrl: options.sumberUrl,
    sumberJudul: options.sumberJudul,
    sumberKutipan: options.sumberKutipan,
    ringkasan: combinedRingkasan,
    sections,
    slides: [],
    isArchived: false,
    aiMetadata,
  };
}

// Re-export context builder functions & types from AI-2B
export {
  buildModulGroundingContext,
  serializeModulGroundingContext,
  buildDeterministicQueries,
  detectSourceConflicts,
  type BuildContextOptions,
  type RetrievalQueryBundle,
} from "./modul-context-builder";

