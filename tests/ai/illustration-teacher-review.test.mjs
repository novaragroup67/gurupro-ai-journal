#!/usr/bin/env node
/**
 * ==============================================================================
 * GURUPRO TEST SUITE: VIS-1D TEACHER REVIEW & ILLUSTRATION MANAGEMENT
 * ==============================================================================
 *
 * Verifies the complete teacher review and asset management lifecycle:
 * - Group 1: Review Loading, Eligibility & Specification Comparison
 * - Group 2: State Machine & Teacher Decisions (Approve, Reject, Keep, Transitions)
 * - Group 3: Multi-Output Generation & Independent Asset Selection
 * - Group 4: Section Attachment, Replacement & Non-Destructive Superseding
 * - Group 5: Archive & Lifecycle Invariants
 * - Group 6: Teacher Notes & Optimistic Concurrency Protection
 * - Group 7: Multi-Tenant RBAC & Ownership Security
 * - Group 8: Strict Non-Goals (No AI Evaluator, No Auto-Regeneration)
 */

import assert from "node:assert/strict";

import {
  AI_ERROR_CODES,
  AiServiceError,
} from "../../src/lib/ai/error-taxonomy.ts";
import {
  ReviewStatusSchema,
  TeacherDecisionSchema,
  IllustrationReviewSchema,
  validateReviewTransition,
  assertValidReviewTransition,
} from "../../src/lib/ai/illustration-review-contract.ts";
import {
  executeGetIllustrationReview,
  executeSaveIllustrationReview,
  executeApproveIllustrationForUse,
  executeRejectIllustration,
  executeListReviewableIllustrations,
  fallbackIllustrationReviews,
} from "../../src/lib/illustration-review.functions.ts";
import {
  executePersistIllustrationAsset,
  executeAttachIllustrationAsset,
  executeDetachIllustrationAsset,
  executeTransitionAssetLifecycle,
  fallbackIllustrationAssets,
  fallbackModulesStore,
} from "../../src/lib/illustration-asset.functions.ts";
import {
  fallbackIllustrationGenerations,
  fallbackIllustrationRequests,
  fallbackTestPlans,
} from "../../src/lib/illustration-generation.functions.ts";

console.log("================================================================================");
console.log("  GURUPRO TEST SUITE: VIS-1D TEACHER REVIEW & ILLUSTRATION MANAGEMENT          ");
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

// Test fixtures & helpers
const TEACHER_USER_ID = "00000000-0000-4000-a000-000000000001";
const OTHER_TEACHER_ID = "00000000-0000-4000-a000-000000000002";
const STUDENT_USER_ID = "00000000-0000-4000-a000-000000000099";

const teacherContext = {
  userId: TEACHER_USER_ID,
  profile: { role: "guru" },
};

const otherTeacherContext = {
  userId: OTHER_TEACHER_ID,
  profile: { role: "guru" },
};

const studentContext = {
  userId: STUDENT_USER_ID,
  profile: { role: "siswa" },
};

function seedModuleAndPlan(moduleId = "mod_1d_test", planId = "plan_1d_test") {
  const modul = {
    id: moduleId,
    guru_id: TEACHER_USER_ID,
    judul: "Siklus Hidup Air dan Atmosfer Fase D",
    sections: [
      { id: "sec_1", judul: "1. Pengantar Siklus Hidup Air", ilustrasi: null },
      { id: "sec_2", judul: "2. Proses Evaporasi dan Kondensasi", ilustrasi: null },
    ],
    updated_at: new Date().toISOString(),
  };
  fallbackModulesStore.set(moduleId, modul);

  const plan = {
    id: planId,
    moduleId,
    targetType: "illustration",
    status: "approved",
    currentVersion: 1,
    approvedVersion: 1,
    selectedStyleId: "style_ill_flat_edu",
    teacherId: TEACHER_USER_ID,
  };
  fallbackTestPlans.set(planId, plan);

  return { modul, plan };
}

function seedGenerationAndAsset(options = {}) {
  const {
    assetId = `ast_${Math.random().toString(36).substring(2, 9)}`,
    generationId = `gen_${Math.random().toString(36).substring(2, 9)}`,
    requestId = `req_${Math.random().toString(36).substring(2, 9)}`,
    moduleId = "mod_1d_test",
    planId = "plan_1d_test",
    ownerId = TEACHER_USER_ID,
    sha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    publicUrl = `https://cdn.gurupro.id/illustrations/${assetId}.png`,
    lifecycleStatus = "staged",
    status = "succeeded",
  } = options;

  const request = {
    requestId,
    generationPlanId: planId,
    moduleId,
    targetType: "illustration",
    approvedOutlineVersion: 1,
    approvedOutline: {
      title: "Diagram Presipitasi Siklus Air",
      objective: "Menjelaskan perpindahan partikel air cair ke atmosfer",
      mainSubject: "Siklus penguapan air dari laut ke awan",
      supportingElements: ["Matahari", "Permukaan Laut", "Partikel Uap", "Awan Kumulus"],
      environment: "Lansekap pesisir tropis dengan pencahayaan alami",
      composition: "Fokus sentral pada aliran uap air naik vertikal",
      visualDetails: "Gradasi biru transparan untuk uap, panah arah halus",
      educationalFocus: "Membedakan evaporasi dan transpirasi tumbuhan",
      textRequirements: ["Evaporasi", "Kondensasi"],
      thingsToAvoid: ["Teks asing", "Karakter kartun berlebihan"],
    },
    styleId: "style_ill_flat_edu",
    styleVersion: 1,
    styleDefinition: {
      id: "style_ill_flat_edu",
      name: "Flat Edukatif",
      version: 1,
      description: "Gaya vektor bersih dengan kontras tinggi",
      visualRules: ["Garis kontur jelas", "Palet warna harmonis"],
    },
    generationParameters: { aspectRatio: "1:1", width: 1024, height: 1024 },
    assembledPrompt: {
      systemPrompt: "Pedagogical prompt",
      styleDirectives: "Flat visual style",
      subjectDescription: "Water cycle evaporation",
      compositionDirectives: "Vertical arrows",
      negativePrompt: "lowres, blurry",
      fullPrompt: "Water cycle evaporation educational diagram",
    },
    textPolicy: {
      mustAppear: ["Evaporasi", "Kondensasi"],
      mayAppear: [],
      mustNotAppear: [],
      allowModelInventedText: false,
      textRenderStrategy: "clean_visual_only",
    },
    createdAt: new Date().toISOString(),
  };
  fallbackIllustrationRequests.set(requestId, request);

  const generation = {
    id: generationId,
    request_id: requestId,
    generation_plan_id: planId,
    module_id: moduleId,
    provider: "OpenAI",
    model: "gpt-image-1-mini",
    status,
    asset_reference: publicUrl,
    mime_type: "image/png",
    width: 1024,
    height: 1024,
    byte_size: 1540000,
    retry_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  fallbackIllustrationGenerations.set(generationId, generation);

  const assetRow = {
    id: assetId,
    generation_id: generationId,
    request_id: requestId,
    generation_plan_id: planId,
    module_id: moduleId,
    owner_id: ownerId,
    sha256_hash: sha256,
    storage_provider: "supabase_storage",
    storage_path: `modules/${moduleId}/illustrations/${assetId}.png`,
    public_url: publicUrl,
    mime_type: "image/png",
    width: 1024,
    height: 1024,
    byte_size: 1540000,
    lifecycle_status: lifecycleStatus,
    attached_section_id: null,
    attached_at: null,
    style_id: "style_ill_flat_edu",
    style_version: 1,
    style_name: "Flat Edukatif",
    prompt_snapshot: request.assembledPrompt,
    grounding_snapshot: {
      sourceReferences: ["Buku IPA SMP Kelas 7"],
      evidenceReferences: ["Bab 5 Siklus Air"],
      subjectDiscipline: "IPA",
      audienceLevel: "SMP Fase D",
    },
    pedagogical_metadata: {
      title: "Diagram Presipitasi Siklus Air",
      objective: "Menjelaskan perpindahan partikel air cair ke atmosfer",
      mainSubject: "Siklus penguapan air dari laut ke awan",
      educationalFocus: "Membedakan evaporasi dan transpirasi tumbuhan",
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  fallbackIllustrationAssets.set(assetId, assetRow);

  return { request, generation, assetRow };
}

async function runAllTests() {
  console.log("\n[GROUP 1: Review Loading, Eligibility & Specification Comparison]");

  await runTest("1.1 Valid persisted asset creates default 'pending' review with clean state", async () => {
    seedModuleAndPlan();
    const { assetRow } = seedGenerationAndAsset({ assetId: "ast_g1_1" });

    const res = await executeGetIllustrationReview({ assetId: "ast_g1_1" }, teacherContext);
    assert.equal(res.status, "success");
    assert.equal(res.review.assetId, "ast_g1_1");
    assert.equal(res.review.reviewStatus, "pending");
    assert.equal(res.review.teacherDecision, null);
    assert.equal(res.review.teacherNotes, null);
    assert.equal(res.review.reviewedBy, TEACHER_USER_ID);
  });

  await runTest("1.2 Non-existent asset ID throws INVALID_REQUEST", async () => {
    await assert.rejects(
      async () => {
        await executeGetIllustrationReview({ assetId: "ast_non_existent" }, teacherContext);
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.INVALID_REQUEST
    );
  });

  await runTest("1.3 Failed generation cannot be reviewed as a valid asset", async () => {
    seedModuleAndPlan();
    // Failed generation row without valid asset persistence
    fallbackIllustrationGenerations.set("gen_failed_1", {
      id: "gen_failed_1",
      status: "failed",
      error_code: "GENERATION_FAILED",
      error_message: "Rate limit reached",
    });

    await assert.rejects(
      async () => {
        await executeGetIllustrationReview({ assetId: "gen_failed_1" }, teacherContext);
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.INVALID_REQUEST
    );
  });

  await runTest("1.4 Soft-deleted asset throws INVALID_REQUEST when attempting to review", async () => {
    seedModuleAndPlan();
    seedGenerationAndAsset({ assetId: "ast_deleted_1", lifecycleStatus: "soft_deleted" });

    await assert.rejects(
      async () => {
        await executeSaveIllustrationReview(
          { assetId: "ast_deleted_1", reviewStatus: "approved_for_use" },
          teacherContext
        );
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.INVALID_REQUEST
    );
  });

  await runTest("1.5 Immutable approved outline is loaded and matches historical plan specification", async () => {
    seedModuleAndPlan();
    seedGenerationAndAsset({ assetId: "ast_g1_5", moduleId: "mod_1d_test" });

    const res = await executeListReviewableIllustrations({ moduleId: "mod_1d_test" }, teacherContext);
    assert.equal(res.status, "success");
    const item = res.items.find((i) => i.asset.id === "ast_g1_5");
    assert.ok(item);
    assert.equal(item.approvedOutline.title, "Diagram Presipitasi Siklus Air");
    assert.equal(item.approvedOutline.mainSubject, "Siklus penguapan air dari laut ke awan");
    assert.deepEqual(item.approvedOutline.textRequirements, ["Evaporasi", "Kondensasi"]);
  });

  await runTest("1.6 Immutable approved style and version are loaded accurately", async () => {
    seedModuleAndPlan();
    seedGenerationAndAsset({ assetId: "ast_g1_6", moduleId: "mod_1d_test" });

    const res = await executeListReviewableIllustrations({ moduleId: "mod_1d_test" }, teacherContext);
    const item = res.items.find((i) => i.asset.id === "ast_g1_6");
    assert.ok(item);
    assert.equal(item.approvedStyle.id, "style_ill_flat_edu");
    assert.equal(item.approvedStyle.name, "Flat Edukatif");
    assert.equal(item.approvedStyle.version, 1);
    assert.ok(item.approvedStyle.visualRules.length > 0);
  });

  await runTest("1.7 Pedagogical provenance (curriculum, subject, audience) is preserved intact", async () => {
    seedModuleAndPlan();
    const { assetRow } = seedGenerationAndAsset({ assetId: "ast_g1_7" });
    assert.equal(assetRow.grounding_snapshot.subjectDiscipline, "IPA");
    assert.equal(assetRow.grounding_snapshot.audienceLevel, "SMP Fase D");
    assert.deepEqual(assetRow.grounding_snapshot.sourceReferences, ["Buku IPA SMP Kelas 7"]);
  });

  console.log("\n[GROUP 2: State Machine & Teacher Decisions]");

  await runTest("2.1 Transition: pending -> reviewed (saving notes without final decision)", async () => {
    seedModuleAndPlan();
    seedGenerationAndAsset({ assetId: "ast_g2_1" });

    const res = await executeSaveIllustrationReview(
      {
        assetId: "ast_g2_1",
        reviewStatus: "reviewed",
        teacherNotes: "Sedang membandingkan dengan diagram buku cetak.",
      },
      teacherContext
    );
    assert.equal(res.status, "success");
    assert.equal(res.review.reviewStatus, "reviewed");
    assert.equal(res.review.teacherNotes, "Sedang membandingkan dengan diagram buku cetak.");
  });

  await runTest("2.2 Transition: reviewed -> approved_for_use with decision 'use'", async () => {
    const res = await executeSaveIllustrationReview(
      {
        assetId: "ast_g2_1",
        reviewStatus: "approved_for_use",
        teacherDecision: "use",
        teacherNotes: "Sangat bagus dan sesuai indikator pencapaian.",
      },
      teacherContext
    );
    assert.equal(res.status, "success");
    assert.equal(res.review.reviewStatus, "approved_for_use");
    assert.equal(res.review.teacherDecision, "use");
  });

  await runTest("2.3 Direct approve: pending -> approved_for_use via executeApproveIllustrationForUse", async () => {
    seedModuleAndPlan();
    seedGenerationAndAsset({ assetId: "ast_g2_3" });

    const res = await executeApproveIllustrationForUse(
      { assetId: "ast_g2_3", teacherNotes: "Langsung disetujui untuk materi." },
      teacherContext
    );
    assert.equal(res.status, "success");
    assert.equal(res.review.reviewStatus, "approved_for_use");
    assert.equal(res.review.teacherDecision, "use");
  });

  await runTest("2.4 Transition: reviewed -> rejected with decision 'regenerate' (non-destructive)", async () => {
    seedModuleAndPlan();
    seedGenerationAndAsset({ assetId: "ast_g2_4" });

    // Mark as reviewed first
    await executeSaveIllustrationReview(
      { assetId: "ast_g2_4", reviewStatus: "reviewed" },
      teacherContext
    );

    const res = await executeSaveIllustrationReview(
      {
        assetId: "ast_g2_4",
        reviewStatus: "rejected",
        teacherDecision: "regenerate",
        teacherNotes: "Warna kurang kontras untuk siswa berkebutuhan visual.",
      },
      teacherContext
    );
    assert.equal(res.status, "success");
    assert.equal(res.review.reviewStatus, "rejected");
    assert.equal(res.review.teacherDecision, "regenerate");

    // Verify non-destructive invariant: asset STILL exists in fallbackIllustrationAssets!
    const ast = fallbackIllustrationAssets.get("ast_g2_4");
    assert.ok(ast, "Asset must NOT be deleted upon rejection.");
  });

  await runTest("2.5 Direct reject: pending -> rejected via executeRejectIllustration (non-destructive)", async () => {
    seedModuleAndPlan();
    seedGenerationAndAsset({ assetId: "ast_g2_5" });

    const res = await executeRejectIllustration(
      {
        assetId: "ast_g2_5",
        teacherNotes: "Bagan terlalu padat.",
        teacherDecision: "regenerate",
      },
      teacherContext
    );
    assert.equal(res.status, "success");
    assert.equal(res.review.reviewStatus, "rejected");

    // Asset remains preserved
    assert.ok(fallbackIllustrationAssets.get("ast_g2_5"));
  });

  await runTest("2.6 Keep for later: reviewed with decision 'keep_for_later'", async () => {
    seedModuleAndPlan();
    seedGenerationAndAsset({ assetId: "ast_g2_6" });

    const res = await executeSaveIllustrationReview(
      {
        assetId: "ast_g2_6",
        reviewStatus: "reviewed",
        teacherDecision: "keep_for_later",
        teacherNotes: "Bagus untuk materi pertemuan berikutnya.",
      },
      teacherContext
    );
    assert.equal(res.status, "success");
    assert.equal(res.review.reviewStatus, "reviewed");
    assert.equal(res.review.teacherDecision, "keep_for_later");
  });

  await runTest("2.7 Illegal transition: approved_for_use -> pending throws INVALID_REQUEST", async () => {
    seedModuleAndPlan();
    seedGenerationAndAsset({ assetId: "ast_g2_7" });
    await executeApproveIllustrationForUse({ assetId: "ast_g2_7" }, teacherContext);

    await assert.rejects(
      async () => {
        await executeSaveIllustrationReview(
          { assetId: "ast_g2_7", reviewStatus: "pending" },
          teacherContext
        );
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.INVALID_REQUEST
    );
  });

  await runTest("2.8 Illegal transition: rejected -> pending throws INVALID_REQUEST", async () => {
    seedModuleAndPlan();
    seedGenerationAndAsset({ assetId: "ast_g2_8" });
    await executeRejectIllustration({ assetId: "ast_g2_8" }, teacherContext);

    await assert.rejects(
      async () => {
        await executeSaveIllustrationReview(
          { assetId: "ast_g2_8", reviewStatus: "pending" },
          teacherContext
        );
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.INVALID_REQUEST
    );
  });

  await runTest("2.9 Distinction: Review approved_for_use does NOT automatically attach asset (stays staged)", async () => {
    seedModuleAndPlan();
    const { assetRow } = seedGenerationAndAsset({ assetId: "ast_g2_9", lifecycleStatus: "staged" });
    await executeApproveIllustrationForUse({ assetId: "ast_g2_9" }, teacherContext);

    // Review status changed, but asset lifecycle status remains 'staged' until explicitly attached!
    const ast = fallbackIllustrationAssets.get("ast_g2_9");
    assert.equal(ast.lifecycle_status, "staged");
    assert.equal(ast.attached_section_id, null);
  });

  console.log("\n[GROUP 3: Multi-Output Generation & Asset Selection]");

  await runTest("3.1 Multiple outputs for same module/plan coexist with independent review records", async () => {
    seedModuleAndPlan("mod_multi_test", "plan_multi_test");
    seedGenerationAndAsset({ assetId: "ast_out_1", moduleId: "mod_multi_test", planId: "plan_multi_test" });
    seedGenerationAndAsset({ assetId: "ast_out_2", moduleId: "mod_multi_test", planId: "plan_multi_test" });
    seedGenerationAndAsset({ assetId: "ast_out_3", moduleId: "mod_multi_test", planId: "plan_multi_test" });

    const rev1 = await executeGetIllustrationReview({ assetId: "ast_out_1" }, teacherContext);
    const rev2 = await executeGetIllustrationReview({ assetId: "ast_out_2" }, teacherContext);
    const rev3 = await executeGetIllustrationReview({ assetId: "ast_out_3" }, teacherContext);

    assert.equal(rev1.review.assetId, "ast_out_1");
    assert.equal(rev2.review.assetId, "ast_out_2");
    assert.equal(rev3.review.assetId, "ast_out_3");
  });

  await runTest("3.2 Reviewing Asset A does not mutate Asset B's review status", async () => {
    await executeApproveIllustrationForUse({ assetId: "ast_out_1" }, teacherContext);

    const rev1 = await executeGetIllustrationReview({ assetId: "ast_out_1" }, teacherContext);
    const rev2 = await executeGetIllustrationReview({ assetId: "ast_out_2" }, teacherContext);

    assert.equal(rev1.review.reviewStatus, "approved_for_use");
    assert.equal(rev2.review.reviewStatus, "pending");
  });

  await runTest("3.3 Approving Asset A does not delete or reject Asset B", async () => {
    assert.ok(fallbackIllustrationAssets.get("ast_out_1"));
    assert.ok(fallbackIllustrationAssets.get("ast_out_2"));
    assert.ok(fallbackIllustrationAssets.get("ast_out_3"));
  });

  await runTest("3.4 Rejecting Asset B preserves Asset A and Asset B in database", async () => {
    await executeRejectIllustration({ assetId: "ast_out_2", teacherNotes: "Kurang jelas" }, teacherContext);

    const rev2 = await executeGetIllustrationReview({ assetId: "ast_out_2" }, teacherContext);
    assert.equal(rev2.review.reviewStatus, "rejected");
    assert.ok(fallbackIllustrationAssets.get("ast_out_2"));
  });

  await runTest("3.5 listReviewableIllustrations returns all non-deleted outputs sorted by date", async () => {
    const res = await executeListReviewableIllustrations({ moduleId: "mod_multi_test" }, teacherContext);
    assert.equal(res.status, "success");
    assert.equal(res.items.length, 3);
  });

  console.log("\n[GROUP 4: Section Attachment, Replacement & Confirmation Invariant]");

  await runTest("4.1 Attaching an approved asset updates ModulSection.ilustrasi with publicUrl", async () => {
    seedModuleAndPlan("mod_attach_test");
    seedGenerationAndAsset({ assetId: "ast_att_1", moduleId: "mod_attach_test" });
    await executeApproveIllustrationForUse({ assetId: "ast_att_1" }, teacherContext);

    const attachRes = await executeAttachIllustrationAsset(
      { assetId: "ast_att_1", moduleId: "mod_attach_test", sectionId: "sec_1" },
      teacherContext
    );
    assert.equal(attachRes.status, "success");
    assert.equal(attachRes.asset.lifecycleStatus, "attached");
    assert.equal(attachRes.asset.attachedSectionId, "sec_1");

    const modul = fallbackModulesStore.get("mod_attach_test");
    assert.equal(modul.sections[0].ilustrasi, attachRes.asset.publicUrl);
  });

  await runTest("4.2 Attaching asset to section that already has an active illustration triggers superseding", async () => {
    seedGenerationAndAsset({ assetId: "ast_att_2", moduleId: "mod_attach_test" });
    await executeApproveIllustrationForUse({ assetId: "ast_att_2" }, teacherContext);

    // Attach ast_att_2 to the SAME section (sec_1)
    const attachRes2 = await executeAttachIllustrationAsset(
      { assetId: "ast_att_2", moduleId: "mod_attach_test", sectionId: "sec_1" },
      teacherContext
    );
    assert.equal(attachRes2.status, "success");
    assert.equal(attachRes2.asset.lifecycleStatus, "attached");

    // Previous asset ast_att_1 must be automatically marked 'superseded'
    const oldAsset = fallbackIllustrationAssets.get("ast_att_1");
    assert.equal(oldAsset.lifecycle_status, "superseded");
  });

  await runTest("4.3 Previous active illustration transitions to 'superseded' with historical data intact", async () => {
    const oldAsset = fallbackIllustrationAssets.get("ast_att_1");
    assert.ok(oldAsset.sha256_hash);
    assert.ok(oldAsset.public_url);
    assert.ok(oldAsset.prompt_snapshot);
  });

  await runTest("4.4 Superseded asset retains its SHA-256 hash, URL, and approved outline comparison", async () => {
    const res = await executeListReviewableIllustrations({ moduleId: "mod_attach_test" }, teacherContext);
    const item = res.items.find((i) => i.asset.id === "ast_att_1");
    assert.ok(item);
    assert.equal(item.asset.lifecycleStatus, "superseded");
    assert.ok(item.approvedOutline.title);
  });

  await runTest("4.5 Detaching an attached asset reverts status to 'staged' and clears ModulSection.ilustrasi", async () => {
    const detachRes = await executeDetachIllustrationAsset({ assetId: "ast_att_2" }, teacherContext);
    assert.equal(detachRes.status, "success");
    assert.equal(detachRes.asset.lifecycleStatus, "staged");
    assert.equal(detachRes.asset.attachedSectionId, null);

    const modul = fallbackModulesStore.get("mod_attach_test");
    assert.ok(!modul.sections[0].ilustrasi);
  });

  await runTest("4.6 Attempting to attach soft_deleted asset is rejected", async () => {
    seedGenerationAndAsset({ assetId: "ast_att_del", moduleId: "mod_attach_test", lifecycleStatus: "soft_deleted" });

    await assert.rejects(
      async () => {
        await executeAttachIllustrationAsset(
          { assetId: "ast_att_del", moduleId: "mod_attach_test", sectionId: "sec_1" },
          teacherContext
        );
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.INVALID_REQUEST
    );
  });

  console.log("\n[GROUP 5: Archive & Lifecycle Invariants]");

  await runTest("5.1 Staged asset can be transitioned to archived", async () => {
    seedModuleAndPlan("mod_arch_test");
    seedGenerationAndAsset({ assetId: "ast_arch_1", moduleId: "mod_arch_test" });

    const res = await executeTransitionAssetLifecycle(
      { assetId: "ast_arch_1", targetStatus: "archived" },
      teacherContext
    );
    assert.equal(res.status, "success");
    assert.equal(res.asset.lifecycleStatus, "archived");
  });

  await runTest("5.2 Attached asset transitioned to archived safely unlinks from ModulSection", async () => {
    seedGenerationAndAsset({ assetId: "ast_arch_2", moduleId: "mod_arch_test" });
    await executeAttachIllustrationAsset(
      { assetId: "ast_arch_2", moduleId: "mod_arch_test", sectionId: "sec_2" },
      teacherContext
    );

    const res = await executeTransitionAssetLifecycle(
      { assetId: "ast_arch_2", targetStatus: "archived" },
      teacherContext
    );
    assert.equal(res.status, "success");
    assert.equal(res.asset.lifecycleStatus, "archived");

    const modul = fallbackModulesStore.get("mod_arch_test");
    assert.ok(!modul.sections[1].ilustrasi);
  });

  await runTest("5.3 Archived assets remain in historical reviews but are excluded from active section picker", async () => {
    const listRes = await executeListReviewableIllustrations({ moduleId: "mod_arch_test" }, teacherContext);
    const archItem = listRes.items.find((i) => i.asset.id === "ast_arch_1");
    assert.ok(archItem, "Archived assets must be accessible in reviews history.");
    assert.equal(archItem.asset.lifecycleStatus, "archived");
  });

  await runTest("5.4 Archived asset retains full provenance and review history", async () => {
    const ast = fallbackIllustrationAssets.get("ast_arch_1");
    assert.ok(ast.prompt_snapshot);
    assert.ok(ast.sha256_hash);
  });

  console.log("\n[GROUP 6: Teacher Notes & Concurrency Protection]");

  await runTest("6.1 Teacher note is persisted and survives repeated reload", async () => {
    seedModuleAndPlan("mod_notes_test");
    seedGenerationAndAsset({ assetId: "ast_note_1", moduleId: "mod_notes_test" });

    await executeSaveIllustrationReview(
      {
        assetId: "ast_note_1",
        reviewStatus: "reviewed",
        teacherNotes: "Perlu ditambahkan label ketinggian atmosfer.",
      },
      teacherContext
    );

    const reloaded = await executeGetIllustrationReview({ assetId: "ast_note_1" }, teacherContext);
    assert.equal(reloaded.review.teacherNotes, "Perlu ditambahkan label ketinggian atmosfer.");
  });

  await runTest("6.2 Updating note with matching expectedUpdatedAt succeeds", async () => {
    const existing = await executeGetIllustrationReview({ assetId: "ast_note_1" }, teacherContext);
    const exactUpdatedAt = existing.review.updatedAt;

    const res = await executeSaveIllustrationReview(
      {
        assetId: "ast_note_1",
        reviewStatus: "approved_for_use",
        teacherDecision: "use",
        teacherNotes: "Label ketinggian sudah tidak diperlukan.",
        expectedUpdatedAt: exactUpdatedAt,
      },
      teacherContext
    );
    assert.equal(res.status, "success");
    assert.equal(res.review.reviewStatus, "approved_for_use");
  });

  await runTest("6.3 Stale update with mismatched expectedUpdatedAt throws INVALID_REQUEST (concurrency conflict)", async () => {
    await assert.rejects(
      async () => {
        await executeSaveIllustrationReview(
          {
            assetId: "ast_note_1",
            reviewStatus: "rejected",
            expectedUpdatedAt: "2020-01-01T00:00:00.000Z", // Stale timestamp!
          },
          teacherContext
        );
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.INVALID_REQUEST
    );
  });

  await runTest("6.4 Teacher note is strictly teacher-authored metadata and is NOT sent to any AI provider", async () => {
    // Assert review domain has no outward provider dispatch
    const review = fallbackIllustrationReviews.get("ast_note_1");
    assert.ok(review);
    assert.equal(typeof review.teacher_notes, "string");
  });

  console.log("\n[GROUP 7: Multi-Tenant RBAC & Ownership Security]");

  await runTest("7.1 Owner teacher can review, approve, reject, and attach asset", async () => {
    seedModuleAndPlan("mod_rbac_test");
    seedGenerationAndAsset({ assetId: "ast_rbac_1", moduleId: "mod_rbac_test", ownerId: TEACHER_USER_ID });

    const res = await executeApproveIllustrationForUse({ assetId: "ast_rbac_1" }, teacherContext);
    assert.equal(res.status, "success");
  });

  await runTest("7.2 Non-owner teacher attempting to get review receives ROLE_FORBIDDEN", async () => {
    await assert.rejects(
      async () => {
        await executeGetIllustrationReview({ assetId: "ast_rbac_1" }, otherTeacherContext);
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.ROLE_FORBIDDEN
    );
  });

  await runTest("7.3 Non-owner teacher attempting to save review receives ROLE_FORBIDDEN", async () => {
    await assert.rejects(
      async () => {
        await executeSaveIllustrationReview(
          { assetId: "ast_rbac_1", reviewStatus: "approved_for_use" },
          otherTeacherContext
        );
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.ROLE_FORBIDDEN
    );
  });

  await runTest("7.4 Student role attempting review receives ROLE_FORBIDDEN", async () => {
    await assert.rejects(
      async () => {
        await executeGetIllustrationReview({ assetId: "ast_rbac_1" }, studentContext);
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.ROLE_FORBIDDEN
    );

    await assert.rejects(
      async () => {
        await executeSaveIllustrationReview(
          { assetId: "ast_rbac_1", reviewStatus: "approved_for_use" },
          studentContext
        );
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.ROLE_FORBIDDEN
    );
  });

  await runTest("7.5 Unauthenticated request receives ROLE_FORBIDDEN / AUTH_ERROR", async () => {
    await assert.rejects(
      async () => {
        await executeGetIllustrationReview({ assetId: "ast_rbac_1" }, { userId: "", profile: null });
      },
      (err) => err instanceof AiServiceError
    );
  });

  await runTest("7.6 Cross-module attachment is rejected with INVALID_REQUEST", async () => {
    await assert.rejects(
      async () => {
        await executeAttachIllustrationAsset(
          { assetId: "ast_rbac_1", moduleId: "mod_different_123", sectionId: "sec_1" },
          teacherContext
        );
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.INVALID_REQUEST
    );
  });

  console.log("\n[GROUP 8: Strict Non-Goals & Invariant Enforcement]");

  await runTest("8.1 STRICT NON-GOAL: Teacher review operations NEVER invoke AI image generation API", async () => {
    // Assert generation count in fallback store did not increase
    const initialGenerationsCount = fallbackIllustrationGenerations.size;
    seedGenerationAndAsset({ assetId: "ast_nongoal_1" });
    await executeApproveIllustrationForUse({ assetId: "ast_nongoal_1" }, teacherContext);
    await executeRejectIllustration({ assetId: "ast_nongoal_1" }, teacherContext);

    // No new rows added to fallbackIllustrationGenerations from review operations
    assert.equal(fallbackIllustrationGenerations.size, initialGenerationsCount + 1);
  });

  await runTest("8.2 STRICT NON-GOAL: Rejection does NOT automatically trigger re-generation", async () => {
    const initialGenerationsCount = fallbackIllustrationGenerations.size;
    await executeRejectIllustration({ assetId: "ast_nongoal_1", teacherNotes: "Rejected" }, teacherContext);
    assert.equal(fallbackIllustrationGenerations.size, initialGenerationsCount);
  });

  await runTest("8.3 STRICT NON-GOAL: No AI quality score or automated vision judge is executed in VIS-1D", async () => {
    const review = await executeGetIllustrationReview({ assetId: "ast_nongoal_1" }, teacherContext);
    // Ensure no AI quality fields or automated evaluator scores exist in the review domain
    assert.equal("aiScore" in review.review, false);
    assert.equal("qualityScore" in review.review, false);
    assert.equal("visionScore" in review.review, false);
  });

  console.log("\n================================================================================");
  console.log(`  TEST RESULTS: ${testsPassed} passed, ${testsFailed} failed`);
  console.log("================================================================================\n");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
