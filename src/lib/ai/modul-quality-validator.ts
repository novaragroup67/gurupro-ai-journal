/**
 * GuruPro AI Foundation (AI-2D) — Semantic Quality Gate & Output Grounding Validator
 *
 * Dedicated, deterministic server-side validation layer for AI-generated Modul Ajar drafts.
 * Executes AFTER AI-2C generation and BEFORE teacher draft review.
 *
 * Responsibilities:
 * 1. Structural Validation (reusing canonical GroundedModulAjarOutputSchema)
 * 2. Factual Grounding Validation (claim-to-evidence matching, exact numeric & entity fidelity)
 * 3. Unsupported Claim Detection (detecting fabricated numbers, invented specs, ungrounded assertions)
 * 4. Evidence Coverage Validation (deterministic section coverage ratio)
 * 5. Source Conflict Detection (checking whether multi-source contradictions are acknowledged)
 * 6. Pedagogical Coherence Validation (meaningful objectives, phase flow, time allocation, non-duplication)
 * 7. Quality Decision Engine (PASS / REVISE / REJECT)
 *
 * INVARIANTS:
 * - 100% deterministic (no random scoring or subjective LLM judges).
 * - Preserves strict Draft invariant (even with PASS, never auto-publishes).
 * - Fail-closed on REJECT.
 */

import {
  type GroundedModulAjarOutput,
  type ModulGroundingContext,
  type ModulQualityValidationSummary,
  CANONICAL_OUTPUT_SCHEMA_VERSION,
  CANONICAL_QUALITY_VALIDATION_VERSION,
  GroundedModulAjarOutputSchema,
} from "./modul-contract";
import { AI_ERROR_CODES, AiServiceError } from "./error-taxonomy";
import { EDUCATIONAL_SYNONYMS } from "./grounding";
import type { AiSourceSnapshot } from "./types";

export type ModulQualityDecision = "PASS" | "REVISE" | "REJECT";

export interface UnsupportedClaimIssue {
  type:
    | "NUMERIC_MISMATCH"
    | "INVENTED_SPECIFICATION"
    | "DANGLING_EVIDENCE"
    | "UNGROUNDED_CLAIM"
    | "ABSENT_ENTITY";
  section: string;
  claim: string;
  reason: string;
  evidenceIds: string[];
  severity: "CRITICAL" | "MINOR";
}

export interface EvidenceCoverageResult {
  coveredSections: string[];
  uncoveredSections: string[];
  coverageRatio: number;
  sectionDetails: Record<
    string,
    {
      isCovered: boolean;
      evidenceCount: number;
      evidenceIds: string[];
      status: "SUFFICIENT" | "INSUFFICIENT";
    }
  >;
}

export interface SourceConflictValidationIssue {
  type: "SOURCE_CONFLICT";
  term: string;
  description: string;
  evidenceIds: string[];
  isAcknowledged: boolean;
  conflictingSources: Array<{
    sourceId: string;
    sourceTitle: string;
    snippet: string;
  }>;
  severity: "CRITICAL" | "MINOR";
}

export interface PedagogicalValidationIssue {
  ruleId: string;
  section: string;
  description: string;
  severity: "CRITICAL" | "MINOR";
}

export interface StructuralValidationIssue {
  field: string;
  issue: string;
  severity: "CRITICAL" | "MINOR";
}

export interface ModulQualityValidationResult {
  status: ModulQualityDecision;
  validationVersion: string;
  groundingStatus: "VALID" | "DEFECTIVE";
  evidenceCoverage: EvidenceCoverageResult;
  unsupportedClaims: UnsupportedClaimIssue[];
  sourceConflicts: SourceConflictValidationIssue[];
  pedagogicalIssues: PedagogicalValidationIssue[];
  structuralIssues: StructuralValidationIssue[];
  summary: ModulQualityValidationSummary;
  metadata: {
    durationMs: number;
    validatedAt: string;
    totalIssuesCount: number;
    criticalIssuesCount: number;
    minorIssuesCount: number;
  };
}

export interface QualityValidationOptions {
  coverageThreshold?: number; // Default 0.70 (70%)
  allowMinorUnsupported?: boolean; // Default false
  strictMode?: boolean; // If true, any minor issue triggers REVISE
}

const DEFAULT_COVERAGE_THRESHOLD = 0.7;
const REJECT_COVERAGE_FLOOR = 0.4;

/**
 * Extracts numbers from text, normalized for separators (e.g., "1.500", "1500", "3.000.000", "2.5").
 */
function extractNumericTokens(text: string): string[] {
  const matches = text.match(/\b\d+(?:[.,]\d+)?\b/g) || [];
  const normalized = new Set<string>();

  for (const m of matches) {
    // Keep raw string and digits-only representation
    normalized.add(m);
    const digitsOnly = m.replace(/[.,]/g, "");
    if (digitsOnly.length > 0) {
      normalized.add(digitsOnly);
    }
  }

  return Array.from(normalized);
}

/**
 * Checks whether a number is contained in a text block, accounting for punctuation differences.
 */
function textContainsNumber(targetText: string, rawNum: string): boolean {
  if (targetText.includes(rawNum)) return true;
  const digitsOnly = rawNum.replace(/[.,]/g, "");
  if (digitsOnly.length > 0 && targetText.replace(/[.,]/g, "").includes(digitsOnly)) {
    return true;
  }
  return false;
}

/**
 * Extracts technical acronyms and distinctive capitalized terms from text.
 */
function extractDistinctiveTechnicalTokens(text: string): string[] {
  const tokens = text.match(/\b[A-Za-z0-9_-]{2,}\b/g) || [];
  const distinctive = new Set<string>();

  const STOPWORDS = new Set([
    "dan", "atau", "dari", "pada", "dalam", "untuk", "dengan", "adalah", "yaitu",
    "sebagai", "akan", "dapat", "bisa", "harus", "oleh", "secara", "karena", "maka",
    "jika", "tentang", "peserta", "didik", "guru", "siswa", "kelas", "materi",
    "modul", "ajar", "pembelajaran", "kegiatan", "tujuan", "asesmen", "refleksi",
    "fase", "menit", "waktu", "alokasi", "lembar", "kerja", "rubrik", "observasi",
    "the", "and", "for", "with", "this", "that"
  ]);

  for (const t of tokens) {
    const lower = t.toLowerCase();
    if (STOPWORDS.has(lower)) continue;

    // Matches acronyms (e.g. OSPF, VLAN, RIP, BGP, ECU, MAP, MAF, EFI, OBD, LKPD) or camelCase/PascalCase
    const isAcronym = /^[A-Z0-9]{2,}$/.test(t);
    const hasInternalUpper = /[a-z][A-Z]/.test(t);
    const hasDigitsAndLetters = /[A-Za-z]/.test(t) && /\d/.test(t);

    if (isAcronym || hasInternalUpper || hasDigitsAndLetters) {
      distinctive.add(lower);
    }
  }

  return Array.from(distinctive);
}

// ==============================================================================
// 1. STRUCTURAL VALIDATION
// ==============================================================================

export function validateStructuralIntegrity(output: unknown): {
  issues: StructuralValidationIssue[];
  parsedOutput?: GroundedModulAjarOutput;
} {
  const issues: StructuralValidationIssue[] = [];
  const parsed = GroundedModulAjarOutputSchema.safeParse(output);

  if (!parsed.success) {
    for (const err of parsed.error.errors) {
      issues.push({
        field: err.path.join("."),
        issue: err.message,
        severity: "CRITICAL",
      });
    }
    return { issues };
  }

  const data = parsed.data;

  // Additional structural invariants
  if (!data.judul || data.judul.trim().length < 3) {
    issues.push({ field: "judul", issue: "Judul modul terlalu pendek atau kosong.", severity: "CRITICAL" });
  }

  if (!data.tujuanPembelajaran || data.tujuanPembelajaran.length === 0) {
    issues.push({ field: "tujuanPembelajaran", issue: "Daftar tujuan pembelajaran tidak boleh kosong.", severity: "CRITICAL" });
  }

  if (!data.sections || data.sections.length === 0) {
    issues.push({ field: "sections", issue: "Materi pokok (sections) tidak boleh kosong.", severity: "CRITICAL" });
  }

  for (let i = 0; i < data.sections.length; i++) {
    const sec = data.sections[i];
    if (!sec.isi || sec.isi.trim().length < 30) {
      issues.push({
        field: `sections[${i}].isi`,
        issue: `Uraian materi pokok pada bab "${sec.judul}" terlalu singkat (< 30 karakter).`,
        severity: "CRITICAL",
      });
    }
  }

  if (!data.kegiatanPembelajaran?.pendahuluan?.aktivitas?.length) {
    issues.push({ field: "kegiatanPembelajaran.pendahuluan", issue: "Aktivitas pendahuluan tidak boleh kosong.", severity: "CRITICAL" });
  }
  if (!data.kegiatanPembelajaran?.inti?.aktivitas?.length) {
    issues.push({ field: "kegiatanPembelajaran.inti", issue: "Aktivitas inti tidak boleh kosong.", severity: "CRITICAL" });
  }
  if (!data.kegiatanPembelajaran?.penutup?.aktivitas?.length) {
    issues.push({ field: "kegiatanPembelajaran.penutup", issue: "Aktivitas penutup tidak boleh kosong.", severity: "CRITICAL" });
  }

  if (!data.asesmen?.kriteria?.length) {
    issues.push({ field: "asesmen.kriteria", issue: "Kriteria asesmen tidak boleh kosong.", severity: "CRITICAL" });
  }

  return { issues, parsedOutput: data };
}

// ==============================================================================
// 2. FACTUAL GROUNDING & UNSUPPORTED CLAIM VALIDATION
// ==============================================================================

export function validateFactualGrounding(
  output: GroundedModulAjarOutput,
  context: ModulGroundingContext,
): UnsupportedClaimIssue[] {
  const issues: UnsupportedClaimIssue[] = [];

  const validEvidenceIdSet = new Set(context.evidenceItems.map((e) => e.evidenceId));
  const validChunkIdSet = new Set(context.evidenceItems.map((e) => e.chunkId));
  const validSourceIdSet = new Set(context.sourceMetadata.map((s) => s.sourceId));

  // Build combined evidence text per evidenceId/chunkId and overall corpus text
  const evidenceTextById = new Map<string, string>();
  const allCorpusText = context.evidenceItems.map((e) => `${e.content} ${e.snippet}`).join(" ").toLowerCase();

  for (const item of context.evidenceItems) {
    const combined = `${item.content} ${item.snippet}`.toLowerCase();
    evidenceTextById.set(item.evidenceId, combined);
    evidenceTextById.set(item.chunkId, combined);
  }

  // 1. Verify Objectives (tujuanPembelajaran)
  for (let i = 0; i < output.tujuanPembelajaran.length; i++) {
    const obj = output.tujuanPembelajaran[i];
    const sectionName = `tujuanPembelajaran[${i}] (${obj.id})`;

    // Check evidence IDs exist
    for (const eid of obj.evidenceIds) {
      if (!validEvidenceIdSet.has(eid) && !validChunkIdSet.has(eid)) {
        issues.push({
          type: "DANGLING_EVIDENCE",
          section: sectionName,
          claim: obj.deskripsi,
          reason: `Evidence ID "${eid}" tidak terdaftar di dalam konteks sumber materi.`,
          evidenceIds: [eid],
          severity: "CRITICAL",
        });
      }
    }

    // Check anti-promotion invariant
    if (obj.status === "SUPPORTED" && obj.evidenceIds.length === 0) {
      issues.push({
        type: "UNGROUNDED_CLAIM",
        section: sectionName,
        claim: obj.deskripsi,
        reason: "Tujuan pembelajaran berstatus SUPPORTED tetapi tidak menyertakan rujukan evidenceIds.",
        evidenceIds: [],
        severity: "CRITICAL",
      });
    }

    // Verify numbers in objective
    const objNumbers = extractNumericTokens(obj.deskripsi);
    for (const num of objNumbers) {
      // Ignore numbers that are purely part of objective ID like TP-01
      if (obj.id.includes(num)) continue;
      if (!textContainsNumber(allCorpusText, num)) {
        issues.push({
          type: "NUMERIC_MISMATCH",
          section: sectionName,
          claim: obj.deskripsi,
          reason: `Angka atau nilai "${num}" pada tujuan pembelajaran tidak ditemukan di dalam teks sumber rujukan.`,
          evidenceIds: obj.evidenceIds,
          severity: "CRITICAL",
        });
      }
    }
  }

  // 2. Verify Sections (Materi Pokok)
  for (let i = 0; i < output.sections.length; i++) {
    const sec = output.sections[i];
    const sectionName = `sections[${i}] (${sec.judul})`;

    // Check evidence IDs
    for (const eid of sec.evidenceIds) {
      if (!validEvidenceIdSet.has(eid) && !validChunkIdSet.has(eid)) {
        issues.push({
          type: "DANGLING_EVIDENCE",
          section: sectionName,
          claim: sec.judul,
          reason: `Evidence ID "${eid}" pada bab materi tidak terdaftar di dalam konteks sumber materi.`,
          evidenceIds: [eid],
          severity: "CRITICAL",
        });
      }
    }

    if (sec.status === "SUPPORTED" && sec.evidenceIds.length === 0) {
      issues.push({
        type: "UNGROUNDED_CLAIM",
        section: sectionName,
        claim: sec.judul,
        reason: `Bab materi pokok berstatus SUPPORTED tetapi tidak menyertakan rujukan evidenceIds.`,
        evidenceIds: [],
        severity: "CRITICAL",
      });
    }

    // Verify exact numbers and measurements in section text
    const fullSecText = `${sec.judul} ${sec.poin.join(" ")} ${sec.isi}`;
    const secNumbers = extractNumericTokens(fullSecText);

    // Get linked evidence text
    const linkedEvidenceText = sec.evidenceIds
      .map((eid) => evidenceTextById.get(eid) || "")
      .join(" ");

    for (const num of secNumbers) {
      // Exclude small list numbers 1-9 unless they are part of measurements
      if (/^[1-9]$/.test(num) && !linkedEvidenceText.includes(num)) {
        // Only verify single-digit numbers if they look like parameters (e.g. AD=1)
        if (!fullSecText.match(new RegExp(`(?:=|\bke-|\bfase\s*|\btingkat\s*)${num}\\b`, "i"))) {
          continue;
        }
      }

      if (!textContainsNumber(allCorpusText, num)) {
        issues.push({
          type: "NUMERIC_MISMATCH",
          section: sectionName,
          claim: fullSecText.slice(0, 150),
          reason: `Nilai numerik atau parameter "${num}" pada bab materi pokok tidak ditemukan di dalam dokumen sumber rujukan.`,
          evidenceIds: sec.evidenceIds,
          severity: "CRITICAL",
        });
      }
    }

    // Check technical acronyms & distinctive specifications
    const techTokens = extractDistinctiveTechnicalTokens(fullSecText);
    for (const token of techTokens) {
      if (!allCorpusText.includes(token)) {
        // Check educational synonyms
        const synonyms = EDUCATIONAL_SYNONYMS[token] || [];
        const hasSynonymMatch = synonyms.some((syn) => allCorpusText.includes(syn));

        if (!hasSynonymMatch) {
          issues.push({
            type: "INVENTED_SPECIFICATION",
            section: sectionName,
            claim: `Terminologi teknis: "${token}"`,
            reason: `Spesifikasi teknis, protokol, atau entitas "${token}" tidak tercatat di dalam materi sumber terpilih.`,
            evidenceIds: sec.evidenceIds,
            severity: "CRITICAL",
          });
        }
      }
    }
  }

  // 3. Verify Activities (kegiatanPembelajaran)
  for (const phase of ["pendahuluan", "inti", "penutup"] as const) {
    const act = output.kegiatanPembelajaran[phase];
    const sectionName = `kegiatanPembelajaran.${phase}`;

    if (act?.evidenceIds) {
      for (const eid of act.evidenceIds) {
        if (!validEvidenceIdSet.has(eid) && !validChunkIdSet.has(eid)) {
          issues.push({
            type: "DANGLING_EVIDENCE",
            section: sectionName,
            claim: act.aktivitas.join("; ").slice(0, 100),
            reason: `Evidence ID "${eid}" pada kegiatan ${phase} tidak terdaftar di dalam konteks sumber materi.`,
            evidenceIds: [eid],
            severity: "CRITICAL",
          });
        }
      }
    }
  }

  // 4. Verify Evidence References Array
  for (let i = 0; i < output.evidenceRefs.length; i++) {
    const ref = output.evidenceRefs[i];
    if (!validSourceIdSet.has(ref.sourceId)) {
      issues.push({
        type: "DANGLING_EVIDENCE",
        section: `evidenceRefs[${i}]`,
        claim: ref.sourceTitle || ref.sourceId,
        reason: `Referensi bukti merujuk pada sourceId "${ref.sourceId}" yang tidak ada dalam daftar materi terpilih.`,
        evidenceIds: ref.chunkId ? [ref.chunkId] : [],
        severity: "CRITICAL",
      });
    }
  }

  return issues;
}

// ==============================================================================
// 3. EVIDENCE COVERAGE VALIDATION
// ==============================================================================

export function validateEvidenceCoverage(
  output: GroundedModulAjarOutput,
  context: ModulGroundingContext,
  threshold: number = DEFAULT_COVERAGE_THRESHOLD,
): EvidenceCoverageResult {
  const validEvidenceIdSet = new Set(context.evidenceItems.map((e) => e.evidenceId));
  const validChunkIdSet = new Set(context.evidenceItems.map((e) => e.chunkId));

  const hasValidId = (ids?: string[]) =>
    Boolean(ids && ids.some((id) => validEvidenceIdSet.has(id) || validChunkIdSet.has(id)));

  const sectionDetails: EvidenceCoverageResult["sectionDetails"] = {};
  const coveredSections: string[] = [];
  const uncoveredSections: string[] = [];

  let totalEvaluableItems = 0;
  let coveredItems = 0;

  // 1. Objectives coverage
  const totalObjectives = output.tujuanPembelajaran.length;
  let coveredObjectives = 0;
  const objEvidenceIds: string[] = [];

  for (const obj of output.tujuanPembelajaran) {
    if (hasValidId(obj.evidenceIds)) {
      coveredObjectives++;
      objEvidenceIds.push(...obj.evidenceIds);
    }
  }

  totalEvaluableItems += totalObjectives;
  coveredItems += coveredObjectives;

  const isObjCovered = totalObjectives > 0 && coveredObjectives / totalObjectives >= 0.5;
  sectionDetails["tujuanPembelajaran"] = {
    isCovered: isObjCovered,
    evidenceCount: objEvidenceIds.length,
    evidenceIds: Array.from(new Set(objEvidenceIds)),
    status: isObjCovered ? "SUFFICIENT" : "INSUFFICIENT",
  };
  if (isObjCovered) coveredSections.push("tujuanPembelajaran");
  else uncoveredSections.push("tujuanPembelajaran");

  // 2. Sections (Materi Pokok) coverage
  const totalSections = output.sections.length;
  let coveredSectionsCount = 0;
  const secEvidenceIds: string[] = [];

  for (const sec of output.sections) {
    if (hasValidId(sec.evidenceIds)) {
      coveredSectionsCount++;
      secEvidenceIds.push(...sec.evidenceIds);
    }
  }

  totalEvaluableItems += totalSections;
  coveredItems += coveredSectionsCount;

  const isSecCovered = totalSections > 0 && coveredSectionsCount / totalSections >= 0.6;
  sectionDetails["sections"] = {
    isCovered: isSecCovered,
    evidenceCount: secEvidenceIds.length,
    evidenceIds: Array.from(new Set(secEvidenceIds)),
    status: isSecCovered ? "SUFFICIENT" : "INSUFFICIENT",
  };
  if (isSecCovered) coveredSections.push("sections");
  else uncoveredSections.push("sections");

  // 3. Learning Activities (kegiatanPembelajaran.inti) coverage
  const intiEvidenceIds = output.kegiatanPembelajaran?.inti?.evidenceIds || [];
  const isIntiCovered = hasValidId(intiEvidenceIds);
  totalEvaluableItems += 1;
  if (isIntiCovered) coveredItems += 1;

  sectionDetails["kegiatanPembelajaran.inti"] = {
    isCovered: isIntiCovered,
    evidenceCount: intiEvidenceIds.length,
    evidenceIds: intiEvidenceIds,
    status: isIntiCovered ? "SUFFICIENT" : "INSUFFICIENT",
  };
  if (isIntiCovered) coveredSections.push("kegiatanPembelajaran.inti");
  else uncoveredSections.push("kegiatanPembelajaran.inti");

  // 4. EvidenceRefs list coverage
  const hasEvidenceRefs = output.evidenceRefs && output.evidenceRefs.length > 0;
  totalEvaluableItems += 1;
  if (hasEvidenceRefs) coveredItems += 1;

  sectionDetails["evidenceRefs"] = {
    isCovered: hasEvidenceRefs,
    evidenceCount: output.evidenceRefs?.length || 0,
    evidenceIds: output.evidenceRefs?.map((r) => r.chunkId || r.sourceId).filter(Boolean) as string[],
    status: hasEvidenceRefs ? "SUFFICIENT" : "INSUFFICIENT",
  };
  if (hasEvidenceRefs) coveredSections.push("evidenceRefs");
  else uncoveredSections.push("evidenceRefs");

  const coverageRatio = totalEvaluableItems > 0 ? Number((coveredItems / totalEvaluableItems).toFixed(2)) : 0;

  return {
    coveredSections,
    uncoveredSections,
    coverageRatio,
    sectionDetails,
  };
}

// ==============================================================================
// 4. SOURCE CONFLICT VALIDATION
// ==============================================================================

export function detectSourceConflictsInOutput(
  output: GroundedModulAjarOutput,
  context: ModulGroundingContext,
): SourceConflictValidationIssue[] {
  const issues: SourceConflictValidationIssue[] = [];
  if (!context.sourceConflicts || context.sourceConflicts.length === 0) {
    return issues;
  }

  const combinedOutputText = [
    output.ringkasan,
    output.catatanKeterbatasan || "",
    ...output.sections.map((s) => `${s.judul} ${s.isi}`),
  ].join(" ").toLowerCase();

  const notesText = (output.catatanKeterbatasan || "").toLowerCase();

  for (const conflict of context.sourceConflicts) {
    const termLower = conflict.term.toLowerCase();
    const isTermMentioned = combinedOutputText.includes(termLower);

    // If the conflicting term is used in the module:
    // It MUST be acknowledged in catatanKeterbatasan or ringkasan
    const isAcknowledged =
      notesText.includes(termLower) ||
      notesText.includes("perbedaan") ||
      notesText.includes("konflik") ||
      notesText.includes("pertentangan") ||
      notesText.includes(conflict.sourceA.snippet.toLowerCase().slice(0, 20)) ||
      notesText.includes(conflict.sourceB.snippet.toLowerCase().slice(0, 20));

    if (isTermMentioned && !isAcknowledged) {
      issues.push({
        type: "SOURCE_CONFLICT",
        term: conflict.term,
        description: `Pertentangan sumber pada topik "${conflict.term}" tidak diakui secara transparan pada catatan keterbatasan modul: ${conflict.description}`,
        evidenceIds: [],
        isAcknowledged: false,
        conflictingSources: [
          {
            sourceId: conflict.sourceA.sourceId,
            sourceTitle: conflict.sourceA.sourceTitle,
            snippet: conflict.sourceA.snippet,
          },
          {
            sourceId: conflict.sourceB.sourceId,
            sourceTitle: conflict.sourceB.sourceTitle,
            snippet: conflict.sourceB.snippet,
          },
        ],
        severity: "CRITICAL",
      });
    } else if (isTermMentioned && isAcknowledged) {
      // Conflict exists but is properly acknowledged -> transparent, not a blocking failure
      issues.push({
        type: "SOURCE_CONFLICT",
        term: conflict.term,
        description: `Pertentangan sumber pada topik "${conflict.term}" diakui secara transparan.`,
        evidenceIds: [],
        isAcknowledged: true,
        conflictingSources: [
          {
            sourceId: conflict.sourceA.sourceId,
            sourceTitle: conflict.sourceA.sourceTitle,
            snippet: conflict.sourceA.snippet,
          },
          {
            sourceId: conflict.sourceB.sourceId,
            sourceTitle: conflict.sourceB.sourceTitle,
            snippet: conflict.sourceB.snippet,
          },
        ],
        severity: "MINOR",
      });
    }
  }

  return issues;
}

// ==============================================================================
// 5. PEDAGOGICAL COHERENCE VALIDATION
// ==============================================================================

export function validatePedagogicalCoherence(
  output: GroundedModulAjarOutput,
  context: ModulGroundingContext,
): PedagogicalValidationIssue[] {
  const issues: PedagogicalValidationIssue[] = [];

  // 1. Objectives (Tujuan Pembelajaran) Quality
  const ACTIVE_PEDAGOGICAL_VERBS = [
    "mampu", "dapat", "menjelaskan", "menganalisis", "mengidentifikasi",
    "mempraktikkan", "menyusun", "memahami", "mengevaluasi", "menerapkan",
    "mengonfigurasi", "membuat", "merumuskan", "membedakan", "menguji"
  ];

  for (let i = 0; i < output.tujuanPembelajaran.length; i++) {
    const obj = output.tujuanPembelajaran[i];
    const desc = obj.deskripsi.trim();

    if (desc.length < 15) {
      issues.push({
        ruleId: "PED_OBJ_LENGTH",
        section: `tujuanPembelajaran[${i}]`,
        description: `Deskripsi tujuan pembelajaran "${obj.id}" terlalu singkat (< 15 karakter).`,
        severity: "CRITICAL",
      });
    }

    const lowerDesc = desc.toLowerCase();
    const hasActiveVerb = ACTIVE_PEDAGOGICAL_VERBS.some((verb) => lowerDesc.includes(verb));
    if (!hasActiveVerb) {
      issues.push({
        ruleId: "PED_OBJ_ACTIVE_VERB",
        section: `tujuanPembelajaran[${i}]`,
        description: `Tujuan pembelajaran "${obj.id}" tidak menggunakan kata kerja operasional Kurikulum Merdeka yang jelas.`,
        severity: "MINOR",
      });
    }
  }

  // 2. Duplicate Detection
  const sectionJuduls = new Set<string>();
  for (let i = 0; i < output.sections.length; i++) {
    const title = output.sections[i].judul.trim().toLowerCase();
    if (sectionJuduls.has(title)) {
      issues.push({
        ruleId: "PED_DUPLICATE_SECTION",
        section: `sections[${i}]`,
        description: `Judul bab materi "${output.sections[i].judul}" terduplikasi dalam modul.`,
        severity: "CRITICAL",
      });
    }
    sectionJuduls.add(title);
  }

  const objectiveDescs = new Set<string>();
  for (let i = 0; i < output.tujuanPembelajaran.length; i++) {
    const desc = output.tujuanPembelajaran[i].deskripsi.trim().toLowerCase();
    if (objectiveDescs.has(desc)) {
      issues.push({
        ruleId: "PED_DUPLICATE_OBJECTIVE",
        section: `tujuanPembelajaran[${i}]`,
        description: `Deskripsi tujuan pembelajaran terduplikasi dalam modul.`,
        severity: "CRITICAL",
      });
    }
    objectiveDescs.add(desc);
  }

  // 3. Learning Phase Chronology & Time Distribution
  const pend = output.kegiatanPembelajaran?.pendahuluan;
  const inti = output.kegiatanPembelajaran?.inti;
  const pen = output.kegiatanPembelajaran?.penutup;

  if (pend && inti && pen) {
    if (pend.alokasiMenit && inti.alokasiMenit) {
      // Invariant: Inti must be longer than pendahuluan
      if (inti.alokasiMenit <= pend.alokasiMenit) {
        issues.push({
          ruleId: "PED_TIME_DISTRIBUTION",
          section: "kegiatanPembelajaran",
          description: `Alokasi waktu kegiatan inti (${inti.alokasiMenit}m) harus lebih besar dari kegiatan pendahuluan (${pend.alokasiMenit}m).`,
          severity: "MINOR",
        });
      }
    }

    if (pen.alokasiMenit && inti.alokasiMenit) {
      // Invariant: Inti must be longer than penutup
      if (inti.alokasiMenit <= pen.alokasiMenit) {
        issues.push({
          ruleId: "PED_TIME_DISTRIBUTION",
          section: "kegiatanPembelajaran",
          description: `Alokasi waktu kegiatan inti (${inti.alokasiMenit}m) harus lebih besar dari kegiatan penutup (${pen.alokasiMenit}m).`,
          severity: "MINOR",
        });
      }
    }
  }

  // 4. Curriculum Phase Alignment
  const classTingkat = context.academicContext.tingkat?.toUpperCase().trim();
  const isCompatibleWithTingkat =
    (output.fase === "F" && (classTingkat === "XI" || classTingkat === "XII")) ||
    (output.fase === "E" && classTingkat === "X");

  if (output.fase !== context.academicContext.targetFase && !isCompatibleWithTingkat) {
    issues.push({
      ruleId: "PED_FASE_MISMATCH",
      section: "fase",
      description: `Fase kurikulum yang dihasilkan (${output.fase}) tidak cocok dengan fase sasaran kelas (${context.academicContext.targetFase}).`,
      severity: "CRITICAL",
    });
  }

  // 5. Section Depth & Richness Check (Prevent shallow or empty sections)
  for (let i = 0; i < output.sections.length; i++) {
    const sec = output.sections[i];
    const text = (sec.isi || "").trim();
    const hasPoints = Array.isArray(sec.poin) && sec.poin.length > 0;
    if (text.length < 40 && !hasPoints && !text.includes("\n") && !text.includes("-")) {
      issues.push({
        ruleId: "PED_SHALLOW_SECTION",
        section: `sections[${i}]`,
        description: `Uraian materi bab "${sec.judul}" terlalu dangkal (< 40 karakter tanpa poin rincian).`,
        severity: "CRITICAL",
      });
    }
  }

  // 6. Learning Activity Completeness
  const totalActivities =
    (output.kegiatanPembelajaran?.pendahuluan?.aktivitas?.length || 0) +
    (output.kegiatanPembelajaran?.inti?.aktivitas?.length || 0) +
    (output.kegiatanPembelajaran?.penutup?.aktivitas?.length || 0);

  if (totalActivities === 0) {
    issues.push({
      ruleId: "PED_EMPTY_ACTIVITIES",
      section: "kegiatanPembelajaran",
      description: "Rencana kegiatan pembelajaran tidak memiliki rincian aktivitas (pendahuluan, inti, dan penutup kosong).",
      severity: "CRITICAL",
    });
  } else if (!output.kegiatanPembelajaran?.inti?.aktivitas || output.kegiatanPembelajaran.inti.aktivitas.length === 0) {
    issues.push({
      ruleId: "PED_EMPTY_INTI_ACTIVITY",
      section: "kegiatanPembelajaran.inti",
      description: "Kegiatan inti pembelajaran wajib memiliki minimal 1 butir langkah kegiatan operasional.",
      severity: "CRITICAL",
    });
  }

  return issues;
}

// ==============================================================================
// 6. QUALITY DECISION ENGINE
// ==============================================================================

export function evaluateQualityDecision(
  structuralIssues: StructuralValidationIssue[],
  groundingIssues: UnsupportedClaimIssue[],
  coverageResult: EvidenceCoverageResult,
  conflictIssues: SourceConflictValidationIssue[],
  pedagogicalIssues: PedagogicalValidationIssue[],
  options: QualityValidationOptions = {},
): ModulQualityDecision {
  const coverageThreshold = options.coverageThreshold ?? DEFAULT_COVERAGE_THRESHOLD;

  const criticalStructural = structuralIssues.filter((i) => i.severity === "CRITICAL").length;
  const criticalGrounding = groundingIssues.filter((i) => i.severity === "CRITICAL").length;
  const criticalConflicts = conflictIssues.filter((i) => i.severity === "CRITICAL").length;
  const criticalPedagogical = pedagogicalIssues.filter((i) => i.severity === "CRITICAL").length;

  // REJECT CONDITIONS
  // 1. Critical structural failures
  if (criticalStructural > 0) {
    return "REJECT";
  }

  // 2. Severe grounding failures (fabricated numbers, invented specs, dangling IDs)
  if (criticalGrounding > 0) {
    return "REJECT";
  }

  // 3. Unresolved critical conflicts across sources
  if (criticalConflicts > 0) {
    return "REJECT";
  }

  // 4. Critical pedagogical violations (duplicate sections, broken activities)
  if (criticalPedagogical > 0) {
    return "REJECT";
  }

  // 5. Unacceptably low evidence coverage (< 40%)
  if (coverageResult.coverageRatio < REJECT_COVERAGE_FLOOR) {
    return "REJECT";
  }

  // REVISE CONDITIONS
  // 1. Coverage is moderate (between floor and threshold)
  if (coverageResult.coverageRatio < coverageThreshold) {
    return "REVISE";
  }

  // 2. Minor issues exist that require revision
  const minorGrounding = groundingIssues.filter((i) => i.severity === "MINOR").length;
  const minorPedagogical = pedagogicalIssues.filter((i) => i.severity === "MINOR").length;

  if (options.strictMode && (minorGrounding > 0 || minorPedagogical > 0)) {
    return "REVISE";
  }

  // PASS: Structurally sound, grounded, sufficient coverage, pedagogically valid
  return "PASS";
}

// ==============================================================================
// 7. MAIN AI-2D QUALITY VALIDATION ENTRYPOINT
// ==============================================================================

/**
 * Validates a generated Modul Ajar against its Grounding Context and Source Material.
 *
 * Returns a deterministic, comprehensive quality decision: PASS | REVISE | REJECT.
 */
export function validateGeneratedModulAjar(
  output: unknown,
  context: ModulGroundingContext,
  options: QualityValidationOptions = {},
): ModulQualityValidationResult {
  const startTime = Date.now();
  const validationVersion = CANONICAL_QUALITY_VALIDATION_VERSION;

  // 1. Structural Validation
  const { issues: structuralIssues, parsedOutput } = validateStructuralIntegrity(output);

  // If output cannot even be parsed, return REJECT immediately
  if (!parsedOutput) {
    const durationMs = Date.now() - startTime;
    return {
      status: "REJECT",
      validationVersion,
      groundingStatus: "DEFECTIVE",
      evidenceCoverage: {
        coveredSections: [],
        uncoveredSections: ["all"],
        coverageRatio: 0,
        sectionDetails: {},
      },
      unsupportedClaims: [],
      sourceConflicts: [],
      pedagogicalIssues: [],
      structuralIssues,
      summary: {
        validationVersion,
        decision: "REJECT",
        validatedAt: new Date().toISOString(),
        coverageRatio: 0,
        issueCounts: {
          unsupportedClaims: 0,
          sourceConflicts: 0,
          pedagogicalIssues: 0,
          structuralIssues: structuralIssues.length,
        },
      },
      metadata: {
        durationMs,
        validatedAt: new Date().toISOString(),
        totalIssuesCount: structuralIssues.length,
        criticalIssuesCount: structuralIssues.filter((i) => i.severity === "CRITICAL").length,
        minorIssuesCount: 0,
      },
    };
  }

  // 2. Factual Grounding & Unsupported Claim Validation
  const unsupportedClaims = validateFactualGrounding(parsedOutput, context);

  // 3. Evidence Coverage Validation
  const evidenceCoverage = validateEvidenceCoverage(parsedOutput, context, options.coverageThreshold);

  // 4. Source Conflict Validation
  const sourceConflicts = detectSourceConflictsInOutput(parsedOutput, context);

  // 5. Pedagogical Coherence Validation
  const pedagogicalIssues = validatePedagogicalCoherence(parsedOutput, context);

  // 6. Quality Decision
  const status = evaluateQualityDecision(
    structuralIssues,
    unsupportedClaims,
    evidenceCoverage,
    sourceConflicts,
    pedagogicalIssues,
    options,
  );

  const durationMs = Date.now() - startTime;
  const criticalCount =
    structuralIssues.filter((i) => i.severity === "CRITICAL").length +
    unsupportedClaims.filter((i) => i.severity === "CRITICAL").length +
    sourceConflicts.filter((i) => i.severity === "CRITICAL").length +
    pedagogicalIssues.filter((i) => i.severity === "CRITICAL").length;

  const minorCount =
    structuralIssues.filter((i) => i.severity === "MINOR").length +
    unsupportedClaims.filter((i) => i.severity === "MINOR").length +
    sourceConflicts.filter((i) => i.severity === "MINOR").length +
    pedagogicalIssues.filter((i) => i.severity === "MINOR").length;

  const summary: ModulQualityValidationSummary = {
    validationVersion,
    decision: status,
    validatedAt: new Date().toISOString(),
    coverageRatio: evidenceCoverage.coverageRatio,
    issueCounts: {
      unsupportedClaims: unsupportedClaims.length,
      sourceConflicts: sourceConflicts.length,
      pedagogicalIssues: pedagogicalIssues.length,
      structuralIssues: structuralIssues.length,
    },
  };

  return {
    status,
    validationVersion,
    groundingStatus: criticalGroundingOrDangling(unsupportedClaims) ? "DEFECTIVE" : "VALID",
    evidenceCoverage,
    unsupportedClaims,
    sourceConflicts,
    pedagogicalIssues,
    structuralIssues,
    summary,
    metadata: {
      durationMs,
      validatedAt: summary.validatedAt,
      totalIssuesCount: criticalCount + minorCount,
      criticalIssuesCount: criticalCount,
      minorIssuesCount: minorCount,
    },
  };
}

function criticalGroundingOrDangling(claims: UnsupportedClaimIssue[]): boolean {
  return claims.some((c) => c.severity === "CRITICAL");
}
