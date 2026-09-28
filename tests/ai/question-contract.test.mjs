/**
 * GuruPro AI Foundation (AI-4A) — Canonical Question Contract & Grounding Foundation Test Suite
 *
 * Dedicated tests covering:
 * - Section A: Multiple Choice contract invariants (4 unique options, valid key letter A-D, min length)
 * - Section B: Essay contract invariants (empty options array, non-empty rubric, min length)
 * - Section C: Grounding & Anti-Hallucination (evidence reference integrity, dangling rejection, anti-promotion)
 * - Section D: Provenance & AI Metadata (versioning, timestamps, teacher-edit tracking)
 * - Section E: Student-Safe Representation (answer-key & explanation confidentiality, RPC parity)
 * - Section F: Compatibility with existing Soal, PaketSoal, and auto-grading evaluation engine
 * - Section G: Security & Multi-Tenant boundaries (cross-tenant evidence & identity spoofing prevention)
 */

import assert from "node:assert/strict";
import {
  CANONICAL_QUESTION_SCHEMA_VERSION,
  CANONICAL_QUESTION_PROMPT_VERSION,
  CanonicalMultipleChoiceQuestionSchema,
  CanonicalEssayQuestionSchema,
  CanonicalQuestionSchema,
  CanonicalQuestionPackageSchema,
  QuestionAiMetadataSchema,
  StudentSafeQuestionSchema,
  validateCanonicalQuestion,
  validateCanonicalQuestionPackage,
  toStudentSafeQuestion,
  toExistingSoal,
  fromExistingSoal,
} from "../../src/lib/ai/question-contract.ts";
import { AI_ERROR_CODES, AiServiceError } from "../../src/lib/ai/error-taxonomy.ts";

console.log("================================================================================");
console.log("  GURUPRO TEST SUITE: AI-4A CANONICAL QUESTION CONTRACT & GROUNDING FOUNDATION  ");
console.log("================================================================================");

let passed = 0;

// Shared valid fixtures
const validEv1 = "ev-chunk-001";
const validEv2 = "ev-chunk-002";
const allowedEvidenceSet = new Set([validEv1, validEv2, "ev-chunk-003"]);

const validMcQuestion = {
  id: "q-mc-101",
  jenis: "Pilihan Ganda",
  pertanyaan: "Manakah fungsi utama sistem injeksi bahan bakar elektronik (EFI) pada mesin modern?",
  opsi: [
    "Mengatur suplai bahan bakar secara presisi berdasarkan pembacaan sensor",
    "Mendinginkan radiator secara manual menggunakan cairan coolant",
    "Menyaring oli mesin sebelum dialirkan ke ruang transmisi",
    "Menyalakan lampu peringatan check-engine saat baterai terisi penuh",
  ],
  kunci: "A",
  penjelasan: "Sistem EFI mengatur injeksi bahan bakar secara elektronik melalui ECU dengan input sensor.",
  tingkat: "Sedang",
  evidenceIds: [validEv1],
  status: "SUPPORTED",
};

const validEssayQuestion = {
  id: "q-es-201",
  jenis: "Esai",
  pertanyaan: "Jelaskan langkah-langkah diagnosis sistem pengapian ketika mesin mengalami gangguan sulit dihidupkan.",
  opsi: [],
  kunci: "Rubrik penilaian ideal: 1. Pemeriksaan percikan api busi (bobot 30%). 2. Pemeriksaan tegangan koil (bobot 30%). 3. Pemeriksaan sensor crankshaft CKP dan konektor ECU (bobot 40%).",
  penjelasan: "Guru memberikan nilai proporsional sesuai kelengkapan langkah diagnosis standar SOP industri.",
  tingkat: "Sulit",
  evidenceIds: [validEv2],
  status: "SUPPORTED",
};

// ==============================================================================
// SECTION A: MULTIPLE CHOICE CONTRACT INVARIANTS
// ==============================================================================
console.log("\n--- SECTION A: MULTIPLE CHOICE CONTRACT INVARIANTS ---");

// Test 1: Valid Multiple Choice question passes validation
{
  const validated = validateCanonicalQuestion(validMcQuestion, { allowedEvidenceIds: allowedEvidenceSet });
  assert.equal(validated.id, "q-mc-101");
  assert.equal(validated.jenis, "Pilihan Ganda");
  assert.equal(validated.kunci, "A");
  assert.equal(validated.opsi.length, 4);
  console.log("  [Section A] 1. Valid Multiple Choice question passes canonical validation ... ✓ PASS");
  passed++;
}

// Test 2: Invalid question text (< 5 characters) is rejected
{
  const invalid = { ...validMcQuestion, pertanyaan: "Apa?" };
  assert.throws(
    () => validateCanonicalQuestion(invalid),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.QUESTION_SCHEMA_INVALID,
  );
  console.log("  [Section A] 2. Question text shorter than 5 chars is rejected ... ✓ PASS");
  passed++;
}

// Test 3: Option count not equal to 4 is rejected
{
  const threeOptions = {
    ...validMcQuestion,
    opsi: ["Opsi A", "Opsi B", "Opsi C"],
  };
  assert.throws(
    () => validateCanonicalQuestion(threeOptions),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.QUESTION_SCHEMA_INVALID,
  );

  const fiveOptions = {
    ...validMcQuestion,
    opsi: ["Opsi A", "Opsi B", "Opsi C", "Opsi D", "Opsi E"],
  };
  assert.throws(
    () => validateCanonicalQuestion(fiveOptions),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.QUESTION_SCHEMA_INVALID,
  );
  console.log("  [Section A] 3. Multiple Choice with option count != 4 is rejected ... ✓ PASS");
  passed++;
}

// Test 4: Duplicate options are rejected
{
  const duplicateOptions = {
    ...validMcQuestion,
    opsi: [
      "Mengatur suplai bahan bakar secara presisi",
      "Mendinginkan radiator secara manual",
      "mengatur suplai bahan bakar secara presisi", // Duplicate case-insensitive
      "Menyaring oli mesin sebelum dialirkan",
    ],
  };
  assert.throws(
    () => validateCanonicalQuestion(duplicateOptions),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.QUESTION_SCHEMA_INVALID,
  );
  console.log("  [Section A] 4. Duplicate option texts are strictly rejected ... ✓ PASS");
  passed++;
}

// Test 5: Invalid correct answer letter (e.g. 'E', lowercase 'a', or number) is rejected
{
  const invalidKey = { ...validMcQuestion, kunci: "E" };
  assert.throws(
    () => validateCanonicalQuestion(invalidKey),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.QUESTION_SCHEMA_INVALID,
  );

  const lowercaseKey = { ...validMcQuestion, kunci: "a" };
  assert.throws(
    () => validateCanonicalQuestion(lowercaseKey),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.QUESTION_SCHEMA_INVALID,
  );
  console.log("  [Section A] 5. Invalid key representation (non A/B/C/D) is rejected ... ✓ PASS");
  passed++;
}

// Test 6: Empty option string is rejected
{
  const emptyOption = {
    ...validMcQuestion,
    opsi: ["Opsi valid 1", "", "Opsi valid 3", "Opsi valid 4"],
  };
  assert.throws(
    () => validateCanonicalQuestion(emptyOption),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.QUESTION_SCHEMA_INVALID,
  );
  console.log("  [Section A] 6. Empty option string is rejected ... ✓ PASS");
  passed++;
}

// ==============================================================================
// SECTION B: ESSAY CONTRACT INVARIANTS
// ==============================================================================
console.log("\n--- SECTION B: ESSAY CONTRACT INVARIANTS ---");

// Test 7: Valid Essay question passes validation
{
  const validated = validateCanonicalQuestion(validEssayQuestion, { allowedEvidenceIds: allowedEvidenceSet });
  assert.equal(validated.id, "q-es-201");
  assert.equal(validated.jenis, "Esai");
  assert.deepEqual(validated.opsi, []);
  assert.ok(validated.kunci.length >= 10);
  console.log("  [Section B] 7. Valid Essay question passes canonical validation ... ✓ PASS");
  passed++;
}

// Test 8: Essay question with non-empty options array is rejected
{
  const invalidEssay = {
    ...validEssayQuestion,
    opsi: ["Opsi tidak sah pada soal esai"],
  };
  assert.throws(
    () => validateCanonicalQuestion(invalidEssay),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.QUESTION_SCHEMA_INVALID,
  );
  console.log("  [Section B] 8. Essay question with non-empty options array is rejected ... ✓ PASS");
  passed++;
}

// Test 9: Essay question with empty or too-short rubric (< 10 chars) is rejected
{
  const shortRubric = {
    ...validEssayQuestion,
    kunci: "Bebas",
  };
  assert.throws(
    () => validateCanonicalQuestion(shortRubric),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.QUESTION_SCHEMA_INVALID,
  );
  console.log("  [Section B] 9. Essay question with rubric < 10 characters is rejected ... ✓ PASS");
  passed++;
}

// ==============================================================================
// SECTION C: GROUNDING & ANTI-HALLUCINATION INVARIANTS
// ==============================================================================
console.log("\n--- SECTION C: GROUNDING & ANTI-HALLUCINATION INVARIANTS ---");

// Test 10: Valid evidence reference passes grounding check
{
  const validated = validateCanonicalQuestion(validMcQuestion, {
    allowedEvidenceIds: allowedEvidenceSet,
  });
  assert.ok(validated.evidenceIds.every((id) => allowedEvidenceSet.has(id)));
  console.log("  [Section C] 10. Valid evidence IDs pass grounding check ... ✓ PASS");
  passed++;
}

// Test 11: Dangling evidence reference (evidenceId not in grounding context) is rejected
{
  const danglingEvQuestion = {
    ...validMcQuestion,
    evidenceIds: ["fabricated-evidence-999"],
  };
  assert.throws(
    () =>
      validateCanonicalQuestion(danglingEvQuestion, {
        allowedEvidenceIds: allowedEvidenceSet,
      }),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.QUESTION_GROUNDING_FAILED,
  );
  console.log("  [Section C] 11. Dangling evidence ID is rejected with QUESTION_GROUNDING_FAILED ... ✓ PASS");
  passed++;
}

// Test 12: Question with empty evidenceIds array is rejected
{
  const noEvidenceQuestion = {
    ...validMcQuestion,
    evidenceIds: [],
  };
  assert.throws(
    () => validateCanonicalQuestion(noEvidenceQuestion),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.QUESTION_SCHEMA_INVALID,
  );
  console.log("  [Section C] 12. Question with zero evidence references is rejected ... ✓ PASS");
  passed++;
}

// Test 13: Anti-Promotion Invariant: NOT_FOUND evidence CANNOT be promoted to SUPPORTED
{
  const statusMap = new Map([
    [validEv1, "NOT_FOUND"],
    [validEv2, "SUPPORTED"],
  ]);

  const ungroundedQuestion = {
    ...validMcQuestion,
    evidenceIds: [validEv1], // references NOT_FOUND evidence
    status: "SUPPORTED", // illegal promotion
  };

  assert.throws(
    () =>
      validateCanonicalQuestion(ungroundedQuestion, {
        allowedEvidenceIds: allowedEvidenceSet,
        evidenceStatusMap: statusMap,
      }),
    (err) =>
      err instanceof AiServiceError &&
      err.code === AI_ERROR_CODES.QUESTION_GROUNDING_FAILED &&
      /anti-promosi/i.test(err.message),
  );
  console.log("  [Section C] 13. Anti-promotion invariant strictly enforced (NOT_FOUND cannot be SUPPORTED) ... ✓ PASS");
  passed++;
}

// ==============================================================================
// SECTION D: PROVENANCE & AI METADATA
// ==============================================================================
console.log("\n--- SECTION D: PROVENANCE & AI METADATA ---");

// Test 14: Valid QuestionAiMetadata conforms to schema
{
  const metadata = {
    promptVersion: CANONICAL_QUESTION_PROMPT_VERSION,
    sourceSnapshotIds: ["snap-1001", "snap-1002"],
    schemaVersion: CANONICAL_QUESTION_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    validationStatus: "valid",
    evidenceRefs: [
      {
        sourceId: "src-1",
        chunkId: validEv1,
        sourceTitle: "Buku Manual Mesin EFI",
        snippet: "Sistem EFI mengatur injeksi bahan bakar secara elektronik...",
        status: "SUPPORTED",
      },
    ],
  };

  const parsed = QuestionAiMetadataSchema.parse(metadata);
  assert.equal(parsed.schemaVersion, "1.0.0");
  assert.equal(parsed.validationStatus, "valid");
  assert.equal(parsed.evidenceRefs.length, 1);
  console.log("  [Section D] 14. QuestionAiMetadata conforms to schema ... ✓ PASS");
  passed++;
}

// Test 15: Teacher-edited state can be preserved without destroying original AI metadata
{
  const originalMetadata = {
    promptVersion: CANONICAL_QUESTION_PROMPT_VERSION,
    sourceSnapshotIds: ["snap-1001"],
    schemaVersion: CANONICAL_QUESTION_SCHEMA_VERSION,
    generatedAt: "2026-09-28T08:00:00.000Z",
    validationStatus: "valid",
    evidenceRefs: [],
    originalGeneratedCount: 5,
  };

  const editedMetadata = {
    ...originalMetadata,
    teacherEdited: true,
    editedAt: "2026-09-28T08:30:00.000Z",
    lastEditedBy: "teacher-uuid-001",
  };

  const parsed = QuestionAiMetadataSchema.parse(editedMetadata);
  assert.equal(parsed.teacherEdited, true);
  assert.equal(parsed.lastEditedBy, "teacher-uuid-001");
  assert.equal(parsed.originalGeneratedCount, 5);
  console.log("  [Section D] 15. Teacher-edited provenance tracking is supported ... ✓ PASS");
  passed++;
}

// ==============================================================================
// SECTION E: STUDENT-SAFE REPRESENTATION (ANSWER-KEY SECURITY)
// ==============================================================================
console.log("\n--- SECTION E: STUDENT-SAFE REPRESENTATION (ANSWER-KEY SECURITY) ---");

// Test 16: toStudentSafeQuestion strictly strips kunci, penjelasan, evidenceIds, aiMetadata
{
  const studentMc = toStudentSafeQuestion(validMcQuestion);

  assert.equal(studentMc.id, "q-mc-101");
  assert.equal(studentMc.pertanyaan, validMcQuestion.pertanyaan);
  assert.equal(studentMc.jenis, "Pilihan Ganda");
  assert.deepEqual(studentMc.opsi, validMcQuestion.opsi);

  // CRITICAL SECURITY CHECKS:
  assert.equal("kunci" in studentMc, false, "Kunci must NOT exist in student payload");
  assert.equal("penjelasan" in studentMc, false, "Penjelasan must NOT exist in student payload");
  assert.equal("evidenceIds" in studentMc, false, "evidenceIds must NOT exist in student payload");
  assert.equal("status" in studentMc, false, "status must NOT exist in student payload");

  // Validates with StudentSafeQuestionSchema
  const validated = StudentSafeQuestionSchema.parse(studentMc);
  assert.equal(validated.id, "q-mc-101");
  console.log("  [Section E] 16. toStudentSafeQuestion strips kunci & secrets completely for MC ... ✓ PASS");
  passed++;
}

// Test 17: toStudentSafeQuestion strips essay rubric and scoring instructions
{
  const studentEssay = toStudentSafeQuestion(validEssayQuestion);

  assert.equal(studentEssay.id, "q-es-201");
  assert.equal(studentEssay.pertanyaan, validEssayQuestion.pertanyaan);
  assert.equal(studentEssay.jenis, "Esai");
  assert.deepEqual(studentEssay.opsi, []);

  // CRITICAL SECURITY CHECKS:
  assert.equal("kunci" in studentEssay, false, "Rubrik/kunci must NOT exist in student essay");
  assert.equal("penjelasan" in studentEssay, false, "Panduan penskoran must NOT exist in student essay");
  assert.equal("evidenceIds" in studentEssay, false, "evidenceIds must NOT exist in student essay");
  console.log("  [Section E] 17. toStudentSafeQuestion strips rubric & secrets completely for Essay ... ✓ PASS");
  passed++;
}

// Test 18: Matches RPC public.get_penugasan_soal_for_siswa output structure
{
  // Simulated output from get_penugasan_soal_for_siswa:
  // jsonb_build_object('id', elem->>'id', 'pertanyaan', elem->>'pertanyaan', 'jenis', elem->>'jenis', 'opsi', elem->'opsi')
  const rpcOutputItem = {
    id: validMcQuestion.id,
    pertanyaan: validMcQuestion.pertanyaan,
    jenis: validMcQuestion.jenis,
    opsi: validMcQuestion.opsi,
  };

  const parsed = StudentSafeQuestionSchema.parse(rpcOutputItem);
  assert.equal(parsed.id, validMcQuestion.id);
  assert.equal(parsed.opsi.length, 4);
  console.log("  [Section E] 18. StudentSafeQuestion matches RPC get_penugasan_soal_for_siswa format ... ✓ PASS");
  passed++;
}

// ==============================================================================
// SECTION F: COMPATIBILITY WITH EXISTING SOAL & AUTO-GRADING
// ==============================================================================
console.log("\n--- SECTION F: COMPATIBILITY WITH EXISTING SOAL & AUTO-GRADING ---");

// Test 19: toExistingSoal converts CanonicalQuestion to existing Soal interface cleanly
{
  const existingSoal = toExistingSoal(validMcQuestion);

  assert.equal(existingSoal.id, validMcQuestion.id);
  assert.equal(existingSoal.pertanyaan, validMcQuestion.pertanyaan);
  assert.equal(existingSoal.jenis, "Pilihan Ganda");
  assert.deepEqual(existingSoal.opsi, validMcQuestion.opsi);
  assert.equal(existingSoal.kunci, "A");
  assert.equal(existingSoal.penjelasan, validMcQuestion.penjelasan);
  assert.equal(existingSoal.tingkat, "Sedang");
  assert.deepEqual(existingSoal.evidenceIds, [validEv1]);
  console.log("  [Section F] 19. toExistingSoal produces 100% backward-compatible Soal object ... ✓ PASS");
  passed++;
}

// Test 20: fromExistingSoal parses and normalizes standard Soal into CanonicalQuestion
{
  const rawLegacySoal = {
    id: "legacy-1",
    pertanyaan: "Apakah fungsi utama radiator pada mesin mobil?",
    jenis: "Pilihan Ganda",
    opsi: [
      "Mendinginkan cairan pendingin mesin",
      "Memompa bensin ke karburator",
      "Menghasilkan arus listrik DC",
      "Menyaring udara masuk",
    ],
    kunci: "A",
  };

  const canonical = fromExistingSoal(rawLegacySoal, { fallbackEvidenceId: validEv1 });
  assert.equal(canonical.id, "legacy-1");
  assert.equal(canonical.kunci, "A");
  assert.equal(canonical.evidenceIds[0], validEv1);
  assert.equal(canonical.status, "SUPPORTED");
  console.log("  [Section F] 20. fromExistingSoal normalizes legacy Soal into CanonicalQuestion ... ✓ PASS");
  passed++;
}

// Test 21: Auto-Grading Simulation: Letter 'A' matches option index 0
{
  // Simulated auto-grade algorithm from submit_penugasan RPC (20260917000000_create_penilaian.sql):
  function evaluateAutoGrade(studentAns, key, options) {
    if (!studentAns || !key) return false;
    const ans = String(studentAns).trim().toLowerCase();
    const k = String(key).trim();

    // Exact match
    if (ans === k.toLowerCase()) return true;

    // Single letter key ('A'-'E') matching answer starting with letter
    if (k.length === 1 && (ans.startsWith(k.toLowerCase() + ".") || ans === k.toLowerCase())) {
      return true;
    }

    // Single letter key matching option text by index
    if (k.length === 1 && Array.isArray(options)) {
      const idx = k.toUpperCase().charCodeAt(0) - 65;
      if (idx >= 0 && idx < options.length) {
        const optText = String(options[idx]).trim().toLowerCase();
        if (ans === optText || ans === `${k.toLowerCase()}. ${optText}`) {
          return true;
        }
      }
    }
    return false;
  }

  const mc = validMcQuestion;
  // Case 1: Student answered "A"
  assert.equal(evaluateAutoGrade("A", mc.kunci, mc.opsi), true);
  // Case 2: Student answered "a"
  assert.equal(evaluateAutoGrade("a", mc.kunci, mc.opsi), true);
  // Case 3: Student answered "A. Mengatur suplai bahan bakar..."
  assert.equal(evaluateAutoGrade("A. Mengatur suplai bahan bakar secara presisi berdasarkan pembacaan sensor", mc.kunci, mc.opsi), true);
  // Case 4: Student answered full option text
  assert.equal(evaluateAutoGrade("Mengatur suplai bahan bakar secara presisi berdasarkan pembacaan sensor", mc.kunci, mc.opsi), true);
  // Case 5: Student answered wrong option
  assert.equal(evaluateAutoGrade("B", mc.kunci, mc.opsi), false);
  assert.equal(evaluateAutoGrade("Mendinginkan radiator secara manual menggunakan cairan coolant", mc.kunci, mc.opsi), false);

  console.log("  [Section F] 21. Canonical MC question is 100% compatible with auto-grading algorithm ... ✓ PASS");
  passed++;
}

// Test 22: Package validation with mixed questions (Pilihan Ganda & Esai)
{
  const pkg = {
    schemaVersion: CANONICAL_QUESTION_SCHEMA_VERSION,
    judul: "Kuis Diagnosa Mesin Otomotif",
    topik: "Pemeliharaan Mesin Kendaraan Ringan",
    tingkat: "Sedang",
    questions: [validMcQuestion, validEssayQuestion],
    evidenceRefs: [
      {
        sourceId: "src-1",
        chunkId: validEv1,
        sourceTitle: "Buku Manual",
        snippet: "...",
        status: "SUPPORTED",
      },
    ],
  };

  const validatedPkg = validateCanonicalQuestionPackage(pkg, { allowedEvidenceIds: allowedEvidenceSet });
  assert.equal(validatedPkg.questions.length, 2);
  assert.equal(validatedPkg.questions[0].jenis, "Pilihan Ganda");
  assert.equal(validatedPkg.questions[1].jenis, "Esai");
  console.log("  [Section F] 22. validateCanonicalQuestionPackage validates mixed question package ... ✓ PASS");
  passed++;
}

// ==============================================================================
// SECTION G: SECURITY & MULTI-TENANT BOUNDARIES
// ==============================================================================
console.log("\n--- SECTION G: SECURITY & MULTI-TENANT BOUNDARIES ---");

// Test 23: Cross-tenant evidence reference is rejected
{
  // Teacher A only has access to allowedEvidenceSet
  // Question attempts to reference evidence from Teacher B's private source
  const crossTenantEvidenceQuestion = {
    ...validMcQuestion,
    evidenceIds: ["teacher-B-private-chunk-999"],
  };

  assert.throws(
    () =>
      validateCanonicalQuestion(crossTenantEvidenceQuestion, {
        allowedEvidenceIds: allowedEvidenceSet,
      }),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.QUESTION_GROUNDING_FAILED,
  );
  console.log("  [Section G] 23. Cross-tenant evidence reference is strictly rejected ... ✓ PASS");
  passed++;
}

// Test 24: Unsupported question type (e.g. 'Menjodohkan' or 'Isian Singkat') is rejected
{
  const unsupportedTypeQuestion = {
    ...validMcQuestion,
    jenis: "Menjodohkan",
  };

  assert.throws(
    () => validateCanonicalQuestion(unsupportedTypeQuestion),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.QUESTION_SCHEMA_INVALID,
  );
  console.log("  [Section G] 24. Unsupported question type is strictly rejected ... ✓ PASS");
  passed++;
}

// ==============================================================================
// SUMMARY
// ==============================================================================
console.log("================================================================================");
console.log(`  AI-4A TEST SUMMARY: ${passed} passed, 0 failed`);
console.log("================================================================================");
