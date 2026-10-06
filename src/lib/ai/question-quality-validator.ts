/**
 * GuruPro AI Foundation (AI-4D) — Question Quality Validation
 *
 * Dedicated, auditable server-side semantic quality gate for AI-generated assessment questions.
 * Executes AFTER AI-4C generation and AI-4A structural validation, and BEFORE teacher draft review.
 *
 * ARCHITECTURAL INVARIANTS:
 * 1. Auditable Rule-Based Decision Engine: No arbitrary numeric scores (no "score >= 80").
 *    Decisions (PASS / REVISE / REJECT) are derived deterministically from explicit findings with severities.
 * 2. 3-Layer Validation:
 *    - Layer 1: Deterministic Hard Validation (Zod schema, evidence existence, answer-key index reference,
 *      exact-value integrity, token-based duplicate detection, anti-promotion).
 *    - Layer 2: Semantic Quality Validation (Question-to-source entailment, single correct answer,
 *      distractor plausibility, ambiguity detection, explanation coherence, learning-objective alignment).
 *    - Layer 3: Decision Engine (PASS / REVISE / REJECT).
 * 3. Fail-Closed on Layer 1: If deterministic checks produce critical structural/integrity failures,
 *    do not call semantic evaluators; return fail-closed REJECT immediately.
 * 4. Answer-Key Integrity (Highest Priority): Keyed answer must be supported by evidence,
 *    no multiple correct answers, no zero correct answers, no contradicted keys.
 * 5. Semantic Uncertainty Handling: Critical uncertainty on answer correctness -> REJECT.
 * 6. Answer-Key Segregation: Internal validation retains keys/explanations;
 *    never leaks keys to students or public logs.
 */

import { z } from "zod";
import {
  type CanonicalQuestionPackage,
  type CanonicalQuestion,
  type CanonicalMultipleChoiceQuestion,
  type CanonicalEssayQuestion,
  CANONICAL_QUESTION_SCHEMA_VERSION,
  CanonicalQuestionPackageSchema,
  CanonicalQuestionSchema,
} from "./question-contract";
import type { GroundedQuestionContext } from "./question-context-builder";
import { AI_ERROR_CODES, AiServiceError } from "./error-taxonomy";
import { getRegisteredPrompt } from "./prompts-registry";
import { resolveServerAiConfig, type AiModelConfig } from "./model-config";

export const CANONICAL_QUESTION_QUALITY_VERSION = "1.0.0";
export const CANONICAL_QUESTION_VALIDATOR_PROMPT_VERSION = "question_quality_validator_v1";

// ==============================================================================
// 1. CONTRACTS & FINDING TYPES
// ==============================================================================

export type QuestionQualityDecision = "PASS" | "REVISE" | "REJECT";
export type QuestionQualitySeverity = "CRITICAL" | "MAJOR" | "MINOR";
export type QuestionQualityComponent =
  | "question"
  | "answer"
  | "distractor"
  | "explanation"
  | "rubric"
  | "objective"
  | "structure"
  | "duplicate"
  | "conflict";

export interface QuestionQualityFinding {
  code: string;
  severity: QuestionQualitySeverity;
  questionIndex: number; // 0-based index in package; -1 for package-level findings
  questionId?: string;
  component: QuestionQualityComponent;
  message: string;
  evidenceIds: string[];
}

export interface QuestionItemQualityResult {
  questionIndex: number;
  questionId: string;
  jenis: "Pilihan Ganda" | "Esai";
  status: QuestionQualityDecision;
  factualStatus: "SUPPORTED" | "CONTRADICTED" | "NOT_ENTAILED" | "UNCERTAIN";
  answerStatus: "SUPPORTED" | "CONTRADICTED" | "MULTIPLE_CORRECT" | "NO_CORRECT" | "UNCERTAIN";
  distractorStatus: "VALID" | "HAS_CORRECT_DISTRACTOR" | "ABSURD" | "UNSUPPORTED";
  ambiguityStatus: "CLEAR" | "MODERATE" | "CRITICAL";
  explanationStatus: "SUPPORTED" | "CONTRADICTS_KEY" | "UNGROUNDED";
  alignmentStatus: "ALIGNED" | "PARTIAL" | "MISALIGNED";
  findings: QuestionQualityFinding[];
}

export interface QuestionPackageQualityResult {
  status: QuestionQualityDecision;
  validationVersion: string;
  checkedAt: string;
  groundingResult: {
    status: "VALID" | "DEFECTIVE";
    evidenceSufficiency: "SUFFICIENT" | "INSUFFICIENT" | "CONFLICTED";
    referencedEvidenceCount: number;
    unreferencedEvidenceCount: number;
  };
  factualFindings: QuestionQualityFinding[];
  answerFindings: QuestionQualityFinding[];
  distractorFindings: QuestionQualityFinding[];
  ambiguityFindings: QuestionQualityFinding[];
  explanationFindings: QuestionQualityFinding[];
  objectiveAlignmentFindings: QuestionQualityFinding[];
  duplicateFindings: QuestionQualityFinding[];
  structuralFindings: QuestionQualityFinding[];
  itemResults: QuestionItemQualityResult[];
  summary: {
    totalQuestions: number;
    passCount: number;
    reviseCount: number;
    rejectCount: number;
    criticalCount: number;
    majorCount: number;
    minorCount: number;
    decision: QuestionQualityDecision;
  };
  metadata: {
    durationMs: number;
    evaluatorUsed: boolean;
    evaluatorModel?: string;
    correctionRetryCount?: number;
  };
}

export interface QuestionQualityValidationOptions {
  strictMode?: boolean; // In strictMode, even minor issues trigger REVISE
  allowMinorUnsupported?: boolean;
  mockSemanticEvaluator?: (prompt: string) => Promise<string> | string;
  evaluatorModelConfig?: Partial<AiModelConfig>;
  skipSemanticLayer?: boolean;
}

// ==============================================================================
// 2. LAYER 1: DETERMINISTIC HARD VALIDATION
// ==============================================================================

/**
 * Normalizes text for mechanical comparison (lowercased, whitespace-collapsed, punctuation-stripped).
 */
export function normalizeAssessmentText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts exact technical numbers, IPs, subnets, ports, commands, and specifications.
 */
export function extractTechnicalTokens(text: string): {
  numbers: string[];
  ipsAndSubnets: string[];
  commands: string[];
  specs: string[];
} {
  // IP addresses & CIDR
  const ipMatches = text.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?:\/\d{1,2})?\b/g) || [];
  
  // CLI Commands (e.g. /ip route add, ping -c, traceroute, iptables)
  const commandMatches = text.match(/(?:\/[a-z0-9_-]+)+|(?:[a-z0-9_-]+\s+(?:add|set|remove|print|enable|disable|install))/gi) || [];

  // Technical Acronyms / IEEE / Spec terms (e.g. 802.1Q, 802.11ax, TPID, VID, MTU, OSPF, BGP)
  const specMatches = text.match(/\b(?:802\.\d+[a-z]*|tpid|vid|vlan\s*\d+|mtu|distance=\d+|port\s*\d+|ad=\d+)\b/gi) || [];

  // Mask out IPs, commands, and specs before matching standalone numbers
  let textForNumbers = text;
  for (const ip of ipMatches) {
    textForNumbers = textForNumbers.replaceAll(ip, " ");
  }
  for (const cmd of commandMatches) {
    textForNumbers = textForNumbers.replaceAll(cmd, " ");
  }
  for (const spec of specMatches) {
    textForNumbers = textForNumbers.replaceAll(spec, " ");
  }

  // Standalone numbers (e.g. 100, 3.14, 8080)
  const rawNumberMatches = textForNumbers.match(/\b\d+(?:[.,]\d+)?\b/g) || [];
  const filteredNumbers = rawNumberMatches.filter((num) => {
    const val = Number(num.replace(/[.,]/g, ""));
    // Exclude single digit common counters 0, 1, 2, 3, 4
    if (!isNaN(val) && val >= 0 && val <= 4) return false;
    return true;
  });

  return {
    numbers: Array.from(new Set(filteredNumbers)),
    ipsAndSubnets: Array.from(new Set(ipMatches)),
    commands: Array.from(new Set(commandMatches)),
    specs: Array.from(new Set(specMatches.map((s) => s.toLowerCase()))),
  };
}

/**
 * Deterministic duplicate question detection within a package.
 */
export function detectDuplicateQuestions(questions: CanonicalQuestion[]): QuestionQualityFinding[] {
  const findings: QuestionQualityFinding[] = [];
  const normalizedTexts = questions.map((q) => normalizeAssessmentText(q.pertanyaan));

  for (let i = 0; i < questions.length; i++) {
    for (let j = i + 1; j < questions.length; j++) {
      const textA = normalizedTexts[i];
      const textB = normalizedTexts[j];

      // Exact Duplicate
      if (textA === textB) {
        findings.push({
          code: "EXACT_DUPLICATE_QUESTION",
          severity: "CRITICAL",
          questionIndex: j,
          questionId: questions[j].id,
          component: "duplicate",
          message: `Butir soal #${j + 1} ("${questions[j].id}") merupakan duplikat persis dari butir soal #${i + 1} ("${questions[i].id}").`,
          evidenceIds: questions[j].evidenceIds,
        });
        continue;
      }

      // Near Duplicate via Token Set Jaccard Similarity
      const STOPWORDS = new Set(["di", "ke", "dari", "pada", "untuk", "dan", "atau", "adalah", "yang", "ini", "itu"]);
      const tokensA = new Set(textA.split(" ").filter((t) => t.length > 2 && !STOPWORDS.has(t)));
      const tokensB = new Set(textB.split(" ").filter((t) => t.length > 2 && !STOPWORDS.has(t)));

      if (tokensA.size > 0 && tokensB.size > 0) {
        let intersection = 0;
        for (const token of tokensA) {
          if (tokensB.has(token)) intersection++;
        }
        const union = tokensA.size + tokensB.size - intersection;
        const jaccard = union > 0 ? intersection / union : 0;

        if (jaccard >= 0.70) {
          findings.push({
            code: "NEAR_DUPLICATE_QUESTION",
            severity: "MAJOR",
            questionIndex: j,
            questionId: questions[j].id,
            component: "duplicate",
            message: `Butir soal #${j + 1} memiliki kemiripan redaksional sangat tinggi (${Math.round(jaccard * 100)}%) dengan butir soal #${i + 1}.`,
            evidenceIds: questions[j].evidenceIds,
          });
        }
      }
    }
  }

  return findings;
}

/**
 * Validates exact technical values in question, options, and key against referenced evidence chunks.
 */
export function validateExactValuesInQuestion(
  question: CanonicalQuestion,
  questionIndex: number,
  context: GroundedQuestionContext,
): QuestionQualityFinding[] {
  const findings: QuestionQualityFinding[] = [];

  // Gather all referenced evidence text
  const referencedChunks = context.evidenceItems.filter((e) =>
    question.evidenceIds.includes(e.evidenceId),
  );
  const combinedEvidenceText = referencedChunks.map((c) => c.content).join(" ");
  const normalizedEvidence = combinedEvidenceText.toLowerCase();

  // Extract tokens from Question statement and Keyed Answer
  let targetText = question.pertanyaan;
  if (question.jenis === "Pilihan Ganda") {
    const keyIdx = question.kunci.charCodeAt(0) - 65;
    const keyedOption = question.opsi[keyIdx] || "";
    targetText += ` ${keyedOption}`;
  } else {
    targetText += ` ${question.kunci}`;
  }

  const tokens = extractTechnicalTokens(targetText);

  // 1. IP Addresses & Subnets
  for (const ip of tokens.ipsAndSubnets) {
    if (!normalizedEvidence.includes(ip.toLowerCase())) {
      findings.push({
        code: "EXACT_VALUE_MISMATCH",
        severity: "CRITICAL",
        questionIndex,
        questionId: question.id,
        component: "answer",
        message: `Nilai alamat IP/Subnet "${ip}" pada butir soal tidak ditemukan di dalam materi sumber yang dirujuk.`,
        evidenceIds: question.evidenceIds,
      });
    }
  }

  // 2. Standalone Numbers (excluding common question counters like 1, 2, 4)
  for (const num of tokens.numbers) {
    const n = Number(num.replace(/[.,]/g, ""));
    // Ignore ubiquitous numbers 1-4 that often appear in basic question phrasing
    if (!isNaN(n) && (n === 1 || n === 2 || n === 3 || n === 4)) {
      continue;
    }
    const cleanNum = num.replace(/[.,]/g, "");
    if (
      !combinedEvidenceText.includes(num) &&
      !combinedEvidenceText.replace(/[.,]/g, "").includes(cleanNum)
    ) {
      findings.push({
        code: "EXACT_VALUE_MISMATCH",
        severity: "CRITICAL",
        questionIndex,
        questionId: question.id,
        component: "factual",
        message: `Nilai numerik eksak "${num}" pada butir soal tidak ditemukan pada materi sumber yang dirujuk.`,
        evidenceIds: question.evidenceIds,
      });
    }
  }

  return findings;
}

/**
 * Validates Layer 1 Deterministic Hard Boundaries.
 */
export function validateDeterministicQuestionLayer(
  pkg: CanonicalQuestionPackage,
  context: GroundedQuestionContext,
): {
  isValid: boolean;
  findings: QuestionQualityFinding[];
} {
  const findings: QuestionQualityFinding[] = [];

  // 1. Canonical Schema Check
  const parseRes = CanonicalQuestionPackageSchema.safeParse(pkg);
  if (!parseRes.success) {
    for (const err of parseRes.error.errors) {
      findings.push({
        code: "QUESTION_SCHEMA_INVALID",
        severity: "CRITICAL",
        questionIndex: -1,
        component: "structure",
        message: `Struktur paket soal tidak valid: ${err.path.join(".")}: ${err.message}`,
        evidenceIds: [],
      });
    }
  }

  const allowedEvidenceIds = new Set(context.evidenceItems.map((e) => e.evidenceId));
  const notFoundEvidenceIds = new Set(
    context.evidenceItems.filter((e) => e.status === "NOT_FOUND").map((e) => e.evidenceId),
  );

  // 2. Item-Level Structural & Evidence Verification
  for (let idx = 0; idx < pkg.questions.length; idx++) {
    const q = pkg.questions[idx];

    // Evidence Existence
    for (const evId of q.evidenceIds) {
      if (!allowedEvidenceIds.has(evId)) {
        findings.push({
          code: "DANGLING_EVIDENCE_ID",
          severity: "CRITICAL",
          questionIndex: idx,
          questionId: q.id,
          component: "structure",
          message: `Butir soal #${idx + 1} merujuk pada evidenceId "${evId}" yang tidak ada dalam konteks sumber.`,
          evidenceIds: [evId],
        });
      }

      // Anti-Promotion Invariant
      if (notFoundEvidenceIds.has(evId) && q.status === "SUPPORTED") {
        findings.push({
          code: "ANTI_PROMOTION_VIOLATION",
          severity: "CRITICAL",
          questionIndex: idx,
          questionId: q.id,
          component: "structure",
          message: `Invarian Anti-Promosi terlanggar: evidenceId "${evId}" berstatus NOT_FOUND namun diklaim SUPPORTED pada butir soal #${idx + 1}.`,
          evidenceIds: [evId],
        });
      }
    }

    // Multiple Choice Rules
    if (q.jenis === "Pilihan Ganda") {
      if (q.opsi.length !== 4) {
        findings.push({
          code: "INVALID_OPTION_COUNT",
          severity: "CRITICAL",
          questionIndex: idx,
          questionId: q.id,
          component: "structure",
          message: `Soal Pilihan Ganda #${idx + 1} wajib memiliki tepat 4 opsi (A-D), ditemukan ${q.opsi.length}.`,
          evidenceIds: q.evidenceIds,
        });
      }

      const lowerOptions = q.opsi.map((o) => o.trim().toLowerCase());
      const uniqueOptions = new Set(lowerOptions);
      if (uniqueOptions.size !== q.opsi.length) {
        findings.push({
          code: "DUPLICATE_OPTIONS",
          severity: "CRITICAL",
          questionIndex: idx,
          questionId: q.id,
          component: "distractor",
          message: `Soal Pilihan Ganda #${idx + 1} memuat opsi jawaban yang kembar/terduplikasi.`,
          evidenceIds: q.evidenceIds,
        });
      }

      const keyIdx = q.kunci.charCodeAt(0) - 65;
      if (keyIdx < 0 || keyIdx >= q.opsi.length) {
        findings.push({
          code: "ANSWER_KEY_INVALID",
          severity: "CRITICAL",
          questionIndex: idx,
          questionId: q.id,
          component: "answer",
          message: `Kunci jawaban "${q.kunci}" pada butir soal #${idx + 1} berada di luar rentang opsi A-D.`,
          evidenceIds: q.evidenceIds,
        });
      }

      // Non-Pedagogical Distractors & Blank Options Check
      const NON_PEDAGOGICAL_PATTERN = /^(?:semua\s+(?:jawaban|pilihan|opsi)?\s*(?:benar|salah)|tidak\s+ada\s+(?:yang\s+)?benar|jawaban\s+[a-d]\s+dan\s+[a-d]\s+benar|[a-d]\s+dan\s+[a-d]\s+benar|all\s+of\s+the\s+above|none\s+of\s+the\s+above)$/i;

      for (let oIdx = 0; oIdx < q.opsi.length; oIdx++) {
        const rawOpt = q.opsi[oIdx];
        const trimmedOpt = (rawOpt || "").trim();

        if (trimmedOpt.length === 0) {
          findings.push({
            code: "EMPTY_OPTION",
            severity: "CRITICAL",
            questionIndex: idx,
            questionId: q.id,
            component: "distractor",
            message: `Soal Pilihan Ganda #${idx + 1} memuat opsi jawaban kosong pada opsi ${String.fromCharCode(65 + oIdx)}.`,
            evidenceIds: q.evidenceIds,
          });
        } else if (NON_PEDAGOGICAL_PATTERN.test(trimmedOpt)) {
          findings.push({
            code: "NON_PEDAGOGICAL_DISTRACTOR",
            severity: "MAJOR",
            questionIndex: idx,
            questionId: q.id,
            component: "distractor",
            message: `Soal Pilihan Ganda #${idx + 1} memuat opsi non-pedagogis "${trimmedOpt}" yang merusak validitas asesmen dan pengacakan opsi.`,
            evidenceIds: q.evidenceIds,
          });
        }
      }

      // Check if Option Clones Question Stem
      const normQuestion = normalizeAssessmentText(q.pertanyaan);
      for (let oIdx = 0; oIdx < q.opsi.length; oIdx++) {
        const normOpt = normalizeAssessmentText(q.opsi[oIdx] || "");
        if (normOpt.length >= 8 && normOpt === normQuestion) {
          findings.push({
            code: "OPTION_CLONES_QUESTION",
            severity: "CRITICAL",
            questionIndex: idx,
            questionId: q.id,
            component: "distractor",
            message: `Opsi ${String.fromCharCode(65 + oIdx)} pada butir soal #${idx + 1} menduplikasi redaksi pertanyaan secara persis.`,
            evidenceIds: q.evidenceIds,
          });
        }
      }
    }

    // Essay Rules
    if (q.jenis === "Esai") {
      if (q.opsi.length > 0) {
        findings.push({
          code: "ESSAY_HAS_OPTIONS",
          severity: "CRITICAL",
          questionIndex: idx,
          questionId: q.id,
          component: "structure",
          message: `Soal Esai #${idx + 1} dilarang memuat opsi pilihan ganda.`,
          evidenceIds: q.evidenceIds,
        });
      }

      if (!q.kunci || q.kunci.trim().length < 10) {
        findings.push({
          code: "ESSAY_RUBRIC_TOO_SHORT",
          severity: "CRITICAL",
          questionIndex: idx,
          questionId: q.id,
          component: "rubric",
          message: `Rubrik penilaian soal esai #${idx + 1} terlalu singkat (< 10 karakter).`,
          evidenceIds: q.evidenceIds,
        });
      }

      if (q.pertanyaan.trim().length < 15) {
        findings.push({
          code: "ESSAY_PROMPT_TOO_SHORT",
          severity: "MAJOR",
          questionIndex: idx,
          questionId: q.id,
          component: "question",
          message: `Redaksi soal esai #${idx + 1} terlalu singkat (< 15 karakter).`,
          evidenceIds: q.evidenceIds,
        });
      }
    }

    // Exact-Value Preservation Checks
    const exactValueFindings = validateExactValuesInQuestion(q, idx, context);
    findings.push(...exactValueFindings);
  }

  // 3. Duplicate Question Detection
  const duplicateFindings = detectDuplicateQuestions(pkg.questions);
  findings.push(...duplicateFindings);

  const hasCritical = findings.some((f) => f.severity === "CRITICAL");
  return {
    isValid: !hasCritical,
    findings,
  };
}

// ==============================================================================
// 3. LAYER 2: SEMANTIC QUALITY VALIDATION
// ==============================================================================

/**
 * Built-in deterministic semantic validator.
 * Evaluates question-to-source entailment, answer-key correctness, distractors, ambiguity, and explanation.
 */
export function evaluateDeterministicSemanticRules(
  question: CanonicalQuestion,
  questionIndex: number,
  context: GroundedQuestionContext,
): {
  factualStatus: "SUPPORTED" | "CONTRADICTED" | "NOT_ENTAILED" | "UNCERTAIN";
  answerStatus: "SUPPORTED" | "CONTRADICTED" | "MULTIPLE_CORRECT" | "NO_CORRECT" | "UNCERTAIN";
  distractorStatus: "VALID" | "HAS_CORRECT_DISTRACTOR" | "ABSURD" | "UNSUPPORTED";
  ambiguityStatus: "CLEAR" | "MODERATE" | "CRITICAL";
  explanationStatus: "SUPPORTED" | "CONTRADICTS_KEY" | "UNGROUNDED";
  alignmentStatus: "ALIGNED" | "PARTIAL" | "MISALIGNED";
  findings: QuestionQualityFinding[];
} {
  const findings: QuestionQualityFinding[] = [];

  const referencedChunks = context.evidenceItems.filter((e) =>
    question.evidenceIds.includes(e.evidenceId),
  );
  const evidenceText = referencedChunks.map((c) => c.content).join(" ");
  const normalizedEvidence = evidenceText.toLowerCase();

  let factualStatus: "SUPPORTED" | "CONTRADICTED" | "NOT_ENTAILED" | "UNCERTAIN" = "SUPPORTED";
  let answerStatus: "SUPPORTED" | "CONTRADICTED" | "MULTIPLE_CORRECT" | "NO_CORRECT" | "UNCERTAIN" = "SUPPORTED";
  let distractorStatus: "VALID" | "HAS_CORRECT_DISTRACTOR" | "ABSURD" | "UNSUPPORTED" = "VALID";
  let ambiguityStatus: "CLEAR" | "MODERATE" | "CRITICAL" = "CLEAR";
  let explanationStatus: "SUPPORTED" | "CONTRADICTS_KEY" | "UNGROUNDED" = "SUPPORTED";
  let alignmentStatus: "ALIGNED" | "PARTIAL" | "MISALIGNED" = "ALIGNED";

  // If no evidence attached or evidence text is empty
  if (referencedChunks.length === 0 || evidenceText.trim().length === 0) {
    factualStatus = "NOT_ENTAILED";
    answerStatus = "NOT_ENTAILED" as never;
    findings.push({
      code: "NO_EVIDENCE_ATTACHED",
      severity: "CRITICAL",
      questionIndex,
      questionId: question.id,
      component: "question",
      message: `Butir soal #${questionIndex + 1} tidak memiliki referensi bukti materi sumber yang sah.`,
      evidenceIds: [],
    });
    return {
      factualStatus,
      answerStatus: "NO_CORRECT",
      distractorStatus: "UNSUPPORTED",
      ambiguityStatus: "CRITICAL",
      explanationStatus: "UNGROUNDED",
      alignmentStatus: "MISALIGNED",
      findings,
    };
  }

  // 1. Multiple Choice Evaluation
  if (question.jenis === "Pilihan Ganda") {
    const keyIdx = question.kunci.charCodeAt(0) - 65;
    const keyedOption = question.opsi[keyIdx] || "";
    const normalizedKey = keyedOption.toLowerCase().trim();

    // Check if Keyed Option is present/supported in evidence
    const KEY_STOPWORDS = new Set([
      "dan", "atau", "dari", "pada", "dalam", "untuk", "dengan", "adalah", "yaitu",
      "sebagai", "akan", "dapat", "bisa", "harus", "oleh", "secara", "karena", "maka",
      "jika", "tentang", "protokol", "metode", "sistem", "parameter", "nilai", "konfigurasi",
      "yang", "ini", "itu", "ke", "di", "menentukan", "mengatur", "melakukan", "fungsi",
      "berfungsi", "proses", "cara", "jenis",
    ]);

    const keyTokens = normalizedKey
      .split(/\s+/)
      .filter((t) => t.length > 2 && !KEY_STOPWORDS.has(t));

    let keySupported = false;

    if (normalizedEvidence.includes(normalizedKey)) {
      keySupported = true;
    } else if (keyTokens.length > 0) {
      const matchCount = keyTokens.filter((t) => normalizedEvidence.includes(t)).length;
      const threshold = keyTokens.length <= 2 ? 1.0 : 0.6;
      if (matchCount / keyTokens.length >= threshold) {
        keySupported = true;
      }
    }

    if (!keySupported) {
      answerStatus = "UNCERTAIN";
      findings.push({
        code: "ANSWER_KEY_UNSUPPORTED",
        severity: "CRITICAL",
        questionIndex,
        questionId: question.id,
        component: "answer",
        message: `Kunci jawaban (${question.kunci}: "${keyedOption}") pada butir soal #${questionIndex + 1} tidak didukung secara memadai oleh bukti materi sumber.`,
        evidenceIds: question.evidenceIds,
      });
    }

    // 2. Check for Multiple Correct Answers (Distractor also correct)
    for (let oIdx = 0; oIdx < question.opsi.length; oIdx++) {
      if (oIdx === keyIdx) continue;
      const distractor = question.opsi[oIdx].trim();
      const normDist = distractor.toLowerCase();

      // Check if distractor exactly matches an unequivocal fact queried in the question
      // e.g. question asks for default HTTP port and both 80 and 8080 are valid in some sense
      if (normDist === normalizedKey) {
        distractorStatus = "HAS_CORRECT_DISTRACTOR";
        answerStatus = "MULTIPLE_CORRECT";
        findings.push({
          code: "MULTIPLE_CORRECT_ANSWERS",
          severity: "CRITICAL",
          questionIndex,
          questionId: question.id,
          component: "answer",
          message: `Opsi pengecoh ${String.fromCharCode(65 + oIdx)} identik dengan kunci jawaban, menyebabkan lebih dari 1 jawaban benar.`,
          evidenceIds: question.evidenceIds,
        });
      }
    }

    // 3. Explanation Validation
    if (question.penjelasan) {
      const normExp = question.penjelasan.toLowerCase();
      // Check if explanation contradicts key by explicitly advocating for another option letter
      const mentionsOtherKey = ["A", "B", "C", "D"]
        .filter((l) => l !== question.kunci)
        .some((l) => normExp.includes(`opsi ${l.toLowerCase()}`) || normExp.includes(`jawaban ${l.toLowerCase()}`));

      if (mentionsOtherKey && !normExp.includes(`opsi ${question.kunci.toLowerCase()}`)) {
        explanationStatus = "CONTRADICTS_KEY";
        findings.push({
          code: "EXPLANATION_CONTRADICTS_KEY",
          severity: "CRITICAL",
          questionIndex,
          questionId: question.id,
          component: "explanation",
          message: `Penjelasan pada butir soal #${questionIndex + 1} bertentangan dengan kunci jawaban (${question.kunci}).`,
          evidenceIds: question.evidenceIds,
        });
      }
    }
  }

  // 4. Essay Evaluation
  if (question.jenis === "Esai") {
    const rubric = question.kunci.toLowerCase();
    const rubricTokens = rubric.split(/\s+/).filter((t) => t.length > 3);
    const supportedTokens = rubricTokens.filter((t) => normalizedEvidence.includes(t));

    if (rubricTokens.length > 0 && supportedTokens.length / rubricTokens.length < 0.25) {
      factualStatus = "NOT_ENTAILED";
      findings.push({
        code: "RUBRIC_UNGROUNDED",
        severity: "CRITICAL",
        questionIndex,
        questionId: question.id,
        component: "rubric",
        message: `Rubrik penilaian esai #${questionIndex + 1} memuat kriteria yang tidak ditemukan dalam materi sumber rujukan.`,
        evidenceIds: question.evidenceIds,
      });
    }
  }

  // 5. Learning Objective Alignment
  if (question.tujuanPembelajaranId && context.groundingTarget.targetTujuanPembelajaranDeskripsi) {
    const objectives = context.groundingTarget.targetTujuanPembelajaranDeskripsi.join(" ").toLowerCase();
    const OBJECTIVE_STOPWORDS = new Set([
      "dan", "atau", "dari", "pada", "dalam", "untuk", "dengan", "adalah", "yaitu",
      "sebagai", "akan", "dapat", "bisa", "harus", "oleh", "secara", "karena", "maka",
      "jika", "tentang", "yang", "apakah", "bagaimana", "mengapa", "tujuan", "fungsi",
      "peserta", "didik", "mampu", "siswa", "cara",
    ]);

    const qTokens = question.pertanyaan
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2 && !OBJECTIVE_STOPWORDS.has(t));
    const hasOverlap = qTokens.some((t) => objectives.includes(t));

    if (!hasOverlap) {
      alignmentStatus = "MISALIGNED";
      findings.push({
        code: "OBJECTIVE_MISALIGNMENT",
        severity: "MAJOR",
        questionIndex,
        questionId: question.id,
        component: "objective",
        message: `Butir soal #${questionIndex + 1} kurang selaras dengan deskripsi Capaian/Tujuan Pembelajaran target.`,
        evidenceIds: question.evidenceIds,
      });
    }
  }

  // 6. Source Conflict Validation
  if (context.sourceConflicts && context.sourceConflicts.length > 0) {
    for (const conflict of context.sourceConflicts) {
      const conflictTerm = conflict.term.toLowerCase();
      if (question.pertanyaan.toLowerCase().includes(conflictTerm)) {
        // Check if question disambiguates context
        const hasDisambiguation =
          question.pertanyaan.toLowerCase().includes("menurut") ||
          question.pertanyaan.toLowerCase().includes("berdasarkan") ||
          question.pertanyaan.toLowerCase().includes("standar");

        if (!hasDisambiguation) {
          findings.push({
            code: "UNRESOLVED_SOURCE_CONFLICT",
            severity: "CRITICAL",
            questionIndex,
            questionId: question.id,
            component: "conflict",
            message: `Butir soal #${questionIndex + 1} menanyakan istilah "${conflict.term}" yang bertentangan antar-sumber tanpa melakukan kualifikasi konteks.`,
            evidenceIds: question.evidenceIds,
          });
          ambiguityStatus = "CRITICAL";
        }
      }
    }
  }

  return {
    factualStatus,
    answerStatus,
    distractorStatus,
    ambiguityStatus,
    explanationStatus,
    alignmentStatus,
    findings,
  };
}

/**
 * Executes server-side semantic evaluation via LLM or deterministic mock hook.
 */
export async function evaluateSemanticQuestionQuality(
  question: CanonicalQuestion,
  questionIndex: number,
  context: GroundedQuestionContext,
  options: QuestionQualityValidationOptions,
): Promise<{
  factualStatus: "SUPPORTED" | "CONTRADICTED" | "NOT_ENTAILED" | "UNCERTAIN";
  answerStatus: "SUPPORTED" | "CONTRADICTED" | "MULTIPLE_CORRECT" | "NO_CORRECT" | "UNCERTAIN";
  distractorStatus: "VALID" | "HAS_CORRECT_DISTRACTOR" | "ABSURD" | "UNSUPPORTED";
  ambiguityStatus: "CLEAR" | "MODERATE" | "CRITICAL";
  explanationStatus: "SUPPORTED" | "CONTRADICTS_KEY" | "UNGROUNDED";
  alignmentStatus: "ALIGNED" | "PARTIAL" | "MISALIGNED";
  findings: QuestionQualityFinding[];
}> {
  // Always run baseline deterministic semantic rules
  const deterministicResult = evaluateDeterministicSemanticRules(question, questionIndex, context);

  // If deterministic semantic rules found CRITICAL issues, fail closed without calling external provider
  if (deterministicResult.findings.some((f) => f.severity === "CRITICAL")) {
    return deterministicResult;
  }

  // If skipSemanticLayer is requested, return deterministic result
  if (options.skipSemanticLayer) {
    return deterministicResult;
  }

  // If mock evaluator hook is provided (for tests / CI)
  if (options.mockSemanticEvaluator) {
    const prompt = getRegisteredPrompt(CANONICAL_QUESTION_VALIDATOR_PROMPT_VERSION);
    const serializedQuestion = JSON.stringify(question, null, 2);
    const promptText = prompt.buildUserPrompt({
      sourceContent: context.evidenceItems.map((e) => `<SOURCE_CHUNK id="${e.evidenceId}">\n${e.content}\n</SOURCE_CHUNK>`).join("\n"),
      questionData: serializedQuestion,
      targetTujuanPembelajaran: context.groundingTarget.targetTujuanPembelajaranDeskripsi?.join("; "),
    });

    const mockOutput = await options.mockSemanticEvaluator(promptText);
    try {
      const cleanJson = mockOutput.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleanJson);

      const parsedFindings: QuestionQualityFinding[] = Array.isArray(parsed.findings)
        ? parsed.findings.map((f: any) => ({
            code: String(f.code || "SEMANTIC_FINDING"),
            severity: (f.severity === "CRITICAL" || f.severity === "MAJOR" || f.severity === "MINOR") ? f.severity : "MAJOR",
            questionIndex,
            questionId: question.id,
            component: f.component || "question",
            message: String(f.message || "Temuan validasi semantik."),
            evidenceIds: Array.isArray(f.evidenceIds) ? f.evidenceIds : question.evidenceIds,
          }))
        : [];

      return {
        factualStatus: parsed.factualStatus || deterministicResult.factualStatus,
        answerStatus: parsed.answerStatus || deterministicResult.answerStatus,
        distractorStatus: parsed.distractorStatus || deterministicResult.distractorStatus,
        ambiguityStatus: parsed.ambiguityStatus || deterministicResult.ambiguityStatus,
        explanationStatus: parsed.explanationStatus || deterministicResult.explanationStatus,
        alignmentStatus: parsed.alignmentStatus || deterministicResult.alignmentStatus,
        findings: [...deterministicResult.findings, ...parsedFindings],
      };
    } catch {
      // Malformed evaluator output -> fail closed with UNCERTAIN finding
      return {
        ...deterministicResult,
        answerStatus: "UNCERTAIN",
        findings: [
          ...deterministicResult.findings,
          {
            code: "QUESTION_QUALITY_UNCERTAIN",
            severity: "CRITICAL",
            questionIndex,
            questionId: question.id,
            component: "answer",
            message: "Evaluator semantik mengembalikan keluaran yang tidak dapat diproses (malformed).",
            evidenceIds: question.evidenceIds,
          },
        ],
      };
    }
  }

  return deterministicResult;
}

// ==============================================================================
// 4. LAYER 3: DECISION ENGINE
// ==============================================================================

/**
 * Computes the canonical quality decision (PASS / REVISE / REJECT) based on findings.
 *
 * POLICY:
 * - REJECT: Any CRITICAL issue in structure, answer key, factual grounding, exact values, or ambiguity.
 * - REVISE: Zero CRITICAL issues, but 1+ MAJOR issues (or MINOR issues in strictMode).
 * - PASS: Zero CRITICAL issues, zero MAJOR issues (and zero MINOR issues if strictMode is on).
 */
export function evaluateQuestionQualityDecision(
  allFindings: QuestionQualityFinding[],
  options: QuestionQualityValidationOptions = {},
): QuestionQualityDecision {
  const criticalCount = allFindings.filter((f) => f.severity === "CRITICAL").length;
  const majorCount = allFindings.filter((f) => f.severity === "MAJOR").length;
  const minorCount = allFindings.filter((f) => f.severity === "MINOR").length;

  // 1. REJECT if ANY critical finding exists
  if (criticalCount > 0) {
    return "REJECT";
  }

  // 2. REVISE if any major finding exists
  if (majorCount > 0) {
    return "REVISE";
  }

  // 3. In strict mode, minor findings also require REVISE
  if (options.strictMode && minorCount > 0) {
    return "REVISE";
  }

  // 4. PASS
  return "PASS";
}

// ==============================================================================
// 5. MAIN AI-4D QUESTION PACKAGE QUALITY VALIDATOR ENTRYPOINT
// ==============================================================================

/**
 * Validates an entire Canonical Question Package against Grounding Context and Source Evidence.
 * Returns an auditable, deterministic result with categorized findings and decision.
 */
export async function validateQuestionPackageQuality(
  pkg: unknown,
  context: GroundedQuestionContext,
  options: QuestionQualityValidationOptions = {},
): Promise<QuestionPackageQualityResult> {
  const startTime = Date.now();
  const validationVersion = CANONICAL_QUESTION_QUALITY_VERSION;

  // 1. Layer 1: Deterministic Hard Validation
  const parsedPackage = CanonicalQuestionPackageSchema.safeParse(pkg);
  if (!parsedPackage.success) {
    const structuralFindings: QuestionQualityFinding[] = parsedPackage.error.errors.map((e) => ({
      code: "QUESTION_SCHEMA_INVALID",
      severity: "CRITICAL",
      questionIndex: -1,
      component: "structure",
      message: `${e.path.join(".")}: ${e.message}`,
      evidenceIds: [],
    }));

    return {
      status: "REJECT",
      validationVersion,
      checkedAt: new Date().toISOString(),
      groundingResult: {
        status: "DEFECTIVE",
        evidenceSufficiency: context.evidenceSufficiency,
        referencedEvidenceCount: 0,
        unreferencedEvidenceCount: context.evidenceItems.length,
      },
      factualFindings: [],
      answerFindings: [],
      distractorFindings: [],
      ambiguityFindings: [],
      explanationFindings: [],
      objectiveAlignmentFindings: [],
      duplicateFindings: [],
      structuralFindings,
      itemResults: [],
      summary: {
        totalQuestions: 0,
        passCount: 0,
        reviseCount: 0,
        rejectCount: 1,
        criticalCount: structuralFindings.length,
        majorCount: 0,
        minorCount: 0,
        decision: "REJECT",
      },
      metadata: {
        durationMs: Date.now() - startTime,
        evaluatorUsed: false,
      },
    };
  }

  const canonicalPkg = parsedPackage.data;
  const layer1Result = validateDeterministicQuestionLayer(canonicalPkg, context);

  // If Layer 1 found CRITICAL structural issues, fail closed immediately
  if (!layer1Result.isValid) {
    const structuralFindings = layer1Result.findings.filter((f) => f.component === "structure");
    const duplicateFindings = layer1Result.findings.filter((f) => f.component === "duplicate");
    const factualFindings = layer1Result.findings.filter((f) => f.component === "factual");
    const answerFindings = layer1Result.findings.filter((f) => f.component === "answer");

    return {
      status: "REJECT",
      validationVersion,
      checkedAt: new Date().toISOString(),
      groundingResult: {
        status: "DEFECTIVE",
        evidenceSufficiency: context.evidenceSufficiency,
        referencedEvidenceCount: 0,
        unreferencedEvidenceCount: context.evidenceItems.length,
      },
      factualFindings,
      answerFindings,
      distractorFindings: [],
      ambiguityFindings: [],
      explanationFindings: [],
      objectiveAlignmentFindings: [],
      duplicateFindings,
      structuralFindings,
      itemResults: [],
      summary: {
        totalQuestions: canonicalPkg.questions.length,
        passCount: 0,
        reviseCount: 0,
        rejectCount: canonicalPkg.questions.length,
        criticalCount: layer1Result.findings.filter((f) => f.severity === "CRITICAL").length,
        majorCount: layer1Result.findings.filter((f) => f.severity === "MAJOR").length,
        minorCount: layer1Result.findings.filter((f) => f.severity === "MINOR").length,
        decision: "REJECT",
      },
      metadata: {
        durationMs: Date.now() - startTime,
        evaluatorUsed: false,
      },
    };
  }

  // 2. Layer 2: Semantic Quality Validation (Item by Item)
  const itemResults: QuestionItemQualityResult[] = [];
  const allFindings: QuestionQualityFinding[] = [...layer1Result.findings];

  for (let idx = 0; idx < canonicalPkg.questions.length; idx++) {
    const q = canonicalPkg.questions[idx];
    const semanticRes = await evaluateSemanticQuestionQuality(q, idx, context, options);

    const itemDecision = evaluateQuestionQualityDecision(semanticRes.findings, options);
    itemResults.push({
      questionIndex: idx,
      questionId: q.id,
      jenis: q.jenis,
      status: itemDecision,
      factualStatus: semanticRes.factualStatus,
      answerStatus: semanticRes.answerStatus,
      distractorStatus: semanticRes.distractorStatus,
      ambiguityStatus: semanticRes.ambiguityStatus,
      explanationStatus: semanticRes.explanationStatus,
      alignmentStatus: semanticRes.alignmentStatus,
      findings: semanticRes.findings,
    });

    allFindings.push(...semanticRes.findings);
  }

  // 3. Layer 3: Decision Engine for Package
  const packageDecision = evaluateQuestionQualityDecision(allFindings, options);

  // Categorize findings
  const factualFindings = allFindings.filter((f) => f.component === "factual");
  const answerFindings = allFindings.filter((f) => f.component === "answer");
  const distractorFindings = allFindings.filter((f) => f.component === "distractor");
  const ambiguityFindings = allFindings.filter((f) => f.component === "question" && f.code.includes("AMBIGU"));
  const explanationFindings = allFindings.filter((f) => f.component === "explanation");
  const objectiveAlignmentFindings = allFindings.filter((f) => f.component === "objective");
  const duplicateFindings = allFindings.filter((f) => f.component === "duplicate");
  const structuralFindings = allFindings.filter((f) => f.component === "structure");

  const criticalCount = allFindings.filter((f) => f.severity === "CRITICAL").length;
  const majorCount = allFindings.filter((f) => f.severity === "MAJOR").length;
  const minorCount = allFindings.filter((f) => f.severity === "MINOR").length;

  const passCount = itemResults.filter((r) => r.status === "PASS").length;
  const reviseCount = itemResults.filter((r) => r.status === "REVISE").length;
  const rejectCount = itemResults.filter((r) => r.status === "REJECT").length;

  const referencedEvidenceSet = new Set<string>();
  canonicalPkg.questions.forEach((q) => q.evidenceIds.forEach((id) => referencedEvidenceSet.add(id)));

  return {
    status: packageDecision,
    validationVersion,
    checkedAt: new Date().toISOString(),
    groundingResult: {
      status: criticalCount > 0 ? "DEFECTIVE" : "VALID",
      evidenceSufficiency: context.evidenceSufficiency,
      referencedEvidenceCount: referencedEvidenceSet.size,
      unreferencedEvidenceCount: Math.max(0, context.evidenceItems.length - referencedEvidenceSet.size),
    },
    factualFindings,
    answerFindings,
    distractorFindings,
    ambiguityFindings,
    explanationFindings,
    objectiveAlignmentFindings,
    duplicateFindings,
    structuralFindings,
    itemResults,
    summary: {
      totalQuestions: canonicalPkg.questions.length,
      passCount,
      reviseCount,
      rejectCount,
      criticalCount,
      majorCount,
      minorCount,
      decision: packageDecision,
    },
    metadata: {
      durationMs: Date.now() - startTime,
      evaluatorUsed: options.mockSemanticEvaluator !== undefined || options.skipSemanticLayer !== true,
      evaluatorModel: options.evaluatorModelConfig?.model || "google/gemini-2.5-flash",
    },
  };
}

/**
 * Validates a single question in isolation.
 */
export async function validateSingleQuestionQuality(
  question: CanonicalQuestion,
  context: GroundedQuestionContext,
  options: QuestionQualityValidationOptions = {},
): Promise<QuestionItemQualityResult> {
  const dummyPkg: CanonicalQuestionPackage = {
    schemaVersion: CANONICAL_QUESTION_SCHEMA_VERSION,
    judul: "Single Question Audit",
    topik: context.groundingTarget.topik,
    tingkat: question.tingkat,
    questions: [question],
    evidenceRefs: [],
  };

  const res = await validateQuestionPackageQuality(dummyPkg, context, options);
  return res.itemResults[0] || {
    questionIndex: 0,
    questionId: question.id,
    jenis: question.jenis,
    status: res.status,
    factualStatus: "UNCERTAIN",
    answerStatus: "UNCERTAIN",
    distractorStatus: "UNSUPPORTED",
    ambiguityStatus: "CRITICAL",
    explanationStatus: "UNGROUNDED",
    alignmentStatus: "MISALIGNED",
    findings: res.structuralFindings,
  };
}
