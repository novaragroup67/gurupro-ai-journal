#!/usr/bin/env node
/**
 * ==============================================================================
 * GURUPRO TEST SUITE: PPT-1B REAL AI PRESENTATION CONTENT GENERATION ENGINE
 * ==============================================================================
 *
 * Verifies:
 * 1. Schema & Canonical Contract Validation (24 block types, 12 pedagogical types, packages)
 * 2. Precondition & Multi-Tenant Authorization Gate (teacher auth, owner match, approval freshness, target type)
 * 3. Grounding & Evidence Serialization (Modul Ajar context, exact values, formula preservation)
 * 4. Layer 1 Deterministic Content Validation (slide count, continuous 1..N order, slide IDs, block types)
 * 5. Layer 2 Grounding & Exact-Value Validation (number preservation, no invented evidence IDs)
 * 6. Layer 3 Semantic Quality Evaluator & Bounded Revision (PASS, REVISE, REJECT, max 1 retry)
 * 7. Engine Concurrency, In-Flight Lock & Idempotency (generationKey hashing, cache resolver, force fresh)
 * 8. Server Functions & Isolated Persistence (executeGenerate, executeGet, executeList, fallback map)
 * 9. Strict Non-Generation Invariant (zero .pptx files on disk, zero VIS-1B calls, zero fake PPTX)
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  AI_ERROR_CODES,
  AiServiceError,
} from "../../src/lib/ai/error-taxonomy.ts";
import {
  PRESENTATION_STYLES_CATALOG,
  getStyleById,
} from "../../src/lib/ai/generation-planning-contract.ts";
import {
  createInitialPlan,
  applyOutlineEdits,
  applyStyleSelection,
  applyPlanApproval,
  generateInitialPresentationOutline,
} from "../../src/lib/ai/generation-planning-service.ts";
import {
  PresentationContentBlockTypeSchema,
  SlidePedagogicalTypeSchema,
  PresentationSlideContentSchema,
  PresentationContentPackageSchema,
  validatePresentationContentPackage,
  computePresentationGenerationKey,
} from "../../src/lib/ai/presentation-generation-contract.ts";
import {
  buildPresentationGenerationRequest,
} from "../../src/lib/ai/presentation-request-builder.ts";
import {
  validatePresentationGenerationPreconditions,
  serializeSlideGroundedEvidence,
  performDeterministicContentValidation,
  performGroundingAndExactValueValidation,
  evaluatePresentationContentSemantics,
  generatePresentationContent,
} from "../../src/lib/ai/presentation-generator.ts";
import {
  executePreparePresentationGenerationRequest,
  executeGeneratePresentationContent,
  executeGetPresentationGenerationResult,
  executeListPresentationGenerationResults,
  fallbackPresentationResults,
} from "../../src/lib/presentation-generation.functions.ts";
import { fallbackTestPlans } from "../../src/lib/illustration-generation.functions.ts";

let totalTests = 0;
let passedTests = 0;

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ [TEST ${totalTests}] ${name}`);
  } catch (err) {
    console.error(`  ✗ [TEST ${totalTests}] ${name}`);
    console.error(`    Error: ${err.message}`);
    throw err;
  }
}

console.log("\n==============================================================================");
console.log("TESTING PPT-1B: REAL AI PRESENTATION CONTENT GENERATION ENGINE");
console.log("==============================================================================\n");

// Helper fixtures
const TEACHER_AUTH = {
  userId: "teacher_user_001",
  role: "guru",
  isGuru: true,
  profile: { role: "guru", full_name: "Budi Santoso, S.Pd." },
};
const OTHER_TEACHER_AUTH = {
  userId: "teacher_user_999",
  role: "guru",
  isGuru: true,
  profile: { role: "guru", full_name: "Siti Aminah, M.Pd." },
};
const STUDENT_AUTH = {
  userId: "student_user_001",
  role: "siswa",
  isGuru: false,
  profile: { role: "siswa", full_name: "Ahmad Siswa" },
};

const mockModul = {
  id: "modul_bio_101",
  judul: "Fotosintesis dan Metabolisme Sel Tumbuhan",
  fase: "Fase E (Kelas 10 SMA)",
  mataPelajaran: "Biologi",
  ringkasan: "Modul tentang proses konversi energi cahaya matahari menjadi energi kimia dalam kloroplas.",
  sections: [
    {
      id: "sec_pengantar",
      judul: "Pengantar & Reaksi Keseluruhan",
      isi: "Fotosintesis adalah proses anabolisme yang menghasilkan glukosa dan oksigen.",
      poin: ["Persamaan kimia fotosintesis", "Peran klorofil"],
    },
    {
      id: "sec_reaksi_terang",
      judul: "Tahapan Reaksi Terang di Tilakoid",
      isi: "Terjadi fotolisis air dan pembentukan ATP serta NADPH.",
      poin: ["Fotosistem II dan I", "Fotofosforilasi"],
    },
    {
      id: "sec_siklus_calvin",
      judul: "Siklus Calvin (Reaksi Gelap) di Stroma",
      isi: "Fiksasi karbon dioksida oleh RuBisCO menghasilkan gula.",
      poin: ["Fiksasi CO2", "Reduksi PGA", "Regenerasi RuBP"],
    },
  ],
};

function createApprovedPresentationPlanFixture(overrides = {}) {
  const outline = overrides.outline || generateInitialPresentationOutline(mockModul);
  const styleId = overrides.styleId || "style_ppt_edu_classroom";
  const ownerId = overrides.ownerId || TEACHER_AUTH.userId;
  const moduleId = overrides.moduleId || mockModul.id;

  const initial = createInitialPlan(ownerId, moduleId, "presentation", outline, styleId);
  const { approvedPlan } = applyPlanApproval(initial.plan, TEACHER_AUTH);
  return { ...approvedPlan, ...overrides };
}

async function getFixture(planOverrides = {}, requestParams = {}) {
  const plan = createApprovedPresentationPlanFixture(planOverrides);
  const request = await buildPresentationGenerationRequest(plan, TEACHER_AUTH, { parameters: requestParams });
  return { plan, request };
}

function createSampleValidContentPackage(request, overrides = {}) {
  const genKey = computePresentationGenerationKey({
    generationPlanId: request.generationPlanId,
    approvedOutlineVersion: request.approvedOutlineVersion,
    styleVersion: request.styleVersion,
    parameters: request.parameters,
  });

  return {
    presentationId: `pres_${Date.now()}`,
    generationRequestId: request.requestId,
    generationPlanId: request.generationPlanId,
    moduleId: request.moduleId,
    title: request.approvedOutline.title,
    subtitle: request.approvedOutline.targetAudience,
    learningObjectives: [request.approvedOutline.objective],
    targetAudience: request.approvedOutline.targetAudience,
    styleId: request.styleId,
    styleVersion: request.styleVersion,
    parameters: request.parameters,
    slides: request.slidePlan.map((s) => ({
      slideId: s.id,
      order: s.slideOrder,
      title: s.slideTitle,
      pedagogicalType: s.pedagogicalType,
      purpose: s.purpose,
      contentBlocks: [
        {
          id: `blk_${s.slideOrder}_1`,
          type: "paragraph",
          content: `Penjelasan mendalam materi ${s.slideTitle}. Proses ini sangat vital dalam biologi sel.`,
          title: "Penjelasan Konsep",
          evidenceIds: [],
        },
        {
          id: `blk_${s.slideOrder}_2`,
          type: "bullet_list",
          content: "Poin-poin konsep penting yang wajib dipahami siswa.",
          title: "Poin Utama",
          evidenceIds: [],
        },
      ],
      keyPoints: s.keyPoints && s.keyPoints.length > 0 ? s.keyPoints : ["Poin kunci materi"],
      visualDirection: s.visualDirection || "Tata letak dua kolom bersih akademis",
      referencedAssetIds: [],
      requiresGeneratedIllustration: false,
      speakerNotes: "Guru menerangkan materi ini secara interaktif dan mengajak siswa berdiskusi.",
      sourceReferences: request.sourceReferences || [],
      evidenceReferences: s.evidenceReferences || [],
    })),
    provenance: {
      moduleId: request.moduleId,
      planId: request.generationPlanId,
      requestId: request.requestId,
      ownerId: request.created_by,
      sourceReferences: request.sourceReferences || [],
      evidenceReferences: request.evidenceReferences || [],
    },
    generationMetadata: {
      promptVersion: "presentation_content_generator_grounded_v1",
      schemaVersion: "1.0.0",
      provider: "mock-ai",
      model: "mock-model",
      latencyMs: 120,
      retryCount: 0,
      generatorVersion: "v1",
      generationKey: genKey,
    },
    validationMetadata: {
      deterministicValid: true,
      exactValuesValid: true,
      semanticDecision: "PASS",
      findings: [],
    },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ==============================================================================
// SUITE 1: SCHEMA & CONTRACT VALIDATION
// ==============================================================================
console.log("--- Suite 1: Schema & Canonical Contract Validation ---");

await runAsyncTest("PresentationContentBlockTypeSchema validates canonical block types", async () => {
  const canonicalTypes = [
    "text", "paragraph", "key_value", "bullet_list", "numbered_list",
    "quote", "definition", "example", "process", "comparison",
    "comparison_column", "table", "diagram", "diagram_placeholder",
    "code_snippet", "stat_metric", "timeline_step", "formula_block",
    "reflection_prompt", "activity_instruction", "callout", "image",
    "summary", "key_stat",
  ];
  for (const t of canonicalTypes) {
    const res = PresentationContentBlockTypeSchema.safeParse(t);
    assert.equal(res.success, true, `Expected valid block type: ${t}`);
  }
  const invalidRes = PresentationContentBlockTypeSchema.safeParse("unsupported_random_block");
  assert.equal(invalidRes.success, false);
});

await runAsyncTest("SlidePedagogicalTypeSchema accepts 12 pedagogical types", async () => {
  const validTypes = [
    "introduction", "learning_objective", "concept_explanation",
    "example", "process", "application", "case_study", "comparison",
    "activity", "exercise", "reflection", "summary",
  ];
  for (const t of validTypes) {
    const res = SlidePedagogicalTypeSchema.safeParse(t);
    assert.equal(res.success, true, `Pedagogical type ${t} must be valid`);
  }
});

await runAsyncTest("PresentationSlideContentSchema validates structured slide content", async () => {
  const slide = {
    slideId: "sl_1",
    order: 1,
    title: "Pengantar Fotosintesis",
    pedagogicalType: "concept_explanation",
    purpose: "Menjelaskan konsep dasar fotosintesis",
    contentBlocks: [
      { id: "b1", type: "paragraph", content: "Fotosintesis adalah proses anabolisme..." },
      { id: "b2", type: "bullet_list", content: "Reaksi terang dan reaksi gelap" },
    ],
    keyPoints: ["Reaksi terang", "Reaksi gelap"],
    visualDirection: "Diagram reaksi terang kloroplas",
    referencedAssetIds: [],
    requiresGeneratedIllustration: false,
    speakerNotes: "Jelaskan definisi fotosintesis kepada siswa",
    sourceReferences: [],
    evidenceReferences: [],
  };
  const res = PresentationSlideContentSchema.safeParse(slide);
  assert.equal(res.success, true);
});

await runAsyncTest("PresentationContentPackageSchema validates complete content package", async () => {
  const { request } = await getFixture();
  const pkg = createSampleValidContentPackage(request);

  const res = PresentationContentPackageSchema.safeParse(pkg);
  assert.equal(res.success, true);
  const validated = validatePresentationContentPackage(pkg);
  assert.equal(validated.presentationId, pkg.presentationId);
});

await runAsyncTest("validatePresentationContentPackage rejects invalid package with missing title", async () => {
  const { request } = await getFixture();
  const pkg = createSampleValidContentPackage(request, { title: "" });

  assert.throws(() => {
    validatePresentationContentPackage(pkg);
  }, /Validasi paket konten presentasi gagal/);
});

await runAsyncTest("computePresentationGenerationKey produces deterministic key", async () => {
  const { request: req1 } = await getFixture({}, { contentDensity: "balanced" });

  const key1 = computePresentationGenerationKey({
    generationPlanId: req1.generationPlanId,
    approvedOutlineVersion: req1.approvedOutlineVersion,
    styleVersion: req1.styleVersion,
    parameters: req1.parameters,
  });
  const key2 = computePresentationGenerationKey({
    generationPlanId: req1.generationPlanId,
    approvedOutlineVersion: req1.approvedOutlineVersion,
    styleVersion: req1.styleVersion,
    parameters: req1.parameters,
  });

  assert.equal(key1, key2);
  assert.ok(key1.startsWith("ppt1b:"));
});

await runAsyncTest("computePresentationGenerationKey varies when outline version or parameters differ", async () => {
  const { request: req1 } = await getFixture({}, { contentDensity: "balanced" });

  const key1 = computePresentationGenerationKey({
    generationPlanId: req1.generationPlanId,
    approvedOutlineVersion: req1.approvedOutlineVersion,
    styleVersion: req1.styleVersion,
    parameters: { ...req1.parameters, contentDensity: "balanced" },
  });
  const key2 = computePresentationGenerationKey({
    generationPlanId: req1.generationPlanId,
    approvedOutlineVersion: req1.approvedOutlineVersion,
    styleVersion: req1.styleVersion,
    parameters: { ...req1.parameters, contentDensity: "detailed" },
  });

  assert.notEqual(key1, key2);
});

await runAsyncTest("computePresentationGenerationKey varies when style version differs", async () => {
  const { request: req1 } = await getFixture();

  const key1 = computePresentationGenerationKey({
    generationPlanId: req1.generationPlanId,
    approvedOutlineVersion: req1.approvedOutlineVersion,
    styleVersion: 1,
    parameters: req1.parameters,
  });
  const key2 = computePresentationGenerationKey({
    generationPlanId: req1.generationPlanId,
    approvedOutlineVersion: req1.approvedOutlineVersion,
    styleVersion: 2,
    parameters: req1.parameters,
  });

  assert.notEqual(key1, key2);
});

await runAsyncTest("computePresentationGenerationKey varies when language or speaker notes parameters differ", async () => {
  const { request: req1 } = await getFixture();

  const key1 = computePresentationGenerationKey({
    generationPlanId: req1.generationPlanId,
    approvedOutlineVersion: req1.approvedOutlineVersion,
    styleVersion: 1,
    parameters: { ...req1.parameters, language: "id", includeSpeakerNotes: true },
  });
  const key2 = computePresentationGenerationKey({
    generationPlanId: req1.generationPlanId,
    approvedOutlineVersion: req1.approvedOutlineVersion,
    styleVersion: 1,
    parameters: { ...req1.parameters, language: "en", includeSpeakerNotes: false },
  });

  assert.notEqual(key1, key2);
});

// ==============================================================================
// SUITE 2: PRECONDITIONS & MULTI-TENANT AUTHORIZATION GATE
// ==============================================================================
console.log("\n--- Suite 2: Preconditions & Multi-Tenant Authorization Gate ---");

await runAsyncTest("validatePresentationGenerationPreconditions passes for verified teacher owner", async () => {
  const { plan, request } = await getFixture();

  assert.doesNotThrow(() => {
    validatePresentationGenerationPreconditions(plan, request, TEACHER_AUTH);
  });
});

await runAsyncTest("validatePresentationGenerationPreconditions fails for unauthenticated user", async () => {
  const { plan, request } = await getFixture();

  assert.throws(() => {
    validatePresentationGenerationPreconditions(plan, request, { userId: "" });
  }, /Sesi guru tidak valid/i);
});

await runAsyncTest("validatePresentationGenerationPreconditions fails for student role (RBAC)", async () => {
  const { plan, request } = await getFixture();

  assert.throws(() => {
    validatePresentationGenerationPreconditions(plan, request, STUDENT_AUTH);
  }, /guru terverifikasi/i);
});

await runAsyncTest("validatePresentationGenerationPreconditions fails for non-owner teacher", async () => {
  const { plan, request } = await getFixture();

  assert.throws(() => {
    validatePresentationGenerationPreconditions(plan, request, OTHER_TEACHER_AUTH);
  }, /bukan pemilik sah/i);
});

await runAsyncTest("validatePresentationGenerationPreconditions fails for unapproved plan", async () => {
  const { plan: basePlan, request } = await getFixture();
  const draftPlan = { ...basePlan, status: "draft" };

  assert.throws(() => {
    validatePresentationGenerationPreconditions(draftPlan, request, TEACHER_AUTH);
  }, /Rencana presentasi belum disetujui/i);
});

await runAsyncTest("validatePresentationGenerationPreconditions fails for stale approval version", async () => {
  const { plan: basePlan, request } = await getFixture();
  const stalePlan = { ...basePlan, currentVersion: 3, approvedVersion: 2 };

  assert.throws(() => {
    validatePresentationGenerationPreconditions(stalePlan, request, TEACHER_AUTH);
  }, /Persetujuan presentasi telah usang/i);
});

await runAsyncTest("validatePresentationGenerationPreconditions fails for wrong target type (illustration)", async () => {
  const { plan: basePlan, request } = await getFixture();
  const illPlan = { ...basePlan, targetType: "illustration" };

  assert.throws(() => {
    validatePresentationGenerationPreconditions(illPlan, request, TEACHER_AUTH);
  }, /Target rencana bukan presentasi/i);
});

await runAsyncTest("validatePresentationGenerationPreconditions fails when styleId does not match plan", async () => {
  const { plan, request } = await getFixture();
  const mismatchedRequest = { ...request, styleId: "different_style_id" };

  assert.throws(() => {
    validatePresentationGenerationPreconditions(plan, mismatchedRequest, TEACHER_AUTH);
  }, /Gaya visual presentasi yang disetujui tidak cocok/i);
});

// ==============================================================================
// SUITE 3: GROUNDING & EVIDENCE SERIALIZATION
// ==============================================================================
console.log("\n--- Suite 3: Grounding & Evidence Serialization ---");

await runAsyncTest("serializeSlideGroundedEvidence packages curriculum and slide focus", async () => {
  const { request } = await getFixture();

  const serialized = serializeSlideGroundedEvidence(request);
  assert.ok(serialized.includes(`Modul ID: ${request.moduleId}`));
  assert.ok(serialized.includes(`Judul Presentasi: ${request.approvedOutline.title}`));
  assert.ok(serialized.includes(`Tujuan Pembelajaran: ${request.approvedOutline.objective}`));
  assert.ok(serialized.includes(`Perincian Fokus Slide dari Guru:`));
});

await runAsyncTest("serializeSlideGroundedEvidence preserves evidence references and slide purpose", async () => {
  const { request } = await getFixture();

  const serialized = serializeSlideGroundedEvidence(request);
  assert.ok(serialized.includes(request.slidePlan[0].slideTitle));
  assert.ok(serialized.includes(request.slidePlan[0].purpose));
});

await runAsyncTest("performGroundingAndExactValueValidation passes when valid evidence references are preserved", async () => {
  const { request } = await getFixture();
  const pkg = createSampleValidContentPackage(request);

  const res = performGroundingAndExactValueValidation(pkg, request);
  assert.equal(res.valid, true);
  assert.equal(res.errors.length, 0);
});

await runAsyncTest("performGroundingAndExactValueValidation flags invented evidence IDs", async () => {
  const { request } = await getFixture();
  const pkg = createSampleValidContentPackage(request);

  pkg.slides[0].evidenceReferences.push("EV_9999");

  const res = performGroundingAndExactValueValidation(pkg, request);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes("EV_9999")));
});

await runAsyncTest("provenance metadata links accurately to source module and plan", async () => {
  const { plan, request } = await getFixture();
  const pkg = createSampleValidContentPackage(request);

  assert.equal(pkg.provenance.moduleId, plan.moduleId);
  assert.equal(pkg.provenance.planId, plan.id);
  assert.equal(pkg.provenance.ownerId, plan.ownerId);
});

// ==============================================================================
// SUITE 4: LAYER 1 DETERMINISTIC CONTENT VALIDATION
// ==============================================================================
console.log("\n--- Suite 4: Layer 1 Deterministic Content Validation ---");

await runAsyncTest("performDeterministicContentValidation passes for complete valid package", async () => {
  const { request } = await getFixture();
  const pkg = createSampleValidContentPackage(request);

  const res = performDeterministicContentValidation(pkg, request);
  assert.equal(res.valid, true);
  assert.equal(res.errors.length, 0);
});

await runAsyncTest("performDeterministicContentValidation rejects slide count mismatch", async () => {
  const { request } = await getFixture();
  const pkg = createSampleValidContentPackage(request);

  pkg.slides.pop();

  const res = performDeterministicContentValidation(pkg, request);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes("Jumlah slide")));
});

await runAsyncTest("performDeterministicContentValidation rejects non-contiguous slide order", async () => {
  const { request } = await getFixture();
  const pkg = createSampleValidContentPackage(request);

  if (pkg.slides.length > 2) {
    pkg.slides[1].order = 99;
  }

  const res = performDeterministicContentValidation(pkg, request);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes("tidak berurutan")));
});

await runAsyncTest("performDeterministicContentValidation rejects mismatched slide IDs", async () => {
  const { request } = await getFixture();
  const pkg = createSampleValidContentPackage(request);

  pkg.slides[0].slideId = "wrong_unrecognized_slide_id";

  const res = performDeterministicContentValidation(pkg, request);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes("tidak terdaftar di outline")));
});

await runAsyncTest("performDeterministicContentValidation rejects non-canonical block type", async () => {
  const { request } = await getFixture();
  const pkg = createSampleValidContentPackage(request);

  pkg.slides[0].contentBlocks[0].type = "magic_unsupported_box";

  const res = performDeterministicContentValidation(pkg, request);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes("tipe tidak dikenal")));
});

await runAsyncTest("performDeterministicContentValidation rejects empty block content", async () => {
  const { request } = await getFixture();
  const pkg = createSampleValidContentPackage(request);

  pkg.slides[0].contentBlocks[0].content = "";

  const res = performDeterministicContentValidation(pkg, request);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes("memiliki konten kosong")));
});

await runAsyncTest("performDeterministicContentValidation rejects missing visual direction", async () => {
  const { request } = await getFixture();
  const pkg = createSampleValidContentPackage(request);

  pkg.slides[0].visualDirection = "";

  const res = performDeterministicContentValidation(pkg, request);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes("tidak memiliki arah visual")));
});

await runAsyncTest("performDeterministicContentValidation passes with diverse block types (table, stat_metric, code_snippet, formula_block)", async () => {
  const { request } = await getFixture();
  const pkg = createSampleValidContentPackage(request);

  pkg.slides[0].contentBlocks.push(
    { id: "b_table", type: "table", content: "Tabel reaksi terang vs gelap", metadata: { headers: ["Tahap", "Lokasi"], rows: [["Terang", "Tilakoid"], ["Gelap", "Stroma"]] } },
    { id: "b_stat", type: "stat_metric", content: "Persentase efisiensi kuantum", metadata: { value: "34%", label: "Efisiensi" } },
    { id: "b_code", type: "code_snippet", content: "CO2 + H2O -> C6H12O6", title: "Model Reaksi" },
    { id: "b_formula", type: "formula_block", content: "6CO2 + 6H2O -> C6H12O6 + 6O2" }
  );

  const res = performDeterministicContentValidation(pkg, request);
  assert.equal(res.valid, true);
  assert.equal(res.errors.length, 0);
});

await runAsyncTest("performDeterministicContentValidation passes with custom slide key takeaways", async () => {
  const { request } = await getFixture();
  const pkg = createSampleValidContentPackage(request);

  pkg.slides[0].keyPoints = [
    "Reaksi fotokimia mengubah energi foton",
    "Elektron tereksitasi dari klorofil a",
    "Produksi ekuivalen pereduksi NADPH",
  ];

  const res = performDeterministicContentValidation(pkg, request);
  assert.equal(res.valid, true);
  assert.equal(res.errors.length, 0);
});

// ==============================================================================
// SUITE 5: LAYER 3 SEMANTIC QUALITY EVALUATOR & BOUNDED REVISION
// ==============================================================================
console.log("\n--- Suite 5: Layer 3 Semantic Quality Evaluator & Bounded Revision ---");

await runAsyncTest("evaluatePresentationContentSemantics returns PASS for coherent package", async () => {
  const { request } = await getFixture();
  const pkg = createSampleValidContentPackage(request);
  const evidence = serializeSlideGroundedEvidence(request);

  const evalResult = await evaluatePresentationContentSemantics(pkg, request, evidence, {
    qualityEvaluatorCall: async () => JSON.stringify({
      decision: "PASS",
      outlineAlignment: "aligned",
      factualGrounding: "grounded",
      exactValuesPreserved: true,
      styleCompliance: "compliant",
      findings: [],
    }),
  });

  assert.equal(evalResult.decision, "PASS");
  assert.equal(evalResult.outlineAlignment, "aligned");
  assert.equal(evalResult.findings.length, 0);
});

await runAsyncTest("evaluatePresentationContentSemantics handles non-JSON evaluator response gracefully with fallback", async () => {
  const { request } = await getFixture();
  const pkg = createSampleValidContentPackage(request);
  const evidence = serializeSlideGroundedEvidence(request);

  const evalResult = await evaluatePresentationContentSemantics(pkg, request, evidence, {
    qualityEvaluatorCall: async () => "Non-JSON response from corrupted network or provider",
  });

  assert.ok(["PASS", "REVISE", "REJECT"].includes(evalResult.decision));
});

await runAsyncTest("evaluatePresentationContentSemantics returns REVISE for density findings", async () => {
  const { request } = await getFixture();
  const pkg = createSampleValidContentPackage(request);
  const evidence = serializeSlideGroundedEvidence(request);

  const evalResult = await evaluatePresentationContentSemantics(pkg, request, evidence, {
    qualityEvaluatorCall: async () => JSON.stringify({
      decision: "REVISE",
      outlineAlignment: "partially_aligned",
      factualGrounding: "grounded",
      exactValuesPreserved: true,
      styleCompliance: "compliant",
      findings: [
        {
          code: "DENSITY_OVERFLOW",
          severity: "warning",
          category: "pedagogical",
          description: "Slide 2 terlalu padat",
          slideOrder: 2,
          recommendation: "Pecah poin menjadi lebih ringkas",
        },
      ],
    }),
  });

  assert.equal(evalResult.decision, "REVISE");
  assert.equal(evalResult.findings.length, 1);
});

await runAsyncTest("evaluatePresentationContentSemantics returns REJECT for misaligned content", async () => {
  const { request } = await getFixture();
  const pkg = createSampleValidContentPackage(request);
  const evidence = serializeSlideGroundedEvidence(request);

  const evalResult = await evaluatePresentationContentSemantics(pkg, request, evidence, {
    qualityEvaluatorCall: async () => JSON.stringify({
      decision: "REJECT",
      outlineAlignment: "misaligned",
      factualGrounding: "unsupported",
      exactValuesPreserved: false,
      styleCompliance: "non_compliant",
      findings: [{ code: "TOTAL_MISALIGN", severity: "critical", category: "outline", description: "Melenceng total" }],
    }),
  });

  assert.equal(evalResult.decision, "REJECT");
});

await runAsyncTest("generatePresentationContent executes max 1 semantic revision attempt on REVISE", async () => {
  const { plan, request } = await getFixture();
  const pkg = createSampleValidContentPackage(request);

  let generatorCallCount = 0;
  let evaluatorCallCount = 0;

  const result = await generatePresentationContent(
    request,
    plan,
    TEACHER_AUTH,
    {
      forceRetry: true,
      mockProviderCall: async () => {
        generatorCallCount++;
        return JSON.stringify(pkg);
      },
      qualityEvaluatorCall: async () => {
        evaluatorCallCount++;
        if (evaluatorCallCount === 1) {
          return JSON.stringify({
            decision: "REVISE",
            outlineAlignment: "partially_aligned",
            factualGrounding: "grounded",
            exactValuesPreserved: true,
            styleCompliance: "compliant",
            findings: [{ code: "TOO_WORDY", severity: "warning", category: "pedagogical", description: "Terlalu panjang" }],
          });
        }
        return JSON.stringify({
          decision: "PASS",
          outlineAlignment: "aligned",
          factualGrounding: "grounded",
          exactValuesPreserved: true,
          styleCompliance: "compliant",
          findings: [],
        });
      },
    }
  );

  assert.equal(result.status, "success");
  assert.equal(result.retryCount, 1);
  assert.equal(result.semanticDecision, "PASS");
  assert.equal(generatorCallCount, 2, "Generator should have been called twice (initial + 1 revision)");
  assert.equal(evaluatorCallCount, 2, "Evaluator should have evaluated twice");
});

await runAsyncTest("generatePresentationContent fails gracefully if revision still fails after 1 retry", async () => {
  const { plan, request } = await getFixture();
  const pkg = createSampleValidContentPackage(request);

  let generatorCallCount = 0;

  const result = await generatePresentationContent(
    request,
    plan,
    TEACHER_AUTH,
    {
      forceRetry: true,
      mockProviderCall: async () => {
        generatorCallCount++;
        return JSON.stringify(pkg);
      },
      qualityEvaluatorCall: async () => JSON.stringify({
        decision: "REVISE",
        outlineAlignment: "partially_aligned",
        factualGrounding: "grounded",
        exactValuesPreserved: true,
        styleCompliance: "compliant",
        findings: [{ code: "QUALITY_PERSISTENT_FAIL", severity: "critical", category: "pedagogical", description: "Masih gagal" }],
      }),
    }
  );

  assert.equal(result.status, "error");
  assert.equal(result.error?.code, AI_ERROR_CODES.PRESENTATION_REVISION_FAILED);
  assert.equal(generatorCallCount, 2, "Must enforce strictly bounded retry: exactly 2 attempts total");
});

// ==============================================================================
// SUITE 6: ENGINE CONCURRENCY, IN-FLIGHT LOCK & IDEMPOTENCY
// ==============================================================================
console.log("\n--- Suite 6: Engine Concurrency, In-Flight Lock & Idempotency ---");

await runAsyncTest("generatePresentationContent serves existing cached result idempotently", async () => {
  const { plan, request } = await getFixture();
  const pkg = createSampleValidContentPackage(request);

  let aiCalled = false;
  const result = await generatePresentationContent(
    request,
    plan,
    TEACHER_AUTH,
    {
      existingResultResolver: async () => pkg,
      mockProviderCall: async () => {
        aiCalled = true;
        return JSON.stringify(pkg);
      },
    }
  );

  assert.equal(result.status, "success");
  assert.equal(result.retryCount, 0);
  assert.equal(aiCalled, false, "Must not invoke AI when cached result is resolved");
});

await runAsyncTest("generatePresentationContent bypasses cache when forceRetry is true", async () => {
  const { plan, request } = await getFixture();
  const pkg = createSampleValidContentPackage(request);

  let aiCalled = false;
  const result = await generatePresentationContent(
    request,
    plan,
    TEACHER_AUTH,
    {
      forceRetry: true,
      existingResultResolver: async () => pkg,
      mockProviderCall: async () => {
        aiCalled = true;
        return JSON.stringify(pkg);
      },
      qualityEvaluatorCall: async () => JSON.stringify({
        decision: "PASS",
        outlineAlignment: "aligned",
        factualGrounding: "grounded",
        exactValuesPreserved: true,
        styleCompliance: "compliant",
        findings: [],
      }),
    }
  );

  assert.equal(result.status, "success");
  assert.equal(aiCalled, true, "Must invoke AI when forceRetry is true");
});

await runAsyncTest("generatePresentationContent rejects concurrent in-flight generation for same request", async () => {
  const { plan, request } = await getFixture();
  const pkg = createSampleValidContentPackage(request);

  let finishFirstCall;
  const holdPromise = new Promise((resolve) => {
    finishFirstCall = resolve;
  });

  const promise1 = generatePresentationContent(
    request,
    plan,
    TEACHER_AUTH,
    {
      forceRetry: true,
      mockProviderCall: async () => {
        await holdPromise;
        return JSON.stringify(pkg);
      },
      qualityEvaluatorCall: async () => JSON.stringify({ decision: "PASS", outlineAlignment: "aligned", factualGrounding: "grounded", exactValuesPreserved: true, styleCompliance: "compliant", findings: [] }),
    }
  );

  const promise2 = generatePresentationContent(
    request,
    plan,
    TEACHER_AUTH,
    {
      forceRetry: true,
      mockProviderCall: async () => JSON.stringify(pkg),
    }
  );

  const res2 = await promise2;
  assert.equal(res2.status, "error");
  assert.equal(res2.error?.code, AI_ERROR_CODES.AI_RATE_LIMIT);

  finishFirstCall();
  const res1 = await promise1;
  assert.equal(res1.status, "success");
});

await runAsyncTest("generatePresentationContent performs bounded retries on transient AI errors", async () => {
  const { plan, request } = await getFixture();
  const pkg = createSampleValidContentPackage(request);

  let attempt = 0;
  const result = await generatePresentationContent(
    request,
    plan,
    TEACHER_AUTH,
    {
      forceRetry: true,
      mockProviderCall: async () => {
        attempt++;
        if (attempt === 1) {
          throw new Error("503 Service Unavailable: High load");
        }
        return JSON.stringify(pkg);
      },
      qualityEvaluatorCall: async () => JSON.stringify({ decision: "PASS", outlineAlignment: "aligned", factualGrounding: "grounded", exactValuesPreserved: true, styleCompliance: "compliant", findings: [] }),
    }
  );

  assert.equal(result.status, "success");
  assert.equal(attempt, 2, "Transient 503 error should have triggered retry");
});

await runAsyncTest("generatePresentationContent returns typed error on permanent AI error", async () => {
  const { plan, request } = await getFixture();

  const result = await generatePresentationContent(
    request,
    plan,
    TEACHER_AUTH,
    {
      forceRetry: true,
      mockProviderCall: async () => {
        throw new Error("401 Unauthorized: Invalid API key");
      },
    }
  );

  assert.equal(result.status, "error");
  assert.equal(result.error?.code, AI_ERROR_CODES.AUTH_ERROR);
});

// ==============================================================================
// SUITE 7: SERVER FUNCTIONS & ISOLATED PERSISTENCE
// ==============================================================================
console.log("\n--- Suite 7: Server Functions & Isolated Persistence ---");

await runAsyncTest("executePreparePresentationGenerationRequest creates and stores request snapshot", async () => {
  const plan = createApprovedPresentationPlanFixture();
  fallbackTestPlans.set(plan.id, plan);

  const res = await executePreparePresentationGenerationRequest(
    { planId: plan.id, parameters: { aspectRatio: "16:9", contentDensity: "detailed" } },
    { userId: TEACHER_AUTH.userId, profile: TEACHER_AUTH.profile }
  );

  assert.equal(res.status, "success");
  assert.ok(res.request.requestId.startsWith("req_ppt_"));
  assert.equal(res.request.parameters.contentDensity, "detailed");
});

await runAsyncTest("executeGeneratePresentationContent generates, validates, and stores package", async () => {
  const plan = createApprovedPresentationPlanFixture();
  fallbackTestPlans.set(plan.id, plan);

  const prepRes = await executePreparePresentationGenerationRequest(
    { planId: plan.id },
    { userId: TEACHER_AUTH.userId, profile: TEACHER_AUTH.profile }
  );

  const pkg = createSampleValidContentPackage(prepRes.request);

  const genRes = await executeGeneratePresentationContent(
    {
      requestId: prepRes.request.requestId,
      options: {
        forceRetry: true,
        mockProviderCall: async () => JSON.stringify(pkg),
        qualityEvaluatorCall: async () => JSON.stringify({ decision: "PASS", outlineAlignment: "aligned", factualGrounding: "grounded", exactValuesPreserved: true, styleCompliance: "compliant", findings: [] }),
      },
    },
    { userId: TEACHER_AUTH.userId, profile: TEACHER_AUTH.profile }
  );

  assert.equal(genRes.status, "success");
  assert.ok(genRes.resultId.startsWith("res_ppt_"));
  assert.ok(genRes.result.presentationId.startsWith("pres_"));
  assert.equal(genRes.result.title, pkg.title);
});

await runAsyncTest("executeGetPresentationGenerationResult returns stored result for owner", async () => {
  const plan = createApprovedPresentationPlanFixture();
  fallbackTestPlans.set(plan.id, plan);

  const prepRes = await executePreparePresentationGenerationRequest(
    { planId: plan.id },
    { userId: TEACHER_AUTH.userId, profile: TEACHER_AUTH.profile }
  );
  const pkg = createSampleValidContentPackage(prepRes.request);

  const genRes = await executeGeneratePresentationContent(
    {
      requestId: prepRes.request.requestId,
      options: {
        forceRetry: true,
        mockProviderCall: async () => JSON.stringify(pkg),
        qualityEvaluatorCall: async () => JSON.stringify({ decision: "PASS", outlineAlignment: "aligned", factualGrounding: "grounded", exactValuesPreserved: true, styleCompliance: "compliant", findings: [] }),
      },
    },
    { userId: TEACHER_AUTH.userId, profile: TEACHER_AUTH.profile }
  );

  const fetchRes = await executeGetPresentationGenerationResult(
    { resultId: genRes.resultId },
    { userId: TEACHER_AUTH.userId, profile: TEACHER_AUTH.profile }
  );

  assert.equal(fetchRes.status, "success");
  assert.equal(fetchRes.result.title, pkg.title);
});

await runAsyncTest("executeGetPresentationGenerationResult forbids access to other teachers", async () => {
  const plan = createApprovedPresentationPlanFixture();
  fallbackTestPlans.set(plan.id, plan);

  const prepRes = await executePreparePresentationGenerationRequest(
    { planId: plan.id },
    { userId: TEACHER_AUTH.userId, profile: TEACHER_AUTH.profile }
  );
  const pkg = createSampleValidContentPackage(prepRes.request);

  const genRes = await executeGeneratePresentationContent(
    {
      requestId: prepRes.request.requestId,
      options: {
        forceRetry: true,
        mockProviderCall: async () => JSON.stringify(pkg),
        qualityEvaluatorCall: async () => JSON.stringify({ decision: "PASS", outlineAlignment: "aligned", factualGrounding: "grounded", exactValuesPreserved: true, styleCompliance: "compliant", findings: [] }),
      },
    },
    { userId: TEACHER_AUTH.userId, profile: TEACHER_AUTH.profile }
  );

  await assert.rejects(
    async () => {
      await executeGetPresentationGenerationResult(
        { resultId: genRes.resultId },
        { userId: OTHER_TEACHER_AUTH.userId, profile: OTHER_TEACHER_AUTH.profile }
      );
    },
    /Akses ditolak: Anda tidak memiliki akses/
  );
});

await runAsyncTest("executeGetPresentationGenerationResult throws on nonexistent resultId", async () => {
  await assert.rejects(
    async () => {
      await executeGetPresentationGenerationResult(
        { resultId: "nonexistent_result_123" },
        { userId: TEACHER_AUTH.userId, profile: TEACHER_AUTH.profile }
      );
    },
    /tidak ditemukan/
  );
});

await runAsyncTest("executeListPresentationGenerationResults lists results filtered by moduleId", async () => {
  const listRes = await executeListPresentationGenerationResults(
    { moduleId: "modul_bio_101" },
    { userId: TEACHER_AUTH.userId, profile: TEACHER_AUTH.profile }
  );

  assert.equal(listRes.status, "success");
  assert.ok(Array.isArray(listRes.results));
  assert.ok(listRes.results.length >= 1);
});

await runAsyncTest("executeListPresentationGenerationResults isolates tenant rows", async () => {
  const otherListRes = await executeListPresentationGenerationResults(
    { moduleId: "modul_bio_101" },
    { userId: OTHER_TEACHER_AUTH.userId, profile: OTHER_TEACHER_AUTH.profile }
  );

  assert.equal(otherListRes.status, "success");
  assert.equal(otherListRes.results.length, 0);
});

await runAsyncTest("executeGeneratePresentationContent returns from cache when generated twice with same parameters", async () => {
  const plan = createApprovedPresentationPlanFixture();
  fallbackTestPlans.set(plan.id, plan);

  const prepRes = await executePreparePresentationGenerationRequest(
    { planId: plan.id },
    { userId: TEACHER_AUTH.userId, profile: TEACHER_AUTH.profile }
  );
  const pkg = createSampleValidContentPackage(prepRes.request);

  let mockCalls = 0;
  const genOptions = {
    forceRetry: false,
    mockProviderCall: async () => {
      mockCalls++;
      return JSON.stringify(pkg);
    },
    qualityEvaluatorCall: async () => JSON.stringify({ decision: "PASS", outlineAlignment: "aligned", factualGrounding: "grounded", exactValuesPreserved: true, styleCompliance: "compliant", findings: [] }),
  };

  const res1 = await executeGeneratePresentationContent(
    { requestId: prepRes.request.requestId, options: genOptions },
    { userId: TEACHER_AUTH.userId, profile: TEACHER_AUTH.profile }
  );
  assert.equal(res1.status, "success");
  assert.equal(mockCalls, 1);

  const res2 = await executeGeneratePresentationContent(
    { requestId: prepRes.request.requestId, options: genOptions },
    { userId: TEACHER_AUTH.userId, profile: TEACHER_AUTH.profile }
  );
  assert.equal(res2.status, "success");
  assert.equal(mockCalls, 1, "Second call should be served idempotently from cache");
});

// ==============================================================================
// SUITE 8: STRICT NON-GENERATION INVARIANTS & INTEGRITY
// ==============================================================================
console.log("\n--- Suite 8: Strict Non-Generation Invariants & Integrity ---");

await runAsyncTest("Strict Non-Generation Invariant: zero .pptx files created on disk", async () => {
  const searchDirs = [
    path.resolve(process.cwd(), "src"),
    path.resolve(process.cwd(), "tests"),
    process.cwd(),
  ];

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      assert.ok(
        !entry.endsWith(".pptx"),
        `PPT-1B invariant violated: found real or fake .pptx file on disk: ${entry}`
      );
    }
  }
});

await runAsyncTest("Strict Non-Generation Invariant: zero calls to VIS-1B illustration engine", async () => {
  const generatorCode = fs.readFileSync(
    path.resolve(process.cwd(), "src/lib/ai/presentation-generator.ts"),
    "utf-8"
  );
  assert.ok(
    !generatorCode.includes("executeGenerateIllustration"),
    "presentation-generator must not call illustration generator"
  );
  assert.ok(
    !generatorCode.includes("generateIllustrationServerFn"),
    "presentation-generator must not call illustration server functions"
  );
});

await runAsyncTest("Strict Non-Generation Invariant: no HTML/markdown is renamed as PPTX", async () => {
  const generatorCode = fs.readFileSync(
    path.resolve(process.cwd(), "src/lib/ai/presentation-generator.ts"),
    "utf-8"
  );
  assert.ok(
    !generatorCode.includes(".pptx"),
    "presentation-generator must strictly output structured JSON package, never PPTX strings"
  );
});

await runAsyncTest("Presentation content package does not contain raw binary or image blobs", async () => {
  const { request } = await getFixture();
  const pkg = createSampleValidContentPackage(request);

  const serialized = JSON.stringify(pkg);
  assert.ok(!serialized.includes("data:image/"), "PPT-1B must not contain base64 image data");
  assert.ok(!serialized.includes("PK\x03\x04"), "PPT-1B must not contain zip/pptx binary headers");
});

await runAsyncTest("Legacy unduhPpt and Modul Ajar generation integrity preserved", async () => {
  const exporterPath = path.resolve(process.cwd(), "src/lib/exporters.ts");
  if (fs.existsSync(exporterPath)) {
    const exporterCode = fs.readFileSync(exporterPath, "utf-8");
    assert.ok(
      exporterCode.includes("unduhPpt"),
      "Existing legacy unduhPpt must remain intact and functional"
    );
  }
});

console.log("\n==============================================================================");
console.log(`PPT-1B TEST SUITE COMPLETE: ${passedTests}/${totalTests} TESTS PASSED!`);
console.log("==============================================================================\n");
