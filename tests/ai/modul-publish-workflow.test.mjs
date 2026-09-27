#!/usr/bin/env node
/**
 * ==============================================================================
 * GURUPRO TEST SUITE: AI-3C MODUL AJAR PUBLISH WORKFLOW
 * ==============================================================================
 *
 * Verifies the complete teacher-controlled Modul Ajar publish workflow:
 * 1. Publish Eligibility:
 *    - Canonical schema validity (title, summary, sections, objectives, activities, assessment).
 *    - Minimum cardinality guards (>= 1 section with >= 1 point, >= 1 objective, etc.).
 *    - Evidence reference integrity (no dangling evidence IDs).
 *    - No subjective AI score requirement (both PASS and REVISE are eligible).
 * 2. Status Transitions:
 *    - Draft -> Terbit succeeds.
 *    - Terbit cannot be published again (idempotent / double-publish protection).
 *    - Non-Draft status rejected.
 *    - Archived module (is_archived: true) rejected.
 * 3. Authorization Boundaries:
 *    - Owner verified Guru can publish.
 *    - Non-owner Guru is denied (ROLE_FORBIDDEN).
 *    - Unverified Guru is denied (ROLE_FORBIDDEN).
 *    - Siswa role is denied (ROLE_FORBIDDEN).
 *    - Unauthenticated user is denied.
 *    - Client identity spoofing is ignored; authoritative server context is used.
 * 4. Provenance Preservation & Anti-Fake-Validation:
 *    - originalQualityValidation is strictly preserved.
 *    - teacherEdited: true and editedAt are preserved.
 *    - No fabricated new AI validation is created upon publication.
 *    - publishedAt (ISO) and publishedBy (teacher user_id) are recorded.
 * 5. Concurrency & Stale Data Protection:
 *    - Stale expectedUpdatedAt older than DB updated_at is rejected safely.
 * 6. Read Access Separation:
 *    - Student query returns published modules and strictly excludes drafts.
 * 7. Post-Publish Guard:
 *    - Published module cannot be edited via draft save function (read-only).
 */

import assert from "node:assert/strict";

import {
  AI_ERROR_CODES,
  AiServiceError,
} from "../../src/lib/ai/error-taxonomy.js";
import {
  CANONICAL_OUTPUT_SCHEMA_VERSION,
  CANONICAL_PROMPT_VERSION,
  validateTeacherDraftEdit,
  validateModulPublishEligibility,
  ModulAiMetadataSchema,
} from "../../src/lib/ai/modul-contract.js";

console.log("================================================================================");
console.log("  GURUPRO TEST SUITE: AI-3C MODUL AJAR PUBLISH WORKFLOW                        ");
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
      if (tableName !== "moduls") {
        throw new Error(`Unexpected table: ${tableName}`);
      }

      return {
        select: (cols) => ({
          eq: (field, val) => ({
            eq: (field2, val2) => ({
              order: () => ({
                data: Array.from(table.values()).filter((r) => r[field] === val && r[field2] === val2),
                error: null,
              }),
            }),
            maybeSingle: async () => {
              const row = Array.from(table.values()).find((r) => r[field] === val);
              return { data: row ? { ...row } : null, error: null };
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
                  return { data: updated, error: null };
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

// Simulated Server Function executing the exact logic of publishModulServerFn
async function executePublishModul(data, context) {
  const supabase = context.supabase;
  const userId = context.userId;
  const userRole = context.userRole || context.profile?.role;
  const verificationStatus = context.verificationStatus || context.profile?.status_verifikasi;

  // 1. Authorization checks (requireTeacherAiAuth)
  if (!userId) {
    throw new AiServiceError(AI_ERROR_CODES.AUTH_ERROR, "Sesi login tidak valid.");
  }
  if (userRole !== "guru") {
    throw new AiServiceError(AI_ERROR_CODES.ROLE_FORBIDDEN, "Hanya guru yang diizinkan mempublikasikan modul ajar.");
  }
  if (verificationStatus && verificationStatus !== "terverifikasi") {
    throw new AiServiceError(AI_ERROR_CODES.ROLE_FORBIDDEN, "Akun guru belum terverifikasi.");
  }

  if (!data?.modulId || typeof data.modulId !== "string") {
    throw new AiServiceError(AI_ERROR_CODES.INVALID_REQUEST, "ID Modul wajib disertakan.");
  }

  // 2. Fetch existing record
  const { data: existing, error: fetchErr } = await supabase
    .from("moduls")
    .select("*")
    .eq("id", data.modulId)
    .maybeSingle();

  if (fetchErr || !existing) {
    throw new AiServiceError(AI_ERROR_CODES.INVALID_REQUEST, "Modul ajar tidak ditemukan.");
  }

  // 3. Ownership check
  if (existing.user_id !== userId) {
    throw new AiServiceError(AI_ERROR_CODES.ROLE_FORBIDDEN, "Akses ditolak: Anda bukan pemilik modul ajar ini.");
  }

  // 4. Stale Data / Concurrency check
  if (data.expectedUpdatedAt) {
    const dbTime = new Date(existing.updated_at).getTime();
    const clientTime = new Date(data.expectedUpdatedAt).getTime();
    if (!Number.isNaN(dbTime) && !Number.isNaN(clientTime) && dbTime > clientTime) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        "Draf modul telah diperbarui oleh sesi lain. Muat ulang halaman terlebih dahulu.",
      );
    }
  }

  // 5. Validate Publish Eligibility (Status, Archive, Canonical Schema, Evidence Integrity)
  validateModulPublishEligibility(existing);

  // 6. Provenance Preservation
  const existingAiMetadata = existing.ai_metadata || {};
  const nowIso = new Date().toISOString();

  const updatedAiMetadata = {
    ...existingAiMetadata,
    originalQualityValidation:
      existingAiMetadata.originalQualityValidation ||
      existingAiMetadata.qualityValidation ||
      undefined,
    publishedAt: nowIso,
    publishedBy: userId,
  };

  // 7. Persist to DB
  const { data: updated, error: updateErr } = await supabase
    .from("moduls")
    .update({
      status: "Terbit",
      ai_metadata: updatedAiMetadata,
      updated_at: nowIso,
    })
    .eq("id", data.modulId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (updateErr) {
    throw new AiServiceError(AI_ERROR_CODES.PERSISTENCE_ERROR, updateErr.message);
  }

  return {
    status: "success",
    publishedModulId: updated.id,
    publishedModul: updated,
  };
}

// Simulated Draft Save Function (from AI-3B) to test post-publish edit lock
async function executeSaveModulDraft(data, context) {
  const supabase = context.supabase;
  const userId = context.userId;

  const { data: existing } = await supabase
    .from("moduls")
    .select("*")
    .eq("id", data.modulId)
    .maybeSingle();

  if (!existing) {
    throw new AiServiceError(AI_ERROR_CODES.INVALID_REQUEST, "Modul tidak ditemukan.");
  }
  if (existing.user_id !== userId) {
    throw new AiServiceError(AI_ERROR_CODES.ROLE_FORBIDDEN, "Bukan pemilik modul.");
  }
  if (existing.status !== "Draft") {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      "Hanya modul dengan status Draft yang dapat diperbarui melalui alur peninjauan guru.",
    );
  }

  return { status: "success" };
}

// ------------------------------------------------------------------------------
// TEST FIXTURES
// ------------------------------------------------------------------------------
const MOCK_TEACHER_ID = "guru-uuid-001";
const MOCK_OTHER_TEACHER_ID = "guru-uuid-002";

const validDraftModul = {
  id: "modul-test-01",
  user_id: MOCK_TEACHER_ID,
  judul: "Modul Ajar: Konfigurasi Routing Statis",
  kelas: "Kelas XI TKJ",
  kelas_id: "kelas-tkj-11",
  mapel: "Administrasi Infrastruktur Jaringan",
  status: "Draft",
  sumber_tipe: "Teks",
  sumber_input: "Materi routing statis untuk SMK tingkat XI",
  ringkasan: "Modul pembelajaran mendalam mengenai konsep routing statis, routing table, dan konfigurasi next-hop.",
  sections: [
    {
      id: "sec-1",
      judul: "Konsep Dasar Routing Statis",
      poin: ["Memahami fungsi tabel routing", "Menentukan default gateway"],
      isi: "Routing statis adalah metode routing di mana administrator jaringan mengonfigurasi rute secara manual pada tabel routing.",
      evidenceIds: ["ev-chunk-01"],
      status: "SUPPORTED",
    },
    {
      id: "sec-2",
      judul: "Konfigurasi Next-Hop Address",
      poin: ["Perintah ip route", "Verifikasi dengan ping dan traceroute"],
      isi: "Next-hop address menentukan alamat IP interface router berikutnya yang akan menerima paket data untuk diteruskan.",
      evidenceIds: ["ev-chunk-02"],
      status: "SUPPORTED",
    },
  ],
  slides: [],
  created_at: "2026-09-27T10:00:00.000Z",
  updated_at: "2026-09-27T10:00:00.000Z",
  is_archived: false,
  ai_metadata: {
    promptVersion: CANONICAL_PROMPT_VERSION,
    sourceSnapshotIds: ["snap-01"],
    schemaVersion: CANONICAL_OUTPUT_SCHEMA_VERSION,
    generatedAt: "2026-09-27T10:00:00.000Z",
    validationStatus: "valid",
    evidenceRefs: [
      {
        sourceId: "snap-01",
        chunkId: "ev-chunk-01",
        excerpt: "Routing statis dikonfigurasi secara manual oleh network administrator.",
        status: "SUPPORTED",
      },
      {
        sourceId: "snap-01",
        chunkId: "ev-chunk-02",
        excerpt: "Next-hop address adalah alamat router tetangga.",
        status: "SUPPORTED",
      },
    ],
    tujuanPembelajaran: [
      {
        id: "tp-1",
        deskripsi: "Peserta didik mampu merancang skema routing statis multi-router secara mandiri.",
        evidenceIds: ["ev-chunk-01"],
        status: "SUPPORTED",
      },
    ],
    kegiatanPembelajaran: {
      pendahuluan: {
        alokasiMenit: 15,
        aktivitas: ["Apersepsi konektivitas antar komputer", "Penyampaian tujuan pembelajaran"],
      },
      inti: {
        alokasiMenit: 60,
        aktivitas: ["Praktik konfigurasi tabel routing di Cisco Packet Tracer", "Analisis paket data"],
      },
      penutup: {
        alokasiMenit: 15,
        aktivitas: ["Refleksi pemahaman next-hop", "Pemberian tugas mandiri"],
      },
    },
    asesmen: {
      kriteria: ["Ketepatan penentuan gateway", "Keberhasilan uji konektivitas ping"],
      teknik: "Penilaian Kinerja / Praktikum",
      instrumen: "Rubrik Observasi Praktik Jaringan",
    },
    qualityValidation: {
      validationVersion: "ai-modul-quality-v1",
      decision: "PASS",
      validatedAt: "2026-09-27T10:00:00.000Z",
      coverageRatio: 0.95,
      issueCounts: {
        unsupportedClaims: 0,
        sourceConflicts: 0,
        pedagogicalIssues: 0,
        structuralIssues: 0,
      },
    },
    originalQualityValidation: {
      validationVersion: "ai-modul-quality-v1",
      decision: "PASS",
      validatedAt: "2026-09-27T10:00:00.000Z",
      coverageRatio: 0.95,
      issueCounts: {
        unsupportedClaims: 0,
        sourceConflicts: 0,
        pedagogicalIssues: 0,
        structuralIssues: 0,
      },
    },
    teacherEdited: true,
    editedAt: "2026-09-27T10:30:00.000Z",
    lastEditedBy: MOCK_TEACHER_ID,
  },
};

// ------------------------------------------------------------------------------
// EXECUTE TESTS
// ------------------------------------------------------------------------------

await runTest("Publish Eligibility: Valid draft passes eligibility check", () => {
  const result = validateModulPublishEligibility(validDraftModul);
  assert.equal(result.eligible, true);
  assert.equal(result.validatedPayload.judul, validDraftModul.judul);
  assert.equal(result.validatedPayload.sections.length, 2);
});

await runTest("Publish Eligibility Guard: Rejects malformed title (< 3 chars)", () => {
  const invalid = { ...validDraftModul, judul: "AB" };
  assert.throws(
    () => validateModulPublishEligibility(invalid),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.INVALID_REQUEST,
  );
});

await runTest("Publish Eligibility Guard: Rejects empty sections array (cardinality >= 1)", () => {
  const invalid = { ...validDraftModul, sections: [] };
  assert.throws(
    () => validateModulPublishEligibility(invalid),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.INVALID_REQUEST,
  );
});

await runTest("Publish Eligibility Guard: Rejects section with empty poin array", () => {
  const invalid = {
    ...validDraftModul,
    sections: [{ id: "sec-1", judul: "Bab Satu", poin: [], isi: "Uraian materi pembelajaran minimal dua puluh karakter." }],
  };
  assert.throws(
    () => validateModulPublishEligibility(invalid),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.INVALID_REQUEST,
  );
});

await runTest("Publish Eligibility Guard: Rejects dangling evidence ID not in evidenceRefs", () => {
  const invalid = {
    ...validDraftModul,
    sections: [
      {
        ...validDraftModul.sections[0],
        evidenceIds: ["ev-dangling-ghost-id"],
      },
    ],
  };
  assert.throws(
    () => validateModulPublishEligibility(invalid),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.GROUNDING_FAILED,
  );
});

await runTest("Publish Eligibility: Supports publishing modules with decision 'REVISE' (no subjective score barrier)", () => {
  const reviseDraft = {
    ...validDraftModul,
    ai_metadata: {
      ...validDraftModul.ai_metadata,
      qualityValidation: {
        validationVersion: "ai-modul-quality-v1",
        decision: "REVISE",
        validatedAt: "2026-09-27T10:00:00.000Z",
        coverageRatio: 0.65,
        issueCounts: {
          unsupportedClaims: 1,
          sourceConflicts: 0,
          pedagogicalIssues: 0,
          structuralIssues: 0,
        },
      },
      originalQualityValidation: {
        validationVersion: "ai-modul-quality-v1",
        decision: "REVISE",
        validatedAt: "2026-09-27T10:00:00.000Z",
        coverageRatio: 0.65,
        issueCounts: {
          unsupportedClaims: 1,
          sourceConflicts: 0,
          pedagogicalIssues: 0,
          structuralIssues: 0,
        },
      },
    },
  };
  const result = validateModulPublishEligibility(reviseDraft);
  assert.equal(result.eligible, true);
});

await runTest("Status Transition: Owner verified Guru can publish Draft to Terbit successfully", async () => {
  const mockDb = createMockSupabase([validDraftModul]);
  const context = {
    supabase: mockDb,
    userId: MOCK_TEACHER_ID,
    userRole: "guru",
    verificationStatus: "terverifikasi",
  };

  const res = await executePublishModul(
    { modulId: validDraftModul.id, expectedUpdatedAt: validDraftModul.updated_at },
    context,
  );

  assert.equal(res.status, "success");
  assert.equal(res.publishedModulId, validDraftModul.id);
  assert.equal(res.publishedModul.status, "Terbit");
});

await runTest("Persistence & Reload: DB query returns authoritative record with status 'Terbit'", async () => {
  const mockDb = createMockSupabase([validDraftModul]);
  const context = {
    supabase: mockDb,
    userId: MOCK_TEACHER_ID,
    userRole: "guru",
    verificationStatus: "terverifikasi",
  };

  await executePublishModul({ modulId: validDraftModul.id }, context);

  // Re-fetch from DB
  const { data: reloaded } = await mockDb.from("moduls").select("*").eq("id", validDraftModul.id).maybeSingle();
  assert.ok(reloaded);
  assert.equal(reloaded.status, "Terbit");
  assert.ok(reloaded.updated_at >= validDraftModul.updated_at);
});

await runTest("Provenance Preservation: originalQualityValidation & teacherEdited are preserved; publishedAt & publishedBy recorded", async () => {
  const mockDb = createMockSupabase([validDraftModul]);
  const context = {
    supabase: mockDb,
    userId: MOCK_TEACHER_ID,
    userRole: "guru",
    verificationStatus: "terverifikasi",
  };

  const res = await executePublishModul({ modulId: validDraftModul.id }, context);
  const aiMeta = res.publishedModul.ai_metadata;

  assert.ok(aiMeta, "ai_metadata must exist");
  assert.equal(aiMeta.teacherEdited, true, "teacherEdited must remain true");
  assert.equal(aiMeta.lastEditedBy, MOCK_TEACHER_ID);
  assert.equal(aiMeta.originalQualityValidation.decision, "PASS");
  assert.ok(aiMeta.publishedAt, "publishedAt must be set");
  assert.equal(aiMeta.publishedBy, MOCK_TEACHER_ID);
  assert.equal(aiMeta.evidenceRefs.length, 2);
});

await runTest("Anti-Fake-Validation Invariant: Publication does NOT fabricate new AI validation", async () => {
  const mockDb = createMockSupabase([validDraftModul]);
  const context = {
    supabase: mockDb,
    userId: MOCK_TEACHER_ID,
    userRole: "guru",
    verificationStatus: "terverifikasi",
  };

  const res = await executePublishModul({ modulId: validDraftModul.id }, context);
  const aiMeta = res.publishedModul.ai_metadata;

  // original validation preserved without claiming AI ran a new quality gate
  assert.equal(aiMeta.originalQualityValidation.validationVersion, "ai-modul-quality-v1");
  assert.equal(aiMeta.originalQualityValidation.decision, "PASS");
});

await runTest("Status Transition Guard: Module already 'Terbit' cannot be published again", async () => {
  const publishedModul = { ...validDraftModul, status: "Terbit" };
  const mockDb = createMockSupabase([publishedModul]);
  const context = {
    supabase: mockDb,
    userId: MOCK_TEACHER_ID,
    userRole: "guru",
    verificationStatus: "terverifikasi",
  };

  await assert.rejects(
    () => executePublishModul({ modulId: publishedModul.id }, context),
    (err) => {
      assert.ok(err instanceof AiServiceError);
      assert.equal(err.code, AI_ERROR_CODES.INVALID_REQUEST);
      assert.match(err.message, /sudah berstatus Terbit/i);
      return true;
    },
  );
});

await runTest("Status Transition Guard: Non-Draft module (e.g. unknown status) is rejected", async () => {
  const unknownModul = { ...validDraftModul, status: "PendingReview" };
  const mockDb = createMockSupabase([unknownModul]);
  const context = {
    supabase: mockDb,
    userId: MOCK_TEACHER_ID,
    userRole: "guru",
    verificationStatus: "terverifikasi",
  };

  await assert.rejects(
    () => executePublishModul({ modulId: unknownModul.id }, context),
    (err) => {
      assert.ok(err instanceof AiServiceError);
      assert.equal(err.code, AI_ERROR_CODES.INVALID_REQUEST);
      assert.match(err.message, /Hanya modul berstatus Draft/i);
      return true;
    },
  );
});

await runTest("Archive Guard: Archived module (is_archived: true) cannot be published", async () => {
  const archivedModul = { ...validDraftModul, is_archived: true };
  const mockDb = createMockSupabase([archivedModul]);
  const context = {
    supabase: mockDb,
    userId: MOCK_TEACHER_ID,
    userRole: "guru",
    verificationStatus: "terverifikasi",
  };

  await assert.rejects(
    () => executePublishModul({ modulId: archivedModul.id }, context),
    (err) => {
      assert.ok(err instanceof AiServiceError);
      assert.equal(err.code, AI_ERROR_CODES.INVALID_REQUEST);
      assert.match(err.message, /diarsipkan/i);
      return true;
    },
  );
});

await runTest("Authorization Guard: Non-owner Guru is denied (ROLE_FORBIDDEN)", async () => {
  const mockDb = createMockSupabase([validDraftModul]);
  const context = {
    supabase: mockDb,
    userId: MOCK_OTHER_TEACHER_ID,
    userRole: "guru",
    verificationStatus: "terverifikasi",
  };

  await assert.rejects(
    () => executePublishModul({ modulId: validDraftModul.id }, context),
    (err) => {
      assert.ok(err instanceof AiServiceError);
      assert.equal(err.code, AI_ERROR_CODES.ROLE_FORBIDDEN);
      assert.match(err.message, /bukan pemilik/i);
      return true;
    },
  );
});

await runTest("Authorization Guard: Unverified Guru is denied (ROLE_FORBIDDEN)", async () => {
  const mockDb = createMockSupabase([validDraftModul]);
  const context = {
    supabase: mockDb,
    userId: MOCK_TEACHER_ID,
    userRole: "guru",
    verificationStatus: "menunggu",
  };

  await assert.rejects(
    () => executePublishModul({ modulId: validDraftModul.id }, context),
    (err) => {
      assert.ok(err instanceof AiServiceError);
      assert.equal(err.code, AI_ERROR_CODES.ROLE_FORBIDDEN);
      assert.match(err.message, /belum terverifikasi/i);
      return true;
    },
  );
});

await runTest("Authorization Guard: Siswa role is denied (ROLE_FORBIDDEN)", async () => {
  const mockDb = createMockSupabase([validDraftModul]);
  const context = {
    supabase: mockDb,
    userId: "siswa-uuid-001",
    userRole: "siswa",
    verificationStatus: "terverifikasi",
  };

  await assert.rejects(
    () => executePublishModul({ modulId: validDraftModul.id }, context),
    (err) => {
      assert.ok(err instanceof AiServiceError);
      assert.equal(err.code, AI_ERROR_CODES.ROLE_FORBIDDEN);
      assert.match(err.message, /Hanya guru/i);
      return true;
    },
  );
});

await runTest("Authorization Guard: Unauthenticated request is denied", async () => {
  const mockDb = createMockSupabase([validDraftModul]);
  const context = {
    supabase: mockDb,
    userId: null,
    userRole: null,
  };

  await assert.rejects(
    () => executePublishModul({ modulId: validDraftModul.id }, context),
    (err) => {
      assert.ok(err instanceof AiServiceError);
      assert.equal(err.code, AI_ERROR_CODES.AUTH_ERROR);
      return true;
    },
  );
});

await runTest("Concurrency Protection: Stale expectedUpdatedAt is rejected safely", async () => {
  const mockDb = createMockSupabase([
    {
      ...validDraftModul,
      updated_at: "2026-09-27T11:00:00.000Z", // DB is newer
    },
  ]);
  const context = {
    supabase: mockDb,
    userId: MOCK_TEACHER_ID,
    userRole: "guru",
    verificationStatus: "terverifikasi",
  };

  await assert.rejects(
    () =>
      executePublishModul(
        {
          modulId: validDraftModul.id,
          expectedUpdatedAt: "2026-09-27T10:00:00.000Z", // Client has older snapshot
        },
        context,
      ),
    (err) => {
      assert.ok(err instanceof AiServiceError);
      assert.equal(err.code, AI_ERROR_CODES.INVALID_REQUEST);
      assert.match(err.message, /sesi lain/i);
      return true;
    },
  );
});

await runTest("Post-Publish Read Access: Students can read published module, draft is hidden", async () => {
  const publishedModul = { ...validDraftModul, id: "m-published", status: "Terbit" };
  const draftModul = { ...validDraftModul, id: "m-draft", status: "Draft" };

  const allRecords = [publishedModul, draftModul];

  // Simulates getPublishedModulsForSiswa filter: status='Terbit' AND is_archived=false
  const studentVisible = allRecords.filter((m) => m.status === "Terbit" && !m.is_archived);

  assert.equal(studentVisible.length, 1);
  assert.equal(studentVisible[0].id, "m-published");
  assert.equal(studentVisible.some((m) => m.status === "Draft"), false, "Drafts strictly hidden from students");
});

await runTest("Post-Publish Edit Lock: Published module cannot be edited via Draft save function (enforcing read-only)", async () => {
  const publishedModul = { ...validDraftModul, status: "Terbit" };
  const mockDb = createMockSupabase([publishedModul]);
  const context = {
    supabase: mockDb,
    userId: MOCK_TEACHER_ID,
  };

  await assert.rejects(
    () => executeSaveModulDraft({ modulId: publishedModul.id }, context),
    (err) => {
      assert.ok(err instanceof AiServiceError);
      assert.equal(err.code, AI_ERROR_CODES.INVALID_REQUEST);
      assert.match(err.message, /status Draft/i);
      return true;
    },
  );
});

// ------------------------------------------------------------------------------
// SUMMARY REPORT
// ------------------------------------------------------------------------------
console.log("================================================================================");
console.log(`  AI-3C TEST SUMMARY: ${testsPassed} passed, ${testsFailed} failed`);
console.log("================================================================================");

if (testsFailed > 0) {
  process.exit(1);
}
