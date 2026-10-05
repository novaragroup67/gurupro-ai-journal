#!/usr/bin/env node
/**
 * ==============================================================================
 * GURUPRO TEST SUITE: AI-CORE-RECOVERY-1
 * ==============================================================================
 *
 * Comprehensive 40-case test suite verifying:
 * - Document / eBook source topic inference and ingestion
 * - Anti-hallucination grounding gate preservation
 * - Semantic style selection and accessibility
 * - Authoritative approval state machine and generation authorization
 * - Dual-provider image router resilience and failover (Gemini <-> OpenAI)
 * - Strict fail-closed safety block invariant
 * - Durable illustration asset persistence and cryptographic verification
 * - Multi-tenant isolation and security boundaries
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { zipSync, strToU8 } from "fflate";

import {
  AI_ERROR_CODES,
  AiServiceError,
} from "../../src/lib/ai/error-taxonomy.ts";
import {
  cleanTopicTitle,
  isFilenameOrPlaceholder,
  deriveDocumentSuggestedTopic,
  extractDocxText,
  extractDocumentText,
} from "../../src/lib/ai/document-parser.ts";
import {
  evaluateGroundingAgainstSource,
  cleanClaimOrTopicText,
} from "../../src/lib/ai/grounding.ts";
import {
  ingestSource,
  getCachedSourceSnapshot,
  getPersistedSourceSnapshot,
  setCachedSourceSnapshot,
} from "../../src/lib/ai/source-ingestion.ts";
import {
  retrieveSourceContext,
} from "../../src/lib/ai/retriever.ts";
import {
  buildModulGroundingContext,
} from "../../src/lib/ai/modul-context-builder.ts";
import {
  createInitialPlan,
  applyOutlineEdits,
  applyStyleSelection,
  applyPlanApproval,
  applyPlanApprovalRevocation,
} from "../../src/lib/ai/generation-planning-service.ts";
import {
  createGenerationSpecification,
  ILLUSTRATION_STYLES_CATALOG,
  PRESENTATION_STYLES_CATALOG,
} from "../../src/lib/ai/generation-planning-contract.ts";
import {
  DualIllustrationRouter,
} from "../../src/lib/ai/providers/dual-illustration-router.ts";
import {
  setMockIllustrationProvider,
  resolveIllustrationGenerationProvider,
} from "../../src/lib/ai/providers/illustration-provider-factory.ts";
import {
  assertValidImageBinary,
} from "../../src/lib/ai/image-validator.ts";
import {
  computeSha256,
  buildIllustrationStoragePath,
  MemoryStorageDriver,
} from "../../src/lib/ai/illustration-storage-service.ts";

let passedCount = 0;
let failedCount = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  • ${name} ... ✓ PASS`);
    passedCount++;
  } catch (err) {
    console.error(`  • ${name} ... ✗ FAIL`);
    console.error(`    ${err.message}`);
    failedCount++;
  }
}

// Generate valid PNG buffer with minimum 650 bytes
function createValidPngBuffer(width = 1024, height = 1024, extraBytes = 650) {
  const header = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const ihdrLen = [0x00, 0x00, 0x00, 0x0d];
  const ihdrType = [0x49, 0x48, 0x44, 0x52];
  const wBytes = [(width >> 24) & 0xff, (width >> 16) & 0xff, (width >> 8) & 0xff, width & 0xff];
  const hBytes = [(height >> 24) & 0xff, (height >> 16) & 0xff, (height >> 8) & 0xff, height & 0xff];
  const ihdrData = [0x08, 0x02, 0x00, 0x00, 0x00];
  const crc = [0x00, 0x00, 0x00, 0x00];

  const full = [
    ...header,
    ...ihdrLen,
    ...ihdrType,
    ...wBytes,
    ...hBytes,
    ...ihdrData,
    ...crc,
  ];

  while (full.length < extraBytes) {
    full.push(0x5a);
  }

  return Buffer.from(full);
}

const VALID_PNG_BUFFER = createValidPngBuffer(1024, 1024, 650);
const VALID_BASE64_IMAGE = VALID_PNG_BUFFER.toString("base64");

// Helper to create mock docx buffer
function createMockDocx(text, title = "") {
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>${text}</w:t></w:r></w:p>
  </w:body>
</w:document>`;
  const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>${title}</dc:title>
</cp:coreProperties>`;

  const files = {
    "word/document.xml": strToU8(docXml),
    "[Content_Types].xml": strToU8("<Types></Types>"),
  };
  if (title) {
    files["docProps/core.xml"] = strToU8(coreXml);
  }
  return zipSync(files);
}

const SAMPLE_ILL_OUTLINE = {
  title: "Diagram Alur Percabangan",
  objective: "Visualisasi percabangan if-else",
  mainSubject: "Percabangan Python",
  supportingElements: ["Diagram alur", "Kondisi boolean"],
  environmentBackground: "Latar diagram bersih",
  composition: "Komposisi simetris",
  perspectiveView: "Eye-level",
  educationalFocus: "Struktur logika if-else",
};

const SAMPLE_PPT_OUTLINE = {
  title: "Slide Presentasi Python",
  objective: "Memahami dasar-dasar pemrograman python",
  targetAudience: "Siswa SMK Kelas 10",
  intendedSlideCount: 1,
  presentationStructure: "Pengenalan dan Sintaks",
  globalVisualDirection: "Clean modern layout",
  slides: [
    {
      id: "slide_1",
      slideOrder: 1,
      slideTitle: "Pengenalan Python",
      purpose: "Memperkenalkan bahasa python",
      keyPoints: ["Bahasa tingkat tinggi", "Sintaksis mudah dipahami"],
      visualDirection: "Logo python dan kode sederhana",
    },
  ],
};

console.log("\n================================================================================");
console.log("  GURUPRO TEST SUITE: AI-CORE-RECOVERY-1");
console.log("================================================================================\n");

async function runAllTests() {
  console.log("[SECTION 1: Document Parsing & Ingestion Topic Inference]");

  await test("1. cleanTopicTitle removes wiki suffixes and noise", () => {
    assert.strictEqual(
      cleanTopicTitle("Pemrograman Python - Wikipedia bahasa Indonesia, ensiklopedia bebas"),
      "Pemrograman Python"
    );
    assert.strictEqual(
      cleanTopicTitle("Sistem Basis Data | official website"),
      "Sistem Basis Data"
    );
  });

  await test("2. isFilenameOrPlaceholder identifies raw filenames and container keywords", () => {
    assert.strictEqual(isFilenameOrPlaceholder("e-book python.docx", "e-book python.docx"), true);
    assert.strictEqual(isFilenameOrPlaceholder("e-book python", "e-book python.docx"), true);
    assert.strictEqual(isFilenameOrPlaceholder("dokumen.pdf"), true);
    assert.strictEqual(isFilenameOrPlaceholder("materi pembelajaran"), true);
    assert.strictEqual(isFilenameOrPlaceholder("Dasar-Dasar Pemrograman Python", "e-book python.docx"), false);
  });

  await test("3. deriveDocumentSuggestedTopic resolves metadata title over filename", () => {
    const topic = deriveDocumentSuggestedTopic(
      "Isi buku tentang python pemrograman variabel fungsi.",
      "e-book python.docx",
      "Pengenalan Python Modern"
    );
    assert.strictEqual(topic, "Pengenalan Python Modern");
  });

  await test("4. deriveDocumentSuggestedTopic infers educational domain topic from content", () => {
    const topic = deriveDocumentSuggestedTopic(
      "Buku ini membahas bahasa pemrograman Python, variabel, loop, fungsi, sintaks dasar kode komputer.",
      "e-book python.docx"
    );
    assert.strictEqual(topic, "Dasar-Dasar Pemrograman Python");
  });

  await test("5. extractDocxText parses text and core.xml title accurately", () => {
    const docxBuf = createMockDocx(
      "Pembahasan sintaksis Python dan struktur data untuk modul ajar siswa SMK.",
      "Modul Ajar Pemrograman Python"
    );
    const parsed = extractDocxText(docxBuf);
    assert.ok(parsed.text.includes("sintaksis Python"));
    assert.strictEqual(parsed.title, "Modul Ajar Pemrograman Python");
  });

  await test("6. extractDocumentText returns derived suggestedTopic for DOCX file", async () => {
    const docxBuf = createMockDocx(
      "Panduan belajar python dasar untuk SMK kelas 10 RPL. Variabel, tipe data, perulangan loop for while sintaks dasar."
    );
    const res = await extractDocumentText({
      buffer: docxBuf,
      fileName: "e-book python.docx",
    });
    assert.strictEqual(res.format, "docx");
    assert.strictEqual(res.suggestedTopic, "Dasar-Dasar Pemrograman Python");
    assert.ok(res.wordCount > 5);
  });

  await test("7. ingestSource preserves suggested topic and avoids raw filename in snapshot", async () => {
    const docxBuf = createMockDocx(
      "Pembelajaran pemrograman bahasa Python meliputi variabel, fungsi, perulangan loop for while, tipe data, dan struktur data list dictionary tuple untuk siswa SMK kelas sepuluh."
    );
    const snap = await ingestSource({
      sourceType: "dokumen",
      documentBuffer: docxBuf,
      fileName: "e-book python.docx",
      userId: "teacher_test_1",
    });
    assert.notStrictEqual(snap.sourceTitle, "e-book python.docx");
    assert.strictEqual(snap.sourceTitle, "Dasar-Dasar Pemrograman Python");
    assert.ok(snap.chunks.length > 0);
  });

  await test("8. ingestSource preserves explicit teacher custom title if not placeholder", async () => {
    const docxBuf = createMockDocx(
      "Konten materi Python lanjutan fungsi rekursif dan kelas objek berorientasi objek dalam rekayasa perangkat lunak SMK."
    );
    const snap = await ingestSource({
      sourceType: "dokumen",
      documentBuffer: docxBuf,
      fileName: "e-book python.docx",
      title: "Rekursif dan OOP Python Khusus",
      userId: "teacher_test_1",
    });
    assert.strictEqual(snap.sourceTitle, "Rekursif dan OOP Python Khusus");
  });

  console.log("\n[SECTION 2: Anti-Hallucination Grounding & Evidence Evaluation]");

  await test("9. Grounding gate does not treat container words (ebook, docx) as missing entities", () => {
    const chunks = [
      {
        chunkId: "c1",
        title: "Dasar Python",
        content: "Bahasa pemrograman Python adalah bahasa tingkat tinggi dengan sintaksis jelas.",
        wordCount: 10,
        charCount: 80,
        index: 0,
      },
    ];
    const evaluation = evaluateGroundingAgainstSource({
      claim: "e-book python",
      sourceChunks: chunks,
      sourceId: "src_1",
    });
    assert.notStrictEqual(evaluation.status, "NOT_FOUND");
    assert.ok(evaluation.status === "SUPPORTED" || evaluation.status === "INFERRED");
  });

  await test("10. Grounding gate remains strictly fail-closed on truly unsupported domain entities", () => {
    const chunks = [
      {
        chunkId: "c1",
        title: "Dasar Python",
        content: "Bahasa pemrograman Python adalah bahasa tingkat tinggi.",
        wordCount: 8,
        charCount: 60,
        index: 0,
      },
    ];
    const evaluation = evaluateGroundingAgainstSource({
      claim: "Pemrograman Microcontroller Arduino ATMega328",
      sourceChunks: chunks,
      sourceId: "src_1",
    });
    assert.strictEqual(evaluation.status, "NOT_FOUND");
    assert.ok(evaluation.unsupportedEntities?.includes("atmega328") || evaluation.explanation.includes("tidak ditemukan"));
  });

  await test("11. Grounding gate verifies numbers strictly against source text", () => {
    const chunks = [
      {
        chunkId: "c1",
        title: "Versi",
        content: "Python 3 dirilis pertama kali pada tahun 2008.",
        wordCount: 8,
        charCount: 50,
        index: 0,
      },
    ];
    const evaluationPass = evaluateGroundingAgainstSource({
      claim: "Python tahun 2008",
      sourceChunks: chunks,
      sourceId: "src_1",
    });
    assert.strictEqual(evaluationPass.status, "SUPPORTED");

    const evaluationFail = evaluateGroundingAgainstSource({
      claim: "Python dirilis pada tahun 1999",
      sourceChunks: chunks,
      sourceId: "src_1",
    });
    assert.strictEqual(evaluationFail.status, "NOT_FOUND");
  });

  await test("12. Context builder supports enlarged budgets (16 chunks / 5000 words)", async () => {
    const dummyChunks = Array.from({ length: 20 }, (_, i) => ({
      chunkId: `c_${i}`,
      title: `Bab ${i + 1} Python`,
      content: `Pembahasan bab ${i + 1} materi teknis pemrograman python fungsi variabel loop ${i}.`,
      wordCount: 15,
      charCount: 90,
      index: i,
    }));
    const snap = {
      id: "src_large_1",
      userId: "teacher_1",
      sourceType: "dokumen",
      sourceTitle: "Buku Lengkap Python",
      contentType: "text/plain",
      contentHash: "hash_123",
      retrievedAt: new Date().toISOString(),
      normalizedContent: dummyChunks.map((c) => c.content).join("\n"),
      wordCount: 300,
      charCount: 1800,
      chunks: dummyChunks,
      metadata: {},
      ingestionStatus: "completed",
      createdAt: new Date().toISOString(),
    };
    setCachedSourceSnapshot(snap);

    const ctx = await buildModulGroundingContext(
      {
        topik: "Pemrograman Python",
        kelasId: "11111111-1111-4111-8111-111111111111",
        kelas: "X",
        mapel: "Informatika",
        fase: "E",
        targetPertemuan: 2,
        sumberTipe: "eBook / Dokumen",
        sourceSnapshotIds: ["src_large_1"],
      },
      {
        teacherId: "teacher_1",
        teacherRole: "guru",
        verificationStatus: "terverifikasi",
        teacherClasses: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            namaKelas: "X RPL 1",
            tingkat: "X",
            mapel: "Informatika",
            tahunAjaran: "2026/2027",
            guruId: "teacher_1",
          },
        ],
        availableSourceSnapshots: [snap],
      }
    );

    assert.ok(ctx.evidenceItems.length >= 10);
    assert.ok(ctx.sectionCoverage.topicMaterial.hasEvidence);
  });

  console.log("\n[SECTION 3: Generation Planning, Semantic Styles & Accessibility]");

  await test("13. Visual style catalog contains pedagogically validated illustration styles", () => {
    assert.ok(ILLUSTRATION_STYLES_CATALOG.length >= 7);
    const flatEdu = ILLUSTRATION_STYLES_CATALOG.find((s) => s.id === "style_ill_flat_edu");
    assert.ok(flatEdu);
    assert.ok(flatEdu.visualRules.length > 0);
  });

  await test("14. Presentation style catalog contains validated slide design presets", () => {
    assert.ok(PRESENTATION_STYLES_CATALOG.length >= 6);
    const modernMinimal = PRESENTATION_STYLES_CATALOG.find((s) => s.id === "style_ppt_modern_minimal");
    assert.ok(modernMinimal);
  });

  await test("15. Outline planning creates valid initial plan and version 1", () => {
    const { plan, initialVersion } = createInitialPlan(
      "teacher_1",
      "mod_1",
      "illustration",
      SAMPLE_ILL_OUTLINE,
      "style_ill_flat_edu"
    );
    assert.strictEqual(plan.currentVersion, 1);
    assert.strictEqual(plan.status, "ready");
    assert.strictEqual(initialVersion.versionNumber, 1);
    assert.strictEqual(initialVersion.isApproved, false);
  });

  await test("16. Selecting visual style updates plan style without bumping outline version", () => {
    const { plan } = createInitialPlan(
      "teacher_1",
      "mod_1",
      "illustration",
      SAMPLE_ILL_OUTLINE,
      "style_ill_flat_edu"
    );
    const updated = applyStyleSelection(plan, "style_ill_infographic");
    assert.strictEqual(updated.style.styleId, "style_ill_infographic");
    assert.strictEqual(updated.currentVersion, 1);
  });

  await test("17. Teacher approval locks plan, sets approvedVersion, and issues specification", () => {
    const { plan } = createInitialPlan(
      "teacher_1",
      "mod_1",
      "illustration",
      SAMPLE_ILL_OUTLINE,
      "style_ill_flat_edu"
    );
    const authContext = { userId: "teacher_1", role: "guru", isGuru: true, verificationStatus: "verified" };
    const { approvedPlan } = applyPlanApproval(plan, authContext);
    assert.strictEqual(approvedPlan.status, "approved");
    assert.strictEqual(approvedPlan.approvedVersion, 1);

    const spec = createGenerationSpecification(approvedPlan, authContext);
    assert.ok(spec);
    assert.strictEqual(spec.generationPlanId, approvedPlan.id);
    assert.strictEqual(spec.styleId, "style_ill_flat_edu");
  });

  await test("18. Editing outline on approved plan revokes approval and bumps version", () => {
    const { plan } = createInitialPlan(
      "teacher_1",
      "mod_1",
      "illustration",
      SAMPLE_ILL_OUTLINE,
      "style_ill_flat_edu"
    );
    const authContext = { userId: "teacher_1", role: "guru", isGuru: true, verificationStatus: "verified" };
    const { approvedPlan } = applyPlanApproval(plan, authContext);

    const { updatedPlan, newVersion } = applyOutlineEdits(
      approvedPlan,
      { ...SAMPLE_ILL_OUTLINE, title: "Diagram Alur Lanjutan" },
      "teacher_1",
      "Perubahan outline"
    );

    assert.strictEqual(updatedPlan.status, "ready");
    assert.strictEqual(updatedPlan.currentVersion, 2);
    assert.strictEqual(updatedPlan.approvedVersion, null);
    assert.strictEqual(newVersion.versionNumber, 2);
    assert.strictEqual(newVersion.isApproved, false);
  });

  await test("19. Changing style on approved plan revokes approval", () => {
    const { plan } = createInitialPlan(
      "teacher_1",
      "mod_1",
      "illustration",
      SAMPLE_ILL_OUTLINE,
      "style_ill_flat_edu"
    );
    const authContext = { userId: "teacher_1", role: "guru", isGuru: true, verificationStatus: "verified" };
    const { approvedPlan } = applyPlanApproval(plan, authContext);

    const styleChanged = applyStyleSelection(approvedPlan, "style_ill_tech_diagram");
    assert.strictEqual(styleChanged.status, "ready");
    assert.strictEqual(styleChanged.approvedVersion, null);
  });

  await test("20. Non-teacher role is rejected when approving plan", () => {
    const { plan } = createInitialPlan(
      "teacher_1",
      "mod_1",
      "illustration",
      SAMPLE_ILL_OUTLINE,
      "style_ill_flat_edu"
    );
    const studentContext = { userId: "student_1", role: "siswa", isGuru: false, verificationStatus: "unverified" };
    assert.throws(
      () => applyPlanApproval(plan, studentContext),
      /Hanya guru|ROLE_FORBIDDEN/i
    );
  });

  console.log("\n[SECTION 4: Dual-Provider Router & Resilient Failover]");

  await test("21. Dual router routes to primary provider on success", async () => {
    let primaryCalled = false;
    let fallbackCalled = false;

    const mockPrimary = {
      providerName: "gemini",
      validateRequest: async () => ({ valid: true }),
      generate: async (req) => {
        primaryCalled = true;
        return {
          generationId: "gen_pri_1",
          status: "succeeded",
          imageData: VALID_BASE64_IMAGE,
          mimeType: "image/png",
          width: 1024,
          height: 1024,
          byteSize: VALID_PNG_BUFFER.length,
          provider: "gemini",
          model: "gemini-3.1-flash-image",
          createdAt: new Date().toISOString(),
        };
      },
      normalizeResult: (o) => o,
    };

    const mockFallback = {
      providerName: "openai",
      validateRequest: async () => ({ valid: true }),
      generate: async () => {
        fallbackCalled = true;
        throw new Error("Should not be called");
      },
      normalizeResult: (o) => o,
    };

    const router = new DualIllustrationRouter({
      primaryProvider: mockPrimary,
      fallbackProvider: mockFallback,
    });

    const res = await router.generate({
      requestId: "req_1",
      generationPlanId: "plan_1",
      approvedOutlineVersion: 1,
      styleId: "style_ill_flat_edu",
      styleVersion: 1,
      targetType: "illustration",
      parameters: { aspectRatio: "1:1", width: 1024, height: 1024, quality: "standard", numberOfImages: 1, providerExtension: {} },
      textPolicy: { mustAppear: [], mayAppear: [], mustNotAppear: [], allowModelInventedText: false, textRenderStrategy: "clean_visual_only" },
      assembledPrompt: { systemPrompt: "S", styleDirectives: "D", subjectDescription: "P", compositionDirectives: "C", negativePrompt: "", fullPrompt: "F" },
      grounding: { subjectDiscipline: "Informatika", audienceLevel: "SMK" },
      metadata: {},
      createdAt: new Date().toISOString(),
    });

    assert.strictEqual(primaryCalled, true);
    assert.strictEqual(fallbackCalled, false);
    assert.strictEqual(res.status, "succeeded");
    assert.strictEqual(res.provider, "gemini");
  });

  await test("22. Dual router fails over to secondary on transient 429 rate limit", async () => {
    let primaryAttempts = 0;
    let fallbackAttempts = 0;

    const mockPrimary = {
      providerName: "gemini",
      validateRequest: async () => ({ valid: true }),
      generate: async () => {
        primaryAttempts++;
        throw new AiServiceError(AI_ERROR_CODES.AI_RATE_LIMIT, "429 Rate limit exceeded on Gemini.");
      },
      normalizeResult: (o) => o,
    };

    const mockFallback = {
      providerName: "openai",
      validateRequest: async () => ({ valid: true }),
      generate: async () => {
        fallbackAttempts++;
        return {
          generationId: "gen_fb_1",
          status: "succeeded",
          imageData: VALID_BASE64_IMAGE,
          mimeType: "image/png",
          width: 1024,
          height: 1024,
          byteSize: VALID_PNG_BUFFER.length,
          provider: "openai",
          model: "gpt-image-2",
          createdAt: new Date().toISOString(),
        };
      },
      normalizeResult: (o) => o,
    };

    const router = new DualIllustrationRouter({
      primaryProvider: mockPrimary,
      fallbackProvider: mockFallback,
    });

    const res = await router.generate({
      requestId: "req_2",
      generationPlanId: "plan_1",
      approvedOutlineVersion: 1,
      styleId: "style_ill_flat_edu",
      styleVersion: 1,
      targetType: "illustration",
      parameters: { aspectRatio: "1:1", width: 1024, height: 1024, quality: "standard", numberOfImages: 1, providerExtension: {} },
      textPolicy: { mustAppear: [], mayAppear: [], mustNotAppear: [], allowModelInventedText: false, textRenderStrategy: "clean_visual_only" },
      assembledPrompt: { systemPrompt: "S", styleDirectives: "D", subjectDescription: "P", compositionDirectives: "C", negativePrompt: "", fullPrompt: "F" },
      grounding: { subjectDiscipline: "Informatika", audienceLevel: "SMK" },
      metadata: {},
      createdAt: new Date().toISOString(),
    });

    assert.strictEqual(primaryAttempts, 1);
    assert.strictEqual(fallbackAttempts, 1);
    assert.strictEqual(res.status, "succeeded");
    assert.strictEqual(res.provider, "openai");
    assert.strictEqual(res.metadata?.failoverUsed, true);
  });

  await test("23. Dual router fails over to secondary on upstream 503 gateway outage", async () => {
    const mockPrimary = {
      providerName: "gemini",
      validateRequest: async () => ({ valid: true }),
      generate: async () => {
        throw new AiServiceError(AI_ERROR_CODES.AI_UPSTREAM_ERROR, "503 Service Unavailable: upstream model overloaded.");
      },
      normalizeResult: (o) => o,
    };

    const mockFallback = {
      providerName: "openai",
      validateRequest: async () => ({ valid: true }),
      generate: async () => ({
        generationId: "gen_fb_2",
        status: "succeeded",
        imageData: VALID_BASE64_IMAGE,
        mimeType: "image/png",
        width: 1024,
        height: 1024,
        byteSize: VALID_PNG_BUFFER.length,
        provider: "openai",
        model: "gpt-image-2",
        createdAt: new Date().toISOString(),
      }),
      normalizeResult: (o) => o,
    };

    const router = new DualIllustrationRouter({
      primaryProvider: mockPrimary,
      fallbackProvider: mockFallback,
    });

    const res = await router.generate({
      requestId: "req_3",
      generationPlanId: "plan_1",
      approvedOutlineVersion: 1,
      styleId: "style_ill_flat_edu",
      styleVersion: 1,
      targetType: "illustration",
      parameters: { aspectRatio: "1:1", width: 1024, height: 1024, quality: "standard", numberOfImages: 1, providerExtension: {} },
      textPolicy: { mustAppear: [], mayAppear: [], mustNotAppear: [], allowModelInventedText: false, textRenderStrategy: "clean_visual_only" },
      assembledPrompt: { systemPrompt: "S", styleDirectives: "D", subjectDescription: "P", compositionDirectives: "C", negativePrompt: "", fullPrompt: "F" },
      grounding: { subjectDiscipline: "Informatika", audienceLevel: "SMK" },
      metadata: {},
      createdAt: new Date().toISOString(),
    });

    assert.strictEqual(res.status, "succeeded");
    assert.strictEqual(res.provider, "openai");
  });

  await test("24. STRICT INVARIANT: Safety block NEVER fails over and fails closed immediately", async () => {
    let fallbackCalled = false;

    const mockPrimary = {
      providerName: "gemini",
      validateRequest: async () => ({ valid: true }),
      generate: async () => {
        throw new AiServiceError(AI_ERROR_CODES.AI_SAFETY_BLOCKED, "Prompt contains prohibited safety content.");
      },
      normalizeResult: (o) => o,
    };

    const mockFallback = {
      providerName: "openai",
      validateRequest: async () => ({ valid: true }),
      generate: async () => {
        fallbackCalled = true;
        return { generationId: "bad", status: "succeeded" };
      },
      normalizeResult: (o) => o,
    };

    const router = new DualIllustrationRouter({
      primaryProvider: mockPrimary,
      fallbackProvider: mockFallback,
    });

    await assert.rejects(
      async () => {
        await router.generate({
          requestId: "req_safety",
          generationPlanId: "plan_1",
          approvedOutlineVersion: 1,
          styleId: "style_ill_flat_edu",
          styleVersion: 1,
          targetType: "illustration",
          parameters: { aspectRatio: "1:1", width: 1024, height: 1024, quality: "standard", numberOfImages: 1, providerExtension: {} },
          textPolicy: { mustAppear: [], mayAppear: [], mustNotAppear: [], allowModelInventedText: false, textRenderStrategy: "clean_visual_only" },
          assembledPrompt: { systemPrompt: "S", styleDirectives: "D", subjectDescription: "P", compositionDirectives: "C", negativePrompt: "", fullPrompt: "F" },
          grounding: { subjectDiscipline: "Informatika", audienceLevel: "SMK" },
          metadata: {},
          createdAt: new Date().toISOString(),
        });
      },
      (err) => {
        assert.strictEqual(err.code, AI_ERROR_CODES.AI_SAFETY_BLOCKED);
        return true;
      }
    );

    assert.strictEqual(fallbackCalled, false, "Fallback must NOT be called on safety blocks!");
  });

  await test("25. Both providers failing surfaces compound error cleanly", async () => {
    const mockPrimary = {
      providerName: "gemini",
      validateRequest: async () => ({ valid: true }),
      generate: async () => {
        throw new AiServiceError(AI_ERROR_CODES.AI_RATE_LIMIT, "Primary rate limit.");
      },
      normalizeResult: (o) => o,
    };

    const mockFallback = {
      providerName: "openai",
      validateRequest: async () => ({ valid: true }),
      generate: async () => {
        throw new AiServiceError(AI_ERROR_CODES.AI_UPSTREAM_ERROR, "Fallback quota exhausted.");
      },
      normalizeResult: (o) => o,
    };

    const router = new DualIllustrationRouter({
      primaryProvider: mockPrimary,
      fallbackProvider: mockFallback,
    });

    await assert.rejects(async () => {
      await router.generate({
        requestId: "req_both_fail",
        generationPlanId: "plan_1",
        approvedOutlineVersion: 1,
        styleId: "style_ill_flat_edu",
        styleVersion: 1,
        targetType: "illustration",
        parameters: { aspectRatio: "1:1", width: 1024, height: 1024, quality: "standard", numberOfImages: 1, providerExtension: {} },
        textPolicy: { mustAppear: [], mayAppear: [], mustNotAppear: [], allowModelInventedText: false, textRenderStrategy: "clean_visual_only" },
        assembledPrompt: { systemPrompt: "S", styleDirectives: "D", subjectDescription: "P", compositionDirectives: "C", negativePrompt: "", fullPrompt: "F" },
        grounding: { subjectDiscipline: "Informatika", audienceLevel: "SMK" },
        metadata: {},
        createdAt: new Date().toISOString(),
      });
    });
  });

  console.log("\n[SECTION 5: Binary Validation, Storage & Durable Assets]");

  await test("26. assertValidImageBinary approves valid PNG payload", () => {
    const info = assertValidImageBinary(VALID_PNG_BUFFER);
    assert.strictEqual(info.mimeType, "image/png");
    assert.strictEqual(info.byteSize, VALID_PNG_BUFFER.length);
  });

  await test("27. assertValidImageBinary strictly rejects mock geometric SVG as production binary", () => {
    const mockSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100"/></svg>');
    assert.throws(
      () => assertValidImageBinary(mockSvg),
      /mock SVG|raster/i
    );
  });

  await test("28. assertValidImageBinary rejects corrupted truncated payloads", () => {
    const truncated = new Uint8Array([0x89, 0x50, 0x4e]);
    assert.throws(
      () => assertValidImageBinary(truncated),
      /terlalu kecil|minimum 512/i
    );
  });

  await test("29. computeSha256 produces exact cryptographic hex digest", () => {
    const expected = crypto.createHash("sha256").update(VALID_PNG_BUFFER).digest("hex");
    const actual = computeSha256(VALID_PNG_BUFFER);
    assert.strictEqual(actual, expected);
  });

  await test("30. buildIllustrationStoragePath enforces canonical user-scoped naming convention", () => {
    const path = buildIllustrationStoragePath("user_guru_1", "modul_123", "ast_ill_abc", "image/png");
    assert.strictEqual(path, "illustrations/user_guru_1/modul_123/ast_ill_abc.png");
  });

  await test("31. Storage driver uploads and downloads durable binary accurately", async () => {
    const driver = new MemoryStorageDriver();
    const storagePath = "illustrations/test/mod/test.png";
    const res = await driver.upload(storagePath, VALID_PNG_BUFFER, "image/png");
    assert.strictEqual(res.storagePath, storagePath);
    assert.strictEqual(res.byteSize, VALID_PNG_BUFFER.length);

    const downloaded = await driver.download(storagePath);
    assert.strictEqual(Buffer.compare(Buffer.from(downloaded), Buffer.from(VALID_PNG_BUFFER)), 0);
  });

  console.log("\n[SECTION 6: Security, Tenant Boundaries & End-to-End Integrity]");

  await test("32. Cross-tenant source retrieval is blocked with ROLE_FORBIDDEN", async () => {
    const snap = {
      id: "src_tenant_1",
      userId: "teacher_A",
      sourceType: "text",
      sourceTitle: "Materi Guru A",
      contentType: "text/plain",
      contentHash: "hash_A",
      retrievedAt: new Date().toISOString(),
      normalizedContent: "Konten privat milik guru A.",
      wordCount: 5,
      charCount: 28,
      chunks: [{ chunkId: "c_A", title: "T", content: "Konten privat", wordCount: 2, charCount: 13, index: 0 }],
      metadata: {},
      ingestionStatus: "completed",
      createdAt: new Date().toISOString(),
    };
    setCachedSourceSnapshot(snap);

    await assert.rejects(
      async () => {
        await retrieveSourceContext({
          sourceId: "src_tenant_1",
          userId: "teacher_B", // Different teacher
        });
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.ROLE_FORBIDDEN
    );
  });

  await test("33. Provider factory resolves DualIllustrationRouter when credentials present", () => {
    // Clear mock
    setMockIllustrationProvider(null);
    process.env.GEMINI_API_KEY = "test_gemini_key";
    process.env.OPENAI_API_KEY = "test_openai_key";

    const provider = resolveIllustrationGenerationProvider();
    assert.strictEqual(provider.providerName, "dual-router");
  });

  await test("34. Provider factory fails closed with PROVIDER_UNAVAILABLE when keys absent", () => {
    setMockIllustrationProvider(null);
    const origG = process.env.GEMINI_API_KEY;
    const origO = process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      assert.throws(
        () => resolveIllustrationGenerationProvider(),
        (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.PROVIDER_UNAVAILABLE
      );
    } finally {
      if (origG) process.env.GEMINI_API_KEY = origG;
      if (origO) process.env.OPENAI_API_KEY = origO;
    }
  });

  await test("35. Mock provider override takes priority for test environment", () => {
    const mock = {
      providerName: "mock_test",
      validateRequest: async () => ({ valid: true }),
      generate: async () => ({ status: "succeeded" }),
      normalizeResult: (o) => o,
    };
    setMockIllustrationProvider(mock);
    const resolved = resolveIllustrationGenerationProvider();
    assert.strictEqual(resolved.providerName, "mock_test");
    setMockIllustrationProvider(null); // clean up
  });

  await test("36. Retrieval handles zero-score queries safely without crashing", async () => {
    const snap = {
      id: "src_zero_1",
      userId: "teacher_test",
      sourceType: "text",
      sourceTitle: "Materi Basis Data",
      contentType: "text/plain",
      contentHash: "hash_zd",
      retrievedAt: new Date().toISOString(),
      normalizedContent: "Basis data relasional menggunakan SQL dan normalisasi 3NF.",
      wordCount: 8,
      charCount: 60,
      chunks: [{ chunkId: "c_zd", title: "SQL", content: "Basis data relasional menggunakan SQL.", wordCount: 5, charCount: 39, index: 0 }],
      metadata: {},
      ingestionStatus: "completed",
      createdAt: new Date().toISOString(),
    };
    setCachedSourceSnapshot(snap);

    const res = await retrieveSourceContext({
      sourceId: "src_zero_1",
      userId: "teacher_test",
      query: "astronomi galaksi andromeda bintang teleskop",
    });

    assert.strictEqual(res.hasRelevantMatch, false);
    assert.strictEqual(res.retrievedChunks.length, 1); // returns reference chunk safely
  });

  await test("37. High word count document is properly parsed and bounded", async () => {
    const largeContent = "Kata materi python pemrograman variabel loop fungsi. ".repeat(400); // ~2800 words
    const res = await extractDocumentText({
      buffer: Buffer.from(largeContent, "utf-8"),
      fileName: "dokumen_panjang.txt",
    });
    assert.ok(res.wordCount > 2000);
    assert.strictEqual(res.suggestedTopic, "Dasar-Dasar Pemrograman Python");
  });

  await test("38. Corrupt DOCX throws SOURCE_PARSE_ERROR safely without hallucination", () => {
    const garbageBytes = Buffer.from("Bukan berkas zip docx yang sah sama sekali.");
    assert.throws(
      () => extractDocxText(garbageBytes),
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.SOURCE_PARSE_ERROR
    );
  });

  await test("39. Full End-to-End flow: DOCX Ingestion -> Plan -> Style -> Approval -> Generation -> Asset Storage", async () => {
    // 1. Ingest DOCX
    const docxBuf = createMockDocx(
      "Pembahasan materi dasar algoritma dan pemrograman Python untuk siswa SMK. Meliputi variabel, percabangan if, dan perulangan while for dalam pembelajaran praktikum komputer.",
      "Algoritma dan Pemrograman Python"
    );
    const snap = await ingestSource({
      sourceType: "dokumen",
      documentBuffer: docxBuf,
      fileName: "e-book python.docx",
      userId: "teacher_e2e",
    });
    assert.strictEqual(snap.sourceTitle, "Algoritma dan Pemrograman Python");

    // 2. Create Plan
    const { plan } = createInitialPlan(
      "teacher_e2e",
      "mod_e2e",
      "illustration",
      SAMPLE_ILL_OUTLINE,
      "style_ill_flat_edu"
    );

    // 3. Select Style
    const styledPlan = applyStyleSelection(plan, "style_ill_infographic");
    assert.strictEqual(styledPlan.style.styleId, "style_ill_infographic");

    // 4. Approve Plan
    const authContext = { userId: "teacher_e2e", role: "guru", isGuru: true, verificationStatus: "verified" };
    const { approvedPlan } = applyPlanApproval(styledPlan, authContext);
    assert.strictEqual(approvedPlan.status, "approved");
    const spec = createGenerationSpecification(approvedPlan, authContext);
    assert.ok(spec);

    // 5. Dual Router Generation
    const mockPrimary = {
      providerName: "gemini",
      validateRequest: async () => ({ valid: true }),
      generate: async () => ({
        generationId: "gen_e2e_1",
        status: "succeeded",
        imageData: VALID_BASE64_IMAGE,
        mimeType: "image/png",
        width: 1024,
        height: 1024,
        byteSize: VALID_PNG_BUFFER.length,
        provider: "gemini",
        model: "gemini-3.1-flash-image",
        createdAt: new Date().toISOString(),
      }),
      normalizeResult: (o) => o,
    };
    const router = new DualIllustrationRouter({ primaryProvider: mockPrimary });
    const genResult = await router.generate({
      requestId: "req_e2e",
      generationPlanId: approvedPlan.id,
      approvedOutlineVersion: approvedPlan.currentVersion,
      styleId: approvedPlan.style.styleId,
      styleVersion: 1,
      targetType: "illustration",
      parameters: { aspectRatio: "1:1", width: 1024, height: 1024, quality: "standard", numberOfImages: 1, providerExtension: {} },
      textPolicy: { mustAppear: [], mayAppear: [], mustNotAppear: [], allowModelInventedText: false, textRenderStrategy: "clean_visual_only" },
      assembledPrompt: { systemPrompt: "S", styleDirectives: "D", subjectDescription: "P", compositionDirectives: "C", negativePrompt: "", fullPrompt: "F" },
      grounding: { subjectDiscipline: "Informatika", audienceLevel: "SMK" },
      metadata: {},
      createdAt: new Date().toISOString(),
    });
    assert.strictEqual(genResult.status, "succeeded");

    // 6. Asset Storage & SHA-256
    const driver = new MemoryStorageDriver();
    const assetId = "ast_ill_e2e_verified";
    const storagePath = buildIllustrationStoragePath("teacher_e2e", "mod_e2e", assetId, "image/png");
    const uploadRes = await driver.upload(storagePath, VALID_PNG_BUFFER, "image/png");
    const sha = computeSha256(VALID_PNG_BUFFER);

    assert.ok(uploadRes.publicUrl);
    assert.strictEqual(uploadRes.byteSize, VALID_PNG_BUFFER.length);
    assert.ok(sha.length === 64);
  });

  await test("40. Presentation generation planning and style selection parity preserved", () => {
    const { plan } = createInitialPlan(
      "teacher_ppt",
      "mod_ppt",
      "presentation",
      SAMPLE_PPT_OUTLINE,
      "style_ppt_modern_minimal"
    );
    assert.strictEqual(plan.targetType, "presentation");
    assert.strictEqual(plan.style.styleId, "style_ppt_modern_minimal");

    const updated = applyStyleSelection(plan, "style_ppt_edu_classroom");
    assert.strictEqual(updated.style.styleId, "style_ppt_edu_classroom");

    const authContext = { userId: "teacher_ppt", role: "guru", isGuru: true, verificationStatus: "verified" };
    const { approvedPlan } = applyPlanApproval(updated, authContext);
    assert.strictEqual(approvedPlan.status, "approved");
    assert.strictEqual(approvedPlan.approvedVersion, 1);
  });

  console.log("\n================================================================================");
  console.log(`  AI-CORE-RECOVERY TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log("================================================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runAllTests().catch((e) => {
  console.error("Unhandled test runner exception:", e);
  process.exit(1);
});
