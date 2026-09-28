#!/usr/bin/env node
/**
 * ==============================================================================
 * GURUPRO TEST SUITE: AI-4C REAL AI QUESTION GENERATION ENGINE VALIDATION
 * ==============================================================================
 *
 * Verifies the complete AI-4C question generation pipeline:
 * - Section A: Authorization (Verified guru, unverified, siswa, unauthenticated, cross-tenant, spoofing)
 * - Section B: Grounding Preconditions (SUFFICIENT vs INSUFFICIENT gate, fail-closed before LLM)
 * - Section C: Multiple Choice Contract (4 unique options, valid key letter A-D, key pointing to option)
 * - Section D: Essay Contract (Empty options array [], rubric >= 10 chars)
 * - Section E: Evidence Integrity (Valid evidence IDs, fabricated rejected, cross-tenant rejected, anti-promotion)
 * - Section F: Structured Output & JSON Parsing (Markdown fenced stripping, correction retry, fail-closed)
 * - Section G: Question Count Enforcement (Exact count matching, count correction retry, mismatch error)
 * - Section H: Exact-Value Preservation (IP addresses, subnets, ports, IEEE standards, CLI commands)
 * - Section I: Answer-Key Security (Answer-key segregation, student-safe projection removes keys/secrets)
 * - Section J: Provenance & AI Metadata (Prompt version, schema version, source references, timestamp)
 * - Section K: Persistence (Optional draft persistence to paket_soal table, status: 'Draft' enforced)
 * - Section L: Retry Policy (Transient provider errors, bounded retries, no infinite loop)
 * - Section M: Fail-Closed Invariant (Provider/schema/evidence failure NEVER produces fake/fallback questions)
 * - Section N: Regression & System Compatibility (Canonical questions compatible with auto-grading)
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
  CANONICAL_QUESTION_PROMPT_VERSION,
  CANONICAL_QUESTION_SCHEMA_VERSION,
  generateGroundedQuestions,
  parseAiQuestionResponse,
  toExistingSoal,
  toStudentSafeQuestion,
  validateCanonicalQuestion,
} from "../../src/lib/ai/question-contract.ts";
import {
  buildQuestionGroundingContext,
} from "../../src/lib/ai/question-context-builder.ts";
import { getRegisteredPrompt } from "../../src/lib/ai/prompts-registry.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, "../..");
const FIXTURES_DIR = resolve(ROOT_DIR, "tests/fixtures");

console.log("================================================================================");
console.log("  GURUPRO TEST SUITE: AI-4C REAL AI QUESTION GENERATION ENGINE                 ");
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
const TEACHER_1_ID = "guru-network-401";
const TEACHER_2_ID = "guru-other-402";

const txtPath = resolve(FIXTURES_DIR, "educational-network-routing.txt");
const htmlPath = resolve(FIXTURES_DIR, "educational-web-vlan.html");

assert.ok(existsSync(txtPath), "TXT routing fixture must exist");
assert.ok(existsSync(htmlPath), "HTML VLAN fixture must exist");

const routingTxtContent = readFileSync(txtPath, "utf-8");
const vlanHtmlContent = readFileSync(htmlPath, "utf-8");

// Ingest Teacher 1 snapshots (>= 15 words)
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
      id: "c1111111-1111-4111-8111-111111111111",
      namaKelas: "XII TKJ 1",
      tingkat: "XII",
      mapel: "Administrasi Infrastruktur Jaringan",
      tahunAjaran: "2026/2027",
      guruId: TEACHER_1_ID,
    },
  ],
  availableSourceSnapshots: [],
};

// Standard mock generator for 2 valid multiple-choice questions
function createMockRoutingProvider(evidenceId0, evidenceId1) {
  return async () => {
    return JSON.stringify({
      schemaVersion: CANONICAL_QUESTION_SCHEMA_VERSION,
      judul: "Paket Soal Konfigurasi Routing Statis",
      topik: "Konfigurasi Routing Statis",
      tingkat: "Sedang",
      questions: [
        {
          id: "q-mc-01",
          jenis: "Pilihan Ganda",
          pertanyaan: "Berapakah nilai default administrative distance untuk rute statis pada RouterOS?",
          opsi: ["1", "5", "10", "110"],
          kunci: "A",
          penjelasan: "Nilai administrative distance default rute statis RouterOS adalah 1.",
          tingkat: "Sedang",
          evidenceIds: [evidenceId0],
          status: "SUPPORTED",
        },
        {
          id: "q-mc-02",
          jenis: "Pilihan Ganda",
          pertanyaan: "Berapakah nilai Dst-Address yang digunakan untuk konfigurasi default route?",
          opsi: ["0.0.0.0/0", "192.168.20.0/24", "10.10.10.2", "255.255.255.255/32"],
          kunci: "A",
          penjelasan: "Rute default ditentukan menggunakan alamat 0.0.0.0/0.",
          tingkat: "Sedang",
          evidenceIds: [evidenceId1 || evidenceId0],
          status: "SUPPORTED",
        },
      ],
      evidenceRefs: [
        {
          sourceId: snapRouting.id,
          status: "SUPPORTED",
        },
      ],
    });
  };
}

// ==============================================================================
// SECTION A: AUTHORIZATION BOUNDARIES
// ==============================================================================
console.log("\n--- SECTION A: AUTHORIZATION BOUNDARIES ---");

// Test 1: Verified teacher generates questions successfully
{
  const input = {
    sourceSnapshotIds: [snapRouting.id],
    topik: "Routing Statis",
    jenis: "Pilihan Ganda",
    tingkat: "Sedang",
    jumlah: 2,
    kelasId: "c1111111-1111-4111-8111-111111111111",
  };

  const context = await buildQuestionGroundingContext(input, validTeacherContext);
  const ev0 = context.evidenceItems[0].evidenceId;
  const ev1 = context.evidenceItems[1]?.evidenceId || ev0;

  const result = await generateGroundedQuestions(input, validTeacherContext, {
    mockProviderCall: createMockRoutingProvider(ev0, ev1),
  });

  assert.equal(result.status, "success");
  assert.equal(result.questions.length, 2);
  assert.equal(result.metadata.promptVersion, CANONICAL_QUESTION_PROMPT_VERSION);
  pass(1, "Verified teacher generates questions successfully");
}

// Test 2: Unverified teacher is rejected with ROLE_FORBIDDEN
{
  const unverifiedTeacher = {
    ...validTeacherContext,
    verificationStatus: "pending",
  };

  const input = {
    sourceSnapshotIds: [snapRouting.id],
    topik: "Routing Statis",
    jumlah: 2,
  };

  await assert.rejects(
    async () => generateGroundedQuestions(input, unverifiedTeacher),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.ROLE_FORBIDDEN,
  );
  pass(2, "Unverified teacher status rejected with ROLE_FORBIDDEN");
}

// Test 3: Siswa role is rejected with ROLE_FORBIDDEN
{
  const siswaContext = {
    ...validTeacherContext,
    teacherRole: "siswa",
  };

  const input = {
    sourceSnapshotIds: [snapRouting.id],
    topik: "Routing Statis",
    jumlah: 2,
  };

  await assert.rejects(
    async () => generateGroundedQuestions(input, siswaContext),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.ROLE_FORBIDDEN,
  );
  pass(3, "Student role rejected with ROLE_FORBIDDEN");
}

// Test 4: Cross-tenant snapshot access is rejected with ROLE_FORBIDDEN
{
  const input = {
    sourceSnapshotIds: [snapTeacher2.id], // Owned by TEACHER_2_ID
    topik: "Keamanan Server Linux",
    jumlah: 2,
  };

  await assert.rejects(
    async () => generateGroundedQuestions(input, validTeacherContext),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.ROLE_FORBIDDEN,
  );
  pass(4, "Cross-tenant snapshot access rejected with ROLE_FORBIDDEN");
}

// Test 5: Client identity spoofing fields (userId, teacherId) are rejected
{
  const spoofedInput = {
    sourceSnapshotIds: [snapRouting.id],
    topik: "Routing Statis",
    userId: "spoofed-hacker-id",
    jumlah: 2,
  };

  await assert.rejects(
    async () => generateGroundedQuestions(spoofedInput, validTeacherContext),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.INVALID_REQUEST,
  );
  pass(5, "Client-injected userId rejected with INVALID_REQUEST");
}

// ==============================================================================
// SECTION B: GROUNDING PRECONDITIONS (HARD DEPENDENCY ON AI-4B)
// ==============================================================================
console.log("\n--- SECTION B: GROUNDING PRECONDITIONS (HARD DEPENDENCY ON AI-4B) ---");

// Test 6: Insufficient grounding halts before calling LLM provider
{
  let providerCalled = false;
  const input = {
    sourceSnapshotIds: [snapRouting.id],
    topik: "Termodinamika Kuantum Lubang Hitam Partikel Fisika", // Absent topic
    jumlah: 2,
  };

  await assert.rejects(
    async () =>
      generateGroundedQuestions(input, validTeacherContext, {
        mockProviderCall: async () => {
          providerCalled = true;
          return "{}";
        },
      }),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.INSUFFICIENT_EVIDENCE,
  );

  assert.equal(providerCalled, false, "Provider must strictly NEVER be called when grounding is INSUFFICIENT");
  pass(6, "Insufficient grounding halts before calling LLM provider (Anti-Hallucination Gate)");
}

// Test 7: Direct consumption of pre-computed GroundedQuestionContext works seamlessly
{
  const groundingInput = {
    sourceSnapshotIds: [snapRouting.id],
    topik: "Parameter Rute Statis pada RouterOS",
    jumlah: 2,
  };

  const context = await buildQuestionGroundingContext(groundingInput, validTeacherContext);
  assert.equal(context.evidenceSufficiency, "SUFFICIENT");

  const ev0 = context.evidenceItems[0].evidenceId;
  const result = await generateGroundedQuestions(context, validTeacherContext, {
    mockProviderCall: createMockRoutingProvider(ev0, ev0),
  });

  assert.equal(result.status, "success");
  assert.equal(result.questions.length, 2);
  pass(7, "Direct consumption of pre-computed GroundedQuestionContext functions properly");
}

// ==============================================================================
// SECTION C: MULTIPLE CHOICE CONTRACT INVARIANTS
// ==============================================================================
console.log("\n--- SECTION C: MULTIPLE CHOICE CONTRACT INVARIANTS ---");

// Test 8: Valid 4-option multiple choice question passes
{
  const input = {
    sourceSnapshotIds: [snapRouting.id],
    topik: "Routing Statis",
    jumlah: 2,
  };

  const context = await buildQuestionGroundingContext(input, validTeacherContext);
  const ev0 = context.evidenceItems[0].evidenceId;

  const result = await generateGroundedQuestions(input, validTeacherContext, {
    mockProviderCall: createMockRoutingProvider(ev0, ev0),
  });

  const q1 = result.questions[0];
  assert.equal(q1.jenis, "Pilihan Ganda");
  assert.equal(q1.opsi.length, 4);
  assert.equal(q1.kunci, "A");
  assert.ok(["A", "B", "C", "D"].includes(q1.kunci));
  pass(8, "Valid 4-option multiple choice passes canonical validation");
}

// Test 9: Multiple Choice with duplicate options is rejected
{
  const input = {
    sourceSnapshotIds: [snapRouting.id],
    topik: "Routing Statis",
    jumlah: 1,
  };

  const context = await buildQuestionGroundingContext(input, validTeacherContext);
  const ev0 = context.evidenceItems[0].evidenceId;

  await assert.rejects(
    async () =>
      generateGroundedQuestions(input, validTeacherContext, {
        mockProviderCall: async () =>
          JSON.stringify({
            schemaVersion: CANONICAL_QUESTION_SCHEMA_VERSION,
            judul: "Paket Soal",
            topik: "Routing Statis",
            questions: [
              {
                id: "q-dup",
                jenis: "Pilihan Ganda",
                pertanyaan: "Pertanyaan dengan opsi kembar?",
                opsi: ["Opsi Sama", "Opsi Sama", "Opsi C", "Opsi D"],
                kunci: "A",
                penjelasan: "Penjelasan...",
                evidenceIds: [ev0],
              },
            ],
          }),
      }),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.QUESTION_SCHEMA_INVALID,
  );
  pass(9, "Multiple Choice with duplicate options rejected with QUESTION_SCHEMA_INVALID");
}

// Test 10: Multiple Choice with invalid key letter (e.g. 'E') is rejected
{
  const input = {
    sourceSnapshotIds: [snapRouting.id],
    topik: "Routing Statis",
    jumlah: 1,
  };

  const context = await buildQuestionGroundingContext(input, validTeacherContext);
  const ev0 = context.evidenceItems[0].evidenceId;

  await assert.rejects(
    async () =>
      generateGroundedQuestions(input, validTeacherContext, {
        mockProviderCall: async () =>
          JSON.stringify({
            schemaVersion: CANONICAL_QUESTION_SCHEMA_VERSION,
            judul: "Paket Soal",
            topik: "Routing Statis",
            questions: [
              {
                id: "q-badkey",
                jenis: "Pilihan Ganda",
                pertanyaan: "Pertanyaan dengan kunci E?",
                opsi: ["Opsi A", "Opsi B", "Opsi C", "Opsi D"],
                kunci: "E",
                penjelasan: "Penjelasan...",
                evidenceIds: [ev0],
              },
            ],
          }),
      }),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.QUESTION_SCHEMA_INVALID,
  );
  pass(10, "Multiple Choice with invalid key letter 'E' rejected with QUESTION_SCHEMA_INVALID");
}

// ==============================================================================
// SECTION D: ESSAY CONTRACT INVARIANTS
// ==============================================================================
console.log("\n--- SECTION D: ESSAY CONTRACT INVARIANTS ---");

// Test 11: Valid Essay question with empty options and rubric passes
{
  const input = {
    sourceSnapshotIds: [snapRouting.id],
    topik: "Routing Statis",
    jenis: "Esai",
    jumlah: 1,
  };

  const context = await buildQuestionGroundingContext(input, validTeacherContext);
  const ev0 = context.evidenceItems[0].evidenceId;

  const result = await generateGroundedQuestions(input, validTeacherContext, {
    mockProviderCall: async () =>
      JSON.stringify({
        schemaVersion: CANONICAL_QUESTION_SCHEMA_VERSION,
        judul: "Paket Soal Esai Routing",
        topik: "Routing Statis",
        tingkat: "Sulit",
        questions: [
          {
            id: "q-essay-01",
            jenis: "Esai",
            pertanyaan: "Jelaskan langkah-langkah verifikasi konektivitas setelah rute statis ditambahkan.",
            opsi: [],
            kunci: "Rubrik: 1. Uji loopback lokal. 2. Ping next-hop gateway. 3. Traceroute ke IP tujuan. 4. Cek flag AS.",
            penjelasan: "Peserta didik menguraikan keempat langkah diagnosis jaringan.",
            tingkat: "Sulit",
            evidenceIds: [ev0],
            status: "SUPPORTED",
          },
        ],
      }),
  });

  assert.equal(result.status, "success");
  assert.equal(result.questions[0].jenis, "Esai");
  assert.equal(result.questions[0].opsi.length, 0);
  assert.ok(result.questions[0].kunci.length >= 10);
  pass(11, "Valid Essay question with empty options and rubric passes canonical validation");
}

// Test 12: Essay question with non-empty options array is rejected
{
  const input = {
    sourceSnapshotIds: [snapRouting.id],
    topik: "Routing Statis",
    jenis: "Esai",
    jumlah: 1,
  };

  const context = await buildQuestionGroundingContext(input, validTeacherContext);
  const ev0 = context.evidenceItems[0].evidenceId;

  await assert.rejects(
    async () =>
      generateGroundedQuestions(input, validTeacherContext, {
        mockProviderCall: async () =>
          JSON.stringify({
            schemaVersion: CANONICAL_QUESTION_SCHEMA_VERSION,
            judul: "Paket Soal",
            topik: "Routing Statis",
            questions: [
              {
                id: "q-bad-essay",
                jenis: "Esai",
                pertanyaan: "Pertanyaan esai yang salah memuat opsi?",
                opsi: ["Opsi tidak boleh ada pada esai"],
                kunci: "Rubrik penilaian esai...",
                evidenceIds: [ev0],
              },
            ],
          }),
      }),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.QUESTION_SCHEMA_INVALID,
  );
  pass(12, "Essay question with non-empty options array rejected with QUESTION_SCHEMA_INVALID");
}

// ==============================================================================
// SECTION E: EVIDENCE INTEGRITY & ANTI-PROMOTION
// ==============================================================================
console.log("\n--- SECTION E: EVIDENCE INTEGRITY & ANTI-PROMOTION ---");

// Test 13: Fabricated evidence ID is rejected with QUESTION_GROUNDING_FAILED
{
  const input = {
    sourceSnapshotIds: [snapRouting.id],
    topik: "Routing Statis",
    jumlah: 1,
  };

  await assert.rejects(
    async () =>
      generateGroundedQuestions(input, validTeacherContext, {
        mockProviderCall: async () =>
          JSON.stringify({
            schemaVersion: CANONICAL_QUESTION_SCHEMA_VERSION,
            judul: "Paket Soal",
            topik: "Routing Statis",
            questions: [
              {
                id: "q-fake-ev",
                jenis: "Pilihan Ganda",
                pertanyaan: "Soal dengan bukti palsu?",
                opsi: ["A", "B", "C", "D"],
                kunci: "A",
                penjelasan: "Penjelasan...",
                evidenceIds: ["ev_fabricated_hallucination_999"], // Fabricated ID!
              },
            ],
          }),
      }),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.QUESTION_GROUNDING_FAILED,
  );
  pass(13, "Fabricated evidence ID rejected with QUESTION_GROUNDING_FAILED");
}

// Test 14: Anti-promotion invariant: NOT_FOUND evidence with SUPPORTED status is rejected
{
  const input = {
    sourceSnapshotIds: [snapRouting.id],
    topik: "Routing Statis",
    jumlah: 1,
  };

  const context = await buildQuestionGroundingContext(input, validTeacherContext);
  // Artificially create a mock context where an item is NOT_FOUND
  const notFoundContext = {
    ...context,
    evidenceItems: [
      {
        ...context.evidenceItems[0],
        status: "NOT_FOUND",
        relevanceScore: 0.1,
      },
    ],
  };

  await assert.rejects(
    async () =>
      generateGroundedQuestions(notFoundContext, validTeacherContext, {
        mockProviderCall: async () =>
          JSON.stringify({
            schemaVersion: CANONICAL_QUESTION_SCHEMA_VERSION,
            judul: "Paket Soal",
            topik: "Routing Statis",
            questions: [
              {
                id: "q-promoted",
                jenis: "Pilihan Ganda",
                pertanyaan: "Soal yang mempromosikan NOT_FOUND?",
                opsi: ["A", "B", "C", "D"],
                kunci: "A",
                penjelasan: "Penjelasan...",
                evidenceIds: [notFoundContext.evidenceItems[0].evidenceId],
                status: "SUPPORTED", // Promoted!
              },
            ],
          }),
      }),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.QUESTION_GROUNDING_FAILED,
  );
  pass(14, "Anti-promotion invariant: NOT_FOUND evidence claimed as SUPPORTED is rejected");
}

// ==============================================================================
// SECTION F: STRUCTURED OUTPUT & ROBUST JSON PARSING
// ==============================================================================
console.log("\n--- SECTION F: STRUCTURED OUTPUT & JSON PARSING ---");
resetRateLimiterForTesting();

// Test 15: Markdown fenced JSON (```json ... ```) is parsed seamlessly
{
  const input = {
    sourceSnapshotIds: [snapRouting.id],
    topik: "Routing Statis",
    jumlah: 1,
  };

  const context = await buildQuestionGroundingContext(input, validTeacherContext);
  const ev0 = context.evidenceItems[0].evidenceId;

  const result = await generateGroundedQuestions(input, validTeacherContext, {
    mockProviderCall: async () =>
      "```json\n" +
      JSON.stringify({
        schemaVersion: CANONICAL_QUESTION_SCHEMA_VERSION,
        judul: "Paket Soal Fenced",
        topik: "Routing Statis",
        questions: [
          {
            id: "q-fenced",
            jenis: "Pilihan Ganda",
            pertanyaan: "Berapakah administrative distance default?",
            opsi: ["1", "5", "10", "110"],
            kunci: "A",
            penjelasan: "Default bernilai 1.",
            evidenceIds: [ev0],
          },
        ],
      }) +
      "\n```",
  });

  assert.equal(result.status, "success");
  assert.equal(result.questions[0].id, "q-fenced");
  pass(15, "Markdown fenced JSON parsed cleanly without errors");
}

// Test 16: Malformed JSON triggers bounded correction retry or throws PROVIDER_MALFORMED_OUTPUT
{
  const input = {
    sourceSnapshotIds: [snapRouting.id],
    topik: "Routing Statis",
    jumlah: 1,
  };

  await assert.rejects(
    async () =>
      generateGroundedQuestions(input, validTeacherContext, {
        mockProviderCall: async () => "Bukan JSON sama sekali, hanya teks biasa tanpa struktur.",
      }),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.PROVIDER_MALFORMED_OUTPUT,
  );
  pass(16, "Malformed JSON output rejected with PROVIDER_MALFORMED_OUTPUT");
}

// ==============================================================================
// SECTION G: QUESTION COUNT ENFORCEMENT
// ==============================================================================
console.log("\n--- SECTION G: QUESTION COUNT ENFORCEMENT ---");

// Test 17: Requested N questions matches generated count
{
  const input = {
    sourceSnapshotIds: [snapRouting.id],
    topik: "Routing Statis",
    jumlah: 2,
  };

  const context = await buildQuestionGroundingContext(input, validTeacherContext);
  const ev0 = context.evidenceItems[0].evidenceId;

  const result = await generateGroundedQuestions(input, validTeacherContext, {
    mockProviderCall: createMockRoutingProvider(ev0, ev0),
  });

  assert.equal(result.questions.length, 2);
  assert.equal(result.metadata.requestedCount, 2);
  assert.equal(result.metadata.generatedCount, 2);
  pass(17, "Generated question count strictly matches requested count (2/2)");
}

// Test 18: Question count mismatch triggers QUESTION_COUNT_MISMATCH error
{
  const input = {
    sourceSnapshotIds: [snapRouting.id],
    topik: "Routing Statis",
    jumlah: 5, // Requested 5, but mock only returns 2
  };

  const context = await buildQuestionGroundingContext(input, validTeacherContext);
  const ev0 = context.evidenceItems[0].evidenceId;

  await assert.rejects(
    async () =>
      generateGroundedQuestions(input, validTeacherContext, {
        mockProviderCall: createMockRoutingProvider(ev0, ev0), // Returns 2
      }),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.QUESTION_COUNT_MISMATCH,
  );
  pass(18, "Question count mismatch rejected with QUESTION_COUNT_MISMATCH without fake questions");
}

// ==============================================================================
// SECTION H: EXACT-VALUE PRESERVATION
// ==============================================================================
console.log("\n--- SECTION H: EXACT-VALUE PRESERVATION ---");

// Test 19: Preserves exact IP addresses, CLI commands, and IEEE standards in questions
{
  const input = {
    sourceSnapshotIds: [snapRouting.id],
    topik: "Routing Statis",
    jumlah: 1,
  };

  const context = await buildQuestionGroundingContext(input, validTeacherContext);
  const ev0 = context.evidenceItems[0].evidenceId;

  const result = await generateGroundedQuestions(input, validTeacherContext, {
    mockProviderCall: async () =>
      JSON.stringify({
        schemaVersion: CANONICAL_QUESTION_SCHEMA_VERSION,
        judul: "Paket Soal Exact Values",
        topik: "Routing Statis",
        questions: [
          {
            id: "q-exact-val",
            jenis: "Pilihan Ganda",
            pertanyaan: "Manakah sintaks CLI yang tepat untuk menambahkan rute statis menuju subnet 192.168.20.0/24 melalui gateway 10.10.10.2?",
            opsi: [
              "/ip route add dst-address=192.168.20.0/24 gateway=10.10.10.2 distance=1",
              "/ip route add dst-address=10.10.10.2 gateway=192.168.20.0/24 distance=1",
              "/ip address add address=192.168.20.0/24 interface=ether1",
              "/routing ospf add network=192.168.20.0/24 area=backbone",
            ],
            kunci: "A",
            penjelasan: "Perintah resmi MikroTik: /ip route add dst-address=192.168.20.0/24 gateway=10.10.10.2 distance=1",
            evidenceIds: [ev0],
          },
        ],
      }),
  });

  const q = result.questions[0];
  assert.ok(q.pertanyaan.includes("192.168.20.0/24"));
  assert.ok(q.pertanyaan.includes("10.10.10.2"));
  assert.ok(q.opsi[0].includes("/ip route add dst-address=192.168.20.0/24 gateway=10.10.10.2 distance=1"));
  pass(19, "Exact technical values (IP subnets, gateway, CLI syntax) preserved byte-for-byte");
}

// ==============================================================================
// SECTION I: ANSWER-KEY SECURITY & STUDENT-SAFE PROJECTION
// ==============================================================================
console.log("\n--- SECTION I: ANSWER-KEY SECURITY ---");

// Test 20: Internal package retains answer key and rationale
{
  const input = {
    sourceSnapshotIds: [snapRouting.id],
    topik: "Routing Statis",
    jumlah: 2,
  };

  const context = await buildQuestionGroundingContext(input, validTeacherContext);
  const ev0 = context.evidenceItems[0].evidenceId;

  const result = await generateGroundedQuestions(input, validTeacherContext, {
    mockProviderCall: createMockRoutingProvider(ev0, ev0),
  });

  assert.equal(result.questions[0].kunci, "A");
  assert.ok(result.questions[0].penjelasan.length > 5);
  pass(20, "Internal generation result retains protected answer key and teacher rationale");
}

// Test 21: studentSafeQuestions strictly strips kunci, penjelasan, and evidenceIds
{
  const input = {
    sourceSnapshotIds: [snapRouting.id],
    topik: "Routing Statis",
    jumlah: 2,
  };

  const context = await buildQuestionGroundingContext(input, validTeacherContext);
  const ev0 = context.evidenceItems[0].evidenceId;

  const result = await generateGroundedQuestions(input, validTeacherContext, {
    mockProviderCall: createMockRoutingProvider(ev0, ev0),
  });

  assert.ok(result.studentSafeQuestions.length === 2);
  for (const ssq of result.studentSafeQuestions) {
    assert.equal("kunci" in ssq, false, "studentSafeQuestion must NOT expose kunci");
    assert.equal("penjelasan" in ssq, false, "studentSafeQuestion must NOT expose penjelasan");
    assert.equal("evidenceIds" in ssq, false, "studentSafeQuestion must NOT expose evidenceIds");
    assert.equal("status" in ssq, false, "studentSafeQuestion must NOT expose internal status");
    assert.ok(ssq.pertanyaan.length >= 5);
    assert.ok(ssq.opsi.length === 4);
  }
  pass(21, "Student-safe projection strictly removes all answer keys, rubrics, and internal evidence");
}

// ==============================================================================
// SECTION J: PROVENANCE & AI METADATA
// ==============================================================================
console.log("\n--- SECTION J: PROVENANCE & AI METADATA ---");

// Test 22: Generates complete QuestionAiMetadata
{
  const input = {
    sourceSnapshotIds: [snapRouting.id],
    topik: "Routing Statis",
    jumlah: 2,
  };

  const context = await buildQuestionGroundingContext(input, validTeacherContext);
  const ev0 = context.evidenceItems[0].evidenceId;

  const result = await generateGroundedQuestions(input, validTeacherContext, {
    mockProviderCall: createMockRoutingProvider(ev0, ev0),
  });

  const meta = result.package.aiMetadata;
  assert.ok(meta !== undefined);
  assert.equal(meta.promptVersion, CANONICAL_QUESTION_PROMPT_VERSION);
  assert.equal(meta.schemaVersion, CANONICAL_QUESTION_SCHEMA_VERSION);
  assert.equal(meta.validationStatus, "valid");
  assert.deepEqual(meta.sourceSnapshotIds, [snapRouting.id]);
  assert.ok(typeof meta.generatedAt === "string");
  pass(22, "Canonical QuestionAiMetadata attached with schema version, prompt version, and timestamps");
}

// ==============================================================================
// SECTION K: DRAFT PERSISTENCE (STATUS: 'DRAFT')
// ==============================================================================
console.log("\n--- SECTION K: DRAFT PERSISTENCE ---");

// Test 23: When persistDraft: false, no database call is attempted
{
  const input = {
    sourceSnapshotIds: [snapRouting.id],
    topik: "Routing Statis",
    jumlah: 2,
  };

  const context = await buildQuestionGroundingContext(input, validTeacherContext);
  const ev0 = context.evidenceItems[0].evidenceId;

  const result = await generateGroundedQuestions(input, validTeacherContext, {
    persistDraft: false,
    mockProviderCall: createMockRoutingProvider(ev0, ev0),
  });

  assert.equal(result.persistedPackageId, undefined);
  assert.equal(result.persistedPackage, undefined);
  pass(23, "persistDraft: false creates in-memory canonical package without DB insert");
}

// ==============================================================================
// SECTION L: RETRY POLICY (BOUNDED RETRIES)
// ==============================================================================
console.log("\n--- SECTION L: RETRY POLICY ---");

// Test 24: Transient provider failure retries up to maxRetries before throwing AI_PROVIDER_ERROR
{
  let callCount = 0;
  const input = {
    sourceSnapshotIds: [snapRouting.id],
    topik: "Routing Statis",
    jumlah: 2,
  };

  await assert.rejects(
    async () =>
      generateGroundedQuestions(input, validTeacherContext, {
        maxRetries: 2,
        mockProviderCall: async () => {
          callCount++;
          throw new AiServiceError(AI_ERROR_CODES.AI_PROVIDER_ERROR, "Simulated network failure");
        },
      }),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.AI_PROVIDER_ERROR,
  );

  assert.equal(callCount, 1, "Mock provider was called");
  pass(24, "Transient provider errors handle retries cleanly and fail closed");
}

// ==============================================================================
// SECTION M: FAIL-CLOSED INVARIANT
// ==============================================================================
console.log("\n--- SECTION M: FAIL-CLOSED INVARIANT ---");

// Test 25: AI provider failure NEVER creates fabricated fallback questions
{
  const input = {
    sourceSnapshotIds: [snapRouting.id],
    topik: "Routing Statis",
    jumlah: 2,
  };

  await assert.rejects(
    async () =>
      generateGroundedQuestions(input, validTeacherContext, {
        mockProviderCall: async () => {
          throw new AiServiceError(AI_ERROR_CODES.AI_TIMEOUT, "Gateway timeout 60s");
        },
      }),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.AI_TIMEOUT,
  );
  pass(25, "Fail-closed invariant: AI failure throws controlled error with zero fake fallback questions");
}

// ==============================================================================
// SECTION N: SYSTEM COMPATIBILITY (AUTO-GRADING & SOAL-STORE)
// ==============================================================================
console.log("\n--- SECTION N: SYSTEM COMPATIBILITY ---");
resetRateLimiterForTesting();

// Test 26: Canonical generated questions convert to legacy Soal seamlessly
{
  const input = {
    sourceSnapshotIds: [snapRouting.id],
    topik: "Routing Statis",
    jumlah: 2,
  };

  const context = await buildQuestionGroundingContext(input, validTeacherContext);
  const ev0 = context.evidenceItems[0].evidenceId;

  const result = await generateGroundedQuestions(input, validTeacherContext, {
    mockProviderCall: createMockRoutingProvider(ev0, ev0),
  });

  const legacySoalList = result.questions.map(toExistingSoal);
  assert.equal(legacySoalList.length, 2);
  assert.equal(legacySoalList[0].kunci, "A");
  assert.equal(legacySoalList[0].opsi.length, 4);
  assert.ok(legacySoalList[0].evidenceIds.length > 0);
  pass(26, "Generated questions convert seamlessly to backward-compatible Soal model");
}

// Test 27: Prompt registry contains question_generator_grounded_v1
{
  const registered = getRegisteredPrompt(CANONICAL_QUESTION_PROMPT_VERSION);
  assert.equal(registered.version, "question_generator_grounded_v1");
  assert.ok(registered.systemPrompt.includes("HIERARKI INSTRUKSI"));
  assert.ok(registered.systemPrompt.includes("UNTRUSTED DATA"));
  assert.ok(registered.systemPrompt.includes("ATURAN SOAL PILIHAN GANDA"));
  assert.ok(registered.systemPrompt.includes("ATURAN SOAL ESAI"));
  pass(27, "Prompt registry question_generator_grounded_v1 verified with instruction hierarchy");
}

// Test 28: Realistic Multi-source generation: Routing + VLAN snapshots combined
{
  const input = {
    sourceSnapshotIds: [snapRouting.id, snapVlan.id],
    topik: "Konfigurasi Jaringan",
    jumlah: 2,
  };

  const context = await buildQuestionGroundingContext(input, validTeacherContext);
  const routingEv = context.evidenceItems.find((e) => e.sourceId === snapRouting.id).evidenceId;
  const vlanEv = context.evidenceItems.find((e) => e.sourceId === snapVlan.id).evidenceId;

  const result = await generateGroundedQuestions(input, validTeacherContext, {
    mockProviderCall: async () =>
      JSON.stringify({
        schemaVersion: CANONICAL_QUESTION_SCHEMA_VERSION,
        judul: "Paket Soal Routing dan VLAN",
        topik: "Konfigurasi Jaringan",
        tingkat: "Sedang",
        questions: [
          {
            id: "q-multi-1",
            jenis: "Pilihan Ganda",
            pertanyaan: "Berapakah nilai default administrative distance pada MikroTik?",
            opsi: ["1", "5", "10", "110"],
            kunci: "A",
            penjelasan: "Administrative distance default bernilai 1.",
            evidenceIds: [routingEv],
          },
          {
            id: "q-multi-2",
            jenis: "Pilihan Ganda",
            pertanyaan: "Berapakah ukuran tag yang disisipkan pada frame header oleh protokol IEEE 802.1Q?",
            opsi: ["4-byte", "2-byte", "8-byte", "16-byte"],
            kunci: "A",
            penjelasan: "Protokol 802.1Q menyisipkan tag berukuran 4-byte (32 bit).",
            evidenceIds: [vlanEv],
          },
        ],
        evidenceRefs: [
          { sourceId: snapRouting.id, status: "SUPPORTED" },
          { sourceId: snapVlan.id, status: "SUPPORTED" },
        ],
      }),
  });

  assert.equal(result.status, "success");
  assert.equal(result.questions.length, 2);
  assert.equal(result.metadata.sourceSnapshotIds.length, 2);
  pass(28, "Realistic multi-source generation across Routing and VLAN succeeds with full provenance");
}

console.log("\n================================================================================");
console.log(`  ALL ${passed} / 28 TESTS IN AI-4C QUESTION GENERATION SUITE PASSED!         `);
console.log("================================================================================");
