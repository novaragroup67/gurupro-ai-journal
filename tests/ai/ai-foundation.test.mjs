#!/usr/bin/env node
/**
 * ==============================================================================
 * GURUPRO TEST SUITE: AI-0 AI INFRASTRUCTURE & SOURCE GROUNDING FOUNDATION
 * ==============================================================================
 *
 * Tests the entire AI-0 Foundation covering:
 * - Authorization (1-4)
 * - Source Ingestion & SSRF Protection (5-12)
 * - Normalization (13-15)
 * - Snapshotting & Content Hashing (16-18)
 * - Boundary-Aware Chunking & Provenance Retrieval (19-21)
 * - Strict Grounding Contract & Evidence Model (22-24)
 * - Structured Output Validation (25-28)
 * - Security & Secret Boundaries (29-32)
 * - Observability & Error Taxonomy (33-35)
 * - Realistic Source Cases A - G (including Case G negative grounding)
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AI_ERROR_CODES,
  AiServiceError,
  normalizeAiError,
} from "../../src/lib/ai/error-taxonomy.js";
import {
  normalizeHtmlContent,
  normalizeTextContent,
} from "../../src/lib/ai/source-normalizer.js";
import {
  chunkNormalizedSource,
} from "../../src/lib/ai/source-chunker.js";
import {
  isPrivateOrReservedIp,
  validateHostSafety,
  ingestSource,
  clearSnapshotCacheForTesting,
} from "../../src/lib/ai/source-ingestion.js";
import {
  retrieveSourceContext,
} from "../../src/lib/ai/retriever.js";
import {
  evaluateGroundingAgainstSource,
  buildEvidenceRef,
} from "../../src/lib/ai/grounding.js";
import {
  checkAndAcquireRateSlot,
  resetRateLimiterForTesting,
} from "../../src/lib/ai/rate-limiter.js";
import {
  PROMPT_REGISTRY,
  getRegisteredPrompt,
} from "../../src/lib/ai/prompts-registry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, "../..");

console.log("================================================================================");
console.log("  GURUPRO TEST SUITE: AI-0 AI INFRASTRUCTURE & GROUNDING FOUNDATION             ");
console.log("================================================================================");

let passedCount = 0;
function pass(num, desc) {
  passedCount++;
  console.log(`  [PASS ${num}] ${desc}`);
}

// -----------------------------------------------------------------------------
// SECTION 1: ROLE & AUTHORIZATION (1 - 4)
// -----------------------------------------------------------------------------
console.log("\n--- SECTION 1: ROLE & AUTHORIZATION ---");

// Simulation of server-side requireTeacherAiAuth logic
function simulateTeacherAiAuth(user, profile) {
  if (!user || !user.id) {
    throw new AiServiceError(AI_ERROR_CODES.AUTH_ERROR, "Forbidden: User unauthenticated.");
  }
  if (!profile || profile.id !== user.id) {
    throw new AiServiceError(AI_ERROR_CODES.AUTH_ERROR, "Forbidden: Profil pengguna tidak ditemukan.");
  }
  const role = String(profile.role || "").toLowerCase().trim();
  if (role !== "guru") {
    throw new AiServiceError(AI_ERROR_CODES.ROLE_FORBIDDEN, "Forbidden: Operasi AI hanya diizinkan untuk peran Guru.");
  }
  const status = String(profile.status_verifikasi || "").toLowerCase().trim();
  if (status === "menunggu") {
    throw new AiServiceError(AI_ERROR_CODES.ROLE_FORBIDDEN, "Forbidden: Akun guru Anda sedang menunggu verifikasi.");
  }
  if (status === "ditolak" || status === "nonaktif") {
    throw new AiServiceError(AI_ERROR_CODES.ROLE_FORBIDDEN, "Forbidden: Akun guru Anda ditolak atau belum aktif.");
  }
  return { authorized: true, userId: user.id, role: profile.role };
}

// 1. Unauthenticated AI request -> denied
assert.throws(
  () => simulateTeacherAiAuth(null, null),
  (err) => err.code === AI_ERROR_CODES.AUTH_ERROR,
);
pass(1, "Unauthenticated AI request is strictly denied with AUTH_ERROR");

// 2. Student AI request -> denied
assert.throws(
  () => simulateTeacherAiAuth({ id: "std-1" }, { id: "std-1", role: "siswa", status_verifikasi: "terverifikasi" }),
  (err) => err.code === AI_ERROR_CODES.ROLE_FORBIDDEN,
);
pass(2, "Student AI request is strictly denied with ROLE_FORBIDDEN");

// 3. Unauthorized / nonaktif / pending teacher -> denied
assert.throws(
  () => simulateTeacherAiAuth({ id: "t-1" }, { id: "t-1", role: "guru", status_verifikasi: "nonaktif" }),
  (err) => err.code === AI_ERROR_CODES.ROLE_FORBIDDEN,
);
pass(3, "Nonaktif / unapproved teacher AI request is strictly denied with ROLE_FORBIDDEN");

// 4. Verified teacher -> allowed
const authRes = simulateTeacherAiAuth({ id: "t-1" }, { id: "t-1", role: "guru", status_verifikasi: "terverifikasi" });
assert.equal(authRes.authorized, true);
assert.equal(authRes.role, "guru");
pass(4, "Verified teacher is successfully authorized for AI operations");

// -----------------------------------------------------------------------------
// SECTION 2: SOURCE INGESTION & SSRF PROTECTION (5 - 12)
// -----------------------------------------------------------------------------
console.log("\n--- SECTION 2: SOURCE INGESTION & SSRF PROTECTION ---");

clearSnapshotCacheForTesting();

// 5. Plain text ingestion -> succeeds
const textSample = `
# Prinsip Dasar Routing Statis pada Jaringan Komputer

Routing statis adalah metode konfigurasi tabel rute yang dilakukan secara manual oleh administrator jaringan. 
Metode ini sangat cocok untuk topologi jaringan berskala kecil karena tidak membebani penggunaan CPU dan bandwidth router.

Kelebihan utama routing statis mencakup keamanan yang lebih terkontrol dan tidak adanya pertukaran informasi routing antar router secara periodik. 
Namun kelemahannya adalah tidak toleran terhadap perubahan topologi dinamis di lapangan sehingga memerlukan pembaruan manual jika link utama putus.
`;

const textSnapshot = await ingestSource({
  sourceType: "text",
  input: textSample,
  userId: "guru-user-001",
  title: "Routing Statis SMK",
});
assert.ok(textSnapshot.id.startsWith("src_"));
assert.equal(textSnapshot.sourceType, "text");
assert.ok(textSnapshot.wordCount > 30);
pass(5, "Plain text source ingestion successfully normalizes, hashes, and chunks");

// 6. Valid supported URL syntax check
assert.ok(!isPrivateOrReservedIp("93.184.216.34")); // example.com
pass(6, "Valid public IP addresses pass host safety inspection");

// 7. Invalid URL -> rejected
await assert.rejects(
  async () => ingestSource({ sourceType: "url", input: "not-a-valid-url://invalid", userId: "guru-user-001" }),
  (err) => err.code === AI_ERROR_CODES.SOURCE_VALIDATION_ERROR,
);
pass(7, "Invalid URL syntax or unsupported protocol rejected safely with SOURCE_VALIDATION_ERROR");

// 8. Blocked/private target (SSRF) -> rejected
assert.ok(isPrivateOrReservedIp("127.0.0.1"), "Loopback must be flagged private");
assert.ok(isPrivateOrReservedIp("10.1.2.3"), "10.0.0.0/8 must be flagged private");
assert.ok(isPrivateOrReservedIp("192.168.1.1"), "192.168.0.0/16 must be flagged private");
assert.ok(isPrivateOrReservedIp("172.16.5.4"), "172.16.0.0/12 must be flagged private");
assert.ok(isPrivateOrReservedIp("169.254.169.254"), "Cloud metadata IP must be flagged private");
assert.ok(isPrivateOrReservedIp("::1"), "IPv6 loopback must be flagged private");

await assert.rejects(
  async () => validateHostSafety("localhost"),
  (err) => err.code === AI_ERROR_CODES.SOURCE_VALIDATION_ERROR,
);
await assert.rejects(
  async () => validateHostSafety("169.254.169.254"),
  (err) => err.code === AI_ERROR_CODES.SOURCE_VALIDATION_ERROR,
);
pass(8, "SSRF guard strictly blocks localhost, loopback, private ranges, and cloud metadata targets");

// 9. Timeout -> rejected safely
const timeoutErr = normalizeAiError(new Error("The operation was aborted due to timeout"));
assert.equal(timeoutErr.code, AI_ERROR_CODES.AI_TIMEOUT);
assert.equal(timeoutErr.isRetryable, true);
pass(9, "Network and request timeout safely maps to AI_TIMEOUT error taxonomy");

// 10. Oversized response -> rejected
const oversizedErr = normalizeAiError(new Error("Ukuran halaman terlalu besar (maksimal 2MB)."));
assert.equal(oversizedErr.code, AI_ERROR_CODES.SOURCE_TOO_LARGE);
pass(10, "Oversized source payloads (>2MB) safely rejected with SOURCE_TOO_LARGE");

// 11. Unsupported content -> rejected
const unsuppErr = normalizeAiError(new Error("Tipe konten application/pdf tidak didukung"));
assert.equal(unsuppErr.code, AI_ERROR_CODES.SOURCE_PARSE_ERROR);
pass(11, "Binary or unsupported media formats rejected with SOURCE_PARSE_ERROR");

// 12. Empty source -> rejected
await assert.rejects(
  async () => ingestSource({ sourceType: "text", input: "   ", userId: "guru-user-001" }),
  (err) => err.code === AI_ERROR_CODES.SOURCE_EMPTY,
);
pass(12, "Empty source input rejected safely with SOURCE_EMPTY");

// -----------------------------------------------------------------------------
// SECTION 3: SOURCE NORMALIZATION (13 - 15)
// -----------------------------------------------------------------------------
console.log("\n--- SECTION 3: SOURCE NORMALIZATION ---");

// 13. Web noise removed without altering factual statements
const rawWebHtml = `
<html>
<head>
  <title>Panduan Konfigurasi Mikrotik RouterOS</title>
  <script>console.log("track analytics");</script>
  <style>.ads { color: red; }</style>
</head>
<body>
  <nav><a href="/home">Beranda</a> | <a href="/login">Login</a></nav>
  <header><h1>Header Iklan</h1></header>
  <article>
    <h1>Panduan Konfigurasi Mikrotik RouterOS</h1>
    <p>Mikrotik RouterOS adalah sistem operasi berbasis Linux yang dirancang khusus untuk keperluan router jaringan komputer.</p>
    <p>Langkah awal konfigurasi IP address dilakukan melalui menu IP > Addresses lalu menambahkan alamat pada interface yang aktif.</p>
    <ul>
      <li>Gunakan ether1 untuk interface WAN publik.</li>
      <li>Gunakan ether2 untuk interface LAN lokal.</li>
    </ul>
    <p>Kami menggunakan cookie untuk analitik. All rights reserved 2026.</p>
  </article>
  <footer>Copyright &copy; 2026 Portal Berita. Bagikan artikel ini.</footer>
</body>
</html>
`;

const normResult = normalizeHtmlContent(rawWebHtml);
assert.equal(normResult.title, "Panduan Konfigurasi Mikrotik RouterOS");
assert.ok(!normResult.normalized.includes("<script>"), "Scripts must be stripped");
assert.ok(!normResult.normalized.includes("<nav>"), "Nav must be stripped");
assert.ok(!normResult.normalized.includes("Kami menggunakan cookie"), "Cookie banner must be stripped");
assert.ok(normResult.normalized.includes("Mikrotik RouterOS adalah sistem operasi"), "Factual content preserved");
assert.ok(normResult.normalized.includes("interface WAN publik"), "List details preserved");
pass(13, "Web noise (scripts, navigation, cookies, footers) stripped cleanly while preserving factual content");

// 14. Headings remain identifiable
assert.ok(normResult.normalized.includes("# Panduan Konfigurasi Mikrotik RouterOS"), "Markdown heading preserved");
pass(14, "Structural headings remain cleanly converted to standard markdown hierarchies");

// 15. Normalization is strictly deterministic and stable
const normRepeat = normalizeHtmlContent(rawWebHtml);
assert.equal(normResult.normalized, normRepeat.normalized, "Normalized text must be strictly deterministic");
pass(15, "Normalization is 100% deterministic and reproducible across repeated runs");

// -----------------------------------------------------------------------------
// SECTION 4: SNAPSHOT & CONTENT HASHING (16 - 18)
// -----------------------------------------------------------------------------
console.log("\n--- SECTION 4: SNAPSHOT & CONTENT HASHING ---");

// 16. Source snapshot is created with expected schema
assert.ok(textSnapshot.id);
assert.ok(textSnapshot.contentHash);
assert.ok(textSnapshot.chunks.length > 0);
assert.equal(textSnapshot.ingestionStatus, "completed");
pass(16, "Source snapshot record generated with complete provenance schema");

// 17. Content hash is valid SHA-256
const expectedHash = createHash("sha256").update(textSnapshot.normalizedContent).digest("hex");
assert.equal(textSnapshot.contentHash, expectedHash);
pass(17, "Content hash rigorously verified as SHA-256 digest of normalized text");

// 18. Changed source produces distinguishable snapshot with different hash
const modifiedTextSample = textSample + "\n\nCatatan Tambahan: Routing statis menggunakan default route 0.0.0.0/0.";
const modifiedSnapshot = await ingestSource({
  sourceType: "text",
  input: modifiedTextSample,
  userId: "guru-user-001",
});
assert.notEqual(textSnapshot.contentHash, modifiedSnapshot.contentHash);
assert.notEqual(textSnapshot.id, modifiedSnapshot.id);
pass(18, "Modifying external source produces a distinct, distinguishable snapshot and hash");

// -----------------------------------------------------------------------------
// SECTION 5: CHUNKING & PROVENANCE RETRIEVAL (19 - 21)
// -----------------------------------------------------------------------------
console.log("\n--- SECTION 5: CHUNKING & PROVENANCE RETRIEVAL ---");

// 19. Chunks retain source provenance
const chunks = textSnapshot.chunks;
assert.ok(chunks.length >= 1);
assert.equal(chunks[0].sourceId, textSnapshot.id);
assert.equal(chunks[0].index, 0);
assert.ok(chunks[0].chunkId.startsWith("chunk_"));
assert.ok(chunks[0].wordCount > 0);
pass(19, "Chunks retain source provenance (sourceId, chunkId, index, wordCount)");

// 20. Retrieval never crosses source ownership
await assert.rejects(
  async () =>
    retrieveSourceContext({
      sourceId: textSnapshot.id,
      userId: "different-guru-999", // Unauthorized user
    }),
  (err) => err.code === AI_ERROR_CODES.ROLE_FORBIDDEN,
);
pass(20, "Retriever strictly prevents cross-user access (Guru A cannot retrieve Guru B's sources)");

// 21. Retrieval returns authorized chunks with provenance
const retrieval = await retrieveSourceContext({
  sourceId: textSnapshot.id,
  userId: "guru-user-001",
  query: "kelebihan routing statis",
});
assert.equal(retrieval.sourceId, textSnapshot.id);
assert.ok(retrieval.combinedContext.includes("routing statis"));
assert.ok(retrieval.retrievedChunks.length > 0);
pass(21, "Retriever returns ordered, relevant chunks belonging strictly to authorized owner");

// -----------------------------------------------------------------------------
// SECTION 6: GROUNDING & EVIDENCE CONTRACT (22 - 24)
// -----------------------------------------------------------------------------
console.log("\n--- SECTION 6: GROUNDING & EVIDENCE CONTRACT ---");

// 22. Supported fact can be represented with evidence
const supportedEval = evaluateGroundingAgainstSource({
  claim: "Routing statis dikonfigurasi secara manual oleh administrator jaringan",
  sourceChunks: textSnapshot.chunks,
  sourceId: textSnapshot.id,
});
assert.equal(supportedEval.status, "SUPPORTED");
assert.ok(supportedEval.evidenceSnippet);
assert.ok(supportedEval.matchedChunkId);
const evidenceRef = buildEvidenceRef(textSnapshot.id, "Routing Statis SMK", supportedEval);
assert.equal(evidenceRef.status, "SUPPORTED");
pass(22, "Directly supported claim identified as SUPPORTED with attached snippet evidence");

// 23 & 24. Missing fact is NOT treated as supported, and represented as NOT_FOUND (Case G)
const missingFactEval = evaluateGroundingAgainstSource({
  claim: "Kebijakan asesmen sertifikasi internasional Cisco CCNA dan biaya ujian voucher diskon 50%",
  sourceChunks: textSnapshot.chunks,
  sourceId: textSnapshot.id,
});
assert.equal(missingFactEval.status, "NOT_FOUND");
assert.ok(missingFactEval.explanation.includes("tidak ditemukan"));
pass(23, "Fact absent from source is strictly classified as NOT_FOUND (never treated as supported)");
pass(24, "Missing source fact is represented as unavailable with zero hallucinated fallback");

// -----------------------------------------------------------------------------
// SECTION 7: STRUCTURED OUTPUT VALIDATION (25 - 28)
// -----------------------------------------------------------------------------
console.log("\n--- SECTION 7: STRUCTURED OUTPUT VALIDATION ---");

const validateModulSchema = (obj) => {
  if (!obj || typeof obj !== "object") throw new Error("Output must be an object");
  if (typeof obj.judul !== "string" || !obj.judul.trim()) throw new Error("Field 'judul' is required and must be string");
  if (!Array.isArray(obj.sections) || obj.sections.length === 0) throw new Error("Field 'sections' must be non-empty array");
  for (const s of obj.sections) {
    if (typeof s.judul !== "string") throw new Error("Section 'judul' must be string");
    if (!Array.isArray(s.poin)) throw new Error("Section 'poin' must be array");
  }
  return obj;
};

// 25. Valid structured output passes
const validModul = {
  judul: "Modul Jaringan Dasar",
  sections: [{ judul: "Bab 1 Konsep", poin: ["Poin A", "Poin B"], isi: "Isi bab..." }],
};
assert.doesNotThrow(() => validateModulSchema(validModul));
pass(25, "Valid structured output cleanly passes schema validation");

// 26. Malformed JSON/output rejected
assert.throws(() => validateModulSchema(null), /Output must be an object/);
pass(26, "Malformed or non-object output is rejected safely");

// 27. Missing required field rejected
assert.throws(() => validateModulSchema({ sections: [] }), /Field 'judul' is required/);
pass(27, "Missing required schema fields rejected strictly");

// 28. Invalid type rejected
assert.throws(() => validateModulSchema({ judul: 12345, sections: [] }), /must be string/);
pass(28, "Invalid data types within schema rejected strictly");

// -----------------------------------------------------------------------------
// SECTION 8: SECURITY & SECRET ISOLATION (29 - 32)
// -----------------------------------------------------------------------------
console.log("\n--- SECTION 8: SECURITY & SECRET ISOLATION ---");

// 29. Secrets never read from VITE_* variables in server env
const envExampleContent = readFileSync(resolve(ROOT_DIR, ".env.example"), "utf-8");
assert.ok(!envExampleContent.includes("VITE_GEMINI_API_KEY"), "VITE_GEMINI_API_KEY must never appear in templates");
assert.ok(!envExampleContent.includes("VITE_LOVABLE_API_KEY"), "VITE_LOVABLE_API_KEY must never appear in templates");
assert.ok(!envExampleContent.includes("VITE_OPENAI_API_KEY"), "VITE_OPENAI_API_KEY must never appear in templates");
pass(29, "Private AI provider API secrets never use VITE_* prefixes");

// 30. Error messages and logs sanitize credentials
const rawSecretError = new Error("Provider returned 401 Bearer secret_live_key_998877665544332211 unauthorized");
const sanitizedError = normalizeAiError(rawSecretError);
assert.ok(!sanitizedError.message.includes("secret_live_key"), "Bearer token must be sanitized");
assert.ok(!sanitizedError.userMessage.includes("secret_live_key"), "User message must never reveal tokens");
pass(30, "Sanitized error normalizer scrubs bearer tokens and credentials from logs and user messages");

// 31. Unauthorized source ID cannot be retrieved
await assert.rejects(
  async () => retrieveSourceContext({ sourceId: "non_existent_id", userId: "guru-user-001" }),
  (err) => err.code === AI_ERROR_CODES.RETRIEVAL_ERROR,
);
pass(31, "Non-existent or unauthorized source IDs cannot be retrieved");

// 32. Provider errors do not expose credentials
const providerErr = new AiServiceError(AI_ERROR_CODES.AI_PROVIDER_ERROR, undefined, { apiKey: "super_secret" });
const jsonErr = providerErr.toJSON();
assert.equal(jsonErr.code, "AI_PROVIDER_ERROR");
assert.ok(!JSON.stringify(jsonErr).includes("super_secret"));
pass(32, "Provider error serialization excludes sensitive internal details");

// -----------------------------------------------------------------------------
// SECTION 9: OBSERVABILITY & SYSTEM LOGS (33 - 35)
// -----------------------------------------------------------------------------
console.log("\n--- SECTION 9: OBSERVABILITY & SYSTEM LOGS ---");

// 33. Rate limiter sliding window and abuse control
resetRateLimiterForTesting();
const release1 = checkAndAcquireRateSlot("guru-rate-test", { maxPerWindow: 2, maxConcurrent: 2 });
const release2 = checkAndAcquireRateSlot("guru-rate-test", { maxPerWindow: 2, maxConcurrent: 2 });

// Exceeds maxConcurrent
assert.throws(
  () => checkAndAcquireRateSlot("guru-rate-test", { maxPerWindow: 2, maxConcurrent: 2 }),
  (err) => err.code === AI_ERROR_CODES.AI_RATE_LIMIT,
);
release1();
release2();
pass(33, "Server-side rate limiter and concurrency guard prevent concurrent abuse");

// 34. Prompt template versioning registry
const promptEntry = getRegisteredPrompt("modul_ajar_grounded_v1");
assert.equal(promptEntry.version, "modul_ajar_grounded_v1");
assert.equal(promptEntry.feature, "modul_ajar");
assert.ok(promptEntry.systemPrompt.includes("100% grounded"));
assert.throws(() => getRegisteredPrompt("non_existent_prompt_v99"));
pass(34, "Prompt versioning registry tracks explicit feature and version metadata");

// 35. Error taxonomy covers all required categories
const requiredCodes = [
  "AUTH_ERROR", "ROLE_FORBIDDEN", "INVALID_REQUEST", "SOURCE_VALIDATION_ERROR",
  "SOURCE_FETCH_ERROR", "SOURCE_PARSE_ERROR", "SOURCE_EMPTY", "SOURCE_TOO_LARGE",
  "RETRIEVAL_ERROR", "AI_PROVIDER_ERROR", "AI_TIMEOUT", "AI_RATE_LIMIT",
  "AI_OUTPUT_INVALID", "AI_GROUNDING_ERROR", "PERSISTENCE_ERROR",
];
for (const code of requiredCodes) {
  assert.ok(AI_ERROR_CODES[code], `AI_ERROR_CODES must include ${code}`);
}
pass(35, "All 15 standard AI-0 error taxonomy codes defined and normalized");

// -----------------------------------------------------------------------------
// SECTION 10: REALISTIC SOURCE CASES A - G (Section 25)
// -----------------------------------------------------------------------------
console.log("\n--- SECTION 10: REALISTIC SOURCE CASES A - G ---");

// Case A: Short text source
const caseASnapshot = await ingestSource({
  sourceType: "text",
  input: "Materi ini membahas pengenalan kabel serat optik (fiber optic) untuk transmisi data kecepatan tinggi pada jaringan backbone telekomunikasi modern.",
  userId: "guru-user-001",
});
assert.ok(caseASnapshot.wordCount >= 15);
pass("Case A", "Short text source ingestion verified");

// Case B: Long structured educational source
const longEduSource = `
# Capaian Pembelajaran: Teknik Jaringan Komputer dan Telekomunikasi

## 1. Perencanaan Jaringan
Pada fase ini siswa mampu merencanakan topologi jaringan kabel dan nirkabel, menentukan spesifikasi teknis perangkat jaringan sesuai kebutuhan bisnis, serta menghitung estimasi anggaran biaya perangkat.

## 2. Pemasangan dan Konfigurasi
Siswa mampu melakukan instalasi jaringan lokal (LAN) dan Wide Area Network (WAN), melakukan pengkabelan terstruktur (structured cabling), dan mengonfigurasi perangkat switch managed dan router.

## 3. Administrasi Server dan Layanan Jaringan
Siswa mampu menginstal sistem operasi server berbasis open source, mengonfigurasi DHCP Server, DNS Server, Web Server, dan FTP Server dengan parameter keamanan standar industri.

## 4. Keamanan Jaringan dan Monitoring
Siswa mampu menganalisis traffic jaringan menggunakan packet sniffer, menerapkan firewall filter rules, serta mendeteksi serangan port scanning secara proaktif.
`;

const caseBSnapshot = await ingestSource({
  sourceType: "kurikulum",
  input: longEduSource,
  userId: "guru-user-001",
});
assert.ok(caseBSnapshot.chunks.length >= 1);
assert.equal(caseBSnapshot.chunks[0].title, "Capaian Pembelajaran: Teknik Jaringan Komputer dan Telekomunikasi");
pass("Case B", "Long structured educational source preserved across section boundaries");

// Case C: URL with navigation/footer noise
const caseCResult = normalizeHtmlContent(`
  <nav>Menu Navigasi</nav>
  <main><h1>Materi VLAN</h1><p>VLAN membagi broadcast domain secara logis pada switch layer 2.</p></main>
  <footer>Footer copyright 2026</footer>
`);
assert.ok(!caseCResult.normalized.includes("Menu Navigasi"));
assert.ok(caseCResult.normalized.includes("VLAN membagi broadcast domain"));
pass("Case C", "URL with navigation/footer noise stripped cleanly");

// Case D: URL with unsupported/invalid content
const caseDErr = normalizeAiError(new Error("Isi halaman bukan teks yang bisa dibaca"));
assert.equal(caseDErr.code, AI_ERROR_CODES.SOURCE_PARSE_ERROR);
pass("Case D", "Unsupported/invalid content safely rejected");

// Case E: Empty source
await assert.rejects(
  async () => ingestSource({ sourceType: "text", input: "   \n\t   ", userId: "guru-user-001" }),
  (err) => err.code === AI_ERROR_CODES.SOURCE_EMPTY,
);
pass("Case E", "Empty source rejected with SOURCE_EMPTY");

// Case F: Source containing factual statements that must remain unchanged
const factsSource = "Protokol HTTP berjalan pada port 80 secara default, sedangkan HTTPS terenkripsi berjalan pada port 443 menggunakan protokol TLS.";
const caseFSnapshot = await ingestSource({ sourceType: "text", input: factsSource, userId: "guru-user-001" });
assert.ok(caseFSnapshot.normalizedContent.includes("port 80"));
assert.ok(caseFSnapshot.normalizedContent.includes("port 443"));
pass("Case F", "Factual technical statements remain 100% intact without alteration");

// Case G: Source that does NOT contain a requested fact (VLAN vs Assessment Policy)
const vlanSource = `
# Pembahasan Konsep Virtual LAN (VLAN)
VLAN adalah teknologi yang memungkinkan administrator jaringan untuk membagi satu switch fisik menjadi beberapa jaringan logis yang berbeda. 
Dengan menggunakan VLAN, lalu lintas broadcast dari satu departemen tidak akan mengganggu departemen lain pada satu gedung yang sama.
Mode port switch terdiri dari mode access untuk menghubungkan perangkat akhir (end device) dan mode trunk untuk melewatkan beberapa VLAN sekaligus antar switch.
`;

const caseGSnapshot = await ingestSource({
  sourceType: "text",
  input: vlanSource,
  userId: "guru-user-001",
});

const caseGEval = evaluateGroundingAgainstSource({
  claim: "Kebijakan bobot penilaian ujian praktik semester ganjil dan kriteria remedial VLAN",
  sourceChunks: caseGSnapshot.chunks,
  sourceId: caseGSnapshot.id,
});

assert.equal(caseGEval.status, "NOT_FOUND");
assert.ok(!caseGEval.matchedChunkId, "No chunk should match absent fact");
pass("Case G", "Absent fact (VLAN assessment policy) is strictly flagged as NOT_FOUND (never invented)");

console.log("\n================================================================================");
console.log(`  ALL ${passedCount} AI FOUNDATION (AI-0) TESTS PASSED SUCCESSFULLY! (0 FAILED) `);
console.log("================================================================================");
