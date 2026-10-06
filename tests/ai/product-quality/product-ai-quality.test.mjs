#!/usr/bin/env node
/**
 * ==============================================================================
 * GURUPRO TEST SUITE: PRODUCT-1B AI QUALITY IMPROVEMENTS
 * ==============================================================================
 *
 * Verifies the AI quality improvements implemented in PRODUCT-1B:
 * 1. Question Normalization: Key casing, prefix stripping ("A. " -> clean), auto ID
 * 2. Question Hygiene Gate:
 *    - EMPTY_OPTION (CRITICAL)
 *    - NON_PEDAGOGICAL_DISTRACTOR (MAJOR -> REVISE)
 *    - OPTION_CLONES_QUESTION (CRITICAL)
 *    - ESSAY_PROMPT_TOO_SHORT (MAJOR)
 * 3. Modul Pedagogical Gate:
 *    - PED_SHALLOW_SECTION (< 40 chars without points -> CRITICAL)
 *    - PED_EMPTY_ACTIVITIES / PED_EMPTY_INTI_ACTIVITY (CRITICAL)
 * 4. Grounding & Vocational Synonyms:
 *    - Bilingual pairs (algoritma/algorithm, protokol/protocol, penyimpanan/storage,
 *      pencadangan/backup, perangkat keras/hardware, keamanan siber/cybersecurity)
 *    - Strict fail-closed invariant preserved for ungrounded/invented claims
 */

import assert from "node:assert/strict";
import { parseAiQuestionResponse } from "../../../src/lib/ai/question-generator.js";
import {
  validateDeterministicQuestionLayer,
  validateQuestionPackageQuality,
  CANONICAL_QUESTION_QUALITY_VERSION,
} from "../../../src/lib/ai/question-quality-validator.js";
import {
  validatePedagogicalCoherence,
  validateGeneratedModulAjar,
} from "../../../src/lib/ai/modul-quality-validator.js";
import {
  EDUCATIONAL_SYNONYMS,
  evaluateGroundingAgainstSource,
} from "../../../src/lib/ai/grounding.js";

console.log("================================================================================");
console.log("  GURUPRO TEST SUITE: PRODUCT-1B AI QUALITY IMPROVEMENTS                         ");
console.log("================================================================================");

let passedCount = 0;
function pass(num, label) {
  passedCount++;
  console.log(`  [PASS ${num}] ${label}`);
}

// -----------------------------------------------------------------------------
// HELPER: Mock Grounded Question Context
// -----------------------------------------------------------------------------
function makeMockQuestionContext(options = {}) {
  return {
    sourceId: "src-vlan-101",
    academicContext: {
      teacherRole: "guru",
      verificationStatus: "terverifikasi",
      guruId: "guru-tkj-01",
      mapelId: "mapel-tkj",
      kelasId: "kelas-xi-tkj",
      tingkat: "XI",
      targetFase: "F",
      sourceOwnerId: "guru-tkj-01",
    },
    groundingTarget: {
      topik: "VLAN dan Switching",
      targetTujuanPembelajaranDeskripsi: ["Peserta didik mampu mengonfigurasi VLAN pada switch"],
    },
    evidenceSufficiency: "SUFFICIENT",
    evidenceItems: [
      {
        evidenceId: "ev_vlan_c0",
        sourceId: "src-vlan-101",
        chunkId: "c0",
        content: "Virtual Local Area Network (VLAN) menggunakan standar IEEE 802.1Q dengan format frame memuat Tag Protocol Identifier (TPID) 0x8100 dan VLAN ID 12 bit.",
        tokenCount: 30,
        status: "SUPPORTED",
      },
    ],
    ...options,
  };
}

// -----------------------------------------------------------------------------
// SECTION 1: QUESTION PARSING & NORMALIZATION
// -----------------------------------------------------------------------------
console.log("\n--- SECTION 1: QUESTION PARSING & NORMALIZATION ---");

{
  // Test 1: Normalize lowercase key ("a" -> "A") and strip "A. ", "B) ", "(C) ", "D. " prefixes
  const rawModelResponse = JSON.stringify({
    judul: "Asesmen Jaringan",
    questions: [
      {
        pertanyaan: "Berapa ukuran field VLAN ID pada tag 802.1Q?",
        jenis: "Pilihan Ganda",
        opsi: [
          "A. 12 bit",
          "B) 16 bit",
          "(C) 8 bit",
          "D. 24 bit",
        ],
        kunci: "a",
        penjelasan: "VLAN ID berukuran 12 bit sesuai standar IEEE 802.1Q.",
      },
    ],
  });

  const parsed = parseAiQuestionResponse(rawModelResponse, {
    topik: "VLAN",
    modulId: "mod-1",
    tingkat: "Sedang",
  });

  assert.equal(parsed.questions.length, 1);
  const q0 = parsed.questions[0];
  assert.equal(q0.id, "soal_1", "Missing ID should be auto-assigned canonical ID");
  assert.equal(q0.kunci, "A", "Lowercase answer key should be normalized to uppercase");
  assert.deepEqual(q0.opsi, ["12 bit", "16 bit", "8 bit", "24 bit"], "Letter prefixes should be stripped from option texts");
  pass(1, "Question parser normalizes lowercase key to uppercase and strips option prefixes");
}

{
  // Test 2: Fallback ID generation for multiple items
  const rawMultiResponse = JSON.stringify({
    questions: [
      { id: "", pertanyaan: "Pertanyaan pertama?", jenis: "Esai", kunci: "Rubrik penilaian lengkap 1" },
      { id: "custom_id", pertanyaan: "Pertanyaan kedua?", jenis: "Esai", kunci: "Rubrik penilaian lengkap 2" },
      { pertanyaan: "Pertanyaan ketiga?", jenis: "Esai", kunci: "Rubrik penilaian lengkap 3" },
    ],
  });

  const parsed = parseAiQuestionResponse(rawMultiResponse, { topik: "Esai Test" });
  assert.equal(parsed.questions[0].id, "soal_1");
  assert.equal(parsed.questions[1].id, "custom_id");
  assert.equal(parsed.questions[2].id, "soal_3");
  pass(2, "Question parser reliably provides canonical IDs for missing or empty item IDs");
}

// -----------------------------------------------------------------------------
// SECTION 2: DETERMINISTIC QUESTION HYGIENE VALIDATOR
// -----------------------------------------------------------------------------
console.log("\n--- SECTION 2: DETERMINISTIC QUESTION HYGIENE VALIDATOR ---");

{
  // Test 3: EMPTY_OPTION detection
  const context = makeMockQuestionContext();
  const pkgWithEmptyOption = {
    schemaVersion: "1.0.0",
    judul: "Paket Uji Opsi Kosong",
    topik: "VLAN",
    tingkat: "Sedang",
    questions: [
      {
        id: "soal_1",
        jenis: "Pilihan Ganda",
        pertanyaan: "Berapa ukuran VLAN ID standar 802.1Q?",
        opsi: ["12 bit", "", "8 bit", "24 bit"],
        kunci: "A",
        penjelasan: "12 bit.",
        evidenceIds: ["ev_vlan_c0"],
        status: "SUPPORTED",
      },
    ],
    evidenceRefs: [],
  };

  const l1Result = validateDeterministicQuestionLayer(pkgWithEmptyOption, context);
  const emptyOptFinding = l1Result.findings.find((f) => f.code === "EMPTY_OPTION");
  assert.ok(emptyOptFinding, "EMPTY_OPTION finding must be present");
  assert.equal(emptyOptFinding.severity, "CRITICAL");
  assert.equal(l1Result.isValid, false, "Must fail deterministic layer");
  pass(3, "EMPTY_OPTION is flagged with CRITICAL severity and fails deterministic validation");
}

{
  // Test 4: NON_PEDAGOGICAL_DISTRACTOR detection (e.g. 'Semua jawaban benar', 'Tidak ada yang benar')
  const context = makeMockQuestionContext();
  const pkgWithBadDistractor = {
    schemaVersion: "1.0.0",
    judul: "Paket Uji Pengecoh Malas",
    topik: "VLAN",
    tingkat: "Sedang",
    questions: [
      {
        id: "soal_1",
        jenis: "Pilihan Ganda",
        pertanyaan: "Manakah informasi yang termuat pada tag IEEE 802.1Q?",
        opsi: ["VLAN ID 12 bit", "TPID 0x8100", "Priority Code Point", "Semua jawaban benar"],
        kunci: "A",
        penjelasan: "VLAN ID berukuran 12 bit sesuai standar frame 802.1Q.",
        evidenceIds: ["ev_vlan_c0"],
        status: "SUPPORTED",
      },
    ],
    evidenceRefs: [],
  };

  const l1Result = validateDeterministicQuestionLayer(pkgWithBadDistractor, context);
  const distractorFinding = l1Result.findings.find((f) => f.code === "NON_PEDAGOGICAL_DISTRACTOR");
  assert.ok(distractorFinding, "NON_PEDAGOGICAL_DISTRACTOR finding must be present");
  assert.equal(distractorFinding.severity, "MAJOR");

  // In full package evaluation, MAJOR finding without CRITICAL triggers REVISE
  const pkgRes = await validateQuestionPackageQuality(pkgWithBadDistractor, context, { skipSemanticLayer: true });
  assert.equal(pkgRes.status, "REVISE", "Non-pedagogical distractor must trigger REVISE for regeneration");
  pass(4, "NON_PEDAGOGICAL_DISTRACTOR ('Semua jawaban benar') is detected and triggers REVISE");
}

{
  // Test 5: Additional variants of non-pedagogical distractors
  const badVariants = [
    "Tidak ada yang benar",
    "Semua opsi salah",
    "Jawaban A dan B benar",
    "None of the above",
    "All of the above",
  ];

  const context = makeMockQuestionContext();
  for (const badOpt of badVariants) {
    const pkg = {
      schemaVersion: "1.0.0",
      judul: "Uji Variasi Distraktor",
      topik: "VLAN",
      tingkat: "Sedang",
      questions: [
        {
          id: "soal_test",
          jenis: "Pilihan Ganda",
          pertanyaan: "Berapa standar tag IEEE 802.1Q?",
          opsi: ["802.1Q", "802.1D", "802.3", badOpt],
          kunci: "A",
          penjelasan: "802.1Q.",
          evidenceIds: ["ev_vlan_c0"],
          status: "SUPPORTED",
        },
      ],
      evidenceRefs: [],
    };
    const l1Result = validateDeterministicQuestionLayer(pkg, context);
    const finding = l1Result.findings.find((f) => f.code === "NON_PEDAGOGICAL_DISTRACTOR");
    assert.ok(finding, `Must flag bad distractor variant: "${badOpt}"`);
  }
  pass(5, "Comprehensive regex catches all common lazy distractor variants");
}

{
  // Test 6: OPTION_CLONES_QUESTION detection
  const context = makeMockQuestionContext();
  const stem = "Apakah fungsi dari VLAN ID pada jaringan komputer?";
  const pkgWithClonedStem = {
    schemaVersion: "1.0.0",
    judul: "Uji Duplikasi Pertanyaan Opsi",
    topik: "VLAN",
    tingkat: "Sedang",
    questions: [
      {
        id: "soal_1",
        jenis: "Pilihan Ganda",
        pertanyaan: stem,
        opsi: ["12 bit", stem, "8 bit", "24 bit"],
        kunci: "A",
        penjelasan: "12 bit.",
        evidenceIds: ["ev_vlan_c0"],
        status: "SUPPORTED",
      },
    ],
    evidenceRefs: [],
  };

  const l1Result = validateDeterministicQuestionLayer(pkgWithClonedStem, context);
  const cloneFinding = l1Result.findings.find((f) => f.code === "OPTION_CLONES_QUESTION");
  assert.ok(cloneFinding, "OPTION_CLONES_QUESTION finding must be present");
  assert.equal(cloneFinding.severity, "CRITICAL");
  pass(6, "OPTION_CLONES_QUESTION is flagged with CRITICAL severity and rejected");
}

{
  // Test 7: ESSAY_PROMPT_TOO_SHORT detection
  const context = makeMockQuestionContext();
  const pkgWithShortEssay = {
    schemaVersion: "1.0.0",
    judul: "Uji Esai Terlalu Singkat",
    topik: "VLAN",
    tingkat: "Sedang",
    questions: [
      {
        id: "soal_1",
        jenis: "Esai",
        pertanyaan: "Jelaskan VLAN.", // 14 characters (< 15)
        opsi: [],
        kunci: "Rubrik penilaian: Menjelaskan segmentasi jaringan logis pada switch.",
        penjelasan: "VLAN membagi broadcast domain.",
        evidenceIds: ["ev_vlan_c0"],
        status: "SUPPORTED",
      },
    ],
    evidenceRefs: [],
  };

  const l1Result = validateDeterministicQuestionLayer(pkgWithShortEssay, context);
  const shortFinding = l1Result.findings.find((f) => f.code === "ESSAY_PROMPT_TOO_SHORT");
  assert.ok(shortFinding, "ESSAY_PROMPT_TOO_SHORT finding must be present");
  assert.equal(shortFinding.severity, "MAJOR");
  pass(7, "ESSAY_PROMPT_TOO_SHORT (< 15 characters) is detected with MAJOR severity");
}

// -----------------------------------------------------------------------------
// SECTION 3: MODUL AJAR PEDAGOGICAL COHERENCE & DEPTH
// -----------------------------------------------------------------------------
console.log("\n--- SECTION 3: MODUL AJAR PEDAGOGICAL COHERENCE & DEPTH ---");

{
  // Helper for mock modul grounding context
  const mockModulContext = {
    academicContext: {
      teacherRole: "guru",
      verificationStatus: "terverifikasi",
      guruId: "guru-tkj-01",
      mapelId: "mapel-tkj",
      kelasId: "kelas-xi-tkj",
      tingkat: "XI",
      targetFase: "F",
      sourceOwnerId: "guru-tkj-01",
    },
    evidenceItems: [
      {
        evidenceId: "ev_1",
        sourceId: "src_1",
        chunkId: "c1",
        content: "Routing statis MikroTik menggunakan administrative distance = 1.",
        tokenCount: 20,
        status: "SUPPORTED",
      },
    ],
    coverageRatio: 1.0,
    sourceConflicts: [],
    unreferencedChunkIds: [],
  };

  // Test 8: PED_SHALLOW_SECTION detection
  const shallowModul = {
    schemaVersion: "1.0.0",
    judul: "Modul Jaringan Komputer",
    mapel: "Teknik Komputer Jaringan",
    kelas: "XI",
    fase: "F",
    alokasiWaktu: "2 x 45 menit",
    ringkasan: "Modul ini membahas konfigurasi routing statis secara mendalam.",
    tujuanPembelajaran: [
      {
        id: "TP-01",
        deskripsi: "Peserta didik mampu mengonfigurasi routing statis pada router MikroTik.",
        evidenceIds: ["ev_1"],
        status: "SUPPORTED",
      },
    ],
    sections: [
      {
        id: "SEC-01",
        judul: "Pengantar Routing",
        poin: [],
        isi: "Routing adalah proses.", // 23 characters (< 40) without points
        evidenceIds: ["ev_1"],
        status: "SUPPORTED",
      },
    ],
    kegiatanPembelajaran: {
      pendahuluan: { alokasiMenit: 15, aktivitas: ["Apersepsi materi sebelumnya."], evidenceIds: ["ev_1"] },
      inti: { alokasiMenit: 60, aktivitas: ["Praktik konfigurasi router di lab."], evidenceIds: ["ev_1"] },
      penutup: { alokasiMenit: 15, aktivitas: ["Refleksi dan kesimpulan bersama."], evidenceIds: ["ev_1"] },
    },
    asesmen: {
      kriteria: ["Mampu menghubungkan 2 segmen jaringan"],
      teknik: "Tes Praktik",
      instrumen: "Lembar Observasi",
    },
    evidenceRefs: [],
  };

  const pedIssues = validatePedagogicalCoherence(shallowModul, mockModulContext);
  const shallowIssue = pedIssues.find((i) => i.ruleId === "PED_SHALLOW_SECTION");
  assert.ok(shallowIssue, "PED_SHALLOW_SECTION must be flagged");
  assert.equal(shallowIssue.severity, "CRITICAL");

  const fullResult = validateGeneratedModulAjar(shallowModul, mockModulContext);
  assert.equal(fullResult.status, "REJECT", "Shallow section must cause full module REJECT");
  pass(8, "PED_SHALLOW_SECTION (< 40 characters without points) is detected and rejected");
}

{
  // Test 9: PED_EMPTY_ACTIVITIES / PED_EMPTY_INTI_ACTIVITY detection
  const mockModulContext = {
    academicContext: {
      teacherRole: "guru",
      verificationStatus: "terverifikasi",
      guruId: "guru-tkj-01",
      mapelId: "mapel-tkj",
      kelasId: "kelas-xi-tkj",
      tingkat: "XI",
      targetFase: "F",
      sourceOwnerId: "guru-tkj-01",
    },
    evidenceItems: [
      {
        evidenceId: "ev_1",
        sourceId: "src_1",
        chunkId: "c1",
        content: "Routing statis MikroTik menggunakan administrative distance = 1.",
        tokenCount: 20,
        status: "SUPPORTED",
      },
    ],
    coverageRatio: 1.0,
    sourceConflicts: [],
    unreferencedChunkIds: [],
  };

  const emptyActivitiesModul = {
    schemaVersion: "1.0.0",
    judul: "Modul Jaringan Komputer",
    mapel: "Teknik Komputer Jaringan",
    kelas: "XI",
    fase: "F",
    alokasiWaktu: "2 x 45 menit",
    ringkasan: "Modul ini membahas konfigurasi routing statis secara mendalam.",
    tujuanPembelajaran: [
      {
        id: "TP-01",
        deskripsi: "Peserta didik mampu mengonfigurasi routing statis pada router MikroTik.",
        evidenceIds: ["ev_1"],
        status: "SUPPORTED",
      },
    ],
    sections: [
      {
        id: "SEC-01",
        judul: "Pengantar Routing",
        poin: ["Prinsip routing", "Tabel rute"],
        isi: "Routing adalah proses meneruskan paket antar-jaringan berbeda berdasarkan tabel perutean router.",
        evidenceIds: ["ev_1"],
        status: "SUPPORTED",
      },
    ],
    kegiatanPembelajaran: {
      pendahuluan: { alokasiMenit: 15, aktivitas: ["Apersepsi."], evidenceIds: ["ev_1"] },
      inti: { alokasiMenit: 60, aktivitas: [], evidenceIds: ["ev_1"] }, // Empty inti activities!
      penutup: { alokasiMenit: 15, aktivitas: ["Refleksi."], evidenceIds: ["ev_1"] },
    },
    asesmen: {
      kriteria: ["Mampu menghubungkan 2 segmen jaringan"],
      teknik: "Tes Praktik",
      instrumen: "Lembar Observasi",
    },
    evidenceRefs: [],
  };

  const pedIssues = validatePedagogicalCoherence(emptyActivitiesModul, mockModulContext);
  const emptyIntiIssue = pedIssues.find((i) => i.ruleId === "PED_EMPTY_INTI_ACTIVITY");
  assert.ok(emptyIntiIssue, "PED_EMPTY_INTI_ACTIVITY must be flagged");
  assert.equal(emptyIntiIssue.severity, "CRITICAL");
  pass(9, "PED_EMPTY_INTI_ACTIVITY (empty learning activities in inti) is detected and rejected");
}

// -----------------------------------------------------------------------------
// SECTION 4: BILINGUAL & VOCATIONAL GROUNDING SYNONYMS
// -----------------------------------------------------------------------------
console.log("\n--- SECTION 4: BILINGUAL & VOCATIONAL GROUNDING SYNONYMS ---");

{
  // Test 10: Verify presence of vocational synonyms
  const expectedPairs = [
    ["algoritma", "algorithm"],
    ["protokol", "protocol"],
    ["penyimpanan", "storage"],
    ["pencadangan", "backup"],
    ["perangkat keras", "hardware"],
    ["keamanan siber", "cybersecurity"],
    ["analisis", "analisa"],
  ];

  for (const [idTerm, enTerm] of expectedPairs) {
    const syns = EDUCATIONAL_SYNONYMS[idTerm] || [];
    assert.ok(
      syns.some((s) => s.toLowerCase().includes(enTerm.toLowerCase())),
      `EDUCATIONAL_SYNONYMS["${idTerm}"] must include "${enTerm}"`,
    );
  }
  pass(10, "EDUCATIONAL_SYNONYMS includes all core vocational technical pairs");
}

{
  // Test 11: Grounding match across Indonesian claim and English source material
  const enSourceChunk = {
    chunkId: "chunk_en",
    content: "The storage system provides high-speed backup and protocol inspection for network hardware.",
  };

  // Claim formulated in Indonesian technical vocabulary
  const idClaim1 = "Sistem penyimpanan melakukan pencadangan jaringan.";
  const res1 = evaluateGroundingAgainstSource({
    claim: idClaim1,
    sourceChunks: [enSourceChunk],
    sourceId: "src_en",
  });
  assert.equal(res1.status, "SUPPORTED", "Indonesian claim using synonyms (penyimpanan/storage, pencadangan/backup) must match English source");

  const idClaim2 = "Protokol inspeksi sistem jaringan perangkat keras.";
  const res2 = evaluateGroundingAgainstSource({
    claim: idClaim2,
    sourceChunks: [enSourceChunk],
    sourceId: "src_en",
  });
  assert.equal(res2.status, "SUPPORTED", "Indonesian claim using synonyms (protokol/protocol, perangkat keras/hardware) must match English source");

  pass(11, "Bilingual cross-lingual claims successfully match and achieve SUPPORTED status without false rejection");
}

{
  // Test 12: Preserving Anti-Hallucination Fail-Closed Invariant
  const enSourceChunk = {
    chunkId: "chunk_en",
    content: "The storage system provides high-speed backup and protocol inspection for network hardware.",
  };

  // Fabricated claim with terms completely absent from source
  const inventedClaim = "Sistem menggunakan sensor ultrasonik berfrekuensi 40 kHz untuk mengukur jarak cairan.";
  const failRes = evaluateGroundingAgainstSource({
    claim: inventedClaim,
    sourceChunks: [enSourceChunk],
    sourceId: "src_en",
  });
  assert.equal(failRes.status, "NOT_FOUND", "Unreferenced/fabricated technical claim must strictly fail closed with NOT_FOUND");

  pass(12, "Anti-hallucination fail-closed invariant strictly preserved for unreferenced claims");
}

console.log("================================================================================");
console.log(`  ALL ${passedCount} / 12 CHECKS PASSED SUCCESSFULLY (PRODUCT-1B AI QUALITY VERIFIED) `);
console.log("================================================================================");
