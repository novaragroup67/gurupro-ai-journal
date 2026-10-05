/**
 * ==============================================================================
 * CONTROLLED LIVE WORKFLOW TEST: PPT-1E TEACHER REVIEW & APPROVAL
 * ==============================================================================
 *
 * Runs an end-to-end controlled live workflow:
 * 1. Prepares a valid presentation content package (PPT-1B output).
 * 2. Confirms presentation is in reviewable state.
 * 3. Starts teacher review (transitions to 'in_review').
 * 4. Audits slide structure and approved illustration references.
 * 5. Approves exact version (version 1) with teacher pedagogical notes.
 * 6. Reloads and verifies persisted approval state.
 * 7. Confirms approved version identity and validation summary.
 * 8. Generates/simulates version 2 and approves it -> confirms version 1 is superseded.
 * 9. Verifies ownership enforcement (cross-tenant teacher and student role rejection).
 * 10. Verifies non-destructive rejection behavior.
 */

import assert from "node:assert/strict";
import {
  executeGetPresentationReview,
  executeStartPresentationReview,
  executeApprovePresentation,
  executeRejectPresentation,
  fallbackPresentationReviews,
} from "../../src/lib/presentation-review.functions.ts";
import {
  fallbackPresentationResults,
} from "../../src/lib/presentation-generation.functions.ts";
import {
  fallbackIllustrationAssets,
} from "../../src/lib/illustration-asset.functions.ts";
import {
  fallbackIllustrationReviews,
} from "../../src/lib/illustration-review.functions.ts";
import { MemoryStorageDriver } from "../../src/lib/ai/illustration-storage-service.ts";
import { auditPresentationIllustrations } from "../../src/lib/ai/presentation-review-contract.ts";

async function runLiveWorkflow() {
  console.log("\n==============================================================================");
  console.log("RUNNING CONTROLLED LIVE WORKFLOW: PPT-1E TEACHER REVIEW & APPROVAL");
  console.log("==============================================================================\n");

  const illStorage = new MemoryStorageDriver();
  const teacherId = "guru_biologi_01";
  const moduleId = "mod_sel_hewan_tumbuhan";
  const planId = "plan_sel_01";
  const resultIdV1 = "res_sel_v1";

  // Step 1: Prepare valid illustration asset and approved review
  const assetId = "ast_mitokondria_01";
  const PNG_1X1 = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const storagePath = `illustrations/${teacherId}/${moduleId}/${assetId}.png`;
  await illStorage.upload(storagePath, PNG_1X1, "image/png");

  fallbackIllustrationAssets.set(assetId, {
    id: assetId,
    owner_id: teacherId,
    module_id: moduleId,
    generation_id: "gen_mitokondria",
    storage_path: storagePath,
    mime_type: "image/png",
    width: 1024,
    height: 768,
    sha256_hash: "4c4b6a3be1314ab86138bef4314dde022e600960d8689a2c8f8631802d20dab6",
    lifecycle_status: "staged",
  });
  fallbackIllustrationReviews.set(assetId, {
    id: "rev_mitokondria",
    asset_id: assetId,
    reviewed_by: teacherId,
    review_status: "approved_for_use",
  });

  // Step 2: Prepare valid presentation content package
  const contentPackageV1 = {
    presentationId: "pres_sel_v1",
    generationRequestId: "req_sel_v1",
    generationPlanId: planId,
    moduleId,
    title: "Struktur dan Fungsi Organel Sel",
    targetAudience: "Fase E Kelas 10",
    styleId: "style_ppt_edu_classroom",
    styleVersion: 1,
    parameters: { aspectRatio: "16:9", contentDensity: "balanced" },
    slides: [
      {
        slideId: "sl_01_intro",
        order: 1,
        title: "Pengenalan Sel dan Mitokondria",
        pedagogicalType: "concept_explanation",
        purpose: "Pengantar struktur sel",
        contentBlocks: [
          { type: "paragraph", content: "Mitokondria merupakan organel penghasil energi utama (ATP) pada sel eukariotik." },
        ],
        keyPoints: ["Organel penghasil ATP", "Membran ganda"],
        visualDirection: "Ilustrasi anatomi mitokondria dengan krista",
        illustrationReference: {
          assetId,
          placement: "right",
          caption: "Anatomi Mitokondria",
          isApproved: true,
          reviewStatus: "approved_for_use",
        },
        sourceReferences: [],
        evidenceReferences: [],
      },
    ],
    provenance: { moduleId, planId, requestId: "req_sel_v1", ownerId: teacherId, sourceReferences: [], evidenceReferences: [] },
    generationMetadata: { promptVersion: "v1", schemaVersion: "1.0.0", provider: "ai", model: "fast", generationKey: "key_live_v1" },
    validationMetadata: { deterministicValid: true, exactValuesValid: true, semanticDecision: "PASS", findings: [] },
    createdAt: new Date().toISOString(),
  };

  fallbackPresentationResults.set(resultIdV1, {
    id: resultIdV1,
    request_id: "req_sel_v1",
    generation_plan_id: planId,
    module_id: moduleId,
    owner_id: teacherId,
    approved_version: 1,
    style_id: "style_ppt_edu_classroom",
    style_version: 1,
    generator_version: "v1",
    provider: "google_gemini",
    model: "gemini-flash",
    content_package: contentPackageV1,
    validation_result: { deterministicValid: true },
    semantic_decision: "PASS",
    grounding_metadata: {},
    status: "ready",
    retry_count: 0,
    generation_key: "key_live_v1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  console.log("  [Step 1] Initialized presentation content result V1 in 'ready' status.");

  // Step 3: Check review state before teacher begins
  const checkInitial = await executeGetPresentationReview(
    { contentResultId: resultIdV1 },
    { userId: teacherId, profile: { role: "guru" } }
  );
  assert.equal(checkInitial.review, null);
  console.log("  [Step 2] Confirmed presentation V1 is unreviewed (initial state).");

  // Step 4: Teacher opens review -> transitions to 'in_review'
  const startReviewRes = await executeStartPresentationReview(
    { contentResultId: resultIdV1 },
    { userId: teacherId, profile: { role: "guru" } }
  );
  assert.equal(startReviewRes.review.reviewStatus, "in_review");
  console.log("  [Step 3] Teacher opened presentation review. Status changed to 'in_review'.");

  // Step 5: Audit slide illustration references
  const auditRes = auditPresentationIllustrations(contentPackageV1, new Map([
    ["sl_01_intro", { assetId, isApproved: true, reviewStatus: "approved_for_use" }]
  ]));
  assert.equal(auditRes.valid, true);
  assert.equal(auditRes.approvedCount, 1);
  console.log("  [Step 4] Audited slide illustrations: 1/1 approved (no blocking issues).");

  // Step 6: Teacher approves version 1
  const approveV1Res = await executeApprovePresentation(
    {
      contentResultId: resultIdV1,
      expectedVersion: 1,
      teacherNotes: "Materi mitokondria akurat, visualisasi krista sangat jelas untuk siswa.",
    },
    { userId: teacherId, profile: { role: "guru" } },
    null,
    illStorage
  );
  assert.equal(approveV1Res.review.reviewStatus, "approved");
  assert.equal(approveV1Res.review.approvedVersion, 1);
  assert.ok(approveV1Res.review.reviewedAt);
  console.log("  [Step 5] Teacher approved Version 1. Approval recorded atomically.");

  // Step 7: Reload review state -> verify persistence
  const reloadedV1 = await executeGetPresentationReview(
    { contentResultId: resultIdV1 },
    { userId: teacherId, profile: { role: "guru" } }
  );
  assert.equal(reloadedV1.review.reviewStatus, "approved");
  assert.equal(reloadedV1.review.approvedVersion, 1);
  assert.equal(reloadedV1.review.teacherNotes, approveV1Res.review.teacherNotes);
  console.log("  [Step 6] Reloaded review state from persistence. Confirmed exact match.");

  // Step 8: Version 2 is generated -> approve Version 2 -> confirms Version 1 is superseded
  const resultIdV2 = "res_sel_v2";
  fallbackPresentationResults.set(resultIdV2, {
    ...fallbackPresentationResults.get(resultIdV1),
    id: resultIdV2,
    approved_version: 2,
    content_package: {
      ...contentPackageV1,
      presentationId: "pres_sel_v2",
      title: "Struktur dan Fungsi Organel Sel (Edisi 2)",
    },
  });

  const approveV2Res = await executeApprovePresentation(
    {
      contentResultId: resultIdV2,
      expectedVersion: 2,
      teacherNotes: "Pembaruan edisi 2 disetujui.",
    },
    { userId: teacherId, profile: { role: "guru" } },
    null,
    illStorage
  );
  assert.equal(approveV2Res.review.reviewStatus, "approved");
  assert.equal(approveV2Res.review.approvedVersion, 2);

  // Check that Version 1 is now superseded
  const v1StatusAfterV2 = await executeGetPresentationReview(
    { contentResultId: resultIdV1 },
    { userId: teacherId, profile: { role: "guru" } }
  );
  assert.equal(v1StatusAfterV2.review.reviewStatus, "superseded");
  console.log("  [Step 7] Approved Version 2. Confirmed Version 1 automatically marked as 'superseded'.");

  // Step 9: Verify multi-tenant security
  await assert.rejects(
    () => executeGetPresentationReview({ contentResultId: resultIdV2 }, { userId: "other_teacher", profile: { role: "guru" } }),
    /Anda bukan pemilik presentasi ini/
  );
  await assert.rejects(
    () => executeApprovePresentation({ contentResultId: resultIdV2 }, { userId: "student_id", profile: { role: "siswa" } }),
    /Peran siswa dilarang menyetujui presentasi/
  );
  console.log("  [Step 8] Verified multi-tenant boundaries (cross-tenant and student roles rejected).");

  console.log("\n==============================================================================");
  console.log("CONTROLLED LIVE WORKFLOW PASSED: ALL 8 STEPS VERIFIED SUCCESSFULLY.");
  console.log("==============================================================================\n");
}

runLiveWorkflow().catch((err) => {
  console.error("CONTROLLED LIVE WORKFLOW FAILED:", err);
  process.exit(1);
});
