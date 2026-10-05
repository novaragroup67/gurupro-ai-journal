/**
 * ==============================================================================
 * GURUPRO AI: PRESENTATION TEACHER REVIEW SERVER FUNCTIONS (PPT-1E)
 * ==============================================================================
 *
 * Implements server-authoritative operations for:
 * 1. getPresentationReviewServerFn
 * 2. startPresentationReviewServerFn
 * 3. approvePresentationServerFn
 * 4. rejectPresentationServerFn
 * 5. updatePresentationReviewNotesServerFn
 * 6. listPresentationReviewsServerFn
 *
 * Enforces:
 * - Strict Teacher Authentication (requireTeacherAiAuth)
 * - Multi-tenant isolation and ownership boundary
 * - Version-bound approval locking (superseding previous approvals upon version bump)
 * - Strict illustration approval gatekeeper (VIS-1D/VIS-1E integration)
 * - Non-destructive rejection semantics (preserves content, requires feedback note)
 * - Zero AI calls / zero automated decisions
 */

import { createServerFn } from "@tanstack/react-start";
import { requireTeacherAiAuth } from "@/integrations/supabase/auth-middleware";
import { AI_ERROR_CODES, AiServiceError, normalizeAiError } from "./ai/error-taxonomy";
import {
  PresentationReview,
  PresentationReviewSchema,
  PresentationReviewStatus,
  StartPresentationReviewInputSchema,
  ApprovePresentationInputSchema,
  RejectPresentationInputSchema,
  UpdatePresentationReviewNotesInputSchema,
  GetPresentationReviewInputSchema,
  ListPresentationReviewsInputSchema,
  assertValidPresentationReviewTransition,
  auditPresentationIllustrations,
} from "./ai/presentation-review-contract";
import {
  fallbackPresentationResults,
  StoredPresentationResultRow,
} from "./presentation-generation.functions";
import {
  resolvePresentationIllustrations,
  ResolvedSlideIllustration,
} from "./ai/presentation-illustration-resolver";
import type { IllustrationStorageDriver } from "./ai/illustration-storage-service";

// ==============================================================================
// 1. DATA STORAGE & ROW INTERFACES
// ==============================================================================

export interface StoredPresentationReviewRow {
  id: string;
  presentation_id: string;
  content_result_id: string;
  generation_plan_id: string;
  module_id: string;
  approved_version: number;
  review_status: PresentationReviewStatus;
  teacher_notes?: string | null;
  validation_summary: Record<string, any>;
  reviewed_by: string;
  reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
}

// In-memory fallback repository for unit tests and offline resilience
export const fallbackPresentationReviews = new Map<string, StoredPresentationReviewRow>();

function toReview(row: StoredPresentationReviewRow): PresentationReview {
  return {
    id: row.id,
    presentationId: row.presentation_id,
    contentResultId: row.content_result_id,
    generationPlanId: row.generation_plan_id,
    moduleId: row.module_id,
    approvedVersion: row.approved_version,
    reviewStatus: row.review_status,
    teacherNotes: row.teacher_notes || null,
    validationSummary: row.validation_summary || {},
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Helper to resolve Presentation Result row from DB or fallback
async function resolveResultRow(
  contentResultId: string,
  supabase?: any
): Promise<StoredPresentationResultRow | null> {
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from("presentation_generation_results")
        .select("*")
        .eq("id", contentResultId)
        .maybeSingle();

      if (!error && data) return data;
    }
  } catch {}
  return fallbackPresentationResults.get(contentResultId) || null;
}

// Helper to resolve Review Row by contentResultId
async function resolveReviewRowByContentResult(
  contentResultId: string,
  supabase?: any
): Promise<StoredPresentationReviewRow | null> {
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from("presentation_reviews")
        .select("*")
        .eq("content_result_id", contentResultId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) return data;
    }
  } catch {}

  for (const row of fallbackPresentationReviews.values()) {
    if (row.content_result_id === contentResultId) {
      return row;
    }
  }
  return null;
}

// ==============================================================================
// 2. CORE EXECUTION LOGIC (TESTABLE & RUNTIME)
// ==============================================================================

/**
 * Executes Get Presentation Review
 */
export async function executeGetPresentationReview(
  data: { contentResultId: string },
  context: { userId: string; profile?: { role?: string } },
  supabase?: any
): Promise<{ status: "success"; review: PresentationReview | null }> {
  if (context.profile?.role === "siswa") {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Peran siswa tidak memiliki akses ke peninjauan presentasi guru."
    );
  }

  const resultRow = await resolveResultRow(data.contentResultId, supabase);
  if (!resultRow) {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      `Konten presentasi ID '${data.contentResultId}' tidak ditemukan.`
    );
  }

  if (context.profile?.role !== "admin" && resultRow.owner_id !== context.userId) {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Anda bukan pemilik presentasi ini."
    );
  }

  const reviewRow = await resolveReviewRowByContentResult(data.contentResultId, supabase);
  return {
    status: "success",
    review: reviewRow ? toReview(reviewRow) : null,
  };
}

/**
 * Executes Start Presentation Review (Transitions to 'in_review')
 */
export async function executeStartPresentationReview(
  data: { contentResultId: string },
  context: { userId: string; profile?: { role?: string } },
  supabase?: any
): Promise<{ status: "success"; review: PresentationReview }> {
  if (context.profile?.role === "siswa") {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Peran siswa tidak diizinkan meninjau presentasi."
    );
  }

  const resultRow = await resolveResultRow(data.contentResultId, supabase);
  if (!resultRow) {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      `Konten presentasi ID '${data.contentResultId}' tidak ditemukan.`
    );
  }

  if (context.profile?.role !== "admin" && resultRow.owner_id !== context.userId) {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Anda tidak memiliki akses ke presentasi guru lain."
    );
  }

  const existing = await resolveReviewRowByContentResult(data.contentResultId, supabase);
  const nowIso = new Date().toISOString();

  if (existing) {
    if (existing.review_status !== "in_review" && existing.review_status !== "approved") {
      assertValidPresentationReviewTransition(existing.review_status, "in_review");
      existing.review_status = "in_review";
      existing.updated_at = nowIso;

      if (supabase) {
        await supabase
          .from("presentation_reviews")
          .update({
            review_status: "in_review",
            updated_at: nowIso,
          })
          .eq("id", existing.id);
      }
      fallbackPresentationReviews.set(existing.id, existing);
    }
    return { status: "success", review: toReview(existing) };
  }

  // Create initial review record in 'in_review' status
  const reviewId = `prev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const newRow: StoredPresentationReviewRow = {
    id: reviewId,
    presentation_id: resultRow.content_package.presentationId || resultRow.id,
    content_result_id: resultRow.id,
    generation_plan_id: resultRow.generation_plan_id,
    module_id: resultRow.module_id,
    approved_version: resultRow.approved_version,
    review_status: "in_review",
    teacher_notes: null,
    validation_summary: {
      slideCount: resultRow.content_package.slides.length,
      semanticDecision: resultRow.semantic_decision,
    },
    reviewed_by: context.userId,
    reviewed_at: null,
    created_at: nowIso,
    updated_at: nowIso,
  };

  try {
    if (supabase) {
      await supabase.from("presentation_reviews").insert(newRow);
    }
  } catch {}
  fallbackPresentationReviews.set(newRow.id, newRow);

  return { status: "success", review: toReview(newRow) };
}

/**
 * Executes Approve Presentation (Hard Teacher Approval Gate)
 */
export async function executeApprovePresentation(
  data: {
    contentResultId: string;
    teacherNotes?: string | null;
    expectedVersion?: number;
  },
  context: { userId: string; profile?: { role?: string } },
  supabase?: any,
  illustrationStorage?: IllustrationStorageDriver
): Promise<{ status: "success"; review: PresentationReview }> {
  if (context.profile?.role === "siswa") {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Peran siswa dilarang menyetujui presentasi guru."
    );
  }

  const resultRow = await resolveResultRow(data.contentResultId, supabase);
  if (!resultRow) {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      `Konten presentasi ID '${data.contentResultId}' tidak ditemukan.`
    );
  }

  if (context.profile?.role !== "admin" && resultRow.owner_id !== context.userId) {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Anda tidak dapat menyetujui presentasi milik guru lain."
    );
  }

  // 1. Version Integrity Check
  if (
    typeof data.expectedVersion === "number" &&
    data.expectedVersion !== resultRow.approved_version
  ) {
    throw new AiServiceError(
      AI_ERROR_CODES.PRESENTATION_REVIEW_VERSION_MISMATCH,
      `Versi presentasi yang akan disetujui (${data.expectedVersion}) tidak sesuai dengan versi aktif (${resultRow.approved_version}).`
    );
  }

  // 2. Illustration Invariant Check: All referenced illustrations MUST be approved_for_use
  let resolvedIllustrations: Map<string, ResolvedSlideIllustration> | undefined = undefined;
  const slidesWithIll = resultRow.content_package.slides.filter(
    (s) => s.illustrationReference?.assetId
  );

  if (slidesWithIll.length > 0) {
    try {
      resolvedIllustrations = await resolvePresentationIllustrations(
        resultRow.content_package,
        { userId: context.userId, profile: context.profile, supabase },
        illustrationStorage
      );
    } catch (illErr: any) {
      throw new AiServiceError(
        AI_ERROR_CODES.PRESENTATION_APPROVAL_BLOCKED,
        `Persetujuan presentasi diblokir: Terdapat ilustrasi pada slide yang belum disetujui guru atau gagal diverifikasi (${illErr.message}).`,
        { originalCode: illErr.code, details: illErr.details }
      );
    }

    const audit = auditPresentationIllustrations(
      resultRow.content_package,
      resolvedIllustrations
    );

    if (!audit.valid) {
      throw new AiServiceError(
        AI_ERROR_CODES.PRESENTATION_APPROVAL_BLOCKED,
        `Persetujuan presentasi diblokir: Sebanyak ${audit.unapprovedCount} ilustrasi belum disetujui oleh guru.`,
        { auditItems: audit.items }
      );
    }
  }

  // 3. Mark previous reviews for this plan/module as superseded if from earlier versions
  const nowIso = new Date().toISOString();
  if (supabase) {
    try {
      await supabase
        .from("presentation_reviews")
        .update({ review_status: "superseded", updated_at: nowIso })
        .eq("generation_plan_id", resultRow.generation_plan_id)
        .neq("content_result_id", resultRow.id)
        .eq("review_status", "approved");
    } catch {}
  }
  for (const r of fallbackPresentationReviews.values()) {
    if (
      r.generation_plan_id === resultRow.generation_plan_id &&
      r.content_result_id !== resultRow.id &&
      r.review_status === "approved"
    ) {
      r.review_status = "superseded";
      r.updated_at = nowIso;
    }
  }

  // 4. Update or Create current review row with 'approved'
  let reviewRow = await resolveReviewRowByContentResult(data.contentResultId, supabase);
  if (reviewRow) {
    assertValidPresentationReviewTransition(reviewRow.review_status, "approved");
    reviewRow.review_status = "approved";
    reviewRow.teacher_notes = data.teacherNotes || reviewRow.teacher_notes || null;
    reviewRow.reviewed_by = context.userId;
    reviewRow.reviewed_at = nowIso;
    reviewRow.updated_at = nowIso;

    if (supabase) {
      await supabase
        .from("presentation_reviews")
        .update({
          review_status: "approved",
          teacher_notes: reviewRow.teacher_notes,
          reviewed_by: context.userId,
          reviewed_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", reviewRow.id);
    }
    fallbackPresentationReviews.set(reviewRow.id, reviewRow);
  } else {
    const reviewId = `prev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    reviewRow = {
      id: reviewId,
      presentation_id: resultRow.content_package.presentationId || resultRow.id,
      content_result_id: resultRow.id,
      generation_plan_id: resultRow.generation_plan_id,
      module_id: resultRow.module_id,
      approved_version: resultRow.approved_version,
      review_status: "approved",
      teacher_notes: data.teacherNotes || null,
      validation_summary: {
        slideCount: resultRow.content_package.slides.length,
        embeddedIllustrationCount: resolvedIllustrations?.size ?? 0,
      },
      reviewed_by: context.userId,
      reviewed_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    };

    if (supabase) {
      try {
        await supabase.from("presentation_reviews").insert(reviewRow);
      } catch {}
    }
    fallbackPresentationReviews.set(reviewRow.id, reviewRow);
  }

  return { status: "success", review: toReview(reviewRow) };
}

/**
 * Executes Reject Presentation (Requires teacher feedback notes)
 */
export async function executeRejectPresentation(
  data: {
    contentResultId: string;
    teacherNotes: string;
    expectedVersion?: number;
  },
  context: { userId: string; profile?: { role?: string } },
  supabase?: any
): Promise<{ status: "success"; review: PresentationReview }> {
  if (context.profile?.role === "siswa") {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Peran siswa dilarang menolak presentasi guru."
    );
  }

  if (!data.teacherNotes || !data.teacherNotes.trim()) {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      "Catatan alasan penolakan wajib disertakan untuk memandu perbaikan materi presentasi."
    );
  }

  const resultRow = await resolveResultRow(data.contentResultId, supabase);
  if (!resultRow) {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      `Konten presentasi ID '${data.contentResultId}' tidak ditemukan.`
    );
  }

  if (context.profile?.role !== "admin" && resultRow.owner_id !== context.userId) {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Anda tidak dapat menolak presentasi milik guru lain."
    );
  }

  const nowIso = new Date().toISOString();
  let reviewRow = await resolveReviewRowByContentResult(data.contentResultId, supabase);

  if (reviewRow) {
    assertValidPresentationReviewTransition(reviewRow.review_status, "rejected");
    reviewRow.review_status = "rejected";
    reviewRow.teacher_notes = data.teacherNotes.trim();
    reviewRow.reviewed_by = context.userId;
    reviewRow.reviewed_at = nowIso;
    reviewRow.updated_at = nowIso;

    if (supabase) {
      await supabase
        .from("presentation_reviews")
        .update({
          review_status: "rejected",
          teacher_notes: reviewRow.teacher_notes,
          reviewed_by: context.userId,
          reviewed_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", reviewRow.id);
    }
    fallbackPresentationReviews.set(reviewRow.id, reviewRow);
  } else {
    const reviewId = `prev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    reviewRow = {
      id: reviewId,
      presentation_id: resultRow.content_package.presentationId || resultRow.id,
      content_result_id: resultRow.id,
      generation_plan_id: resultRow.generation_plan_id,
      module_id: resultRow.module_id,
      approved_version: resultRow.approved_version,
      review_status: "rejected",
      teacher_notes: data.teacherNotes.trim(),
      validation_summary: {
        slideCount: resultRow.content_package.slides.length,
      },
      reviewed_by: context.userId,
      reviewed_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    };

    if (supabase) {
      try {
        await supabase.from("presentation_reviews").insert(reviewRow);
      } catch {}
    }
    fallbackPresentationReviews.set(reviewRow.id, reviewRow);
  }

  return { status: "success", review: toReview(reviewRow) };
}

/**
 * Executes Update Presentation Review Notes (Draft notes during review)
 */
export async function executeUpdatePresentationReviewNotes(
  data: { contentResultId: string; teacherNotes?: string | null },
  context: { userId: string; profile?: { role?: string } },
  supabase?: any
): Promise<{ status: "success"; review: PresentationReview }> {
  if (context.profile?.role === "siswa") {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Peran siswa dilarang mengubah catatan review guru."
    );
  }

  const resultRow = await resolveResultRow(data.contentResultId, supabase);
  if (!resultRow) {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      `Konten presentasi ID '${data.contentResultId}' tidak ditemukan.`
    );
  }

  if (context.profile?.role !== "admin" && resultRow.owner_id !== context.userId) {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Anda bukan pemilik presentasi ini."
    );
  }

  const nowIso = new Date().toISOString();
  let reviewRow = await resolveReviewRowByContentResult(data.contentResultId, supabase);

  if (!reviewRow) {
    const reviewId = `prev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    reviewRow = {
      id: reviewId,
      presentation_id: resultRow.content_package.presentationId || resultRow.id,
      content_result_id: resultRow.id,
      generation_plan_id: resultRow.generation_plan_id,
      module_id: resultRow.module_id,
      approved_version: resultRow.approved_version,
      review_status: "in_review",
      teacher_notes: data.teacherNotes || null,
      validation_summary: {},
      reviewed_by: context.userId,
      reviewed_at: null,
      created_at: nowIso,
      updated_at: nowIso,
    };
    if (supabase) {
      try {
        await supabase.from("presentation_reviews").insert(reviewRow);
      } catch {}
    }
  } else {
    reviewRow.teacher_notes = data.teacherNotes || null;
    reviewRow.updated_at = nowIso;
    if (supabase) {
      await supabase
        .from("presentation_reviews")
        .update({ teacher_notes: reviewRow.teacher_notes, updated_at: nowIso })
        .eq("id", reviewRow.id);
    }
  }

  fallbackPresentationReviews.set(reviewRow.id, reviewRow);
  return { status: "success", review: toReview(reviewRow) };
}

/**
 * Executes List Presentation Reviews (Per-module and tenant isolation)
 */
export async function executeListPresentationReviews(
  data: { moduleId: string; generationPlanId?: string },
  context: { userId: string; profile?: { role?: string } },
  supabase?: any
): Promise<{ status: "success"; reviews: PresentationReview[] }> {
  if (context.profile?.role === "siswa") {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Peran siswa tidak memiliki akses ke riwayat peninjauan guru."
    );
  }

  const reviews: PresentationReview[] = [];

  try {
    if (supabase) {
      let query = supabase
        .from("presentation_reviews")
        .select("*")
        .eq("module_id", data.moduleId);

      if (context.profile?.role !== "admin") {
        query = query.eq("reviewed_by", context.userId);
      }
      if (data.generationPlanId) {
        query = query.eq("generation_plan_id", data.generationPlanId);
      }

      const { data: rows, error } = await query.order("created_at", { ascending: false });
      if (!error && Array.isArray(rows)) {
        return { status: "success", reviews: rows.map(toReview) };
      }
    }
  } catch {}

  for (const row of fallbackPresentationReviews.values()) {
    if (
      row.module_id === data.moduleId &&
      (context.profile?.role === "admin" || row.reviewed_by === context.userId) &&
      (!data.generationPlanId || row.generation_plan_id === data.generationPlanId)
    ) {
      reviews.push(toReview(row));
    }
  }

  reviews.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { status: "success", reviews };
}

// ==============================================================================
// 3. TANSTACK START SERVER FUNCTIONS
// ==============================================================================

export const getPresentationReviewServerFn = createServerFn({ method: "POST" })
  .middleware([requireTeacherAiAuth])
  .validator((input: unknown) => {
    const parsed = GetPresentationReviewInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        "Parameter getPresentationReview tidak valid."
      );
    }
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    try {
      return await executeGetPresentationReview(
        data,
        { userId: (context as any).userId, profile: (context as any).profile },
        (context as any).supabase
      );
    } catch (err) {
      throw normalizeAiError(err);
    }
  });

export const startPresentationReviewServerFn = createServerFn({ method: "POST" })
  .middleware([requireTeacherAiAuth])
  .validator((input: unknown) => {
    const parsed = StartPresentationReviewInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        "Parameter startPresentationReview tidak valid."
      );
    }
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    try {
      return await executeStartPresentationReview(
        data,
        { userId: (context as any).userId, profile: (context as any).profile },
        (context as any).supabase
      );
    } catch (err) {
      throw normalizeAiError(err);
    }
  });

export const approvePresentationServerFn = createServerFn({ method: "POST" })
  .middleware([requireTeacherAiAuth])
  .validator((input: unknown) => {
    const parsed = ApprovePresentationInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        "Parameter approvePresentation tidak valid."
      );
    }
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    try {
      return await executeApprovePresentation(
        data,
        { userId: (context as any).userId, profile: (context as any).profile },
        (context as any).supabase
      );
    } catch (err) {
      throw normalizeAiError(err);
    }
  });

export const rejectPresentationServerFn = createServerFn({ method: "POST" })
  .middleware([requireTeacherAiAuth])
  .validator((input: unknown) => {
    const parsed = RejectPresentationInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        "Parameter rejectPresentation tidak valid."
      );
    }
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    try {
      return await executeRejectPresentation(
        data,
        { userId: (context as any).userId, profile: (context as any).profile },
        (context as any).supabase
      );
    } catch (err) {
      throw normalizeAiError(err);
    }
  });

export const updatePresentationReviewNotesServerFn = createServerFn({ method: "POST" })
  .middleware([requireTeacherAiAuth])
  .validator((input: unknown) => {
    const parsed = UpdatePresentationReviewNotesInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        "Parameter updatePresentationReviewNotes tidak valid."
      );
    }
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    try {
      return await executeUpdatePresentationReviewNotes(
        data,
        { userId: (context as any).userId, profile: (context as any).profile },
        (context as any).supabase
      );
    } catch (err) {
      throw normalizeAiError(err);
    }
  });

export const listPresentationReviewsServerFn = createServerFn({ method: "POST" })
  .middleware([requireTeacherAiAuth])
  .validator((input: unknown) => {
    const parsed = ListPresentationReviewsInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        "Parameter listPresentationReviews tidak valid."
      );
    }
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    try {
      return await executeListPresentationReviews(
        data,
        { userId: (context as any).userId, profile: (context as any).profile },
        (context as any).supabase
      );
    } catch (err) {
      throw normalizeAiError(err);
    }
  });
