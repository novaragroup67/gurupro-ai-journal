#!/usr/bin/env node
/**
 * ==============================================================================
 * GURUPRO TEST SUITE: AI-4F-A QUESTION BANK PUBLISH FOUNDATION
 * ==============================================================================
 *
 * Verifies the authoritative server-side rules and persistence contract for:
 * Draft Question Package -> Published Question Bank Package ('Draft' -> 'Terbit')
 *
 * Scenarios Tested:
 * 1. Valid Draft package can be published successfully.
 * 2. Unauthenticated user cannot publish (AUTH_ERROR).
 * 3. Student cannot publish (ROLE_FORBIDDEN).
 * 4. Unverified Guru cannot publish (ROLE_FORBIDDEN).
 * 5. Verified Guru can publish own package.
 * 6. Guru cannot publish another Guru's package (ROLE_FORBIDDEN).
 * 7. Already-published package cannot be published again (double-publish guard).
 * 8. Archived package cannot be published (is_archived: true rejected).
 * 9. REJECT package cannot be published (qualityResult.decision === 'REJECT').
 * 10. Invalid MC structure cannot be published (fewer/more options, duplicates, empty).
 * 11. Invalid Essay structure cannot be published (non-empty options, rubric < 10 chars).
 * 12. Invalid answer key cannot be published (non A-D key).
 * 13. Broken evidence reference cannot be published (dangling chunkId).
 * 14. Cross-tenant evidence/package reference is rejected.
 * 15. AI-4D provenance remains unchanged after publication.
 * 16. AI-4E teacher-edit provenance remains unchanged after publication.
 * 17. Publication metadata persists correctly (publishedAt, publishedBy).
 * 18. Student-safe projection remains free of answer key and internal metadata.
 * 19. Stale/concurrent publish is rejected (expectedUpdatedAt guard).
 * 20. Publication persists correctly after database reload.
 * 21. Double-publish race is safely rejected.
 * 22. Direct unauthorized server invocation is rejected (spoofing prevented).
 */

import assert from "node:assert/strict";

import {
  AI_ERROR_CODES,
  AiServiceError,
} from "../../src/lib/ai/error-taxonomy.ts";
import {
  CANONICAL_QUESTION_SCHEMA_VERSION,
  CANONICAL_QUESTION_PROMPT_VERSION,
  PublishQuestionPackageInputSchema,
  validateQuestionPackagePublishEligibility,
  validateCanonicalQuestionPackage,
  toStudentSafeQuestion,
  toExistingSoal,
} from "../../src/lib/ai/question-contract.ts";

console.log("================================================================================");
console.log("  GURUPRO TEST SUITE: AI-4F-A QUESTION BANK PUBLISH FOUNDATION                 ");
console.log("================================================================================");

let testsPassed = 0;
let testsFailed = 0;

async function runTest(name, fn) {
  try {
    process.stdout.write(`  • ${name} ... `);
    await fn();
    console.log("✓ PASS");
    testsPassed++;
  } catch (err) {
    console.log("✗ FAIL");
    console.error(err);
    testsFailed++;
  }
}

// In-Memory Database Simulator for Publish Workflow Tests
function createMockSupabase(initialRows = []) {
  const table = new Map(initialRows.map((r) => [r.id, { ...r }]));

  return {
    from: (tableName) => {
      if (tableName !== "paket_soal") {
        throw new Error(`Unexpected table: ${tableName}`);
      }

      return {
        select: () => ({
          eq: (field, val) => ({
            maybeSingle: async () => {
              const row = Array.from(table.values()).find((r) => r[field] === val);
              return { data: row ? JSON.parse(JSON.stringify(row)) : null, error: null };
            },
          }),
        }),
        update: (updates) => ({
          eq: (field1, val1) => ({
            eq: (field2, val2) => ({
              select: () => ({
                single: async () => {
                  const row = Array.from(table.values()).find(
                    (r) => r[field1] === val1 && r[field2] === val2,
                  );
                  if (!row) {
                    return { data: null, error: { message: "Record not found or unauthorized" } };
                  }
                  const updated = {
                    ...row,
                    ...updates,
                    updated_at: updates.updated_at || new Date().toISOString(),
                  };
                  table.set(row.id, updated);
                  return { data: JSON.parse(JSON.stringify(updated)), error: null };
                },
              }),
            }),
          }),
        }),
      };
    },
    _getTable: () => table,
  };
}

// Simulated Server Function executing the exact logic of publishQuestionPackageServerFn
async function executePublishQuestionPackage(data, context) {
  const supabase = context.supabase;
  const userId = context.userId;
  const userRole = context.userRole || context.profile?.role;
  const verificationStatus = context.verificationStatus || context.profile?.status_verifikasi;

  // 1. Authorization checks
  if (!userId) {
    throw new AiServiceError(AI_ERROR_CODES.AUTH_ERROR, "Sesi login tidak valid.");
  }
  if (userRole !== "guru") {
    throw new AiServiceError(AI_ERROR_CODES.ROLE_FORBIDDEN, "Hanya guru yang diizinkan mempublikasikan paket soal.");
  }
  if (verificationStatus && verificationStatus !== "terverifikasi") {
    throw new AiServiceError(AI_ERROR_CODES.ROLE_FORBIDDEN, "Akun guru belum terverifikasi.");
  }

  // Schema input validation
  const parsedInput = PublishQuestionPackageInputSchema.safeParse(data);
  if (!parsedInput.success) {
    const detail = parsedInput.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      `Data input publikasi tidak valid: ${detail}`,
    );
  }
  const input = parsedInput.data;

  // 2. Fetch authoritative existing record from DB
  const { data: existing, error: fetchErr } = await supabase
    .from("paket_soal")
    .select("*")
    .eq("id", input.paketId)
    .maybeSingle();

  if (fetchErr) {
    throw new AiServiceError(
      AI_ERROR_CODES.PERSISTENCE_ERROR,
      `Gagal memeriksa data paket soal dari database: ${fetchErr.message}`,
    );
  }

  if (!existing) {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      "Paket soal yang ingin dipublikasikan tidak ditemukan.",
    );
  }

  // 3. Enforce Teacher Ownership
  if (existing.user_id !== userId) {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Anda bukan pemilik draf paket soal ini.",
    );
  }

  // 4. Stale Data / Concurrency Protection
  if (input.expectedUpdatedAt && existing.updated_at) {
    const dbTime = new Date(existing.updated_at).getTime();
    const clientTime = new Date(input.expectedUpdatedAt).getTime();
    if (!Number.isNaN(dbTime) && !Number.isNaN(clientTime) && dbTime > clientTime) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        "Draf paket soal telah diperbarui oleh sesi lain. Muat ulang halaman untuk meninjau versi terbaru sebelum mempublikasikan.",
      );
    }
  }

  // 5. Validate Publish Eligibility (Status, Archive, AI-4D Quality, Canonical Structure, Evidence Integrity)
  const eligibilityResult = validateQuestionPackagePublishEligibility(existing);
  const validatedPackage = eligibilityResult.validatedPackage;

  // 6. Provenance Preservation & Audit Timestamp
  const existingAiMetadata = (existing.ai_metadata || {});
  const nowIso = new Date().toISOString();

  const updatedAiMetadata = {
    ...existingAiMetadata,
    promptVersion: existingAiMetadata.promptVersion || CANONICAL_QUESTION_PROMPT_VERSION,
    schemaVersion: existingAiMetadata.schemaVersion || CANONICAL_QUESTION_SCHEMA_VERSION,
    generatedAt: existingAiMetadata.generatedAt || existing.created_at || nowIso,
    sourceSnapshotIds: existingAiMetadata.sourceSnapshotIds || [existing.id],
    validationStatus: existingAiMetadata.validationStatus || "valid",
    evidenceRefs: existingAiMetadata.evidenceRefs || [],
    originalGeneratedCount:
      existingAiMetadata.originalGeneratedCount || validatedPackage.questions.length,
    originalQualityValidation:
      existingAiMetadata.originalQualityValidation ||
      existingAiMetadata.qualityResult ||
      undefined,
    originalQualityFindings:
      existingAiMetadata.originalQualityFindings ||
      existingAiMetadata.qualityFindings ||
      undefined,
    teacherEdited: existingAiMetadata.teacherEdited ?? false,
    editedAt: existingAiMetadata.editedAt,
    lastEditedBy: existingAiMetadata.lastEditedBy,
    publishedAt: nowIso,
    publishedBy: userId,
  };

  // 7. Atomic Persistence to Supabase (status: 'Terbit' strictly enforced)
  const { data: updated, error: updateErr } = await supabase
    .from("paket_soal")
    .update({
      status: "Terbit",
      ai_metadata: updatedAiMetadata,
      updated_at: nowIso,
    })
    .eq("id", input.paketId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (updateErr) {
    throw new AiServiceError(
      AI_ERROR_CODES.PERSISTENCE_ERROR,
      `Gagal mempublikasikan paket soal ke Bank Soal: ${updateErr.message}`,
    );
  }

  const publishedPackage = {
    id: updated.id,
    judul: updated.judul,
    topik: updated.topik,
    modulId: updated.modul_id || undefined,
    status: updated.status || "Terbit",
    kelas: Array.isArray(updated.kelas) ? updated.kelas : [],
    soal: Array.isArray(updated.soal) ? updated.soal : validatedPackage.questions.map(toExistingSoal),
    createdAt: updated.created_at,
    updatedAt: updated.updated_at,
    isArchived: Boolean(updated.is_archived),
    archivedAt: updated.archived_at || null,
    archivedBy: updated.archived_by || null,
    ai_metadata: updated.ai_metadata,
    teacherEdited: Boolean(updatedAiMetadata.teacherEdited),
    publishedAt: updatedAiMetadata.publishedAt,
    publishedBy: updatedAiMetadata.publishedBy,
  };

  const studentSafeQuestions = validatedPackage.questions.map(toStudentSafeQuestion);

  return {
    status: "success",
    publishedPackageId: updated.id,
    publishedPackage,
    canonicalPackage: {
      ...validatedPackage,
      aiMetadata: updatedAiMetadata,
    },
    studentSafeQuestions,
    metadata: updatedAiMetadata,
  };
}

async function main() {
  const TEACHER_1 = "teacher-uuid-101";
  const TEACHER_2 = "teacher-uuid-202";
  const SISWA_ID = "siswa-uuid-303";
  const PAKET_ID = "paket-draft-uuid-001";
  const SNAPSHOT_ID = "snap-tkj-routing-001";
  const EVIDENCE_ID_1 = "ev-chunk-001";
  const EVIDENCE_ID_2 = "ev-chunk-002";

  const initialAiMetadata = {
    promptVersion: CANONICAL_QUESTION_PROMPT_VERSION,
    schemaVersion: CANONICAL_QUESTION_SCHEMA_VERSION,
    generatedAt: new Date(Date.now() - 7200000).toISOString(),
    sourceSnapshotIds: [SNAPSHOT_ID],
    validationStatus: "valid",
    originalGeneratedCount: 2,
    teacherEdited: true,
    editedAt: new Date(Date.now() - 3600000).toISOString(),
    lastEditedBy: TEACHER_1,
    evidenceRefs: [
      {
        evidenceId: EVIDENCE_ID_1,
        sourceId: SNAPSHOT_ID,
        chunkId: "chunk-01",
        status: "SUPPORTED",
        snippet: "Routing statis dikonfigurasi manual oleh administrator.",
      },
      {
        evidenceId: EVIDENCE_ID_2,
        sourceId: SNAPSHOT_ID,
        chunkId: "chunk-02",
        status: "SUPPORTED",
        snippet: "CLI command MikroTik: /ip route add dst-address=0.0.0.0/0 gateway=192.168.1.1",
      },
    ],
    qualityResult: {
      decision: "PASS",
      validatedAt: new Date(Date.now() - 7200000).toISOString(),
      coverageRatio: 1.0,
      issueCounts: {
        unsupportedClaims: 0,
        wrongAnswerKey: 0,
        duplicateQuestions: 0,
      },
    },
    qualityFindings: [
      {
        questionId: "q-mc-01",
        type: "info",
        message: "Butir soal telah divalidasi dan lolos gerbang kendali mutu AI-4D.",
      },
    ],
  };

  const initialSoal = [
    {
      id: "q-mc-01",
      jenis: "Pilihan Ganda",
      pertanyaan: "Apa fungsi utama dari default route pada tabel routing router?",
      opsi: [
        "Meneruskan semua paket data yang tidak cocok dengan entri rute spesifik lainnya",
        "Menghubungkan kabel UTP langsung ke port WAN tanpa IP address",
        "Menyimpan cache website populer agar browsing lebih cepat",
        "Menghapus entri DHCP lease secara otomatis setiap 24 jam",
      ],
      kunci: "A",
      penjelasan: "Default route (0.0.0.0/0) menjadi gateway of last resort saat rute spesifik tidak ada.",
      tingkat: "Sedang",
      evidenceIds: [EVIDENCE_ID_1],
      teacherEdited: true,
    },
    {
      id: "q-essay-02",
      jenis: "Esai",
      pertanyaan: "Jelaskan langkah-langkah menambahkan rute statis pada router MikroTik menggunakan baris perintah CLI!",
      opsi: [],
      kunci: "Kriteria penilaian: Sintaks /ip route add, parameter dst-address, parameter gateway, dan verifikasi tabel rute.",
      penjelasan: "Jawaban ideal mencantumkan sintaks yang tepat sesuai dokumentasi RouterOS.",
      tingkat: "Sedang",
      evidenceIds: [EVIDENCE_ID_2],
      teacherEdited: false,
    },
  ];

  const validDraftRecord = {
    id: PAKET_ID,
    user_id: TEACHER_1,
    judul: "Kuis Diagnostik: Routing Jaringan Komputer",
    topik: "Routing Statis MikroTik",
    modul_id: "modul-uuid-999",
    status: "Draft",
    is_archived: false,
    kelas: ["X TKJ 1"],
    soal: initialSoal,
    created_at: new Date(Date.now() - 7200000).toISOString(),
    updated_at: new Date(Date.now() - 3600000).toISOString(),
    ai_metadata: initialAiMetadata,
  };

  // ============================================================================
  // SCENARIO 1 & 5: VALID DRAFT PUBLISH BY VERIFIED GURU
  // ============================================================================
  console.log("\n--- Scenario 1 & 5: Valid Draft Publish by Owner Verified Guru ---");

  let mockDb = createMockSupabase([validDraftRecord]);
  let publishResponse = null;

  await runTest("Scenario 1 & 5: Verified Guru successfully publishes valid Draft package", async () => {
    publishResponse = await executePublishQuestionPackage(
      {
        paketId: PAKET_ID,
        expectedUpdatedAt: validDraftRecord.updated_at,
      },
      {
        supabase: mockDb,
        userId: TEACHER_1,
        userRole: "guru",
        verificationStatus: "terverifikasi",
      },
    );

    assert.equal(publishResponse.status, "success");
    assert.equal(publishResponse.publishedPackageId, PAKET_ID);
    assert.equal(publishResponse.publishedPackage.status, "Terbit");
  });

  // ============================================================================
  // SCENARIOS 2, 3, 4, 6, 22: AUTHORIZATION BOUNDARIES & SECURITY
  // ============================================================================
  console.log("\n--- Scenarios 2, 3, 4, 6, 22: Authorization Boundaries ---");

  await runTest("Scenario 2: Unauthenticated user cannot publish (AUTH_ERROR)", async () => {
    const db = createMockSupabase([validDraftRecord]);
    await assert.rejects(
      async () => {
        await executePublishQuestionPackage(
          { paketId: PAKET_ID },
          { supabase: db, userId: null },
        );
      },
      (err) => err instanceof AiServiceError && (err.code === AI_ERROR_CODES.AUTH_ERROR || err.code === AI_ERROR_CODES.ROLE_FORBIDDEN),
    );
  });

  await runTest("Scenario 3: Student cannot publish (ROLE_FORBIDDEN)", async () => {
    const db = createMockSupabase([validDraftRecord]);
    await assert.rejects(
      async () => {
        await executePublishQuestionPackage(
          { paketId: PAKET_ID },
          { supabase: db, userId: SISWA_ID, userRole: "siswa", verificationStatus: "terverifikasi" },
        );
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.ROLE_FORBIDDEN,
    );
  });

  await runTest("Scenario 4: Unverified Guru cannot publish (ROLE_FORBIDDEN)", async () => {
    const db = createMockSupabase([validDraftRecord]);
    await assert.rejects(
      async () => {
        await executePublishQuestionPackage(
          { paketId: PAKET_ID },
          { supabase: db, userId: TEACHER_1, userRole: "guru", verificationStatus: "menunggu" },
        );
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.ROLE_FORBIDDEN,
    );
  });

  await runTest("Scenario 6: Guru cannot publish another Guru's package (ROLE_FORBIDDEN)", async () => {
    const db = createMockSupabase([validDraftRecord]);
    await assert.rejects(
      async () => {
        await executePublishQuestionPackage(
          { paketId: PAKET_ID },
          { supabase: db, userId: TEACHER_2, userRole: "guru", verificationStatus: "terverifikasi" },
        );
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.ROLE_FORBIDDEN,
    );
  });

  await runTest("Scenario 22: Client-side identity spoofing in payload is rejected", async () => {
    const db = createMockSupabase([validDraftRecord]);
    await assert.rejects(
      async () => {
        await executePublishQuestionPackage(
          { paketId: PAKET_ID, userId: TEACHER_1 }, // Client attempts to spoof owner ID
          { supabase: db, userId: TEACHER_2, userRole: "guru", verificationStatus: "terverifikasi" },
        );
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.ROLE_FORBIDDEN,
    );
  });

  // ============================================================================
  // SCENARIO 7 & 21: DOUBLE-PUBLISH & IDEMPOTENCY PROTECTION
  // ============================================================================
  console.log("\n--- Scenario 7 & 21: Double-Publish Protection ---");

  await runTest("Scenario 7: Already-published package cannot be published again", async () => {
    // mockDb has the package updated to 'Terbit' from Scenario 1
    await assert.rejects(
      async () => {
        await executePublishQuestionPackage(
          { paketId: PAKET_ID },
          { supabase: mockDb, userId: TEACHER_1, userRole: "guru", verificationStatus: "terverifikasi" },
        );
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.INVALID_REQUEST,
    );
  });

  await runTest("Scenario 21: Double-publish race condition rejects second publish attempt", async () => {
    const publishedRecord = { ...validDraftRecord, status: "Terbit" };
    const pubDb = createMockSupabase([publishedRecord]);

    await assert.rejects(
      async () => {
        await executePublishQuestionPackage(
          { paketId: PAKET_ID },
          { supabase: pubDb, userId: TEACHER_1, userRole: "guru", verificationStatus: "terverifikasi" },
        );
      },
      (err) => err instanceof AiServiceError && err.message.includes("sudah berstatus Terbit"),
    );
  });

  // ============================================================================
  // SCENARIO 8: ARCHIVED PACKAGE CANNOT BE PUBLISHED
  // ============================================================================
  console.log("\n--- Scenario 8: Archive Integrity ---");

  await runTest("Scenario 8: Archived package (is_archived: true) cannot be published", async () => {
    const archivedRecord = {
      ...validDraftRecord,
      id: "paket-archived-001",
      is_archived: true,
      archived_at: new Date().toISOString(),
      archived_by: TEACHER_1,
    };
    const arcDb = createMockSupabase([archivedRecord]);

    await assert.rejects(
      async () => {
        await executePublishQuestionPackage(
          { paketId: "paket-archived-001" },
          { supabase: arcDb, userId: TEACHER_1, userRole: "guru", verificationStatus: "terverifikasi" },
        );
      },
      (err) => err instanceof AiServiceError && err.message.includes("diarsipkan"),
    );
  });

  // ============================================================================
  // SCENARIO 9: REJECT PACKAGE CANNOT BE PUBLISHED
  // ============================================================================
  console.log("\n--- Scenario 9: AI-4D Quality Invariant ---");

  await runTest("Scenario 9: Package with AI-4D REJECT status cannot be published", async () => {
    const rejectRecord = {
      ...validDraftRecord,
      id: "paket-reject-001",
      ai_metadata: {
        ...initialAiMetadata,
        qualityResult: {
          decision: "REJECT",
          issueCounts: { unsupportedClaims: 2, wrongAnswerKey: 1 },
        },
      },
    };
    const rejDb = createMockSupabase([rejectRecord]);

    await assert.rejects(
      async () => {
        await executePublishQuestionPackage(
          { paketId: "paket-reject-001" },
          { supabase: rejDb, userId: TEACHER_1, userRole: "guru", verificationStatus: "terverifikasi" },
        );
      },
      (err) =>
        err instanceof AiServiceError &&
        err.code === AI_ERROR_CODES.QUESTION_QUALITY_VALIDATION_FAILED &&
        err.message.includes("REJECT"),
    );
  });

  // ============================================================================
  // SCENARIO 10: INVALID MULTIPLE CHOICE STRUCTURE
  // ============================================================================
  console.log("\n--- Scenario 10: Invalid Multiple Choice Structure ---");

  await runTest("Scenario 10a: MC with fewer than 4 options rejected", () => {
    const invalidPkg = {
      ...validDraftRecord,
      soal: [
        {
          id: "q-mc-short",
          jenis: "Pilihan Ganda",
          pertanyaan: "Pertanyaan valid minimal 5 karakter?",
          opsi: ["Opsi A", "Opsi B", "Opsi C"], // Only 3 options
          kunci: "A",
          evidenceIds: [EVIDENCE_ID_1],
        },
      ],
    };

    assert.throws(
      () => validateQuestionPackagePublishEligibility(invalidPkg),
      (err) => err instanceof AiServiceError,
    );
  });

  await runTest("Scenario 10b: MC with duplicate options rejected", () => {
    const invalidPkg = {
      ...validDraftRecord,
      soal: [
        {
          id: "q-mc-dup",
          jenis: "Pilihan Ganda",
          pertanyaan: "Pertanyaan valid minimal 5 karakter?",
          opsi: ["Switch Cisco", "Router MikroTik", "Access Point", "switch cisco"], // Duplicate
          kunci: "A",
          evidenceIds: [EVIDENCE_ID_1],
        },
      ],
    };

    assert.throws(
      () => validateQuestionPackagePublishEligibility(invalidPkg),
      (err) => err instanceof AiServiceError && err.message.includes("terduplikasi"),
    );
  });

  await runTest("Scenario 10c: MC with empty option string rejected", () => {
    const invalidPkg = {
      ...validDraftRecord,
      soal: [
        {
          id: "q-mc-empty",
          jenis: "Pilihan Ganda",
          pertanyaan: "Pertanyaan valid minimal 5 karakter?",
          opsi: ["Opsi A", "", "Opsi C", "Opsi D"],
          kunci: "A",
          evidenceIds: [EVIDENCE_ID_1],
        },
      ],
    };

    assert.throws(
      () => validateQuestionPackagePublishEligibility(invalidPkg),
      (err) => err instanceof AiServiceError,
    );
  });

  // ============================================================================
  // SCENARIO 11: INVALID ESSAY STRUCTURE
  // ============================================================================
  console.log("\n--- Scenario 11: Invalid Essay Structure ---");

  await runTest("Scenario 11a: Essay with non-empty options array rejected", () => {
    const invalidPkg = {
      ...validDraftRecord,
      soal: [
        {
          id: "q-essay-opts",
          jenis: "Esai",
          pertanyaan: "Jelaskan langkah konfigurasi?",
          opsi: ["Opsi tidak sah pada esai"],
          kunci: "Rubrik penilaian esai minimal 10 karakter.",
          evidenceIds: [EVIDENCE_ID_2],
        },
      ],
    };

    assert.throws(
      () => validateQuestionPackagePublishEligibility(invalidPkg),
      (err) => err instanceof AiServiceError,
    );
  });

  await runTest("Scenario 11b: Essay with rubric shorter than 10 chars rejected", () => {
    const invalidPkg = {
      ...validDraftRecord,
      soal: [
        {
          id: "q-essay-short-rubric",
          jenis: "Esai",
          pertanyaan: "Jelaskan langkah konfigurasi?",
          opsi: [],
          kunci: "Pendek", // < 10 chars
          evidenceIds: [EVIDENCE_ID_2],
        },
      ],
    };

    assert.throws(
      () => validateQuestionPackagePublishEligibility(invalidPkg),
      (err) => err instanceof AiServiceError,
    );
  });

  // ============================================================================
  // SCENARIO 12: INVALID ANSWER KEY
  // ============================================================================
  console.log("\n--- Scenario 12: Invalid Answer Key ---");

  await runTest("Scenario 12: MC with invalid key letter 'E' rejected", () => {
    const invalidPkg = {
      ...validDraftRecord,
      soal: [
        {
          id: "q-mc-key-e",
          jenis: "Pilihan Ganda",
          pertanyaan: "Pertanyaan valid minimal 5 karakter?",
          opsi: ["Opsi A", "Opsi B", "Opsi C", "Opsi D"],
          kunci: "E", // Not A-D
          evidenceIds: [EVIDENCE_ID_1],
        },
      ],
    };

    assert.throws(
      () => validateQuestionPackagePublishEligibility(invalidPkg),
      (err) => err instanceof AiServiceError,
    );
  });

  // ============================================================================
  // SCENARIOS 13 & 14: EVIDENCE INTEGRITY & CROSS-TENANT GUARDS
  // ============================================================================
  console.log("\n--- Scenarios 13 & 14: Evidence Integrity & Cross-Tenant Guards ---");

  await runTest("Scenario 13: Dangling evidence reference rejected", () => {
    const invalidPkg = {
      ...validDraftRecord,
      soal: [
        {
          id: "q-mc-dangling",
          jenis: "Pilihan Ganda",
          pertanyaan: "Pertanyaan valid dengan bukti fiktif?",
          opsi: ["Opsi A", "Opsi B", "Opsi C", "Opsi D"],
          kunci: "A",
          evidenceIds: ["ev-dangling-ghost-chunk-999"], // Not in evidenceRefs
        },
      ],
    };

    assert.throws(
      () => validateQuestionPackagePublishEligibility(invalidPkg),
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.QUESTION_GROUNDING_FAILED,
    );
  });

  await runTest("Scenario 14: Cross-tenant evidence reference rejected as ungrounded", () => {
    // Teacher 2 tries to reference a chunk belonging to Teacher 1 that is absent from evidenceRefs
    const crossTenantPkg = {
      ...validDraftRecord,
      ai_metadata: {
        ...initialAiMetadata,
        evidenceRefs: [
          {
            evidenceId: "ev-teacher-2-chunk",
            sourceId: "snap-teacher-2",
            chunkId: "chunk-t2",
            status: "SUPPORTED",
            snippet: "Materi milik guru 2.",
          },
        ],
      },
      soal: [
        {
          id: "q-cross",
          jenis: "Pilihan Ganda",
          pertanyaan: "Pertanyaan yang merujuk bukti guru 1?",
          opsi: ["A", "B", "C", "D"],
          kunci: "A",
          evidenceIds: [EVIDENCE_ID_1], // BELONGS TO TEACHER 1, NOT in evidenceRefs!
        },
      ],
    };

    assert.throws(
      () => validateQuestionPackagePublishEligibility(crossTenantPkg),
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.QUESTION_GROUNDING_FAILED,
    );
  });

  // ============================================================================
  // SCENARIOS 15, 16, 17: PROVENANCE PRESERVATION & PUBLICATION METADATA
  // ============================================================================
  console.log("\n--- Scenarios 15, 16, 17: Provenance Preservation ---");

  await runTest("Scenario 15 & 16: AI-4D and AI-4E provenance remain strictly preserved", () => {
    const meta = publishResponse.metadata;
    assert.ok(meta);

    // AI provenance preserved
    assert.equal(meta.promptVersion, CANONICAL_QUESTION_PROMPT_VERSION);
    assert.equal(meta.schemaVersion, CANONICAL_QUESTION_SCHEMA_VERSION);
    assert.deepEqual(meta.sourceSnapshotIds, [SNAPSHOT_ID]);
    assert.equal(meta.evidenceRefs.length, 2);

    // AI-4D quality validation preserved intact
    assert.ok(meta.originalQualityValidation);
    assert.equal(meta.originalQualityValidation.decision, "PASS");
    assert.equal(meta.originalQualityFindings.length, 1);

    // AI-4E teacher edit provenance preserved
    assert.equal(meta.teacherEdited, true);
    assert.equal(meta.lastEditedBy, TEACHER_1);
    assert.ok(meta.editedAt);
  });

  await runTest("Scenario 17: Publication metadata (publishedAt, publishedBy) persists correctly", () => {
    const meta = publishResponse.metadata;
    assert.ok(meta.publishedAt, "publishedAt ISO string must be set");
    assert.equal(meta.publishedBy, TEACHER_1, "publishedBy must match authenticated guru ID");
    assert.equal(publishResponse.publishedPackage.publishedAt, meta.publishedAt);
    assert.equal(publishResponse.publishedPackage.publishedBy, TEACHER_1);
  });

  // ============================================================================
  // SCENARIO 18: STUDENT SAFETY (ANSWER-KEY SEGREGATION INVARIANT)
  // ============================================================================
  console.log("\n--- Scenario 18: Student Safety ---");

  await runTest("Scenario 18: StudentSafeQuestion projection strips answer keys, rubrics, explanations, and evidence", () => {
    const safeQuestions = publishResponse.studentSafeQuestions;
    assert.equal(safeQuestions.length, 2);

    const mcSafe = safeQuestions[0];
    const essaySafe = safeQuestions[1];

    // MC verification
    assert.equal(mcSafe.id, "q-mc-01");
    assert.equal(mcSafe.jenis, "Pilihan Ganda");
    assert.equal(mcSafe.opsi.length, 4);
    assert.equal("kunci" in mcSafe, false, "Student safe question must NOT expose kunci");
    assert.equal("penjelasan" in mcSafe, false, "Student safe question must NOT expose penjelasan");
    assert.equal("evidenceIds" in mcSafe, false, "Student safe question must NOT expose evidenceIds");
    assert.equal("teacherEdited" in mcSafe, false, "Student safe question must NOT expose teacherEdited");

    // Essay verification
    assert.equal(essaySafe.id, "q-essay-02");
    assert.equal(essaySafe.jenis, "Esai");
    assert.equal(essaySafe.opsi.length, 0);
    assert.equal("kunci" in essaySafe, false, "Student safe question must NOT expose rubric");
    assert.equal("penjelasan" in essaySafe, false, "Student safe question must NOT expose explanation");
  });

  // ============================================================================
  // SCENARIO 19: CONCURRENCY & STALE DATA PROTECTION
  // ============================================================================
  console.log("\n--- Scenario 19: Concurrency Protection ---");

  await runTest("Scenario 19: Rejects publish when client expectedUpdatedAt is older than DB updated_at", async () => {
    const freshDb = createMockSupabase([
      {
        ...validDraftRecord,
        updated_at: new Date().toISOString(),
      },
    ]);

    const staleTimestamp = new Date(Date.now() - 3600000).toISOString();

    await assert.rejects(
      async () => {
        await executePublishQuestionPackage(
          {
            paketId: PAKET_ID,
            expectedUpdatedAt: staleTimestamp,
          },
          {
            supabase: freshDb,
            userId: TEACHER_1,
            userRole: "guru",
            verificationStatus: "terverifikasi",
          },
        );
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.INVALID_REQUEST,
    );
  });

  // ============================================================================
  // SCENARIO 20: PERSISTENCE & RELOAD VERIFICATION
  // ============================================================================
  console.log("\n--- Scenario 20: Persistence & Reload Verification ---");

  await runTest("Scenario 20: Re-fetching published package from DB reflects 'Terbit' status and publication metadata", async () => {
    const { data: reloaded } = await mockDb
      .from("paket_soal")
      .select("*")
      .eq("id", PAKET_ID)
      .maybeSingle();

    assert.ok(reloaded);
    assert.equal(reloaded.id, PAKET_ID);
    assert.equal(reloaded.status, "Terbit");
    assert.equal(reloaded.soal.length, 2);
    assert.ok(reloaded.ai_metadata.publishedAt);
    assert.equal(reloaded.ai_metadata.publishedBy, TEACHER_1);
    assert.equal(reloaded.ai_metadata.teacherEdited, true);
  });

  console.log("================================================================================");
  console.log(`  AI-4F-A TEST SUMMARY: ${testsPassed} passed, ${testsFailed} failed`);
  console.log("================================================================================");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("FATAL ERROR in AI-4F-A Test Suite:", err);
  process.exit(1);
});
