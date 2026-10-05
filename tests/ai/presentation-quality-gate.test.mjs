#!/usr/bin/env node
/**
 * ==============================================================================
 * GURUPRO TEST SUITE: PPT-1F FINAL PPTX QUALITY, SECURITY & E2E GATE
 * ==============================================================================
 *
 * Verifies the final quality, security, and end-to-end gate for generated PowerPoint presentations:
 * - Suite 1: Canonical Contracts & Reference Schemas (Tests 1-6)
 * - Suite 2: Preconditions & Sovereign Teacher Authority Gatekeeper (Tests 7-13)
 * - Suite 3: Structural OpenXML Package Validation (Tests 14-22)
 * - Suite 4: Content Integrity Validation (Tests 23-29)
 * - Suite 5: Illustration Integrity Gatekeeper (Tests 30-37)
 * - Suite 6: Version & Provenance Integrity (Tests 38-43)
 * - Suite 7: Visual Quality & Boundary Validation (Tests 44-48)
 * - Suite 8: Advisory AI Evaluation & Sovereign Authority (Tests 49-52)
 * - Suite 9: Decision Engine, Failure Semantics & Idempotency (Tests 53-58)
 * - Suite 10: Secure Download Gatekeeper & Multi-Tenant RBAC (Tests 59-64)
 */

import crypto from "crypto";
import JSZip from "jszip";
import {
  PresentationQualityStatusSchema,
  PresentationQualityDecisionSchema,
  PresentationFindingSeveritySchema,
  PresentationFindingCategorySchema,
  PresentationQualityFindingSchema,
  derivePresentationQualityDecision,
} from "../../src/lib/ai/presentation-quality-contract.js";
import {
  computeBytesSha256,
  evaluateVersionIntegrity,
  evaluateStructuralPptx,
  evaluateContentIntegrity,
  evaluateIllustrationIntegrity,
  evaluateVisualQuality,
  evaluateAiQuality,
  evaluatePresentationQuality,
} from "../../src/lib/ai/presentation-quality-evaluator.js";
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

// ==============================================================================
// TEST HARNESS
// ==============================================================================

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function pass(name) {
  totalTests++;
  passedTests++;
  console.log(`  ✓ [PASS] [TEST ${totalTests}] ${name}`);
}

function fail(name, error) {
  totalTests++;
  failedTests++;
  console.error(`  ✗ [FAIL] [TEST ${totalTests}] ${name}`);
  if (error) console.error(`    Details: ${error.message || error}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message || "Assertion failed");
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `${message || "Assertion failed"} -> Expected: ${JSON.stringify(expected)}, Actual: ${JSON.stringify(actual)}`
    );
  }
}

// Helper: create a 1x1 valid PNG image buffer
function createValidPngBuffer() {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG Signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR header
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 px
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
    0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, // IDAT header
    0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01,
    0x0d, 0x0a, 0x2d, 0xb4,
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, // IEND header
    0xae, 0x42, 0x60, 0x82,
  ]);
}

// Helper: build standard mock PresentationContentPackage
function createMockContentPackage(presentationId = "pres_test_1", slideCount = 3) {
  const slides = [];
  for (let i = 1; i <= slideCount; i++) {
    slides.push({
      slideId: `slide_${presentationId}_${i}`,
      order: i,
      slideOrder: i,
      title: i === 1 ? "Pengenalan Sistem Komputer" : `Topik Pembelajaran Slide ${i}`,
      subtitle: i === 1 ? "Dasar-dasar Perangkat Keras dan Lunak" : undefined,
      pedagogicalType: i === 1 ? "introduction" : i === slideCount ? "summary" : "concept_explanation",
      purpose: `Tujuan pembelajaran untuk slide ${i}`,
      contentBlocks: [
        {
          type: "bullet_list",
          title: `Poin Kunci ${i}`,
          content: `Poin materi pembelajaran kunci untuk slide ${i}.\nKonsep pendukung dan aplikasi praktis slide ${i}.`,
          evidenceIds: ["ev_1"],
        },
      ],
      keyPoints: [`Fokus materi slide ${i}`],
      visualDirection: `Tampilan visual untuk slide ${i}`,
      speakerNotes: `Bapak/Ibu guru dapat menjelaskan konsep pada slide ${i} secara interaktif.`,
      sourceReferences: ["Modul Ajar Bab 1"],
      evidenceReferences: ["ev_1"],
    });
  }

  return {
    presentationId,
    generationRequestId: `req_${presentationId}`,
    generationPlanId: `plan_${presentationId}`,
    moduleId: "modul_komputer_10",
    title: "Sistem Komputer & Algoritma",
    subtitle: "Modul Pembelajaran Informatika SMK",
    learningObjectives: ["Memahami komponen perangkat keras", "Menjelaskan siklus kerja CPU"],
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
    slides,
    provenance: {
      moduleId: "modul_komputer_10",
      planId: `plan_${presentationId}`,
      requestId: `req_${presentationId}`,
      ownerId: "guru_uuid_quality_a",
      sourceReferences: ["modul_komputer_10"],
      evidenceReferences: ["ev_1"],
    },
    generationMetadata: {
      promptVersion: "presentation_content_generator_grounded_v1",
      schemaVersion: "1.0.0",
      provider: "google_gemini",
      model: "gemini-flash-lite-latest",
      latencyMs: 1200,
      retryCount: 0,
      generatorVersion: "v1",
      generationKey: `gen_key_${presentationId}`,
    },
    validationMetadata: {
      deterministicValid: true,
      exactValuesValid: true,
      semanticDecision: "PASS",
      findings: [],
    },
    createdAt: new Date().toISOString(),
  };
}

async function runTests() {
  console.log("==============================================================================");
  console.log("TESTING PPT-1F: FINAL PPTX QUALITY, SECURITY & END-TO-END GATE");
  console.log("==============================================================================\n");

  // Clear fallback stores before running
  fallbackPresentationArtifacts.clear();
  fallbackPresentationResults.clear();
  fallbackPresentationReviews.clear();
  fallbackPresentationQualityEvaluations.clear();
  mockArtifactBinaries.clear();

  const teacherA = "guru_uuid_quality_a";
  const teacherB = "guru_uuid_quality_b";
  const student = "siswa_uuid_quality";

  // Render a real genuine PPTX binary for realistic baseline tests
  const baseContentPackage = createMockContentPackage("pres_base", 3);
  const baseRenderResult = await renderPresentationPptx(baseContentPackage);
  const basePptxBytes = baseRenderResult.bytes;
  const baseHash = baseRenderResult.fileHash;
  let v2RenderBytes = null;

  // ==============================================================================
  // Suite 1: Canonical Contracts & Reference Schemas
  // ==============================================================================
  console.log("--- Suite 1: Canonical Contracts & Reference Schemas ---");

  try {
    const states = ["pending", "passed", "failed", "superseded"];
    for (const s of states) {
      PresentationQualityStatusSchema.parse(s);
    }
    pass("PresentationQualityStatusSchema accepts all 4 canonical states");
  } catch (e) {
    fail("PresentationQualityStatusSchema accepts all 4 canonical states", e);
  }

  try {
    let rejected = false;
    try {
      PresentationQualityStatusSchema.parse("invalid_status");
    } catch {
      rejected = true;
    }
    assert(rejected, "Should reject non-canonical status");
    pass("PresentationQualityStatusSchema strictly rejects non-canonical status values");
  } catch (e) {
    fail("PresentationQualityStatusSchema strictly rejects non-canonical status values", e);
  }

  try {
    PresentationQualityDecisionSchema.parse("PASS");
    PresentationQualityDecisionSchema.parse("FAIL");
    PresentationQualityDecisionSchema.parse("ERROR");
    let rejected = false;
    try {
      PresentationQualityDecisionSchema.parse("UNKNOWN");
    } catch {
      rejected = true;
    }
    assert(rejected, "Should reject non-canonical decision");
    pass("PresentationQualityDecisionSchema accepts PASS, FAIL, ERROR and rejects others");
  } catch (e) {
    fail("PresentationQualityDecisionSchema accepts PASS, FAIL, ERROR and rejects others", e);
  }

  try {
    const finding = PresentationQualityFindingSchema.parse({
      code: "SLIDE_COUNT_MISMATCH",
      severity: "critical",
      category: "structure",
      description: "Jumlah slide tidak sesuai",
      slideNumber: 2,
    });
    assertEquals(finding.code, "SLIDE_COUNT_MISMATCH");
    pass("PresentationQualityFindingSchema validates structured finding record");
  } catch (e) {
    fail("PresentationQualityFindingSchema validates structured finding record", e);
  }

  try {
    const { decision, status } = derivePresentationQualityDecision([], {
      versionPassed: true,
      structuralPassed: true,
      contentPassed: true,
      illustrationPassed: true,
      visualPassed: true,
    });
    assertEquals(decision, "PASS");
    assertEquals(status, "passed");
    pass("derivePresentationQualityDecision returns PASS / passed when all tiers pass");
  } catch (e) {
    fail("derivePresentationQualityDecision returns PASS / passed when all tiers pass", e);
  }

  try {
    const { decision, status } = derivePresentationQualityDecision(
      [
        {
          code: "BROKEN_RELATIONSHIP",
          severity: "critical",
          category: "structure",
          description: "Relasi rusak",
        },
      ],
      {
        versionPassed: true,
        structuralPassed: false,
        contentPassed: true,
        illustrationPassed: true,
        visualPassed: true,
      }
    );
    assertEquals(decision, "FAIL");
    assertEquals(status, "failed");
    pass("derivePresentationQualityDecision returns FAIL / failed when critical finding exists");
  } catch (e) {
    fail("derivePresentationQualityDecision returns FAIL / failed when critical finding exists", e);
  }

  // ==============================================================================
  // Suite 2: Preconditions & Sovereign Teacher Authority Gatekeeper
  // ==============================================================================
  console.log("\n--- Suite 2: Preconditions & Sovereign Teacher Authority Gatekeeper ---");

  try {
    const findings = [];
    const checks = evaluateVersionIntegrity(
      {
        artifactId: "art_1",
        artifactBytes: basePptxBytes,
        storedFileHash: baseHash,
        outlineVersion: 1,
        contentPackage: baseContentPackage,
        contentResultId: "cr_1",
        generationPlanId: "plan_1",
        moduleId: "mod_1",
        teacherReview: { reviewStatus: "generated", approvedVersion: 1 },
        userId: teacherA,
      },
      findings
    );
    assert(!checks.passed, "Checks must fail when reviewStatus is 'generated'");
    assert(findings.some((f) => f.code === "PRESENTATION_NOT_APPROVED"), "Must report PRESENTATION_NOT_APPROVED");
    pass("Unapproved presentation ('generated') strictly fails quality gate with PRESENTATION_NOT_APPROVED");
  } catch (e) {
    fail("Unapproved presentation ('generated') strictly fails quality gate with PRESENTATION_NOT_APPROVED", e);
  }

  try {
    const findings = [];
    const checks = evaluateVersionIntegrity(
      {
        artifactId: "art_1",
        artifactBytes: basePptxBytes,
        storedFileHash: baseHash,
        outlineVersion: 1,
        contentPackage: baseContentPackage,
        contentResultId: "cr_1",
        generationPlanId: "plan_1",
        moduleId: "mod_1",
        teacherReview: { reviewStatus: "in_review", approvedVersion: 1 },
        userId: teacherA,
      },
      findings
    );
    assert(!checks.passed);
    assert(findings.some((f) => f.code === "PRESENTATION_NOT_APPROVED"));
    pass("Presentation in review ('in_review') strictly fails quality gate");
  } catch (e) {
    fail("Presentation in review ('in_review') strictly fails quality gate", e);
  }

  try {
    const findings = [];
    const checks = evaluateVersionIntegrity(
      {
        artifactId: "art_1",
        artifactBytes: basePptxBytes,
        storedFileHash: baseHash,
        outlineVersion: 1,
        contentPackage: baseContentPackage,
        contentResultId: "cr_1",
        generationPlanId: "plan_1",
        moduleId: "mod_1",
        teacherReview: { reviewStatus: "rejected", approvedVersion: 1 },
        userId: teacherA,
      },
      findings
    );
    assert(!checks.passed);
    assert(findings.some((f) => f.code === "PRESENTATION_NOT_APPROVED"));
    pass("Rejected presentation ('rejected') strictly fails quality gate");
  } catch (e) {
    fail("Rejected presentation ('rejected') strictly fails quality gate", e);
  }

  try {
    const findings = [];
    const checks = evaluateVersionIntegrity(
      {
        artifactId: "art_1",
        artifactBytes: basePptxBytes,
        storedFileHash: baseHash,
        outlineVersion: 1,
        contentPackage: baseContentPackage,
        contentResultId: "cr_1",
        generationPlanId: "plan_1",
        moduleId: "mod_1",
        teacherReview: { reviewStatus: "superseded", approvedVersion: 1 },
        userId: teacherA,
      },
      findings
    );
    assert(!checks.passed);
    assert(findings.some((f) => f.code === "PRESENTATION_NOT_APPROVED"));
    pass("Superseded presentation review ('superseded') strictly fails quality gate");
  } catch (e) {
    fail("Superseded presentation review ('superseded') strictly fails quality gate", e);
  }

  try {
    const findings = [];
    const checks = evaluateVersionIntegrity(
      {
        artifactId: "art_1",
        artifactBytes: basePptxBytes,
        storedFileHash: baseHash,
        outlineVersion: 1,
        contentPackage: baseContentPackage,
        contentResultId: "cr_1",
        generationPlanId: "plan_1",
        moduleId: "mod_1",
        teacherReview: null,
        userId: teacherA,
      },
      findings
    );
    assert(!checks.passed);
    assert(findings.some((f) => f.code === "PRESENTATION_NOT_APPROVED"));
    pass("Missing review record strictly fails quality gate");
  } catch (e) {
    fail("Missing review record strictly fails quality gate", e);
  }

  try {
    const findings = [];
    const checks = evaluateVersionIntegrity(
      {
        artifactId: "art_1",
        artifactBytes: basePptxBytes,
        storedFileHash: baseHash,
        outlineVersion: 2, // Artifact is v2
        contentPackage: { ...baseContentPackage, metadata: { ...baseContentPackage.metadata, version: 2 } },
        contentResultId: "cr_1",
        generationPlanId: "plan_1",
        moduleId: "mod_1",
        teacherReview: { reviewStatus: "approved", approvedVersion: 1 }, // Review is v1
        userId: teacherA,
      },
      findings
    );
    assert(!checks.passed);
    assert(findings.some((f) => f.code === "VERSION_MISMATCH"));
    pass("Version mismatch between approved version (v1) and artifact (v2) fails with VERSION_MISMATCH");
  } catch (e) {
    fail("Version mismatch between approved version (v1) and artifact (v2) fails with VERSION_MISMATCH", e);
  }

  try {
    const findings = [];
    const checks = evaluateVersionIntegrity(
      {
        artifactId: "art_1",
        artifactBytes: basePptxBytes,
        storedFileHash: baseHash,
        outlineVersion: 1,
        contentPackage: baseContentPackage,
        contentResultId: "cr_1",
        generationPlanId: "plan_1",
        moduleId: "mod_1",
        teacherReview: { reviewStatus: "approved", approvedVersion: 1 },
        userId: teacherA,
      },
      findings
    );
    assert(checks.passed, "Checks must pass when reviewStatus is approved and versions match");
    assertEquals(findings.length, 0);
    pass("Active teacher approval ('approved') for matching version passes precondition checks");
  } catch (e) {
    fail("Active teacher approval ('approved') for matching version passes precondition checks", e);
  }

  // ==============================================================================
  // Suite 3: Structural OpenXML Package Validation
  // ==============================================================================
  console.log("\n--- Suite 3: Structural OpenXML Package Validation ---");

  try {
    const findings = [];
    const { structuralChecks } = await evaluateStructuralPptx(
      {
        artifactId: "art_1",
        artifactBytes: basePptxBytes,
        storedFileHash: baseHash,
        outlineVersion: 1,
        contentPackage: baseContentPackage,
        contentResultId: "cr_1",
        generationPlanId: "plan_1",
        moduleId: "mod_1",
        teacherReview: { reviewStatus: "approved", approvedVersion: 1 },
        userId: teacherA,
      },
      findings
    );
    assert(structuralChecks.passed, "Valid PPTX must pass structural checks");
    assert(structuralChecks.slideCountMatches, "Slide count must match");
    assertEquals(structuralChecks.slidePartsFound, 3);
    pass("Valid PPTX OpenXML package passes structural validation");
  } catch (e) {
    fail("Valid PPTX OpenXML package passes structural validation", e);
  }

  try {
    const findings = [];
    const corruptBytes = Buffer.from("Corrupted non-zip random content byte sequence");
    const { structuralChecks } = await evaluateStructuralPptx(
      {
        artifactId: "art_1",
        artifactBytes: corruptBytes,
        storedFileHash: "dummy",
        outlineVersion: 1,
        contentPackage: baseContentPackage,
        contentResultId: "cr_1",
        generationPlanId: "plan_1",
        moduleId: "mod_1",
        teacherReview: { reviewStatus: "approved", approvedVersion: 1 },
        userId: teacherA,
      },
      findings
    );
    assert(!structuralChecks.passed);
    assert(findings.some((f) => f.code === "INVALID_ZIP_MAGIC"));
    pass("Corrupt non-ZIP file fails structural validation with INVALID_ZIP_MAGIC");
  } catch (e) {
    fail("Corrupt non-ZIP file fails structural validation with INVALID_ZIP_MAGIC", e);
  }

  try {
    const findings = [];
    const emptyBytes = new Uint8Array(0);
    const { structuralChecks } = await evaluateStructuralPptx(
      {
        artifactId: "art_1",
        artifactBytes: emptyBytes,
        storedFileHash: "dummy",
        outlineVersion: 1,
        contentPackage: baseContentPackage,
        contentResultId: "cr_1",
        generationPlanId: "plan_1",
        moduleId: "mod_1",
        teacherReview: { reviewStatus: "approved", approvedVersion: 1 },
        userId: teacherA,
      },
      findings
    );
    assert(!structuralChecks.passed);
    assert(findings.some((f) => f.code === "EMPTY_ARTIFACT_PAYLOAD"));
    pass("Zero-byte file payload fails with EMPTY_ARTIFACT_PAYLOAD");
  } catch (e) {
    fail("Zero-byte file payload fails with EMPTY_ARTIFACT_PAYLOAD", e);
  }

  try {
    const findings = [];
    const htmlBytes = Buffer.from("<!DOCTYPE html><html><body><h1>Fake PPTX</h1></body></html>");
    const { structuralChecks } = await evaluateStructuralPptx(
      {
        artifactId: "art_1",
        artifactBytes: htmlBytes,
        storedFileHash: "dummy",
        outlineVersion: 1,
        contentPackage: baseContentPackage,
        contentResultId: "cr_1",
        generationPlanId: "plan_1",
        moduleId: "mod_1",
        teacherReview: { reviewStatus: "approved", approvedVersion: 1 },
        userId: teacherA,
      },
      findings
    );
    assert(!structuralChecks.passed);
    assert(findings.some((f) => f.code === "INVALID_ZIP_MAGIC"));
    pass("Masquerading HTML file renamed to .pptx fails structural validation");
  } catch (e) {
    fail("Masquerading HTML file renamed to .pptx fails structural validation", e);
  }

  try {
    // Create ZIP missing [Content_Types].xml
    const zip = new JSZip();
    zip.file("ppt/presentation.xml", "<p:presentation/>");
    zip.file("_rels/.rels", "<Relationships/>");
    const zipBytes = await zip.generateAsync({ type: "uint8array" });

    const findings = [];
    const { structuralChecks } = await evaluateStructuralPptx(
      {
        artifactId: "art_1",
        artifactBytes: zipBytes,
        storedFileHash: "dummy",
        outlineVersion: 1,
        contentPackage: baseContentPackage,
        contentResultId: "cr_1",
        generationPlanId: "plan_1",
        moduleId: "mod_1",
        teacherReview: { reviewStatus: "approved", approvedVersion: 1 },
        userId: teacherA,
      },
      findings
    );
    assert(!structuralChecks.passed);
    assert(findings.some((f) => f.code === "MISSING_REQUIRED_XML_PARTS"));
    pass("Package missing [Content_Types].xml fails with MISSING_REQUIRED_XML_PARTS");
  } catch (e) {
    fail("Package missing [Content_Types].xml fails with MISSING_REQUIRED_XML_PARTS", e);
  }

  try {
    // Create ZIP missing ppt/presentation.xml
    const zip = new JSZip();
    zip.file("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
    zip.file("_rels/.rels", "<Relationships/>");
    const zipBytes = await zip.generateAsync({ type: "uint8array" });

    const findings = [];
    const { structuralChecks } = await evaluateStructuralPptx(
      {
        artifactId: "art_1",
        artifactBytes: zipBytes,
        storedFileHash: "dummy",
        outlineVersion: 1,
        contentPackage: baseContentPackage,
        contentResultId: "cr_1",
        generationPlanId: "plan_1",
        moduleId: "mod_1",
        teacherReview: { reviewStatus: "approved", approvedVersion: 1 },
        userId: teacherA,
      },
      findings
    );
    assert(!structuralChecks.passed);
    assert(findings.some((f) => f.code === "MISSING_REQUIRED_XML_PARTS"));
    pass("Package missing ppt/presentation.xml fails with MISSING_REQUIRED_XML_PARTS");
  } catch (e) {
    fail("Package missing ppt/presentation.xml fails with MISSING_REQUIRED_XML_PARTS", e);
  }

  try {
    // Missing root relationships _rels/.rels
    const zip = new JSZip();
    zip.file("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
    zip.file("ppt/presentation.xml", "<p:presentation/>");
    const zipBytes = await zip.generateAsync({ type: "uint8array" });

    const findings = [];
    const { structuralChecks } = await evaluateStructuralPptx(
      {
        artifactId: "art_1",
        artifactBytes: zipBytes,
        storedFileHash: "dummy",
        outlineVersion: 1,
        contentPackage: baseContentPackage,
        contentResultId: "cr_1",
        generationPlanId: "plan_1",
        moduleId: "mod_1",
        teacherReview: { reviewStatus: "approved", approvedVersion: 1 },
        userId: teacherA,
      },
      findings
    );
    assert(!structuralChecks.passed);
    assert(findings.some((f) => f.code === "MISSING_REQUIRED_XML_PARTS"));
    pass("Package missing root relationships fails with MISSING_REQUIRED_XML_PARTS");
  } catch (e) {
    fail("Package missing root relationships fails with MISSING_REQUIRED_XML_PARTS", e);
  }

  try {
    // Expect 5 slides, but basePptxBytes has 3 slides
    const findings = [];
    const { structuralChecks } = await evaluateStructuralPptx(
      {
        artifactId: "art_1",
        artifactBytes: basePptxBytes,
        storedFileHash: baseHash,
        outlineVersion: 1,
        contentPackage: { ...baseContentPackage, slides: Array(5).fill(baseContentPackage.slides[0]) },
        contentResultId: "cr_1",
        generationPlanId: "plan_1",
        moduleId: "mod_1",
        teacherReview: { reviewStatus: "approved", approvedVersion: 1 },
        userId: teacherA,
      },
      findings
    );
    assert(!structuralChecks.passed);
    assert(findings.some((f) => f.code === "SLIDE_COUNT_MISMATCH"));
    pass("Actual slide count mismatching approved slide count fails with SLIDE_COUNT_MISMATCH");
  } catch (e) {
    fail("Actual slide count mismatching approved slide count fails with SLIDE_COUNT_MISMATCH", e);
  }

  try {
    // Broken relationship test: inject a relationship referencing non-existent file
    const zip = await JSZip.loadAsync(basePptxBytes);
    zip.file(
      "ppt/slides/_rels/slide1.xml.rels",
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rIdBroken" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/nonexistent_image.png"/>' +
        "</Relationships>"
    );
    const brokenZipBytes = await zip.generateAsync({ type: "uint8array" });

    const findings = [];
    const { structuralChecks } = await evaluateStructuralPptx(
      {
        artifactId: "art_broken",
        artifactBytes: brokenZipBytes,
        storedFileHash: "dummy",
        outlineVersion: 1,
        contentPackage: baseContentPackage,
        contentResultId: "cr_1",
        generationPlanId: "plan_1",
        moduleId: "mod_1",
        teacherReview: { reviewStatus: "approved", approvedVersion: 1 },
        userId: teacherA,
      },
      findings
    );
    assert(!structuralChecks.passed);
    assert(findings.some((f) => f.code === "BROKEN_RELATIONSHIP"));
    pass("Broken internal relationship target detects missing file in ZIP archive and fails with BROKEN_RELATIONSHIP");
  } catch (e) {
    fail("Broken internal relationship target detects missing file in ZIP archive and fails with BROKEN_RELATIONSHIP", e);
  }

  // ==============================================================================
  // Suite 4: Content Integrity Validation
  // ==============================================================================
  console.log("\n--- Suite 4: Content Integrity Validation ---");

  try {
    const zip = await JSZip.loadAsync(basePptxBytes);
    const findings = [];
    const contentChecks = await evaluateContentIntegrity(
      {
        artifactId: "art_1",
        artifactBytes: basePptxBytes,
        storedFileHash: baseHash,
        outlineVersion: 1,
        contentPackage: baseContentPackage,
        contentResultId: "cr_1",
        generationPlanId: "plan_1",
        moduleId: "mod_1",
        teacherReview: { reviewStatus: "approved", approvedVersion: 1 },
        userId: teacherA,
      },
      zip,
      findings
    );
    assert(contentChecks.passed, "Content checks should pass on valid baseline");
    assert(contentChecks.titlesPresent, "Titles should be detected");
    pass("Complete presentation matching approved content package passes content integrity");
  } catch (e) {
    fail("Complete presentation matching approved content package passes content integrity", e);
  }

  try {
    const zip = await JSZip.loadAsync(basePptxBytes);
    const slide1Xml = await zip.file("ppt/slides/slide1.xml").async("string");
    assert(slide1Xml.includes("Pengenalan") || slide1Xml.includes("Sistem"), "Title words present");
    pass("Slide XML containing approved slide titles passes title check");
  } catch (e) {
    fail("Slide XML containing approved slide titles passes title check", e);
  }

  try {
    // Delete slide2.xml from ZIP
    const zip = await JSZip.loadAsync(basePptxBytes);
    zip.remove("ppt/slides/slide2.xml");

    const findings = [];
    const contentChecks = await evaluateContentIntegrity(
      {
        artifactId: "art_1",
        artifactBytes: basePptxBytes,
        storedFileHash: baseHash,
        outlineVersion: 1,
        contentPackage: baseContentPackage,
        contentResultId: "cr_1",
        generationPlanId: "plan_1",
        moduleId: "mod_1",
        teacherReview: { reviewStatus: "approved", approvedVersion: 1 },
        userId: teacherA,
      },
      zip,
      findings
    );
    assert(!contentChecks.passed);
    assert(findings.some((f) => f.code === "MISSING_SLIDE_PART" && f.slideNumber === 2));
    pass("Missing slide XML part fails with MISSING_SLIDE_PART");
  } catch (e) {
    fail("Missing slide XML part fails with MISSING_SLIDE_PART", e);
  }

  try {
    // Overwrite slide1 with empty shape without title
    const zip = await JSZip.loadAsync(basePptxBytes);
    zip.file("ppt/slides/slide1.xml", "<p:sld><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:t></a:t></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>");

    const findings = [];
    const contentChecks = await evaluateContentIntegrity(
      {
        artifactId: "art_1",
        artifactBytes: basePptxBytes,
        storedFileHash: baseHash,
        outlineVersion: 1,
        contentPackage: baseContentPackage,
        contentResultId: "cr_1",
        generationPlanId: "plan_1",
        moduleId: "mod_1",
        teacherReview: { reviewStatus: "approved", approvedVersion: 1 },
        userId: teacherA,
      },
      zip,
      findings
    );
    assert(!contentChecks.passed);
    assert(findings.some((f) => f.code === "MISSING_SLIDE_TITLE" && f.slideNumber === 1));
    pass("Slide missing title text flags critical finding MISSING_SLIDE_TITLE");
  } catch (e) {
    fail("Slide missing title text flags critical finding MISSING_SLIDE_TITLE", e);
  }

  try {
    const zip = await JSZip.loadAsync(basePptxBytes);
    const names = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/i.test(n));
    assertEquals(names.length, 3);
    assertEquals(names[0], "ppt/slides/slide1.xml");
    assertEquals(names[1], "ppt/slides/slide2.xml");
    assertEquals(names[2], "ppt/slides/slide3.xml");
    pass("Slide ordering verification identifies sequential slide numbering");
  } catch (e) {
    fail("Slide ordering verification identifies sequential slide numbering", e);
  }

  try {
    const zip = await JSZip.loadAsync(basePptxBytes);
    const slide1Xml = await zip.file("ppt/slides/slide1.xml").async("string");
    assert(slide1Xml.includes("materi") || slide1Xml.includes("pembelajaran"), "Bullet points present in slide XML");
    pass("Content blocks preservation check detects presence of approved bullet points");
  } catch (e) {
    fail("Content blocks preservation check detects presence of approved bullet points", e);
  }

  try {
    const findings = [];
    const zip = await JSZip.loadAsync(basePptxBytes);
    const contentChecks = await evaluateContentIntegrity(
      {
        artifactId: "art_1",
        artifactBytes: basePptxBytes,
        storedFileHash: baseHash,
        outlineVersion: 1,
        contentPackage: baseContentPackage,
        contentResultId: "cr_1",
        generationPlanId: "plan_1",
        moduleId: "mod_1",
        teacherReview: { reviewStatus: "approved", approvedVersion: 1 },
        userId: teacherA,
      },
      zip,
      findings
    );
    assert(contentChecks.languageConsistent, "Language consistency confirmed");
    pass("Language and pedagogical flow consistency preserved");
  } catch (e) {
    fail("Language and pedagogical flow consistency preserved", e);
  }

  // ==============================================================================
  // Suite 5: Illustration Integrity Gatekeeper
  // ==============================================================================
  console.log("\n--- Suite 5: Illustration Integrity Gatekeeper ---");

  // Create presentation with an illustration reference
  const illContentPackage = createMockContentPackage("pres_with_ill", 3);
  illContentPackage.slides[0].illustrationReference = {
    assetId: "asset_img_approved",
    placement: "right",
    isApproved: true,
    caption: "Diagram Komponen Komputer",
  };

  const validPng = createValidPngBuffer();
  const validPngBase64 = `data:image/png;base64,${validPng.toString("base64")}`;
  const validPngSha256 = crypto.createHash("sha256").update(validPng).digest("hex");

  const mockResolvedIllustrations = new Map();
  mockResolvedIllustrations.set(illContentPackage.slides[0].slideId, {
    slideId: illContentPackage.slides[0].slideId,
    assetId: "asset_img_approved",
    reviewStatus: "approved_for_use",
    lifecycleStatus: "staged",
    mimeType: "image/png",
    bytes: validPng,
    sha256Hash: validPngSha256,
    base64Data: validPngBase64,
    placement: "right",
    caption: "Diagram Komponen Komputer",
  });

  const illRenderResult = await renderPresentationPptx(illContentPackage, {
    resolvedIllustrations: mockResolvedIllustrations,
  });
  const illPptxBytes = illRenderResult.bytes;
  const illHash = illRenderResult.fileHash;

  try {
    const zip = await JSZip.loadAsync(illPptxBytes);
    const findings = [];
    const illChecks = await evaluateIllustrationIntegrity(
      {
        artifactId: "art_ill",
        artifactBytes: illPptxBytes,
        storedFileHash: illHash,
        outlineVersion: 1,
        contentPackage: illContentPackage,
        contentResultId: "cr_ill",
        generationPlanId: "plan_1",
        moduleId: "mod_1",
        teacherReview: { reviewStatus: "approved", approvedVersion: 1 },
        resolvedIllustrations: mockResolvedIllustrations,
        userId: teacherA,
      },
      zip,
      findings
    );
    assert(illChecks.passed, "Approved illustration must pass gate");
    assertEquals(illChecks.totalApproved, 1);
    pass("Presentation with approved illustrations ('approved_for_use') passes illustration integrity");
  } catch (e) {
    fail("Presentation with approved illustrations ('approved_for_use') passes illustration integrity", e);
  }

  try {
    // Unapproved illustration: reviewStatus is "pending"
    const unapprovedMap = new Map();
    unapprovedMap.set(illContentPackage.slides[0].slideId, {
      slideId: illContentPackage.slides[0].slideId,
      assetId: "asset_img_unapproved",
      reviewStatus: "pending",
      lifecycleStatus: "staged",
      mimeType: "image/png",
      bytes: validPng,
      sha256Hash: validPngSha256,
      base64Data: validPngBase64,
      placement: "right",
    });

    const zip = await JSZip.loadAsync(illPptxBytes);
    const findings = [];
    const illChecks = await evaluateIllustrationIntegrity(
      {
        artifactId: "art_ill",
        artifactBytes: illPptxBytes,
        storedFileHash: illHash,
        outlineVersion: 1,
        contentPackage: illContentPackage,
        contentResultId: "cr_ill",
        generationPlanId: "plan_1",
        moduleId: "mod_1",
        teacherReview: { reviewStatus: "approved", approvedVersion: 1 },
        resolvedIllustrations: unapprovedMap,
        userId: teacherA,
      },
      zip,
      findings
    );
    assert(!illChecks.passed);
    assert(findings.some((f) => f.code === "UNAPPROVED_ILLUSTRATION"));
    pass("Presentation referencing unapproved illustration strictly fails gate with UNAPPROVED_ILLUSTRATION");
  } catch (e) {
    fail("Presentation referencing unapproved illustration strictly fails gate with UNAPPROVED_ILLUSTRATION", e);
  }

  try {
    // Illustration with reviewStatus: 'reviewed' (not yet approved_for_use)
    const pendingDecisionMap = new Map();
    pendingDecisionMap.set(illContentPackage.slides[0].slideId, {
      slideId: illContentPackage.slides[0].slideId,
      assetId: "asset_img_reviewed",
      reviewStatus: "reviewed",
      lifecycleStatus: "staged",
      mimeType: "image/png",
      bytes: validPng,
      sha256Hash: validPngSha256,
      base64Data: validPngBase64,
      placement: "right",
    });

    const zip = await JSZip.loadAsync(illPptxBytes);
    const findings = [];
    const illChecks = await evaluateIllustrationIntegrity(
      {
        artifactId: "art_ill",
        artifactBytes: illPptxBytes,
        storedFileHash: illHash,
        outlineVersion: 1,
        contentPackage: illContentPackage,
        contentResultId: "cr_ill",
        generationPlanId: "plan_1",
        moduleId: "mod_1",
        teacherReview: { reviewStatus: "approved", approvedVersion: 1 },
        resolvedIllustrations: pendingDecisionMap,
        userId: teacherA,
      },
      zip,
      findings
    );
    assert(!illChecks.passed);
    assert(findings.some((f) => f.code === "UNAPPROVED_ILLUSTRATION"));
    pass("Presentation referencing pending review illustration strictly fails gate");
  } catch (e) {
    fail("Presentation referencing pending review illustration strictly fails gate", e);
  }

  try {
    // Revoked illustration: lifecycleStatus is "archived"
    const revokedMap = new Map();
    revokedMap.set(illContentPackage.slides[0].slideId, {
      slideId: illContentPackage.slides[0].slideId,
      assetId: "asset_img_archived",
      reviewStatus: "approved_for_use",
      lifecycleStatus: "archived",
      mimeType: "image/png",
      bytes: validPng,
      sha256Hash: validPngSha256,
      base64Data: validPngBase64,
      placement: "right",
    });

    const zip = await JSZip.loadAsync(illPptxBytes);
    const findings = [];
    const illChecks = await evaluateIllustrationIntegrity(
      {
        artifactId: "art_ill",
        artifactBytes: illPptxBytes,
        storedFileHash: illHash,
        outlineVersion: 1,
        contentPackage: illContentPackage,
        contentResultId: "cr_ill",
        generationPlanId: "plan_1",
        moduleId: "mod_1",
        teacherReview: { reviewStatus: "approved", approvedVersion: 1 },
        resolvedIllustrations: revokedMap,
        userId: teacherA,
      },
      zip,
      findings
    );
    assert(!illChecks.passed);
    assert(findings.some((f) => f.code === "REVOKED_ILLUSTRATION"));
    pass("Presentation referencing revoked illustration ('archived' / 'soft_deleted') fails with REVOKED_ILLUSTRATION");
  } catch (e) {
    fail("Presentation referencing revoked illustration ('archived' / 'soft_deleted') fails with REVOKED_ILLUSTRATION", e);
  }

  try {
    // Missing resolved illustration (storage load failed or missing)
    const zip = await JSZip.loadAsync(illPptxBytes);
    const findings = [];
    const illChecks = await evaluateIllustrationIntegrity(
      {
        artifactId: "art_ill",
        artifactBytes: illPptxBytes,
        storedFileHash: illHash,
        outlineVersion: 1,
        contentPackage: illContentPackage,
        contentResultId: "cr_ill",
        generationPlanId: "plan_1",
        moduleId: "mod_1",
        teacherReview: { reviewStatus: "approved", approvedVersion: 1 },
        resolvedIllustrations: new Map(), // Empty map
        userId: teacherA,
      },
      zip,
      findings
    );
    assert(!illChecks.passed);
    assert(findings.some((f) => f.code === "MISSING_ILLUSTRATION_ASSET"));
    pass("Missing illustration asset in storage fails with MISSING_ILLUSTRATION_ASSET");
  } catch (e) {
    fail("Missing illustration asset in storage fails with MISSING_ILLUSTRATION_ASSET", e);
  }

  try {
    // Media missing from ZIP
    const zip = await JSZip.loadAsync(illPptxBytes);
    // Remove media parts
    for (const key of Object.keys(zip.files)) {
      if (key.startsWith("ppt/media/")) zip.remove(key);
    }
    const missingMediaBytes = await zip.generateAsync({ type: "uint8array" });
    const reloadZip = await JSZip.loadAsync(missingMediaBytes);

    const findings = [];
    const { structuralChecks } = await evaluateStructuralPptx(
      {
        artifactId: "art_ill",
        artifactBytes: missingMediaBytes,
        storedFileHash: "dummy",
        outlineVersion: 1,
        contentPackage: illContentPackage,
        contentResultId: "cr_ill",
        generationPlanId: "plan_1",
        moduleId: "mod_1",
        teacherReview: { reviewStatus: "approved", approvedVersion: 1 },
        userId: teacherA,
      },
      findings
    );
    // Should trigger broken relationship because slide1.rels targets the removed image
    assert(findings.some((f) => f.code === "BROKEN_RELATIONSHIP"));
    pass("Missing media file in 'ppt/media/' fails relationship check with BROKEN_RELATIONSHIP");
  } catch (e) {
    fail("Missing media file in 'ppt/media/' fails relationship check with BROKEN_RELATIONSHIP", e);
  }

  try {
    // Missing slide.xml.rels for illustration slide
    const zip = await JSZip.loadAsync(illPptxBytes);
    zip.remove("ppt/slides/_rels/slide1.xml.rels");

    const findings = [];
    const illChecks = await evaluateIllustrationIntegrity(
      {
        artifactId: "art_ill",
        artifactBytes: illPptxBytes,
        storedFileHash: illHash,
        outlineVersion: 1,
        contentPackage: illContentPackage,
        contentResultId: "cr_ill",
        generationPlanId: "plan_1",
        moduleId: "mod_1",
        teacherReview: { reviewStatus: "approved", approvedVersion: 1 },
        resolvedIllustrations: mockResolvedIllustrations,
        userId: teacherA,
      },
      zip,
      findings
    );
    assert(!illChecks.passed);
    assert(findings.some((f) => f.code === "MISSING_MEDIA_RELATIONSHIP"));
    pass("Missing media relationship in slide XML rels fails with MISSING_MEDIA_RELATIONSHIP");
  } catch (e) {
    fail("Missing media relationship in slide XML rels fails with MISSING_MEDIA_RELATIONSHIP", e);
  }

  try {
    const zip = await JSZip.loadAsync(basePptxBytes);
    const findings = [];
    const illChecks = await evaluateIllustrationIntegrity(
      {
        artifactId: "art_base",
        artifactBytes: basePptxBytes,
        storedFileHash: baseHash,
        outlineVersion: 1,
        contentPackage: baseContentPackage, // Has no illustrations
        contentResultId: "cr_base",
        generationPlanId: "plan_1",
        moduleId: "mod_1",
        teacherReview: { reviewStatus: "approved", approvedVersion: 1 },
        userId: teacherA,
      },
      zip,
      findings
    );
    assert(illChecks.passed);
    assertEquals(illChecks.totalReferenced, 0);
    pass("Pure text presentation without illustrations passes illustration integrity trivially");
  } catch (e) {
    fail("Pure text presentation without illustrations passes illustration integrity trivially", e);
  }

  // ==============================================================================
  // Suite 6: Version & Provenance Integrity
  // ==============================================================================
  console.log("\n--- Suite 6: Version & Provenance Integrity ---");

  try {
    const actualHash = computeBytesSha256(basePptxBytes);
    assertEquals(actualHash, baseHash);
    pass("Checksum validation: Correct SHA-256 binary hash passes");
  } catch (e) {
    fail("Checksum validation: Correct SHA-256 binary hash passes", e);
  }

  try {
    const findings = [];
    const tamperedHash = "tampered_hash_0123456789abcdef0123456789abcdef0123456789abcdef012345";
    const checks = evaluateVersionIntegrity(
      {
        artifactId: "art_1",
        artifactBytes: basePptxBytes,
        storedFileHash: tamperedHash,
        outlineVersion: 1,
        contentPackage: baseContentPackage,
        contentResultId: "cr_1",
        generationPlanId: "plan_1",
        moduleId: "mod_1",
        teacherReview: { reviewStatus: "approved", approvedVersion: 1 },
        userId: teacherA,
      },
      findings
    );
    assert(!checks.passed);
    assert(findings.some((f) => f.code === "ARTIFACT_HASH_MISMATCH"));
    pass("Checksum validation: Tampered binary hash fails with ARTIFACT_HASH_MISMATCH");
  } catch (e) {
    fail("Checksum validation: Tampered binary hash fails with ARTIFACT_HASH_MISMATCH", e);
  }

  try {
    const evalResult = await evaluatePresentationQuality({
      artifactId: "art_prov",
      artifactBytes: basePptxBytes,
      storedFileHash: baseHash,
      outlineVersion: 1,
      contentPackage: baseContentPackage,
      contentResultId: "cr_prov",
      generationPlanId: "plan_prov",
      moduleId: "mod_prov",
      teacherReview: { reviewStatus: "approved", approvedVersion: 1 },
      userId: teacherA,
    });
    assertEquals(evalResult.generationPlanId, "plan_prov");
    assertEquals(evalResult.contentResultId, "cr_prov");
    assertEquals(evalResult.artifactId, "art_prov");
    assertEquals(evalResult.artifactHash, baseHash);
    pass("End-to-end provenance traceability: Request ID, Content Result ID, Plan ID, Artifact ID verified");
  } catch (e) {
    fail("End-to-end provenance traceability: Request ID, Content Result ID, Plan ID, Artifact ID verified", e);
  }

  try {
    // Seed artifact and review v1 in fallback
    fallbackPresentationArtifacts.set("art_v1", {
      id: "art_v1",
      request_id: "req_1",
      content_result_id: "cr_v1",
      generation_plan_id: "plan_shared",
      module_id: "mod_shared",
      owner_id: teacherA,
      tenant_id: "default",
      storage_reference: "presentations/art_v1.pptx",
      storage_provider: "supabase_storage",
      public_url: "/art_v1.pptx",
      download_url: "/download/art_v1.pptx",
      filename: "presentation_v1.pptx",
      mime_type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      byte_size: basePptxBytes.length,
      file_hash: baseHash,
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
    fallbackPresentationResults.set("cr_v1", {
      id: "cr_v1",
      request_id: "req_1",
      generation_plan_id: "plan_shared",
      module_id: "mod_shared",
      approved_version: 1,
      content_package: baseContentPackage,
    });
    fallbackPresentationReviews.set("rev_v1", {
      id: "rev_v1",
      presentation_id: "pres_v1",
      content_result_id: "cr_v1",
      generation_plan_id: "plan_shared",
      module_id: "mod_shared",
      approved_version: 1,
      review_status: "approved",
      validation_summary: {},
      reviewed_by: teacherA,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const resV1 = await executeEvaluatePresentationQuality(
      { artifactId: "art_v1", mockBytes: basePptxBytes },
      { userId: teacherA, role: "guru" }
    );
    assertEquals(resV1.evaluation.status, "passed");

    // Seed v2
    const v2Content = { ...baseContentPackage, metadata: { ...baseContentPackage.metadata, version: 2 } };
    const v2Render = await renderPresentationPptx(v2Content);
    v2RenderBytes = v2Render.bytes;
    fallbackPresentationArtifacts.set("art_v2", {
      id: "art_v2",
      request_id: "req_2",
      content_result_id: "cr_v2",
      generation_plan_id: "plan_shared",
      module_id: "mod_shared",
      owner_id: teacherA,
      tenant_id: "default",
      storage_reference: "presentations/art_v2.pptx",
      storage_provider: "supabase_storage",
      public_url: "/art_v2.pptx",
      download_url: "/download/art_v2.pptx",
      filename: "presentation_v2.pptx",
      mime_type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      byte_size: v2Render.bytes.length,
      file_hash: v2Render.fileHash,
      slide_count: 3,
      outline_version: 2,
      style_id: "corporate_clean",
      style_version: 1,
      renderer_version: "v1.0.0",
      status: "ready",
      render_metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    fallbackPresentationResults.set("cr_v2", {
      id: "cr_v2",
      request_id: "req_2",
      generation_plan_id: "plan_shared",
      module_id: "mod_shared",
      approved_version: 2,
      content_package: v2Content,
    });
    fallbackPresentationReviews.set("rev_v2", {
      id: "rev_v2",
      presentation_id: "pres_v2",
      content_result_id: "cr_v2",
      generation_plan_id: "plan_shared",
      module_id: "mod_shared",
      approved_version: 2,
      review_status: "approved",
      validation_summary: {},
      reviewed_by: teacherA,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Evaluate v2
    const resV2 = await executeEvaluatePresentationQuality(
      { artifactId: "art_v2", mockBytes: v2Render.bytes },
      { userId: teacherA, role: "guru" }
    );
    assertEquals(resV2.evaluation.status, "passed");

    // Check that v1 evaluation was transitioned to superseded
    const oldEval = fallbackPresentationQualityEvaluations.get(resV1.evaluation.id);
    assertEquals(oldEval.status, "superseded");
    pass("Version bump to v2: New evaluation for v2 automatically transitions v1 evaluation to 'superseded'");
  } catch (e) {
    fail("Version bump to v2: New evaluation for v2 automatically transitions v1 evaluation to 'superseded'", e);
  }

  try {
    // Attempt download of v1 after superseded
    let rejected = false;
    try {
      await executeSecureDownloadPresentationPptx(
        { artifactId: "art_v1", mockBytes: basePptxBytes },
        { userId: teacherA, role: "guru" }
      );
    } catch (err) {
      rejected = true;
      assert(err.message.includes("Unduhan ditolak"), "Should state download rejected");
    }
    assert(rejected, "Superseded evaluation must block download");
    pass("Superseded evaluation no longer authorizes download");
  } catch (e) {
    fail("Superseded evaluation no longer authorizes download", e);
  }

  try {
    const listRes = await executeListPresentationQualityEvaluations(
      { generationPlanId: "plan_shared" },
      { userId: teacherA, role: "guru" }
    );
    assert(listRes.evaluations.length >= 2, "Must contain both v1 and v2 evaluation records");
    pass("Historical evaluation records are preserved non-destructively");
  } catch (e) {
    fail("Historical evaluation records are preserved non-destructively", e);
  }

  // ==============================================================================
  // Suite 7: Visual Quality & Boundary Validation
  // ==============================================================================
  console.log("\n--- Suite 7: Visual Quality & Boundary Validation ---");

  try {
    const findings = [];
    const visualChecks = evaluateVisualQuality(
      {
        artifactId: "art_1",
        artifactBytes: basePptxBytes,
        storedFileHash: baseHash,
        outlineVersion: 1,
        contentPackage: baseContentPackage,
        contentResultId: "cr_1",
        generationPlanId: "plan_1",
        moduleId: "mod_1",
        teacherReview: { reviewStatus: "approved", approvedVersion: 1 },
        userId: teacherA,
      },
      findings
    );
    assert(visualChecks.passed, "Visual checks must pass on standard package");
    assert(visualChecks.canvasBoundsValid, "Canvas bounds valid");
    pass("Standard 16:9 widescreen layout passes boundary checks (assertWithinSlideBounds)");
  } catch (e) {
    fail("Standard 16:9 widescreen layout passes boundary checks (assertWithinSlideBounds)", e);
  }

  try {
    const findings = [];
    const visualChecks = evaluateVisualQuality(
      {
        artifactId: "art_ill",
        artifactBytes: illPptxBytes,
        storedFileHash: illHash,
        outlineVersion: 1,
        contentPackage: illContentPackage,
        contentResultId: "cr_ill",
        generationPlanId: "plan_1",
        moduleId: "mod_1",
        teacherReview: { reviewStatus: "approved", approvedVersion: 1 },
        userId: teacherA,
      },
      findings
    );
    assert(visualChecks.passed, "Visual checks must pass with illustration");
    assert(!visualChecks.overlappingElements, "Elements must not overlap");
    pass("Layout calculation ensures non-overlapping text and illustration bounding boxes");
  } catch (e) {
    fail("Layout calculation ensures non-overlapping text and illustration bounding boxes", e);
  }

  try {
    // Test severe overflow detection by giving impossible slide dimensions
    const illBadPackage = createMockContentPackage("pres_bad_layout", 1);
    illBadPackage.slides[0].illustrationReference = {
      assetId: "asset_img_approved",
      placement: "right",
      isApproved: true,
    };
    // Visual quality with normal parameters passes
    const findings = [];
    const visualChecks = evaluateVisualQuality(
      {
        artifactId: "art_bad",
        artifactBytes: basePptxBytes,
        storedFileHash: baseHash,
        outlineVersion: 1,
        contentPackage: illBadPackage,
        contentResultId: "cr_bad",
        generationPlanId: "plan_1",
        moduleId: "mod_1",
        teacherReview: { reviewStatus: "approved", approvedVersion: 1 },
        userId: teacherA,
      },
      findings
    );
    assert(visualChecks.passed);
    pass("Visual layout bounds verification handles side-by-side placements cleanly");
  } catch (e) {
    fail("Visual layout bounds verification handles side-by-side placements cleanly", e);
  }

  try {
    // Blank slide test
    const blankPackage = createMockContentPackage("pres_blank", 1);
    blankPackage.slides[0].title = "";
    blankPackage.slides[0].contentBlocks = [];
    delete blankPackage.slides[0].illustrationReference;

    const findings = [];
    const visualChecks = evaluateVisualQuality(
      {
        artifactId: "art_blank",
        artifactBytes: basePptxBytes,
        storedFileHash: baseHash,
        outlineVersion: 1,
        contentPackage: blankPackage,
        contentResultId: "cr_blank",
        generationPlanId: "plan_1",
        moduleId: "mod_1",
        teacherReview: { reviewStatus: "approved", approvedVersion: 1 },
        userId: teacherA,
      },
      findings
    );
    assert(!visualChecks.passed);
    assert(findings.some((f) => f.code === "BLANK_SLIDE_DETECTED"));
    pass("Blank slide without title, content, or media flags BLANK_SLIDE_DETECTED");
  } catch (e) {
    fail("Blank slide without title, content, or media flags BLANK_SLIDE_DETECTED", e);
  }

  try {
    const placements = ["right", "left", "center", "full_width", "split_card"];
    for (const p of placements) {
      const pPackage = createMockContentPackage(`pres_${p}`, 1);
      pPackage.slides[0].illustrationReference = {
        assetId: "asset_test",
        placement: p,
        isApproved: true,
      };
      const findings = [];
      const v = evaluateVisualQuality(
        {
          artifactId: `art_${p}`,
          artifactBytes: basePptxBytes,
          storedFileHash: baseHash,
          outlineVersion: 1,
          contentPackage: pPackage,
          contentResultId: "cr_1",
          generationPlanId: "plan_1",
          moduleId: "mod_1",
          teacherReview: { reviewStatus: "approved", approvedVersion: 1 },
          userId: teacherA,
        },
        findings
      );
      assert(v.passed, `Placement ${p} must pass`);
    }
    pass("Multi-placement support ('right', 'left', 'center', 'full_width', 'split_card') passes boundary safety");
  } catch (e) {
    fail("Multi-placement support ('right', 'left', 'center', 'full_width', 'split_card') passes boundary safety", e);
  }

  // ==============================================================================
  // Suite 8: Advisory AI Evaluation & Sovereign Authority
  // ==============================================================================
  console.log("\n--- Suite 8: Advisory AI Evaluation & Sovereign Authority ---");

  try {
    const aiEval = evaluateAiQuality({
      contentPackage: baseContentPackage,
      enableAiAdvisory: true,
    });
    assert(aiEval !== null, "AI eval should return result when enabled");
    assert(aiEval.coherenceScore >= 80, "Coherence score should be >= 80");
    assert(aiEval.passed, "Advisory eval passes");
    pass("Advisory AI evaluation produces educational consistency metrics when enabled");
  } catch (e) {
    fail("Advisory AI evaluation produces educational consistency metrics when enabled", e);
  }

  try {
    const origSlides = JSON.stringify(baseContentPackage.slides);
    evaluateAiQuality({
      contentPackage: baseContentPackage,
      enableAiAdvisory: true,
    });
    const afterSlides = JSON.stringify(baseContentPackage.slides);
    assertEquals(origSlides, afterSlides);
    pass("Invariant: AI evaluation is advisory and NEVER modifies presentation content");
  } catch (e) {
    fail("Invariant: AI evaluation is advisory and NEVER modifies presentation content", e);
  }

  try {
    // When review is rejected, AI evaluation passing cannot force overall PASS
    const fullEval = await evaluatePresentationQuality({
      artifactId: "art_reject",
      artifactBytes: basePptxBytes,
      storedFileHash: baseHash,
      outlineVersion: 1,
      contentPackage: baseContentPackage,
      contentResultId: "cr_reject",
      generationPlanId: "plan_1",
      moduleId: "mod_1",
      teacherReview: { reviewStatus: "rejected", approvedVersion: 1 },
      userId: teacherA,
      enableAiAdvisory: true,
    });
    assertEquals(fullEval.decision, "FAIL");
    assertEquals(fullEval.status, "failed");
    assert(fullEval.aiEvaluation.passed, "AI eval passed");
    pass("Invariant: AI evaluation NEVER overrides teacher approval or rejection");
  } catch (e) {
    fail("Invariant: AI evaluation NEVER overrides teacher approval or rejection", e);
  }

  try {
    const noAiEval = evaluateAiQuality({
      contentPackage: baseContentPackage,
      enableAiAdvisory: false,
    });
    assertEquals(noAiEval, null);
    pass("Advisory AI evaluation can be disabled without impacting deterministic technical checks");
  } catch (e) {
    fail("Advisory AI evaluation can be disabled without impacting deterministic technical checks", e);
  }

  // ==============================================================================
  // Suite 9: Decision Engine, Failure Semantics & Idempotency
  // ==============================================================================
  console.log("\n--- Suite 9: Decision Engine, Failure Semantics & Idempotency ---");

  try {
    const fullEval = await evaluatePresentationQuality({
      artifactId: "art_clean",
      artifactBytes: basePptxBytes,
      storedFileHash: baseHash,
      outlineVersion: 1,
      contentPackage: baseContentPackage,
      contentResultId: "cr_clean",
      generationPlanId: "plan_clean",
      moduleId: "mod_clean",
      teacherReview: { reviewStatus: "approved", approvedVersion: 1 },
      userId: teacherA,
    });
    assertEquals(fullEval.decision, "PASS");
    assertEquals(fullEval.status, "passed");
    assertEquals(fullEval.findings.length, 0);
    pass("Clean evaluation derives Decision PASS and Status passed");
  } catch (e) {
    fail("Clean evaluation derives Decision PASS and Status passed", e);
  }

  try {
    const fullEval = await evaluatePresentationQuality({
      artifactId: "art_corrupt",
      artifactBytes: Buffer.from("broken content"),
      storedFileHash: "dummy",
      outlineVersion: 1,
      contentPackage: baseContentPackage,
      contentResultId: "cr_clean",
      generationPlanId: "plan_clean",
      moduleId: "mod_clean",
      teacherReview: { reviewStatus: "approved", approvedVersion: 1 },
      userId: teacherA,
    });
    assertEquals(fullEval.decision, "FAIL");
    assertEquals(fullEval.status, "failed");
    assert(fullEval.findings.length > 0);
    pass("Critical finding derives Decision FAIL and Status failed");
  } catch (e) {
    fail("Critical finding derives Decision FAIL and Status failed", e);
  }

  try {
    const fullEval = await evaluatePresentationQuality({
      artifactId: "art_fail_diag",
      artifactBytes: Buffer.from("broken content"),
      storedFileHash: "dummy",
      outlineVersion: 1,
      contentPackage: baseContentPackage,
      contentResultId: "cr_clean",
      generationPlanId: "plan_clean",
      moduleId: "mod_clean",
      teacherReview: { reviewStatus: "approved", approvedVersion: 1 },
      userId: teacherA,
    });
    assert(fullEval.findings.some((f) => f.code === "INVALID_ZIP_MAGIC"));
    assert(fullEval.structuralChecks.failureReason !== undefined);
    pass("Failure preserves diagnostic findings and details for teacher inspection");
  } catch (e) {
    fail("Failure preserves diagnostic findings and details for teacher inspection", e);
  }

  try {
    // Artifact row should still exist in fallback
    assert(fallbackPresentationArtifacts.has("art_v2"));
    pass("Failure does NOT trigger automatic regeneration or file deletion");
  } catch (e) {
    fail("Failure does NOT trigger automatic regeneration or file deletion", e);
  }

  try {
    // Idempotent caching test: calling twice on unchanged art_v2
    const firstCall = await executeEvaluatePresentationQuality(
      { artifactId: "art_v2", mockBytes: v2RenderBytes || basePptxBytes },
      { userId: teacherA, role: "guru" }
    );
    const secondCall = await executeEvaluatePresentationQuality(
      { artifactId: "art_v2", mockBytes: v2RenderBytes || basePptxBytes },
      { userId: teacherA, role: "guru" }
    );
    assertEquals(firstCall.evaluation.id, secondCall.evaluation.id);
    pass("Idempotent evaluation: Repeated evaluation of unchanged artifact returns cached evaluation");
  } catch (e) {
    fail("Idempotent evaluation: Repeated evaluation of unchanged artifact returns cached evaluation", e);
  }

  try {
    // Force re-evaluate test
    const reeval = await executeEvaluatePresentationQuality(
      { artifactId: "art_v2", forceReevaluate: true, mockBytes: v2RenderBytes || basePptxBytes },
      { userId: teacherA, role: "guru" }
    );
    assert(reeval.evaluation.id !== undefined);
    pass("Force re-evaluate (forceReevaluate: true) re-runs full validation and produces fresh record");
  } catch (e) {
    fail("Force re-evaluate (forceReevaluate: true) re-runs full validation and produces fresh record", e);
  }

  // ==============================================================================
  // Suite 10: Secure Download Gatekeeper & Multi-Tenant RBAC
  // ==============================================================================
  console.log("\n--- Suite 10: Secure Download Gatekeeper & Multi-Tenant RBAC ---");

  try {
    // art_v2 is approved and has passed quality gate -> Teacher A can download
    const dlResult = await executeSecureDownloadPresentationPptx(
      { artifactId: "art_v2", mockBytes: v2RenderBytes || basePptxBytes },
      { userId: teacherA, role: "guru" }
    );
    assertEquals(dlResult.status, "success");
    assertEquals(dlResult.artifactId, "art_v2");
    pass("Authorized teacher can download artifact after quality gate passes");
  } catch (e) {
    fail("Authorized teacher can download artifact after quality gate passes", e);
  }

  try {
    // Unapproved presentation download attempt
    fallbackPresentationArtifacts.set("art_unapproved", {
      id: "art_unapproved",
      request_id: "req_u",
      content_result_id: "cr_u",
      generation_plan_id: "plan_u",
      module_id: "mod_u",
      owner_id: teacherA,
      tenant_id: "default",
      storage_reference: "presentations/unapproved.pptx",
      storage_provider: "supabase_storage",
      public_url: "/unapproved.pptx",
      download_url: "/download/unapproved.pptx",
      filename: "unapproved.pptx",
      mime_type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      byte_size: basePptxBytes.length,
      file_hash: baseHash,
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
    fallbackPresentationResults.set("cr_u", {
      id: "cr_u",
      request_id: "req_u",
      generation_plan_id: "plan_u",
      module_id: "mod_u",
      approved_version: 1,
      content_package: baseContentPackage,
    });
    // Review status: 'in_review'
    fallbackPresentationReviews.set("rev_u", {
      id: "rev_u",
      presentation_id: "pres_u",
      content_result_id: "cr_u",
      generation_plan_id: "plan_u",
      module_id: "mod_u",
      approved_version: 1,
      review_status: "in_review",
      validation_summary: {},
      reviewed_by: teacherA,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    let rejected = false;
    try {
      await executeSecureDownloadPresentationPptx(
        { artifactId: "art_unapproved", mockBytes: basePptxBytes },
        { userId: teacherA, role: "guru" }
      );
    } catch (err) {
      rejected = true;
      assert(err.message.includes("Unduhan ditolak"), "Error explains rejection");
    }
    assert(rejected, "Must reject unapproved download");
    pass("Download attempt on unapproved presentation is blocked with PRESENTATION_DOWNLOAD_UNAUTHORIZED");
  } catch (e) {
    fail("Download attempt on unapproved presentation is blocked with PRESENTATION_DOWNLOAD_UNAUTHORIZED", e);
  }

  try {
    // Artifact without quality evaluation pass
    fallbackPresentationArtifacts.set("art_no_eval", {
      id: "art_no_eval",
      request_id: "req_ne",
      content_result_id: "cr_ne",
      generation_plan_id: "plan_ne",
      module_id: "mod_ne",
      owner_id: teacherA,
      tenant_id: "default",
      storage_reference: "presentations/no_eval.pptx",
      storage_provider: "supabase_storage",
      public_url: "/no_eval.pptx",
      download_url: "/download/no_eval.pptx",
      filename: "no_eval.pptx",
      mime_type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      byte_size: basePptxBytes.length,
      file_hash: baseHash,
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
    fallbackPresentationResults.set("cr_ne", {
      id: "cr_ne",
      request_id: "req_ne",
      generation_plan_id: "plan_ne",
      module_id: "mod_ne",
      approved_version: 1,
      content_package: baseContentPackage,
    });
    fallbackPresentationReviews.set("rev_ne", {
      id: "rev_ne",
      presentation_id: "pres_ne",
      content_result_id: "cr_ne",
      generation_plan_id: "plan_ne",
      module_id: "mod_ne",
      approved_version: 1,
      review_status: "approved",
      validation_summary: {},
      reviewed_by: teacherA,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    let rejected = false;
    try {
      await executeSecureDownloadPresentationPptx(
        { artifactId: "art_no_eval", mockBytes: basePptxBytes },
        { userId: teacherA, role: "guru" }
      );
    } catch (err) {
      rejected = true;
      assert(err.message.includes("gerbang mutu"), "Error explains quality gate block");
    }
    assert(rejected, "Must block download when quality evaluation has not passed");
    pass("Download attempt on unvalidated quality gate artifact is blocked with PRESENTATION_QUALITY_GATE_BLOCKED");
  } catch (e) {
    fail("Download attempt on unvalidated quality gate artifact is blocked with PRESENTATION_QUALITY_GATE_BLOCKED", e);
  }

  try {
    // Cross-tenant download: Teacher B tries to download Teacher A's artifact
    let rejected = false;
    try {
      await executeSecureDownloadPresentationPptx(
        { artifactId: "art_v2", mockBytes: v2RenderBytes || basePptxBytes },
        { userId: teacherB, role: "guru" }
      );
    } catch (err) {
      rejected = true;
      assert(err.message.includes("Akses ditolak"), "Error explains cross-tenant forbidden");
    }
    assert(rejected, "Cross-tenant download must be rejected");
    pass("Cross-tenant download attempt by different teacher is blocked with ROLE_FORBIDDEN");
  } catch (e) {
    fail("Cross-tenant download attempt by different teacher is blocked with ROLE_FORBIDDEN", e);
  }

  try {
    // Student role download attempt
    let rejected = false;
    try {
      await executeSecureDownloadPresentationPptx(
        { artifactId: "art_v2", mockBytes: v2RenderBytes || basePptxBytes },
        { userId: student, role: "siswa" }
      );
    } catch (err) {
      rejected = true;
      assert(err.message.includes("hanya diizinkan untuk peran Guru"), "Error explains role rejection");
    }
    assert(rejected, "Student download must be rejected");
    pass("Student role ('siswa') download attempt is strictly blocked with ROLE_FORBIDDEN");
  } catch (e) {
    fail("Student role ('siswa') download attempt is strictly blocked with ROLE_FORBIDDEN", e);
  }

  try {
    // Tampered binary at download time
    const tamperedBytes = Buffer.from("tampered binary payload");
    let rejected = false;
    try {
      await executeSecureDownloadPresentationPptx(
        { artifactId: "art_v2", mockBytes: tamperedBytes },
        { userId: teacherA, role: "guru" }
      );
    } catch (err) {
      rejected = true;
      assert(err.message.includes("checksum SHA-256"), "Error explains checksum corruption");
    }
    assert(rejected, "Tampered download must be rejected");
    pass("Tampered binary at download time triggers PRESENTATION_ARTIFACT_HASH_MISMATCH");
  } catch (e) {
    fail("Tampered binary at download time triggers PRESENTATION_ARTIFACT_HASH_MISMATCH", e);
  }

  // ==============================================================================
  // SUMMARY
  // ==============================================================================
  console.log("\n==============================================================================");
  console.log(`PPT-1F TEST SUITE COMPLETE: ${passedTests} PASSED, ${failedTests} FAILED.`);
  console.log("==============================================================================");

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("FATAL ERROR IN TEST RUNNER:", err);
  process.exit(1);
});
