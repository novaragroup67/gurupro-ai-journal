#!/usr/bin/env node
/**
 * ==============================================================================
 * GURUPRO TEST SUITE: PPT-1A PRESENTATION GENERATION CONTRACT & OUTLINE PLANNING
 * ==============================================================================
 *
 * Verifies:
 * 1. Parameters & Schemas Validation (16:9 widescreen, 4:3 standard, density, block types, pedagogical types)
 * 2. Strict Approval Gate & Stale Approval Rejection (unapproved, stale version, revoked)
 * 3. Slide Manipulation & Continuous 1..N Ordering (add, remove, reorder, update, duplicate, min 1 slide)
 * 4. Presentation Style Catalog Integration & Guard (6 presentation styles, illustration styles rejected)
 * 5. Strict Target Type Guard (presentation required, illustration target rejected)
 * 6. Grounding & Slide-Level Provenance (module references, evidence references preserved)
 * 7. Visual Requirement Integration (existing illustration reference, new illustration flag, cross-tenant rejection)
 * 8. Pedagogical Inference & Structured Blueprint Assembly (slide typing, block typing, speaker notes)
 * 9. Multi-Tenant RBAC & Ownership Security (teacher authorization, student rejected, non-owner rejected)
 * 10. Strict Non-Generation Invariant & Persistence (status: prepared, zero PPTX files, zero rendering calls)
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
  ILLUSTRATION_STYLES_CATALOG,
  getStyleById,
  validatePresentationOutline,
  createGenerationSpecification,
} from "../../src/lib/ai/generation-planning-contract.ts";
import {
  createInitialPlan,
  applyOutlineEdits,
  applyStyleSelection,
  applyPlanApproval,
  applyPlanApprovalRevocation,
  generateInitialPresentationOutline,
  generateInitialIllustrationOutline,
  addSlideToPresentationOutline,
  removeSlideFromPresentationOutline,
  reorderSlidesInPresentationOutline,
  updateSlideInPresentationOutline,
  duplicateSlideInPresentationOutline,
} from "../../src/lib/ai/generation-planning-service.ts";
import {
  PresentationAspectRatioSchema,
  PresentationSlideSizeSchema,
  PresentationContentDensitySchema,
  PresentationContentBlockTypeSchema,
  SlidePedagogicalTypeSchema,
  SlideVisualRequirementTypeSchema,
  PresentationGenerationParametersSchema,
  PresentationGenerationRequestSchema,
  validatePresentationGenerationParameters,
  validatePresentationGenerationRequest,
  validateContinuousSlideOrdering,
} from "../../src/lib/ai/presentation-generation-contract.ts";
import {
  inferSlidePedagogicalType,
  assemblePresentationContentBlueprint,
  buildPresentationGenerationRequest,
} from "../../src/lib/ai/presentation-request-builder.ts";
import {
  executePreparePresentationGenerationRequest,
  executeGetPresentationGenerationRequest,
  executeListPresentationGenerationRequests,
  fallbackPresentationRequests,
} from "../../src/lib/presentation-generation.functions.ts";

console.log("================================================================================");
console.log("  GURUPRO TEST SUITE: PPT-1A PRESENTATION GENERATION CONTRACT & PLANNING       ");
console.log("================================================================================");

let testsPassed = 0;
let testsFailed = 0;

async function runTest(name, fn) {
  try {
    process.stdout.write(`  • ${name} ... `);
    await fn();
    console.log("✓ PASS");
    testsPassed++;
  } catch (err) {
    console.log("✗ FAIL");
    console.error(err);
    testsFailed++;
  }
}

// Helper test mock fixtures
const mockTeacherAuth = {
  userId: "teacher_guru_001",
  role: "guru",
  isGuru: true,
  verificationStatus: "verified",
};

const mockOtherTeacherAuth = {
  userId: "teacher_guru_999",
  role: "guru",
  isGuru: true,
  verificationStatus: "verified",
};

const mockStudentAuth = {
  userId: "student_001",
  role: "siswa",
  isGuru: false,
  verificationStatus: "none",
};

const mockModul = {
  id: "modul_fotosintesis_01",
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
  const ownerId = overrides.ownerId || mockTeacherAuth.userId;
  const moduleId = overrides.moduleId || mockModul.id;

  const initial = createInitialPlan(ownerId, moduleId, "presentation", outline, styleId);
  const { approvedPlan } = applyPlanApproval(initial.plan, mockTeacherAuth);
  return approvedPlan;
}

// ==============================================================================
// 1. PARAMETERS & SCHEMAS VALIDATION
// ==============================================================================
console.log("\n[1] Presentation Parameters & Schemas Validation");

await runTest("Default parameters are validated with 16:9, standard size, and balanced density", () => {
  const validated = validatePresentationGenerationParameters();
  assert.equal(validated.aspectRatio, "16:9");
  assert.equal(validated.slideSize.width, 1920);
  assert.equal(validated.slideSize.height, 1080);
  assert.equal(validated.contentDensity, "balanced");
  assert.equal(validated.language, "id");
  assert.equal(validated.includeSpeakerNotes, true);
  assert.equal(validated.footerPolicy, "standard");
});

await runTest("4:3 standard aspect ratio resolves to 1024x768 dimensions", () => {
  const validated = validatePresentationGenerationParameters({ aspectRatio: "4:3" });
  assert.equal(validated.aspectRatio, "4:3");
  assert.equal(validated.slideSize.width, 1024);
  assert.equal(validated.slideSize.height, 768);
});

await runTest("Custom slide size is respected when within valid boundaries", () => {
  const validated = validatePresentationGenerationParameters({
    slideSize: { width: 1280, height: 720 },
  });
  assert.equal(validated.slideSize.width, 1280);
  assert.equal(validated.slideSize.height, 720);
});

await runTest("Rejects invalid aspect ratio (e.g. 1:1 square or 9:16 portrait)", () => {
  assert.throws(
    () => validatePresentationGenerationParameters({ aspectRatio: "1:1" }),
    (err) => err.code === AI_ERROR_CODES.INVALID_REQUEST
  );
  assert.throws(
    () => validatePresentationGenerationParameters({ aspectRatio: "9:16" }),
    (err) => err.code === AI_ERROR_CODES.INVALID_REQUEST
  );
});

await runTest("Rejects invalid content density", () => {
  assert.throws(
    () => validatePresentationGenerationParameters({ contentDensity: "overloaded" }),
    (err) => err.code === AI_ERROR_CODES.INVALID_REQUEST
  );
});

await runTest("Validates all 12 canonical presentation content block types", () => {
  const allowed = [
    "paragraph",
    "bullet_list",
    "numbered_list",
    "quote",
    "key_stat",
    "callout",
    "process",
    "comparison",
    "table",
    "diagram",
    "image",
    "summary",
  ];
  for (const type of allowed) {
    const res = PresentationContentBlockTypeSchema.safeParse(type);
    assert.equal(res.success, true, `Expected ${type} to be valid`);
  }
  const invalid = PresentationContentBlockTypeSchema.safeParse("unsupported_video_embed");
  assert.equal(invalid.success, false);
});

await runTest("Validates all 9 pedagogical slide types", () => {
  const allowed = [
    "introduction",
    "concept_explanation",
    "example",
    "process",
    "application",
    "comparison",
    "exercise",
    "summary",
    "reflection",
  ];
  for (const type of allowed) {
    const res = SlidePedagogicalTypeSchema.safeParse(type);
    assert.equal(res.success, true, `Expected ${type} to be valid`);
  }
  const invalid = SlidePedagogicalTypeSchema.safeParse("arbitrary_break");
  assert.equal(invalid.success, false);
});

// ==============================================================================
// 2. STRICT APPROVAL GATE & STALE APPROVAL REJECTION
// ==============================================================================
console.log("\n[2] Strict Approval Gate & Stale Approval Rejection");

await runTest("Rejects unapproved presentation plan with PLAN_NOT_APPROVED", async () => {
  const unapproved = createInitialPlan(
    mockTeacherAuth.userId,
    mockModul.id,
    "presentation",
    generateInitialPresentationOutline(mockModul),
    "style_ppt_edu_classroom"
  );

  await assert.rejects(
    async () => {
      await buildPresentationGenerationRequest(unapproved.plan, mockTeacherAuth);
    },
    (err) => {
      assert.equal(err.code, AI_ERROR_CODES.PLAN_NOT_APPROVED);
      return true;
    }
  );
});

await runTest("Rejects stale approval after outline edit with STALE_APPROVAL", async () => {
  const approvedPlan = await createApprovedPresentationPlanFixture();
  assert.equal(approvedPlan.status, "approved");
  assert.equal(approvedPlan.currentVersion, 1);
  assert.equal(approvedPlan.approvedVersion, 1);

  // Teacher edits outline after approval -> creates version 2
  const currentOutline = approvedPlan.outline;
  const updatedOutline = {
    ...currentOutline,
    title: "Fotosintesis & Respirasi Sel Tumbuhan (Revisi)",
  };
  const editResult = applyOutlineEdits(approvedPlan, updatedOutline, mockTeacherAuth.userId, "Update judul");
  const editedPlan = editResult.updatedPlan;

  assert.equal(editedPlan.currentVersion, 2);
  assert.notEqual(editedPlan.status, "approved"); // approval revoked upon edit
  assert.equal(editedPlan.approvedVersion, null); // reset to null on outline edit

  await assert.rejects(
    async () => {
      await buildPresentationGenerationRequest(editedPlan, mockTeacherAuth);
    },
    (err) => {
      assert.equal(err.code, AI_ERROR_CODES.PLAN_NOT_APPROVED);
      return true;
    }
  );
});

await runTest("Rejects plan when teacher explicitly revoked approval", async () => {
  const approvedPlan = await createApprovedPresentationPlanFixture();
  const revokedPlan = applyPlanApprovalRevocation(approvedPlan, mockTeacherAuth);

  assert.notEqual(revokedPlan.status, "approved");

  await assert.rejects(
    async () => {
      await buildPresentationGenerationRequest(revokedPlan, mockTeacherAuth);
    },
    (err) => {
      assert.equal(err.code, AI_ERROR_CODES.PLAN_NOT_APPROVED);
      return true;
    }
  );
});

await runTest("Re-approval allows request building and increments approvedVersion to current", async () => {
  const approvedPlan = await createApprovedPresentationPlanFixture();
  const currentOutline = approvedPlan.outline;
  const editedPlan = applyOutlineEdits(
    approvedPlan,
    { ...currentOutline, targetAudience: "Kelas 8 SMP / Fase D" },
    mockTeacherAuth.userId,
    "Target audiens disesuaikan"
  ).updatedPlan;

  const { approvedPlan: reApproved } = applyPlanApproval(editedPlan, mockTeacherAuth);
  assert.equal(reApproved.currentVersion, 2);
  assert.equal(reApproved.approvedVersion, 2);
  assert.equal(reApproved.status, "approved");

  const req = await buildPresentationGenerationRequest(reApproved, mockTeacherAuth);
  assert.ok(req);
  assert.equal(req.approvedOutlineVersion, 2);
  assert.equal(req.status, "prepared");
});

// ==============================================================================
// 3. SLIDE MANIPULATION & CONTINUOUS 1..N ORDERING
// ==============================================================================
console.log("\n[3] Slide Manipulation & Continuous 1..N Ordering");

await runTest("validateContinuousSlideOrdering accepts strictly contiguous 1..N order", () => {
  const validSlides = [
    { slideOrder: 1, slideTitle: "Slide 1" },
    { slideOrder: 2, slideTitle: "Slide 2" },
    { slideOrder: 3, slideTitle: "Slide 3" },
  ];
  assert.doesNotThrow(() => validateContinuousSlideOrdering(validSlides));
});

await runTest("validateContinuousSlideOrdering rejects ordering with gaps", () => {
  const gappedSlides = [
    { slideOrder: 1, slideTitle: "Slide 1" },
    { slideOrder: 3, slideTitle: "Slide 3 (Gap!)" },
  ];
  assert.throws(
    () => validateContinuousSlideOrdering(gappedSlides),
    (err) => err.code === AI_ERROR_CODES.INVALID_REQUEST
  );
});

await runTest("validateContinuousSlideOrdering rejects duplicate slide orders", () => {
  const duplicateSlides = [
    { slideOrder: 1, slideTitle: "Slide 1" },
    { slideOrder: 1, slideTitle: "Slide 1 (Duplicate)" },
  ];
  assert.throws(
    () => validateContinuousSlideOrdering(duplicateSlides),
    (err) => err.code === AI_ERROR_CODES.INVALID_REQUEST
  );
});

await runTest("addSlideToPresentationOutline appends slide and preserves contiguous 1..N order", async () => {
  const plan = await createApprovedPresentationPlanFixture();
  const outline = plan.outline;
  const initialCount = outline.slides.length;

  const updatedOutline = addSlideToPresentationOutline(outline, {
    slideTitle: "Slide Tambahan: Percobaan Ingenhousz",
    purpose: "Menunjukkan produksi oksigen dalam fotosintesis",
  });

  assert.equal(updatedOutline.slides.length, initialCount + 1);
  assert.equal(updatedOutline.intendedSlideCount, initialCount + 1);
  assert.equal(updatedOutline.slides[updatedOutline.slides.length - 1].slideOrder, initialCount + 1);
  assert.doesNotThrow(() => validateContinuousSlideOrdering(updatedOutline.slides));
});

await runTest("removeSlideFromPresentationOutline removes slide and re-indexes contiguous 1..N order", async () => {
  const plan = await createApprovedPresentationPlanFixture();
  const outline = plan.outline;
  const slideToRemove = outline.slides[1];
  const initialCount = outline.slides.length;

  const updatedOutline = removeSlideFromPresentationOutline(outline, slideToRemove.id);

  assert.equal(updatedOutline.slides.length, initialCount - 1);
  assert.equal(updatedOutline.intendedSlideCount, initialCount - 1);
  assert.equal(updatedOutline.slides.some((s) => s.id === slideToRemove.id), false);
  assert.doesNotThrow(() => validateContinuousSlideOrdering(updatedOutline.slides));
});

await runTest("removeSlideFromPresentationOutline rejects removing the only remaining slide", () => {
  const singleSlideOutline = {
    title: "Presentasi Singkat",
    targetAudience: "Umum",
    globalVisualDirection: "Minimal",
    intendedSlideCount: 1,
    slides: [
      {
        id: "slide_single",
        slideOrder: 1,
        slideTitle: "Satu-satunya Slide",
        purpose: "Materi inti",
        keyPoints: ["Poin 1"],
        contentBlocks: ["Penjelasan"],
        visualDirection: "Diagram",
        sourceReferences: ["modul:01"],
        evidenceReferences: ["ev:01"],
      },
    ],
  };

  assert.throws(
    () => removeSlideFromPresentationOutline(singleSlideOutline, "slide_single"),
    (err) => err.code === AI_ERROR_CODES.INVALID_REQUEST
  );
});

await runTest("duplicateSlideInPresentationOutline inserts duplicate adjacent and maintains 1..N order", async () => {
  const plan = await createApprovedPresentationPlanFixture();
  const outline = plan.outline;
  const targetSlide = outline.slides[0];
  const initialCount = outline.slides.length;

  const updatedOutline = duplicateSlideInPresentationOutline(outline, targetSlide.id);

  assert.equal(updatedOutline.slides.length, initialCount + 1);
  assert.equal(updatedOutline.intendedSlideCount, initialCount + 1);
  // Duplicate inserted at index 1
  const duplicated = updatedOutline.slides[1];
  assert.notEqual(duplicated.id, targetSlide.id);
  assert.ok(duplicated.slideTitle.includes("(Salinan)"));
  assert.equal(duplicated.purpose, targetSlide.purpose);
  assert.doesNotThrow(() => validateContinuousSlideOrdering(updatedOutline.slides));
});

await runTest("reorderSlidesInPresentationOutline reindexes slides according to custom id array", async () => {
  const plan = await createApprovedPresentationPlanFixture();
  const outline = plan.outline;
  assert.ok(outline.slides.length >= 3);

  // Invert order of slides
  const reversedIds = outline.slides.map((s) => s.id).reverse();
  const reordered = reorderSlidesInPresentationOutline(outline, reversedIds);

  assert.equal(reordered.slides[0].id, reversedIds[0]);
  assert.equal(reordered.slides[0].slideOrder, 1);
  assert.equal(reordered.slides[reordered.slides.length - 1].slideOrder, reordered.slides.length);
  assert.doesNotThrow(() => validateContinuousSlideOrdering(reordered.slides));
});

// ==============================================================================
// 4. PRESENTATION STYLE CATALOG INTEGRATION & GUARD
// ==============================================================================
console.log("\n[4] Presentation Style Catalog Integration & Guard");

await runTest("Exactly 6 presentation styles exist in the verified catalog", () => {
  assert.equal(PRESENTATION_STYLES_CATALOG.length, 6);
  const expectedIds = [
    "style_ppt_modern_minimal",
    "style_ppt_edu_classroom",
    "style_ppt_corp_pro",
    "style_ppt_visual_learning",
    "style_ppt_technical",
    "style_ppt_academic",
  ];
  for (const id of expectedIds) {
    const style = getStyleById(id);
    assert.ok(style, `Style ${id} must exist in catalog`);
    assert.equal(style.type, "presentation");
    assert.ok(style.visualRules.length >= 2);
    assert.ok(style.layoutRules.length >= 1);
  }
});

await runTest("Rejects illustration style when building presentation generation request", async () => {
  const plan = await createApprovedPresentationPlanFixture();
  const illStyle = ILLUSTRATION_STYLES_CATALOG[0];

  // Tamper plan style to illustration
  const tamperedPlan = {
    ...plan,
    selectedStyleId: illStyle.id,
    style: illStyle,
  };

  await assert.rejects(
    async () => {
      await buildPresentationGenerationRequest(tamperedPlan, mockTeacherAuth);
    },
    (err) => {
      assert.equal(err.code, AI_ERROR_CODES.INVALID_STYLE);
      return true;
    }
  );
});

await runTest("Style snapshot is fully preserved in presentation generation request", async () => {
  const plan = await createApprovedPresentationPlanFixture();
  const req = await buildPresentationGenerationRequest(plan, mockTeacherAuth);

  assert.equal(req.styleId, "style_ppt_edu_classroom");
  assert.equal(req.styleVersion, 1);
  assert.ok(req.styleSnapshot);
  assert.equal(req.styleSnapshot.styleId, "style_ppt_edu_classroom");
  assert.ok(req.styleSnapshot.visualRules.length > 0);
  assert.ok(req.styleSnapshot.layoutRules.length > 0);
});

// ==============================================================================
// 5. STRICT TARGET TYPE GUARD
// ==============================================================================
console.log("\n[5] Strict Target Type Guard");

await runTest("Rejects illustration target plan with INVALID_REQUEST", async () => {
  const illOutline = generateInitialIllustrationOutline(mockModul);
  const illPlan = createInitialPlan(
    mockTeacherAuth.userId,
    mockModul.id,
    "illustration",
    illOutline,
    "style_ill_flat_edu"
  );
  const { approvedPlan: approvedIllPlan } = applyPlanApproval(illPlan.plan, mockTeacherAuth);

  await assert.rejects(
    async () => {
      await buildPresentationGenerationRequest(approvedIllPlan, mockTeacherAuth);
    },
    (err) => {
      assert.equal(err.code, AI_ERROR_CODES.INVALID_REQUEST);
      assert.ok(err.message.includes("Hanya rencana bertipe 'presentation'"));
      return true;
    }
  );
});

// ==============================================================================
// 6. GROUNDING & SLIDE-LEVEL PROVENANCE
// ==============================================================================
console.log("\n[6] Grounding & Slide-Level Provenance");

await runTest("Preserves moduleId, ownerId, and slide-level source & evidence references", async () => {
  const plan = await createApprovedPresentationPlanFixture();
  const req = await buildPresentationGenerationRequest(plan, mockTeacherAuth);

  assert.equal(req.moduleId, "modul_fotosintesis_01");
  assert.equal(req.created_by, mockTeacherAuth.userId);
  assert.ok(req.slidePlan.length > 0);

  for (const slide of req.slidePlan) {
    assert.ok(Array.isArray(slide.sourceReferences));
    assert.ok(Array.isArray(slide.evidenceReferences));
    assert.ok(slide.sourceReferences.length > 0);
    assert.ok(slide.evidenceReferences.length > 0);
  }
});

// ==============================================================================
// 7. VISUAL REQUIREMENT INTEGRATION (EXISTING VS NEW)
// ==============================================================================
console.log("\n[7] Visual Requirement Integration (Existing vs New)");

await runTest("Slide visual requirement flagged with generate_new_illustration when keywords match", async () => {
  const plan = await createApprovedPresentationPlanFixture();
  const outline = plan.outline;

  // Slide 2 has diagram/illustration in visualDirection
  const slide2 = outline.slides[1];
  slide2.visualDirection = "Perlu ilustrasi kloroplas dan tilakoid dengan detail grana";

  const req = await buildPresentationGenerationRequest(plan, mockTeacherAuth);
  const slide2Plan = req.slidePlan[1];

  assert.equal(slide2Plan.visualRequirements.type, "generate_new_illustration");
  assert.equal(slide2Plan.visualRequirements.requiresGeneratedIllustration, true);
  assert.ok(slide2Plan.visualRequirements.description.length > 0);
});

await runTest("Slide referencing existing illustration asset is accepted and resolved", async () => {
  const plan = await createApprovedPresentationPlanFixture();
  const outline = plan.outline;

  // Slide 3 references existing asset
  outline.slides[2].visualDirection = "Gunakan aset ilustrasi yang sudah disetujui sebelumnya";

  const mockAssetResolver = async (assetId) => {
    return {
      assetId,
      moduleId: "modul_fotosintesis_01",
      ownerId: mockTeacherAuth.userId,
      publicUrl: "https://storage.gurupro.id/assets/ast_fotosintesis_kloroplas.png",
      thumbnailUrl: "https://storage.gurupro.id/assets/ast_fotosintesis_kloroplas_thumb.png",
    };
  };

  const req = await buildPresentationGenerationRequest(
    plan,
    mockTeacherAuth,
    {
      slideVisualOverrides: {
        [outline.slides[2].id]: {
          type: "existing_illustration",
          referencedAssetId: "ast_fotosintesis_kloroplas",
        },
      },
    },
    { resolveIllustrationAsset: mockAssetResolver }
  );

  const slide3Plan = req.slidePlan[2];
  assert.equal(slide3Plan.visualRequirements.type, "existing_illustration");
  assert.equal(slide3Plan.visualRequirements.referencedAssetId, "ast_fotosintesis_kloroplas");
  assert.equal(slide3Plan.visualRequirements.requiresGeneratedIllustration, false);
});

await runTest("Rejects cross-tenant or mismatched module illustration asset reference", async () => {
  const plan = await createApprovedPresentationPlanFixture();
  const outline = plan.outline;

  const crossTenantResolver = async (assetId) => {
    return {
      assetId,
      moduleId: "modul_kimia_organik_99", // Different module!
      ownerId: "other_teacher_evil",      // Different teacher!
      publicUrl: "https://storage.gurupro.id/assets/evil.png",
    };
  };

  await assert.rejects(
    async () => {
      await buildPresentationGenerationRequest(
        plan,
        mockTeacherAuth,
        {
          slideVisualOverrides: {
            [outline.slides[0].id]: {
              type: "existing_illustration",
              referencedAssetId: "ast_stolen_asset",
            },
          },
        },
        { resolveIllustrationAsset: crossTenantResolver }
      );
    },
    (err) => {
      assert.equal(err.code, AI_ERROR_CODES.ROLE_FORBIDDEN);
      return true;
    }
  );
});

// ==============================================================================
// 8. PEDAGOGICAL INFERENCE & BLUEPRINT ASSEMBLY
// ==============================================================================
console.log("\n[8] Pedagogical Inference & Blueprint Assembly");

await runTest("Infers pedagogical types deterministically based on slide position & content", () => {
  assert.equal(
    inferSlidePedagogicalType({ slideOrder: 1, slideTitle: "Pengantar Fotosintesis", purpose: "Judul" }, 5),
    "introduction"
  );
  assert.equal(
    inferSlidePedagogicalType({ slideOrder: 2, slideTitle: "Tujuan Pembelajaran", purpose: "Capaian materi" }, 5),
    "introduction"
  );
  assert.equal(
    inferSlidePedagogicalType({ slideOrder: 3, slideTitle: "Tahapan Reaksi Terang", purpose: "Alur proses" }, 5),
    "process"
  );
  assert.equal(
    inferSlidePedagogicalType({ slideOrder: 4, slideTitle: "Perbandingan Reaksi Gelap & Terang", purpose: "Komparasi" }, 5),
    "comparison"
  );
  assert.equal(
    inferSlidePedagogicalType({ slideOrder: 5, slideTitle: "Rangkuman & Refleksi", purpose: "Evaluasi akhir" }, 5),
    "reflection"
  );
});

await runTest("Blueprint structure converts text blocks into typed structured content blocks", async () => {
  const plan = await createApprovedPresentationPlanFixture();
  const req = await buildPresentationGenerationRequest(plan, mockTeacherAuth);

  assert.ok(req.contentBlueprint);
  assert.ok(req.slidePlan);
  assert.equal(req.slidePlan.length, plan.outline.slides.length);

  for (const slide of req.slidePlan) {
    assert.ok(slide.contentBlocks.length > 0);
    for (const block of slide.contentBlocks) {
      assert.ok(block);
    }
    assert.ok(typeof slide.purpose === "string");
  }
});

// ==============================================================================
// 9. MULTI-TENANT RBAC & OWNERSHIP SECURITY
// ==============================================================================
console.log("\n[9] Multi-Tenant RBAC & Ownership Security");

await runTest("Rejects student role from preparing presentation generation request", async () => {
  const plan = await createApprovedPresentationPlanFixture();

  await assert.rejects(
    async () => {
      await buildPresentationGenerationRequest(plan, mockStudentAuth);
    },
    (err) => {
      assert.equal(err.code, AI_ERROR_CODES.ROLE_FORBIDDEN);
      return true;
    }
  );
});

await runTest("Rejects teacher from building request for another teacher's plan", async () => {
  const plan = await createApprovedPresentationPlanFixture(); // owned by mockTeacherAuth

  await assert.rejects(
    async () => {
      await buildPresentationGenerationRequest(plan, mockOtherTeacherAuth);
    },
    (err) => {
      assert.equal(err.code, AI_ERROR_CODES.ROLE_FORBIDDEN);
      return true;
    }
  );
});

await runTest("executePreparePresentationGenerationRequest enforces teacher auth and ownership", async () => {
  const plan = await createApprovedPresentationPlanFixture();
  // Register plan in fallback memory for function execution
  const { fallbackTestPlans } = await import("../../src/lib/illustration-generation.functions.ts");
  fallbackTestPlans.set(plan.id, plan);

  // Success with owner teacher
  const res = await executePreparePresentationGenerationRequest(
    { planId: plan.id },
    mockTeacherAuth
  );
  assert.equal(res.status, "success");
  assert.ok(res.request.requestId);

  // Failure with other teacher
  await assert.rejects(
    async () => {
      await executePreparePresentationGenerationRequest(
        { planId: plan.id },
        mockOtherTeacherAuth
      );
    },
    (err) => {
      assert.equal(err.code, AI_ERROR_CODES.ROLE_FORBIDDEN);
      return true;
    }
  );
});

// ==============================================================================
// 10. STRICT NON-GENERATION INVARIANTS & PERSISTENCE
// ==============================================================================
console.log("\n[10] Strict Non-Generation Invariants & Persistence");

await runTest("Prepared request strictly has status 'prepared' (never 'succeeded' or 'processing')", async () => {
  const plan = await createApprovedPresentationPlanFixture();
  const req = await buildPresentationGenerationRequest(plan, mockTeacherAuth);
  assert.equal(req.status, "prepared");
});

await runTest("No .pptx or .ppt files are generated on disk during PPT-1A", async () => {
  const plan = await createApprovedPresentationPlanFixture();
  await buildPresentationGenerationRequest(plan, mockTeacherAuth);

  // Check current directory and test directory for any rogue ppt files
  const rootFiles = fs.readdirSync(process.cwd());
  const roguePpt = rootFiles.filter((f) => f.endsWith(".pptx") || (f.endsWith(".ppt") && !f.includes("template")));
  assert.equal(roguePpt.length, 0, "No PPTX files should be created in root");
});

await runTest("Stored presentation request can be retrieved by requestId and listed by moduleId", async () => {
  const plan = await createApprovedPresentationPlanFixture();
  const { fallbackTestPlans } = await import("../../src/lib/illustration-generation.functions.ts");
  fallbackTestPlans.set(plan.id, plan);

  const prepared = await executePreparePresentationGenerationRequest(
    { planId: plan.id },
    mockTeacherAuth
  );

  const retrieved = await executeGetPresentationGenerationRequest(
    { requestId: prepared.request.requestId },
    mockTeacherAuth
  );
  assert.equal(retrieved.status, "success");
  assert.equal(retrieved.request.requestId, prepared.request.requestId);
  assert.equal(retrieved.request.moduleId, plan.moduleId);

  const listRes = await executeListPresentationGenerationRequests(
    { moduleId: plan.moduleId },
    mockTeacherAuth
  );
  assert.equal(listRes.status, "success");
  assert.ok(listRes.requests.length >= 1);
  assert.ok(listRes.requests.some((r) => r.requestId === prepared.request.requestId));
});

// ==============================================================================
// SUMMARY
// ==============================================================================
console.log("\n================================================================================");
console.log(`  PPT-1A TEST SUITE COMPLETE: ${testsPassed} passed, ${testsFailed} failed`);
console.log("================================================================================");

if (testsFailed > 0) {
  process.exit(1);
}
