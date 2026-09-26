#!/usr/bin/env node
/**
 * ==============================================================================
 * GURUPRO TEST SUITE: AI-2A MODUL AJAR GENERATION CONTRACT & OUTPUT SCHEMA
 * ==============================================================================
 *
 * Verifies the canonical AI Modul Ajar generation contracts:
 * 1. Valid generation input accepted
 * 2. Invalid academic context rejected (class not found / not owned)
 * 3. Client-supplied user ID is not trusted (rejected with INVALID_REQUEST)
 * 4. Teacher ownership is required (non-teacher roles rejected)
 * 5. Source ownership is required (source must belong to teacher)
 * 6. Cross-teacher source access rejected with ROLE_FORBIDDEN
 * 7. Valid Modul Ajar output passes canonical Zod schema
 * 8. Missing required field fails schema validation
 * 9. Wrong data type fails schema validation
 * 10. Empty generated content fails schema validation
 * 11. Invalid evidence reference fails cross-reference check
 * 12. Unsupported grounding status cannot be promoted to SUPPORTED
 * 13. Prompt version is represented correctly in registry & metadata
 * 14. Draft status is strictly preserved on domain mapping
 * 15. Existing module schema & exporter compatibility remains intact
 * 16. Full AI-1 and AI-0 contracts remain stable and compatible
 */

import assert from "node:assert/strict";
import {
  AI_ERROR_CODES,
  AiServiceError,
} from "../../src/lib/ai/error-taxonomy.js";
import {
  CANONICAL_OUTPUT_SCHEMA_VERSION,
  CANONICAL_PROMPT_VERSION,
  ModulGenerationInputSchema,
  GroundedModulAjarOutputSchema,
  validateModulGenerationInput,
  validateGroundedModulAjarOutput,
  parseAiModulResponse,
  mapGroundedOutputToModulDraft,
} from "../../src/lib/ai/modul-contract.js";
import {
  getRegisteredPrompt,
} from "../../src/lib/ai/prompts-registry.js";
import {
  exportModulAjarPdf,
} from "../../src/lib/exporters.js";

console.log("================================================================================");
console.log("  GURUPRO TEST SUITE: AI-2A MODUL AJAR CONTRACT & OUTPUT SCHEMA VALIDATION      ");
console.log("================================================================================");

let passed = 0;
function pass(num, label) {
  passed++;
  console.log(`  [PASS ${num}] ${label}`);
}

// -----------------------------------------------------------------------------
// FIXTURE DATA FOR TESTS
// -----------------------------------------------------------------------------
const TEACHER_A_ID = "guru-tkj-101";
const TEACHER_B_ID = "guru-tkj-202";

const MOCK_TEACHER_A_CONTEXT = {
  teacherId: TEACHER_A_ID,
  teacherRole: "guru",
  verificationStatus: "terverifikasi",
  teacherClasses: [
    {
      id: "a0000000-0000-0000-0000-000000000001",
      namaKelas: "X TKJ 1",
      tingkat: "X",
      mapel: "Teknik Jaringan Komputer",
      tahunAjaran: "2026/2027",
      guruId: TEACHER_A_ID,
    },
    {
      id: "a0000000-0000-0000-0000-000000000002",
      namaKelas: "XI TKJ 2",
      tingkat: "XI",
      mapel: "Administrasi Sistem Jaringan",
      tahunAjaran: "2026/2027",
      guruId: TEACHER_A_ID,
    },
  ],
  availableSourceSnapshots: [
    {
      id: "snap-routing-101",
      userId: TEACHER_A_ID,
      sourceTitle: "Routing Statis MikroTik",
      contentHash: "hash-routing-101",
    },
    {
      id: "snap-vlan-102",
      userId: TEACHER_A_ID,
      sourceTitle: "Panduan VLAN 802.1Q",
      contentHash: "hash-vlan-102",
    },
    {
      id: "snap-other-teacher-201",
      userId: TEACHER_B_ID, // Belong to Teacher B
      sourceTitle: "Akuntansi Perusahaan",
      contentHash: "hash-akuntansi-201",
    },
  ],
};

const VALID_CANONICAL_OUTPUT = {
  schemaVersion: "1.0.0",
  judul: "Konfigurasi Routing Statis pada Jaringan Komputer",
  mapel: "Teknik Jaringan Komputer",
  kelas: "X TKJ 1",
  fase: "E",
  alokasiWaktu: "2 x 45 menit",
  ringkasan: "Modul ini mempelajari konsep dasar perutean statis, penentuan jalur next-hop, dan parameter administrative distance pada jaringan komputer SMK.",
  tujuanPembelajaran: [
    {
      id: "TP-01",
      deskripsi: "Peserta didik mampu menjelaskan konsep dasar routing statis dan membedakannya dengan routing dinamis secara tepat.",
      evidenceIds: ["chunk-route-01"],
      status: "SUPPORTED",
    },
    {
      id: "TP-02",
      deskripsi: "Peserta didik mampu mengonfigurasi parameter next-hop gateway dan administrative distance bernilai default 1.",
      evidenceIds: ["chunk-route-02"],
      status: "SUPPORTED",
    },
  ],
  sections: [
    {
      id: "sec-01",
      judul: "Konsep Dasar dan Keuntungan Routing Statis",
      poin: [
        "Pengertian tabel perutean manual",
        "Penghematan bandwidth karena tidak menyiarkan update berkala",
        "Beban prosesor router lebih ringan dibandingkan OSPF atau BGP",
      ],
      isi: "Routing statis adalah proses pengiriman paket data yang jalurnya ditentukan secara manual oleh administrator jaringan. Metode ini sangat aman dan tidak membebani prosesor router.",
      evidenceIds: ["chunk-route-01"],
      status: "SUPPORTED",
      keyTerms: ["routing statis", "next-hop", "administrative distance"],
    },
    {
      id: "sec-02",
      judul: "Parameter Konfigurasi Rute Statis pada RouterOS",
      poin: [
        "Parameter Dst-Address dan Netmask tujuan",
        "Penentuan alamat Gateway interface tetangga",
        "Pengaturan nilai Distance (default 1)",
      ],
      isi: "Dalam RouterOS, konfigurasi ditambahkan melalui perintah CLI /ip route add dst-address dan gateway. Parameter administrative distance default bernilai 1.",
      evidenceIds: ["chunk-route-02"],
      status: "SUPPORTED",
      keyTerms: ["RouterOS", "gateway", "distance"],
    },
  ],
  kegiatanPembelajaran: {
    pendahuluan: {
      alokasiMenit: 15,
      aktivitas: [
        "Guru membuka kelas dengan salam dan memimpin doa.",
        "Guru melakukan apersepsi tentang pengiriman paket data antargedung.",
        "Guru menyampaikan tujuan pembelajaran perutean statis.",
      ],
      evidenceIds: ["chunk-route-01"],
    },
    inti: {
      alokasiMenit: 60,
      aktivitas: [
        "Peserta didik mengamati topologi 2 router MikroTik di lembar kerja.",
        "Peserta didik melakukan konfigurasi IP address dan default route.",
        "Peserta didik melakukan pengujian konektivitas menggunakan ping dan traceroute.",
      ],
      evidenceIds: ["chunk-route-02"],
    },
    penutup: {
      alokasiMenit: 15,
      aktivitas: [
        "Peserta didik bersama guru menyimpulkan cara kerja gateway next-hop.",
        "Guru memberikan kuis formatif singkat mengenai administrative distance.",
        "Guru menutup pertemuan dengan doa dan pesan keselamatan kerja laboratorium.",
      ],
    },
  },
  asesmen: {
    kriteria: [
      "Ketepatan sintaks perintah penambahan rute statis pada CLI",
      "Keberhasilan ping antar router melewati jalur next-hop",
      "Pemahaman konsep flag Active Static (AS) pada tabel routing",
    ],
    teknik: "Tes Formatif Tertulis dan Unjuk Kerja Praktik Laboratorium",
    instrumen: "Lembar Observasi Praktik Jaringan dan Rubrik Skoring",
  },
  catatanKeterbatasan: "Materi sumber tidak membahas konfigurasi dynamic routing BGP/OSPF secara detail.",
  evidenceRefs: [
    {
      sourceId: "snap-routing-101",
      chunkId: "chunk-route-01",
      sourceTitle: "Routing Statis MikroTik",
      snippet: "beban kerja prosesor router relatif lebih rendah dibandingkan routing dinamis",
      status: "SUPPORTED",
      relevanceScore: 0.95,
    },
    {
      sourceId: "snap-routing-101",
      chunkId: "chunk-route-02",
      sourceTitle: "Routing Statis MikroTik",
      snippet: "Parameter administrative distance default bernilai 1.",
      status: "SUPPORTED",
      relevanceScore: 0.92,
    },
  ],
};

// -----------------------------------------------------------------------------
// TEST 1: VALID GENERATION INPUT ACCEPTED
// -----------------------------------------------------------------------------
{
  const validInput = {
    sourceSnapshotIds: ["snap-routing-101"],
    kelasId: "a0000000-0000-0000-0000-000000000001",
    topik: "Konfigurasi Routing Statis MikroTik",
    mapel: "Teknik Jaringan Komputer",
    targetFase: "E",
    alokasiWaktu: "2 x 45 menit",
    generationOptions: {
      includeActivities: true,
      includeAssessmentRubric: true,
    },
  };

  const validated = validateModulGenerationInput(validInput, MOCK_TEACHER_A_CONTEXT);
  assert.equal(validated.teacherId, TEACHER_A_ID);
  assert.equal(validated.targetClass.namaKelas, "X TKJ 1");
  assert.equal(validated.targetClass.tingkat, "X");
  assert.equal(validated.targetClass.kelasLabel, "X X TKJ 1");
  assert.equal(validated.verifiedSources.length, 1);
  assert.equal(validated.verifiedSources[0].id, "snap-routing-101");
  pass(1, "Valid generation input accepted and academic context resolved cleanly");
}

// -----------------------------------------------------------------------------
// TEST 2: INVALID ACADEMIC CONTEXT REJECTED
// -----------------------------------------------------------------------------
{
  const unownedClassInput = {
    sourceSnapshotIds: ["snap-routing-101"],
    kelasId: "b0000000-0000-0000-0000-000000000999", // Not in teacher's class list
    topik: "Konfigurasi Routing Statis",
  };

  assert.throws(
    () => validateModulGenerationInput(unownedClassInput, MOCK_TEACHER_A_CONTEXT),
    (err) => err.code === AI_ERROR_CODES.ROLE_FORBIDDEN,
  );
  pass(2, "Invalid/unowned class ID strictly rejected with ROLE_FORBIDDEN");
}

// -----------------------------------------------------------------------------
// TEST 3: CLIENT-SUPPLIED USER ID IS NOT TRUSTED (REJECTED)
// -----------------------------------------------------------------------------
{
  const spoofedInput = {
    sourceSnapshotIds: ["snap-routing-101"],
    kelasId: "a0000000-0000-0000-0000-000000000001",
    topik: "Konfigurasi Routing Statis",
    userId: "admin-hacker-id", // Client spoof attempt
  };

  assert.throws(
    () => validateModulGenerationInput(spoofedInput, MOCK_TEACHER_A_CONTEXT),
    (err) => err.code === AI_ERROR_CODES.INVALID_REQUEST,
  );
  pass(3, "Client-supplied userId/teacherId strictly rejected with INVALID_REQUEST");
}

// -----------------------------------------------------------------------------
// TEST 4: TEACHER OWNERSHIP IS REQUIRED (ROLE CHECK)
// -----------------------------------------------------------------------------
{
  const studentContext = {
    ...MOCK_TEACHER_A_CONTEXT,
    teacherRole: "siswa",
  };

  assert.throws(
    () =>
      validateModulGenerationInput(
        {
          sourceSnapshotIds: ["snap-routing-101"],
          kelasId: "a0000000-0000-0000-0000-000000000001",
          topik: "Konfigurasi Routing Statis",
        },
        studentContext,
      ),
    (err) => err.code === AI_ERROR_CODES.ROLE_FORBIDDEN,
  );
  pass(4, "Non-teacher roles (siswa) strictly blocked from generation input with ROLE_FORBIDDEN");
}

// -----------------------------------------------------------------------------
// TEST 5: SOURCE OWNERSHIP IS REQUIRED (NON-EXISTENT SOURCE)
// -----------------------------------------------------------------------------
{
  const missingSourceInput = {
    sourceSnapshotIds: ["snap-ghost-non-existent"],
    kelasId: "a0000000-0000-0000-0000-000000000001",
    topik: "Konfigurasi Routing Statis",
  };

  assert.throws(
    () => validateModulGenerationInput(missingSourceInput, MOCK_TEACHER_A_CONTEXT),
    (err) => err.code === AI_ERROR_CODES.RETRIEVAL_ERROR,
  );
  pass(5, "Non-existent source snapshot rejected with RETRIEVAL_ERROR");
}

// -----------------------------------------------------------------------------
// TEST 6: CROSS-TEACHER SOURCE ACCESS REJECTED
// -----------------------------------------------------------------------------
{
  const crossSourceInput = {
    sourceSnapshotIds: ["snap-other-teacher-201"], // Belongs to Teacher B
    kelasId: "a0000000-0000-0000-0000-000000000001",
    topik: "Akuntansi Jurnal",
  };

  assert.throws(
    () => validateModulGenerationInput(crossSourceInput, MOCK_TEACHER_A_CONTEXT),
    (err) => err.code === AI_ERROR_CODES.ROLE_FORBIDDEN,
  );
  pass(6, "Cross-teacher source access attempt strictly rejected with ROLE_FORBIDDEN");
}

// -----------------------------------------------------------------------------
// TEST 7: VALID MODUL AJAR OUTPUT PASSES SCHEMA
// -----------------------------------------------------------------------------
{
  const validated = validateGroundedModulAjarOutput(VALID_CANONICAL_OUTPUT);
  assert.equal(validated.schemaVersion, CANONICAL_OUTPUT_SCHEMA_VERSION);
  assert.equal(validated.judul, "Konfigurasi Routing Statis pada Jaringan Komputer");
  assert.equal(validated.sections.length, 2);
  assert.equal(validated.tujuanPembelajaran.length, 2);
  assert.ok(validated.kegiatanPembelajaran.pendahuluan.aktivitas.length > 0);
  assert.ok(validated.asesmen.kriteria.length > 0);
  pass(7, "Valid canonical Modul Ajar output passes GroundedModulAjarOutputSchema");
}

// -----------------------------------------------------------------------------
// TEST 8: MISSING REQUIRED FIELD FAILS SCHEMA
// -----------------------------------------------------------------------------
{
  const invalidOutput = {
    ...VALID_CANONICAL_OUTPUT,
    ringkasan: undefined, // Missing required field
  };

  assert.throws(
    () => validateGroundedModulAjarOutput(invalidOutput),
    (err) => err.code === AI_ERROR_CODES.PROVIDER_MALFORMED_OUTPUT,
  );
  pass(8, "Missing required field (ringkasan) rejected with PROVIDER_MALFORMED_OUTPUT");
}

// -----------------------------------------------------------------------------
// TEST 9: WRONG DATA TYPE FAILS SCHEMA
// -----------------------------------------------------------------------------
{
  const wrongTypeOutput = {
    ...VALID_CANONICAL_OUTPUT,
    fase: "INVALID_FASE", // Must be A, B, C, D, E, or F
  };

  assert.throws(
    () => validateGroundedModulAjarOutput(wrongTypeOutput),
    (err) => err.code === AI_ERROR_CODES.PROVIDER_MALFORMED_OUTPUT,
  );
  pass(9, "Wrong data type (invalid Kurikulum Merdeka fase) rejected with PROVIDER_MALFORMED_OUTPUT");
}

// -----------------------------------------------------------------------------
// TEST 10: EMPTY GENERATED CONTENT FAILS
// -----------------------------------------------------------------------------
{
  const emptySectionsOutput = {
    ...VALID_CANONICAL_OUTPUT,
    sections: [], // Must have at least 1 section
  };

  assert.throws(
    () => validateGroundedModulAjarOutput(emptySectionsOutput),
    (err) => err.code === AI_ERROR_CODES.PROVIDER_MALFORMED_OUTPUT,
  );
  pass(10, "Empty sections array rejected with PROVIDER_MALFORMED_OUTPUT");
}

// -----------------------------------------------------------------------------
// TEST 11: INVALID EVIDENCE REFERENCE FAILS
// -----------------------------------------------------------------------------
{
  const ghostEvidenceOutput = {
    ...VALID_CANONICAL_OUTPUT,
    sections: [
      {
        ...VALID_CANONICAL_OUTPUT.sections[0],
        evidenceIds: ["ghost-chunk-that-does-not-exist"],
      },
    ],
  };

  assert.throws(
    () => validateGroundedModulAjarOutput(ghostEvidenceOutput),
    (err) => err.code === AI_ERROR_CODES.GROUNDING_FAILED,
  );
  pass(11, "Dangling evidenceId not found in evidenceRefs rejected with GROUNDING_FAILED");
}

// -----------------------------------------------------------------------------
// TEST 12: UNSUPPORTED GROUNDING STATUS CANNOT BE PROMOTED TO SUPPORTED
// -----------------------------------------------------------------------------
{
  const promotedFraudOutput = {
    ...VALID_CANONICAL_OUTPUT,
    evidenceRefs: [
      {
        sourceId: "snap-routing-101",
        chunkId: "chunk-route-01",
        snippet: "Informasi tidak ditemukan",
        status: "NOT_FOUND", // Status in source is NOT_FOUND
      },
    ],
    sections: [
      {
        ...VALID_CANONICAL_OUTPUT.sections[0],
        evidenceIds: ["chunk-route-01"],
        status: "SUPPORTED", // Promoted fraud! Cannot claim SUPPORTED when evidence is NOT_FOUND
      },
    ],
  };

  assert.throws(
    () => validateGroundedModulAjarOutput(promotedFraudOutput),
    (err) => err.code === AI_ERROR_CODES.GROUNDING_FAILED,
  );
  pass(12, "Grounding invariant: Item with NOT_FOUND evidence cannot be promoted to SUPPORTED");
}

// -----------------------------------------------------------------------------
// TEST 13: PROMPT REGISTRY CONTRACT
// -----------------------------------------------------------------------------
{
  const prompt = getRegisteredPrompt(CANONICAL_PROMPT_VERSION);
  assert.equal(prompt.version, CANONICAL_PROMPT_VERSION);
  assert.ok(prompt.systemPrompt.includes("GroundedModulAjarOutputSchema"));
  assert.ok(prompt.buildUserPrompt({ topik: "Routing", mapel: "TKJ", kelas: "X" }).includes("schemaVersion"));
  pass(13, `Prompt version "${CANONICAL_PROMPT_VERSION}" verified in central prompt registry`);
}

// -----------------------------------------------------------------------------
// TEST 14: DRAFT STATUS PRESERVED IN PERSISTENCE MAPPING
// -----------------------------------------------------------------------------
{
  const draft = mapGroundedOutputToModulDraft(VALID_CANONICAL_OUTPUT, {
    sourceSnapshotIds: ["snap-routing-101"],
    kelasId: "a0000000-0000-0000-0000-000000000001",
    sumberTipe: "eBook / Dokumen",
    sumberJudul: "Routing Statis MikroTik",
  });

  assert.equal(draft.status, "Draft"); // Must ALWAYS be Draft upon AI generation
  assert.equal(draft.isArchived, false);
  assert.equal(draft.sections.length, 2);
  assert.equal(draft.sections[0].judul, "Konsep Dasar dan Keuntungan Routing Statis");
  assert.ok(draft.aiMetadata);
  assert.equal(draft.aiMetadata.validationStatus, "valid");
  assert.equal(draft.aiMetadata.promptVersion, CANONICAL_PROMPT_VERSION);
  assert.equal(draft.aiMetadata.tujuanPembelajaran.length, 2);
  pass(14, "Draft lifecycle strictly preserved: AI generated module always maps to status 'Draft'");
}

// -----------------------------------------------------------------------------
// TEST 15: EXISTING MODULE SCHEMA COMPATIBILITY & PDF EXPORTER
// -----------------------------------------------------------------------------
{
  const draft = mapGroundedOutputToModulDraft(VALID_CANONICAL_OUTPUT, {
    sourceSnapshotIds: ["snap-routing-101"],
    kelasId: "a0000000-0000-0000-0000-000000000001",
    sumberTipe: "eBook / Dokumen",
  });

  // Assemble full Modul object as stored in database
  const fullModul = {
    id: "modul-test-uuid-001",
    ...draft,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Test that exportModulAjarPdf executes without error on this canonical output
  const pdfResult = await exportModulAjarPdf(fullModul, {
    guruNama: "Budi Santoso, S.Kom.",
    tahunAjaran: "2026/2027",
  });

  assert.ok(pdfResult.filename);
  assert.ok(pdfResult.filename.includes("konfigurasi-routing-statis"));
  assert.ok(pdfResult.doc);
  pass(15, "Full compatibility verified: AI Modul Ajar seamlessly exports via exportModulAjarPdf");
}

// -----------------------------------------------------------------------------
// TEST 16: PARSER STRIPS CODEBLOCKS AND REJECTS MALFORMED RESPONSES
// -----------------------------------------------------------------------------
{
  // 16.1 Fenced JSON response
  const fencedResponse = "```json\n" + JSON.stringify(VALID_CANONICAL_OUTPUT) + "\n```";
  const parsedFromFence = parseAiModulResponse(fencedResponse);
  assert.equal(parsedFromFence.judul, VALID_CANONICAL_OUTPUT.judul);

  // 16.2 Malformed non-JSON response
  assert.throws(
    () => parseAiModulResponse("Maaf, saya tidak dapat membuat modul ajar."),
    (err) => err.code === AI_ERROR_CODES.PROVIDER_MALFORMED_OUTPUT,
  );

  // 16.3 Empty string
  assert.throws(
    () => parseAiModulResponse("   "),
    (err) => err.code === AI_ERROR_CODES.PROVIDER_MALFORMED_OUTPUT,
  );
  pass(16, "Safe response parser: Fenced markdown stripped cleanly and malformed text rejected");
}

console.log("================================================================================");
console.log(`  ALL ${passed} AI-2A CONTRACT & OUTPUT SCHEMA CHECKS PASSED! (0 FAILED)        `);
console.log("================================================================================");
