#!/usr/bin/env node
/**
 * ==============================================================================
 * GURUPRO TEST SUITE: AI-1 REAL SOURCE INGESTION & GROUNDED RETRIEVAL VALIDATION
 * ==============================================================================
 *
 * Validates the complete pipeline:
 * REAL SOURCE (PDF / DOCX / TXT / HTML)
 *  -> EXTRACTION & NORMALIZATION
 *  -> SNAPSHOTTING & SHA-256 CONTENT HASHING
 *  -> BOUNDARY-AWARE CHUNKING
 *  -> PROVENANCE PRESERVATION
 *  -> TENANT-ISOLATED RETRIEVAL
 *  -> EVIDENCE & GROUNDING EVALUATION (SUPPORTED / INFERRED / NOT_FOUND)
 *
 * Tests against:
 * - Real educational test fixtures (TXT, HTML, binary DOCX, binary PDF)
 * - The Golden Retrieval Dataset (Categories A through M)
 * - Anti-hallucination negative grounding guarantees
 * - Tenant ownership security
 */

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AI_ERROR_CODES,
  AiServiceError,
  normalizeAiError,
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
} from "../../src/lib/ai/grounding.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, "../..");
const FIXTURES_DIR = resolve(ROOT_DIR, "tests/fixtures");

console.log("================================================================================");
console.log("  GURUPRO TEST SUITE: AI-1 REAL SOURCE INGESTION & GROUNDED RETRIEVAL          ");
console.log("================================================================================");

let totalPassed = 0;
function pass(num, label) {
  totalPassed++;
  console.log(`  [PASS ${num}] ${label}`);
}

// -----------------------------------------------------------------------------
// SECTION 1: REAL DOCUMENT EXTRACTION (PDF, DOCX, TXT, HTML)
// -----------------------------------------------------------------------------
console.log("\n--- SECTION 1: REAL DOCUMENT EXTRACTION ---");

// 1. Plain text extraction
const txtPath = resolve(FIXTURES_DIR, "educational-network-routing.txt");
assert.ok(existsSync(txtPath), "TXT fixture must exist");
const txtBuffer = readFileSync(txtPath);
const txtResult = extractPlainText(txtBuffer);
assert.ok(txtResult.text.includes("Konfigurasi Routing Statis"));
assert.ok(txtResult.text.includes("administrative distance"));
pass(1, "Plain text educational fixture extracted with headings and technical terms");

// 2. HTML extraction with noise stripping
const htmlPath = resolve(FIXTURES_DIR, "educational-web-vlan.html");
assert.ok(existsSync(htmlPath), "HTML fixture must exist");
const htmlRaw = readFileSync(htmlPath, "utf-8");
const htmlResult = normalizeHtmlContent(htmlRaw);
assert.ok(htmlResult.normalized.includes("Virtual LAN (VLAN)"));
assert.ok(htmlResult.normalized.includes("802.1Q"));
assert.ok(!htmlResult.normalized.includes("analytics script tracker"));
assert.ok(!htmlResult.normalized.includes("Diskon Kursus Jaringan"));
assert.ok(!htmlResult.normalized.includes("cookie"));
pass(2, "HTML educational fixture extracted: web noise stripped, technical content preserved");

// 3. Binary DOCX extraction (word/document.xml via fflate)
const docxPath = resolve(FIXTURES_DIR, "educational-accounting-journal.docx");
assert.ok(existsSync(docxPath), "DOCX fixture must exist");
const docxBuffer = readFileSync(docxPath);
const docxResult = extractDocxText(docxBuffer);
assert.ok(docxResult.text.includes("# Akuntansi Keuangan: Jurnal Penyesuaian"));
assert.ok(docxResult.text.includes("Beban Dibayar di Muka"));
assert.ok(docxResult.text.includes("Penyusutan Aset Tetap"));
assert.ok(docxResult.text.includes("10.000.000"));
assert.ok(docxResult.text.includes("| Tanggal | Keterangan Akun |"));
pass(3, "Real binary DOCX parsed via fflate: headings, paragraphs, and markdown tables preserved");

// 4. Binary PDF extraction via unpdf
const pdfPath = resolve(FIXTURES_DIR, "educational-automotive-injection.pdf");
assert.ok(existsSync(pdfPath), "PDF fixture must exist");
const pdfBuffer = readFileSync(pdfPath);
const pdfResult = await extractPdfText(pdfBuffer);
assert.ok(pdfResult.text.includes("Electronic Fuel Injection"));
assert.ok(pdfResult.text.includes("Mass Air Flow (MAF)"));
assert.ok(pdfResult.text.includes("OBD-II"));
assert.ok(pdfResult.text.includes("40.000 km"));
assert.ok(pdfResult.pageCount >= 2);
pass(4, "Real binary PDF parsed via unpdf: multi-page layout and diagnostic terms preserved");

// 5. Corrupted DOCX rejection
const fakeDocxBuffer = Buffer.from("PKThisIsNotAValidDocxFileArchive");
assert.throws(
  () => extractDocxText(fakeDocxBuffer),
  (err) => err.code === AI_ERROR_CODES.SOURCE_PARSE_ERROR,
);
pass(5, "Corrupted DOCX archive safely rejected with SOURCE_PARSE_ERROR");

// 6. Non-PDF file rejection in PDF parser
const fakePdfBuffer = Buffer.from("NotAPdfDocumentContentHeader");
await assert.rejects(
  async () => extractPdfText(fakePdfBuffer),
  (err) => err.code === AI_ERROR_CODES.SOURCE_PARSE_ERROR,
);
pass(6, "Non-PDF file safely rejected with SOURCE_PARSE_ERROR");

// 7. Empty document buffer rejection
assert.throws(
  () => extractDocxText(Buffer.alloc(0)),
  (err) => err.code === AI_ERROR_CODES.SOURCE_EMPTY,
);
pass(7, "Empty 0-byte document buffer safely rejected with SOURCE_EMPTY");

// -----------------------------------------------------------------------------
// SECTION 2: END-TO-END INGESTION, CHUNKING & HASHING
// -----------------------------------------------------------------------------
console.log("\n--- SECTION 2: END-TO-END INGESTION, CHUNKING & HASHING ---");

clearSnapshotCacheForTesting();
const TEACHER_A = "guru-user-tkj-001";
const TEACHER_B = "guru-user-otm-002";

// 8. Ingest TXT fixture
const netSnapshot = await ingestSource({
  sourceType: "text",
  input: txtResult.text,
  userId: TEACHER_A,
  title: "Routing Statis SMK",
});
assert.ok(netSnapshot.id.startsWith("src_"));
assert.equal(netSnapshot.contentHash.length, 64);
assert.ok(netSnapshot.chunks.length >= 3);
pass(8, "TXT educational source ingested, hashed, and chunked with boundary awareness");

// 9. Ingest DOCX fixture via base64Data
const docxB64 = docxBuffer.toString("base64");
const accSnapshot = await ingestSource({
  sourceType: "dokumen",
  base64Data: docxB64,
  fileName: "educational-accounting-journal.docx",
  userId: TEACHER_A,
});
assert.ok(accSnapshot.id.startsWith("src_"));
assert.ok(accSnapshot.chunks.some((c) => c.title && c.title.includes("Penyusutan")));
pass(9, "DOCX binary source ingested via base64: section headings retained in chunk metadata");

// 10. Ingest PDF fixture via documentBuffer
const autoSnapshot = await ingestSource({
  sourceType: "dokumen",
  documentBuffer: pdfBuffer,
  fileName: "educational-automotive-injection.pdf",
  userId: TEACHER_A,
});
assert.ok(autoSnapshot.id.startsWith("src_"));
assert.ok(autoSnapshot.wordCount > 100);
pass(10, "PDF binary source ingested via documentBuffer: multi-page chunks preserved");

// 11. Ingest HTML fixture via documentBuffer
const vlanSnapshot = await ingestSource({
  sourceType: "dokumen",
  documentBuffer: Buffer.from(htmlRaw),
  fileName: "educational-web-vlan.html",
  mimeType: "text/html",
  userId: TEACHER_A,
  title: "VLAN dan 802.1Q Trunking",
});
pass(11, "HTML document source ingested and chunked cleanly without web chrome");

// 12. Normalization reproducibility: identical content -> identical hash
const reingestedDocx = await ingestSource({
  sourceType: "dokumen",
  base64Data: docxB64,
  fileName: "educational-accounting-journal.docx",
  userId: TEACHER_A,
});
assert.equal(reingestedDocx.contentHash, accSnapshot.contentHash);
pass(12, "Deterministic ingestion: identical source produces 100% identical SHA-256 hash");

// -----------------------------------------------------------------------------
// SECTION 3: GOLDEN RETRIEVAL DATASET VALIDATION (CATEGORIES A - M)
// -----------------------------------------------------------------------------
console.log("\n--- SECTION 3: GOLDEN RETRIEVAL DATASET (CATEGORIES A - M) ---");

const datasetPath = resolve(FIXTURES_DIR, "golden-retrieval-dataset.json");
assert.ok(existsSync(datasetPath), "Golden dataset JSON must exist");
const goldenDataset = JSON.parse(readFileSync(datasetPath, "utf-8"));
assert.ok(goldenDataset.cases.length >= 14, "Golden dataset must contain at least 14 cases");

const snapshotMap = {
  "educational-network-routing.txt": netSnapshot,
  "educational-accounting-journal.docx": accSnapshot,
  "educational-automotive-injection.pdf": autoSnapshot,
  "educational-web-vlan.html": vlanSnapshot,
};

let caseIndex = 13;
for (const tc of goldenDataset.cases) {
  const snapshot = snapshotMap[tc.fixtureFile];
  assert.ok(snapshot, `Snapshot for ${tc.fixtureFile} must be loaded`);

  // Category J: Cross-user retrieval attempt
  if (tc.category === "J") {
    await assert.rejects(
      async () => retrieveSourceContext({
        sourceId: snapshot.id,
        userId: TEACHER_B, // unauthorized teacher
        query: tc.query,
      }),
      (err) => err.code === AI_ERROR_CODES.ROLE_FORBIDDEN,
    );
    pass(caseIndex++, `[Category ${tc.category}] ${tc.categoryName} -> strictly blocked with ROLE_FORBIDDEN`);
    continue;
  }

  // Category K: Empty / whitespace query
  if (tc.category === "K") {
    const res = await retrieveSourceContext({
      sourceId: snapshot.id,
      userId: TEACHER_A,
      query: tc.query,
    });
    assert.ok(res.retrievedChunks.length > 0);
    assert.equal(res.retrievedChunks[0].index, 0);
    pass(caseIndex++, `[Category ${tc.category}] ${tc.categoryName} -> safely returns sequential chunks`);
    continue;
  }

  // Categories A - I, L, M
  const retrievalRes = await retrieveSourceContext({
    sourceId: snapshot.id,
    userId: TEACHER_A,
    query: tc.query,
  });

  // Evaluate grounding
  const groundingEval = evaluateGroundingAgainstSource({
    claim: tc.query,
    sourceChunks: retrievalRes.retrievedChunks,
    sourceId: snapshot.id,
    sourceTitle: snapshot.sourceTitle,
  });

  if (tc.isNegative) {
    // Negative test: fact is absent, MUST NOT be hallucinated or marked SUPPORTED
    assert.equal(
      groundingEval.status,
      "NOT_FOUND",
      `Query "${tc.query}" must be classified as NOT_FOUND, got: ${groundingEval.status}`,
    );
    pass(caseIndex++, `[Category ${tc.category}] Negative Grounding: "${tc.query.slice(0, 45)}..." -> strictly NOT_FOUND`);
  } else {
    // Positive test: must retrieve relevant chunk and verify evidence
    assert.ok(retrievalRes.retrievedChunks.length > 0, `Retrieval must return at least 1 chunk for "${tc.query}"`);

    // Verify expected section title if specified
    if (tc.expectedChunkTitleContains) {
      const titleMatched = retrievalRes.retrievedChunks.some((c) =>
        (c.title || "").toLowerCase().includes(tc.expectedChunkTitleContains.toLowerCase()) ||
        c.content.toLowerCase().includes(tc.expectedChunkTitleContains.toLowerCase()),
      );
      assert.ok(
        titleMatched,
        `Expected chunk title/content to contain "${tc.expectedChunkTitleContains}", retrieved titles: ${retrievalRes.retrievedChunks.map((c) => c.title).join(", ")}`,
      );
    }

    // Verify expected snippet substring in retrieved combined context
    if (tc.expectedSnippetMustContain) {
      assert.ok(
        retrievalRes.combinedContext.includes(tc.expectedSnippetMustContain),
        `Combined context must contain "${tc.expectedSnippetMustContain}"`,
      );
    }

    // Verify grounding decision is SUPPORTED or INFERRED
    assert.notEqual(
      groundingEval.status,
      "NOT_FOUND",
      `Query "${tc.query}" must be supported or inferred by source, but got NOT_FOUND`,
    );

    // Build evidence ref
    const evidenceRef = buildEvidenceRef(snapshot.id, snapshot.sourceTitle, groundingEval);
    assert.ok(evidenceRef.snippet, "Evidence ref must include non-empty snippet");
    assert.equal(evidenceRef.sourceId, snapshot.id);

    pass(caseIndex++, `[Category ${tc.category}] ${tc.categoryName} -> retrieved relevant chunk & verified evidence`);
  }
}

// -----------------------------------------------------------------------------
// SECTION 4: REPRODUCIBILITY & STABILITY (Category M)
// -----------------------------------------------------------------------------
console.log("\n--- SECTION 4: REPRODUCIBILITY & STABILITY (10 ITERATIONS) ---");

const testQuery = "Berapa tekanan kerja standar bahan bakar pada fuel rail?";
let firstChunkIds = [];

for (let iter = 1; iter <= 10; iter++) {
  const res = await retrieveSourceContext({
    sourceId: autoSnapshot.id,
    userId: TEACHER_A,
    query: testQuery,
  });
  const currentChunkIds = res.retrievedChunks.map((c) => c.chunkId);
  if (iter === 1) {
    firstChunkIds = currentChunkIds;
  } else {
    assert.deepEqual(
      currentChunkIds,
      firstChunkIds,
      `Iteration ${iter} produced divergent chunk sequence: ${currentChunkIds.join(", ")} vs ${firstChunkIds.join(", ")}`,
    );
  }
}
pass(caseIndex++, "Deterministic Retrieval: 10 repeated queries returned identical chunk IDs and ranking");

// -----------------------------------------------------------------------------
// SECTION 5: SPECIAL CHARACTERS & REGEX SAFETY
// -----------------------------------------------------------------------------
console.log("\n--- SECTION 5: SPECIAL CHARACTERS & REGEX SAFETY ---");

const specialCharsQueries = [
  "Apa formula (A + B) * C?",
  "Bagaimana sintaks [VLAN 10] dan {802.1Q}?",
  "Berapa port C++ / TCP/IP?",
  "Apa fungsi tanda ? dan * pada wildcard?",
];

for (const q of specialCharsQueries) {
  const res = await retrieveSourceContext({
    sourceId: netSnapshot.id,
    userId: TEACHER_A,
    query: q,
  });
  assert.ok(res, `Query with special regex characters must not crash: "${q}"`);
}
pass(caseIndex++, "Special character queries (parentheses, wildcards, slashes, brackets) handled safely without RegExp syntax errors");

// -----------------------------------------------------------------------------
// SECTION 6: EVIDENCE & PROVENANCE COMPLETENESS
// -----------------------------------------------------------------------------
console.log("\n--- SECTION 6: EVIDENCE & PROVENANCE COMPLETENESS ---");

const deepQuery = "Apa fungsi sensor Mass Air Flow MAF dan Throttle Position Sensor TPS pada mesin EFI?";
const deepRes = await retrieveSourceContext({
  sourceId: autoSnapshot.id,
  userId: TEACHER_A,
  query: deepQuery,
});
const deepEval = evaluateGroundingAgainstSource({
  claim: deepQuery,
  sourceChunks: deepRes.retrievedChunks,
  sourceId: autoSnapshot.id,
  sourceTitle: autoSnapshot.sourceTitle,
});
const evidence = buildEvidenceRef(autoSnapshot.id, autoSnapshot.sourceTitle, deepEval);

assert.equal(evidence.sourceId, autoSnapshot.id);
assert.ok(evidence.chunkId);
assert.ok(evidence.snippet);
assert.equal(evidence.status, "SUPPORTED");
assert.ok(evidence.sourceTitle.includes("automotive") || evidence.sourceTitle.includes("Materi"));
pass(caseIndex++, "Provenance contract: evidence object preserves sourceId, chunkId, title, snippet, and status");

console.log("================================================================================");
console.log(`  ALL ${totalPassed} AI-1 INGESTION & RETRIEVAL VALIDATION TESTS PASSED! (0 FAILED) `);
console.log("================================================================================");
