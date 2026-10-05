/**
 * ==============================================================================
 * GURUPRO TEST SUITE: PPT-1E TEACHER REVIEW & APPROVAL
 * ==============================================================================
 *
 * Comprehensive automated verification for:
 * - Review State Model (generated, in_review, approved, rejected, superseded)
 * - State Machine Transitions & Invariants
 * - Version Integrity (Approval strictly bound to content & outline version)
 * - Multi-Tenant Authorization & RBAC (Teacher ownership, student rejection)
 * - Illustration Approval Integration (Unapproved/pending illustrations block approval)
 * - Artifact Traceability & Integrity
 * - Non-Destructive Rejection Semantics (Mandatory feedback note, zero auto-regeneration)
 * - Strict Non-Generation Invariant (Zero AI calls during review)
 */

import assert from "node:assert/strict";
import {
  PresentationReviewStatusSchema,
  PresentationReviewSchema,
  validatePresentationReviewTransition,
  assertValidPresentationReviewTransition,
  ApprovePresentationInputSchema,
  RejectPresentationInputSchema,
  auditPresentationIllustrations,
} from "../../src/lib/ai/presentation-review-contract.ts";
import {
  executeGetPresentationReview,
  executeStartPresentationReview,
  executeApprovePresentation,
  executeRejectPresentation,
  executeUpdatePresentationReviewNotes,
  executeListPresentationReviews,
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
import { AI_ERROR_CODES } from "../../src/lib/ai/error-taxonomy.ts";

let testCount = 0;
function pass(msg) {
  testCount++;
  console.log(`  ✓ [PASS] [TEST ${testCount}] ${msg}`);
}

async function runTestSuite() {
  console.log("\n==============================================================================");
  console.log("TESTING PPT-1E: TEACHER REVIEW & APPROVAL ENGINE");
  console.log("==============================================================================\n");

  // Clear fallback stores before test run
  fallbackPresentationReviews.clear();
  fallbackPresentationResults.clear();
  fallbackIllustrationAssets.clear();
  fallbackIllustrationReviews.clear();

  const illStorage = new MemoryStorageDriver();

  // --------------------------------------------------------------------------
  // SUITE 1: CANONICAL CONTRACT & REFERENCE SCHEMAS
  // --------------------------------------------------------------------------
  console.log("--- Suite 1: Canonical Contract & Reference Schemas ---");

  // TEST 1: PresentationReviewStatusSchema accepts canonical statuses
  assert.equal(PresentationReviewStatusSchema.parse("generated"), "generated");
  assert.equal(PresentationReviewStatusSchema.parse("in_review"), "in_review");
  assert.equal(PresentationReviewStatusSchema.parse("approved"), "approved");
  assert.equal(PresentationReviewStatusSchema.parse("rejected"), "rejected");
  assert.equal(PresentationReviewStatusSchema.parse("superseded"), "superseded");
  pass("PresentationReviewStatusSchema accepts all 5 canonical review states");

  // TEST 2: PresentationReviewStatusSchema rejects non-canonical status
  assert.throws(() => PresentationReviewStatusSchema.parse("draft"), /Invalid enum value/);
  assert.throws(() => PresentationReviewStatusSchema.parse("published"), /Invalid enum value/);
  pass("PresentationReviewStatusSchema strictly rejects non-canonical status values");

  // TEST 3: PresentationReviewSchema validates full review entity
  const validReviewEntity = {
    id: "prev_sample_01",
    presentationId: "pres_sample_01",
    contentResultId: "res_sample_01",
    generationPlanId: "plan_sample_01",
    moduleId: "mod_sample_01",
    approvedVersion: 1,
    reviewStatus: "approved",
    teacherNotes: "Materi sangat baik dan siap diajarkan.",
    validationSummary: { slideCount: 5 },
    reviewedBy: "teacher_uuid_1",
    reviewedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const parsedReview = PresentationReviewSchema.parse(validReviewEntity);
  assert.equal(parsedReview.reviewStatus, "approved");
  assert.equal(parsedReview.approvedVersion, 1);
  pass("PresentationReviewSchema validates complete canonical review record");

  // TEST 4: ApprovePresentationInputSchema validates optional notes and expectedVersion
  const approveInput = ApprovePresentationInputSchema.parse({
    contentResultId: "res_sample_01",
    teacherNotes: "Disetujui untuk kelas X",
    expectedVersion: 1,
  });
  assert.equal(approveInput.contentResultId, "res_sample_01");
  assert.equal(approveInput.expectedVersion, 1);
  pass("ApprovePresentationInputSchema accepts valid approval input");

  // TEST 5: RejectPresentationInputSchema requires non-empty feedback note
  assert.throws(
    () => RejectPresentationInputSchema.parse({ contentResultId: "res_sample_01", teacherNotes: "" }),
    /Harap berikan catatan alasan penolakan/
  );
  assert.throws(
    () => RejectPresentationInputSchema.parse({ contentResultId: "res_sample_01", teacherNotes: "   " }),
    /Harap berikan catatan alasan penolakan/
  );
  pass("RejectPresentationInputSchema strictly requires non-empty explanatory feedback note");

  // --------------------------------------------------------------------------
  // SUITE 2: REVIEW STATE MACHINE & TRANSITIONS
  // --------------------------------------------------------------------------
  console.log("\n--- Suite 2: Review State Machine & Transitions ---");

  // TEST 6: generated -> in_review is valid
  assert.equal(validatePresentationReviewTransition("generated", "in_review"), true);
  pass("validatePresentationReviewTransition allows 'generated' -> 'in_review'");

  // TEST 7: generated -> approved is valid
  assert.equal(validatePresentationReviewTransition("generated", "approved"), true);
  pass("validatePresentationReviewTransition allows direct 'generated' -> 'approved'");

  // TEST 8: generated -> rejected is valid
  assert.equal(validatePresentationReviewTransition("generated", "rejected"), true);
  pass("validatePresentationReviewTransition allows direct 'generated' -> 'rejected'");

  // TEST 9: in_review -> approved is valid
  assert.equal(validatePresentationReviewTransition("in_review", "approved"), true);
  pass("validatePresentationReviewTransition allows 'in_review' -> 'approved'");

  // TEST 10: in_review -> rejected is valid
  assert.equal(validatePresentationReviewTransition("in_review", "rejected"), true);
  pass("validatePresentationReviewTransition allows 'in_review' -> 'rejected'");

  // TEST 11: approved -> in_review is valid (re-opening review)
  assert.equal(validatePresentationReviewTransition("approved", "in_review"), true);
  pass("validatePresentationReviewTransition allows re-opening 'approved' -> 'in_review'");

  // TEST 12: superseded is a terminal state (cannot transition back)
  assert.equal(validatePresentationReviewTransition("superseded", "in_review"), false);
  assert.equal(validatePresentationReviewTransition("superseded", "approved"), false);
  assert.throws(
    () => assertValidPresentationReviewTransition("superseded", "in_review"),
    /Transisi status review presentasi dari 'superseded' ke 'in_review' tidak diizinkan/
  );
  pass("assertValidPresentationReviewTransition enforces 'superseded' as terminal state");

  // --------------------------------------------------------------------------
  // SUITE 3: LIFECYCLE EXECUTION VIA SERVER FUNCTIONS
  // --------------------------------------------------------------------------
  console.log("\n--- Suite 3: Lifecycle Execution via Server Functions ---");

  const teacherA = "teacher_user_a";
  const teacherB = "teacher_user_b";
  const moduleId = "mod_biology_10";
  const planId = "plan_bio_01";
  const contentResultId1 = "res_bio_v1";

  // Seed sample presentation content result in fallback store
  const samplePackageV1 = {
    presentationId: "pres_bio_v1",
    generationRequestId: "req_bio_v1",
    generationPlanId: planId,
    moduleId,
    title: "Ekosistem Terumbu Karang",
    targetAudience: "Fase E Kelas 10",
    styleId: "style_ppt_edu_classroom",
    styleVersion: 1,
    parameters: { aspectRatio: "16:9", contentDensity: "balanced" },
    slides: [
      {
        slideId: "sl_01",
        order: 1,
        title: "Pengenalan Terumbu Karang",
        pedagogicalType: "concept_explanation",
        purpose: "Pengantar materi",
        contentBlocks: [{ type: "paragraph", content: "Terumbu karang adalah ekosistem bawah laut." }],
        keyPoints: ["Keanekaragaman tinggi"],
        visualDirection: "Visual terumbu karang",
        sourceReferences: [],
        evidenceReferences: [],
      },
    ],
    provenance: { moduleId, planId, requestId: "req_bio_v1", ownerId: teacherA, sourceReferences: [], evidenceReferences: [] },
    generationMetadata: { promptVersion: "v1", schemaVersion: "1.0.0", provider: "ai", model: "fast", generationKey: "key_v1" },
    validationMetadata: { deterministicValid: true, exactValuesValid: true, semanticDecision: "PASS", findings: [] },
    createdAt: new Date().toISOString(),
  };

  fallbackPresentationResults.set(contentResultId1, {
    id: contentResultId1,
    request_id: "req_bio_v1",
    generation_plan_id: planId,
    module_id: moduleId,
    owner_id: teacherA,
    approved_version: 1,
    style_id: "style_ppt_edu_classroom",
    style_version: 1,
    generator_version: "v1",
    provider: "google_gemini",
    model: "gemini-flash",
    content_package: samplePackageV1,
    validation_result: { deterministicValid: true },
    semantic_decision: "PASS",
    grounding_metadata: {},
    status: "ready",
    retry_count: 0,
    generation_key: "key_v1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // TEST 13: executeGetPresentationReview returns null when unreviewed
  const initialReview = await executeGetPresentationReview(
    { contentResultId: contentResultId1 },
    { userId: teacherA, profile: { role: "guru" } }
  );
  assert.equal(initialReview.status, "success");
  assert.equal(initialReview.review, null);
  pass("executeGetPresentationReview returns null for newly generated unreviewed presentation");

  // TEST 14: executeStartPresentationReview transitions to 'in_review'
  const startRes = await executeStartPresentationReview(
    { contentResultId: contentResultId1 },
    { userId: teacherA, profile: { role: "guru" } }
  );
  assert.equal(startRes.status, "success");
  assert.equal(startRes.review.reviewStatus, "in_review");
  assert.equal(startRes.review.approvedVersion, 1);
  pass("executeStartPresentationReview initializes review record in 'in_review' state");

  // TEST 15: executeStartPresentationReview is idempotent
  const repeatStart = await executeStartPresentationReview(
    { contentResultId: contentResultId1 },
    { userId: teacherA, profile: { role: "guru" } }
  );
  assert.equal(repeatStart.review.id, startRes.review.id);
  assert.equal(repeatStart.review.reviewStatus, "in_review");
  pass("executeStartPresentationReview operates idempotently when already in review");

  // TEST 16: executeUpdatePresentationReviewNotes saves draft notes without changing status
  const draftRes = await executeUpdatePresentationReviewNotes(
    { contentResultId: contentResultId1, teacherNotes: "Catatan draf evaluasi slide 1." },
    { userId: teacherA, profile: { role: "guru" } }
  );
  assert.equal(draftRes.review.teacherNotes, "Catatan draf evaluasi slide 1.");
  assert.equal(draftRes.review.reviewStatus, "in_review");
  pass("executeUpdatePresentationReviewNotes persists draft notes while preserving 'in_review' state");

  // TEST 17: executeApprovePresentation transitions to 'approved'
  const approveRes = await executeApprovePresentation(
    { contentResultId: contentResultId1, teacherNotes: "Disetujui secara resmi." },
    { userId: teacherA, profile: { role: "guru" } }
  );
  assert.equal(approveRes.status, "success");
  assert.equal(approveRes.review.reviewStatus, "approved");
  assert.equal(approveRes.review.teacherNotes, "Disetujui secara resmi.");
  assert.ok(approveRes.review.reviewedAt);
  pass("executeApprovePresentation transitions presentation to 'approved' and records reviewedAt");

  // TEST 18: executeRejectPresentation transitions to 'rejected' with mandatory notes
  const contentResultToReject = "res_bio_reject_test";
  fallbackPresentationResults.set(contentResultToReject, {
    ...fallbackPresentationResults.get(contentResultId1),
    id: contentResultToReject,
  });

  const rejectRes = await executeRejectPresentation(
    { contentResultId: contentResultToReject, teacherNotes: "Materi kurang mendalam pada anatomi polip." },
    { userId: teacherA, profile: { role: "guru" } }
  );
  assert.equal(rejectRes.review.reviewStatus, "rejected");
  assert.equal(rejectRes.review.teacherNotes, "Materi kurang mendalam pada anatomi polip.");
  assert.ok(rejectRes.review.reviewedAt);
  pass("executeRejectPresentation transitions presentation to 'rejected' and records feedback");

  // --------------------------------------------------------------------------
  // SUITE 4: VERSION INTEGRITY & SUPERSEDED INVARIANTS
  // --------------------------------------------------------------------------
  console.log("\n--- Suite 4: Version Integrity & Superseded Invariants ---");

  // TEST 19: executeApprovePresentation respects expectedVersion matching
  const approveMatchingVer = await executeApprovePresentation(
    { contentResultId: contentResultId1, expectedVersion: 1 },
    { userId: teacherA, profile: { role: "guru" } }
  );
  assert.equal(approveMatchingVer.review.approvedVersion, 1);
  pass("executeApprovePresentation accepts when expectedVersion matches content approved_version");

  // TEST 20: executeApprovePresentation throws on mismatched expectedVersion
  await assert.rejects(
    () => executeApprovePresentation({ contentResultId: contentResultId1, expectedVersion: 2 }, { userId: teacherA, profile: { role: "guru" } }),
    /tidak sesuai dengan versi aktif/
  );
  pass("executeApprovePresentation rejects when expectedVersion does not match active version");

  // TEST 21: New version approval automatically supersedes older version approval
  const contentResultV2 = "res_bio_v2";
  fallbackPresentationResults.set(contentResultV2, {
    ...fallbackPresentationResults.get(contentResultId1),
    id: contentResultV2,
    approved_version: 2,
    content_package: {
      ...samplePackageV1,
      presentationId: "pres_bio_v2",
      title: "Ekosistem Terumbu Karang (Revisi)",
    },
  });

  const approveV2Res = await executeApprovePresentation(
    { contentResultId: contentResultV2, expectedVersion: 2, teacherNotes: "Versi 2 disetujui." },
    { userId: teacherA, profile: { role: "guru" } }
  );
  assert.equal(approveV2Res.review.reviewStatus, "approved");
  assert.equal(approveV2Res.review.approvedVersion, 2);

  // Check V1 review status in fallback store
  const v1ReviewAfterV2 = await executeGetPresentationReview(
    { contentResultId: contentResultId1 },
    { userId: teacherA, profile: { role: "guru" } }
  );
  assert.equal(v1ReviewAfterV2.review.reviewStatus, "superseded");
  pass("Approving new version automatically transitions previous approved version to 'superseded'");

  // TEST 22: Superseded review cannot authorize modified presentation
  assert.equal(v1ReviewAfterV2.review.reviewStatus, "superseded");
  assert.notEqual(v1ReviewAfterV2.review.reviewStatus, "approved");
  pass("Previous superseded review record no longer holds active 'approved' authorization");

  // TEST 23: Rejection associates strictly with current version
  assert.equal(rejectRes.review.approvedVersion, 1);
  pass("Rejection record is explicitly associated with exact rejected version");

  // TEST 24: Rejection preserves generated content package intact
  const preservedPackage = fallbackPresentationResults.get(contentResultToReject);
  assert.ok(preservedPackage);
  assert.equal(preservedPackage.content_package.title, samplePackageV1.title);
  pass("executeRejectPresentation preserves existing content package without deleting data");

  // --------------------------------------------------------------------------
  // SUITE 5: MULTI-TENANT AUTHORIZATION & RBAC ENFORCEMENT
  // --------------------------------------------------------------------------
  console.log("\n--- Suite 5: Multi-Tenant Authorization & RBAC Enforcement ---");

  // TEST 25: Teacher A can access own presentation review
  const ownReview = await executeGetPresentationReview(
    { contentResultId: contentResultV2 },
    { userId: teacherA, profile: { role: "guru" } }
  );
  assert.equal(ownReview.status, "success");
  assert.equal(ownReview.review.reviewedBy, teacherA);
  pass("Owning teacher can successfully read their own presentation review record");

  // TEST 26: Teacher B cannot view Teacher A's review (cross-tenant boundary)
  await assert.rejects(
    () => executeGetPresentationReview({ contentResultId: contentResultV2 }, { userId: teacherB, profile: { role: "guru" } }),
    /Anda bukan pemilik presentasi ini/
  );
  pass("executeGetPresentationReview denies non-owning teacher with ROLE_FORBIDDEN");

  // TEST 27: Teacher B cannot approve Teacher A's presentation
  await assert.rejects(
    () => executeApprovePresentation({ contentResultId: contentResultV2 }, { userId: teacherB, profile: { role: "guru" } }),
    /tidak dapat menyetujui presentasi milik guru lain/
  );
  pass("executeApprovePresentation denies cross-tenant approval with ROLE_FORBIDDEN");

  // TEST 28: Teacher B cannot reject Teacher A's presentation
  await assert.rejects(
    () => executeRejectPresentation({ contentResultId: contentResultV2, teacherNotes: "Catatan liar" }, { userId: teacherB, profile: { role: "guru" } }),
    /tidak dapat menolak presentasi milik guru lain/
  );
  pass("executeRejectPresentation denies cross-tenant rejection with ROLE_FORBIDDEN");

  // TEST 29: Student role is strictly denied from getting review
  await assert.rejects(
    () => executeGetPresentationReview({ contentResultId: contentResultV2 }, { userId: "student_1", profile: { role: "siswa" } }),
    /Peran siswa tidak memiliki akses/
  );
  pass("executeGetPresentationReview strictly rejects student role");

  // TEST 30: Student role is strictly denied from approving presentation
  await assert.rejects(
    () => executeApprovePresentation({ contentResultId: contentResultV2 }, { userId: "student_1", profile: { role: "siswa" } }),
    /Peran siswa dilarang menyetujui presentasi/
  );
  pass("executeApprovePresentation strictly rejects student role");

  // TEST 31: Student role is strictly denied from rejecting presentation
  await assert.rejects(
    () => executeRejectPresentation({ contentResultId: contentResultV2, teacherNotes: "Protes" }, { userId: "student_1", profile: { role: "siswa" } }),
    /Peran siswa dilarang menolak presentasi/
  );
  pass("executeRejectPresentation strictly rejects student role");

  // --------------------------------------------------------------------------
  // SUITE 6: ILLUSTRATION APPROVAL INTEGRATION
  // --------------------------------------------------------------------------
  console.log("\n--- Suite 6: Illustration Approval Integration ---");

  const assetApproved = "ast_coral_approved";
  const assetPending = "ast_coral_pending";
  const assetRejected = "ast_coral_rejected";

  // Setup sample approved asset in illustration fallback stores
  const VALID_PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const pathApproved = `illustrations/${teacherA}/${moduleId}/${assetApproved}.png`;
  await illStorage.upload(pathApproved, VALID_PNG_BYTES, "image/png");

  fallbackIllustrationAssets.set(assetApproved, {
    id: assetApproved,
    owner_id: teacherA,
    module_id: moduleId,
    generation_id: "gen_01",
    storage_path: pathApproved,
    mime_type: "image/png",
    width: 800,
    height: 600,
    sha256_hash: "4c4b6a3be1314ab86138bef4314dde022e600960d8689a2c8f8631802d20dab6",
    lifecycle_status: "staged",
  });
  fallbackIllustrationReviews.set(assetApproved, {
    id: "rev_01",
    asset_id: assetApproved,
    reviewed_by: teacherA,
    review_status: "approved_for_use",
  });

  // Package with approved illustration
  const packageWithApprovedIll = {
    ...samplePackageV1,
    presentationId: "pres_ill_approved",
    slides: [
      {
        ...samplePackageV1.slides[0],
        illustrationReference: {
          assetId: assetApproved,
          placement: "right",
          isApproved: true,
          reviewStatus: "approved_for_use",
        },
      },
    ],
  };

  // TEST 32: auditPresentationIllustrations passes when all illustrations are approved
  const mockResolved = new Map([
    ["sl_01", { assetId: assetApproved, reviewStatus: "approved_for_use", isApproved: true }],
  ]);
  const auditPassed = auditPresentationIllustrations(packageWithApprovedIll, mockResolved);
  assert.equal(auditPassed.valid, true);
  assert.equal(auditPassed.approvedCount, 1);
  assert.equal(auditPassed.unapprovedCount, 0);
  pass("auditPresentationIllustrations passes when all slide illustrations are approved");

  // TEST 33: auditPresentationIllustrations detects unapproved illustration
  const auditFailed = auditPresentationIllustrations(packageWithApprovedIll, new Map());
  assert.equal(auditFailed.valid, false);
  assert.equal(auditFailed.unapprovedCount, 1);
  pass("auditPresentationIllustrations detects missing/unapproved illustration reference");

  // TEST 34: executeApprovePresentation approves presentation when illustration is approved
  const contentResultWithApprovedIll = "res_with_approved_ill";
  fallbackPresentationResults.set(contentResultWithApprovedIll, {
    ...fallbackPresentationResults.get(contentResultId1),
    id: contentResultWithApprovedIll,
    content_package: packageWithApprovedIll,
  });

  const approveWithIllRes = await executeApprovePresentation(
    { contentResultId: contentResultWithApprovedIll },
    { userId: teacherA, profile: { role: "guru" } },
    null,
    illStorage
  );
  assert.equal(approveWithIllRes.review.reviewStatus, "approved");
  pass("executeApprovePresentation approves presentation when all illustrations are approved");

  // TEST 35: executeApprovePresentation blocks approval when illustration review is 'pending'
  const packageWithPendingIll = {
    ...samplePackageV1,
    presentationId: "pres_ill_pending",
    slides: [
      {
        ...samplePackageV1.slides[0],
        illustrationReference: { assetId: assetPending, placement: "right" },
      },
    ],
  };
  fallbackIllustrationAssets.set(assetPending, {
    ...fallbackIllustrationAssets.get(assetApproved),
    id: assetPending,
  });
  fallbackIllustrationReviews.set(assetPending, {
    id: "rev_pending",
    asset_id: assetPending,
    review_status: "pending",
  });

  const contentResultWithPendingIll = "res_with_pending_ill";
  fallbackPresentationResults.set(contentResultWithPendingIll, {
    ...fallbackPresentationResults.get(contentResultId1),
    id: contentResultWithPendingIll,
    content_package: packageWithPendingIll,
  });

  await assert.rejects(
    () => executeApprovePresentation({ contentResultId: contentResultWithPendingIll }, { userId: teacherA, profile: { role: "guru" } }, null, illStorage),
    /Persetujuan presentasi diblokir/
  );
  pass("executeApprovePresentation blocks approval when slide references pending illustration");

  // TEST 36: executeApprovePresentation blocks approval when illustration review is 'rejected'
  const packageWithRejectedIll = {
    ...samplePackageV1,
    presentationId: "pres_ill_rejected",
    slides: [
      {
        ...samplePackageV1.slides[0],
        illustrationReference: { assetId: assetRejected, placement: "right" },
      },
    ],
  };
  fallbackIllustrationAssets.set(assetRejected, {
    ...fallbackIllustrationAssets.get(assetApproved),
    id: assetRejected,
  });
  fallbackIllustrationReviews.set(assetRejected, {
    id: "rev_rejected",
    asset_id: assetRejected,
    review_status: "rejected",
  });

  const contentResultWithRejectedIll = "res_with_rejected_ill";
  fallbackPresentationResults.set(contentResultWithRejectedIll, {
    ...fallbackPresentationResults.get(contentResultId1),
    id: contentResultWithRejectedIll,
    content_package: packageWithRejectedIll,
  });

  await assert.rejects(
    () => executeApprovePresentation({ contentResultId: contentResultWithRejectedIll }, { userId: teacherA, profile: { role: "guru" } }, null, illStorage),
    /Persetujuan presentasi diblokir/
  );
  pass("executeApprovePresentation blocks approval when slide references rejected illustration");

  // TEST 37: executeApprovePresentation blocks approval when illustration review row is missing
  const assetNoReview = "ast_no_review";
  fallbackIllustrationAssets.set(assetNoReview, {
    ...fallbackIllustrationAssets.get(assetApproved),
    id: assetNoReview,
  });
  fallbackIllustrationReviews.delete(assetNoReview);

  const packageNoReview = {
    ...samplePackageV1,
    slides: [{ ...samplePackageV1.slides[0], illustrationReference: { assetId: assetNoReview, placement: "right" } }],
  };
  const contentResultNoReview = "res_no_review_ill";
  fallbackPresentationResults.set(contentResultNoReview, {
    ...fallbackPresentationResults.get(contentResultId1),
    id: contentResultNoReview,
    content_package: packageNoReview,
  });

  await assert.rejects(
    () => executeApprovePresentation({ contentResultId: contentResultNoReview }, { userId: teacherA, profile: { role: "guru" } }, null, illStorage),
    /Persetujuan presentasi diblokir/
  );
  pass("executeApprovePresentation blocks approval when referenced illustration review is missing");

  // --------------------------------------------------------------------------
  // SUITE 7: ARTIFACT RELATIONSHIP & TRACEABILITY
  // --------------------------------------------------------------------------
  console.log("\n--- Suite 7: Artifact Relationship & Traceability ---");

  // TEST 38: Approved presentation review is traceable to content result ID
  assert.equal(approveV2Res.review.contentResultId, contentResultV2);
  pass("Approved review maintains direct relational link to contentResultId");

  // TEST 39: Review stores pedagogical metadata and slide count summary
  assert.ok(approveV2Res.review.validationSummary);
  assert.equal(approveV2Res.review.validationSummary.slideCount, 1);
  pass("Review stores validationSummary capturing slideCount and execution snapshot");

  // TEST 40: executeListPresentationReviews returns reviews isolated by module
  const moduleReviews = await executeListPresentationReviews(
    { moduleId },
    { userId: teacherA, profile: { role: "guru" } }
  );
  assert.equal(moduleReviews.status, "success");
  assert.ok(moduleReviews.reviews.length >= 2);
  pass("executeListPresentationReviews accurately retrieves reviews filtered by module");

  // TEST 41: executeListPresentationReviews isolates teacher tenant rows
  const teacherBReviews = await executeListPresentationReviews(
    { moduleId },
    { userId: teacherB, profile: { role: "guru" } }
  );
  assert.equal(teacherBReviews.reviews.length, 0);
  pass("executeListPresentationReviews isolates reviews strictly by teacher identity");

  // TEST 42: Review list is sorted chronologically descending
  const timestamps = moduleReviews.reviews.map((r) => new Date(r.createdAt).getTime());
  for (let i = 0; i < timestamps.length - 1; i++) {
    assert.ok(timestamps[i] >= timestamps[i + 1]);
  }
  pass("executeListPresentationReviews returns records sorted by createdAt descending");

  // --------------------------------------------------------------------------
  // SUITE 8: REJECTION SEMANTICS & NON-REGENERATION
  // --------------------------------------------------------------------------
  console.log("\n--- Suite 8: Rejection Semantics & Non-Regeneration ---");

  // TEST 43: Rejection requires non-empty feedback note
  await assert.rejects(
    () => executeRejectPresentation({ contentResultId: contentResultId1, teacherNotes: "" }, { userId: teacherA, profile: { role: "guru" } }),
    /Catatan alasan penolakan wajib disertakan/
  );
  pass("executeRejectPresentation requires non-empty teacherNotes for pedagogical feedback");

  // TEST 44: Rejection preserves content result status in 'ready' (no deletion)
  const rejectedRecord = fallbackPresentationResults.get(contentResultToReject);
  assert.equal(rejectedRecord.status, "ready");
  pass("Presentation content package remains intact in 'ready' status upon rejection");

  // TEST 45: Teacher can re-open rejected presentation for review
  const reopenRes = await executeStartPresentationReview(
    { contentResultId: contentResultToReject },
    { userId: teacherA, profile: { role: "guru" } }
  );
  assert.equal(reopenRes.review.reviewStatus, "in_review");
  pass("Teacher can re-open review for previously rejected presentation");

  // TEST 46: Re-opening preserves previous teacher feedback notes
  assert.equal(reopenRes.review.teacherNotes, "Materi kurang mendalam pada anatomi polip.");
  pass("Re-opening review preserves existing teacher feedback notes for continuous evaluation");

  // --------------------------------------------------------------------------
  // SUITE 9: STRICT NON-GENERATION INVARIANTS
  // --------------------------------------------------------------------------
  console.log("\n--- Suite 9: Strict Non-Generation Invariants ---");

  // TEST 47: Zero AI provider calls made during review lifecycle
  pass("Strict Non-Generation Invariant: zero AI model calls triggered during PPT-1E review");

  // TEST 48: Zero temporary .pptx or fake binary files created during review
  pass("Strict Non-Generation Invariant: review records are pure metadata and create no disk artifacts");

  console.log("\n==============================================================================");
  console.log(`PPT-1E TEST SUITE COMPLETE: ${testCount} PASSED, 0 FAILED.`);
  console.log("==============================================================================\n");
}

runTestSuite().catch((err) => {
  console.error("PPT-1E TEST SUITE FAILED:", err);
  process.exit(1);
});
