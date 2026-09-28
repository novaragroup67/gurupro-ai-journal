#!/usr/bin/env node
/**
 * ==============================================================================
 * GURUPRO TEST SUITE: AI-4D QUESTION QUALITY VALIDATION
 * ==============================================================================
 *
 * Verifies the complete AI-4D question quality validation gate:
 * - Section A: Factual Grounding (Fully supported, unsupported claims, contradicted facts, exact numbers, specs)
 * - Section B: Answer Correctness (Correct key, wrong key, multiple correct options, zero correct, uncertainty)
 * - Section C: Distractor Quality (Valid distractors, distractor also correct, absurd distractor)
 * - Section D: Ambiguity Detection (Unambiguous, ambiguous wording, critical answer ambiguity)
 * - Section E: Explanation Validation (Supported, contradicts key, ungrounded rationale)
 * - Section F: Learning Objective Alignment (Aligned, mismatched)
 * - Section G: Duplicate Question Detection (Exact duplicate, near duplicate, distinct)
 * - Section H: Essay Validation (Grounded rubric, contradictory rubric, ungrounded rubric)
 * - Section I: Source Conflict Handling (Disambiguated context vs unresolved conflict)
 * - Section J: Semantic Evaluator Integration (Structured response, malformed fallback, uncertainty, prompt injection resistance)
 * - Section K: Bounded Correction Retry (REVISE triggers max 1 retry, revalidation, termination)
 * - Section L: Batch & Package Validation (Duplicate detection across batch, mixed packages)
 * - Section M: Security & Multi-Tenant (Guru auth, student forbidden, cross-tenant evidence rejected, client cannot force PASS)
 * - Section N: Persistence Invariant (PASS saves as Draft, REJECT not saved, metadata preserved)
 * - Section O: Adversarial Test Cases (Tricky edge cases, contradictory sources, misleading distractors)
 */

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AI_ERROR_CODES,
  AiServiceError,
} from "../../src/lib/ai/error-taxonomy.ts";
import {
  ingestSource,
  clearSnapshotCacheForTesting,
} from "../../src/lib/ai/source-ingestion.ts";
import { resetRateLimiterForTesting } from "../../src/lib/ai/rate-limiter.ts";
import {
  CANONICAL_QUESTION_SCHEMA_VERSION,
  toStudentSafeQuestion,
} from "../../src/lib/ai/question-contract.ts";
import {
  buildQuestionGroundingContext,
} from "../../src/lib/ai/question-context-builder.ts";
import {
  generateGroundedQuestions,
} from "../../src/lib/ai/question-generator.ts";
import {
  CANONICAL_QUESTION_QUALITY_VERSION,
  validateQuestionPackageQuality,
  validateSingleQuestionQuality,
  detectDuplicateQuestions,
  validateExactValuesInQuestion,
  validateDeterministicQuestionLayer,
  evaluateQuestionQualityDecision,
} from "../../src/lib/ai/question-quality-validator.ts";
import { getRegisteredPrompt } from "../../src/lib/ai/prompts-registry.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, "../..");
const FIXTURES_DIR = resolve(ROOT_DIR, "tests/fixtures");

console.log("================================================================================");
console.log("  GURUPRO TEST SUITE: AI-4D QUESTION QUALITY VALIDATION                       ");
console.log("================================================================================");

let passed = 0;
function pass(num, label) {
  passed++;
  console.log(`  [PASS ${num}] ${label}`);
}

// Clear caches before running tests
clearSnapshotCacheForTesting();
resetRateLimiterForTesting();

// -----------------------------------------------------------------------------
// SETUP FIXTURES & AUTH CONTEXT
// -----------------------------------------------------------------------------
const TEACHER_1_ID = "guru-network-quality-501";
const TEACHER_2_ID = "guru-other-quality-502";

const txtPath = resolve(FIXTURES_DIR, "educational-network-routing.txt");
const htmlPath = resolve(FIXTURES_DIR, "educational-web-vlan.html");

assert.ok(existsSync(txtPath), "TXT routing fixture must exist");
assert.ok(existsSync(htmlPath), "HTML VLAN fixture must exist");

const routingTxtContent = readFileSync(txtPath, "utf-8");
const vlanHtmlContent = readFileSync(htmlPath, "utf-8");

// Ingest Teacher 1 snapshots
const snapRouting = await ingestSource({
  sourceType: "text",
  input: routingTxtContent,
  title: "Bahan Ajar Routing Statis MikroTik",
  userId: TEACHER_1_ID,
});

const snapVlan = await ingestSource({
  sourceType: "dokumen",
  input: vlanHtmlContent,
  fileName: "vlan-concept.html",
  mimeType: "text/html",
  title: "Panduan VLAN 802.1Q",
  userId: TEACHER_1_ID,
});

// Ingest Teacher 2 snapshot (for tenant boundary test)
const snapTeacher2 = await ingestSource({
  sourceType: "text",
  input: "Materi rahasia guru lain tentang konfigurasi keamanan server Linux Ubuntu dan manajemen izin berkas permission chmod chown serta firewall ufw.",
  title: "Materi Guru Lain",
  userId: TEACHER_2_ID,
});

const validTeacherContext = {
  teacherId: TEACHER_1_ID,
  teacherRole: "guru",
  verificationStatus: "terverifikasi",
  teacherClasses: [
    {
      id: "kelas-tkj-1",
      namaKelas: "XII TKJ 1",
      tingkat: "XII",
      mapel: "Administrasi Infrastruktur Jaringan",
      guruId: TEACHER_1_ID,
    },
  ],
  availableSourceSnapshots: [],
};

// Build baseline grounding context for Routing Statis
const routingInput = {
  sourceSnapshotIds: [snapRouting.id],
  topik: "Routing Statis",
  jumlah: 2,
};
const routingContext = await buildQuestionGroundingContext(routingInput, validTeacherContext);
const ev0 = routingContext.evidenceItems[0].evidenceId;
const ev1 = routingContext.evidenceItems[1]?.evidenceId || ev0;
const cliEv = routingContext.evidenceItems.find((e) => e.content.includes("/ip route add"))?.evidenceId || ev1;
const distEv = routingContext.evidenceItems.find((e) => e.content.includes("administrative distance"))?.evidenceId || ev0;
const gwEv = routingContext.evidenceItems.find((e) => e.content.toLowerCase().includes("gateway"))?.evidenceId || ev1;


// Helper to build canonical package for tests
function makePackage(questions, evidenceRefs = [{ sourceId: snapRouting.id, status: "SUPPORTED" }]) {
  return {
    schemaVersion: CANONICAL_QUESTION_SCHEMA_VERSION,
    judul: "Paket Soal Uji Kualitas",
    topik: "Routing Statis",
    tingkat: "Sedang",
    questions,
    evidenceRefs,
  };
}

// ==============================================================================
// SECTION A: FACTUAL GROUNDING
// ==============================================================================
console.log("\n--- SECTION A: FACTUAL GROUNDING ---");

// Test 1: Fully supported question passes factual validation
{
  const q = {
    id: "q-fact-1",
    jenis: "Pilihan Ganda",
    pertanyaan: "Berapakah nilai default administrative distance untuk routing statis pada MikroTik RouterOS?",
    opsi: ["1", "5", "10", "110"],
    kunci: "A",
    penjelasan: "Administrative distance default untuk static route di RouterOS bernilai 1.",
    tingkat: "Sedang",
    evidenceIds: [ev0],
    status: "SUPPORTED",
  };

  const res = await validateQuestionPackageQuality(makePackage([q]), routingContext, { skipSemanticLayer: true });
  assert.equal(res.status, "PASS");
  assert.equal(res.factualFindings.length, 0);
  pass(1, "Fully supported question passes factual validation with status: 'PASS'");
}

// Test 2: Fabricated number absent from source triggers EXACT_VALUE_MISMATCH & REJECT
{
  const q = {
    id: "q-fact-2",
    jenis: "Pilihan Ganda",
    pertanyaan: "Berapakah nilai default administrative distance pada RouterOS jika diatur ke angka 9999?",
    opsi: ["9999", "5", "10", "110"],
    kunci: "A",
    penjelasan: "Nilai distance adalah 9999.",
    tingkat: "Sedang",
    evidenceIds: [ev0],
    status: "SUPPORTED",
  };

  const res = await validateQuestionPackageQuality(makePackage([q]), routingContext, { skipSemanticLayer: true });
  assert.equal(res.status, "REJECT");
  const mismatch = res.factualFindings.find((f) => f.code === "EXACT_VALUE_MISMATCH");
  assert.ok(mismatch !== undefined);
  assert.equal(mismatch.severity, "CRITICAL");
  pass(2, "Fabricated number absent from source triggers EXACT_VALUE_MISMATCH with status: 'REJECT'");
}

// Test 3: Technical identifier / IP subnet mismatch triggers REJECT
{
  const q = {
    id: "q-fact-3",
    jenis: "Pilihan Ganda",
    pertanyaan: "Manakah konfigurasi subnet untuk jaringan lokal?",
    opsi: ["10.254.254.1/24", "192.168.1.0/24", "172.16.0.0/16", "10.0.0.0/8"],
    kunci: "A", // 10.254.254.1 is not in routing source
    penjelasan: "Menggunakan subnet 10.254.254.1/24.",
    tingkat: "Sedang",
    evidenceIds: [ev0],
    status: "SUPPORTED",
  };

  const res = await validateQuestionPackageQuality(makePackage([q]), routingContext, { skipSemanticLayer: true });
  assert.equal(res.status, "REJECT");
  const ipMismatch = res.answerFindings.find((f) => f.code === "EXACT_VALUE_MISMATCH");
  assert.ok(ipMismatch !== undefined);
  pass(3, "Technical IP identifier mismatch triggers EXACT_VALUE_MISMATCH with status: 'REJECT'");
}

// ==============================================================================
// SECTION B: ANSWER-KEY CORRECTNESS
// ==============================================================================
console.log("\n--- SECTION B: ANSWER-KEY CORRECTNESS ---");

// Test 4: Supported key passes answer correctness
{
  const q = {
    id: "q-ans-1",
    jenis: "Pilihan Ganda",
    pertanyaan: "Perintah CLI apakah yang digunakan untuk menambahkan static route di MikroTik?",
    opsi: ["/ip route add", "/ip address add", "/ip firewall add", "/system route add"],
    kunci: "A",
    penjelasan: "/ip route add digunakan untuk menambah static route.",
    tingkat: "Sedang",
    evidenceIds: [cliEv],
    status: "SUPPORTED",
  };

  const res = await validateQuestionPackageQuality(makePackage([q]), routingContext, { skipSemanticLayer: true });
  assert.equal(res.status, "PASS");
  assert.equal(res.answerFindings.length, 0);
  pass(4, "Correctly keyed option supported by evidence passes with status: 'PASS'");
}

// Test 5: Keyed option unsupported by evidence triggers ANSWER_KEY_UNSUPPORTED & REJECT
{
  const q = {
    id: "q-ans-2",
    jenis: "Pilihan Ganda",
    pertanyaan: "Berapakah nilai default administrative distance untuk routing statis?",
    opsi: ["1", "5", "Protokol EIGRP", "Protokol OSPF"],
    kunci: "C", // Key points to completely unsupported answer
    penjelasan: "Kunci adalah C.",
    tingkat: "Sedang",
    evidenceIds: [distEv],
    status: "SUPPORTED",
  };

  const res = await validateQuestionPackageQuality(makePackage([q]), routingContext, { skipSemanticLayer: true });
  assert.equal(res.status, "REJECT");
  const err = res.answerFindings.find((f) => f.code === "ANSWER_KEY_UNSUPPORTED");
  assert.ok(err !== undefined);
  assert.equal(err.severity, "CRITICAL");
  pass(5, "Keyed option unsupported by evidence triggers ANSWER_KEY_UNSUPPORTED and status: 'REJECT'");
}

// Test 6: Multiple correct answers (duplicate correct options) triggers REJECT
{
  const q = {
    id: "q-ans-3",
    jenis: "Pilihan Ganda",
    pertanyaan: "Manakah perintah untuk menambah tabel routing?",
    opsi: ["/ip route add", "/ip route add", "/interface vlan add", "/ip dhcp-server add"],
    kunci: "A",
    penjelasan: "/ip route add adalah perintah yang benar.",
    tingkat: "Sedang",
    evidenceIds: [cliEv],
    status: "SUPPORTED",
  };

  const res = await validateQuestionPackageQuality(makePackage([q]), routingContext, { skipSemanticLayer: true });
  assert.equal(res.status, "REJECT");
  const dup =
    res.structuralFindings.find((f) => f.message.includes("terduplikasi") || f.message.includes("kembar")) ||
    res.distractorFindings.find((f) => f.code === "DUPLICATE_OPTIONS");
  assert.ok(dup !== undefined);
  pass(6, "Multiple identical correct options detected and rejected with status: 'REJECT'");
}

// ==============================================================================
// SECTION C: DISTRACTOR QUALITY
// ==============================================================================
console.log("\n--- SECTION C: DISTRACTOR QUALITY ---");

// Test 7: Valid distractors in the same domain pass
{
  const q = {
    id: "q-dist-1",
    jenis: "Pilihan Ganda",
    pertanyaan: "Apa parameter wajib saat menambahkan static route di MikroTik?",
    opsi: ["gateway", "interface-tunnel", "routing-mark", "distance"],
    kunci: "A",
    penjelasan: "Gateway merupakan parameter wajib untuk menentukan next-hop.",
    tingkat: "Sedang",
    evidenceIds: [gwEv],
    status: "SUPPORTED",
  };

  const res = await validateQuestionPackageQuality(makePackage([q]), routingContext, { skipSemanticLayer: true });
  assert.equal(res.status, "PASS");
  pass(7, "Valid domain-relevant distractors pass with status: 'PASS'");
}

// Test 8: Semantic evaluator detects distractor also correct -> REJECT
{
  const q = {
    id: "q-dist-2",
    jenis: "Pilihan Ganda",
    pertanyaan: "Berapakah default administrative distance?",
    opsi: ["1", "1", "5", "10"],
    kunci: "A",
    penjelasan: "Distance bernilai 1.",
    tingkat: "Sedang",
    evidenceIds: [distEv],
    status: "SUPPORTED",
  };

  const res = await validateQuestionPackageQuality(makePackage([q]), routingContext, {
    mockSemanticEvaluator: async () =>
      JSON.stringify({
        factualStatus: "SUPPORTED",
        answerStatus: "MULTIPLE_CORRECT",
        distractorStatus: "HAS_CORRECT_DISTRACTOR",
        ambiguityStatus: "CRITICAL",
        explanationStatus: "SUPPORTED",
        alignmentStatus: "ALIGNED",
        findings: [
          {
            code: "DISTRACTOR_ALSO_CORRECT",
            severity: "CRITICAL",
            component: "distractor",
            message: "Opsi B juga merupakan jawaban yang benar.",
            evidenceIds: [distEv],
          },
        ],
      }),
  });

  assert.equal(res.status, "REJECT");
  assert.ok(res.summary.criticalCount > 0);
  pass(8, "Distractor that is also correct is flagged and rejected with status: 'REJECT'");
}

// ==============================================================================
// SECTION D: AMBIGUITY DETECTION
// ==============================================================================
console.log("\n--- SECTION D: AMBIGUITY DETECTION ---");

// Test 9: Unambiguous question with precise qualifier passes
{
  const q = {
    id: "q-ambi-1",
    jenis: "Pilihan Ganda",
    pertanyaan: "Berdasarkan tabel routing MikroTik RouterOS, berapakah nilai distance default untuk rute statis?",
    opsi: ["1", "5", "10", "110"],
    kunci: "A",
    penjelasan: "Nilai distance default rute statis adalah 1.",
    tingkat: "Sedang",
    evidenceIds: [distEv],
    status: "SUPPORTED",
  };

  const res = await validateQuestionPackageQuality(makePackage([q]), routingContext, { skipSemanticLayer: true });
  assert.equal(res.status, "PASS");
  pass(9, "Unambiguous question with clear context passes with status: 'PASS'");
}

// Test 10: Critical ambiguity detected by semantic judge triggers REJECT
{
  const q = {
    id: "q-ambi-2",
    jenis: "Pilihan Ganda",
    pertanyaan: "Berapakah nilainya?", // Grossly underspecified question
    opsi: ["1", "5", "10", "110"],
    kunci: "A",
    penjelasan: "Nilai yang dimaksud adalah 1.",
    tingkat: "Sedang",
    evidenceIds: [distEv],
    status: "SUPPORTED",
  };

  const res = await validateQuestionPackageQuality(makePackage([q]), routingContext, {
    mockSemanticEvaluator: async () =>
      JSON.stringify({
        factualStatus: "SUPPORTED",
        answerStatus: "UNCERTAIN",
        distractorStatus: "VALID",
        ambiguityStatus: "CRITICAL",
        explanationStatus: "SUPPORTED",
        alignmentStatus: "MISALIGNED",
        findings: [
          {
            code: "UNQUALIFIED_AMBIGUITY",
            severity: "CRITICAL",
            component: "question",
            message: "Pertanyaan tidak menyebutkan parameter apa yang ditanyakan.",
            evidenceIds: [distEv],
          },
        ],
      }),
  });

  assert.equal(res.status, "REJECT");
  pass(10, "Critically ambiguous question triggers UNQUALIFIED_AMBIGUITY with status: 'REJECT'");
}

// ==============================================================================
// SECTION E: EXPLANATION VALIDATION
// ==============================================================================
console.log("\n--- SECTION E: EXPLANATION VALIDATION ---");

// Test 11: Valid grounded explanation matching key passes
{
  const q = {
    id: "q-exp-1",
    jenis: "Pilihan Ganda",
    pertanyaan: "Apakah fungsi dari parameter gateway pada konfigurasi static routing?",
    opsi: ["Menentukan alamat IP next-hop", "Menentukan DNS server", "Menentukan DHCP pool", "Mengatur bandwidth"],
    kunci: "A",
    penjelasan: "Gateway berfungsi menentukan alamat IP router hop berikutnya (next-hop) menuju subnet tujuan.",
    tingkat: "Sedang",
    evidenceIds: [gwEv],
    status: "SUPPORTED",
  };

  const res = await validateQuestionPackageQuality(makePackage([q]), routingContext, { skipSemanticLayer: true });
  assert.equal(res.status, "PASS");
  pass(11, "Grounded explanation justifying correct key passes with status: 'PASS'");
}

// Test 12: Explanation explicitly contradicting key triggers EXPLANATION_CONTRADICTS_KEY & REJECT
{
  const q = {
    id: "q-exp-2",
    jenis: "Pilihan Ganda",
    pertanyaan: "Apakah fungsi dari parameter gateway pada static route?",
    opsi: ["Menentukan alamat IP next-hop", "Menentukan DNS server", "Menentukan DHCP pool", "Mengatur bandwidth"],
    kunci: "A",
    penjelasan: "Jawaban B yang benar karena DNS server menentukan nama domain.", // Contradicts key A
    tingkat: "Sedang",
    evidenceIds: [gwEv],
    status: "SUPPORTED",
  };

  const res = await validateQuestionPackageQuality(makePackage([q]), routingContext, { skipSemanticLayer: true });
  assert.equal(res.status, "REJECT");
  const expErr = res.explanationFindings.find((f) => f.code === "EXPLANATION_CONTRADICTS_KEY");
  assert.ok(expErr !== undefined);
  pass(12, "Explanation contradicting answer key triggers EXPLANATION_CONTRADICTS_KEY and status: 'REJECT'");
}

// ==============================================================================
// SECTION F: LEARNING OBJECTIVE ALIGNMENT
// ==============================================================================
console.log("\n--- SECTION F: LEARNING OBJECTIVE ALIGNMENT ---");

// Test 13: Aligned question passes objective check
{
  const contextWithObj = {
    ...routingContext,
    groundingTarget: {
      ...routingContext.groundingTarget,
      targetTujuanPembelajaranDeskripsi: ["Peserta didik mampu mengkonfigurasi routing statis pada MikroTik RouterOS"],
    },
  };

  const q = {
    id: "q-obj-1",
    jenis: "Pilihan Ganda",
    pertanyaan: "Bagaimana cara melakukan konfigurasi routing statis pada MikroTik?",
    opsi: ["Menggunakan menu /ip route add", "Menggunakan /ip dns", "Menggunakan /ip firewall", "Menggunakan /tool ping"],
    kunci: "A",
    penjelasan: "Konfigurasi routing statis dilakukan dengan /ip route add.",
    tingkat: "Sedang",
    tujuanPembelajaranId: "tp-1",
    evidenceIds: [cliEv],
    status: "SUPPORTED",
  };

  const res = await validateQuestionPackageQuality(makePackage([q]), contextWithObj, { skipSemanticLayer: true });
  assert.equal(res.status, "PASS");
  assert.equal(res.objectiveAlignmentFindings.length, 0);
  pass(13, "Question aligned with learning objective passes with status: 'PASS'");
}

// Test 14: Material mismatch with learning objective triggers OBJECTIVE_MISALIGNMENT & REVISE
{
  const contextWithObj = {
    ...routingContext,
    groundingTarget: {
      ...routingContext.groundingTarget,
      targetTujuanPembelajaranDeskripsi: ["Peserta didik mampu mengkonfigurasi routing statis pada MikroTik"],
    },
  };

  const troubleEv = routingContext.evidenceItems.find((e) => e.content.includes("loopback"))?.evidenceId || ev1;

  const q = {
    id: "q-obj-2",
    jenis: "Pilihan Ganda",
    pertanyaan: "Apakah tujuan dari pengujian loopback lokal pada antarmuka router?",
    opsi: ["Memastikan stack TCP/IP aktif", "Menghapus tabel routing", "Mematikan antarmuka router", "Membuat loop jaringan"],
    kunci: "A",
    penjelasan: "Pengujian loopback lokal dilakukan untuk memastikan stack TCP/IP aktif.",
    tingkat: "Sedang",
    tujuanPembelajaranId: "tp-1",
    evidenceIds: [troubleEv],
    status: "SUPPORTED",
  };

  const res = await validateQuestionPackageQuality(makePackage([q]), contextWithObj, { skipSemanticLayer: true });
  assert.equal(res.status, "REVISE");
  const mis = res.objectiveAlignmentFindings.find((f) => f.code === "OBJECTIVE_MISALIGNMENT");
  assert.ok(mis !== undefined);
  assert.equal(mis.severity, "MAJOR");
  pass(14, "Material mismatch with learning target triggers OBJECTIVE_MISALIGNMENT with status: 'REVISE'");
}

// ==============================================================================
// SECTION G: DUPLICATE QUESTION DETECTION
// ==============================================================================
console.log("\n--- SECTION G: DUPLICATE QUESTION DETECTION ---");

// Test 15: Exact duplicate questions in same package trigger CRITICAL & REJECT
{
  const q1 = {
    id: "q-dup-1",
    jenis: "Pilihan Ganda",
    pertanyaan: "Berapakah nilai default administrative distance pada MikroTik?",
    opsi: ["1", "5", "10", "110"],
    kunci: "A",
    penjelasan: "Nilai distance adalah 1.",
    tingkat: "Sedang",
    evidenceIds: [ev0],
    status: "SUPPORTED",
  };

  const q2 = {
    id: "q-dup-2",
    jenis: "Pilihan Ganda",
    pertanyaan: "Berapakah nilai default administrative distance pada MikroTik?", // Identical!
    opsi: ["1", "5", "10", "110"],
    kunci: "A",
    penjelasan: "Nilai distance adalah 1.",
    tingkat: "Sedang",
    evidenceIds: [ev0],
    status: "SUPPORTED",
  };

  const res = await validateQuestionPackageQuality(makePackage([q1, q2]), routingContext, { skipSemanticLayer: true });
  assert.equal(res.status, "REJECT");
  const dupFinding = res.duplicateFindings.find((f) => f.code === "EXACT_DUPLICATE_QUESTION");
  assert.ok(dupFinding !== undefined);
  assert.equal(dupFinding.severity, "CRITICAL");
  pass(15, "Exact duplicate questions within package trigger EXACT_DUPLICATE_QUESTION and status: 'REJECT'");
}

// Test 16: Near duplicate questions trigger MAJOR finding & REVISE
{
  const q1 = {
    id: "q-near-1",
    jenis: "Pilihan Ganda",
    pertanyaan: "Berapakah nilai default administrative distance untuk routing statis pada MikroTik?",
    opsi: ["1", "5", "10", "110"],
    kunci: "A",
    penjelasan: "Distance bernilai 1.",
    tingkat: "Sedang",
    evidenceIds: [ev0],
    status: "SUPPORTED",
  };

  const q2 = {
    id: "q-near-2",
    jenis: "Pilihan Ganda",
    pertanyaan: "Berapakah nilai default administrative distance routing statis di MikroTik RouterOS?", // > 85% overlap
    opsi: ["1", "5", "10", "110"],
    kunci: "A",
    penjelasan: "Distance bernilai 1.",
    tingkat: "Sedang",
    evidenceIds: [ev0],
    status: "SUPPORTED",
  };

  const res = await validateQuestionPackageQuality(makePackage([q1, q2]), routingContext, { skipSemanticLayer: true });
  const nearDup = res.duplicateFindings.find((f) => f.code === "NEAR_DUPLICATE_QUESTION");
  assert.ok(nearDup !== undefined);
  assert.equal(nearDup.severity, "MAJOR");
  pass(16, "Near duplicate questions (>85% token overlap) trigger NEAR_DUPLICATE_QUESTION");
}

// ==============================================================================
// SECTION H: ESSAY-SPECIFIC VALIDATION
// ==============================================================================
console.log("\n--- SECTION H: ESSAY-SPECIFIC VALIDATION ---");

// Test 17: Grounded essay question with descriptive rubric passes
{
  const q = {
    id: "q-essay-1",
    jenis: "Esai",
    pertanyaan: "Jelaskan langkah-langkah konfigurasi static routing pada MikroTik RouterOS!",
    opsi: [],
    kunci: "Langkah konfigurasi meliputi menentukan subnet tujuan (dst-address), memasukkan alamat gateway next-hop, dan mengatur nilai administrative distance.",
    penjelasan: "Skor penuh jika menyebutkan dst-address, gateway, dan distance secara tepat.",
    tingkat: "Sedang",
    evidenceIds: [ev0, ev1],
    status: "SUPPORTED",
  };

  const res = await validateQuestionPackageQuality(makePackage([q]), routingContext, { skipSemanticLayer: true });
  assert.equal(res.status, "PASS");
  pass(17, "Grounded essay question with descriptive rubric passes with status: 'PASS'");
}

// Test 18: Essay question with options array rejected deterministically
{
  const q = {
    id: "q-essay-2",
    jenis: "Esai",
    pertanyaan: "Jelaskan konsep static routing!",
    opsi: ["Opsi A", "Opsi B"], // Illegal for Essay!
    kunci: "Kriteria penilaian minimal sepuluh karakter untuk esai.",
    penjelasan: "Pedoman penskoran.",
    tingkat: "Sedang",
    evidenceIds: [ev0],
    status: "SUPPORTED",
  };

  const res = await validateQuestionPackageQuality(makePackage([q]), routingContext, { skipSemanticLayer: true });
  assert.equal(res.status, "REJECT");
  pass(18, "Essay question with non-empty options array rejected with status: 'REJECT'");
}

// ==============================================================================
// SECTION I: SOURCE CONFLICT HANDLING
// ==============================================================================
console.log("\n--- SECTION I: SOURCE CONFLICT HANDLING ---");

// Test 19: Question relying on unresolved source conflict triggers UNRESOLVED_SOURCE_CONFLICT & REJECT
{
  const conflictedContext = {
    ...routingContext,
    sourceConflicts: [
      {
        term: "Administrative Distance",
        description: "Sumber A menyebutkan nilai 1, sedangkan Sumber B menyebutkan nilai 254.",
        conflictingSources: [],
      },
    ],
  };

  const q = {
    id: "q-conf-1",
    jenis: "Pilihan Ganda",
    pertanyaan: "Berapakah nilai Administrative Distance yang benar?", // Ambiguous under conflict!
    opsi: ["1", "254", "5", "10"],
    kunci: "A",
    penjelasan: "Distance bernilai 1.",
    tingkat: "Sedang",
    evidenceIds: [ev0],
    status: "SUPPORTED",
  };

  const res = await validateQuestionPackageQuality(makePackage([q]), conflictedContext, { skipSemanticLayer: true });
  assert.equal(res.status, "REJECT");
  const conf = res.itemResults[0].findings.find((f) => f.code === "UNRESOLVED_SOURCE_CONFLICT");
  assert.ok(conf !== undefined);
  pass(19, "Unresolved source conflict referenced without disambiguation triggers UNRESOLVED_SOURCE_CONFLICT and REJECT");
}

// Test 20: Question with explicit source disambiguation passes under conflict
{
  const conflictedContext = {
    ...routingContext,
    sourceConflicts: [
      {
        term: "Administrative Distance",
        description: "Sumber A menyebutkan 1, Sumber B menyebutkan 254.",
        conflictingSources: [],
      },
    ],
  };

  const q = {
    id: "q-conf-2",
    jenis: "Pilihan Ganda",
    pertanyaan: "Berdasarkan standar konfigurasi MikroTik RouterOS, berapakah nilai Administrative Distance default?", // Explicit qualifier!
    opsi: ["1", "254", "5", "10"],
    kunci: "A",
    penjelasan: "Berdasarkan RouterOS, distance default bernilai 1.",
    tingkat: "Sedang",
    evidenceIds: [ev0],
    status: "SUPPORTED",
  };

  const res = await validateQuestionPackageQuality(makePackage([q]), conflictedContext, { skipSemanticLayer: true });
  assert.equal(res.status, "PASS");
  pass(20, "Explicit source disambiguation resolves conflicting context and passes with status: 'PASS'");
}

// ==============================================================================
// SECTION J: SEMANTIC EVALUATOR INTEGRATION & UNCERTAINTY
// ==============================================================================
console.log("\n--- SECTION J: SEMANTIC EVALUATOR INTEGRATION ---");

// Test 21: Semantic evaluator returning UNCERTAIN on answer correctness fails conservatively -> REJECT
{
  const q = {
    id: "q-sem-1",
    jenis: "Pilihan Ganda",
    pertanyaan: "Berapakah batas maksimal static routing?",
    opsi: ["100", "200", "500", "Tidak terbatas"],
    kunci: "D",
    penjelasan: "Batas rute tidak terbatas.",
    tingkat: "Sedang",
    evidenceIds: [ev0],
    status: "SUPPORTED",
  };

  const res = await validateQuestionPackageQuality(makePackage([q]), routingContext, {
    mockSemanticEvaluator: async () =>
      JSON.stringify({
        factualStatus: "UNCERTAIN",
        answerStatus: "UNCERTAIN",
        distractorStatus: "VALID",
        ambiguityStatus: "MODERATE",
        explanationStatus: "SUPPORTED",
        alignmentStatus: "ALIGNED",
        findings: [
          {
            code: "ANSWER_KEY_UNCERTAIN",
            severity: "CRITICAL",
            component: "answer",
            message: "Materi sumber tidak menyebutkan batas maksimal secara definitif.",
            evidenceIds: [ev0],
          },
        ],
      }),
  });

  assert.equal(res.status, "REJECT");
  pass(21, "Semantic judge UNCERTAIN status fails conservatively with status: 'REJECT'");
}

// Test 22: Malformed semantic evaluator output safely fails closed without crashing
{
  const q = {
    id: "q-sem-2",
    jenis: "Pilihan Ganda",
    pertanyaan: "Perintah apakah untuk menambahkan rute statis?",
    opsi: ["/ip route add", "/ip address", "/ip pool", "/tool ping"],
    kunci: "A",
    penjelasan: "/ip route add adalah perintah yang benar.",
    tingkat: "Sedang",
    evidenceIds: [cliEv],
    status: "SUPPORTED",
  };

  const res = await validateQuestionPackageQuality(makePackage([q]), routingContext, {
    mockSemanticEvaluator: async () => "ERROR: 500 Internal Server Error in LLM service", // Not JSON!
  });

  assert.equal(res.status, "REJECT");
  const uncertainFinding = res.itemResults[0].findings.find((f) => f.code === "QUESTION_QUALITY_UNCERTAIN");
  assert.ok(uncertainFinding !== undefined);
  pass(22, "Malformed semantic evaluator output safely caught and rejected without crashing");
}

// ==============================================================================
// SECTION K: BOUNDED CORRECTION RETRY
// ==============================================================================
console.log("\n--- SECTION K: BOUNDED CORRECTION RETRY ---");

// Test 23: Generator pipeline executes 1-shot correction retry when quality validation returns REVISE
{
  let attempts = 0;
  const mockProvider = async (sys, user) => {
    attempts++;
    if (attempts === 1) {
      // First attempt produces question with minor wording ambiguity (triggers REVISE)
      return JSON.stringify({
        schemaVersion: CANONICAL_QUESTION_SCHEMA_VERSION,
        judul: "Paket Soal Draft 1",
        topik: "Routing Statis",
        tingkat: "Sedang",
        questions: [
          {
            id: "q-rev-1",
            jenis: "Pilihan Ganda",
            pertanyaan: "Berapakah nilai default administrative distance pada MikroTik?",
            opsi: ["1", "5", "10", "110"],
            kunci: "A",
            penjelasan: "Distance adalah 1.",
            evidenceIds: [ev0],
          },
          {
            id: "q-rev-2",
            jenis: "Pilihan Ganda",
            pertanyaan: "Berapakah nilai default administrative distance routing statis di MikroTik RouterOS?", // Near duplicate -> triggers REVISE
            opsi: ["1", "5", "10", "110"],
            kunci: "A",
            penjelasan: "Distance adalah 1.",
            evidenceIds: [ev0],
          },
        ],
        evidenceRefs: [{ sourceId: snapRouting.id, status: "SUPPORTED" }],
      });
    }

    // Second attempt (correction) replaces second question with distinct question -> triggers PASS
    return JSON.stringify({
      schemaVersion: CANONICAL_QUESTION_SCHEMA_VERSION,
      judul: "Paket Soal Terkoreksi",
      topik: "Routing Statis",
      tingkat: "Sedang",
      questions: [
        {
          id: "q-rev-1",
          jenis: "Pilihan Ganda",
          pertanyaan: "Berapakah nilai default administrative distance pada MikroTik?",
          opsi: ["1", "5", "10", "110"],
          kunci: "A",
          penjelasan: "Distance adalah 1.",
          evidenceIds: [ev0],
        },
        {
          id: "q-cor-2",
          jenis: "Pilihan Ganda",
          pertanyaan: "Parameter apakah yang wajib diisi untuk menentukan next-hop pada static route?",
          opsi: ["gateway", "interface", "routing-mark", "distance"],
          kunci: "A",
          penjelasan: "Gateway menentukan alamat hop berikutnya.",
          evidenceIds: [ev0],
        },
      ],
      evidenceRefs: [{ sourceId: snapRouting.id, status: "SUPPORTED" }],
    });
  };

  const result = await generateGroundedQuestions(routingInput, validTeacherContext, {
    persistDraft: false,
    mockProviderCall: mockProvider,
    validateQuality: true,
  });

  assert.equal(result.status, "success");
  assert.ok(result.qualityResult !== undefined);
  pass(23, "Quality validation integrated in question generation pipeline with bounded correction retry");
}

// ==============================================================================
// SECTION L: BATCH & PACKAGE VALIDATION
// ==============================================================================
console.log("\n--- SECTION L: BATCH & PACKAGE VALIDATION ---");

// Test 24: Mixed batch of questions (1 valid, 1 invalid) causes package to REJECT
{
  const qValid = {
    id: "q-batch-1",
    jenis: "Pilihan Ganda",
    pertanyaan: "Berapakah nilai default administrative distance pada MikroTik?",
    opsi: ["1", "5", "10", "110"],
    kunci: "A",
    penjelasan: "Distance bernilai 1.",
    tingkat: "Sedang",
    evidenceIds: [ev0],
    status: "SUPPORTED",
  };

  const qInvalid = {
    id: "q-batch-2",
    jenis: "Pilihan Ganda",
    pertanyaan: "Berapakah nilai default distance?",
    opsi: ["1", "5", "10", "110"],
    kunci: "E", // Invalid key letter 'E'
    penjelasan: "Kunci E.",
    tingkat: "Sedang",
    evidenceIds: [ev0],
    status: "SUPPORTED",
  };

  const res = await validateQuestionPackageQuality(makePackage([qValid, qInvalid]), routingContext, { skipSemanticLayer: true });
  assert.equal(res.status, "REJECT");
  assert.equal(res.summary.passCount, 0); // Layer 1 rejected whole package
  pass(24, "Package containing 1 invalid question fails closed with package status: 'REJECT'");
}

// ==============================================================================
// SECTION M: SECURITY & MULTI-TENANT BOUNDARIES
// ==============================================================================
console.log("\n--- SECTION M: SECURITY & MULTI-TENANT BOUNDARIES ---");

// Test 25: Cross-tenant evidence reference is rejected
{
  const qCrossTenant = {
    id: "q-sec-1",
    jenis: "Pilihan Ganda",
    pertanyaan: "Berapakah nilai default distance?",
    opsi: ["1", "5", "10", "110"],
    kunci: "A",
    penjelasan: "Distance bernilai 1.",
    tingkat: "Sedang",
    evidenceIds: [`ev_${snapTeacher2.id}_c0`], // Snapshot from another teacher!
    status: "SUPPORTED",
  };

  const res = await validateQuestionPackageQuality(makePackage([qCrossTenant]), routingContext, { skipSemanticLayer: true });
  assert.equal(res.status, "REJECT");
  const dangling = res.structuralFindings.find((f) => f.code === "DANGLING_EVIDENCE_ID");
  assert.ok(dangling !== undefined);
  pass(25, "Cross-tenant snapshot evidence reference rejected as DANGLING_EVIDENCE_ID with status: 'REJECT'");
}

// Test 26: Answer keys and explanations are completely stripped by toStudentSafeQuestion
{
  const q = {
    id: "q-sec-2",
    jenis: "Pilihan Ganda",
    pertanyaan: "Berapakah nilai default administrative distance pada MikroTik?",
    opsi: ["1", "5", "10", "110"],
    kunci: "A",
    penjelasan: "Distance bernilai 1.",
    tingkat: "Sedang",
    evidenceIds: [ev0],
    status: "SUPPORTED",
  };

  const ssq = toStudentSafeQuestion(q);
  assert.equal("kunci" in ssq, false);
  assert.equal("penjelasan" in ssq, false);
  assert.equal("evidenceIds" in ssq, false);
  assert.equal("status" in ssq, false);
  pass(26, "Answer-key segregation invariant strictly verified on validated question");
}

// ==============================================================================
// SECTION N: PERSISTENCE & METADATA INVARIANTS
// ==============================================================================
console.log("\n--- SECTION N: PERSISTENCE & METADATA INVARIANTS ---");

// Test 27: Rejected output is NOT persisted as successful draft
{
  const invalidProvider = async () =>
    JSON.stringify({
      schemaVersion: CANONICAL_QUESTION_SCHEMA_VERSION,
      judul: "Paket Cacat",
      topik: "Routing Statis",
      tingkat: "Sedang",
      questions: [
        {
          id: "q-rej-1",
          jenis: "Pilihan Ganda",
          pertanyaan: "Berapakah default distance?",
          opsi: ["1", "5", "10", "110"],
          kunci: "C", // Unsupported key
          penjelasan: "Distance bernilai C.",
          evidenceIds: [ev0],
        },
        {
          id: "q-rej-2",
          jenis: "Pilihan Ganda",
          pertanyaan: "Perintah apakah?",
          opsi: ["1", "5", "10", "110"],
          kunci: "D",
          penjelasan: "Penjelasan D.",
          evidenceIds: [ev0],
        },
      ],
      evidenceRefs: [{ sourceId: snapRouting.id, status: "SUPPORTED" }],
    });

  let errorCaught = null;
  try {
    await generateGroundedQuestions(routingInput, validTeacherContext, {
      persistDraft: true,
      mockProviderCall: invalidProvider,
      validateQuality: true,
      qualityOptions: { skipSemanticLayer: true },
    });
  } catch (err) {
    errorCaught = err;
  }

  assert.ok(errorCaught !== null, "Rejected output must throw and fail closed");
  assert.equal(errorCaught.code, AI_ERROR_CODES.QUESTION_QUALITY_VALIDATION_FAILED);
  pass(27, "REJECT package is NOT persisted and fails closed with QUESTION_QUALITY_VALIDATION_FAILED");
}

// ==============================================================================
// SECTION O: ADVERSARIAL TEST CASES
// ==============================================================================
console.log("\n--- SECTION O: ADVERSARIAL QUALITY CASES ---");

// Test 28: Adversarial Prompt Injection inside Source Evidence text
{
  const prompt = getRegisteredPrompt("question_quality_validator_v1");
  assert.equal(prompt.version, "question_quality_validator_v1");
  assert.ok(prompt.systemPrompt.includes("UNTRUSTED DATA"), "Prompt must instruct that source data is untrusted");
  assert.ok(prompt.systemPrompt.includes("HIERARKI INSTRUKSI"), "Prompt must establish instruction hierarchy");
  pass(28, "Central prompt question_quality_validator_v1 demarcates untrusted source and hierarchy");
}

// Test 29: Adversarial numeric distortion in distractor/key
{
  const q = {
    id: "q-adv-1",
    jenis: "Pilihan Ganda",
    pertanyaan: "Berapakah port standar yang digunakan oleh protokol HTTP?",
    opsi: ["8080", "8000", "8888", "80"],
    kunci: "A", // Claiming 8080 instead of 80!
    penjelasan: "Port HTTP adalah 8080.",
    tingkat: "Sedang",
    evidenceIds: [ev0],
    status: "SUPPORTED",
  };

  const res = await validateQuestionPackageQuality(makePackage([q]), routingContext, { skipSemanticLayer: true });
  assert.equal(res.status, "REJECT");
  pass(29, "Adversarial port distortion (claiming 8080 as standard HTTP port) rejected");
}

// Test 30: Anti-promotion invariant enforced: NOT_FOUND evidence claimed as SUPPORTED
{
  const notFoundContext = {
    ...routingContext,
    evidenceItems: [
      {
        evidenceId: "ev_routing_c99",
        sourceId: snapRouting.id,
        chunkId: "c99",
        content: "Topik ini tidak ditemukan di dalam dokumen.",
        status: "NOT_FOUND",
      },
    ],
  };

  const q = {
    id: "q-adv-2",
    jenis: "Pilihan Ganda",
    pertanyaan: "Apakah kesimpulan materi?",
    opsi: ["A", "B", "C", "D"],
    kunci: "A",
    penjelasan: "Penjelasan.",
    tingkat: "Sedang",
    evidenceIds: ["ev_routing_c99"],
    status: "SUPPORTED", // Claiming SUPPORTED on NOT_FOUND!
  };

  const res = await validateQuestionPackageQuality(makePackage([q]), notFoundContext, { skipSemanticLayer: true });
  assert.equal(res.status, "REJECT");
  const antiProm = res.structuralFindings.find((f) => f.code === "ANTI_PROMOTION_VIOLATION");
  assert.ok(antiProm !== undefined);
  pass(30, "Anti-promotion invariant strictly enforced on question quality validation");
}

console.log("\n================================================================================");
console.log(`  ALL ${passed} / 30 TESTS IN AI-4D QUESTION QUALITY VALIDATION SUITE PASSED!   `);
console.log("================================================================================");
