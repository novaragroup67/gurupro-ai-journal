#!/usr/bin/env node
/**
 * ==============================================================================
 * GURUPRO TEST SUITE: AI-1 FINAL HARDENING & QUALITY GATE
 * ==============================================================================
 *
 * Final validation gate before AI-2 (AI Modul Ajar generation).
 *
 * Verifies:
 * 1. Semantic / Paraphrase Retrieval (Indonesian educational synonym mapping)
 * 2. Grounding False-Positive Prevention (Rejects ungrounded entities & numbers)
 * 3. Semantic Retriever Plugin Extension Point (SemanticRetrieverPlugin interface)
 * 4. Evidence Snippet Precision & Completeness (Provenance contract)
 * 5. Parser Error Handling & Edge Cases (Corrupted ZIP/DOCX, fake PDF, 0-byte buffer)
 * 6. SSRF Security & Private IP Blocking (Cloud metadata, loopback, LAN ranges)
 * 7. Multi-Tenant Strict Isolation (Cross-teacher access rejection)
 * 8. Deterministic Retrieval Stability (10-iteration consistency check)
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
  extractDocxText,
  extractPdfText,
  extractPlainText,
  extractDocumentText,
} from "../../src/lib/ai/document-parser.js";
import {
  normalizeHtmlContent,
  normalizeTextContent,
} from "../../src/lib/ai/source-normalizer.js";
import {
  chunkNormalizedSource,
} from "../../src/lib/ai/source-chunker.js";
import {
  ingestSource,
  clearSnapshotCacheForTesting,
  getCachedSourceSnapshot,
} from "../../src/lib/ai/source-ingestion.js";
import {
  retrieveSourceContext,
} from "../../src/lib/ai/retriever.js";
import {
  evaluateGroundingAgainstSource,
  buildEvidenceRef,
  EDUCATIONAL_SYNONYMS,
} from "../../src/lib/ai/grounding.js";
import {
  isPrivateOrReservedIp,
  validateHostSafety,
} from "../../src/lib/sumber.functions.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, "../..");
const FIXTURES_DIR = resolve(ROOT_DIR, "tests/fixtures");

console.log("================================================================================");
console.log("  GURUPRO TEST SUITE: AI-1 FINAL HARDENING GATE (QUALITY & SECURITY VERIFICATION) ");
console.log("================================================================================");

let passed = 0;
function pass(label) {
  passed++;
  console.log(`  [PASS ${passed}] ${label}`);
}

clearSnapshotCacheForTesting();

const TEACHER_1 = "guru-tkj-101";
const TEACHER_2 = "guru-akuntansi-202";

// Load test fixtures
const txtBuffer = readFileSync(resolve(FIXTURES_DIR, "educational-network-routing.txt"));
const docxBuffer = readFileSync(resolve(FIXTURES_DIR, "educational-accounting-journal.docx"));
const pdfBuffer = readFileSync(resolve(FIXTURES_DIR, "educational-automotive-injection.pdf"));
const htmlContent = readFileSync(resolve(FIXTURES_DIR, "educational-web-vlan.html"), "utf-8");

// Ingest sources for Teacher 1
const txtSnapshot = await ingestSource({
  sourceType: "text",
  input: txtBuffer.toString("utf-8"),
  userId: TEACHER_1,
  title: "Routing Statis MikroTik",
});

const docxSnapshot = await ingestSource({
  sourceType: "dokumen",
  documentBuffer: docxBuffer,
  fileName: "educational-accounting-journal.docx",
  userId: TEACHER_1,
  title: "Jurnal Penyesuaian Akuntansi",
});

const pdfSnapshot = await ingestSource({
  sourceType: "dokumen",
  documentBuffer: pdfBuffer,
  fileName: "educational-automotive-injection.pdf",
  userId: TEACHER_1,
  title: "Sistem Bahan Bakar EFI",
});

const htmlSnapshot = await ingestSource({
  sourceType: "text",
  input: normalizeHtmlContent(htmlContent).normalized,
  userId: TEACHER_1,
  title: "Panduan VLAN dan 802.1Q",
});

// -----------------------------------------------------------------------------
// GATE CHECK 1: SEMANTIC & PARAPHRASE RETRIEVAL (EDUCATIONAL SYNONYM MAPPING)
// -----------------------------------------------------------------------------
console.log("\n--- GATE CHECK 1: PARAPHRASE RETRIEVAL & SYNONYM MAPPING ---");

// 1.1 "biaya" maps to "beban" in accounting journal
const paraDocxRes = await retrieveSourceContext({
  sourceId: docxSnapshot.id,
  userId: TEACHER_1,
  query: "Bagaimana cara penyesuaian biaya asuransi dibayar di muka sebesar Rp 3.000.000?",
});
assert.ok(paraDocxRes.retrievedChunks.length > 0);
assert.ok(
  paraDocxRes.combinedContext.includes("3.000.000"),
  "Combined context must contain '3.000.000'",
);
const paraDocxEval = evaluateGroundingAgainstSource({
  claim: "Bagaimana cara penyesuaian biaya asuransi dibayar di muka sebesar Rp 3.000.000?",
  sourceChunks: paraDocxRes.retrievedChunks,
  sourceId: docxSnapshot.id,
  sourceTitle: docxSnapshot.sourceTitle,
});
assert.equal(paraDocxEval.status, "SUPPORTED");
pass("Paraphrase query (biaya asuransi -> beban asuransi) accurately retrieved and grounded as SUPPORTED");

// 1.2 "jarak administratif perutean" maps to "administrative distance routing" in routing text
const paraTxtRes = await retrieveSourceContext({
  sourceId: txtSnapshot.id,
  userId: TEACHER_1,
  query: "Berapa jarak administratif standar perutean statis pada mikrotik?",
});
assert.ok(paraTxtRes.retrievedChunks.length > 0);
assert.ok(
  paraTxtRes.combinedContext.includes("administrative distance default bernilai 1"),
  "Combined context must contain administrative distance info",
);
const paraTxtEval = evaluateGroundingAgainstSource({
  claim: "Berapa jarak administratif standar perutean statis pada mikrotik?",
  sourceChunks: paraTxtRes.retrievedChunks,
  sourceId: txtSnapshot.id,
  sourceTitle: txtSnapshot.sourceTitle,
});
assert.equal(paraTxtEval.status, "SUPPORTED");
pass("Paraphrase query (jarak administratif perutean -> administrative distance) accurately grounded as SUPPORTED");

// -----------------------------------------------------------------------------
// GATE CHECK 2: GROUNDING FALSE-POSITIVE HARDENING (ANTI-HALLUCINATION)
// -----------------------------------------------------------------------------
console.log("\n--- GATE CHECK 2: GROUNDING FALSE-POSITIVE HARDENING ---");

// 2.1 Asserting diesel common rail 2000 bar in gasoline EFI source MUST be NOT_FOUND
const falseRailEval = evaluateGroundingAgainstSource({
  claim: "Sistem injeksi bahan bakar EFI bensin menggunakan pompa common rail diesel bertekanan 2000 bar",
  sourceChunks: pdfSnapshot.chunks,
  sourceId: pdfSnapshot.id,
  sourceTitle: pdfSnapshot.sourceTitle,
});
assert.equal(falseRailEval.status, "NOT_FOUND");
assert.ok(
  falseRailEval.unsupportedEntities && falseRailEval.unsupportedEntities.includes("2000"),
  "Must flag 2000 bar as unsupported entity",
);
pass("False-positive prevention: Claim asserting diesel common rail 2000 bar rejected strictly as NOT_FOUND");

// 2.2 Asserting Cisco Catalyst 2960 in MikroTik static routing source MUST be NOT_FOUND
const falseCiscoEval = evaluateGroundingAgainstSource({
  claim: "Konfigurasi routing statis pada switch Cisco Catalyst 2960 menggunakan perintah ip route",
  sourceChunks: txtSnapshot.chunks,
  sourceId: txtSnapshot.id,
  sourceTitle: txtSnapshot.sourceTitle,
});
assert.equal(falseCiscoEval.status, "NOT_FOUND");
assert.ok(
  falseCiscoEval.unsupportedEntities && falseCiscoEval.unsupportedEntities.includes("cisco"),
  "Must flag Cisco as unsupported entity",
);
pass("False-positive prevention: Claim asserting Cisco Catalyst 2960 rejected strictly as NOT_FOUND");

// 2.3 Asserting 5 VLAN trunking in static routing source MUST be NOT_FOUND
const falseVlanEval = evaluateGroundingAgainstSource({
  claim: "Pembagian 5 VLAN trunking pada subinterface routing statis router MikroTik",
  sourceChunks: txtSnapshot.chunks,
  sourceId: txtSnapshot.id,
  sourceTitle: txtSnapshot.sourceTitle,
});
assert.equal(falseVlanEval.status, "NOT_FOUND");
assert.ok(
  falseVlanEval.unsupportedEntities && falseVlanEval.unsupportedEntities.includes("vlan"),
  "Must flag VLAN as unsupported entity",
);
pass("False-positive prevention: Claim asserting 5 VLAN trunking rejected strictly as NOT_FOUND");

// -----------------------------------------------------------------------------
// GATE CHECK 3: SEMANTIC RETRIEVER PLUGIN EXTENSION POINT
// -----------------------------------------------------------------------------
console.log("\n--- GATE CHECK 3: SEMANTIC RETRIEVER PLUGIN EXTENSION POINT ---");

let pluginCalled = false;
const mockSemanticPlugin = {
  name: "MockPgvectorSemanticReranker",
  async rerankChunks(query, chunks) {
    pluginCalled = true;
    // Reverse chunks order as test marker
    return [...chunks].reverse();
  },
};

const pluginRes = await retrieveSourceContext({
  sourceId: txtSnapshot.id,
  userId: TEACHER_1,
  query: "Konfigurasi parameter default gateway next-hop",
  semanticPlugin: mockSemanticPlugin,
});

assert.ok(pluginCalled, "Semantic plugin rerankChunks must be called");
assert.ok(pluginRes.retrievedChunks.length > 0);
pass("SemanticRetrieverPlugin interface correctly invoked via optional plugin extension hook");

// Fallback behavior when plugin throws
const failingPlugin = {
  name: "FailingSemanticPlugin",
  async rerankChunks() {
    throw new Error("Simulated embedding service network failure");
  },
};

const fallbackRes = await retrieveSourceContext({
  sourceId: txtSnapshot.id,
  userId: TEACHER_1,
  query: "Konfigurasi parameter default gateway next-hop",
  semanticPlugin: failingPlugin,
});
assert.ok(fallbackRes.retrievedChunks.length > 0, "Must fall back cleanly to lexical ranking if plugin fails");
pass("Plugin resilience: Retrieval safely falls back to lexical ranking if semantic plugin errors");

// -----------------------------------------------------------------------------
// GATE CHECK 4: EVIDENCE SNIPPET PRECISION & PROVENANCE
// -----------------------------------------------------------------------------
console.log("\n--- GATE CHECK 4: EVIDENCE SNIPPET PRECISION & PROVENANCE ---");

const evidenceEval = evaluateGroundingAgainstSource({
  claim: "Berapa tekanan kerja standar bahan bakar pada fuel rail?",
  sourceChunks: pdfSnapshot.chunks,
  sourceId: pdfSnapshot.id,
  sourceTitle: pdfSnapshot.sourceTitle,
});
const evidenceRef = buildEvidenceRef(pdfSnapshot.id, pdfSnapshot.sourceTitle, evidenceEval);

assert.equal(evidenceRef.status, "SUPPORTED");
assert.ok(evidenceRef.snippet && evidenceRef.snippet.includes("2.5 hingga 3.0 bar"));
assert.ok(evidenceRef.chunkId);
assert.equal(evidenceRef.sourceId, pdfSnapshot.id);
pass("Evidence provenance: Contains valid snippet, exact chunkId, sourceId, and SUPPORTED status");

// -----------------------------------------------------------------------------
// GATE CHECK 5: PARSER ERROR HANDLING & EDGE CASES
// -----------------------------------------------------------------------------
console.log("\n--- GATE CHECK 5: PARSER ERROR HANDLING & EDGE CASES ---");

// Corrupted binary input
assert.throws(
  () => extractDocxText(Buffer.from("RandomCorruptedBinaryStringContent")),
  (err) => err.code === AI_ERROR_CODES.SOURCE_PARSE_ERROR,
);
pass("Parser error handling: Corrupted DOCX archive rejected with SOURCE_PARSE_ERROR");

await assert.rejects(
  async () => extractPdfText(Buffer.from("InvalidPdfHeaderContentStream")),
  (err) => err.code === AI_ERROR_CODES.SOURCE_PARSE_ERROR,
);
pass("Parser error handling: Invalid PDF byte stream rejected with SOURCE_PARSE_ERROR");

await assert.rejects(
  async () => extractDocumentText({ buffer: Buffer.alloc(0), fileName: "empty.txt" }),
  (err) => err.code === AI_ERROR_CODES.SOURCE_EMPTY,
);
pass("Parser error handling: 0-byte document buffer rejected with SOURCE_EMPTY");

// -----------------------------------------------------------------------------
// GATE CHECK 6: SSRF SECURITY & PRIVATE IP BLOCKING
// -----------------------------------------------------------------------------
console.log("\n--- GATE CHECK 6: SSRF SECURITY & PRIVATE IP BLOCKING ---");

// Loopback & link-local
assert.equal(isPrivateOrReservedIp("127.0.0.1"), true);
assert.equal(isPrivateOrReservedIp("::1"), true);
assert.equal(isPrivateOrReservedIp("169.254.169.254"), true); // AWS / GCP metadata
assert.equal(isPrivateOrReservedIp("10.0.0.1"), true);
assert.equal(isPrivateOrReservedIp("192.168.1.1"), true);
assert.equal(isPrivateOrReservedIp("172.16.0.1"), true);

// Public IP
assert.equal(isPrivateOrReservedIp("8.8.8.8"), false);
assert.equal(isPrivateOrReservedIp("1.1.1.1"), false);

// Host safety validator
await assert.rejects(
  async () => validateHostSafety("localhost"),
  (err) => err.message.includes("Link internal/lokal"),
);

await assert.rejects(
  async () => validateHostSafety("169.254.169.254"),
  (err) => err.message.includes("Link internal/lokal"),
);
pass("SSRF security: Private, loopback, LAN, and cloud metadata IPs strictly blocked from source ingestion");

// -----------------------------------------------------------------------------
// GATE CHECK 7: MULTI-TENANT STRICT ISOLATION
// -----------------------------------------------------------------------------
console.log("\n--- GATE CHECK 7: MULTI-TENANT STRICT ISOLATION ---");

// Teacher 2 attempts to retrieve Teacher 1's snapshot
await assert.rejects(
  async () => {
    await retrieveSourceContext({
      sourceId: txtSnapshot.id,
      userId: TEACHER_2, // Different user
      query: "Parameter rute statis",
    });
  },
  (err) => {
    assert.equal(err.code, AI_ERROR_CODES.ROLE_FORBIDDEN);
    return true;
  },
);
pass("Multi-tenant isolation: Cross-teacher retrieval attempt strictly blocked with ROLE_FORBIDDEN");

// -----------------------------------------------------------------------------
// GATE CHECK 8: DETERMINISTIC RETRIEVAL STABILITY (10 ITERATIONS)
// -----------------------------------------------------------------------------
console.log("\n--- GATE CHECK 8: DETERMINISTIC RETRIEVAL STABILITY ---");

const baselineQuery = "Apa fungsi sensor Mass Air Flow MAF dan Throttle Position Sensor TPS pada mesin EFI?";
let baselineChunkIds = [];

for (let i = 1; i <= 10; i++) {
  const res = await retrieveSourceContext({
    sourceId: pdfSnapshot.id,
    userId: TEACHER_1,
    query: baselineQuery,
  });
  const currentIds = res.retrievedChunks.map((c) => c.chunkId);
  if (i === 1) {
    baselineChunkIds = currentIds;
  } else {
    assert.deepEqual(
      currentIds,
      baselineChunkIds,
      `Iteration ${i} produced inconsistent chunk ordering`,
    );
  }
}
pass("Deterministic stability: 10 repeated retrieval iterations yielded 100% identical chunk sequence");

console.log("================================================================================");
console.log(`  ALL ${passed} AI-1 FINAL GATE CHECKS PASSED! (0 FAILED)                     `);
console.log("================================================================================");
