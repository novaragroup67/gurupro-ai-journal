/**
 * ==============================================================================
 * GURUPRO AI: PRESENTATION QUALITY GATE CONTRACT (PPT-1F)
 * ==============================================================================
 *
 * Defines canonical data contracts, Zod schemas, validation rules, decision models,
 * and findings specifications for the Final PPTX Quality, Security & E2E Gate.
 *
 * Invariants:
 * 1. Strict Sovereign Human Authority: Quality status can only reach 'passed' if
 *    the exact presentation version has an active teacher approval (review_status === 'approved').
 * 2. Multi-Tier Gate:
 *    - Tier 1: Preconditions & Version/Approval Integrity
 *    - Tier 2: Deterministic OpenXML Structural Validation (ZIP signatures, parts, rels, no broken links)
 *    - Tier 3: Content Integrity (slides match approved package, titles, blocks, language)
 *    - Tier 4: Illustration Integrity (VIS-1D/1E approvals, media parts, no revoked assets)
 *    - Tier 5: Visual Layout & Boundary Checks (non-overlapping boxes, canvas bounds)
 *    - Tier 6: Advisory AI Educational Evaluation (never overrides teacher authority)
 * 3. Immutable Snapshot & Hash Binding: Bound to exact artifactId and SHA-256 binary hash.
 * 4. Non-Destructive Invariant: Failed evaluation never deletes artifacts or triggers auto-regeneration.
 * 5. Download Gatekeeper: Artifacts can only be downloaded if quality status === 'passed'
 *    and teacher ownership / RBAC is verified.
 */

import { z } from "zod";

export const CANONICAL_PRESENTATION_QUALITY_EVALUATOR_VERSION = "presentation_quality_v1";

// ==============================================================================
// 1. QUALITY STATUS, DECISION & SEVERITY TAXONOMY
// ==============================================================================

export const PresentationQualityStatusSchema = z.enum([
  "pending",    // Evaluation is pending or in progress
  "passed",     // All blocking validations passed; artifact is approved and downloadable ("PPTX Ready")
  "failed",     // One or more blocking checks failed; artifact is rejected for distribution
  "superseded", // Previously passed evaluation invalidated by a newer version
]);
export type PresentationQualityStatus = z.infer<typeof PresentationQualityStatusSchema>;

export const PresentationQualityDecisionSchema = z.enum([
  "PASS",  // All structural, content, illustration, version, and visual checks passed
  "FAIL",  // One or more critical requirements violated
  "ERROR", // Catastrophic processing failure (e.g. corrupted file, inaccessible storage)
]);
export type PresentationQualityDecision = z.infer<typeof PresentationQualityDecisionSchema>;

export const PresentationFindingSeveritySchema = z.enum([
  "critical", // Blocking defect; forces FAIL or ERROR
  "warning",  // Non-blocking defect; advisory for teacher
  "info",     // Educational observation or metadata
]);
export type PresentationFindingSeverity = z.infer<typeof PresentationFindingSeveritySchema>;

export const PresentationFindingCategorySchema = z.enum([
  "structure",    // OpenXML package, ZIP integrity, XML parts, relationships
  "content",      // Slide count, titles, content blocks, language, sequence
  "illustration", // Asset approval, media embedding, broken image relationships
  "version",      // Hash mismatch, version mismatch, unapproved presentation
  "visual",       // Layout overflow, clipping, overlapping elements, blank slides
  "security",     // Tenant boundary, role forbidden, storage permissions
  "ai_eval",      // Advisory educational consistency & readability
]);
export type PresentationFindingCategory = z.infer<typeof PresentationFindingCategorySchema>;

// ==============================================================================
// 2. STRUCTURED FINDING CONTRACT
// ==============================================================================

export const PresentationQualityFindingSchema = z.object({
  code: z.string().min(1, "Kode temuan wajib ada."),
  severity: PresentationFindingSeveritySchema,
  category: PresentationFindingCategorySchema,
  description: z.string().min(1, "Deskripsi temuan wajib ada."),
  slideNumber: z.number().int().positive().optional(),
  assetId: z.string().optional(),
  recommendation: z.string().optional(),
});
export type PresentationQualityFinding = z.infer<typeof PresentationQualityFindingSchema>;

// ==============================================================================
// 3. TIER CHECKS CONTRACTS
// ==============================================================================

export const StructuralPptxChecksSchema = z.object({
  zipMagicValid: z.boolean(),
  byteSize: z.number().int().nonnegative(),
  contentTypesValid: z.boolean(),
  presentationXmlValid: z.boolean(),
  rootRelsValid: z.boolean(),
  presentationRelsValid: z.boolean(),
  slidePartsFound: z.number().int().nonnegative(),
  expectedSlideCount: z.number().int().positive().optional(),
  slideCountMatches: z.boolean(),
  slideOrderingValid: z.boolean(),
  brokenRelationshipsFound: z.boolean(),
  brokenRelationshipDetails: z.array(z.string()).default([]),
  missingXmlParts: z.array(z.string()).default([]),
  notesPartsCount: z.number().int().nonnegative().default(0),
  mediaPartsCount: z.number().int().nonnegative().default(0),
  passed: z.boolean(),
  failureReason: z.string().optional(),
});
export type StructuralPptxChecks = z.infer<typeof StructuralPptxChecksSchema>;

export const ContentIntegrityChecksSchema = z.object({
  slideCountMatches: z.boolean(),
  slideOrderMatches: z.boolean(),
  titlesPresent: z.boolean(),
  contentBlocksPresent: z.boolean(),
  illustrationsPresent: z.boolean(),
  captionsPresent: z.boolean(),
  layoutMatches: z.boolean(),
  languageConsistent: z.boolean(),
  missingContentSlides: z.array(z.number()).default([]),
  unexpectedSlides: z.array(z.number()).default([]),
  passed: z.boolean(),
  failureReason: z.string().optional(),
});
export type ContentIntegrityChecks = z.infer<typeof ContentIntegrityChecksSchema>;

export const IllustrationIntegrityChecksSchema = z.object({
  totalReferenced: z.number().int().nonnegative(),
  totalValid: z.number().int().nonnegative(),
  totalApproved: z.number().int().nonnegative(),
  allApproved: z.boolean(),
  missingAssets: z.array(z.string()).default([]),
  unapprovedAssets: z.array(z.string()).default([]),
  revokedAssets: z.array(z.string()).default([]),
  embeddedMediaMatches: z.boolean(),
  passed: z.boolean(),
  failureReason: z.string().optional(),
});
export type IllustrationIntegrityChecks = z.infer<typeof IllustrationIntegrityChecksSchema>;

export const VersionIntegrityChecksSchema = z.object({
  planId: z.string(),
  contentResultId: z.string(),
  artifactId: z.string(),
  artifactHash: z.string(),
  artifactHashMatches: z.boolean(),
  presentationVersion: z.number().int().positive(),
  approvedVersion: z.number().int().positive(),
  versionsMatch: z.boolean(),
  teacherApprovalActive: z.boolean(),
  teacherApprovalStatus: z.string(),
  passed: z.boolean(),
  failureReason: z.string().optional(),
});
export type VersionIntegrityChecks = z.infer<typeof VersionIntegrityChecksSchema>;

export const VisualQualityChecksSchema = z.object({
  canvasBoundsValid: z.boolean(),
  overflowDetected: z.boolean(),
  overlappingElements: z.boolean(),
  severeClipping: z.boolean(),
  blankSlidesDetected: z.boolean(),
  minimumReadableFontSize: z.boolean(),
  passed: z.boolean(),
  failureReason: z.string().optional(),
});
export type VisualQualityChecks = z.infer<typeof VisualQualityChecksSchema>;

export const AiQualityEvaluationSchema = z.object({
  coherenceScore: z.number().min(0).max(100),
  completenessScore: z.number().min(0).max(100),
  readabilityScore: z.number().min(0).max(100),
  educationalConsistencyScore: z.number().min(0).max(100),
  alignmentScore: z.number().min(0).max(100),
  summary: z.string(),
  passed: z.boolean(),
});
export type AiQualityEvaluation = z.infer<typeof AiQualityEvaluationSchema>;

// ==============================================================================
// 4. CANONICAL QUALITY EVALUATION SCHEMA
// ==============================================================================

export const PresentationQualityEvaluationSchema = z.object({
  id: z.string(),
  artifactId: z.string(),
  contentResultId: z.string(),
  generationPlanId: z.string(),
  moduleId: z.string(),
  artifactHash: z.string(),
  presentationVersion: z.number().int().positive(),
  approvedVersion: z.number().int().positive(),
  evaluatorVersion: z.string().default(CANONICAL_PRESENTATION_QUALITY_EVALUATOR_VERSION),
  status: PresentationQualityStatusSchema,
  decision: PresentationQualityDecisionSchema,
  structuralChecks: StructuralPptxChecksSchema,
  contentChecks: ContentIntegrityChecksSchema,
  illustrationChecks: IllustrationIntegrityChecksSchema,
  versionChecks: VersionIntegrityChecksSchema,
  visualChecks: VisualQualityChecksSchema,
  aiEvaluation: AiQualityEvaluationSchema.optional().nullable(),
  findings: z.array(PresentationQualityFindingSchema).default([]),
  evaluatedBy: z.string(),
  evaluatedAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PresentationQualityEvaluation = z.infer<typeof PresentationQualityEvaluationSchema>;

// ==============================================================================
// 5. DECISION DERIVATION LOGIC
// ==============================================================================

export function derivePresentationQualityDecision(
  findings: PresentationQualityFinding[],
  tierResults: {
    versionPassed: boolean;
    structuralPassed: boolean;
    contentPassed: boolean;
    illustrationPassed: boolean;
    visualPassed: boolean;
  }
): { decision: PresentationQualityDecision; status: PresentationQualityStatus } {
  // Check for critical findings
  const hasCritical = findings.some((f) => f.severity === "critical");
  const hasError = findings.some(
    (f) =>
      f.code === "CORRUPTED_ZIP_ARCHIVE" ||
      f.code === "STORAGE_DOWNLOAD_FAILED" ||
      f.code === "EMPTY_ARTIFACT_PAYLOAD"
  );

  const allTiersPassed =
    tierResults.versionPassed &&
    tierResults.structuralPassed &&
    tierResults.contentPassed &&
    tierResults.illustrationPassed &&
    tierResults.visualPassed;

  if (hasError) {
    return { decision: "ERROR", status: "failed" };
  }

  if (hasCritical || !allTiersPassed) {
    return { decision: "FAIL", status: "failed" };
  }

  return { decision: "PASS", status: "passed" };
}

// ==============================================================================
// 6. SERVER FUNCTION INPUT SCHEMAS
// ==============================================================================

export const EvaluatePresentationQualityInputSchema = z.object({
  artifactId: z.string().min(1, "Artifact ID wajib disertakan."),
  forceReevaluate: z.boolean().optional().default(false),
});
export type EvaluatePresentationQualityInput = z.infer<
  typeof EvaluatePresentationQualityInputSchema
>;

export const GetPresentationQualityEvaluationInputSchema = z.object({
  artifactId: z.string().min(1, "Artifact ID wajib disertakan."),
});
export type GetPresentationQualityEvaluationInput = z.infer<
  typeof GetPresentationQualityEvaluationInputSchema
>;

export const ListPresentationQualityEvaluationsInputSchema = z.object({
  moduleId: z.string().optional(),
  generationPlanId: z.string().optional(),
});
export type ListPresentationQualityEvaluationsInput = z.infer<
  typeof ListPresentationQualityEvaluationsInputSchema
>;

export const DownloadPresentationPptxInputSchema = z.object({
  artifactId: z.string().min(1, "Artifact ID wajib disertakan."),
});
export type DownloadPresentationPptxInput = z.infer<
  typeof DownloadPresentationPptxInputSchema
>;
