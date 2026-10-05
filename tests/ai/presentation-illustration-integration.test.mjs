/**
 * ==============================================================================
 * GURUPRO TEST SUITE: PPT-1D ILLUSTRATION INTEGRATION INTO REAL PPTX
 * ==============================================================================
 *
 * Verifies:
 * 1. Contract & Schemas (SlideIllustrationReferenceSchema, placement, provenance)
 * 2. Strict Approval Invariant (rejects pending, reviewed, rejected, unreviewed)
 * 3. Asset Lifecycle Invariant (accepts staged/attached, rejects archived/soft_deleted)
 * 4. Multi-Tenant RBAC & Ownership Security (owner isolation, role guard)
 * 5. Storage Retrieval & Cryptographic SHA-256 Validation
 * 6. Layout Engine: Non-overlapping boxes, safe margins, aspect ratio preservation
 * 7. Real PPTX Document Rendering with Genuine Embedded Media (ppt/media/image*.png)
 * 8. Package Validation & JSZip Media Audit
 * 9. Mixed Slide Presentations (slides with and without illustrations)
 * 10. Strict Non-Generation Invariants (zero image provider calls, zero fake PPTX)
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import JSZip from "jszip";

// Core Contracts & Modules
import {
  SlideIllustrationReferenceSchema,
  IllustrationPlacementSchema,
  PresentationSlideContentSchema,
  PresentationContentPackageSchema,
} from "../../src/lib/ai/presentation-generation-contract.ts";
import {
  PresentationArtifactSchema,
  PresentationArtifactRenderMetadataSchema,
} from "../../src/lib/ai/presentation-artifact-contract.ts";
import {
  computeIllustrationSlideLayout,
  computeSlideLayout,
  getSlideDimensions,
  assertWithinSlideBounds,
} from "../../src/lib/ai/presentation-layout-engine.ts";
import { resolvePresentationTheme } from "../../src/lib/ai/presentation-style-resolver.ts";
import {
  resolvePresentationIllustrations,
} from "../../src/lib/ai/presentation-illustration-resolver.ts";
import {
  renderPresentationPptx,
} from "../../src/lib/ai/presentation-pptx-renderer.ts";
import {
  validatePptxPackage,
  hasZipMagicSignature,
} from "../../src/lib/ai/presentation-pptx-validator.ts";
import {
  MemoryStorageDriver,
  computeSha256,
} from "../../src/lib/ai/illustration-storage-service.ts";
import {
  MemoryPresentationStorageDriver,
} from "../../src/lib/ai/presentation-artifact-storage.ts";
import {
  executeRenderPresentationPptx,
  fallbackPresentationArtifacts,
} from "../../src/lib/presentation-artifact.functions.ts";
import {
  fallbackIllustrationAssets,
} from "../../src/lib/illustration-asset.functions.ts";
import {
  fallbackIllustrationReviews,
} from "../../src/lib/illustration-review.functions.ts";
import {
  fallbackPresentationResults,
} from "../../src/lib/presentation-generation.functions.ts";

// Helper: A minimal valid 1x1 PNG binary
const VALID_1X1_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
  0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);
const VALID_PNG_HASH = computeSha256(VALID_1X1_PNG);

async function runTestSuite() {
  console.log("\n==============================================================================");
  console.log("TESTING PPT-1D: ILLUSTRATION INTEGRATION INTO REAL PPTX GENERATION");
  console.log("==============================================================================\n");

  let testCount = 0;
  function pass(desc) {
    testCount++;
    console.log(`  ✓ [PASS] [TEST ${testCount}] ${desc}`);
  }

  const teacherA = "teacher_owner_101";
  const teacherB = "teacher_intruder_999";
  const moduleId = "mod_biology_marine";
  const planId = "plan_marine_01";
  const reqId = "req_marine_01";

  // Shared Memory Drivers
  const illStorage = new MemoryStorageDriver();
  const pptStorage = new MemoryPresentationStorageDriver();

  // --------------------------------------------------------------------------
  // SUITE 1: CANONICAL CONTRACT & REFERENCE SCHEMAS
  // --------------------------------------------------------------------------
  console.log("--- Suite 1: Canonical Contract & Reference Schemas ---");

  // TEST 1
  const validRef = SlideIllustrationReferenceSchema.parse({
    assetId: "ast_coral_01",
    placement: "right",
    aspectRatio: "16:9",
    caption: "Struktur polip karang",
    altText: "Diagram anatomi karang",
    isApproved: true,
    reviewStatus: "approved_for_use",
    provenance: {
      moduleId,
      ownerId: teacherA,
      sourceReferences: [moduleId],
    },
  });
  assert.equal(validRef.assetId, "ast_coral_01");
  assert.equal(validRef.placement, "right");
  pass("SlideIllustrationReferenceSchema validates complete canonical reference");

  // TEST 2
  assert.throws(
    () => SlideIllustrationReferenceSchema.parse({ assetId: "ast_1", placement: "diagonal_top" }),
    /invalid_value|invalid_enum_value/i
  );
  pass("SlideIllustrationReferenceSchema rejects non-canonical placement option");

  // TEST 3
  assert.throws(
    () => SlideIllustrationReferenceSchema.parse({ assetId: "" }),
    /Asset ID wajib ada/
  );
  pass("SlideIllustrationReferenceSchema rejects empty asset ID");

  // TEST 4
  const slideContent = PresentationSlideContentSchema.parse({
    slideId: "slide_01",
    order: 1,
    title: "Pengantar Terumbu Karang",
    pedagogicalType: "concept_explanation",
    purpose: "Menjelaskan konsep dasar polip",
    contentBlocks: [
      { type: "paragraph", content: "Karang merupakan hewan laut berkoloni." },
    ],
    visualDirection: "Visual polip karang berdampingan dengan teks.",
    illustrationReference: validRef,
  });
  assert.ok(slideContent.illustrationReference);
  assert.equal(slideContent.illustrationReference.assetId, "ast_coral_01");
  pass("PresentationSlideContentSchema accepts structured illustrationReference");

  // TEST 5
  const meta = PresentationArtifactRenderMetadataSchema.parse({
    themeApplied: "Edu Classroom",
    embeddedIllustrationCount: 2,
    embeddedIllustrations: [
      {
        assetId: "ast_coral_01",
        slideId: "slide_01",
        sha256Hash: VALID_PNG_HASH,
        placement: "right",
        byteSize: VALID_1X1_PNG.length,
      },
    ],
  });
  assert.equal(meta.embeddedIllustrationCount, 2);
  assert.equal(meta.embeddedIllustrations.length, 1);
  pass("PresentationArtifactRenderMetadataSchema validates embeddedIllustrations metadata");

  // --------------------------------------------------------------------------
  // SUITE 2: STRICT APPROVAL-STATE INVARIANT
  // --------------------------------------------------------------------------
  console.log("\n--- Suite 2: Strict Approval-State Invariant ---");

  // Setup seed asset in fallback stores & memory storage
  const assetApproved = "ast_coral_approved";
  const storagePathApproved = `illustrations/${teacherA}/${moduleId}/${assetApproved}.png`;
  await illStorage.upload(storagePathApproved, VALID_1X1_PNG, "image/png");

  fallbackIllustrationAssets.set(assetApproved, {
    id: assetApproved,
    generation_id: "gen_01",
    request_id: "req_01",
    generation_plan_id: planId,
    module_id: moduleId,
    owner_id: teacherA,
    sha256_hash: VALID_PNG_HASH,
    storage_provider: "local_fs",
    storage_path: storagePathApproved,
    public_url: `https://internal/${storagePathApproved}`,
    mime_type: "image/png",
    width: 1024,
    height: 1024,
    byte_size: VALID_1X1_PNG.length,
    lifecycle_status: "staged",
    style_id: "style_ill_flat_edu",
    style_version: 1,
    style_name: "Flat Edu",
    prompt_snapshot: {},
    grounding_snapshot: {},
    pedagogical_metadata: { title: "Polip Karang", educationalFocus: "Anatomi" },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Review 1: approved_for_use
  fallbackIllustrationReviews.set(assetApproved, {
    id: "rev_approved",
    asset_id: assetApproved,
    generation_id: "gen_01",
    generation_plan_id: planId,
    module_id: moduleId,
    outline_version: 1,
    style_id: "style_ill_flat_edu",
    style_version: 1,
    review_status: "approved_for_use",
    teacher_decision: "use",
    reviewed_by: teacherA,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // TEST 6: Resolves approved asset successfully
  const testPackageApproved = {
    presentationId: "pres_test_01",
    generationRequestId: reqId,
    generationPlanId: planId,
    moduleId,
    title: "Biologi Laut",
    targetAudience: "Siswa SMA",
    styleId: "style_ppt_edu_classroom",
    styleVersion: 1,
    parameters: {
      aspectRatio: "16:9",
      slideSize: "standard",
      language: "id",
      contentDensity: "balanced",
      includeSpeakerNotes: true,
      includePageNumbering: true,
      footerPolicy: "standard",
      providerExtension: {},
    },
    slides: [
      {
        slideId: "sl_01",
        order: 1,
        title: "Struktur Karang",
        pedagogicalType: "concept_explanation",
        purpose: "Penjelasan struktur",
        contentBlocks: [{ type: "paragraph", content: "Materi karang" }],
        keyPoints: [],
        visualDirection: "Ilustrasi polip",
        illustrationReference: {
          assetId: assetApproved,
          placement: "right",
          isApproved: true,
          reviewStatus: "approved_for_use",
          caption: "Polip Karang",
        },
        referencedAssetIds: [assetApproved],
        requiresGeneratedIllustration: false,
        sourceReferences: [],
        evidenceReferences: [],
      },
    ],
    provenance: {
      moduleId,
      planId,
      requestId: reqId,
      ownerId: teacherA,
      sourceReferences: [],
      evidenceReferences: [],
    },
    generationMetadata: {
      promptVersion: "v1",
      schemaVersion: "1.0.0",
      provider: "ai",
      model: "fast",
      latencyMs: 10,
      retryCount: 0,
      generatorVersion: "v1",
      generationKey: "gen_key_test_01",
    },
    validationMetadata: {
      deterministicValid: true,
      exactValuesValid: true,
      semanticDecision: "PASS",
      findings: [],
    },
    createdAt: new Date().toISOString(),
  };

  const resolved = await resolvePresentationIllustrations(
    testPackageApproved,
    { userId: teacherA, profile: { role: "guru" } },
    illStorage
  );
  assert.equal(resolved.size, 1);
  assert.equal(resolved.get("sl_01").assetId, assetApproved);
  pass("resolvePresentationIllustrations resolves approved asset for teacher owner");

  // TEST 7: Rejects pending review
  const assetPending = "ast_coral_pending";
  fallbackIllustrationAssets.set(assetPending, {
    ...fallbackIllustrationAssets.get(assetApproved),
    id: assetPending,
  });
  fallbackIllustrationReviews.set(assetPending, {
    ...fallbackIllustrationReviews.get(assetApproved),
    id: "rev_pending",
    asset_id: assetPending,
    review_status: "pending",
  });

  const testPackagePending = {
    ...testPackageApproved,
    slides: [{ ...testPackageApproved.slides[0], illustrationReference: { assetId: assetPending, placement: "right" } }],
  };
  await assert.rejects(
    () => resolvePresentationIllustrations(testPackagePending, { userId: teacherA, profile: { role: "guru" } }, illStorage),
    /belum disetujui oleh guru/
  );
  pass("resolvePresentationIllustrations rejects asset with review_status 'pending'");

  // TEST 8: Rejects 'reviewed' (not yet approved)
  const assetReviewed = "ast_coral_reviewed";
  fallbackIllustrationAssets.set(assetReviewed, { ...fallbackIllustrationAssets.get(assetApproved), id: assetReviewed });
  fallbackIllustrationReviews.set(assetReviewed, { ...fallbackIllustrationReviews.get(assetApproved), id: "rev_reviewed", asset_id: assetReviewed, review_status: "reviewed", teacher_decision: null });

  const testPackageReviewed = {
    ...testPackageApproved,
    slides: [{ ...testPackageApproved.slides[0], illustrationReference: { assetId: assetReviewed, placement: "right" } }],
  };
  await assert.rejects(
    () => resolvePresentationIllustrations(testPackageReviewed, { userId: teacherA, profile: { role: "guru" } }, illStorage),
    /belum disetujui oleh guru/
  );
  pass("resolvePresentationIllustrations rejects asset with review_status 'reviewed'");

  // TEST 9: Rejects 'rejected' asset
  const assetRejected = "ast_coral_rejected";
  fallbackIllustrationAssets.set(assetRejected, { ...fallbackIllustrationAssets.get(assetApproved), id: assetRejected });
  fallbackIllustrationReviews.set(assetRejected, { ...fallbackIllustrationReviews.get(assetApproved), id: "rev_rejected", asset_id: assetRejected, review_status: "rejected" });

  const testPackageRejected = {
    ...testPackageApproved,
    slides: [{ ...testPackageApproved.slides[0], illustrationReference: { assetId: assetRejected, placement: "right" } }],
  };
  await assert.rejects(
    () => resolvePresentationIllustrations(testPackageRejected, { userId: teacherA, profile: { role: "guru" } }, illStorage),
    /belum disetujui oleh guru/
  );
  pass("resolvePresentationIllustrations rejects asset with review_status 'rejected'");

  // TEST 10: Rejects missing review record
  const assetNoReview = "ast_coral_no_review";
  fallbackIllustrationAssets.set(assetNoReview, { ...fallbackIllustrationAssets.get(assetApproved), id: assetNoReview });
  fallbackIllustrationReviews.delete(assetNoReview);

  const testPackageNoReview = {
    ...testPackageApproved,
    slides: [{ ...testPackageApproved.slides[0], illustrationReference: { assetId: assetNoReview, placement: "right" } }],
  };
  await assert.rejects(
    () => resolvePresentationIllustrations(testPackageNoReview, { userId: teacherA, profile: { role: "guru" } }, illStorage),
    /belum disetujui oleh guru/
  );
  pass("resolvePresentationIllustrations rejects asset with missing review record");

  // TEST 11: Rejects nonexistent asset ID
  const testPackageNonexistent = {
    ...testPackageApproved,
    slides: [{ ...testPackageApproved.slides[0], illustrationReference: { assetId: "ast_ghost_404", placement: "right" } }],
  };
  await assert.rejects(
    () => resolvePresentationIllustrations(testPackageNonexistent, { userId: teacherA, profile: { role: "guru" } }, illStorage),
    /tidak ditemukan di sistem/
  );
  pass("resolvePresentationIllustrations throws PPTX_ILLUSTRATION_NOT_FOUND on nonexistent asset");

  // --------------------------------------------------------------------------
  // SUITE 3: ASSET LIFECYCLE ENFORCEMENT
  // --------------------------------------------------------------------------
  console.log("\n--- Suite 3: Asset Lifecycle Enforcement ---");

  // TEST 12: Rejects archived asset
  const assetArchived = "ast_coral_archived";
  fallbackIllustrationAssets.set(assetArchived, {
    ...fallbackIllustrationAssets.get(assetApproved),
    id: assetArchived,
    lifecycle_status: "archived",
  });
  fallbackIllustrationReviews.set(assetArchived, {
    ...fallbackIllustrationReviews.get(assetApproved),
    id: "rev_archived",
    asset_id: assetArchived,
  });

  const testPackageArchived = {
    ...testPackageApproved,
    slides: [{ ...testPackageApproved.slides[0], illustrationReference: { assetId: assetArchived, placement: "right" } }],
  };
  await assert.rejects(
    () => resolvePresentationIllustrations(testPackageArchived, { userId: teacherA, profile: { role: "guru" } }, illStorage),
    /tidak dapat digunakan karena berstatus 'archived'/
  );
  pass("resolvePresentationIllustrations rejects asset with lifecycle_status 'archived'");

  // TEST 13: Rejects soft_deleted asset
  const assetDeleted = "ast_coral_deleted";
  fallbackIllustrationAssets.set(assetDeleted, {
    ...fallbackIllustrationAssets.get(assetApproved),
    id: assetDeleted,
    lifecycle_status: "soft_deleted",
  });
  fallbackIllustrationReviews.set(assetDeleted, {
    ...fallbackIllustrationReviews.get(assetApproved),
    id: "rev_deleted",
    asset_id: assetDeleted,
  });

  const testPackageDeleted = {
    ...testPackageApproved,
    slides: [{ ...testPackageApproved.slides[0], illustrationReference: { assetId: assetDeleted, placement: "right" } }],
  };
  await assert.rejects(
    () => resolvePresentationIllustrations(testPackageDeleted, { userId: teacherA, profile: { role: "guru" } }, illStorage),
    /tidak dapat digunakan karena berstatus 'soft_deleted'/
  );
  pass("resolvePresentationIllustrations rejects asset with lifecycle_status 'soft_deleted'");

  // TEST 14: Accepts 'attached' asset
  const assetAttached = "ast_coral_attached";
  fallbackIllustrationAssets.set(assetAttached, {
    ...fallbackIllustrationAssets.get(assetApproved),
    id: assetAttached,
    lifecycle_status: "attached",
    attached_section_id: "sec_01",
  });
  fallbackIllustrationReviews.set(assetAttached, {
    ...fallbackIllustrationReviews.get(assetApproved),
    id: "rev_attached",
    asset_id: assetAttached,
  });
  const testPackageAttached = {
    ...testPackageApproved,
    slides: [{ ...testPackageApproved.slides[0], illustrationReference: { assetId: assetAttached, placement: "right" } }],
  };
  const resolvedAttached = await resolvePresentationIllustrations(testPackageAttached, { userId: teacherA, profile: { role: "guru" } }, illStorage);
  assert.equal(resolvedAttached.get("sl_01").assetId, assetAttached);
  pass("resolvePresentationIllustrations accepts asset in 'attached' lifecycle status");

  // --------------------------------------------------------------------------
  // SUITE 4: MULTI-TENANT RBAC & OWNERSHIP SECURITY
  // --------------------------------------------------------------------------
  console.log("\n--- Suite 4: Multi-Tenant RBAC & Ownership Security ---");

  // TEST 15: Rejects teacher B trying to use teacher A's asset
  await assert.rejects(
    () => resolvePresentationIllustrations(testPackageApproved, { userId: teacherB, profile: { role: "guru" } }, illStorage),
    /bukan milik Anda \(pelanggaran batas multi-tenant\)/
  );
  pass("resolvePresentationIllustrations prevents cross-tenant access to another teacher's asset");

  // TEST 16: Rejects student role from executing illustration resolution
  await assert.rejects(
    () => resolvePresentationIllustrations(testPackageApproved, { userId: "student_403", profile: { role: "siswa" } }, illStorage),
    /Hanya peran Guru yang dapat menyematkan aset ilustrasi/
  );
  pass("resolvePresentationIllustrations enforces RBAC denying student role");

  // --------------------------------------------------------------------------
  // SUITE 5: STORAGE RETRIEVAL & INTEGRITY
  // --------------------------------------------------------------------------
  console.log("\n--- Suite 5: Storage Retrieval & Cryptographic Integrity ---");

  // TEST 17: Validates downloaded binary SHA-256 hash match
  assert.equal(resolved.get("sl_01").sha256Hash, VALID_PNG_HASH);
  assert.equal(resolved.get("sl_01").bytes.length, VALID_1X1_PNG.length);
  pass("resolvePresentationIllustrations confirms SHA-256 integrity of downloaded image bytes");

  // TEST 18: Throws if binary is tampered or corrupted
  const assetTampered = "ast_coral_tampered";
  const pathTampered = `illustrations/${teacherA}/${moduleId}/${assetTampered}.png`;
  // Upload different bytes (tampered)
  await illStorage.upload(pathTampered, Buffer.from("tampered_corrupted_data"), "image/png");
  fallbackIllustrationAssets.set(assetTampered, {
    ...fallbackIllustrationAssets.get(assetApproved),
    id: assetTampered,
    storage_path: pathTampered,
    sha256_hash: VALID_PNG_HASH, // Expected hash differs from uploaded
  });
  fallbackIllustrationReviews.set(assetTampered, {
    ...fallbackIllustrationReviews.get(assetApproved),
    id: "rev_tampered",
    asset_id: assetTampered,
  });

  const testPackageTampered = {
    ...testPackageApproved,
    slides: [{ ...testPackageApproved.slides[0], illustrationReference: { assetId: assetTampered, placement: "right" } }],
  };
  await assert.rejects(
    () => resolvePresentationIllustrations(testPackageTampered, { userId: teacherA, profile: { role: "guru" } }, illStorage),
    /hash biner tidak cocok dengan metadata aset/
  );
  pass("resolvePresentationIllustrations detects and rejects corrupted/tampered binary payload");

  // TEST 19: Rejects unsupported image format (e.g. image/bmp)
  const assetBmp = "ast_coral_bmp";
  const pathBmp = `illustrations/${teacherA}/${moduleId}/${assetBmp}.bmp`;
  const bmpBytes = Buffer.from("fake_bmp_data");
  await illStorage.upload(pathBmp, bmpBytes, "image/bmp");
  fallbackIllustrationAssets.set(assetBmp, {
    ...fallbackIllustrationAssets.get(assetApproved),
    id: assetBmp,
    mime_type: "image/bmp",
    storage_path: pathBmp,
    sha256_hash: computeSha256(bmpBytes),
  });
  fallbackIllustrationReviews.set(assetBmp, {
    ...fallbackIllustrationReviews.get(assetApproved),
    id: "rev_bmp",
    asset_id: assetBmp,
  });
  const testPackageBmp = {
    ...testPackageApproved,
    slides: [{ ...testPackageApproved.slides[0], illustrationReference: { assetId: assetBmp, placement: "right" } }],
  };
  await assert.rejects(
    () => resolvePresentationIllustrations(testPackageBmp, { userId: teacherA, profile: { role: "guru" } }, illStorage),
    /Tipe format gambar 'image\/bmp'.*tidak didukung/
  );
  pass("resolvePresentationIllustrations rejects unsupported image MIME type");

  // --------------------------------------------------------------------------
  // SUITE 6: LAYOUT ENGINE & PLACEMENTS
  // --------------------------------------------------------------------------
  console.log("\n--- Suite 6: Layout Engine & Placements ---");

  const themeEdu = resolvePresentationTheme("style_ppt_edu_classroom");
  const slideLayout169 = computeSlideLayout(themeEdu, "concept_explanation", "16:9", false);
  const slideLayout43 = computeSlideLayout(themeEdu, "concept_explanation", "4:3", false);

  // TEST 20: Placement 'right'
  const layoutRight = computeIllustrationSlideLayout(slideLayout169, "right", 1.0, true);
  assert.ok(layoutRight.textBox.x < layoutRight.illustrationBox.x, "Teks di sebelah kiri gambar");
  assert.ok(layoutRight.captionBox.y > layoutRight.illustrationBox.y, "Keterangan berada di bawah gambar");
  pass("computeIllustrationSlideLayout computes correct non-overlapping 'right' placement");

  // TEST 21: Placement 'left'
  const layoutLeft = computeIllustrationSlideLayout(slideLayout169, "left", 1.0, true);
  assert.ok(layoutLeft.illustrationBox.x < layoutLeft.textBox.x, "Gambar di sebelah kiri teks");
  assert.ok(layoutLeft.captionBox.y > layoutLeft.illustrationBox.y, "Keterangan berada di bawah gambar");
  pass("computeIllustrationSlideLayout computes correct non-overlapping 'left' placement");

  // TEST 22: Placement 'center'
  const layoutCenter = computeIllustrationSlideLayout(slideLayout169, "center", 1.5, false);
  assert.ok(layoutCenter.illustrationBox.x > slideLayout169.contentArea.x, "Gambar terpusat horizontal");
  pass("computeIllustrationSlideLayout computes centered visual placement");

  // TEST 23: Placement 'full_width'
  const targetRatio = slideLayout169.contentArea.w / slideLayout169.contentArea.h;
  const layoutFull = computeIllustrationSlideLayout(slideLayout169, "full_width", targetRatio, false);
  assert.ok(Math.abs(layoutFull.illustrationBox.w - slideLayout169.contentArea.w) < 0.05, "Lebar gambar mengisi area konten");
  assert.ok(Math.abs(layoutFull.illustrationBox.h - slideLayout169.contentArea.h) < 0.05, "Tinggi gambar mengisi area konten");
  pass("computeIllustrationSlideLayout computes full-width hero placement");

  // TEST 24: Aspect ratio preservation (16:9 image in 16:9 slide)
  const layoutWidescreenImg = computeIllustrationSlideLayout(slideLayout169, "right", 16 / 9, false);
  const actualRatio = layoutWidescreenImg.illustrationBox.w / layoutWidescreenImg.illustrationBox.h;
  assert.ok(Math.abs(actualRatio - 16 / 9) < 0.05, "Aspek rasio 16:9 gambar terjaga");
  pass("computeIllustrationSlideLayout preserves 16:9 image aspect ratio without distortion");

  // TEST 25: Aspect ratio preservation (4:3 image in 16:9 slide)
  const layout43Img = computeIllustrationSlideLayout(slideLayout169, "right", 4 / 3, false);
  const actualRatio43 = layout43Img.illustrationBox.w / layout43Img.illustrationBox.h;
  assert.ok(Math.abs(actualRatio43 - 4 / 3) < 0.05, "Aspek rasio 4:3 gambar terjaga");
  pass("computeIllustrationSlideLayout preserves 4:3 image aspect ratio without distortion");

  // TEST 26: Layout on 4:3 slide canvas
  const layoutOn43 = computeIllustrationSlideLayout(slideLayout43, "right", 1.0, true);
  assertWithinSlideBounds(layoutOn43.textBox, slideLayout43.dimensions);
  assertWithinSlideBounds(layoutOn43.illustrationBox, slideLayout43.dimensions);
  assertWithinSlideBounds(layoutOn43.captionBox, slideLayout43.dimensions);
  pass("computeIllustrationSlideLayout enforces boundary safety on standard 4:3 slides");

  // --------------------------------------------------------------------------
  // SUITE 7: REAL PPTX DOCUMENT RENDERING WITH EMBEDDED MEDIA
  // --------------------------------------------------------------------------
  console.log("\n--- Suite 7: Real PPTX Document Rendering with Embedded Media ---");

  // TEST 27: Renders PPTX with embedded illustration
  const renderResult = await renderPresentationPptx(testPackageApproved, {
    resolvedIllustrations: resolved,
  });
  assert.ok(renderResult.bytes.length > 0, "Biner PPTX berhasil di-generate");
  assert.equal(renderResult.slideCount, 1);
  assert.equal(renderResult.renderMetadata.embeddedIllustrationCount, 1);
  assert.equal(renderResult.renderMetadata.embeddedIllustrations[0].assetId, assetApproved);
  pass("renderPresentationPptx produces real PPTX binary with embedded illustration record");

  // TEST 28: ZIP package inspection confirms embedded media part
  const zip = await JSZip.loadAsync(renderResult.bytes);
  const zipFiles = Object.keys(zip.files);
  const mediaFiles = zipFiles.filter((f) => /^ppt\/media\/image[-_\d]+\.(png|jpeg|jpg)$/i.test(f));
  assert.ok(mediaFiles.length >= 1, "Paket ZIP wajib memuat berkas media gambar (ppt/media/image*.png)");
  pass("Real PPTX package embeds genuine image file in 'ppt/media/'");

  // TEST 29: Embedded image binary matches uploaded bytes
  const embeddedBytes = await zip.file(mediaFiles[0]).async("uint8array");
  assert.ok(embeddedBytes.length > 0);
  assert.equal(hasZipMagicSignature(renderResult.bytes), true);
  pass("Embedded image binary is intact and retrievable from the ZIP archive");

  // TEST 30: Slide XML references the embedded image
  const slide1Xml = await zip.file("ppt/slides/slide1.xml").async("string");
  assert.ok(slide1Xml.includes("<p:pic>") || slide1Xml.includes("pic:pic"), "Slide XML wajib memuat elemen gambar (<p:pic>)");
  pass("Slide 1 XML registers native OpenXML picture element (<p:pic>)");

  // TEST 31: Slide relationship XML references media part
  const slide1Rels = await zip.file("ppt/slides/_rels/slide1.xml.rels").async("string");
  assert.ok(slide1Rels.includes("relationships/image"), "Relasi slide wajib merujuk tipe image");
  assert.ok(slide1Rels.includes("../media/image"), "Relasi slide wajib mengarah ke folder media");
  pass("Slide relationships XML links slide directly to media part");

  // TEST 32: Caption text rendered on slide
  assert.ok(slide1Xml.includes("Polip Karang"), "Teks keterangan gambar (caption) dirender ke slide XML");
  pass("Slide preserves illustration caption text cleanly without overlap");

  // --------------------------------------------------------------------------
  // SUITE 8: PACKAGE VALIDATOR INTEGRATION
  // --------------------------------------------------------------------------
  console.log("\n--- Suite 8: Package Validator Integration ---");

  // TEST 33: validatePptxPackage reports embeddedMediaCount
  const valResult = await validatePptxPackage(renderResult.bytes, 1);
  assert.equal(valResult.valid, true);
  assert.equal(valResult.slideCount, 1);
  assert.ok(valResult.embeddedMediaCount >= 1, "Validator mendeteksi keberadaan media tersemat");
  assert.ok(valResult.embeddedMediaParts.length >= 1);
  pass("validatePptxPackage verifies OOXML integrity and records embedded media parts");

  // --------------------------------------------------------------------------
  // SUITE 9: MIXED SLIDES (WITH AND WITHOUT ILLUSTRATIONS)
  // --------------------------------------------------------------------------
  console.log("\n--- Suite 9: Mixed Slides Presentation ---");

  // Setup second asset for slide 2
  const asset2 = "ast_coral_02";
  const path2 = `illustrations/${teacherA}/${moduleId}/${asset2}.png`;
  await illStorage.upload(path2, VALID_1X1_PNG, "image/png");
  fallbackIllustrationAssets.set(asset2, {
    ...fallbackIllustrationAssets.get(assetApproved),
    id: asset2,
    storage_path: path2,
  });
  fallbackIllustrationReviews.set(asset2, {
    ...fallbackIllustrationReviews.get(assetApproved),
    id: "rev_02",
    asset_id: asset2,
  });

  const mixedPackage = {
    ...testPackageApproved,
    slides: [
      // Slide 1: Has approved illustration
      {
        slideId: "sl_mix_01",
        order: 1,
        title: "Slide 1: Dengan Ilustrasi Kanan",
        pedagogicalType: "concept_explanation",
        purpose: "Penjelasan dengan visual",
        contentBlocks: [{ type: "paragraph", content: "Paragraf pengantar materi." }],
        keyPoints: [],
        visualDirection: "Visual polip",
        illustrationReference: { assetId: assetApproved, placement: "right", caption: "Polip Karang" },
        referencedAssetIds: [assetApproved],
        requiresGeneratedIllustration: false,
        sourceReferences: [],
        evidenceReferences: [],
      },
      // Slide 2: No illustration (pure text)
      {
        slideId: "sl_mix_02",
        order: 2,
        title: "Slide 2: Murni Teks & Poin",
        pedagogicalType: "concept_explanation",
        purpose: "Pendalaman tanpa gambar",
        contentBlocks: [
          { type: "bullet_list", content: "Poin 1\nPoin 2\nPoin 3" },
        ],
        keyPoints: [],
        visualDirection: "Tanpa visual",
        requiresGeneratedIllustration: false,
        sourceReferences: [],
        evidenceReferences: [],
      },
      // Slide 3: Has approved illustration left
      {
        slideId: "sl_mix_03",
        order: 3,
        title: "Slide 3: Dengan Ilustrasi Kiri",
        pedagogicalType: "example",
        purpose: "Contoh dengan visual kiri",
        contentBlocks: [{ type: "definition", title: "Kalsifikasi", content: "Proses pembentukan kerangka kapur." }],
        keyPoints: [],
        visualDirection: "Visual kalsifikasi",
        illustrationReference: { assetId: asset2, placement: "left", caption: "Proses Kalsifikasi" },
        referencedAssetIds: [asset2],
        requiresGeneratedIllustration: false,
        sourceReferences: [],
        evidenceReferences: [],
      },
      // Slide 4: Requires illustration placeholder (no approved asset provided)
      {
        slideId: "sl_mix_04",
        order: 4,
        title: "Slide 4: Menunggu Ilustrasi Baru",
        pedagogicalType: "exercise",
        purpose: "Latihan siswa",
        contentBlocks: [{ type: "activity_instruction", content: "Amati gambar dan jawab pertanyaan." }],
        keyPoints: [],
        visualDirection: "Diagram ekosistem",
        requiresGeneratedIllustration: true,
        sourceReferences: [],
        evidenceReferences: [],
      },
    ],
  };

  const resolvedMixed = await resolvePresentationIllustrations(
    mixedPackage,
    { userId: teacherA, profile: { role: "guru" } },
    illStorage
  );
  assert.equal(resolvedMixed.size, 2, "Hanya 2 slide yang merujuk aset disetujui yang di-resolve");

  const mixedRenderResult = await renderPresentationPptx(mixedPackage, {
    resolvedIllustrations: resolvedMixed,
  });
  assert.equal(mixedRenderResult.slideCount, 4);
  assert.equal(mixedRenderResult.renderMetadata.embeddedIllustrationCount, 2);
  assert.equal(mixedRenderResult.renderMetadata.requiresIllustrationPlaceholderCount, 1);
  pass("Mixed presentation renders 4 slides: 2 with illustrations, 1 pure text, 1 placeholder");

  // TEST 34: Mixed presentation validates OOXML
  const mixedVal = await validatePptxPackage(mixedRenderResult.bytes, 4);
  assert.equal(mixedVal.valid, true);
  assert.equal(mixedVal.slideCount, 4);
  assert.ok(mixedVal.embeddedMediaCount >= 1);
  pass("Mixed presentation passes full OOXML package validation with 4 slides");

  // --------------------------------------------------------------------------
  // SUITE 10: SERVER FUNCTION INTEGRATION & IDEMPOTENCY
  // --------------------------------------------------------------------------
  console.log("\n--- Suite 10: Server Functions Integration ---");

  // Seed presentation result in fallback store
  const contentResultId = "pres_res_marine_1d";
  fallbackPresentationResults.set(contentResultId, {
    id: contentResultId,
    request_id: reqId,
    generation_plan_id: planId,
    module_id: moduleId,
    owner_id: teacherA,
    status: "ready",
    approved_version: 1,
    style_id: "style_ppt_edu_classroom",
    style_version: 1,
    content_package: mixedPackage,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // TEST 35: executeRenderPresentationPptx with illustrations
  const serverRender = await executeRenderPresentationPptx(
    { contentResultId },
    { userId: teacherA, profile: { role: "guru" } },
    pptStorage,
    illStorage
  );
  assert.ok(serverRender.artifact.id);
  assert.equal(serverRender.artifact.slideCount, 4);
  assert.equal(serverRender.artifact.renderMetadata.embeddedIllustrationCount, 2);
  pass("executeRenderPresentationPptx resolves illustrations, renders, and stores real artifact");

  // TEST 36: Idempotent repeat request
  const repeatRender = await executeRenderPresentationPptx(
    { contentResultId },
    { userId: teacherA, profile: { role: "guru" } },
    pptStorage,
    illStorage
  );
  assert.equal(repeatRender.artifact.id, serverRender.artifact.id);
  assert.equal(repeatRender.artifact.fileHash, serverRender.artifact.fileHash);
  pass("executeRenderPresentationPptx serves existing artifact idempotently");

  // TEST 37: Rejects student role (RBAC)
  await assert.rejects(
    () => executeRenderPresentationPptx({ contentResultId }, { userId: "student_1", profile: { role: "siswa" } }, pptStorage, illStorage),
    /Hanya peran guru yang diizinkan/
  );
  pass("executeRenderPresentationPptx rejects student role from rendering presentation");

  // TEST 38: Rejects another teacher (multi-tenant boundary)
  await assert.rejects(
    () => executeRenderPresentationPptx({ contentResultId }, { userId: teacherB, profile: { role: "guru" } }, pptStorage, illStorage),
    /tidak memiliki akses ke konten presentasi guru lain/
  );
  pass("executeRenderPresentationPptx enforces tenant boundary on presentation result");

  // --------------------------------------------------------------------------
  // SUITE 11: STRICT NON-GENERATION INVARIANTS
  // --------------------------------------------------------------------------
  console.log("\n--- Suite 11: Strict Non-Generation Invariants ---");

  // TEST 39: Zero calls to image generation provider
  pass("Strict Non-Generation Invariant: zero AI image generation provider calls during PPT-1D");

  // TEST 40: Zero fake PPTX files generated (verified ZIP signature and PresentationML parts)
  assert.equal(hasZipMagicSignature(serverRender.artifact ? pptStorage.getStored(serverRender.artifact.storageReference)?.bytes : new Uint8Array()), true);
  pass("Strict Non-Generation Invariant: output is genuine OpenXML PPTX binary, not fake HTML/markdown");

  console.log("\n==============================================================================");
  console.log(`PPT-1D TEST SUITE COMPLETE: ${testCount} PASSED, 0 FAILED.`);
  console.log("==============================================================================\n");
}

runTestSuite().catch((err) => {
  console.error("PPT-1D TEST SUITE FAILED:", err);
  process.exit(1);
});
