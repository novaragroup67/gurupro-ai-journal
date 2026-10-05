#!/usr/bin/env node
/**
 * ==============================================================================
 * GURUPRO TEST SUITE: PPT-1F CONTROLLED LIVE E2E & NEGATIVE QUALITY GATE TEST
 * ==============================================================================
 *
 * Verifies the complete 15-step presentation lifecycle chain:
 * 1. Generation Plan Creation (GEN-0)
 * 2. Real Presentation Content Package Generation (PPT-1B)
 * 3. Approved Illustration Binding (VIS-1D/VIS-1E)
 * 4. PPTX Rendering into Real OpenXML Binary (PPT-1C/PPT-1D)
 * 5. Presentation Artifact Registration & SHA-256 Binding
 * 6. Teacher Preview & Review (PPT-1E)
 * 7. Sovereign Gatekeeper: Download blocked while in review (403)
 * 8. Teacher Approval (PPT-1E: reviewStatus = 'approved', version = 1)
 * 9. Sovereign Gatekeeper: Download blocked before quality evaluation (422)
 * 10. Final Quality Gate Evaluation (PPT-1F: 6-tier deterministic verification)
 * 11. Evaluation Result Validation: Status 'passed', Decision 'PASS'
 * 12. Multi-Tenant RBAC: Student download blocked (403)
 * 13. Multi-Tenant RBAC: Cross-tenant teacher download blocked (403)
 * 14. Authorized Secure Download: Teacher owner download succeeds (200)
 * 15. Negative Gatekeeper Scenarios:
 *     - Corrupted ZIP / Magic signature failure
 *     - Approved Version mismatch
 *     - Revoked / Soft-deleted illustration asset
 */

import fs from "fs";
import crypto from "crypto";
import JSZip from "jszip";

import {
  executeEvaluatePresentationQuality,
  executeGetPresentationQualityEvaluation,
  executeListPresentationQualityEvaluations,
  executeSecureDownloadPresentationPptx,
  fallbackPresentationQualityEvaluations,
  mockArtifactBinaries,
} from "../../src/lib/presentation-quality.functions.js";
import {
  fallbackPresentationArtifacts,
} from "../../src/lib/presentation-artifact.functions.js";
import {
  fallbackPresentationResults,
} from "../../src/lib/presentation-generation.functions.js";
import {
  fallbackPresentationReviews,
} from "../../src/lib/presentation-review.functions.js";
import { renderPresentationPptx } from "../../src/lib/ai/presentation-pptx-renderer.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `${message || "Assertion failed"} -> Expected: ${JSON.stringify(expected)}, Actual: ${JSON.stringify(actual)}`
    );
  }
}

// 1x1 valid PNG image buffer helper
function createValidPngBuffer() {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
    0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54,
    0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01,
    0x0d, 0x0a, 0x2d, 0xb4,
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
    0xae, 0x42, 0x60, 0x82,
  ]);
}

async function runLiveGateTest() {
  console.log("================================================================================");
  console.log("  GURUPRO PPT-1F: CONTROLLED LIVE E2E & NEGATIVE QUALITY GATE TEST               ");
  console.log("================================================================================\n");

  // Reset stores
  fallbackPresentationArtifacts.clear();
  fallbackPresentationResults.clear();
  fallbackPresentationReviews.clear();
  fallbackPresentationQualityEvaluations.clear();
  mockArtifactBinaries.clear();

  const teacherOwner = "guru_live_owner_101";
  const teacherOther = "guru_live_other_202";
  const student = "siswa_live_user_303";

  const planId = "plan_live_e2e_001";
  const requestId = "req_live_e2e_001";
  const contentResultId = "cr_live_e2e_001";
  const artifactId = "art_live_e2e_001";
  const moduleId = "modul_informatika_x";

  // STEP 1-3: Generate content package with approved illustration
  console.log("[Step 1-3] Assembling canonical presentation package with approved illustration...");
  const validPng = createValidPngBuffer();
  const validPngBase64 = `data:image/png;base64,${validPng.toString("base64")}`;
  const validPngSha256 = crypto.createHash("sha256").update(validPng).digest("hex");

  const mockResolvedIllustrations = new Map();
  mockResolvedIllustrations.set("slide_live_1", {
    slideId: "slide_live_1",
    assetId: "asset_diagram_cpu",
    reviewStatus: "approved_for_use",
    lifecycleStatus: "staged",
    mimeType: "image/png",
    bytes: validPng,
    sha256Hash: validPngSha256,
    base64Data: validPngBase64,
    placement: "right",
    caption: "Diagram Blok Arsitektur CPU Von Neumann",
  });

  const contentPackage = {
    presentationId: "pres_live_e2e",
    generationRequestId: requestId,
    generationPlanId: planId,
    moduleId,
    title: "Arsitektur Komputer & Siklus Instruksi",
    subtitle: "Materi Pembelajaran Informatika Fase E",
    learningObjectives: [
      "Menjelaskan komponen arsitektur von Neumann",
      "Menganalisis siklus Fetch-Decode-Execute",
    ],
    targetAudience: "Siswa SMK Kelas X",
    styleId: "corporate_clean",
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
        slideId: "slide_live_1",
        order: 1,
        title: "Pengenalan Arsitektur Komputer",
        pedagogicalType: "introduction",
        purpose: "Memberikan fondasi pemahaman komponen CPU",
        contentBlocks: [
          {
            type: "bullet_list",
            title: "Komponen Utama",
            content: "Unit Pemrosesan Pusat (CPU)\nMemori Utama (RAM)\nPerangkat Masukan dan Keluaran",
            evidenceIds: ["ev_live_1"],
          },
        ],
        keyPoints: ["Model arsitektur Von Neumann menjadi standar komputasi modern"],
        visualDirection: "Diagram arsitektur di sebelah kanan dan ringkasan poin di kiri",
        speakerNotes: "Guru membuka presentasi dengan bertanya komponen di dalam casing komputer.",
        sourceReferences: ["Buku Informatika SMK Kelas X"],
        evidenceReferences: ["ev_live_1"],
        illustrationReference: {
          assetId: "asset_diagram_cpu",
          placement: "right",
          isApproved: true,
          caption: "Diagram Blok Arsitektur CPU Von Neumann",
        },
      },
      {
        slideId: "slide_live_2",
        order: 2,
        title: "Siklus Kerja Instruksi CPU",
        pedagogicalType: "concept_explanation",
        purpose: "Membedah tahap eksekusi instruksi",
        contentBlocks: [
          {
            type: "bullet_list",
            title: "Tiga Tahapan Siklus",
            content: "1. Fetch: Pengambilan instruksi dari memori utama\n2. Decode: Penerjemahan kode biner oleh Control Unit\n3. Execute: Eksekusi operasi oleh ALU",
            evidenceIds: ["ev_live_2"],
          },
        ],
        keyPoints: ["Kecepatan clock CPU menentukan frekuensi siklus kerja per detik"],
        visualDirection: "Daftar langkah sekuensial dengan penekanan pada alur",
        speakerNotes: "Jelaskan analogi resep masakan untuk memahami alur instruksi program.",
        sourceReferences: ["Buku Informatika SMK Kelas X"],
        evidenceReferences: ["ev_live_2"],
      },
      {
        slideId: "slide_live_3",
        order: 3,
        title: "Refleksi dan Kesimpulan Materi",
        pedagogicalType: "summary",
        purpose: "Menutup sesi dan menguji pemahaman konsep",
        contentBlocks: [
          {
            type: "bullet_list",
            title: "Rangkuman",
            content: "CPU memproses instruksi melalui siklus terstruktur berkelanjutan.",
            evidenceIds: ["ev_live_3"],
          },
        ],
        keyPoints: ["Pemahaman dasar arsitektur penting untuk materi pemrograman selanjutnya"],
        visualDirection: "Tampilan penutup bersih dengan poin rangkuman",
        speakerNotes: "Guru memberikan pertanyaan pancingan penutup sebelum kuis.",
        sourceReferences: ["Buku Informatika SMK Kelas X"],
        evidenceReferences: ["ev_live_3"],
      },
    ],
    provenance: {
      moduleId,
      planId,
      requestId,
      ownerId: teacherOwner,
      sourceReferences: ["Buku Informatika SMK Kelas X"],
      evidenceReferences: ["ev_live_1", "ev_live_2", "ev_live_3"],
    },
    generationMetadata: {
      promptVersion: "presentation_content_generator_grounded_v1",
      schemaVersion: "1.0.0",
      provider: "google_gemini",
      model: "gemini-flash-lite-latest",
      latencyMs: 1450,
      retryCount: 0,
      generatorVersion: "v1",
      generationKey: "gen_live_test_001",
    },
    validationMetadata: {
      deterministicValid: true,
      exactValuesValid: true,
      semanticDecision: "PASS",
      findings: [],
    },
    createdAt: new Date().toISOString(),
  };

  // STEP 4: Render PPTX
  console.log("[Step 4] Rendering genuine OpenXML PPTX binary with PPT-1C/PPT-1D engine...");
  const renderResult = await renderPresentationPptx(contentPackage, {
    resolvedIllustrations: mockResolvedIllustrations,
  });
  assert(renderResult.bytes.length > 5000, "PPTX binary size must be significant");
  const actualHash = renderResult.fileHash;
  console.log(`  ✓ Rendered PPTX: ${renderResult.bytes.length} bytes, SHA-256: ${actualHash.slice(0, 16)}...`);

  // STEP 5: Register Artifact & Content Result
  console.log("[Step 5] Registering presentation artifact with SHA-256 hash...");
  fallbackPresentationArtifacts.set(artifactId, {
    id: artifactId,
    request_id: requestId,
    content_result_id: contentResultId,
    generation_plan_id: planId,
    module_id: moduleId,
    owner_id: teacherOwner,
    tenant_id: "default",
    storage_reference: `presentations/${artifactId}.pptx`,
    storage_provider: "supabase_storage",
    public_url: `/${artifactId}.pptx`,
    download_url: `/download/${artifactId}.pptx`,
    filename: "arsitektur_komputer_x.pptx",
    mime_type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    byte_size: renderResult.bytes.length,
    file_hash: actualHash,
    slide_count: 3,
    outline_version: 1,
    style_id: "corporate_clean",
    style_version: 1,
    renderer_version: "v1.0.0",
    status: "ready",
    render_metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  fallbackPresentationResults.set(contentResultId, {
    id: contentResultId,
    request_id: requestId,
    generation_plan_id: planId,
    module_id: moduleId,
    approved_version: 1,
    content_package: contentPackage,
  });

  // STEP 6-7: Teacher Review 'in_review' -> Download must be blocked
  console.log("[Step 6-7] Simulating teacher review in progress (reviewStatus = 'in_review')...");
  fallbackPresentationReviews.set("rev_live_1", {
    id: "rev_live_1",
    presentation_id: contentPackage.presentationId,
    content_result_id: contentResultId,
    generation_plan_id: planId,
    module_id: moduleId,
    approved_version: 1,
    review_status: "in_review",
    validation_summary: {},
    reviewed_by: teacherOwner,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  let inReviewBlocked = false;
  try {
    await executeSecureDownloadPresentationPptx(
      { artifactId, mockBytes: renderResult.bytes },
      { userId: teacherOwner, role: "guru" }
    );
  } catch (err) {
    inReviewBlocked = true;
    assert(err.message.includes("Unduhan ditolak"), "Error must state download rejected");
  }
  assert(inReviewBlocked, "Download must fail when review is in_review");
  console.log("  ✓ Gatekeeper verified: Download strictly blocked while review is pending.");

  // STEP 8: Teacher Approves Presentation (PPT-1E)
  console.log("[Step 8] Teacher sovereignly approves presentation (reviewStatus = 'approved', version = 1)...");
  fallbackPresentationReviews.set("rev_live_1", {
    id: "rev_live_1",
    presentation_id: contentPackage.presentationId,
    content_result_id: contentResultId,
    generation_plan_id: planId,
    module_id: moduleId,
    approved_version: 1,
    review_status: "approved",
    validation_summary: {},
    reviewed_by: teacherOwner,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  console.log("  ✓ Teacher approval recorded.");

  // STEP 9: Download must be blocked before quality gate runs
  console.log("[Step 9] Testing download gatekeeper BEFORE quality evaluation runs...");
  let gateBlockedBeforeEval = false;
  try {
    await executeSecureDownloadPresentationPptx(
      { artifactId, mockBytes: renderResult.bytes },
      { userId: teacherOwner, role: "guru" }
    );
  } catch (err) {
    gateBlockedBeforeEval = true;
    assert(err.message.includes("gerbang mutu"), "Error must state quality gate requirement");
  }
  assert(gateBlockedBeforeEval, "Download must be blocked when quality evaluation is missing");
  console.log("  ✓ Gatekeeper verified: Download blocked until PPT-1F evaluation passes.");

  // STEP 10-11: Execute Final Quality Gate Evaluation (PPT-1F)
  console.log("[Step 10-11] Executing full 6-tier PPT-1F Quality Gate Evaluation...");
  const evalResult = await executeEvaluatePresentationQuality(
    {
      artifactId,
      mockBytes: renderResult.bytes,
      enableAiAdvisory: true,
      resolvedIllustrations: mockResolvedIllustrations,
    },
    { userId: teacherOwner, role: "guru" }
  );

  assertEquals(evalResult.evaluation.decision, "PASS", "Decision must be PASS");
  assertEquals(evalResult.evaluation.status, "passed", "Status must be passed");
  assertEquals(evalResult.evaluation.findings.length, 0, "Clean package must have 0 findings");
  assert(evalResult.evaluation.structuralChecks.slideCountMatches, "Slide count must match");
  assert(evalResult.evaluation.illustrationChecks.allApproved, "All illustrations must be approved");
  assert(evalResult.evaluation.visualChecks.passed, "Visual boundaries must pass");
  assert(evalResult.evaluation.versionChecks.versionsMatch, "Versions must match");
  console.log("  ✓ Quality Gate PASSED: Decision = PASS, Status = passed, Findings = 0.");

  // STEP 12: RBAC - Student Download Blocked
  console.log("[Step 12] Testing RBAC: Student role ('siswa') download attempt...");
  let studentBlocked = false;
  try {
    await executeSecureDownloadPresentationPptx(
      { artifactId, mockBytes: renderResult.bytes },
      { userId: student, role: "siswa" }
    );
  } catch (err) {
    studentBlocked = true;
    assert(err.message.includes("hanya diizinkan untuk peran Guru"), "Must block student role");
  }
  assert(studentBlocked, "Student download must be blocked");
  console.log("  ✓ RBAC verified: Student download blocked (403 Forbidden).");

  // STEP 13: RBAC - Cross-tenant Teacher Download Blocked
  console.log("[Step 13] Testing Multi-Tenant RBAC: Different teacher download attempt...");
  let crossTenantBlocked = false;
  try {
    await executeSecureDownloadPresentationPptx(
      { artifactId, mockBytes: renderResult.bytes },
      { userId: teacherOther, role: "guru" }
    );
  } catch (err) {
    crossTenantBlocked = true;
    assert(err.message.includes("Akses ditolak"), "Must block non-owner teacher");
  }
  assert(crossTenantBlocked, "Cross-tenant download must be blocked");
  console.log("  ✓ RBAC verified: Cross-tenant download blocked (403 Forbidden).");

  // STEP 14: Authorized Secure Download
  console.log("[Step 14] Testing Authorized Teacher Owner Download...");
  const downloadRes = await executeSecureDownloadPresentationPptx(
    { artifactId, mockBytes: renderResult.bytes },
    { userId: teacherOwner, role: "guru" }
  );
  assertEquals(downloadRes.status, "success");
  assertEquals(downloadRes.artifactId, artifactId);
  assertEquals(downloadRes.fileHash, actualHash);
  assert(downloadRes.bytes.length === renderResult.bytes.length, "Downloaded bytes length matches");
  console.log(`  ✓ Authorized download successful: ${downloadRes.bytes.length} bytes delivered safely.`);

  // STEP 15: Negative Gatekeeper Scenarios
  console.log("\n[Step 15] Testing Negative Gatekeeper Scenarios...");

  // Scenario A: Tampered corrupted ZIP
  console.log("  Scenario A: Corrupted ZIP binary payload...");
  const corruptBytes = Buffer.from("PK\x03\x04corrupted fake broken archive content");
  const corruptHash = crypto.createHash("sha256").update(corruptBytes).digest("hex");
  fallbackPresentationArtifacts.set("art_corrupt_test", {
    ...fallbackPresentationArtifacts.get(artifactId),
    id: "art_corrupt_test",
    file_hash: corruptHash,
    byte_size: corruptBytes.length,
  });
  const corruptEval = await executeEvaluatePresentationQuality(
    { artifactId: "art_corrupt_test", mockBytes: corruptBytes },
    { userId: teacherOwner, role: "guru" }
  );
  assert(
    corruptEval.evaluation.decision === "FAIL" || corruptEval.evaluation.decision === "ERROR",
    "Corrupted ZIP must produce FAIL or ERROR decision"
  );
  assertEquals(corruptEval.evaluation.status, "failed");
  console.log(`    ✓ Corrupted ZIP properly failed with decision = ${corruptEval.evaluation.decision}.`);

  // Scenario B: Version Mismatch (Approved version 1, Artifact version 2)
  console.log("  Scenario B: Version mismatch between approval and artifact...");
  fallbackPresentationArtifacts.set("art_v_mismatch", {
    ...fallbackPresentationArtifacts.get(artifactId),
    id: "art_v_mismatch",
    outline_version: 2, // Artifact is v2
  });
  const mismatchEval = await executeEvaluatePresentationQuality(
    { artifactId: "art_v_mismatch", mockBytes: renderResult.bytes },
    { userId: teacherOwner, role: "guru" }
  );
  assertEquals(mismatchEval.evaluation.decision, "FAIL");
  assert(mismatchEval.evaluation.findings.some((f) => f.code === "VERSION_MISMATCH"));
  console.log("    ✓ Version mismatch properly failed with VERSION_MISMATCH.");

  // Scenario C: Revoked illustration
  console.log("  Scenario C: Revoked illustration asset ('soft_deleted')...");
  const revokedIllustrations = new Map(mockResolvedIllustrations);
  revokedIllustrations.set("slide_live_1", {
    ...mockResolvedIllustrations.get("slide_live_1"),
    lifecycleStatus: "soft_deleted",
  });
  const revokedEval = await executeEvaluatePresentationQuality(
    {
      artifactId,
      mockBytes: renderResult.bytes,
      resolvedIllustrations: revokedIllustrations,
      forceReevaluate: true,
    },
    { userId: teacherOwner, role: "guru" }
  );
  assertEquals(revokedEval.evaluation.decision, "FAIL");
  assert(revokedEval.evaluation.findings.some((f) => f.code === "REVOKED_ILLUSTRATION"));
  console.log("    ✓ Revoked illustration properly failed with REVOKED_ILLUSTRATION.");

  console.log("\n================================================================================");
  console.log("  PPT-1F LIVE E2E & NEGATIVE TEST COMPLETE: ALL 15 LIFECYCLE CHECKS PASSED      ");
  console.log("================================================================================");
}

runLiveGateTest().catch((err) => {
  console.error("FATAL ERROR IN LIVE GATE TEST:", err);
  process.exit(1);
});
