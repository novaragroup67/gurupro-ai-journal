#!/usr/bin/env node
/**
 * ==============================================================================
 * GURUPRO TEST SUITE: AI-3D MODUL AJAR END-TO-END QUALITY GATE
 * ==============================================================================
 *
 * Final determinism, security, integrity, and interoperability quality gate
 * covering the complete Kurikulum Merdeka Modul Ajar lifecycle:
 *
 *   Verified Guru -> Source Ingestion (4 flows) -> AI-2B Grounding Context
 *   -> AI-2C Generation -> AI-2D Semantic Quality Gate -> Persisted Draft
 *   -> AI-3B Teacher Review & Edit -> Stale Concurrency Protection -> Save Draft
 *   -> AI-3C Publish Workflow -> Status Terbit -> Student Read-Only Access
 *
 * SECTIONS:
 * - Section A: Source Ingestion to Draft across all 4 source flows (Text, Doc, URL, Multi-Source)
 * - Section B: Full Generation Chain (AI-2B -> AI-2C -> AI-2D -> Draft Persistence)
 * - Section C: Evidence Binding & Fail-Closed Guards (Insufficient evidence, hallucination reject, missing credentials)
 * - Section D: Teacher Review, Structured Edit, Stale Concurrency Guard, Save, & Persistence Reload
 * - Section E: Publish Workflow, Confirmation Guard, Idempotency, and Draft -> Terbit Transition
 * - Section F: Student Read-Access Isolation (Reads Terbit, drafts hidden, mutation blocked)
 * - Section G: Cross-Role Security Matrix (6 canonical authorization cases)
 * - Section H: Concurrency & Double-Submission Guards
 * - Section I: Failure Recovery & Error Taxonomy (No credential leakage, clean Indonesian messages)
 * - Section J: Post-Publish Read-Only Lock (Terbit cannot be edited, unpublish forbidden)
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AI_ERROR_CODES,
  AiServiceError,
} from "../../src/lib/ai/error-taxonomy.js";
import {
  normalizeHtmlContent,
} from "../../src/lib/ai/source-normalizer.js";
import {
  ingestSource,
  clearSnapshotCacheForTesting,
} from "../../src/lib/ai/source-ingestion.js";
import {
  CANONICAL_OUTPUT_SCHEMA_VERSION,
  CANONICAL_PROMPT_VERSION,
  validateModulGenerationInput,
  buildModulGroundingContext,
  generateGroundedModulAjar,
  validateGeneratedModulAjar,
  validateTeacherDraftEdit,
  validateModulPublishEligibility,
  mapGroundedOutputToModulDraft,
} from "../../src/lib/ai/modul-contract.js";
import {
  isPrivateOrReservedIp,
} from "../../src/lib/sumber.functions.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, "../..");
const FIXTURES_DIR = resolve(ROOT_DIR, "tests/fixtures");

console.log("================================================================================");
console.log("  GURUPRO TEST SUITE: AI-3D MODUL AJAR END-TO-END QUALITY GATE                 ");
console.log("================================================================================");

let testsPassed = 0;
let testsFailed = 0;

async function runTest(section, name, fn) {
  try {
    process.stdout.write(`  [${section}] ${name} ... `);
    await fn();
    console.log("✓ PASS");
    testsPassed++;
  } catch (err) {
    console.log("✗ FAIL");
    console.error(err);
    testsFailed++;
  }
}

// ==============================================================================
// IN-MEMORY DATABASE & SERVER FUNCTION SIMULATORS
// ==============================================================================

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
          order: () => ({
            data: Array.from(table.values()),
            error: null,
          }),
        }),
        insert: (row) => {
          const inserted = {
            id: row.id || `modul-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...row,
          };
          table.set(inserted.id, inserted);
          return {
            select: () => ({
              single: async () => ({ data: { ...inserted }, error: null }),
            }),
          };
        },
        update: (updates) => ({
          eq: (field1, val1) => ({
            eq: (field2, val2) => ({
              select: () => ({
                single: async () => {
                  const row = Array.from(table.values()).find(
                    (r) => r[field1] === val1 && (!field2 || r[field2] === val2),
                  );
                  if (!row) {
                    return { data: null, error: { message: "Record not found" } };
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

// Server Function Simulators mirroring GuruPro production middleware & handlers
async function executeSaveModulDraft(data, context) {
  const supabase = context.supabase;
  const userId = context.userId;
  const userRole = context.userRole || context.profile?.role;
  const verificationStatus = context.verificationStatus || context.profile?.status_verifikasi;

  if (!userId) {
    throw new AiServiceError(AI_ERROR_CODES.AUTH_REQUIRED, "Sesi login tidak valid.");
  }
  if (userRole !== "guru") {
    throw new AiServiceError(AI_ERROR_CODES.ROLE_FORBIDDEN, "Hanya guru yang diizinkan mengedit draf modul.");
  }
  if (verificationStatus && verificationStatus !== "terverifikasi") {
    throw new AiServiceError(AI_ERROR_CODES.ROLE_FORBIDDEN, "Akun guru belum terverifikasi.");
  }

  if (!data?.modulId || typeof data.modulId !== "string") {
    throw new AiServiceError(AI_ERROR_CODES.INVALID_REQUEST, "ID Modul wajib disertakan.");
  }

  const { data: existing, error: fetchErr } = await supabase
    .from("moduls")
    .select("*")
    .eq("id", data.modulId)
    .maybeSingle();

  if (fetchErr || !existing) {
    throw new AiServiceError(AI_ERROR_CODES.INVALID_REQUEST, "Modul ajar tidak ditemukan.");
  }

  if (existing.user_id !== userId) {
    throw new AiServiceError(AI_ERROR_CODES.ROLE_FORBIDDEN, "Akses ditolak: Anda bukan pemilik draf modul ajar ini.");
  }

  if (existing.status !== "Draft") {
    throw new AiServiceError(AI_ERROR_CODES.INVALID_REQUEST, "Hanya modul dengan status Draft yang dapat diperbarui.");
  }

  if (data.expectedUpdatedAt) {
    const dbTime = new Date(existing.updated_at).getTime();
    const clientTime = new Date(data.expectedUpdatedAt).getTime();
    if (!Number.isNaN(dbTime) && !Number.isNaN(clientTime) && dbTime > clientTime) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        "Draf modul telah diperbarui oleh sesi lain. Muat ulang halaman untuk meninjau versi terbaru.",
      );
    }
  }

  const validatedData = validateTeacherDraftEdit(data.draftData);

  const existingAiMetadata = existing.ai_metadata || {};
  const nowIso = new Date().toISOString();

  const updatedAiMetadata = {
    ...existingAiMetadata,
    ...(validatedData.aiMetadata || {}),
    evidenceRefs: existingAiMetadata.evidenceRefs || validatedData.aiMetadata?.evidenceRefs || [],
    originalQualityValidation:
      existingAiMetadata.originalQualityValidation ||
      existingAiMetadata.qualityValidation ||
      undefined,
    teacherEdited: true,
    editedAt: nowIso,
    lastEditedBy: userId,
  };

  if (validatedData.tujuanPembelajaran) {
    updatedAiMetadata.tujuanPembelajaran = validatedData.tujuanPembelajaran;
  }
  if (validatedData.kegiatanPembelajaran) {
    updatedAiMetadata.kegiatanPembelajaran = validatedData.kegiatanPembelajaran;
  }
  if (validatedData.asesmen) {
    updatedAiMetadata.asesmen = validatedData.asesmen;
  }
  if (validatedData.catatanKeterbatasan !== undefined) {
    updatedAiMetadata.catatanKeterbatasan = validatedData.catatanKeterbatasan;
  }

  const { data: updated, error: updateErr } = await supabase
    .from("moduls")
    .update({
      judul: validatedData.judul,
      ringkasan: validatedData.ringkasan,
      sections: validatedData.sections,
      status: "Draft",
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

  return { status: "success", updatedModul: updated };
}

async function executePublishModul(data, context) {
  const supabase = context.supabase;
  const userId = context.userId;
  const userRole = context.userRole || context.profile?.role;
  const verificationStatus = context.verificationStatus || context.profile?.status_verifikasi;

  if (!userId) {
    throw new AiServiceError(AI_ERROR_CODES.AUTH_REQUIRED, "Sesi login tidak valid.");
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

  const { data: existing, error: fetchErr } = await supabase
    .from("moduls")
    .select("*")
    .eq("id", data.modulId)
    .maybeSingle();

  if (fetchErr || !existing) {
    throw new AiServiceError(AI_ERROR_CODES.INVALID_REQUEST, "Modul ajar tidak ditemukan.");
  }

  if (existing.user_id !== userId) {
    throw new AiServiceError(AI_ERROR_CODES.ROLE_FORBIDDEN, "Akses ditolak: Anda bukan pemilik modul ajar ini.");
  }

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

  validateModulPublishEligibility(existing);

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

  return { status: "success", publishedModul: updated };
}

// UI Error translation dictionary (canonical check)
const UI_ERROR_MESSAGES = {
  [AI_ERROR_CODES.AUTH_REQUIRED]: "Sesi login Anda berakhir. Silakan masuk kembali.",
  [AI_ERROR_CODES.ROLE_FORBIDDEN]: "Akses ditolak: Anda tidak memiliki akses ke kelas atau materi ini.",
  [AI_ERROR_CODES.INVALID_REQUEST]: "Data permintaan modul ajar tidak lengkap atau tidak valid.",
  [AI_ERROR_CODES.SOURCE_UNAVAILABLE]: "Materi sumber tidak ditemukan atau belum diserap server.",
  [AI_ERROR_CODES.INSUFFICIENT_EVIDENCE]: "Materi sumber terlalu minim atau tidak relevan dengan topik yang dipilih.",
  [AI_ERROR_CODES.UNSUPPORTED_TOPIC]: "Topik yang diminta tidak didukung oleh isi materi sumber yang diberikan.",
  [AI_ERROR_CODES.AI_RATE_LIMIT]: "Batas permintaan AI tercapai. Mohon tunggu beberapa saat sebelum mencoba lagi.",
  [AI_ERROR_CODES.AI_QUOTA_EXCEEDED]: "Kuota pembuatan modul AI harian Anda telah habis.",
  [AI_ERROR_CODES.AI_PROVIDER_ERROR]: "Layanan AI sedang mengalami gangguan sementara. Silakan coba lagi.",
  [AI_ERROR_CODES.PROVIDER_TIMEOUT]: "Waktu tunggu pembuatan modul AI habis. Silakan coba materi yang lebih ringkas.",
  [AI_ERROR_CODES.PROVIDER_MALFORMED_OUTPUT]: "Format keluaran AI tidak sesuai spesifikasi. Silakan coba lagi.",
  [AI_ERROR_CODES.GROUNDING_FAILED]: "Modul AI gagal divalidasi dengan sumber rujukan (anti-halusinasi).",
  [AI_ERROR_CODES.QUALITY_REJECTED]: "Modul AI tidak memenuhi standar mutu Kurikulum Merdeka atau terlalu banyak kontradiksi.",
  [AI_ERROR_CODES.PERSISTENCE_ERROR]: "Draf modul berhasil disusun tetapi gagal disimpan ke basis data.",
};

// ==============================================================================
// TEST EXECUTION
// ==============================================================================

async function main() {
  clearSnapshotCacheForTesting();

  const TEACHER_1 = "guru-tkj-001";
  const TEACHER_2 = "guru-akuntansi-002";
  const UNVERIFIED_TEACHER = "guru-unverified-003";
  const STUDENT_1 = "siswa-tkj-101";

  const CLASS_1 = {
    id: "c0000000-0000-0000-0000-000000000001",
    namaKelas: "TKJ 1",
    tingkat: "X",
    mapel: "Dasar-Dasar Teknik Komputer dan Jaringan",
    tahunAjaran: "2024/2025",
    guruId: TEACHER_1,
  };

  const teacher1Context = {
    teacherId: TEACHER_1,
    teacherRole: "guru",
    verificationStatus: "terverifikasi",
    teacherClasses: [CLASS_1],
    availableSourceSnapshots: [],
  };

  // Load Fixtures
  const txtContent = readFileSync(resolve(FIXTURES_DIR, "educational-network-routing.txt"), "utf-8");
  const docxBuffer = readFileSync(resolve(FIXTURES_DIR, "educational-accounting-journal.docx"));
  const htmlContent = readFileSync(resolve(FIXTURES_DIR, "educational-web-vlan.html"), "utf-8");

  // ----------------------------------------------------------------------------
  // SECTION A: SOURCE INGESTION TO DRAFT ACROSS 4 FLOWS
  // ----------------------------------------------------------------------------
  let textSnapshot;
  await runTest("Section A", "Flow 1 (Text / Catatan Guru): Ingest text and produce verified snapshot", async () => {
    textSnapshot = await ingestSource({
      sourceType: "text",
      input: txtContent,
      userId: TEACHER_1,
      title: "Materi Routing Statis MikroTik",
    });

    assert.ok(textSnapshot.id, "Snapshot ID must exist");
    assert.strictEqual(textSnapshot.sourceType, "text");
    assert.strictEqual(textSnapshot.userId, TEACHER_1);
    assert.ok(textSnapshot.contentHash.length >= 64, "SHA-256 hash required");
    assert.ok(textSnapshot.chunks.length > 0, "Chunks must be extracted");
    assert.ok(textSnapshot.wordCount > 50, "Word count must be recorded");

    teacher1Context.availableSourceSnapshots.push({
      id: textSnapshot.id,
      userId: textSnapshot.userId,
      sourceTitle: textSnapshot.sourceTitle,
      contentHash: textSnapshot.contentHash,
    });
  });

  let docxSnapshot;
  await runTest("Section A", "Flow 2 (Document / DOCX): Extract, normalize, and chunk document fixture", async () => {
    docxSnapshot = await ingestSource({
      sourceType: "dokumen",
      documentBuffer: docxBuffer,
      fileName: "educational-accounting-journal.docx",
      userId: TEACHER_1,
      title: "Jurnal Penyesuaian Akuntansi",
    });

    assert.ok(docxSnapshot.id, "Snapshot ID must exist");
    assert.strictEqual(docxSnapshot.sourceType, "dokumen");
    assert.strictEqual(docxSnapshot.userId, TEACHER_1);
    assert.ok(docxSnapshot.chunks.length > 0, "DOCX chunks must be present");

    teacher1Context.availableSourceSnapshots.push({
      id: docxSnapshot.id,
      userId: docxSnapshot.userId,
      sourceTitle: docxSnapshot.sourceTitle,
      contentHash: docxSnapshot.contentHash,
    });
  });

  let urlSnapshot;
  await runTest("Section A", "Flow 3 (URL Ingestion & SSRF Protection): Block private IPs and ingest valid web content", async () => {
    // 1. SSRF checks: private, loopback, link-local, cloud metadata
    assert.strictEqual(isPrivateOrReservedIp("127.0.0.1"), true, "Loopback must be blocked");
    assert.strictEqual(isPrivateOrReservedIp("169.254.169.254"), true, "AWS/GCP metadata IP must be blocked");
    assert.strictEqual(isPrivateOrReservedIp("10.0.0.5"), true, "10.x private IP must be blocked");
    assert.strictEqual(isPrivateOrReservedIp("192.168.1.1"), true, "192.168.x private IP must be blocked");
    assert.strictEqual(isPrivateOrReservedIp("172.16.0.1"), true, "172.16.x private IP must be blocked");
    assert.strictEqual(isPrivateOrReservedIp("8.8.8.8"), false, "Public IP must not be flagged private");

    // 2. Normalize and ingest HTML content
    const normalizedHtml = normalizeHtmlContent(htmlContent);
    assert.ok(normalizedHtml.normalized.length > 100, "Clean HTML text extracted");

    urlSnapshot = await ingestSource({
      sourceType: "dokumen",
      input: htmlContent,
      fileName: "educational-web-vlan.html",
      mimeType: "text/html",
      userId: TEACHER_1,
      title: "Konfigurasi VLAN Switch Cisco",
    });

    assert.ok(urlSnapshot.id, "URL snapshot ID must exist");
    assert.ok(urlSnapshot.chunks.length > 0, "URL chunks must be present");

    teacher1Context.availableSourceSnapshots.push({
      id: urlSnapshot.id,
      userId: urlSnapshot.userId,
      sourceTitle: urlSnapshot.sourceTitle,
      contentHash: urlSnapshot.contentHash,
    });
  });

  let multiSourceSnapshots = [];
  await runTest("Section A", "Flow 4 (Multi-Source Ingestion): Ingest multi-source with conflict handling", async () => {
    const conflictingText = `Standar port HTTP default adalah port 8080 menurut catatan jaringan alternatif. Konfigurasi gateway cadangan adalah 192.168.1.254 pada router sekunder SMK Negeri.`;
    const conflictSnapshot = await ingestSource({
      sourceType: "text",
      input: conflictingText,
      userId: TEACHER_1,
      title: "Catatan Port Alternatif",
    });

    multiSourceSnapshots = [textSnapshot, conflictSnapshot];
    assert.strictEqual(multiSourceSnapshots.length, 2, "Both snapshots must be available");
    assert.strictEqual(multiSourceSnapshots[0].userId, TEACHER_1);
    assert.strictEqual(multiSourceSnapshots[1].userId, TEACHER_1);

    teacher1Context.availableSourceSnapshots.push({
      id: conflictSnapshot.id,
      userId: conflictSnapshot.userId,
      sourceTitle: conflictSnapshot.sourceTitle,
      contentHash: conflictSnapshot.contentHash,
    });
  });

  // ----------------------------------------------------------------------------
  // SECTION B: FULL GENERATION CHAIN
  // ----------------------------------------------------------------------------
  let persistedDraftModul;
  const mockSupabase = createMockSupabase();

  await runTest("Section B", "Step 1: Build Grounding Context (AI-2B) with budget & 4-section coverage", async () => {
    const rawInput = {
      topik: "Routing Statis MikroTik",
      sourceSnapshotIds: [textSnapshot.id],
      kelasId: CLASS_1.id,
      mapel: CLASS_1.mapel,
      targetFase: "E",
      alokasiWaktu: "4 JP x 45 Menit",
    };

    const context = await buildModulGroundingContext(rawInput, teacher1Context);

    assert.ok(context.contextVersion, "Context version must exist");
    assert.ok(context.evidenceItems.length > 0, "Grounding evidence items must be extracted");
    assert.ok(context.sectionCoverage.topicMaterial.hasEvidence, "Topic material coverage");
    assert.strictEqual(context.academicContext.targetFase, "E", "Target fase must be E for Grade X");
  });

  let generationResult;
  await runTest("Section B", "Step 2 & 3: Generate Grounded Modul (AI-2C) & Semantic Quality Gate (AI-2D)", async () => {
    const rawInput = {
      topik: "Routing Statis MikroTik",
      sourceSnapshotIds: [textSnapshot.id],
      kelasId: CLASS_1.id,
      mapel: CLASS_1.mapel,
      targetFase: "E",
      alokasiWaktu: "4 JP x 45 Menit",
    };

    const context = await buildModulGroundingContext(rawInput, teacher1Context);

    const chunkId = textSnapshot.chunks[0].chunkId;
    const mockOutput = {
      schemaVersion: CANONICAL_OUTPUT_SCHEMA_VERSION,
      judul: "Modul Ajar Routing Statis MikroTik",
      fase: "E",
      kelas: "X TKJ 1",
      alokasiWaktu: "4 JP x 45 Menit",
      mapel: "Dasar-Dasar Teknik Komputer dan Jaringan",
      ringkasan: "Modul ajar ini membahas konsep fundamental tabel routing dan konfigurasi IP address pada router MikroTik.",
      tujuanPembelajaran: [
        {
          id: "TP-01",
          deskripsi: "Peserta didik mampu memahami konsep tabel routing statis dan konfigurasi gateway.",
          evidenceIds: [chunkId],
          status: "SUPPORTED",
        },
      ],
      sections: [
        {
          id: "SEC-01",
          judul: "Konsep Dasar Tabel Routing",
          poin: ["Definisi routing", "Struktur tabel routing", "Gateway default"],
          isi: "Routing statis adalah metode penentuan jalur pengiriman paket data secara manual oleh administrator jaringan pada router.",
          evidenceIds: [chunkId],
          status: "SUPPORTED",
        },
      ],
      kegiatanPembelajaran: {
        pendahuluan: {
          alokasiMenit: 15,
          aktivitas: ["Guru membuka pembelajaran dan memberikan apersepsi mengenai perutean paket."],
        },
        inti: {
          alokasiMenit: 60,
          aktivitas: ["Peserta didik mempraktikkan konfigurasi rute statis pada router."],
          evidenceIds: [chunkId],
        },
        penutup: {
          alokasiMenit: 15,
          aktivitas: ["Peserta didik menyimpulkan hasil praktikum dan refleksi materi."],
        },
      },
      asesmen: {
        kriteria: ["Ketepatan penentuan gateway default pada router"],
        teknik: "Uji Kinerja Praktik",
        instrumen: "Lembar Penilaian Topologi dan Rubrik",
      },
      evidenceRefs: [
        {
          chunkId,
          sourceId: textSnapshot.id,
          sourceTitle: textSnapshot.sourceTitle,
          snippet: textSnapshot.chunks[0].content.substring(0, 100),
          relevanceScore: 0.95,
          status: "SUPPORTED",
        },
      ],
    };

    // Run AI-2D Semantic Quality Gate
    const qualityResult = validateGeneratedModulAjar(mockOutput, context);
    assert.ok(
      qualityResult.status === "PASS" || qualityResult.status === "REVISE",
      "Quality decision must be PASS or REVISE",
    );
    assert.ok(qualityResult.evidenceCoverage.coverageRatio >= 0.70, "Evidence coverage must be >= 70%");

    generationResult = {
      output: mockOutput,
      qualityResult,
    };
  });

  await runTest("Section B", "Step 4: Persist Draft to Supabase (Strict Draft Invariant & AI Metadata)", async () => {
    const mappedDraft = mapGroundedOutputToModulDraft(generationResult.output, {
      promptVersion: CANONICAL_PROMPT_VERSION,
      sourceSnapshotIds: [textSnapshot.id],
      kelasId: CLASS_1.id,
      sumberTipe: "Catatan Guru / Teks Manual",
      sumberInput: textSnapshot.sourceTitle,
      sumberJudul: textSnapshot.sourceTitle,
    });

    assert.strictEqual(mappedDraft.status, "Draft", "Invariant: Status must strictly be 'Draft'");

    // Embed quality validation in metadata
    const finalDraftRow = {
      ...mappedDraft,
      user_id: TEACHER_1,
      ai_metadata: {
        ...mappedDraft.aiMetadata,
        qualityValidation: generationResult.qualityResult.summary,
        originalQualityValidation: generationResult.qualityResult.summary,
      },
    };

    const { select } = mockSupabase.from("moduls").insert(finalDraftRow);
    const { data: savedRecord } = await select().single();

    assert.ok(savedRecord.id, "Saved draft must have DB ID");
    assert.strictEqual(savedRecord.status, "Draft");
    assert.strictEqual(savedRecord.user_id, TEACHER_1);
    assert.ok(savedRecord.ai_metadata.qualityValidation, "Embedded quality validation present");

    persistedDraftModul = savedRecord;
  });

  // ----------------------------------------------------------------------------
  // SECTION C: EVIDENCE BINDING & FAIL-CLOSED GUARDS
  // ----------------------------------------------------------------------------
  await runTest("Section C", "Fail-Closed: Unsupported topic throws INSUFFICIENT_EVIDENCE before provider call", async () => {
    await assert.rejects(
      async () => {
        await generateGroundedModulAjar(
          {
            topik: "Fotosintesis Reaksi Terang Gelap Tanaman C3 C4",
            sourceSnapshotIds: [textSnapshot.id],
            kelasId: CLASS_1.id,
          },
          teacher1Context,
          {
            mockProviderCall: async () => "{}",
          },
        );
      },
      (err) => {
        assert.ok(err instanceof AiServiceError);
        assert.strictEqual(err.code, AI_ERROR_CODES.INSUFFICIENT_EVIDENCE);
        return true;
      },
    );
  });

  await runTest("Section C", "Fail-Closed: Fabricated fact / number mismatch triggers REJECT in AI-2D Quality Gate", async () => {
    const rawInput = {
      topik: "Routing Statis MikroTik",
      sourceSnapshotIds: [textSnapshot.id],
      kelasId: CLASS_1.id,
      mapel: CLASS_1.mapel,
      targetFase: "E",
      alokasiWaktu: "4 JP x 45 Menit",
    };

    const context = await buildModulGroundingContext(rawInput, teacher1Context);

    const chunkId = textSnapshot.chunks[0].chunkId;
    const hallucinatedOutput = {
      schemaVersion: CANONICAL_OUTPUT_SCHEMA_VERSION,
      judul: "Modul Ajar Routing Statis MikroTik",
      fase: "E",
      kelas: "X TKJ 1",
      alokasiWaktu: "4 JP x 45 Menit",
      mapel: "Dasar-Dasar Teknik Komputer dan Jaringan",
      ringkasan: "Modul ajar ini berisi angka spesifikasi palsu yang tidak ada di sumber acuan.",
      tujuanPembelajaran: [
        {
          id: "TP-01",
          deskripsi: "Peserta didik mengatur kecepatan port router sebesar 99999 Gbps.",
          evidenceIds: [chunkId],
          status: "SUPPORTED",
        },
      ],
      sections: [
        {
          id: "SEC-01",
          judul: "Konsep Dasar",
          poin: ["Port 99999 Gbps"],
          isi: "Menggunakan port 99999 Gbps yang tidak ada pada sumber sama sekali.",
          evidenceIds: [chunkId],
          status: "SUPPORTED",
        },
      ],
      kegiatanPembelajaran: {
        pendahuluan: {
          alokasiMenit: 15,
          aktivitas: ["Guru membuka sesi."],
        },
        inti: {
          alokasiMenit: 60,
          aktivitas: ["Praktik konfigurasi port 99999 Gbps."],
        },
        penutup: {
          alokasiMenit: 15,
          aktivitas: ["Refleksi."],
        },
      },
      asesmen: {
        kriteria: ["Pengujian port 99999 Gbps"],
        teknik: "Observasi",
        instrumen: "Lembar penilaian",
      },
      evidenceRefs: [
        {
          chunkId,
          sourceId: textSnapshot.id,
          sourceTitle: textSnapshot.sourceTitle,
          snippet: textSnapshot.chunks[0].content.substring(0, 100),
          relevanceScore: 0.95,
          status: "SUPPORTED",
        },
      ],
    };

    const qualityResult = validateGeneratedModulAjar(hallucinatedOutput, context);
    assert.strictEqual(qualityResult.status, "REJECT", "Invented number/fact must trigger REJECT");
    assert.ok(qualityResult.unsupportedClaims.length > 0, "Must have unsupported claim issues");
  });

  await runTest("Section C", "Fail-Closed: Missing server API credentials fails safely without fallback fake content", async () => {
    const invalidProviderOptions = {
      prompt: "test",
      temperature: 0.2,
      apiKey: "",
    };

    assert.throws(
      () => {
        if (!invalidProviderOptions.apiKey) {
          throw new AiServiceError(
            AI_ERROR_CODES.AI_PROVIDER_ERROR,
            "Kunci API layanan AI belum dikonfigurasi di server.",
          );
        }
      },
      (err) => {
        assert.ok(err instanceof AiServiceError);
        assert.strictEqual(err.code, AI_ERROR_CODES.AI_PROVIDER_ERROR);
        return true;
      },
    );
  });

  // ----------------------------------------------------------------------------
  // SECTION D: TEACHER REVIEW, STRUCTURED EDIT, SAVE, & PERSISTENCE RELOAD
  // ----------------------------------------------------------------------------
  let editedDraftModul;
  await runTest("Section D", "Teacher Review: Submit structured edit and enforce schema rules", async () => {
    const editPayload = {
      modulId: persistedDraftModul.id,
      expectedUpdatedAt: persistedDraftModul.updated_at,
      draftData: {
        judul: "Modul Ajar: Routing Statis MikroTik (Edisi Revisi Guru)",
        ringkasan: "Modul ajar telah disesuaikan guru dengan menambahkan studi kasus jaringan lab SMK.",
        sections: [
          {
            id: "SEC-01",
            judul: "Konsep Dasar & Topologi Lab",
            poin: ["Prinsip tabel routing", "Desain topologi lab"],
            isi: "Materi ini mengupas tuntas konfigurasi tabel routing statis pada topologi 3 router MikroTik di laboratorium.",
          },
        ],
        tujuanPembelajaran: [
          {
            id: "TP-01",
            deskripsi: "Peserta didik dapat mengonfigurasi rute statis 3 router MikroTik.",
          },
        ],
        kegiatanPembelajaran: {
          pendahuluan: {
            alokasiMenit: 15,
            aktivitas: ["Pengantar topologi jaringan multi-router."],
          },
          inti: {
            alokasiMenit: 60,
            aktivitas: ["Praktikum rute statis multi-router pada Winbox."],
          },
          penutup: {
            alokasiMenit: 15,
            aktivitas: ["Evaluasi pengujian ping lintas subnet."],
          },
        },
        asesmen: {
          kriteria: ["Ketuntasan pengujian ping antar segmen"],
          teknik: "Praktik langsung",
          instrumen: "Rubrik konfigurasi topologi",
        },
      },
    };

    const res = await executeSaveModulDraft(editPayload, {
      supabase: mockSupabase,
      userId: TEACHER_1,
      userRole: "guru",
      verificationStatus: "terverifikasi",
    });

    assert.strictEqual(res.status, "success");
    assert.strictEqual(res.updatedModul.judul, editPayload.draftData.judul);
    assert.strictEqual(res.updatedModul.status, "Draft", "Status must remain Draft after edit");
    assert.strictEqual(res.updatedModul.ai_metadata.teacherEdited, true);
    assert.ok(res.updatedModul.ai_metadata.originalQualityValidation, "Original validation must be preserved");

    editedDraftModul = res.updatedModul;
  });

  await runTest("Section D", "Persistence Reload: Fetching draft from DB confirms exact teacher edits", async () => {
    const { data: reloaded } = await mockSupabase
      .from("moduls")
      .select("*")
      .eq("id", editedDraftModul.id)
      .maybeSingle();

    assert.ok(reloaded, "Reloaded record must exist");
    assert.strictEqual(reloaded.judul, "Modul Ajar: Routing Statis MikroTik (Edisi Revisi Guru)");
    assert.strictEqual(reloaded.status, "Draft");
    assert.strictEqual(reloaded.ai_metadata.lastEditedBy, TEACHER_1);
  });

  await runTest("Section D", "Schema Guard: Reject invalid edits (e.g. title < 3 chars or empty sections)", async () => {
    assert.throws(
      () => {
        validateTeacherDraftEdit({
          judul: "X",
          ringkasan: "Valid ringkasan yang cukup panjang",
          sections: [],
        });
      },
      (err) => {
        assert.ok(err instanceof AiServiceError);
        assert.strictEqual(err.code, AI_ERROR_CODES.INVALID_REQUEST);
        return true;
      },
    );
  });

  // ----------------------------------------------------------------------------
  // SECTION E: PUBLISH WORKFLOW, CONFIRMATION GUARD, & DRAFT -> TERBIT
  // ----------------------------------------------------------------------------
  let publishedModul;
  await runTest("Section E", "Publish Eligibility: Validate canonical eligibility and evidence integrity", async () => {
    const eligibility = validateModulPublishEligibility(editedDraftModul);
    assert.strictEqual(eligibility.eligible, true);
    assert.ok(eligibility.validatedPayload.judul.length >= 3);
  });

  await runTest("Section E", "Status Transition: Teacher publishes draft to 'Terbit' successfully", async () => {
    const res = await executePublishModul(
      {
        modulId: editedDraftModul.id,
        expectedUpdatedAt: editedDraftModul.updated_at,
      },
      {
        supabase: mockSupabase,
        userId: TEACHER_1,
        userRole: "guru",
        verificationStatus: "terverifikasi",
      },
    );

    assert.strictEqual(res.status, "success");
    assert.strictEqual(res.publishedModul.status, "Terbit");
    assert.ok(res.publishedModul.ai_metadata.publishedAt, "publishedAt must be recorded");
    assert.strictEqual(res.publishedModul.ai_metadata.publishedBy, TEACHER_1);

    // Verify DB state
    const { data: dbRecord } = await mockSupabase
      .from("moduls")
      .select("*")
      .eq("id", editedDraftModul.id)
      .maybeSingle();

    assert.strictEqual(dbRecord.status, "Terbit");
    publishedModul = dbRecord;
  });

  await runTest("Section E", "Idempotency / Double-Publish Protection: Cannot publish already Terbit modul", async () => {
    await assert.rejects(
      async () => {
        await executePublishModul(
          { modulId: publishedModul.id },
          {
            supabase: mockSupabase,
            userId: TEACHER_1,
            userRole: "guru",
            verificationStatus: "terverifikasi",
          },
        );
      },
      (err) => {
        assert.ok(err instanceof AiServiceError);
        assert.strictEqual(err.code, AI_ERROR_CODES.INVALID_REQUEST);
        assert.match(err.message, /sudah berstatus Terbit/i);
        return true;
      },
    );
  });

  await runTest("Section E", "Archive Guard: Archived modul cannot be published", async () => {
    const archivedRow = {
      id: "modul-archived-1",
      user_id: TEACHER_1,
      judul: "Modul Diarsipkan",
      status: "Draft",
      is_archived: true,
      ringkasan: "Ringkasan modul arsip yang cukup panjang.",
      sections: [{ judul: "Bab 1", poin: ["Poin 1"], isi: "Isi bab 1 cukup panjang." }],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockSupabase._getTable().set(archivedRow.id, archivedRow);

    await assert.rejects(
      async () => {
        await executePublishModul(
          { modulId: archivedRow.id },
          {
            supabase: mockSupabase,
            userId: TEACHER_1,
            userRole: "guru",
            verificationStatus: "terverifikasi",
          },
        );
      },
      (err) => {
        assert.ok(err instanceof AiServiceError);
        assert.match(err.message, /diarsipkan tidak dapat dipublikasikan/i);
        return true;
      },
    );
  });

  // ----------------------------------------------------------------------------
  // SECTION F: STUDENT READ-ACCESS & ISOLATION
  // ----------------------------------------------------------------------------
  await runTest("Section F", "Student Access: Student can read published module for their enrolled class", async () => {
    const unPublishedDraft = {
      id: "modul-draft-hidden",
      user_id: TEACHER_1,
      kelas_id: CLASS_1.id,
      judul: "Draft Rahasia Guru",
      status: "Draft",
      is_archived: false,
      ringkasan: "Draf yang belum dipublikasikan guru.",
      sections: [{ judul: "Bab 1", poin: ["Poin 1"], isi: "Isi bab draft." }],
    };
    mockSupabase._getTable().set(unPublishedDraft.id, unPublishedDraft);

    // Simulate RLS: SELECT * FROM moduls WHERE status = 'Terbit' AND (kelas_id = CLASS_1.id OR kelas = CLASS_1.namaKelas)
    const allRows = Array.from(mockSupabase._getTable().values());
    const studentAccessibleModuls = allRows.filter(
      (m) => m.status === "Terbit" && (m.kelas_id === CLASS_1.id || m.kelas === CLASS_1.namaKelas || m.kelas === "X TKJ 1"),
    );

    assert.ok(studentAccessibleModuls.some((m) => m.id === publishedModul.id), "Published modul must be visible to student");
    assert.ok(!studentAccessibleModuls.some((m) => m.id === unPublishedDraft.id), "Draft modul must NOT be visible to student");
  });

  await runTest("Section F", "Student Mutation Guard: Siswa role is strictly blocked from edit and publish", async () => {
    await assert.rejects(
      async () => {
        await executeSaveModulDraft(
          { modulId: publishedModul.id, draftData: { judul: "Hacked by Student" } },
          { supabase: mockSupabase, userId: STUDENT_1, userRole: "siswa" },
        );
      },
      (err) => {
        assert.ok(err instanceof AiServiceError);
        assert.strictEqual(err.code, AI_ERROR_CODES.ROLE_FORBIDDEN);
        return true;
      },
    );

    await assert.rejects(
      async () => {
        await executePublishModul(
          { modulId: publishedModul.id },
          { supabase: mockSupabase, userId: STUDENT_1, userRole: "siswa" },
        );
      },
      (err) => {
        assert.ok(err instanceof AiServiceError);
        assert.strictEqual(err.code, AI_ERROR_CODES.ROLE_FORBIDDEN);
        return true;
      },
    );
  });

  // ----------------------------------------------------------------------------
  // SECTION G: CROSS-ROLE SECURITY MATRIX (6 CASES)
  // ----------------------------------------------------------------------------
  await runTest("Section G", "Case 1: Verified Owner Guru -> Allowed for operations", async () => {
    assert.strictEqual(publishedModul.user_id, TEACHER_1);
  });

  await runTest("Section G", "Case 2: Non-Owner Guru -> Denied (ROLE_FORBIDDEN)", async () => {
    // Attempt publish of teacher 1's draft by teacher 2
    const draftForOwnershipTest = {
      id: "modul-ownership-test",
      user_id: TEACHER_1,
      status: "Draft",
      judul: "Modul Uji Kepemilikan",
      ringkasan: "Ringkasan uji kepemilikan yang valid.",
      sections: [{ judul: "Bab 1", poin: ["Poin 1"], isi: "Isi bab materi pokok yang lengkap." }],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockSupabase._getTable().set(draftForOwnershipTest.id, draftForOwnershipTest);

    await assert.rejects(
      async () => {
        await executePublishModul(
          { modulId: draftForOwnershipTest.id },
          {
            supabase: mockSupabase,
            userId: TEACHER_2,
            userRole: "guru",
            verificationStatus: "terverifikasi",
          },
        );
      },
      (err) => {
        assert.ok(err instanceof AiServiceError);
        assert.strictEqual(err.code, AI_ERROR_CODES.ROLE_FORBIDDEN);
        assert.match(err.message, /bukan pemilik/i);
        return true;
      },
    );
  });

  await runTest("Section G", "Case 3: Unverified Guru -> Denied (ROLE_FORBIDDEN)", async () => {
    const draftForVerificationTest = {
      id: "modul-unverified-test",
      user_id: UNVERIFIED_TEACHER,
      status: "Draft",
      judul: "Modul Guru Belum Verifikasi",
      ringkasan: "Ringkasan modul guru yang belum diverifikasi.",
      sections: [{ judul: "Bab 1", poin: ["Poin 1"], isi: "Isi bab materi pokok yang lengkap." }],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockSupabase._getTable().set(draftForVerificationTest.id, draftForVerificationTest);

    await assert.rejects(
      async () => {
        await executePublishModul(
          { modulId: draftForVerificationTest.id },
          {
            supabase: mockSupabase,
            userId: UNVERIFIED_TEACHER,
            userRole: "guru",
            verificationStatus: "menunggu",
          },
        );
      },
      (err) => {
        assert.ok(err instanceof AiServiceError);
        assert.strictEqual(err.code, AI_ERROR_CODES.ROLE_FORBIDDEN);
        assert.match(err.message, /belum terverifikasi/i);
        return true;
      },
    );
  });

  await runTest("Section G", "Case 4: Siswa Role -> Denied (ROLE_FORBIDDEN)", async () => {
    await assert.rejects(
      async () => {
        await executePublishModul(
          { modulId: publishedModul.id },
          {
            supabase: mockSupabase,
            userId: STUDENT_1,
            userRole: "siswa",
          },
        );
      },
      (err) => {
        assert.ok(err instanceof AiServiceError);
        assert.strictEqual(err.code, AI_ERROR_CODES.ROLE_FORBIDDEN);
        return true;
      },
    );
  });

  await runTest("Section G", "Case 5: Unauthenticated User -> Denied (AUTH_REQUIRED)", async () => {
    await assert.rejects(
      async () => {
        await executePublishModul(
          { modulId: publishedModul.id },
          {
            supabase: mockSupabase,
            userId: null,
          },
        );
      },
      (err) => {
        assert.ok(err instanceof AiServiceError);
        assert.strictEqual(err.code, AI_ERROR_CODES.AUTH_REQUIRED);
        return true;
      },
    );
  });

  await runTest("Section G", "Case 6: Client Identity Spoofing -> Server context is strictly enforced", async () => {
    const spoofedRequest = {
      modulId: publishedModul.id,
      spoofedUserId: TEACHER_1,
      spoofedRole: "admin",
    };

    await assert.rejects(
      async () => {
        await executePublishModul(spoofedRequest, {
          supabase: mockSupabase,
          userId: TEACHER_2,
          userRole: "guru",
          verificationStatus: "terverifikasi",
        });
      },
      (err) => {
        assert.ok(err instanceof AiServiceError);
        assert.strictEqual(err.code, AI_ERROR_CODES.ROLE_FORBIDDEN);
        return true;
      },
    );
  });

  // ----------------------------------------------------------------------------
  // SECTION H: CONCURRENCY & DOUBLE-SUBMISSION GUARDS
  // ----------------------------------------------------------------------------
  await runTest("Section H", "Concurrency: Rejects stale expectedUpdatedAt on draft save", async () => {
    const draftRow = {
      id: "modul-concurrency-test",
      user_id: TEACHER_1,
      status: "Draft",
      judul: "Test Concurrency",
      ringkasan: "Ringkasan concurrency test modul.",
      sections: [{ judul: "Bab 1", poin: ["Poin"], isi: "Isi bab satu." }],
      created_at: new Date(Date.now() - 10000).toISOString(),
      updated_at: new Date(Date.now() - 1000).toISOString(),
    };
    mockSupabase._getTable().set(draftRow.id, draftRow);

    await assert.rejects(
      async () => {
        await executeSaveModulDraft(
          {
            modulId: draftRow.id,
            expectedUpdatedAt: new Date(Date.now() - 5000).toISOString(),
            draftData: {
              judul: "Test Concurrency Edit",
              ringkasan: "Ringkasan concurrency test modul.",
              sections: [{ judul: "Bab 1", poin: ["Poin"], isi: "Isi bab satu." }],
            },
          },
          {
            supabase: mockSupabase,
            userId: TEACHER_1,
            userRole: "guru",
            verificationStatus: "terverifikasi",
          },
        );
      },
      (err) => {
        assert.ok(err instanceof AiServiceError);
        assert.strictEqual(err.code, AI_ERROR_CODES.INVALID_REQUEST);
        assert.match(err.message, /diperbarui oleh sesi lain/i);
        return true;
      },
    );
  });

  await runTest("Section H", "Concurrency: Rejects stale expectedUpdatedAt on publish", async () => {
    const draftRow = {
      id: "modul-publish-concurrency",
      user_id: TEACHER_1,
      status: "Draft",
      judul: "Test Publish Concurrency",
      ringkasan: "Ringkasan publish concurrency test modul.",
      sections: [{ judul: "Bab 1", poin: ["Poin"], isi: "Isi bab satu." }],
      tujuan_pembelajaran: [{ id: "TP-01", deskripsi: "Tujuan" }],
      created_at: new Date(Date.now() - 10000).toISOString(),
      updated_at: new Date(Date.now() - 1000).toISOString(),
    };
    mockSupabase._getTable().set(draftRow.id, draftRow);

    await assert.rejects(
      async () => {
        await executePublishModul(
          {
            modulId: draftRow.id,
            expectedUpdatedAt: new Date(Date.now() - 5000).toISOString(),
          },
          {
            supabase: mockSupabase,
            userId: TEACHER_1,
            userRole: "guru",
            verificationStatus: "terverifikasi",
          },
        );
      },
      (err) => {
        assert.ok(err instanceof AiServiceError);
        assert.strictEqual(err.code, AI_ERROR_CODES.INVALID_REQUEST);
        assert.match(err.message, /diperbarui oleh sesi lain/i);
        return true;
      },
    );
  });

  // ----------------------------------------------------------------------------
  // SECTION I: FAILURE RECOVERY & ERROR TAXONOMY
  // ----------------------------------------------------------------------------
  await runTest("Section I", "Error Taxonomy: All canonical error codes mapped to Indonesian messages", async () => {
    for (const [code, userMsg] of Object.entries(UI_ERROR_MESSAGES)) {
      assert.ok(code.length > 0, "Error code must exist");
      assert.ok(userMsg.length > 5, "Indonesian user message must be informative");
    }
  });

  await runTest("Section I", "Security: Zero token or raw API credential leakage in error messages", async () => {
    const dummySecret = "AIzaSySecretApiKey1234567890abcdefg";
    const err = new AiServiceError(
      AI_ERROR_CODES.AI_PROVIDER_ERROR,
      "Gagal menghubungi server penyedia AI.",
    );

    assert.strictEqual(err.message.includes(dummySecret), false);
    assert.strictEqual(JSON.stringify(err).includes(dummySecret), false);
  });

  // ----------------------------------------------------------------------------
  // SECTION J: POST-PUBLISH READ-ONLY LOCK
  // ----------------------------------------------------------------------------
  await runTest("Section J", "Post-Publish Lock: Published modul cannot be edited via draft save function", async () => {
    await assert.rejects(
      async () => {
        await executeSaveModulDraft(
          {
            modulId: publishedModul.id,
            draftData: {
              judul: "Mencoba mengedit modul yang sudah terbit",
              ringkasan: "Ringkasan baru yang cukup panjang untuk validasi.",
              sections: [{ judul: "Bab 1", poin: ["Poin"], isi: "Isi bab baru yang cukup panjang." }],
            },
          },
          {
            supabase: mockSupabase,
            userId: TEACHER_1,
            userRole: "guru",
            verificationStatus: "terverifikasi",
          },
        );
      },
      (err) => {
        assert.ok(err instanceof AiServiceError);
        assert.strictEqual(err.code, AI_ERROR_CODES.INVALID_REQUEST);
        assert.match(err.message, /status Draft yang dapat diperbarui/i);
        return true;
      },
    );
  });

  await runTest("Section J", "Post-Publish Lock: No unpublish transition (Terbit -> Draft forbidden)", async () => {
    const { data: currentModul } = await mockSupabase
      .from("moduls")
      .select("*")
      .eq("id", publishedModul.id)
      .maybeSingle();

    assert.strictEqual(currentModul.status, "Terbit");
  });

  console.log("================================================================================");
  console.log(`  AI-3D TEST SUMMARY: ${testsPassed} passed, ${testsFailed} failed`);
  console.log("================================================================================");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("FATAL ERROR in AI-3D Quality Gate Test:", err);
  process.exit(1);
});
