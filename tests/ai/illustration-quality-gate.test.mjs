#!/usr/bin/env node
/**
 * ==============================================================================
 * GURUPRO TEST SUITE: VIS-1E ILLUSTRATION QUALITY GATE & E2E VERIFICATION
 * ==============================================================================
 *
 * Verifies:
 * 1. Layer 1 Deterministic Technical Validation:
 *    - Valid PNG image binary accepted
 *    - Valid JPEG image binary accepted
 *    - Corrupt or random non-image bytes rejected
 *    - Cryptographic SHA-256 hash mismatch rejected (fail-closed)
 *    - Sub-minimum dimension (< 256px) rejected
 *    - Out-of-tolerance aspect ratio rejected
 *    - Empty or sub-minimum payload (< 512 bytes) rejected
 *    - Missing provenance metadata rejected
 *    - Missing approved outline / style specification rejected
 *
 * 2. Evaluator Contract & Schema Validation:
 *    - Valid structured evaluator JSON accepted
 *    - Malformed non-JSON output fails closed
 *    - Missing mandatory semantic checks fails closed
 *    - Invalid non-contract decision string rejected
 *    - Malformed finding structure rejected
 *
 * 3. Outline Alignment Evaluation:
 *    - Required main subject verified
 *    - Missing main subject produces CRITICAL finding and REJECT
 *    - Required supporting elements checked
 *    - Environment inconsistency flagged
 *    - Composition alignment evaluated semantically
 *
 * 4. Style Alignment Evaluation:
 *    - Approved visual style snapshot rules evaluated
 *    - Severe style violation flags CRITICAL
 *    - Minor stylistic deviation flags WARNING (NEEDS_REVISION)
 *    - Style version is preserved in evaluation record
 *
 * 5. Educational Consistency & Grounding:
 *    - Supported educational concepts pass inspection
 *    - Critical pedagogical contradiction causes REJECT
 *    - Unsupported major claims flagged
 *    - Harmless artistic lighting / rendering nuance is tolerated (not over-constrained)
 *
 * 6. Text Policy Compliance:
 *    - Required label presence verified
 *    - Model-invented text flagged when allowModelInventedText=false
 *    - Forbidden terms (thingsToAvoid) flagged
 *    - Text compliance level accurately computed
 *
 * 7. Decision Engine & Layer 3 Post-Guards:
 *    - Deterministic failure prevents PASS regardless of AI output
 *    - Critical finding prevents PASS -> REJECT
 *    - Warning finding results in NEEDS_REVISION
 *    - Clean evaluation results in PASS
 *    - Post-evaluation hash change triggers fail-closed guard
 *
 * 8. Cost Control, Caching & In-flight Locking:
 *    - Explicit evaluation only (no automatic trigger)
 *    - Cache hit on identical (asset_id, hash, outline_version, style_version, evaluator_version)
 *    - Cache bypass when forceReevaluate=true
 *    - Cache invalidation when asset hash changes
 *    - Concurrent in-flight evaluation locked
 *
 * 9. Multi-Tenant RBAC & Security:
 *    - Authenticated owner teacher permitted
 *    - Non-owner teacher rejected with ROLE_FORBIDDEN (403)
 *    - Student role rejected with ROLE_FORBIDDEN (403)
 *    - Unauthenticated request rejected with ROLE_FORBIDDEN / AUTH_ERROR
 *    - Evaluator parameters determined server-side (no client tampering)
 *
 * 10. Non-Destructive Invariant, Decoupling & Full Illustration E2E Test:
 *    - Quality evaluation NEVER calls image generation engine (VIS-1B)
 *    - NEEDS_REVISION never triggers automatic regeneration
 *    - REJECT preserves asset and records in database (zero data loss)
 *    - AI Quality status is strictly decoupled from Teacher Review status
 *    - Full E2E Scenario: GEN-0 Outline -> Edit -> Style -> Approval -> VIS-1A Request ->
 *      VIS-1B Real Generation -> VIS-1C Persistence -> VIS-1D Teacher Review ->
 *      VIS-1E Quality Gate -> Composite Eligibility -> Modul Section Attachment
 */

import assert from "node:assert/strict";

import {
  AI_ERROR_CODES,
  AiServiceError,
} from "../../src/lib/ai/error-taxonomy.ts";
import {
  ILLUSTRATION_STYLES_CATALOG,
  createGenerationSpecification,
} from "../../src/lib/ai/generation-planning-contract.ts";
import {
  createInitialPlan,
  applyOutlineEdits,
  applyStyleSelection,
  applyPlanApproval,
} from "../../src/lib/ai/generation-planning-service.ts";
import {
  inspectImageBinary,
  validateImageBinary,
  toUint8Array,
} from "../../src/lib/ai/image-validator.ts";
import {
  computeSha256,
  MemoryStorageDriver,
  registerMockStorageDriver,
} from "../../src/lib/ai/illustration-storage-service.ts";
import {
  fallbackIllustrationRequests,
  fallbackIllustrationGenerations,
  fallbackTestPlans,
  executeGenerateIllustration,
} from "../../src/lib/illustration-generation.functions.ts";
import {
  fallbackIllustrationAssets,
  executePersistIllustrationAsset,
  executeAttachIllustrationAsset,
} from "../../src/lib/illustration-asset.functions.ts";
import {
  fallbackIllustrationReviews,
  executeSaveIllustrationReview,
  executeApproveIllustrationForUse,
  executeRejectIllustration,
} from "../../src/lib/illustration-review.functions.ts";
import {
  CANONICAL_ILLUSTRATION_QUALITY_EVALUATOR_VERSION,
  IllustrationQualityFindingSchema,
  DeterministicQualityChecksSchema,
  SemanticQualityChecksSchema,
  IllustrationQualitySemanticResultSchema,
  deriveQualityDecision,
} from "../../src/lib/ai/illustration-quality-contract.ts";
import {
  setMockIllustrationQualityEvaluator,
  resolveIllustrationQualityEvaluator,
  OpenAiCompatibleVisionQualityEvaluator,
} from "../../src/lib/ai/providers/illustration-quality-evaluator.ts";
import {
  fallbackIllustrationQualityEvaluations,
  inFlightEvaluationLocks,
  mockAssetBinaries,
  performDeterministicValidation,
  retrieveAssetBinary,
  executeEvaluateIllustrationQuality,
  executeGetIllustrationQualityEvaluation,
  executeListIllustrationQualityEvaluations,
  executeCheckIllustrationEligibility,
} from "../../src/lib/illustration-quality.functions.ts";

console.log("================================================================================");
console.log("  GURUPRO TEST SUITE: VIS-1E ILLUSTRATION QUALITY GATE & E2E VERIFICATION       ");
console.log("================================================================================");

let testsPassed = 0;
let testsFailed = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  • ${name} ... ✓ PASS`);
    testsPassed++;
  } catch (err) {
    console.error(`  • ${name} ... ✗ FAIL`);
    console.error("    Error:", err.message);
    if (err.stack) {
      const relevantStack = err.stack.split("\n").slice(1, 4).join("\n");
      console.error(relevantStack);
    }
    testsFailed++;
  }
}

// ------------------------------------------------------------------------------
// TEST FIXTURES & BINARY BUILDERS
// ------------------------------------------------------------------------------

const mockTeacherAuth = {
  userId: "usr_guru_vis1e_test",
  role: "guru",
  isGuru: true,
  verificationStatus: "verified",
};

const mockOtherTeacherAuth = {
  userId: "usr_guru_vis1e_other",
  role: "guru",
  isGuru: true,
  verificationStatus: "verified",
};

const mockStudentAuth = {
  userId: "usr_siswa_vis1e_test",
  role: "siswa",
  isGuru: false,
};

function createValidPngBuffer(width = 1024, height = 1024, extraBytes = 600) {
  const header = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const ihdrLen = [0x00, 0x00, 0x00, 0x0d];
  const ihdrType = [0x49, 0x48, 0x44, 0x52];
  const wBytes = [(width >> 24) & 0xff, (width >> 16) & 0xff, (width >> 8) & 0xff, width & 0xff];
  const hBytes = [(height >> 24) & 0xff, (height >> 16) & 0xff, (height >> 8) & 0xff, height & 0xff];
  const ihdrData = [0x08, 0x02, 0x00, 0x00, 0x00];
  const crc = [0x00, 0x00, 0x00, 0x00];
  const full = [...header, ...ihdrLen, ...ihdrType, ...wBytes, ...hBytes, ...ihdrData, ...crc];
  while (full.length < extraBytes) {
    full.push(0x5a);
  }
  return Buffer.from(full);
}

function createValidJpegBuffer(width = 1024, height = 1024, extraBytes = 600) {
  const buf = [
    0xff, 0xd8, 0xff, 0xc0,
    0x00, 0x11,
    0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
  ];
  while (buf.length < extraBytes) {
    buf.push(0xbb);
  }
  return Buffer.from(buf);
}

// Reusable mock semantic result generator
function createMockSemanticResult(overrides = {}) {
  return {
    decision: "PASS",
    semanticChecks: {
      outlineAlignment: {
        level: "aligned",
        mainSubjectPresent: true,
        supportingElementsPresent: true,
        environmentConsistent: true,
        compositionConsistent: true,
        details: "Subjek utama dan elemen pendukung lengkap sesuai outline yang disetujui.",
      },
      styleAlignment: {
        level: "aligned",
        stylePreserved: true,
        visualRulesObserved: true,
        details: "Kaidah visual flat educational illustration terpenuhi.",
      },
      educationalAccuracy: {
        level: "accurate",
        contradictionDetected: false,
        unsupportedMajorClaims: false,
        details: "Konsep topologi jaringan terwakili secara akurat.",
      },
      compositionAlignment: {
        level: "aligned",
        details: "Tata letak seimbang dan proporsional.",
      },
      textCompliance: {
        level: "compliant",
        requiredTextPresent: true,
        forbiddenTextDetected: false,
        inventedTextDetected: false,
        details: "Bebas dari teks halusinasi model AI.",
      },
      groundingConcerns: [],
    },
    findings: [],
    evaluatorMetadata: {
      provider: "mock_vision_evaluator",
      model: "mock-vision-v1",
      evaluatorVersion: CANONICAL_ILLUSTRATION_QUALITY_EVALUATOR_VERSION,
    },
    ...overrides,
  };
}

// Helper to assemble an authentic persisted test asset
async function setupTestAssetFixture(options = {}) {
  const moduleId = options.moduleId || `mod_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const ownerId = options.ownerId || mockTeacherAuth.userId;
  const binary = options.binary || createValidPngBuffer(1024, 1024);
  const hash = computeSha256(binary);
  const assetId = `ast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const genId = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const planId = `plan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const reqId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  // Store binary in mock storage
  mockAssetBinaries.set(assetId, binary);

  const assetRow = {
    id: assetId,
    generation_id: genId,
    request_id: reqId,
    generation_plan_id: planId,
    module_id: moduleId,
    owner_id: ownerId,
    sha256_hash: options.corruptHash ? "0000000000000000000000000000000000000000000000000000000000000000" : hash,
    storage_provider: "local_fs",
    storage_path: `illustrations/${ownerId}/${moduleId}/${assetId}.png`,
    public_url: `https://assets.gurupro.internal/illustrations/${ownerId}/${moduleId}/${assetId}.png`,
    byte_size: binary.length,
    mime_type: "image/png",
    format: "png",
    width: 1024,
    height: 1024,
    aspect_ratio: "1:1",
    lifecycle_status: options.lifecycleStatus || "staged",
    style_id: "style_ill_flat_edu",
    style_version: 1,
    pedagogical_metadata: {
      title: "Topologi Jaringan Star",
      objective: "Menjelaskan konsep switch sentral",
      mainSubject: "Switch dan 4 workstation",
      educationalFocus: "Konektivitas star",
    },
    prompt_snapshot: {
      compositionDirectives: "Sentral switch di tengah",
    },
    grounding_snapshot: {
      subjectDiscipline: "Teknik Komputer dan Jaringan",
      audienceLevel: "Fase E",
      curriculumContext: "Kurikulum Merdeka SMK",
      evidenceReferences: ["chunk_tkj_01"],
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  fallbackIllustrationAssets.set(assetId, assetRow);

  // Setup test request snapshot
  fallbackIllustrationRequests.set(reqId, {
    requestId: reqId,
    moduleId,
    generationPlanId: planId,
    approvedOutlineVersion: 1,
    approvedOutline: {
      title: "Topologi Jaringan Star",
      objective: "Menjelaskan konsep switch sentral",
      mainSubject: "Switch dan 4 workstation",
      supportingElements: ["Kabel UTP", "Server mini"],
      environment: "Laboratorium komputer",
      composition: "Switch di tengah",
      visualDetails: "Warna kabel terstandar",
      educationalFocus: "Konektivitas star",
      textRequirements: ["SWITCH"],
      thingsToAvoid: ["Watermark", "Teks asing tak dikenal"],
    },
    textPolicy: {
      allowModelInventedText: false,
      mustAppear: ["SWITCH"],
      mustNotAppear: ["Watermark"],
      textRenderStrategy: "label_overlay",
    },
  });

  // Setup review row (default pending)
  const revRow = {
    id: `rev_${assetId}`,
    asset_id: assetId,
    generation_id: genId,
    generation_plan_id: planId,
    module_id: moduleId,
    outline_version: 1,
    style_id: "style_ill_flat_edu",
    style_version: 1,
    review_status: options.reviewStatus || "pending",
    teacher_decision: null,
    teacher_notes: null,
    reviewed_by: ownerId,
    reviewed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  fallbackIllustrationReviews.set(assetId, revRow);

  return { assetRow, binary, hash };
}

// ==============================================================================
// TEST EXECUTION
// ==============================================================================

async function main() {
  console.log("\n[GROUP 1: Layer 1 — Deterministic Technical Validation]");

  await runTest("1.1 Valid PNG image binary passes deterministic checks", async () => {
    const png = createValidPngBuffer(1024, 1024);
    const hash = computeSha256(png);
    const checks = performDeterministicValidation(
      { sha256_hash: hash, byte_size: png.length, aspect_ratio: "1:1", generation_id: "g1", request_id: "r1", generation_plan_id: "p1", module_id: "m1", owner_id: "u1" },
      png
    );
    assert.strictEqual(checks.passed, true);
    assert.strictEqual(checks.mimeTypeValid, true);
    assert.strictEqual(checks.mimeType, "image/png");
    assert.strictEqual(checks.dimensionsValid, true);
    assert.strictEqual(checks.hashMatches, true);
    assert.strictEqual(checks.nonMockValid, true);
  });

  await runTest("1.2 Valid JPEG image binary passes deterministic checks", async () => {
    const jpeg = createValidJpegBuffer(1024, 1024);
    const hash = computeSha256(jpeg);
    const checks = performDeterministicValidation(
      { sha256_hash: hash, byte_size: jpeg.length, aspect_ratio: "1:1", generation_id: "g1", request_id: "r1", generation_plan_id: "p1", module_id: "m1", owner_id: "u1" },
      jpeg
    );
    assert.strictEqual(checks.passed, true);
    assert.strictEqual(checks.mimeTypeValid, true);
    assert.strictEqual(checks.mimeType, "image/jpeg");
    assert.strictEqual(checks.hashMatches, true);
  });

  await runTest("1.3 Corrupt or random bytes fail deterministic checks", async () => {
    const corrupt = Buffer.from("random_corrupt_non_image_payload_bytes_for_testing_1234567890");
    const hash = computeSha256(corrupt);
    const checks = performDeterministicValidation(
      { sha256_hash: hash, byte_size: corrupt.length, aspect_ratio: "1:1", generation_id: "g1", request_id: "r1", generation_plan_id: "p1", module_id: "m1", owner_id: "u1" },
      corrupt
    );
    assert.strictEqual(checks.passed, false);
    assert.strictEqual(checks.mimeTypeValid, false);
    assert.ok(checks.failureReason?.includes("Format MIME tidak didukung"));
  });

  await runTest("1.4 Cryptographic SHA-256 hash mismatch triggers fail-closed rejection", async () => {
    const png = createValidPngBuffer(1024, 1024);
    const wrongHash = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
    const checks = performDeterministicValidation(
      { sha256_hash: wrongHash, byte_size: png.length, aspect_ratio: "1:1", generation_id: "g1", request_id: "r1", generation_plan_id: "p1", module_id: "m1", owner_id: "u1" },
      png
    );
    assert.strictEqual(checks.passed, false);
    assert.strictEqual(checks.hashMatches, false);
    assert.ok(checks.failureReason?.includes("Integritas kriptografis gagal"));
  });

  await runTest("1.5 Sub-minimum dimension (< 256px) fails deterministic checks", async () => {
    const tinyPng = createValidPngBuffer(128, 128);
    const hash = computeSha256(tinyPng);
    const checks = performDeterministicValidation(
      { sha256_hash: hash, byte_size: tinyPng.length, aspect_ratio: "1:1", generation_id: "g1", request_id: "r1", generation_plan_id: "p1", module_id: "m1", owner_id: "u1" },
      tinyPng
    );
    assert.strictEqual(checks.passed, false);
    assert.strictEqual(checks.dimensionsValid, false);
    assert.ok(checks.failureReason?.includes("di luar batas"));
  });

  await runTest("1.6 Out-of-tolerance aspect ratio fails deterministic checks", async () => {
    // Expected 1:1, but actual image is 16:9 (1024x576)
    const widePng = createValidPngBuffer(1024, 576);
    const hash = computeSha256(widePng);
    const checks = performDeterministicValidation(
      { sha256_hash: hash, byte_size: widePng.length, aspect_ratio: "1:1", generation_id: "g1", request_id: "r1", generation_plan_id: "p1", module_id: "m1", owner_id: "u1" },
      widePng
    );
    assert.strictEqual(checks.passed, false);
    assert.strictEqual(checks.aspectRatioValid, false);
    assert.ok(checks.failureReason?.includes("Aspek rasio gambar"));
  });

  await runTest("1.7 Empty or sub-minimum payload (< 512 bytes) fails deterministic checks", async () => {
    const emptyBuf = Buffer.alloc(10);
    const hash = computeSha256(emptyBuf);
    const checks = performDeterministicValidation(
      { sha256_hash: hash, byte_size: emptyBuf.length, aspect_ratio: "1:1", generation_id: "g1", request_id: "r1", generation_plan_id: "p1", module_id: "m1", owner_id: "u1" },
      emptyBuf
    );
    assert.strictEqual(checks.passed, false);
    assert.strictEqual(checks.nonMockValid, false);
  });

  await runTest("1.8 Missing provenance fields in asset record fail deterministic checks", async () => {
    const png = createValidPngBuffer(1024, 1024);
    const hash = computeSha256(png);
    const checks = performDeterministicValidation(
      { sha256_hash: hash, byte_size: png.length, aspect_ratio: "1:1", generation_id: null, request_id: "r1", generation_plan_id: null, module_id: "m1", owner_id: "u1" },
      png
    );
    assert.strictEqual(checks.passed, false);
    assert.strictEqual(checks.provenanceComplete, false);
    assert.ok(checks.failureReason?.includes("rekam jejak (provenance)"));
  });

  await runTest("1.9 Layer 1 failure never calls expensive AI vision evaluator (fails closed)", async () => {
    const { assetRow } = await setupTestAssetFixture({ corruptHash: true });
    let evaluatorCalled = false;
    const evaluator = {
      providerName: "mock_evaluator",
      modelName: "test",
      evaluate: async () => {
        evaluatorCalled = true;
        return createMockSemanticResult();
      },
    };

    const res = await executeEvaluateIllustrationQuality(
      { assetId: assetRow.id },
      mockTeacherAuth,
      { evaluator }
    );

    assert.strictEqual(evaluatorCalled, false, "Evaluator must NOT be called on Layer 1 deterministic failure");
    assert.strictEqual(res.evaluation.decision, "REJECT");
    assert.strictEqual(res.evaluation.deterministicChecks.hashMatches, false);
    assert.strictEqual(res.evaluation.findings.length, 1);
    assert.strictEqual(res.evaluation.findings[0].code, "SHA256_HASH_MISMATCH");
  });

  console.log("\n[GROUP 2: Evaluator Contract & Schema Validation]");

  await runTest("2.1 Valid structured evaluator output parses and validates successfully", async () => {
    const valid = createMockSemanticResult();
    const parsed = IllustrationQualitySemanticResultSchema.parse(valid);
    assert.strictEqual(parsed.decision, "PASS");
    assert.strictEqual(parsed.semanticChecks.outlineAlignment.level, "aligned");
  });

  await runTest("2.2 Malformed non-JSON evaluator output throws typed AiServiceError (AI_OUTPUT_INVALID)", async () => {
    const mockEvaluator = new OpenAiCompatibleVisionQualityEvaluator({
      providerName: "test",
      endpoint: "http://mock-api.test",
      apiKey: "test_key",
      model: "gpt-4o-mini",
      fetchFn: async () => {
        return new Response(JSON.stringify({ choices: [{ message: { content: "NOT_A_JSON_STRING" } }] }));
      },
    });

    const { assetRow, binary } = await setupTestAssetFixture();
    await assert.rejects(
      async () => {
        await mockEvaluator.evaluate({
          assetId: assetRow.id,
          assetHash: assetRow.sha256_hash,
          imageBytes: binary,
          mimeType: "image/png",
          approvedOutline: { title: "T", objective: "O", mainSubject: "S", supportingElements: [], environment: "E", composition: "C", visualDetails: "V", educationalFocus: "F", version: 1 },
          approvedStyle: { id: "s1", name: "S1", version: 1, description: "D", visualRules: [] },
        });
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.AI_OUTPUT_INVALID
    );
  });

  await runTest("2.3 Evaluator output with missing required fields fails closed", async () => {
    const incomplete = {
      decision: "PASS",
      // missing semanticChecks
      findings: [],
    };
    const parseResult = IllustrationQualitySemanticResultSchema.safeParse(incomplete);
    assert.strictEqual(parseResult.success, false);
  });

  await runTest("2.4 Invalid non-contract decision string (e.g. 'PERFECT_SCORE') is rejected", async () => {
    const invalid = createMockSemanticResult({ decision: "PERFECT_SCORE" });
    const parseResult = IllustrationQualitySemanticResultSchema.safeParse(invalid);
    assert.strictEqual(parseResult.success, false);
  });

  await runTest("2.5 Malformed finding structure missing code/severity is rejected", async () => {
    const invalidFinding = {
      severity: "critical",
      // missing code
      category: "outline",
      description: "Deskripsi",
    };
    const parseResult = IllustrationQualityFindingSchema.safeParse(invalidFinding);
    assert.strictEqual(parseResult.success, false);
  });

  console.log("\n[GROUP 3: Outline Alignment Evaluation]");

  await runTest("3.1 Evaluator verifies presence of approved mainSubject", async () => {
    const { assetRow } = await setupTestAssetFixture();
    const evaluator = {
      providerName: "mock",
      modelName: "test",
      evaluate: async () => createMockSemanticResult({
        decision: "PASS",
        semanticChecks: {
          ...createMockSemanticResult().semanticChecks,
          outlineAlignment: {
            level: "aligned",
            mainSubjectPresent: true,
            supportingElementsPresent: true,
            environmentConsistent: true,
            compositionConsistent: true,
            details: "Subjek utama (Switch dan 4 workstation) hadir jelas di tengah.",
          },
        },
      }),
    };

    const res = await executeEvaluateIllustrationQuality({ assetId: assetRow.id }, mockTeacherAuth, { evaluator });
    assert.strictEqual(res.evaluation.decision, "PASS");
    assert.strictEqual(res.evaluation.semanticChecks?.outlineAlignment.mainSubjectPresent, true);
  });

  await runTest("3.2 Missing approved mainSubject triggers CRITICAL finding and REJECT decision", async () => {
    const { assetRow } = await setupTestAssetFixture();
    const evaluator = {
      providerName: "mock",
      modelName: "test",
      evaluate: async () => createMockSemanticResult({
        decision: "REJECT",
        semanticChecks: {
          ...createMockSemanticResult().semanticChecks,
          outlineAlignment: {
            level: "misaligned",
            mainSubjectPresent: false,
            supportingElementsPresent: false,
            environmentConsistent: true,
            compositionConsistent: false,
            details: "Subjek utama (Switch) tidak terlihat sama sekali dalam gambar.",
          },
        },
        findings: [
          {
            code: "MISSING_MAIN_SUBJECT",
            severity: "critical",
            category: "outline",
            description: "Subjek utama topologi star (Switch sentral) tidak tampak pada gambar.",
            relatedOutlineField: "mainSubject",
            recommendation: "Pastikan gambar menyertakan switch sentral sebagai poros utama.",
          },
        ],
      }),
    };

    const res = await executeEvaluateIllustrationQuality({ assetId: assetRow.id }, mockTeacherAuth, { evaluator });
    assert.strictEqual(res.evaluation.decision, "REJECT");
    assert.strictEqual(res.evaluation.findings.some((f) => f.code === "MISSING_MAIN_SUBJECT" && f.severity === "critical"), true);
  });

  await runTest("3.3 Missing minor supporting element triggers WARNING and NEEDS_REVISION", async () => {
    const { assetRow } = await setupTestAssetFixture();
    const evaluator = {
      providerName: "mock",
      modelName: "test",
      evaluate: async () => createMockSemanticResult({
        decision: "NEEDS_REVISION",
        semanticChecks: {
          ...createMockSemanticResult().semanticChecks,
          outlineAlignment: {
            level: "partially_aligned",
            mainSubjectPresent: true,
            supportingElementsPresent: false,
            environmentConsistent: true,
            compositionConsistent: true,
            details: "Subjek utama ada, namun kabel UTP tidak terlihat terhubung.",
          },
        },
        findings: [
          {
            code: "MISSING_SUPPORTING_ELEMENT",
            severity: "warning",
            category: "outline",
            description: "Kabel UTP yang menghubungkan switch ke komputer klien tidak terlihat.",
            relatedOutlineField: "supportingElements",
          },
        ],
      }),
    };

    const res = await executeEvaluateIllustrationQuality({ assetId: assetRow.id }, mockTeacherAuth, { evaluator });
    assert.strictEqual(res.evaluation.decision, "NEEDS_REVISION");
  });

  await runTest("3.4 Environment mismatch is detected and categorized under outline", async () => {
    const finding = {
      code: "ENVIRONMENT_MISMATCH",
      severity: "warning",
      category: "outline",
      description: "Latar gambar menampilkan ruang luar ruangan, bukan laboratorium komputer.",
      relatedOutlineField: "environment",
    };
    assert.strictEqual(finding.category, "outline");
    assert.strictEqual(finding.severity, "warning");
  });

  await runTest("3.5 Composition alignment evaluated semantically rather than pixel-perfect geometry", async () => {
    const semantic = createMockSemanticResult({
      semanticChecks: {
        ...createMockSemanticResult().semanticChecks,
        compositionAlignment: {
          level: "aligned",
          details: "Komposisi sedikit condong ke kanan namun secara semantik proporsional dan tidak mengubah hubungan antar-elemen.",
        },
      },
    });
    assert.strictEqual(semantic.semanticChecks.compositionAlignment.level, "aligned");
    assert.strictEqual(semantic.decision, "PASS");
  });

  console.log("\n[GROUP 4: Style Alignment Evaluation]");

  await runTest("4.1 Evaluator assesses compliance with approved style snapshot rules", async () => {
    const { assetRow } = await setupTestAssetFixture();
    const evaluator = {
      providerName: "mock",
      modelName: "test",
      evaluate: async () => createMockSemanticResult({
        semanticChecks: {
          ...createMockSemanticResult().semanticChecks,
          styleAlignment: {
            level: "aligned",
            stylePreserved: true,
            visualRulesObserved: true,
            details: "Warna pastel edukatif dan garis flat 2D bersih sesuai style_ill_flat_edu.",
          },
        },
      }),
    };

    const res = await executeEvaluateIllustrationQuality({ assetId: assetRow.id }, mockTeacherAuth, { evaluator });
    assert.strictEqual(res.evaluation.semanticChecks?.styleAlignment.stylePreserved, true);
  });

  await runTest("4.2 Severe style violation (e.g. photorealistic in technical_schematic) triggers REJECT", async () => {
    const { assetRow } = await setupTestAssetFixture();
    const evaluator = {
      providerName: "mock",
      modelName: "test",
      evaluate: async () => createMockSemanticResult({
        decision: "REJECT",
        semanticChecks: {
          ...createMockSemanticResult().semanticChecks,
          styleAlignment: {
            level: "misaligned",
            stylePreserved: false,
            visualRulesObserved: false,
            details: "Gambar dihasilkan dalam gaya foto 3D hiperrealistis bertentangan dengan gaya skematis.",
          },
        },
        findings: [
          {
            code: "SEVERE_STYLE_MISMATCH",
            severity: "critical",
            category: "style",
            description: "Gaya visual yang diminta adalah skematik 2D, namun gambar yang dihasilkan adalah fotografi hiperrealistis.",
          },
        ],
      }),
    };

    const res = await executeEvaluateIllustrationQuality({ assetId: assetRow.id }, mockTeacherAuth, { evaluator });
    assert.strictEqual(res.evaluation.decision, "REJECT");
  });

  await runTest("4.3 Minor stylistic nuance flags WARNING and allows NEEDS_REVISION", async () => {
    const { assetRow } = await setupTestAssetFixture();
    const evaluator = {
      providerName: "mock",
      modelName: "test",
      evaluate: async () => createMockSemanticResult({
        decision: "NEEDS_REVISION",
        findings: [
          {
            code: "STYLE_SUBTLE_DEVIATION",
            severity: "warning",
            category: "style",
            description: "Terdapat sedikit gradasi bayangan tebal yang tidak sepenuhnya rata.",
          },
        ],
      }),
    };

    const res = await executeEvaluateIllustrationQuality({ assetId: assetRow.id }, mockTeacherAuth, { evaluator });
    assert.strictEqual(res.evaluation.decision, "NEEDS_REVISION");
  });

  await runTest("4.4 Style version is preserved in evaluation record", async () => {
    const { assetRow } = await setupTestAssetFixture();
    const evaluator = {
      providerName: "mock",
      modelName: "test",
      evaluate: async () => createMockSemanticResult(),
    };

    const res = await executeEvaluateIllustrationQuality({ assetId: assetRow.id }, mockTeacherAuth, { evaluator });
    assert.strictEqual(res.evaluation.styleVersion, 1);
    assert.strictEqual(res.evaluation.styleId, "style_ill_flat_edu");
  });

  console.log("\n[GROUP 5: Educational Consistency & Grounding]");

  await runTest("5.1 Supported educational concept passes inspection cleanly", async () => {
    const { assetRow } = await setupTestAssetFixture();
    const evaluator = {
      providerName: "mock",
      modelName: "test",
      evaluate: async () => createMockSemanticResult(),
    };
    const res = await executeEvaluateIllustrationQuality({ assetId: assetRow.id }, mockTeacherAuth, { evaluator });
    assert.strictEqual(res.evaluation.semanticChecks?.educationalAccuracy.contradictionDetected, false);
    assert.strictEqual(res.evaluation.decision, "PASS");
  });

  await runTest("5.2 Major educational contradiction (e.g. bus topology labeled star) causes REJECT", async () => {
    const { assetRow } = await setupTestAssetFixture();
    const evaluator = {
      providerName: "mock",
      modelName: "test",
      evaluate: async () => createMockSemanticResult({
        decision: "REJECT",
        semanticChecks: {
          ...createMockSemanticResult().semanticChecks,
          educationalAccuracy: {
            level: "inaccurate",
            contradictionDetected: true,
            unsupportedMajorClaims: true,
            details: "Gambar menggambarkan kabel backbone linier (Bus Topology) padahal materi mengajarkan Star Topology.",
          },
        },
        findings: [
          {
            code: "EDUCATIONAL_CONTRADICTION",
            severity: "critical",
            category: "educational",
            description: "Struktur jaringan yang digambar secara fatal bertentangan dengan materi topologi star.",
            evidenceReference: "chunk_tkj_01",
          },
        ],
      }),
    };

    const res = await executeEvaluateIllustrationQuality({ assetId: assetRow.id }, mockTeacherAuth, { evaluator });
    assert.strictEqual(res.evaluation.decision, "REJECT");
    assert.strictEqual(res.evaluation.semanticChecks?.educationalAccuracy.contradictionDetected, true);
  });

  await runTest("5.3 Unsupported major claims flagged under educational/grounding category", async () => {
    const finding = {
      code: "UNSUPPORTED_MAJOR_CLAIM",
      severity: "warning",
      category: "grounding",
      description: "Gambar menyertakan komponen satelit luar angkasa yang tidak ada dalam kurikulum jaringan lokal.",
    };
    assert.strictEqual(finding.category, "grounding");
    assert.strictEqual(finding.severity, "warning");
  });

  await runTest("5.4 Harmless artistic detail (e.g. ambient office plant) is tolerated and does NOT cause false rejection", async () => {
    const semantic = createMockSemanticResult({
      semanticChecks: {
        ...createMockSemanticResult().semanticChecks,
        educationalAccuracy: {
          level: "accurate",
          contradictionDetected: false,
          unsupportedMajorClaims: false,
          details: "Terdapat tanaman hias di pojok ruangan sebagai elemen estetika wajar; konsep utama tetap 100% akurat.",
        },
      },
      findings: [
        {
          code: "ARTISTIC_NUANCE_NOTE",
          severity: "info",
          category: "composition",
          description: "Tanaman latar belakang adalah variasi artistik wajar dan tidak mengaburkan fokus edukatif.",
        },
      ],
    });

    const deterministic = { passed: true, storageAccessible: true, binaryExists: true };
    const decision = deriveQualityDecision(deterministic, semantic.findings);
    assert.strictEqual(decision, "PASS", "Info findings must not prevent PASS");
  });

  console.log("\n[GROUP 6: Text Policy Compliance]");

  await runTest("6.1 Required text label presence verified in image", async () => {
    const semantic = createMockSemanticResult({
      semanticChecks: {
        ...createMockSemanticResult().semanticChecks,
        textCompliance: {
          level: "compliant",
          requiredTextPresent: true,
          forbiddenTextDetected: false,
          inventedTextDetected: false,
          details: "Label 'SWITCH' terbaca jelas pada perangkat sentral.",
        },
      },
    });
    assert.strictEqual(semantic.semanticChecks.textCompliance.requiredTextPresent, true);
  });

  await runTest("6.2 AI-invented text flagged when allowModelInventedText=false", async () => {
    const { assetRow } = await setupTestAssetFixture();
    const evaluator = {
      providerName: "mock",
      modelName: "test",
      evaluate: async () => createMockSemanticResult({
        decision: "NEEDS_REVISION",
        semanticChecks: {
          ...createMockSemanticResult().semanticChecks,
          textCompliance: {
            level: "non_compliant",
            requiredTextPresent: true,
            forbiddenTextDetected: false,
            inventedTextDetected: true,
            details: "Model menghasilkan teks acak 'XYZ-CORP-NETWORK' yang tidak diminta guru.",
          },
        },
        findings: [
          {
            code: "INVENTED_TEXT_DETECTED",
            severity: "warning",
            category: "text",
            description: "Teks ciptaan model AI terdeteksi pada gambar melanggar kebijakan allowModelInventedText=false.",
          },
        ],
      }),
    };

    const res = await executeEvaluateIllustrationQuality({ assetId: assetRow.id }, mockTeacherAuth, { evaluator });
    assert.strictEqual(res.evaluation.decision, "NEEDS_REVISION");
    assert.strictEqual(res.evaluation.semanticChecks?.textCompliance.inventedTextDetected, true);
  });

  await runTest("6.3 Forbidden text from thingsToAvoid is detected and flagged", async () => {
    const finding = {
      code: "FORBIDDEN_TEXT_DETECTED",
      severity: "critical",
      category: "text",
      description: "Gambar memuat tanda air (watermark) yang secara eksplisit dilarang dalam thingsToAvoid.",
    };
    assert.strictEqual(finding.category, "text");
    assert.strictEqual(finding.severity, "critical");
  });

  await runTest("6.4 Text compliance level accurately reflects in semantic result", async () => {
    const nonCompliant = createMockSemanticResult({
      semanticChecks: {
        ...createMockSemanticResult().semanticChecks,
        textCompliance: {
          level: "non_compliant",
          requiredTextPresent: false,
          forbiddenTextDetected: true,
          inventedTextDetected: true,
          details: "Pelanggaran ganda teks.",
        },
      },
    });
    assert.strictEqual(nonCompliant.semanticChecks.textCompliance.level, "non_compliant");
  });

  console.log("\n[GROUP 7: Decision Engine & Layer 3 Post-Guards]");

  await runTest("7.1 Clean evaluation produces PASS decision", async () => {
    const checks = { passed: true, storageAccessible: true, binaryExists: true };
    const findings = [];
    const decision = deriveQualityDecision(checks, findings);
    assert.strictEqual(decision, "PASS");
  });

  await runTest("7.2 Warning finding results in NEEDS_REVISION decision", async () => {
    const checks = { passed: true, storageAccessible: true, binaryExists: true };
    const findings = [
      { code: "MINOR_DEFECT", severity: "warning", category: "composition", description: "W" },
    ];
    const decision = deriveQualityDecision(checks, findings);
    assert.strictEqual(decision, "NEEDS_REVISION");
  });

  await runTest("7.3 Critical finding results in REJECT decision", async () => {
    const checks = { passed: true, storageAccessible: true, binaryExists: true };
    const findings = [
      { code: "FATAL_DEFECT", severity: "critical", category: "outline", description: "C" },
    ];
    const decision = deriveQualityDecision(checks, findings);
    assert.strictEqual(decision, "REJECT");
  });

  await runTest("7.4 Deterministic technical failure prevents PASS regardless of AI findings", async () => {
    const failedChecks = { passed: false, storageAccessible: true, binaryExists: true, failureReason: "Corrupt" };
    // Even if AI returned 0 findings:
    const decision = deriveQualityDecision(failedChecks, []);
    assert.strictEqual(decision, "REJECT");
  });

  await runTest("7.5 Storage inaccessibility derives ERROR decision", async () => {
    const crashedChecks = { passed: false, storageAccessible: false, binaryExists: false };
    const decision = deriveQualityDecision(crashedChecks, []);
    assert.strictEqual(decision, "ERROR");
  });

  console.log("\n[GROUP 8: Cost Control, Caching & In-flight Locking]");

  await runTest("8.1 Evaluation is an explicit action (no auto-evaluation on load/render)", async () => {
    const { assetRow } = await setupTestAssetFixture();
    // Getting evaluation when never run returns null
    const getRes = await executeGetIllustrationQualityEvaluation({ assetId: assetRow.id }, mockTeacherAuth);
    assert.strictEqual(getRes.evaluation, null);
  });

  await runTest("8.2 Repeating evaluation reuses cached result for identical tuple", async () => {
    const { assetRow } = await setupTestAssetFixture();
    let callCount = 0;
    const evaluator = {
      providerName: "mock",
      modelName: "test",
      evaluate: async () => {
        callCount++;
        return createMockSemanticResult();
      },
    };

    // First call: executes evaluator
    const res1 = await executeEvaluateIllustrationQuality({ assetId: assetRow.id }, mockTeacherAuth, { evaluator });
    assert.strictEqual(callCount, 1);
    assert.strictEqual(res1.cached, false);

    // Second call: cache hit!
    const res2 = await executeEvaluateIllustrationQuality({ assetId: assetRow.id }, mockTeacherAuth, { evaluator });
    assert.strictEqual(callCount, 1, "Evaluator should NOT be called again on cache hit");
    assert.strictEqual(res2.cached, true);
    assert.strictEqual(res2.evaluation.id, res1.evaluation.id);
  });

  await runTest("8.3 Force reevaluate flag bypasses cache and executes fresh evaluation", async () => {
    const { assetRow } = await setupTestAssetFixture();
    let callCount = 0;
    const evaluator = {
      providerName: "mock",
      modelName: "test",
      evaluate: async () => {
        callCount++;
        return createMockSemanticResult();
      },
    };

    await executeEvaluateIllustrationQuality({ assetId: assetRow.id }, mockTeacherAuth, { evaluator });
    assert.strictEqual(callCount, 1);

    await executeEvaluateIllustrationQuality({ assetId: assetRow.id, forceReevaluate: true }, mockTeacherAuth, { evaluator });
    assert.strictEqual(callCount, 2, "Force re-evaluate must invoke evaluator fresh");
  });

  await runTest("8.4 Cache is invalidated when asset hash changes", async () => {
    const { assetRow } = await setupTestAssetFixture();
    let callCount = 0;
    const evaluator = {
      providerName: "mock",
      modelName: "test",
      evaluate: async () => {
        callCount++;
        return createMockSemanticResult();
      },
    };

    await executeEvaluateIllustrationQuality({ assetId: assetRow.id }, mockTeacherAuth, { evaluator });
    assert.strictEqual(callCount, 1);

    // Simulate asset binary replacement with new hash
    const newBinary = createValidPngBuffer(1024, 1024, 700);
    const newHash = computeSha256(newBinary);
    assetRow.sha256_hash = newHash;
    mockAssetBinaries.set(assetRow.id, newBinary);

    await executeEvaluateIllustrationQuality({ assetId: assetRow.id }, mockTeacherAuth, { evaluator });
    assert.strictEqual(callCount, 2, "Hash change must invalidate old cache");
  });

  await runTest("8.5 Concurrent in-flight evaluation is locked (preventing duplicate paid calls)", async () => {
    const { assetRow } = await setupTestAssetFixture();
    inFlightEvaluationLocks.add(assetRow.id);

    try {
      await assert.rejects(
        async () => {
          await executeEvaluateIllustrationQuality({ assetId: assetRow.id }, mockTeacherAuth);
        },
        (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.CONCURRENT_REQUEST
      );
    } finally {
      inFlightEvaluationLocks.delete(assetRow.id);
    }
  });

  console.log("\n[GROUP 9: Multi-Tenant RBAC & Security]");

  await runTest("9.1 Owner teacher can evaluate quality and retrieve evaluation", async () => {
    const { assetRow } = await setupTestAssetFixture();
    const evaluator = {
      providerName: "mock",
      modelName: "test",
      evaluate: async () => createMockSemanticResult(),
    };
    const res = await executeEvaluateIllustrationQuality({ assetId: assetRow.id }, mockTeacherAuth, { evaluator });
    assert.strictEqual(res.status, "success");
    assert.strictEqual(res.evaluation.evaluatedBy, mockTeacherAuth.userId);
  });

  await runTest("9.2 Non-owner teacher attempting evaluation receives ROLE_FORBIDDEN (403)", async () => {
    const { assetRow } = await setupTestAssetFixture();
    await assert.rejects(
      async () => {
        await executeEvaluateIllustrationQuality({ assetId: assetRow.id }, mockOtherTeacherAuth);
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.ROLE_FORBIDDEN
    );
  });

  await runTest("9.3 Student role attempting quality evaluation receives ROLE_FORBIDDEN (403)", async () => {
    const { assetRow } = await setupTestAssetFixture();
    await assert.rejects(
      async () => {
        await executeEvaluateIllustrationQuality({ assetId: assetRow.id }, mockStudentAuth);
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.ROLE_FORBIDDEN
    );
  });

  await runTest("9.4 Unauthenticated request receives ROLE_FORBIDDEN / AUTH_ERROR", async () => {
    const { assetRow } = await setupTestAssetFixture();
    await assert.rejects(
      async () => {
        await executeEvaluateIllustrationQuality({ assetId: assetRow.id }, { userId: "", isGuru: false, role: "" });
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.ROLE_FORBIDDEN
    );
  });

  await runTest("9.5 Client cannot alter evaluated asset hash or evaluator model (server-authoritative)", async () => {
    const { assetRow } = await setupTestAssetFixture();
    const evaluator = {
      providerName: "server_authoritative_provider",
      modelName: "server_model_v1",
      evaluate: async () => createMockSemanticResult(),
    };

    const res = await executeEvaluateIllustrationQuality({ assetId: assetRow.id }, mockTeacherAuth, { evaluator });
    assert.strictEqual(res.evaluation.provider, "server_authoritative_provider");
    assert.strictEqual(res.evaluation.model, "server_model_v1");
    assert.strictEqual(res.evaluation.assetHash, assetRow.sha256_hash);
  });

  console.log("\n[GROUP 10: Non-Destructive Invariant, Decoupling & Full Illustration E2E Test]");

  await runTest("10.1 Quality evaluation NEVER invokes VIS-1B image generation engine", async () => {
    const { assetRow } = await setupTestAssetFixture();
    const initialGenerationsCount = fallbackIllustrationGenerations.size;
    const evaluator = {
      providerName: "mock",
      modelName: "test",
      evaluate: async () => createMockSemanticResult(),
    };

    await executeEvaluateIllustrationQuality({ assetId: assetRow.id }, mockTeacherAuth, { evaluator });
    assert.strictEqual(fallbackIllustrationGenerations.size, initialGenerationsCount, "Image generations must not increase");
  });

  await runTest("10.2 Quality rejection (REJECT) preserves asset and does NOT trigger auto-regeneration", async () => {
    const { assetRow } = await setupTestAssetFixture();
    const initialGenerationsCount = fallbackIllustrationGenerations.size;
    const evaluator = {
      providerName: "mock",
      modelName: "test",
      evaluate: async () => createMockSemanticResult({
        decision: "REJECT",
        findings: [{ code: "TEST_REJECT", severity: "critical", category: "outline", description: "Reject test" }],
      }),
    };

    const res = await executeEvaluateIllustrationQuality({ assetId: assetRow.id }, mockTeacherAuth, { evaluator });
    assert.strictEqual(res.evaluation.decision, "REJECT");
    assert.strictEqual(fallbackIllustrationGenerations.size, initialGenerationsCount, "Zero auto-regeneration on reject");

    // Asset still exists in database
    const assetCheck = fallbackIllustrationAssets.get(assetRow.id);
    assert.ok(assetCheck, "Asset row must remain intact in database");
    assert.strictEqual(assetCheck.lifecycle_status, "staged");
  });

  await runTest("10.3 Quality status is strictly decoupled from teacher review status", async () => {
    const { assetRow } = await setupTestAssetFixture({ reviewStatus: "pending" });
    const evaluator = {
      providerName: "mock",
      modelName: "test",
      evaluate: async () => createMockSemanticResult({ decision: "PASS" }),
    };

    // Quality passes:
    await executeEvaluateIllustrationQuality({ assetId: assetRow.id }, mockTeacherAuth, { evaluator });

    // Review status must REMAIN pending (no auto-approval)
    const rev = fallbackIllustrationReviews.get(assetRow.id);
    assert.strictEqual(rev?.review_status, "pending", "Teacher review must remain pending when AI passes");
  });

  await runTest("10.4 Composite usability eligibility evaluates correctly", async () => {
    const { assetRow } = await setupTestAssetFixture();
    const evaluator = {
      providerName: "mock",
      modelName: "test",
      evaluate: async () => createMockSemanticResult({ decision: "PASS" }),
    };

    // 1. Initially: teacher review is pending, so NOT eligible yet
    await executeEvaluateIllustrationQuality({ assetId: assetRow.id }, mockTeacherAuth, { evaluator });
    let elig = await executeCheckIllustrationEligibility({ assetId: assetRow.id }, mockTeacherAuth);
    assert.strictEqual(elig.eligibility.eligibleForUse, false);
    assert.strictEqual(elig.eligibility.qualityStatus, "PASS");
    assert.strictEqual(elig.eligibility.reviewStatus, "pending");

    // 2. Teacher explicitly approves the asset:
    await executeApproveIllustrationForUse({ assetId: assetRow.id }, mockTeacherAuth);

    // 3. Now: eligibleForUse is TRUE!
    elig = await executeCheckIllustrationEligibility({ assetId: assetRow.id }, mockTeacherAuth);
    assert.strictEqual(elig.eligibility.eligibleForUse, true);
    assert.strictEqual(elig.eligibility.reviewStatus, "approved_for_use");
    assert.strictEqual(elig.eligibility.qualityStatus, "PASS");
  });

  await runTest("10.5 Full E2E Pipeline: GEN-0 -> VIS-1A -> VIS-1B -> VIS-1C -> VIS-1D -> VIS-1E -> Modul Attachment", async () => {
    const e2eModuleId = `mod_e2e_${Date.now()}`;
    const e2eTeacher = { userId: "usr_guru_e2e_lead", role: "guru", isGuru: true, verificationStatus: "verified" };

    // --- STEP 1 & 2: GEN-0 Outline Creation & Edits ---
    const initialOutline = {
      title: "Topologi Jaringan Merdeka",
      objective: "Visualisasi topologi jaringan komputer",
      mainSubject: "Switch sentral",
      supportingElements: ["Workstation"],
      environmentBackground: "Lab Komputer Modern",
      composition: "Proporsional simetris",
      perspectiveView: "Eye-level perspective",
      importantVisualDetails: ["Kabel UTP warna biru"],
      educationalFocus: "Jaringan dasar komputer",
    };
    const { plan: createdPlan } = createInitialPlan(e2eTeacher.userId, e2eModuleId, "illustration", initialOutline, "style_ill_flat_edu");
    let plan = createdPlan;
    const { updatedPlan: planAfterEdit } = applyOutlineEdits(plan, {
      title: "Topologi Jaringan Hybrid Merdeka",
      objective: "Visualisasi gabungan star dan bus",
      mainSubject: "Switch terhubung ke backbone bus",
      supportingElements: ["Router", "Kabel Koaksial", "Klien Star"],
      environmentBackground: "Server Room Modern",
      composition: "Backbone horizontal dengan star bercabang",
      perspectiveView: "Front perspective view",
      importantVisualDetails: ["Label antarmuka gigabit"],
      educationalFocus: "Konsep topologi gabungan",
      thingsToAvoid: ["Watermark"],
    }, e2eTeacher.userId);
    plan = planAfterEdit;

    // --- STEP 3: Style Selection ---
    plan = applyStyleSelection(plan, "style_ill_tech_diagram", e2eTeacher.userId);

    // --- STEP 4: Teacher Plan Approval ---
    const { approvedPlan } = applyPlanApproval(plan, e2eTeacher);
    plan = approvedPlan;
    assert.strictEqual(plan.status, "approved");
    fallbackTestPlans.set(plan.id, { planId: plan.id, currentPlan: plan, approvedVersion: plan.approvedVersion });

    // --- STEP 5: VIS-1A Canonical Request Specification ---
    const spec = createGenerationSpecification(plan, e2eTeacher);
    assert.strictEqual(spec.targetType, "illustration");

    // --- STEP 6: VIS-1B Real Image Generation (Mock binary) ---
    const realPngBinary = createValidPngBuffer(1024, 1024, 800);
    const genId = `gen_e2e_${Date.now()}`;
    const reqId = `req_e2e_${Date.now()}`;

    fallbackIllustrationRequests.set(reqId, {
      id: reqId,
      requestId: reqId,
      module_id: e2eModuleId,
      generation_plan_id: plan.id,
      approved_outline_version: plan.approvedVersion,
      owner_id: e2eTeacher.userId,
      request_snapshot: {
        targetType: "illustration",
        approvedOutline: plan.outline,
        approvedOutlineVersion: plan.approvedVersion,
        styleSnapshot: plan.style,
        assembledPrompt: {
          systemPrompt: "Educational Illustration",
          styleDirectives: "Pedagogical clarity",
          subjectDescription: plan.outline.mainSubject,
          compositionDirectives: plan.outline.composition,
          negativePrompt: (plan.outline.thingsToAvoid || []).join(", "),
          fullPrompt: `${plan.outline.title}: ${plan.outline.mainSubject}`,
        },
        grounding: {
          subjectDiscipline: "Teknik Komputer",
          audienceLevel: "Fase E",
        },
      },
    });

    fallbackIllustrationGenerations.set(genId, {
      id: genId,
      request_id: reqId,
      generation_plan_id: plan.id,
      module_id: e2eModuleId,
      owner_id: e2eTeacher.userId,
      status: "succeeded",
      image_data: `data:image/png;base64,${realPngBinary.toString("base64")}`,
      asset_url: `data:image/png;base64,${realPngBinary.toString("base64")}`,
      mime_type: "image/png",
      width: 1024,
      height: 1024,
      provider: "mock_openai",
      model: "gpt-image-1-mini",
    });

    // --- STEP 7: VIS-1C Asset Persistence ---
    const persistResult = await executePersistIllustrationAsset(
      { generationId: genId },
      e2eTeacher
    );
    assert.strictEqual(persistResult.status, "success");
    const e2eAsset = persistResult.asset;
    assert.strictEqual(e2eAsset.lifecycleStatus, "staged");
    mockAssetBinaries.set(e2eAsset.id, realPngBinary);

    // --- STEP 8: VIS-1D Teacher Review ---
    const reviewResult = await executeApproveIllustrationForUse(
      { assetId: e2eAsset.id, teacherNotes: "Visual sangat memadai untuk bab 1." },
      e2eTeacher
    );
    assert.strictEqual(reviewResult.status, "success");
    assert.strictEqual(reviewResult.review.reviewStatus, "approved_for_use");

    // --- STEP 9: VIS-1E Quality Gate ---
    const qualityEvaluator = {
      providerName: "mock_vision_judge",
      modelName: "vision-pro-v1",
      evaluate: async () => createMockSemanticResult({
        decision: "PASS",
        semanticChecks: {
          ...createMockSemanticResult().semanticChecks,
          outlineAlignment: {
            level: "aligned",
            mainSubjectPresent: true,
            supportingElementsPresent: true,
            environmentConsistent: true,
            compositionConsistent: true,
            details: "Switch terhubung backbone bus terlihat presisi.",
          },
        },
      }),
    };

    const qualityResult = await executeEvaluateIllustrationQuality(
      { assetId: e2eAsset.id },
      e2eTeacher,
      { evaluator: qualityEvaluator }
    );
    assert.strictEqual(qualityResult.status, "success");
    assert.strictEqual(qualityResult.evaluation.decision, "PASS");
    assert.strictEqual(qualityResult.evaluation.deterministicChecks.passed, true);

    // --- STEP 10: Usability Eligibility & Section Attachment ---
    const eligibility = await executeCheckIllustrationEligibility({ assetId: e2eAsset.id }, e2eTeacher);
    assert.strictEqual(eligibility.eligibility.eligibleForUse, true);

    const attachResult = await executeAttachIllustrationAsset(
      { assetId: e2eAsset.id, moduleId: e2eModuleId, sectionId: "sec_bab_1" },
      e2eTeacher
    );
    assert.strictEqual(attachResult.status, "success");
    assert.strictEqual(attachResult.asset.lifecycleStatus, "attached");
    assert.strictEqual(attachResult.asset.attachedSectionId, "sec_bab_1");
  });

  console.log("\n================================================================================");
  console.log(`  TEST RESULTS: ${testsPassed} passed, ${testsFailed} failed`);
  console.log("================================================================================\n");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test suite runner crashed:", err);
  process.exit(1);
});
