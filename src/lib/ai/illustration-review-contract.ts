/**
 * ==============================================================================
 * GURUPRO AI: ILLUSTRATION TEACHER REVIEW CONTRACT (VIS-1D)
 * ==============================================================================
 *
 * Defines canonical data contracts, Zod schemas, state transition matrices,
 * and input specifications for teacher-driven review and decision workflows.
 *
 * Invariants:
 * 1. Semantic Separation: reviewStatus (pending, reviewed, approved_for_use, rejected)
 *    is STRICTLY distinct from asset lifecycleStatus (staged, attached, superseded, archived).
 * 2. Immutable Specification Comparison: Review always evaluates generated outputs
 *    against the exact approved outline snapshot and style version.
 * 3. Non-Destructive Decision: Reject or supersede never deletes historical records.
 * 4. Human-Only Review: Review notes are teacher-authored metadata and never invoke AI.
 * 5. Multi-Tenant RBAC: Only owning teacher can review assets.
 */

import { z } from "zod";
import { AI_ERROR_CODES, AiServiceError } from "./error-taxonomy";
import { type IllustrationAsset } from "./illustration-asset-contract";

// ==============================================================================
// 1. REVIEW STATUS & TEACHER DECISION DOMAIN
// ==============================================================================

export const ReviewStatusSchema = z.enum([
  "pending",          // Newly generated / persisted asset awaiting teacher review
  "reviewed",         // Teacher has inspected the asset, decision in progress or kept for later
  "approved_for_use", // Teacher explicitly approved the asset for pedagogical usage
  "rejected",         // Teacher rejected the asset (preserved for history / audit)
]);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

export const TeacherDecisionSchema = z.enum([
  "use",              // Mark as primary candidate to attach or replace on section
  "archive",          // Transition to archived state
  "regenerate",       // Teacher intends to generate an alternative (non-automatic)
  "keep_for_later",   // Keep available in staged inventory without immediate action
]);
export type TeacherDecision = z.infer<typeof TeacherDecisionSchema>;

// ==============================================================================
// 2. CANONICAL ILLUSTRATION REVIEW ENTITY
// ==============================================================================

export const IllustrationReviewSchema = z.object({
  id: z.string().min(1, "ID review wajib ada."),
  assetId: z.string().min(1, "Asset ID wajib ada."),
  generationId: z.string().min(1, "Generation ID wajib ada."),
  generationPlanId: z.string().min(1, "Generation Plan ID wajib ada."),
  moduleId: z.string().min(1, "Module ID wajib ada."),
  outlineVersion: z.number().int().min(1),
  styleId: z.string().min(1),
  styleVersion: z.number().int().min(1),
  reviewStatus: ReviewStatusSchema,
  teacherDecision: TeacherDecisionSchema.nullable().optional(),
  teacherNotes: z.string().max(2000, "Catatan guru maksimal 2000 karakter.").nullable().optional(),
  reviewedBy: z.string().min(1, "ID guru peninjau wajib ada."),
  reviewedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type IllustrationReview = z.infer<typeof IllustrationReviewSchema>;

// ==============================================================================
// 3. IMMUTABLE SPECIFICATION SNAPSHOT TYPES
// ==============================================================================

export interface ApprovedOutlineSnapshot {
  version: number;
  title: string;
  objective: string;
  mainSubject: string;
  supportingElements: string[];
  environment: string;
  composition: string;
  visualDetails: string;
  educationalFocus: string;
  textRequirements?: string[];
  thingsToAvoid?: string[];
}

export interface ApprovedStyleSnapshot {
  id: string;
  name: string;
  version: number;
  description: string;
  visualRules: string[];
}

export interface ReviewableIllustrationAsset {
  asset: IllustrationAsset;
  review: IllustrationReview;
  approvedOutline: ApprovedOutlineSnapshot;
  approvedStyle: ApprovedStyleSnapshot;
}

// ==============================================================================
// 4. REVIEW STATE MACHINE & TRANSITIONS
// ==============================================================================

const ALLOWED_REVIEW_TRANSITIONS: Record<ReviewStatus, ReviewStatus[]> = {
  pending: ["reviewed", "approved_for_use", "rejected"],
  reviewed: ["approved_for_use", "rejected", "pending"],
  approved_for_use: ["reviewed", "rejected"],
  rejected: ["reviewed", "approved_for_use"],
};

export function validateReviewTransition(
  currentStatus: ReviewStatus,
  targetStatus: ReviewStatus
): boolean {
  if (currentStatus === targetStatus) return true;
  const allowed = ALLOWED_REVIEW_TRANSITIONS[currentStatus] || [];
  return allowed.includes(targetStatus);
}

export function assertValidReviewTransition(
  currentStatus: ReviewStatus,
  targetStatus: ReviewStatus
): void {
  if (!validateReviewTransition(currentStatus, targetStatus)) {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      `Transisi status review dari '${currentStatus}' ke '${targetStatus}' tidak diizinkan.`
    );
  }
}

// ==============================================================================
// 5. SERVER FUNCTION INPUT SCHEMAS
// ==============================================================================

export const SaveIllustrationReviewInputSchema = z.object({
  assetId: z.string().min(1, "ID asset wajib diisi."),
  reviewStatus: ReviewStatusSchema,
  teacherDecision: TeacherDecisionSchema.nullable().optional(),
  teacherNotes: z.string().max(2000, "Catatan guru maksimal 2000 karakter.").nullable().optional(),
  expectedUpdatedAt: z.string().optional(),
});
export type SaveIllustrationReviewInput = z.infer<typeof SaveIllustrationReviewInputSchema>;

export const ApproveIllustrationForUseInputSchema = z.object({
  assetId: z.string().min(1, "ID asset wajib diisi."),
  teacherNotes: z.string().max(2000).nullable().optional(),
  expectedUpdatedAt: z.string().optional(),
});
export type ApproveIllustrationForUseInput = z.infer<typeof ApproveIllustrationForUseInputSchema>;

export const RejectIllustrationInputSchema = z.object({
  assetId: z.string().min(1, "ID asset wajib diisi."),
  teacherNotes: z.string().max(2000).nullable().optional(),
  teacherDecision: z.enum(["regenerate", "archive", "keep_for_later"]).optional(),
  expectedUpdatedAt: z.string().optional(),
});
export type RejectIllustrationInput = z.infer<typeof RejectIllustrationInputSchema>;

export const GetIllustrationReviewInputSchema = z.object({
  assetId: z.string().min(1, "ID asset wajib diisi."),
});
export type GetIllustrationReviewInput = z.infer<typeof GetIllustrationReviewInputSchema>;

export const ListReviewableIllustrationsInputSchema = z.object({
  moduleId: z.string().min(1, "ID modul ajar wajib diisi."),
  generationPlanId: z.string().optional(),
});
export type ListReviewableIllustrationsInput = z.infer<typeof ListReviewableIllustrationsInputSchema>;
