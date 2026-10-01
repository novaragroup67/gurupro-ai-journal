/**
 * ==============================================================================
 * GURUPRO AI: ILLUSTRATION QUALITY GATE CONTRACT (VIS-1E)
 * ==============================================================================
 *
 * Defines canonical data contracts, Zod schemas, validation rules, decision models,
 * and findings specifications for the AI Illustration Quality Gate.
 *
 * Invariants:
 * 1. AI Quality != Teacher Decision: Quality status (PASS, NEEDS_REVISION, REJECT, ERROR)
 *    is orthogonal to teacher reviewStatus (pending, reviewed, approved_for_use, rejected).
 * 2. 3-Layer Gate: Layer 1 Deterministic -> Layer 2 AI Vision Semantic -> Layer 3 Post-Guards.
 * 3. Immutable Snapshot Binding: Evaluation strictly targets the approved outline and style
 *    snapshots from GEN-0/VIS-1A, never mutable live Modul Ajar data.
 * 4. Cryptographic Asset Hash Binding: Evaluation is bound to the exact binary SHA-256 hash.
 * 5. Strict Non-Destructive Invariant: NEEDS_REVISION or REJECT never triggers auto-regeneration
 *    or asset deletion.
 * 6. Composite Usability Eligibility: eligibleForUse = validAsset && qualityStatus === 'PASS' && reviewStatus === 'approved_for_use'.
 */

import { z } from "zod";
import { ReviewStatusSchema } from "./illustration-review-contract";

export const CANONICAL_ILLUSTRATION_QUALITY_EVALUATOR_VERSION = "illustration_quality_v1";

// ==============================================================================
// 1. QUALITY DECISION & SEVERITY TAXONOMY
// ==============================================================================

export const QualityDecisionSchema = z.enum([
  "PASS",           // All deterministic checks pass, no critical/major outline or style mismatch, no critical educational/text violations
  "NEEDS_REVISION", // Image is broadly usable, but one or more significant non-critical requirements are missing or weak
  "REJECT",         // Major specification violation, critical educational contradiction, severe style mismatch, or invalid output
  "ERROR",          // Evaluation itself could not be completed reliably (e.g. transient provider error after retries)
]);
export type QualityDecision = z.infer<typeof QualityDecisionSchema>;

export const FindingSeveritySchema = z.enum([
  "critical", // Prevents PASS; causes REJECT or ERROR
  "warning",  // Non-critical defect; causes NEEDS_REVISION if unmitigated
  "info",     // Advisory pedagogical observation; does not degrade PASS
]);
export type FindingSeverity = z.infer<typeof FindingSeveritySchema>;

export const FindingCategorySchema = z.enum([
  "outline",     // Mismatch with approved main subject, supporting elements, environment
  "style",       // Deviation from approved visual style rules or visual language
  "educational", // Inaccurate educational concept, contradiction, unsupported claims
  "composition", // Significant layout/perspective deviation
  "text",        // Violation of text-in-image policy (invented text, forbidden text, missing label)
  "grounding",   // Lack of evidential grounding or conflicting curriculum context
  "technical",   // Binary integrity, MIME, dimension, aspect ratio, storage failure
]);
export type FindingCategory = z.infer<typeof FindingCategorySchema>;

// ==============================================================================
// 2. STRUCTURED FINDING CONTRACT
// ==============================================================================

export const IllustrationQualityFindingSchema = z.object({
  code: z.string().min(1, "Kode temuan wajib ada."),
  severity: FindingSeveritySchema,
  category: FindingCategorySchema,
  description: z.string().min(1, "Deskripsi temuan wajib ada."),
  relatedOutlineField: z.string().optional(),
  evidenceReference: z.string().optional(),
  recommendation: z.string().optional(),
});
export type IllustrationQualityFinding = z.infer<typeof IllustrationQualityFindingSchema>;

// ==============================================================================
// 3. LAYER 1: DETERMINISTIC TECHNICAL CHECKS CONTRACT
// ==============================================================================

export const DeterministicQualityChecksSchema = z.object({
  binaryExists: z.boolean(),
  mimeTypeValid: z.boolean(),
  mimeType: z.string().optional(),
  dimensionsValid: z.boolean(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  aspectRatioValid: z.boolean(),
  aspectRatio: z.string().optional(),
  aspectRatioCalculated: z.number().optional(),
  nonMockValid: z.boolean(),
  byteSize: z.number().int().nonnegative(),
  hashMatches: z.boolean(),
  assetHash: z.string(),
  provenanceComplete: z.boolean(),
  storageAccessible: z.boolean(),
  passed: z.boolean(),
  failureReason: z.string().optional(),
});
export type DeterministicQualityChecks = z.infer<typeof DeterministicQualityChecksSchema>;

// ==============================================================================
// 4. LAYER 2: AI VISION / SEMANTIC CHECKS CONTRACT
// ==============================================================================

export const AlignmentLevelSchema = z.enum(["aligned", "partially_aligned", "misaligned"]);
export type AlignmentLevel = z.infer<typeof AlignmentLevelSchema>;

export const EducationalAccuracyLevelSchema = z.enum(["accurate", "minor_issues", "inaccurate"]);
export type EducationalAccuracyLevel = z.infer<typeof EducationalAccuracyLevelSchema>;

export const SemanticQualityChecksSchema = z.object({
  outlineAlignment: z.object({
    level: AlignmentLevelSchema,
    mainSubjectPresent: z.boolean(),
    supportingElementsPresent: z.boolean(),
    environmentConsistent: z.boolean(),
    compositionConsistent: z.boolean(),
    details: z.string(),
  }),
  styleAlignment: z.object({
    level: AlignmentLevelSchema,
    stylePreserved: z.boolean(),
    visualRulesObserved: z.boolean(),
    details: z.string(),
  }),
  educationalAccuracy: z.object({
    level: EducationalAccuracyLevelSchema,
    contradictionDetected: z.boolean(),
    unsupportedMajorClaims: z.boolean(),
    details: z.string(),
  }),
  compositionAlignment: z.object({
    level: z.enum(["aligned", "deviated"]),
    details: z.string(),
  }),
  textCompliance: z.object({
    level: z.enum(["compliant", "non_compliant"]),
    requiredTextPresent: z.boolean(),
    forbiddenTextDetected: z.boolean(),
    inventedTextDetected: z.boolean(),
    details: z.string(),
  }),
  groundingConcerns: z.array(z.string()).default([]),
});
export type SemanticQualityChecks = z.infer<typeof SemanticQualityChecksSchema>;

export const IllustrationQualitySemanticResultSchema = z.object({
  decision: QualityDecisionSchema,
  semanticChecks: SemanticQualityChecksSchema,
  findings: z.array(IllustrationQualityFindingSchema).default([]),
  evaluatorMetadata: z.record(z.any()).optional(),
});
export type IllustrationQualitySemanticResult = z.infer<typeof IllustrationQualitySemanticResultSchema>;

// ==============================================================================
// 5. CANONICAL ILLUSTRATION QUALITY EVALUATION ENTITY
// ==============================================================================

export const IllustrationQualityEvaluationSchema = z.object({
  id: z.string().min(1, "ID evaluasi wajib ada."),
  assetId: z.string().min(1, "Asset ID wajib ada."),
  generationId: z.string().min(1, "Generation ID wajib ada."),
  generationPlanId: z.string().min(1, "Generation Plan ID wajib ada."),
  moduleId: z.string().min(1, "Module ID wajib ada."),
  assetHash: z.string().length(64, "Hash aset harus berupa 64 hex characters."),
  outlineVersion: z.number().int().min(1),
  styleId: z.string().min(1),
  styleVersion: z.number().int().min(1),
  evaluatorVersion: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  deterministicChecks: DeterministicQualityChecksSchema,
  semanticChecks: SemanticQualityChecksSchema.nullable().optional(),
  decision: QualityDecisionSchema,
  findings: z.array(IllustrationQualityFindingSchema).default([]),
  evaluatedBy: z.string().min(1, "ID evaluator/guru wajib ada."),
  evaluatedAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type IllustrationQualityEvaluation = z.infer<typeof IllustrationQualityEvaluationSchema>;

// ==============================================================================
// 6. COMPOSITE USABILITY ELIGIBILITY SCHEMA
// ==============================================================================

export const IllustrationEligibilitySchema = z.object({
  eligibleForUse: z.boolean(),
  assetId: z.string(),
  moduleId: z.string(),
  reviewStatus: ReviewStatusSchema,
  qualityStatus: QualityDecisionSchema,
  deterministicPassed: z.boolean(),
  reasons: z.array(z.string()),
});
export type IllustrationEligibility = z.infer<typeof IllustrationEligibilitySchema>;

// ==============================================================================
// 7. INPUT SCHEMAS FOR SERVER FUNCTIONS
// ==============================================================================

export const EvaluateIllustrationQualityInputSchema = z.object({
  assetId: z.string().min(1, "Asset ID wajib disertakan."),
  forceReevaluate: z.boolean().optional().default(false),
});
export type EvaluateIllustrationQualityInput = z.infer<typeof EvaluateIllustrationQualityInputSchema>;

export const GetIllustrationQualityEvaluationInputSchema = z.object({
  assetId: z.string().min(1, "Asset ID wajib disertakan."),
});
export type GetIllustrationQualityEvaluationInput = z.infer<typeof GetIllustrationQualityEvaluationInputSchema>;

export const ListIllustrationQualityEvaluationsInputSchema = z.object({
  moduleId: z.string().min(1, "Module ID wajib disertakan."),
});
export type ListIllustrationQualityEvaluationsInput = z.infer<typeof ListIllustrationQualityEvaluationsInputSchema>;

export const CheckIllustrationEligibilityInputSchema = z.object({
  assetId: z.string().min(1, "Asset ID wajib disertakan."),
});
export type CheckIllustrationEligibilityInput = z.infer<typeof CheckIllustrationEligibilityInputSchema>;

// ==============================================================================
// 8. DECISION DERIVATION HELPER
// ==============================================================================

/**
 * Derives the canonical quality decision from deterministic checks and findings.
 * Rules:
 * 1. If deterministic checks failed -> REJECT (or ERROR if storage/technical crash).
 * 2. If any finding has severity 'critical' -> REJECT.
 * 3. If any finding has severity 'warning' -> NEEDS_REVISION.
 * 4. Otherwise -> PASS.
 */
export function deriveQualityDecision(
  deterministicChecks: DeterministicQualityChecks,
  findings: IllustrationQualityFinding[]
): QualityDecision {
  if (!deterministicChecks.passed) {
    if (!deterministicChecks.storageAccessible || !deterministicChecks.binaryExists) {
      return "ERROR";
    }
    return "REJECT";
  }

  const hasCritical = findings.some((f) => f.severity === "critical");
  if (hasCritical) {
    return "REJECT";
  }

  const hasWarning = findings.some((f) => f.severity === "warning");
  if (hasWarning) {
    return "NEEDS_REVISION";
  }

  return "PASS";
}
