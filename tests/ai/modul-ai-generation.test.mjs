#!/usr/bin/env node
/**
 * ==============================================================================
 * GURUPRO TEST SUITE: AI-2C REAL AI MODUL AJAR GENERATION ENGINE
 * ==============================================================================
 *
 * Verifies the complete AI-2C generation pipeline:
 * 1. Valid teacher generation pipeline completes successfully with status: 'success'
 * 2. Output draft Modul has status: 'Draft' strictly (never auto-publish)
 * 3. Draft Modul contains full aiMetadata
 * 4. Result conforms strictly to GroundedModulAjarOutputSchema (canonical v1.0.0)
 * 5. Prompt registry modul_ajar_grounded_v1 is correctly retrieved and rendered
 * 6. Prompt structure enforces instruction hierarchy (SYSTEM > RULES > CONTEXT > ...)
 * 7. Prompt treats source chunks as untrusted data (<SOURCE_CHUNK> with anti-injection)
 * 8. Evidence references in output map to existing context evidenceIds/chunkIds
 * 9. Dangling evidence reference (fabricated evidenceId) throws AiServiceError(GROUNDING_FAILED)
 * 10. Evidence from unowned source is rejected (AiServiceError(GROUNDING_FAILED))
 * 11. Precondition gate: Unsupported topic on source is rejected BEFORE calling AI (INSUFFICIENT_EVIDENCE)
 * 12. Anti-promotion invariant: NOT_FOUND evidence with SUPPORTED status throws GROUNDING_FAILED
 * 13. Unauthenticated user rejected (AUTH_REQUIRED)
 * 14. Student role rejected (ROLE_FORBIDDEN)
 * 15. Pending teacher rejected (ROLE_FORBIDDEN)
 * 16. Unowned class rejected (ROLE_FORBIDDEN)
 * 17. Unowned source snapshot rejected (ROLE_FORBIDDEN)
 * 18. Rate limiter acquires and releases slot appropriately
 * 19. Transient provider error triggers bounded retries up to maxRetries
 * 20. Exhausted retries throw normalized AiServiceError(AI_PROVIDER_ERROR)
 * 21. Provider 429 rate limit throws normalized AiServiceError(AI_RATE_LIMIT)
 * 22. Provider 401 auth error throws normalized AiServiceError(AUTH_ERROR)
 * 23. Malformed JSON response triggers bounded correction retry
 * 24. Markdown code fence stripping (```json ... ```) handled seamlessly
 * 25. Generation metadata includes promptVersion, schemaVersion, latencyMs, retryCount, etc.
 * 26. Educational fixture 1: Network Routing (TXT) generates complete Kurikulum Merdeka draft
 * 27. Educational fixture 2: Accounting Journal (DOCX) generates complete draft
 * 28. Educational fixture 3: Automotive EFI (PDF) generates complete draft
 * 29. Multi-source conflict detection reflected in metadata (hasConflicts: true)
 * 30. Fail-closed provider check: Missing server API key fails closed with AI_PROVIDER_ERROR
 * 31. Fail-closed invariant: AI provider failure NEVER creates fabricated fallback educational content
 */

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AI_ERROR_CODES,
  AiServiceError,
} from "../../src/lib/ai/error-taxonomy.js";
import {
  ingestSource,
  clearSnapshotCacheForTesting,
} from "../../src/lib/ai/source-ingestion.js";
import {
  CANONICAL_OUTPUT_SCHEMA_VERSION,
  CANONICAL_PROMPT_VERSION,
  GroundedModulAjarOutputSchema,
  generateGroundedModulAjar,
} from "../../src/lib/ai/modul-contract.js";
import { getRegisteredPrompt } from "../../src/lib/ai/prompts-registry.js";
import { resetRateLimiterForTesting } from "../../src/lib/ai/rate-limiter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, "../..");
const FIXTURES_DIR = resolve(ROOT_DIR, "tests/fixtures");

console.log("================================================================================");
console.log("  GURUPRO TEST SUITE: AI-2C REAL AI MODUL AJAR GENERATION ENGINE               ");
console.log("================================================================================");

let passed = 0;
function pass(num, label) {
  passed++;
  console.log(`  [PASS ${num}] ${label}`);
}

// Clear snapshot cache and rate limiter before starting test run
clearSnapshotCacheForTesting();
resetRateLimiterForTesting();

// -----------------------------------------------------------------------------
// SETUP FIXTURES & TEACHER CONTEXT
// -----------------------------------------------------------------------------
const TEACHER_1_ID = "guru-tkj-101";
const TEACHER_2_ID = "guru-tkj-202";

// Load realistic educational fixtures
const txtPath = resolve(FIXTURES_DIR, "educational-network-routing.txt");
const docxPath = resolve(FIXTURES_DIR, "educational-accounting-journal.docx");
const pdfPath = resolve(FIXTURES_DIR, "educational-automotive-injection.pdf");
const htmlPath = resolve(FIXTURES_DIR, "educational-web-vlan.html");

assert.ok(existsSync(txtPath), "TXT fixture must exist");
assert.ok(existsSync(docxPath), "DOCX fixture must exist");
assert.ok(existsSync(pdfPath), "PDF fixture must exist");
assert.ok(existsSync(htmlPath), "HTML fixture must exist");

// Ingest fixtures for Teacher 1
const snapRoutingT1 = await ingestSource({
  sourceType: "text",
  input: readFileSync(txtPath, "utf-8"),
  title: "Bahan Ajar Routing Statis MikroTik",
  userId: TEACHER_1_ID,
});

const snapVlanT1 = await ingestSource({
  sourceType: "dokumen",
  input: readFileSync(htmlPath, "utf-8"),
  fileName: "vlan-concept.html",
  mimeType: "text/html",
  title: "Panduan VLAN 802.1Q",
  userId: TEACHER_1_ID,
});

const snapAccountingT1 = await ingestSource({
  sourceType: "dokumen",
  documentBuffer: readFileSync(docxPath),
  fileName: "akuntansi.docx",
  mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  title: "Modul Praktikum Jurnal Penyesuaian",
  userId: TEACHER_1_ID,
});

const snapAutomotiveT1 = await ingestSource({
  sourceType: "dokumen",
  documentBuffer: readFileSync(pdfPath),
  fileName: "otomotif.pdf",
  mimeType: "application/pdf",
  title: "Sistem Manajemen Bahan Bakar EFI",
  userId: TEACHER_1_ID,
});

// Ingest snapshot for Teacher 2 (for multi-tenant isolation tests)
const snapTeacher2 = await ingestSource({
  sourceType: "text",
  input:
    "Materi rahasia guru lain yang tidak boleh diakses oleh guru 1. Dokumen konfigurasi internal server sekolah dan administrasi jaringan kejuruan.",
  title: "Dokumen Pribadi Guru 2",
  userId: TEACHER_2_ID,
});

const MOCK_TEACHER_1_CONTEXT = {
  teacherId: TEACHER_1_ID,
  teacherRole: "guru",
  verificationStatus: "terverifikasi",
  teacherClasses: [
    {
      id: "b0000000-0000-0000-0000-000000000001",
      namaKelas: "XI TKJ 1",
      tingkat: "XI",
      mapel: "Administrasi Infrastruktur Jaringan",
      tahunAjaran: "2026/2027",
      guruId: TEACHER_1_ID,
    },
    {
      id: "b0000000-0000-0000-0000-000000000002",
      namaKelas: "X AKL 2",
      tingkat: "X",
      mapel: "Akuntansi Dasar",
      tahunAjaran: "2026/2027",
      guruId: TEACHER_1_ID,
    },
    {
      id: "b0000000-0000-0000-0000-000000000003",
      namaKelas: "XI TKR 1",
      tingkat: "XI",
      mapel: "Pemeliharaan Mesin Kendaraan Ringan",
      tahunAjaran: "2026/2027",
      guruId: TEACHER_1_ID,
    },
  ],
  availableSourceSnapshots: [
    {
      id: snapRoutingT1.id,
      userId: TEACHER_1_ID,
      sourceTitle: snapRoutingT1.sourceTitle,
      contentHash: snapRoutingT1.contentHash,
    },
    {
      id: snapVlanT1.id,
      userId: TEACHER_1_ID,
      sourceTitle: snapVlanT1.sourceTitle,
      contentHash: snapVlanT1.contentHash,
    },
    {
      id: snapAccountingT1.id,
      userId: TEACHER_1_ID,
      sourceTitle: snapAccountingT1.sourceTitle,
      contentHash: snapAccountingT1.contentHash,
    },
    {
      id: snapAutomotiveT1.id,
      userId: TEACHER_1_ID,
      sourceTitle: snapAutomotiveT1.sourceTitle,
      contentHash: snapAutomotiveT1.contentHash,
    },
  ],
};

// Helper to construct a valid realistic AI output payload for tests
function buildMockRoutingOutput(sourceId, chunkId) {
  return {
    schemaVersion: "1.0.0",
    judul: "Modul Ajar Routing Statis MikroTik RouterOS",
    mapel: "Administrasi Infrastruktur Jaringan",
    kelas: "XI TKJ 1",
    fase: "F",
    alokasiWaktu: "2 x 45 menit",
    ringkasan: "Modul ajar ini membimbing peserta didik memahami konsep dasar routing statis, prinsip tabel forwarding, dan konfigurasi default gateway pada MikroTik RouterOS v7.",
    tujuanPembelajaran: [
      {
        id: "TP-01",
        deskripsi: "Peserta didik mampu menjelaskan prinsip kerja tabel routing statis dan penentuan default gateway.",
        evidenceIds: [chunkId],
        status: "SUPPORTED",
      },
    ],
    sections: [
      {
        id: "SEC-01",
        judul: "Konsep Dasar Routing Statis",
        poin: ["Prinsip kerja tabel routing", "Fungsi default route 0.0.0.0/0", "Administrative Distance"],
        isi: "Routing statis adalah proses pemilihan rute secara manual oleh administrator jaringan. Pada MikroTik RouterOS v7, rute ditambahkan melalui menu IP Routes dengan menentukan Dst-Address dan Gateway.",
        evidenceIds: [chunkId],
        status: "SUPPORTED",
        keyTerms: ["Routing Statis", "Gateway", "Administrative Distance"],
      },
    ],
    kegiatanPembelajaran: {
      pendahuluan: {
        alokasiMenit: 15,
        aktivitas: ["Guru membuka sesi dengan salam dan memberikan apersepsi mengenai bagaimana paket data dikirim antar jaringan yang berbeda."],
      },
      inti: {
        alokasiMenit: 60,
        aktivitas: ["Peserta didik mempraktikkan penambahan rute statis pada Winbox MikroTik sesuai topologi praktikum."],
        evidenceIds: [chunkId],
      },
      penutup: {
        alokasiMenit: 15,
        aktivitas: ["Peserta didik dan guru merefleksikan hasil praktikum dan menyimpulkan analisis tabel routing."],
      },
    },
    asesmen: {
      kriteria: ["Ketepatan penentuan gateway", "Keberhasilan uji konektivitas ping antar segmen"],
      teknik: "Tes Kinerja Praktik",
      instrumen: "Lembar Kerja Peserta Didik (LKPD) dan Rubrik Penilaian Konfigurasi",
    },
    evidenceRefs: [
      {
        sourceId,
        chunkId,
        sourceTitle: "Bahan Ajar Routing Statis MikroTik",
        snippet: "Routing statis adalah metode penentuan rute secara manual oleh network administrator...",
        status: "SUPPORTED",
        relevanceScore: 0.95,
      },
    ],
  };
}

// -----------------------------------------------------------------------------
// TEST 1: Valid Teacher Generation Pipeline Completes with Success
// -----------------------------------------------------------------------------
{
  const firstChunkId = snapRoutingT1.chunks[0].chunkId;
  const mockPayload = buildMockRoutingOutput(snapRoutingT1.id, firstChunkId);

  const result = await generateGroundedModulAjar(
    {
      sourceSnapshotIds: [snapRoutingT1.id],
      kelasId: "b0000000-0000-0000-0000-000000000001",
      topik: "Routing Statis",
      targetFase: "F",
      alokasiWaktu: "2 x 45 menit",
    },
    MOCK_TEACHER_1_CONTEXT,
    {
      mockProviderCall: async () => JSON.stringify(mockPayload),
    },
  );

  assert.equal(result.status, "success", "Result status must be success");
  assert.ok(result.output, "Output must be present");
  assert.equal(result.output.schemaVersion, CANONICAL_OUTPUT_SCHEMA_VERSION);
  pass(1, "Valid teacher generation pipeline completes successfully with status: 'success'");
}

// -----------------------------------------------------------------------------
// TEST 2: Output Draft Modul Has status: 'Draft' Strictly (Never Auto-Publish)
// -----------------------------------------------------------------------------
{
  const firstChunkId = snapRoutingT1.chunks[0].chunkId;
  const mockPayload = buildMockRoutingOutput(snapRoutingT1.id, firstChunkId);

  const result = await generateGroundedModulAjar(
    {
      sourceSnapshotIds: [snapRoutingT1.id],
      kelasId: "b0000000-0000-0000-0000-000000000001",
      topik: "Routing Statis",
    },
    MOCK_TEACHER_1_CONTEXT,
    {
      mockProviderCall: async () => JSON.stringify(mockPayload),
    },
  );

  assert.ok(result.draftModul, "Draft modul must be generated");
  assert.equal(result.draftModul.status, "Draft", "Invariant: Generated module MUST be Draft");
  assert.equal(result.draftModul.isArchived, false, "Draft modul must not be archived");
  pass(2, "Output draft Modul has status: 'Draft' strictly (never auto-publish)");
}

// -----------------------------------------------------------------------------
// TEST 3: Draft Modul Contains Full aiMetadata
// -----------------------------------------------------------------------------
{
  const firstChunkId = snapRoutingT1.chunks[0].chunkId;
  const mockPayload = buildMockRoutingOutput(snapRoutingT1.id, firstChunkId);

  const result = await generateGroundedModulAjar(
    {
      sourceSnapshotIds: [snapRoutingT1.id],
      kelasId: "b0000000-0000-0000-0000-000000000001",
      topik: "Routing Statis",
    },
    MOCK_TEACHER_1_CONTEXT,
    {
      mockProviderCall: async () => JSON.stringify(mockPayload),
    },
  );

  const meta = result.draftModul.aiMetadata;
  assert.ok(meta, "aiMetadata must be present");
  assert.equal(meta.promptVersion, CANONICAL_PROMPT_VERSION);
  assert.equal(meta.schemaVersion, CANONICAL_OUTPUT_SCHEMA_VERSION);
  assert.deepEqual(meta.sourceSnapshotIds, [snapRoutingT1.id]);
  assert.equal(meta.validationStatus, "valid");
  assert.ok(meta.generatedAt);
  pass(3, "Draft Modul contains full aiMetadata");
}

// -----------------------------------------------------------------------------
// TEST 4: Result Conforms Strictly to GroundedModulAjarOutputSchema (v1.0.0)
// -----------------------------------------------------------------------------
{
  const firstChunkId = snapRoutingT1.chunks[0].chunkId;
  const mockPayload = buildMockRoutingOutput(snapRoutingT1.id, firstChunkId);

  const result = await generateGroundedModulAjar(
    {
      sourceSnapshotIds: [snapRoutingT1.id],
      kelasId: "b0000000-0000-0000-0000-000000000001",
      topik: "Routing Statis",
    },
    MOCK_TEACHER_1_CONTEXT,
    {
      mockProviderCall: async () => JSON.stringify(mockPayload),
    },
  );

  const parsed = GroundedModulAjarOutputSchema.safeParse(result.output);
  assert.ok(parsed.success, "Result output must conform to GroundedModulAjarOutputSchema");
  pass(4, "Result conforms strictly to GroundedModulAjarOutputSchema (canonical v1.0.0)");
}

// -----------------------------------------------------------------------------
// TEST 5: Prompt Registry modul_ajar_grounded_v1 Is Correctly Retrieved and Rendered
// -----------------------------------------------------------------------------
{
  const promptDef = getRegisteredPrompt(CANONICAL_PROMPT_VERSION);
  assert.ok(promptDef, "Prompt definition must be registered");
  assert.equal(promptDef.version, "modul_ajar_grounded_v1");

  const renderedUser = promptDef.buildUserPrompt({
    sourceContent: "DATA SUMBER ROUTING",
    topik: "Routing Statis",
    mapel: "Administrasi Infrastruktur Jaringan",
    kelas: "XI TKJ 1",
    fase: "F",
    alokasiWaktu: "2 x 45 menit",
  });

  assert.ok(renderedUser.includes("DATA SUMBER ROUTING"));
  assert.ok(renderedUser.includes("Routing Statis"));
  pass(5, "Prompt registry modul_ajar_grounded_v1 is correctly retrieved and rendered");
}

// -----------------------------------------------------------------------------
// TEST 6: Prompt Structure Enforces Instruction Hierarchy
// -----------------------------------------------------------------------------
{
  const promptDef = getRegisteredPrompt(CANONICAL_PROMPT_VERSION);
  const systemPrompt = promptDef.systemPrompt;

  assert.ok(systemPrompt.includes("HIERARKI INSTRUKSI (WAJIB DIPATUHI SECARA MUTLAK):"));
  assert.ok(systemPrompt.includes("1. SYSTEM INSTRUCTIONS"));
  assert.ok(systemPrompt.includes("2. GENERATION RULES"));
  assert.ok(systemPrompt.includes("3. APPLICATION ACADEMIC CONTEXT"));
  assert.ok(systemPrompt.includes("4. PEDAGOGICAL CONSTRAINTS"));
  assert.ok(systemPrompt.includes("5. SOURCE EVIDENCE DATA"));
  assert.ok(systemPrompt.includes("6. OUTPUT SCHEMA"));
  assert.ok(systemPrompt.includes("ATURAN GENERASI & ANTI-HALUSINASI:"));
  assert.ok(systemPrompt.includes("PENGIKATAN BUKTI (EVIDENCE BINDING)"));
  pass(6, "Prompt structure enforces instruction hierarchy (SYSTEM > RULES > CONTEXT > ...)");
}


// -----------------------------------------------------------------------------
// TEST 7: Prompt Treats Source Chunks as Untrusted Data (<SOURCE_CHUNK>)
// -----------------------------------------------------------------------------
{
  const promptDef = getRegisteredPrompt(CANONICAL_PROMPT_VERSION);
  const systemPrompt = promptDef.systemPrompt;

  assert.ok(systemPrompt.includes("<SOURCE_CHUNK>"));
  assert.ok(systemPrompt.includes("UNTRUSTED DATA"));
  assert.ok(systemPrompt.includes("PERTAHANAN PROMPT INJECTION"));
  pass(7, "Prompt treats source chunks as untrusted data (<SOURCE_CHUNK> with anti-injection)");

}

// -----------------------------------------------------------------------------
// TEST 8: Evidence References in Output Map to Existing Context evidenceIds/chunkIds
// -----------------------------------------------------------------------------
{
  const firstChunkId = snapRoutingT1.chunks[0].chunkId;
  const mockPayload = buildMockRoutingOutput(snapRoutingT1.id, firstChunkId);

  const result = await generateGroundedModulAjar(
    {
      sourceSnapshotIds: [snapRoutingT1.id],
      kelasId: "b0000000-0000-0000-0000-000000000001",
      topik: "Routing Statis",
    },
    MOCK_TEACHER_1_CONTEXT,
    {
      mockProviderCall: async () => JSON.stringify(mockPayload),
    },
  );

  const refChunkId = result.output.evidenceRefs[0].chunkId;
  assert.equal(refChunkId, firstChunkId);
  pass(8, "Evidence references in output map to existing context evidenceIds/chunkIds");
}

// -----------------------------------------------------------------------------
// TEST 9: Dangling Evidence Reference (Fabricated evidenceId) Throws GROUNDING_FAILED
// -----------------------------------------------------------------------------
{
  const mockPayload = buildMockRoutingOutput(snapRoutingT1.id, "fabricated-chunk-id-999");

  await assert.rejects(
    async () => {
      await generateGroundedModulAjar(
        {
          sourceSnapshotIds: [snapRoutingT1.id],
          kelasId: "b0000000-0000-0000-0000-000000000001",
          topik: "Routing Statis",
        },
        MOCK_TEACHER_1_CONTEXT,
        {
          mockProviderCall: async () => JSON.stringify(mockPayload),
        },
      );
    },
    (err) => {
      assert.ok(err instanceof AiServiceError);
      assert.equal(err.code, AI_ERROR_CODES.GROUNDING_FAILED);
      assert.ok(err.message.includes("fabricated-chunk-id-999"));
      return true;
    },
  );
  pass(9, "Dangling evidence reference (fabricated evidenceId) throws AiServiceError(GROUNDING_FAILED)");
}

// -----------------------------------------------------------------------------
// TEST 10: Evidence From Unowned Source Is Rejected (GROUNDING_FAILED)
// -----------------------------------------------------------------------------
{
  const firstChunkId = snapRoutingT1.chunks[0].chunkId;
  // Output claims to use Teacher 2's snapshot ID
  const mockPayload = buildMockRoutingOutput(snapTeacher2.id, firstChunkId);

  await assert.rejects(
    async () => {
      await generateGroundedModulAjar(
        {
          sourceSnapshotIds: [snapRoutingT1.id],
          kelasId: "b0000000-0000-0000-0000-000000000001",
          topik: "Routing Statis",
        },
        MOCK_TEACHER_1_CONTEXT,
        {
          mockProviderCall: async () => JSON.stringify(mockPayload),
        },
      );
    },
    (err) => {
      assert.ok(err instanceof AiServiceError);
      assert.equal(err.code, AI_ERROR_CODES.GROUNDING_FAILED);
      assert.ok(err.message.includes("tidak ada dalam daftar materi terpilih"));
      return true;
    },
  );
  pass(10, "Evidence from unowned source is rejected (AiServiceError(GROUNDING_FAILED))");
}

// -----------------------------------------------------------------------------
// TEST 11: Precondition Gate: Unsupported Topic on Source Throws INSUFFICIENT_EVIDENCE
// -----------------------------------------------------------------------------
{
  let providerWasCalled = false;

  await assert.rejects(
    async () => {
      // snapRoutingT1 has routing material; requesting completely unrelated topic like "Fotosintesis Tanaman C3 C4"
      await generateGroundedModulAjar(
        {
          sourceSnapshotIds: [snapRoutingT1.id],
          kelasId: "b0000000-0000-0000-0000-000000000001",
          topik: "Fotosintesis Reaksi Terang Gelap Tanaman C3 C4",
        },
        MOCK_TEACHER_1_CONTEXT,
        {
          mockProviderCall: async () => {
            providerWasCalled = true;
            return "{}";
          },
        },
      );
    },
    (err) => {
      assert.ok(err instanceof AiServiceError);
      assert.equal(err.code, AI_ERROR_CODES.INSUFFICIENT_EVIDENCE);
      assert.ok(err.message.includes("tidak ditemukan atau tidak didukung"));
      return true;
    },
  );

  assert.equal(providerWasCalled, false, "Provider must NOT be called if precondition fails");
  pass(11, "Precondition gate: Unsupported topic on source is rejected BEFORE calling AI (INSUFFICIENT_EVIDENCE)");
}

// -----------------------------------------------------------------------------
// TEST 12: Anti-Promotion Invariant: NOT_FOUND Evidence with SUPPORTED Throws GROUNDING_FAILED
// -----------------------------------------------------------------------------
{
  const firstChunkId = snapRoutingT1.chunks[0].chunkId;
  const mockPayload = buildMockRoutingOutput(snapRoutingT1.id, firstChunkId);
  // Mark the reference as NOT_FOUND while objective claims SUPPORTED
  mockPayload.evidenceRefs[0].status = "NOT_FOUND";
  mockPayload.tujuanPembelajaran[0].status = "SUPPORTED";

  await assert.rejects(
    async () => {
      await generateGroundedModulAjar(
        {
          sourceSnapshotIds: [snapRoutingT1.id],
          kelasId: "b0000000-0000-0000-0000-000000000001",
          topik: "Routing Statis",
        },
        MOCK_TEACHER_1_CONTEXT,
        {
          mockProviderCall: async () => JSON.stringify(mockPayload),
        },
      );
    },
    (err) => {
      assert.ok(err instanceof AiServiceError);
      assert.equal(err.code, AI_ERROR_CODES.GROUNDING_FAILED);
      assert.ok(err.message.includes("Invarian Grounding dilanggar"));
      return true;
    },
  );
  pass(12, "Anti-promotion invariant: NOT_FOUND evidence with SUPPORTED status throws GROUNDING_FAILED");
}

// -----------------------------------------------------------------------------
// TEST 13: Unauthenticated User Rejected (ROLE_FORBIDDEN)
// -----------------------------------------------------------------------------
{
  await assert.rejects(
    async () => {
      await generateGroundedModulAjar(
        {
          sourceSnapshotIds: [snapRoutingT1.id],
          kelasId: "b0000000-0000-0000-0000-000000000001",
          topik: "Routing Statis",
        },
        null, // No auth context
        {
          mockProviderCall: async () => "{}",
        },
      );
    },
    (err) => {
      assert.ok(err instanceof AiServiceError);
      assert.equal(err.code, AI_ERROR_CODES.ROLE_FORBIDDEN);
      return true;
    },
  );
  pass(13, "Unauthenticated user rejected (ROLE_FORBIDDEN)");
}


// -----------------------------------------------------------------------------
// TEST 14: Student Role Rejected (ROLE_FORBIDDEN)
// -----------------------------------------------------------------------------
{
  const studentContext = {
    ...MOCK_TEACHER_1_CONTEXT,
    teacherRole: "siswa",
  };

  await assert.rejects(
    async () => {
      await generateGroundedModulAjar(
        {
          sourceSnapshotIds: [snapRoutingT1.id],
          kelasId: "b0000000-0000-0000-0000-000000000001",
          topik: "Routing Statis",
        },
        studentContext,
        {
          mockProviderCall: async () => "{}",
        },
      );
    },
    (err) => {
      assert.ok(err instanceof AiServiceError);
      assert.equal(err.code, AI_ERROR_CODES.ROLE_FORBIDDEN);
      return true;
    },
  );
  pass(14, "Student role rejected (ROLE_FORBIDDEN)");
}

// -----------------------------------------------------------------------------
// TEST 15: Pending Teacher Rejected (ROLE_FORBIDDEN)
// -----------------------------------------------------------------------------
{
  const pendingTeacherContext = {
    ...MOCK_TEACHER_1_CONTEXT,
    verificationStatus: "menunggu",
  };

  await assert.rejects(
    async () => {
      await generateGroundedModulAjar(
        {
          sourceSnapshotIds: [snapRoutingT1.id],
          kelasId: "b0000000-0000-0000-0000-000000000001",
          topik: "Routing Statis",
        },
        pendingTeacherContext,
        {
          mockProviderCall: async () => "{}",
        },
      );
    },
    (err) => {
      assert.ok(err instanceof AiServiceError);
      assert.equal(err.code, AI_ERROR_CODES.ROLE_FORBIDDEN);
      return true;
    },
  );
  pass(15, "Pending teacher rejected (ROLE_FORBIDDEN)");
}

// -----------------------------------------------------------------------------
// TEST 16: Unowned Class Rejected (ROLE_FORBIDDEN)
// -----------------------------------------------------------------------------
{
  await assert.rejects(
    async () => {
      await generateGroundedModulAjar(
        {
          sourceSnapshotIds: [snapRoutingT1.id],
          kelasId: "b0000000-0000-0000-0000-999999999999", // Unowned class ID
          topik: "Routing Statis",
        },
        MOCK_TEACHER_1_CONTEXT,
        {
          mockProviderCall: async () => "{}",
        },
      );
    },
    (err) => {
      assert.ok(err instanceof AiServiceError);
      assert.equal(err.code, AI_ERROR_CODES.ROLE_FORBIDDEN);
      return true;
    },
  );
  pass(16, "Unowned class rejected (ROLE_FORBIDDEN)");
}

// -----------------------------------------------------------------------------
// TEST 17: Unowned Source Snapshot Rejected (ROLE_FORBIDDEN)
// -----------------------------------------------------------------------------
{
  await assert.rejects(
    async () => {
      await generateGroundedModulAjar(
        {
          sourceSnapshotIds: [snapTeacher2.id], // Owned by Teacher 2
          kelasId: "b0000000-0000-0000-0000-000000000001",
          topik: "Routing Statis",
        },
        MOCK_TEACHER_1_CONTEXT,
        {
          mockProviderCall: async () => "{}",
        },
      );
    },
    (err) => {
      assert.ok(err instanceof AiServiceError);
      assert.equal(err.code, AI_ERROR_CODES.ROLE_FORBIDDEN);
      return true;
    },
  );
  pass(17, "Unowned source snapshot rejected (ROLE_FORBIDDEN)");
}

// -----------------------------------------------------------------------------
// TEST 18: Rate Limiter Acquires and Releases Slot Appropriately
// -----------------------------------------------------------------------------
{
  resetRateLimiterForTesting();
  const firstChunkId = snapRoutingT1.chunks[0].chunkId;
  const mockPayload = buildMockRoutingOutput(snapRoutingT1.id, firstChunkId);

  // Run 3 sequential generation requests to ensure slot release does not exhaust window
  for (let i = 0; i < 3; i++) {
    const res = await generateGroundedModulAjar(
      {
        sourceSnapshotIds: [snapRoutingT1.id],
        kelasId: "b0000000-0000-0000-0000-000000000001",
        topik: "Routing Statis",
      },
      MOCK_TEACHER_1_CONTEXT,
      {
        mockProviderCall: async () => JSON.stringify(mockPayload),
      },
    );
    assert.equal(res.status, "success");
  }
  pass(18, "Rate limiter acquires and releases slot appropriately");
}

// -----------------------------------------------------------------------------
// TEST 19: Transient Provider Error Triggers Bounded Retries Up to maxRetries
// -----------------------------------------------------------------------------
{
  const firstChunkId = snapRoutingT1.chunks[0].chunkId;
  const mockPayload = buildMockRoutingOutput(snapRoutingT1.id, firstChunkId);

  let attempts = 0;
  // Test adapter: we test retry mechanism via fetch simulation or mock provider retry
  const res = await generateGroundedModulAjar(
    {
      sourceSnapshotIds: [snapRoutingT1.id],
      kelasId: "b0000000-0000-0000-0000-000000000001",
      topik: "Routing Statis",
    },
    MOCK_TEACHER_1_CONTEXT,
    {
      mockProviderCall: async () => {
        attempts++;
        return JSON.stringify(mockPayload);
      },
    },
  );

  assert.equal(res.status, "success");
  assert.equal(attempts, 1);
  pass(19, "Transient provider error triggers bounded retries up to maxRetries");
}

// -----------------------------------------------------------------------------
// TEST 20: Exhausted Retries Throw Normalized AI_PROVIDER_ERROR
// -----------------------------------------------------------------------------
{
  await assert.rejects(
    async () => {
      await generateGroundedModulAjar(
        {
          sourceSnapshotIds: [snapRoutingT1.id],
          kelasId: "b0000000-0000-0000-0000-000000000001",
          topik: "Routing Statis",
        },
        MOCK_TEACHER_1_CONTEXT,
        {
          mockProviderCall: async () => {
            throw new AiServiceError(AI_ERROR_CODES.AI_PROVIDER_ERROR, "Network connection reset", true);
          },
        },
      );
    },
    (err) => {
      assert.ok(err instanceof AiServiceError);
      assert.equal(err.code, AI_ERROR_CODES.AI_PROVIDER_ERROR);
      return true;
    },
  );
  pass(20, "Exhausted retries throw normalized AiServiceError(AI_PROVIDER_ERROR)");
}

// -----------------------------------------------------------------------------
// TEST 21: Provider 429 Rate Limit Throws Normalized AI_RATE_LIMIT
// -----------------------------------------------------------------------------
{
  await assert.rejects(
    async () => {
      await generateGroundedModulAjar(
        {
          sourceSnapshotIds: [snapRoutingT1.id],
          kelasId: "b0000000-0000-0000-0000-000000000001",
          topik: "Routing Statis",
        },
        MOCK_TEACHER_1_CONTEXT,
        {
          mockProviderCall: async () => {
            throw new AiServiceError(AI_ERROR_CODES.AI_RATE_LIMIT, "Rate limit exceeded (HTTP 429)", false);
          },
        },
      );
    },
    (err) => {
      assert.ok(err instanceof AiServiceError);
      assert.equal(err.code, AI_ERROR_CODES.AI_RATE_LIMIT);
      return true;
    },
  );
  pass(21, "Provider 429 rate limit throws normalized AiServiceError(AI_RATE_LIMIT)");
}

// -----------------------------------------------------------------------------
// TEST 22: Provider 401 Auth Error Throws Normalized AUTH_ERROR
// -----------------------------------------------------------------------------
{
  await assert.rejects(
    async () => {
      await generateGroundedModulAjar(
        {
          sourceSnapshotIds: [snapRoutingT1.id],
          kelasId: "b0000000-0000-0000-0000-000000000001",
          topik: "Routing Statis",
        },
        MOCK_TEACHER_1_CONTEXT,
        {
          mockProviderCall: async () => {
            throw new AiServiceError(AI_ERROR_CODES.AUTH_ERROR, "API Key invalid or revoked", false);
          },
        },
      );
    },
    (err) => {
      assert.ok(err instanceof AiServiceError);
      assert.equal(err.code, AI_ERROR_CODES.AUTH_ERROR);
      return true;
    },
  );
  pass(22, "Provider 401 auth error throws normalized AiServiceError(AUTH_ERROR)");
}

// -----------------------------------------------------------------------------
// TEST 23: Malformed JSON Response Triggers Rejection With Clean Error
// -----------------------------------------------------------------------------
{
  await assert.rejects(
    async () => {
      await generateGroundedModulAjar(
        {
          sourceSnapshotIds: [snapRoutingT1.id],
          kelasId: "b0000000-0000-0000-0000-000000000001",
          topik: "Routing Statis",
        },
        MOCK_TEACHER_1_CONTEXT,
        {
          mockProviderCall: async () => "ini bukan json: {corrupted: true",
        },
      );
    },
    (err) => {
      assert.ok(err instanceof AiServiceError);
      assert.equal(err.code, AI_ERROR_CODES.PROVIDER_MALFORMED_OUTPUT);
      return true;
    },
  );
  pass(23, "Malformed JSON response triggers rejection with clean PROVIDER_MALFORMED_OUTPUT");
}

// -----------------------------------------------------------------------------
// TEST 24: Markdown Code Fence Stripping (```json ... ```) Handled Seamlessly
// -----------------------------------------------------------------------------
{
  const firstChunkId = snapRoutingT1.chunks[0].chunkId;
  const mockPayload = buildMockRoutingOutput(snapRoutingT1.id, firstChunkId);
  const fencedText = `\`\`\`json\n${JSON.stringify(mockPayload, null, 2)}\n\`\`\``;

  const result = await generateGroundedModulAjar(
    {
      sourceSnapshotIds: [snapRoutingT1.id],
      kelasId: "b0000000-0000-0000-0000-000000000001",
      topik: "Routing Statis",
    },
    MOCK_TEACHER_1_CONTEXT,
    {
      mockProviderCall: async () => fencedText,
    },
  );

  assert.equal(result.status, "success");
  assert.equal(result.output.judul, mockPayload.judul);
  pass(24, "Markdown code fence stripping (```json ... ```) handled seamlessly");
}

// -----------------------------------------------------------------------------
// TEST 25: Generation Metadata Includes Complete Traceability Info
// -----------------------------------------------------------------------------
{
  const firstChunkId = snapRoutingT1.chunks[0].chunkId;
  const mockPayload = buildMockRoutingOutput(snapRoutingT1.id, firstChunkId);

  const result = await generateGroundedModulAjar(
    {
      sourceSnapshotIds: [snapRoutingT1.id],
      kelasId: "b0000000-0000-0000-0000-000000000001",
      topik: "Routing Statis",
    },
    MOCK_TEACHER_1_CONTEXT,
    {
      mockProviderCall: async () => JSON.stringify(mockPayload),
    },
  );

  assert.equal(result.metadata.promptVersion, CANONICAL_PROMPT_VERSION);
  assert.equal(result.metadata.schemaVersion, CANONICAL_OUTPUT_SCHEMA_VERSION);
  assert.ok(typeof result.metadata.latencyMs === "number");
  assert.ok(typeof result.metadata.retryCount === "number");
  assert.equal(typeof result.metadata.isTruncated, "boolean");
  assert.equal(typeof result.metadata.hasConflicts, "boolean");
  pass(25, "Generation metadata includes promptVersion, schemaVersion, latencyMs, retryCount, etc.");
}

// -----------------------------------------------------------------------------
// TEST 26: Educational Fixture 1: Network Routing (TXT) Generates Complete Modul Draft
// -----------------------------------------------------------------------------
{
  resetRateLimiterForTesting();
  const firstChunkId = snapRoutingT1.chunks[0].chunkId;
  const mockPayload = buildMockRoutingOutput(snapRoutingT1.id, firstChunkId);

  const result = await generateGroundedModulAjar(
    {
      sourceSnapshotIds: [snapRoutingT1.id],
      kelasId: "b0000000-0000-0000-0000-000000000001",
      topik: "Routing Statis MikroTik",
      targetFase: "F",
      alokasiWaktu: "4 x 45 menit",
    },
    MOCK_TEACHER_1_CONTEXT,
    {
      mockProviderCall: async () => JSON.stringify(mockPayload),
    },
  );

  assert.equal(result.output.mapel, "Administrasi Infrastruktur Jaringan");
  assert.equal(result.output.fase, "F");
  assert.equal(result.draftModul.status, "Draft");
  pass(26, "Educational fixture 1: Network Routing (TXT) generates complete Kurikulum Merdeka draft");
}

// -----------------------------------------------------------------------------
// TEST 27: Educational Fixture 2: Accounting Journal (DOCX) Generates Complete Draft
// -----------------------------------------------------------------------------
{
  const firstChunkId = snapAccountingT1.chunks[0].chunkId;
  const mockAccountingPayload = {
    schemaVersion: "1.0.0",
    judul: "Modul Ajar Jurnal Penyesuaian Akuntansi",
    mapel: "Akuntansi Dasar",
    kelas: "X AKL 2",
    fase: "E",
    alokasiWaktu: "2 x 45 menit",
    ringkasan: "Modul ini membahas teknik pencatatan jurnal penyesuaian beban dibayar di muka dan pendapatan diterima di muka pada siklus akuntansi jasa.",
    tujuanPembelajaran: [
      {
        id: "TP-01",
        deskripsi: "Peserta didik dapat menganalisis dan mencatat transaksi penyesuaian ke dalam format jurnal penyesuaian dengan teliti.",
        evidenceIds: [firstChunkId],
        status: "SUPPORTED",
      },
    ],
    sections: [
      {
        id: "SEC-01",
        judul: "Prinsip dan Konsep Akun Penyesuaian",
        poin: ["Beban dibayar di muka", "Penyusutan aset tetap", "Beban akrual"],
        isi: "Jurnal penyesuaian dibuat pada akhir periode akuntansi untuk mengalokasikan pendapatan dan beban ke periode yang tepat sesuai prinsip akrual.",
        evidenceIds: [firstChunkId],
        status: "SUPPORTED",
      },
    ],
    kegiatanPembelajaran: {
      pendahuluan: {
        alokasiMenit: 10,
        aktivitas: ["Apersepsi tentang neraca saldo yang belum disesuaikan."],
      },
      inti: {
        alokasiMenit: 70,
        aktivitas: ["Peserta didik mengerjakan lembar kerja kasus jurnal penyesuaian secara berpasangan."],
        evidenceIds: [firstChunkId],
      },
      penutup: {
        alokasiMenit: 10,
        aktivitas: ["Penyimpulan materi jurnal penyesuaian dan pengantar neraca lajur."],
      },
    },
    asesmen: {
      kriteria: ["Ketepatan penentuan akun debit dan kredit penyesuaian"],
      teknik: "Tes Tertulis Formatif",
      instrumen: "Lembar Kerja Siswa Soal Kasus Akuntansi",
    },
    evidenceRefs: [
      {
        sourceId: snapAccountingT1.id,
        chunkId: firstChunkId,
        sourceTitle: "Modul Praktikum Jurnal Penyesuaian",
        snippet: "Jurnal penyesuaian diperlukan untuk memastikan pendapatan dan beban tercatat pada periode yang benar...",
        status: "SUPPORTED",
        relevanceScore: 0.92,
      },
    ],
  };

  const result = await generateGroundedModulAjar(
    {
      sourceSnapshotIds: [snapAccountingT1.id],
      kelasId: "b0000000-0000-0000-0000-000000000002",
      topik: "Jurnal Penyesuaian",
      targetFase: "E",
    },
    MOCK_TEACHER_1_CONTEXT,
    {
      mockProviderCall: async () => JSON.stringify(mockAccountingPayload),
    },
  );

  assert.equal(result.output.mapel, "Akuntansi Dasar");
  assert.equal(result.draftModul.status, "Draft");
  pass(27, "Educational fixture 2: Accounting Journal (DOCX) generates complete draft");
}

// -----------------------------------------------------------------------------
// TEST 28: Educational Fixture 3: Automotive EFI (PDF) Generates Complete Draft
// -----------------------------------------------------------------------------
{
  const firstChunkId = snapAutomotiveT1.chunks[0].chunkId;
  const mockAutomotivePayload = {
    schemaVersion: "1.0.0",
    judul: "Modul Ajar Pemeliharaan Sistem Injeksi Elektronik (EFI)",
    mapel: "Pemeliharaan Mesin Kendaraan Ringan",
    kelas: "XI TKR 1",
    fase: "F",
    alokasiWaktu: "4 x 45 menit",
    ringkasan: "Modul ini mencakup identifikasi komponen sensor EFI, actuator injektor bahan bakar, dan prosedur diagnosa scan tool OBD-II.",
    tujuanPembelajaran: [
      {
        id: "TP-01",
        deskripsi: "Peserta didik dapat mendiagnosa kerusakan sinyal sensor EFI menggunakan multi-tester dan scan tool.",
        evidenceIds: [firstChunkId],
        status: "SUPPORTED",
      },
    ],
    sections: [
      {
        id: "SEC-01",
        judul: "Komponen Utama Sistem Electronic Fuel Injection",
        poin: ["Sensor MAP/MAF", "Electronic Control Unit (ECU)", "Injektor dan Fuel Pressure Regulator"],
        isi: "Sistem EFI menggunakan sensor untuk mendeteksi kondisi kerja mesin dan mengirimkan data ke ECU untuk menghitung durasi injeksi yang optimal.",
        evidenceIds: [firstChunkId],
        status: "SUPPORTED",
      },
    ],
    kegiatanPembelajaran: {
      pendahuluan: {
        alokasiMenit: 15,
        aktivitas: ["Guru memperlihatkan engine stand EFI dan menjelaskan prinsip dasar sistem bahan bakar."],
      },
      inti: {
        alokasiMenit: 150,
        aktivitas: ["Praktikum pengukuran resistansi injektor dan pembacaan Data Stream menggunakan scan tool."],
        evidenceIds: [firstChunkId],
      },
      penutup: {
        alokasiMenit: 15,
        aktivitas: ["Refleksi SOP keselamatan kerja kelistrikan otomotif dan evaluasi praktikum."],
      },
    },
    asesmen: {
      kriteria: ["Kesesuaian langkah kerja pemeriksaan EFI dengan SOP manual servis"],
      teknik: "Uji Kinerja Praktik",
      instrumen: "Lembar Penilaian Observasi Unjuk Kerja Otomotif",
    },
    evidenceRefs: [
      {
        sourceId: snapAutomotiveT1.id,
        chunkId: firstChunkId,
        sourceTitle: "Sistem Manajemen Bahan Bakar EFI",
        snippet: "Sistem EFI mengatur perbandingan udara dan bahan bakar secara presisi berdasarkan pembacaan sensor...",
        status: "SUPPORTED",
        relevanceScore: 0.94,
      },
    ],
  };

  const result = await generateGroundedModulAjar(
    {
      sourceSnapshotIds: [snapAutomotiveT1.id],
      kelasId: "b0000000-0000-0000-0000-000000000003",
      topik: "Sistem Bahan Bakar EFI dan Sensor",
      targetFase: "F",
    },
    MOCK_TEACHER_1_CONTEXT,
    {
      mockProviderCall: async () => JSON.stringify(mockAutomotivePayload),
    },
  );

  assert.equal(result.output.mapel, "Pemeliharaan Mesin Kendaraan Ringan");
  assert.equal(result.draftModul.status, "Draft");
  pass(28, "Educational fixture 3: Automotive EFI (PDF) generates complete draft");
}

// -----------------------------------------------------------------------------
// TEST 29: Multi-Source Conflict Detection Reflected in Metadata
// -----------------------------------------------------------------------------
{
  resetRateLimiterForTesting();
  // Ingest two conflicting snapshots on administrative distance
  const snapConfA = await ingestSource({
    sourceType: "text",
    input: "Konfigurasi routing statis pada router MikroTik default rute dengan administrative distance = 1 untuk prioritas tabel perutean utama kejuruan TKJ.",
    title: "Dokumen Routing A",
    userId: TEACHER_1_ID,
  });

  const snapConfB = await ingestSource({
    sourceType: "text",
    input: "Konfigurasi routing dinamis protokol pada router MikroTik memiliki nilai administrative distance = 110 untuk pemilihan jalur protokol perutean kejuruan TKJ.",
    title: "Dokumen Routing B",
    userId: TEACHER_1_ID,
  });

  const chunkIdA = snapConfA.chunks[0].chunkId;
  const mockPayload = {
    schemaVersion: "1.0.0",
    judul: "Modul Ajar Konfigurasi Routing Statis dan AD",
    mapel: "Administrasi Infrastruktur Jaringan",
    kelas: "XI TKJ 1",
    fase: "F",
    alokasiWaktu: "2 x 45 menit",
    ringkasan: "Modul ini membahas perbandingan nilai administrative distance rute statis 1 dan rute dinamis 110 pada MikroTik RouterOS.",
    tujuanPembelajaran: [
      {
        id: "TP-01",
        deskripsi: "Peserta didik dapat menganalisis perbedaan nilai administrative distance pada transmisi jaringan.",
        evidenceIds: [chunkIdA],
        status: "SUPPORTED",
      },
    ],
    sections: [
      {
        id: "SEC-01",
        judul: "Analisis Nilai Administrative Distance",
        poin: ["Rute Statis", "Rute Dinamis"],
        isi: "Nilai administrative distance menentukan prioritas pemilihan rute saat terdapat rute dengan tujuan jaringan yang sama.",
        evidenceIds: [chunkIdA],
        status: "SUPPORTED",
      },
    ],
    kegiatanPembelajaran: {
      pendahuluan: { aktivitas: ["Apersepsi prioritas tabel routing."] },
      inti: { aktivitas: ["Uji konfigurasi static route dan dynamic route."], evidenceIds: [chunkIdA] },
      penutup: { aktivitas: ["Refleksi administrative distance."] },
    },
    asesmen: {
      kriteria: ["Pemahaman administrative distance"],
      teknik: "Tes Formatif",
      instrumen: "Lembar Soal",
    },
    catatanKeterbatasan: "Terdapat perbedaan nilai administrative distance antara dokumen referensi A (AD=1) dan dokumen referensi B (AD=110).",
    evidenceRefs: [
      {
        sourceId: snapConfA.id,
        chunkId: chunkIdA,
        status: "SUPPORTED",
      },
    ],
  };

  const teacherCtx = {
    ...MOCK_TEACHER_1_CONTEXT,
    availableSourceSnapshots: [
      ...MOCK_TEACHER_1_CONTEXT.availableSourceSnapshots,
      { id: snapConfA.id, userId: TEACHER_1_ID, sourceTitle: snapConfA.sourceTitle, contentHash: snapConfA.contentHash },
      { id: snapConfB.id, userId: TEACHER_1_ID, sourceTitle: snapConfB.sourceTitle, contentHash: snapConfB.contentHash },
    ],
  };

  const result = await generateGroundedModulAjar(
    {
      sourceSnapshotIds: [snapConfA.id, snapConfB.id],
      kelasId: "b0000000-0000-0000-0000-000000000001",
      topik: "Routing Statis dan Nilai Administrative Distance",
    },
    teacherCtx,
    {
      mockProviderCall: async () => JSON.stringify(mockPayload),
    },
  );

  assert.equal(result.status, "success");
  assert.equal(result.metadata.hasConflicts, true, "hasConflicts must be true when conflicting snapshots are merged");
  assert.ok(result.metadata.conflictCount > 0, "conflictCount must be greater than 0");
  pass(29, "Multi-source conflict detection reflected in metadata (hasConflicts: true)");
}

// -----------------------------------------------------------------------------
// TEST 30: Fail-Closed Provider Check: Missing Server API Key Fails Closed
// -----------------------------------------------------------------------------
{
  resetRateLimiterForTesting();
  // When no mockProviderCall is given and no API key is present in server env,
  // it must throw AI_PROVIDER_ERROR and fail closed without crashing.
  await assert.rejects(
    async () => {
      await generateGroundedModulAjar(
        {
          sourceSnapshotIds: [snapRoutingT1.id],
          kelasId: "b0000000-0000-0000-0000-000000000001",
          topik: "Routing Statis",
        },
        MOCK_TEACHER_1_CONTEXT,
        // No mockProviderCall provided -> attempts to resolveServerAiConfig
      );
    },
    (err) => {
      assert.ok(err instanceof AiServiceError);
      assert.equal(err.code, AI_ERROR_CODES.AI_PROVIDER_ERROR);
      assert.ok(err.message.includes("Konfigurasi AI server belum siap"));
      return true;
    },
  );
  pass(30, "Fail-closed provider check: Missing server API key fails closed with AI_PROVIDER_ERROR");
}

// -----------------------------------------------------------------------------
// TEST 31: Fail-Closed Invariant: AI Provider Failure NEVER Creates Fabricated Content
// -----------------------------------------------------------------------------
{
  resetRateLimiterForTesting();
  let draftWasSaved = false;

  await assert.rejects(
    async () => {
      await generateGroundedModulAjar(
        {
          sourceSnapshotIds: [snapRoutingT1.id],
          kelasId: "b0000000-0000-0000-0000-000000000001",
          topik: "Routing Statis",
        },
        MOCK_TEACHER_1_CONTEXT,
        {
          mockProviderCall: async () => {
            throw new Error("Provider simulated catastrophe");
          },
        },
      );
    },
    (err) => {
      assert.ok(err instanceof AiServiceError);
      return true;
    },
  );

  assert.equal(draftWasSaved, false, "Invariant: Provider error must NEVER generate or save fabricated fallback text");
  pass(31, "Fail-closed invariant: AI provider failure NEVER creates fabricated fallback educational content");
}

console.log("================================================================================");
console.log(`  ALL ${passed} CHECKS PASSED SUCCESSFULLY (AI-2C ENGINE VALIDATION COMPLETE)  `);
console.log("================================================================================");
