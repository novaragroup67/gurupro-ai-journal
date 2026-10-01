/**
 * ==============================================================================
 * GURUPRO AI: ILLUSTRATION TEACHER REVIEW SERVER FUNCTIONS (VIS-1D)
 * ==============================================================================
 *
 * Implements server-authoritative endpoints for teacher-driven review,
 * evaluation against immutable approved outline specifications, optimistic
 * concurrency protection, and lifecycle decision recording.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireTeacherAiAuth } from "@/integrations/supabase/auth-middleware";
import { AI_ERROR_CODES, AiServiceError } from "./ai/error-taxonomy";
import {
  type IllustrationReview,
  type ReviewStatus,
  type TeacherDecision,
  type ReviewableIllustrationAsset,
  type ApprovedOutlineSnapshot,
  type ApprovedStyleSnapshot,
  SaveIllustrationReviewInputSchema,
  ApproveIllustrationForUseInputSchema,
  RejectIllustrationInputSchema,
  GetIllustrationReviewInputSchema,
  ListReviewableIllustrationsInputSchema,
  assertValidReviewTransition,
} from "./ai/illustration-review-contract";
import {
  fallbackIllustrationAssets,
  type StoredIllustrationAssetRow,
} from "./illustration-asset.functions";
import {
  fallbackIllustrationRequests,
  fallbackIllustrationGenerations,
} from "./illustration-generation.functions";
import { ILLUSTRATION_STYLES_CATALOG } from "./ai/generation-planning-contract";

// ==============================================================================
// 1. DATA STORAGE & ROW INTERFACES
// ==============================================================================

export interface StoredIllustrationReviewRow {
  id: string;
  asset_id: string;
  generation_id: string;
  generation_plan_id: string;
  module_id: string;
  outline_version: number;
  style_id: string;
  style_version: number;
  review_status: ReviewStatus;
  teacher_decision?: TeacherDecision | null;
  teacher_notes?: string | null;
  reviewed_by: string;
  reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export const fallbackIllustrationReviews = new Map<string, StoredIllustrationReviewRow>();

function toReview(row: StoredIllustrationReviewRow): IllustrationReview {
  return {
    id: row.id,
    assetId: row.asset_id,
    generationId: row.generation_id,
    generationPlanId: row.generation_plan_id,
    moduleId: row.module_id,
    outlineVersion: row.outline_version,
    styleId: row.style_id,
    styleVersion: row.style_version,
    reviewStatus: row.review_status,
    teacherDecision: row.teacher_decision || null,
    teacherNotes: row.teacher_notes || null,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function resolveAssetRow(
  assetId: string,
  supabase?: any
): Promise<StoredIllustrationAssetRow | null> {
  try {
    if (supabase) {
      const { data: dbAsset } = await supabase
        .from("illustration_assets")
        .select("*")
        .eq("id", assetId)
        .maybeSingle();
      if (dbAsset) return dbAsset;
    }
  } catch {}
  return fallbackIllustrationAssets.get(assetId) || null;
}

async function resolveReviewRow(
  assetId: string,
  supabase?: any
): Promise<StoredIllustrationReviewRow | null> {
  try {
    if (supabase) {
      const { data: dbRev } = await supabase
        .from("illustration_reviews")
        .select("*")
        .eq("asset_id", assetId)
        .maybeSingle();
      if (dbRev) return dbRev;
    }
  } catch {}
  return fallbackIllustrationReviews.get(assetId) || null;
}

// ==============================================================================
// 2. GET ILLUSTRATION REVIEW
// ==============================================================================

export async function executeGetIllustrationReview(
  data: { assetId: string },
  context: { userId: string; profile?: any; supabase?: any }
): Promise<{ status: "success"; review: IllustrationReview }> {
  const userId = context.userId;

  // 1. Authoritative Role Guard
  if (context.profile?.role && context.profile.role !== "guru") {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Hanya pengguna dengan peran Guru yang dapat mengakses ulasan ilustrasi."
    );
  }

  // 2. Fetch Asset & Ownership Guard
  const assetRow = await resolveAssetRow(data.assetId, context.supabase);
  if (!assetRow) {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      "Aset ilustrasi tidak ditemukan."
    );
  }

  if (assetRow.owner_id !== userId) {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Anda bukan pemilik aset ilustrasi ini."
    );
  }

  // 3. Fetch or Initialize Review
  let revRow = await resolveReviewRow(data.assetId, context.supabase);
  if (!revRow) {
    const now = new Date().toISOString();
    revRow = {
      id: `rev_${data.assetId}`,
      asset_id: assetRow.id,
      generation_id: assetRow.generation_id,
      generation_plan_id: assetRow.generation_plan_id,
      module_id: assetRow.module_id,
      outline_version: assetRow.style_version || 1,
      style_id: assetRow.style_id,
      style_version: assetRow.style_version,
      review_status: "pending",
      teacher_decision: null,
      teacher_notes: null,
      reviewed_by: userId,
      reviewed_at: null,
      created_at: now,
      updated_at: now,
    };
    fallbackIllustrationReviews.set(data.assetId, revRow);
    try {
      if (context.supabase) {
        await context.supabase.from("illustration_reviews").insert(revRow);
      }
    } catch {}
  }

  return { status: "success", review: toReview(revRow) };
}

export const getIllustrationReviewServerFn = createServerFn({
  method: "GET",
})
  .middleware([requireTeacherAiAuth])
  .validator((input: unknown) => {
    const parsed = GetIllustrationReviewInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        "Parameter permintaan ulasan ilustrasi tidak valid."
      );
    }
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    return executeGetIllustrationReview(data, context as any);
  });

// ==============================================================================
// 3. SAVE ILLUSTRATION REVIEW (WITH CONCURRENCY PROTECTION)
// ==============================================================================

export async function executeSaveIllustrationReview(
  data: {
    assetId: string;
    reviewStatus: ReviewStatus;
    teacherDecision?: TeacherDecision | null;
    teacherNotes?: string | null;
    expectedUpdatedAt?: string;
  },
  context: { userId: string; profile?: any; supabase?: any }
): Promise<{ status: "success"; review: IllustrationReview }> {
  const userId = context.userId;

  // 1. Authoritative Role Guard
  if (context.profile?.role && context.profile.role !== "guru") {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Hanya pengguna dengan peran Guru yang dapat menyimpan ulasan ilustrasi."
    );
  }

  // 2. Fetch Asset & Ownership Guard
  const assetRow = await resolveAssetRow(data.assetId, context.supabase);
  if (!assetRow) {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      "Aset ilustrasi tidak ditemukan."
    );
  }

  if (assetRow.owner_id !== userId) {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Anda bukan pemilik aset ilustrasi ini."
    );
  }

  if (assetRow.lifecycle_status === "soft_deleted") {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      "Aset yang telah dihapus tidak dapat ditinjau."
    );
  }

  // 3. Fetch Existing Review & Concurrency Guard
  let revRow = await resolveReviewRow(data.assetId, context.supabase);
  const now = new Date().toISOString();

  if (revRow) {
    // Optimistic Concurrency Check
    if (data.expectedUpdatedAt && revRow.updated_at !== data.expectedUpdatedAt) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        "Konflik pembaruan: Ulasan telah diubah di sesi lain. Silakan muat ulang ulasan terbaru."
      );
    }

    // State Transition Validation
    assertValidReviewTransition(revRow.review_status, data.reviewStatus);

    revRow.review_status = data.reviewStatus;
    revRow.teacher_decision = data.teacherDecision !== undefined ? data.teacherDecision : revRow.teacher_decision;
    revRow.teacher_notes = data.teacherNotes !== undefined ? data.teacherNotes : revRow.teacher_notes;
    revRow.reviewed_by = userId;
    revRow.reviewed_at = now;
    revRow.updated_at = now;
  } else {
    // Fresh Review Record
    revRow = {
      id: `rev_${data.assetId}`,
      asset_id: assetRow.id,
      generation_id: assetRow.generation_id,
      generation_plan_id: assetRow.generation_plan_id,
      module_id: assetRow.module_id,
      outline_version: assetRow.style_version || 1,
      style_id: assetRow.style_id,
      style_version: assetRow.style_version,
      review_status: data.reviewStatus,
      teacher_decision: data.teacherDecision || null,
      teacher_notes: data.teacherNotes || null,
      reviewed_by: userId,
      reviewed_at: now,
      created_at: now,
      updated_at: now,
    };
  }

  // Persist locally in memory
  fallbackIllustrationReviews.set(data.assetId, revRow);

  // Persist to Supabase if active
  try {
    if (context.supabase) {
      await context.supabase.from("illustration_reviews").upsert({
        id: revRow.id,
        asset_id: revRow.asset_id,
        generation_id: revRow.generation_id,
        generation_plan_id: revRow.generation_plan_id,
        module_id: revRow.module_id,
        outline_version: revRow.outline_version,
        style_id: revRow.style_id,
        style_version: revRow.style_version,
        review_status: revRow.review_status,
        teacher_decision: revRow.teacher_decision,
        teacher_notes: revRow.teacher_notes,
        reviewed_by: revRow.reviewed_by,
        reviewed_at: revRow.reviewed_at,
        created_at: revRow.created_at,
        updated_at: revRow.updated_at,
      });
    }
  } catch {}

  return { status: "success", review: toReview(revRow) };
}

export const saveIllustrationReviewServerFn = createServerFn({
  method: "POST",
})
  .middleware([requireTeacherAiAuth])
  .validator((input: unknown) => {
    const parsed = SaveIllustrationReviewInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        "Parameter simpan ulasan tidak valid."
      );
    }
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    return executeSaveIllustrationReview(data, context as any);
  });

// ==============================================================================
// 4. APPROVE ILLUSTRATION FOR USE
// ==============================================================================

export async function executeApproveIllustrationForUse(
  data: { assetId: string; teacherNotes?: string | null; expectedUpdatedAt?: string },
  context: { userId: string; profile?: any; supabase?: any }
): Promise<{ status: "success"; review: IllustrationReview }> {
  return executeSaveIllustrationReview(
    {
      assetId: data.assetId,
      reviewStatus: "approved_for_use",
      teacherDecision: "use",
      teacherNotes: data.teacherNotes,
      expectedUpdatedAt: data.expectedUpdatedAt,
    },
    context
  );
}

export const approveIllustrationForUseServerFn = createServerFn({
  method: "POST",
})
  .middleware([requireTeacherAiAuth])
  .validator((input: unknown) => {
    const parsed = ApproveIllustrationForUseInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        "Parameter persetujuan ilustrasi tidak valid."
      );
    }
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    return executeApproveIllustrationForUse(data, context as any);
  });

// ==============================================================================
// 5. REJECT ILLUSTRATION (NON-DESTRUCTIVE)
// ==============================================================================

export async function executeRejectIllustration(
  data: {
    assetId: string;
    teacherNotes?: string | null;
    teacherDecision?: "regenerate" | "archive" | "keep_for_later";
    expectedUpdatedAt?: string;
  },
  context: { userId: string; profile?: any; supabase?: any }
): Promise<{ status: "success"; review: IllustrationReview }> {
  return executeSaveIllustrationReview(
    {
      assetId: data.assetId,
      reviewStatus: "rejected",
      teacherDecision: data.teacherDecision || "regenerate",
      teacherNotes: data.teacherNotes,
      expectedUpdatedAt: data.expectedUpdatedAt,
    },
    context
  );
}

export const rejectIllustrationServerFn = createServerFn({
  method: "POST",
})
  .middleware([requireTeacherAiAuth])
  .validator((input: unknown) => {
    const parsed = RejectIllustrationInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        "Parameter penolakan ilustrasi tidak valid."
      );
    }
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    return executeRejectIllustration(data, context as any);
  });

// ==============================================================================
// 6. LIST REVIEWABLE ILLUSTRATIONS WITH SPECIFICATION SNAPSHOTS
// ==============================================================================

export async function executeListReviewableIllustrations(
  data: { moduleId: string; generationPlanId?: string },
  context: { userId: string; profile?: any; supabase?: any }
): Promise<{ status: "success"; items: ReviewableIllustrationAsset[] }> {
  const userId = context.userId;

  // 1. Authoritative Role Guard
  if (context.profile?.role && context.profile.role !== "guru") {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Hanya pengguna dengan peran Guru yang dapat melihat daftar ulasan ilustrasi."
    );
  }

  // 2. Fetch Assets for Module
  let assets: StoredIllustrationAssetRow[] = [];
  try {
    if (context.supabase) {
      let query = context.supabase
        .from("illustration_assets")
        .select("*")
        .eq("module_id", data.moduleId)
        .eq("owner_id", userId)
        .neq("lifecycle_status", "soft_deleted");
      if (data.generationPlanId) {
        query = query.eq("generation_plan_id", data.generationPlanId);
      }
      const { data: dbAssets } = await query;
      if (dbAssets) assets = dbAssets;
    }
  } catch {}

  if (assets.length === 0) {
    assets = Array.from(fallbackIllustrationAssets.values()).filter(
      (a) =>
        a.module_id === data.moduleId &&
        a.owner_id === userId &&
        a.lifecycle_status !== "soft_deleted" &&
        (!data.generationPlanId || a.generation_plan_id === data.generationPlanId)
    );
  }

  // 3. Assemble Reviewable Items
  const items: ReviewableIllustrationAsset[] = [];

  for (const assetRow of assets) {
    // Resolve review
    let revRow = await resolveReviewRow(assetRow.id, context.supabase);
    if (!revRow) {
      const now = new Date().toISOString();
      revRow = {
        id: `rev_${assetRow.id}`,
        asset_id: assetRow.id,
        generation_id: assetRow.generation_id,
        generation_plan_id: assetRow.generation_plan_id,
        module_id: assetRow.module_id,
        outline_version: assetRow.style_version || 1,
        style_id: assetRow.style_id,
        style_version: assetRow.style_version,
        review_status: "pending",
        teacher_decision: null,
        teacher_notes: null,
        reviewed_by: userId,
        reviewed_at: null,
        created_at: now,
        updated_at: now,
      };
      fallbackIllustrationReviews.set(assetRow.id, revRow);
    }

    // Resolve immutable approved outline snapshot
    let approvedOutline: ApprovedOutlineSnapshot = {
      version: assetRow.style_version || 1,
      title: assetRow.pedagogical_metadata?.title || "Ilustrasi Pembelajaran",
      objective: assetRow.pedagogical_metadata?.objective || "Mendukung pemahaman visual materi",
      mainSubject: assetRow.pedagogical_metadata?.mainSubject || "Subjek visual pembelajaran",
      supportingElements: [],
      environment: "Latar akademis sesuai materi",
      composition: assetRow.prompt_snapshot?.compositionDirectives || "Proporsional & edukatif",
      visualDetails: "Sesuai standar kurikulum",
      educationalFocus: assetRow.pedagogical_metadata?.educationalFocus || "Kejelasan konsep",
      textRequirements: [],
      thingsToAvoid: [],
    };

    // Attempt to pull exact outline from stored canonical generation request
    const genRequest = fallbackIllustrationRequests.get(assetRow.request_id);
    if (genRequest && genRequest.approvedOutline) {
      const o = genRequest.approvedOutline;
      approvedOutline = {
        version: genRequest.approvedOutlineVersion || 1,
        title: o.title || approvedOutline.title,
        objective: o.objective || approvedOutline.objective,
        mainSubject: o.mainSubject || approvedOutline.mainSubject,
        supportingElements: o.supportingElements || [],
        environment: o.environment || approvedOutline.environment,
        composition: o.composition || approvedOutline.composition,
        visualDetails: o.visualDetails || approvedOutline.visualDetails,
        educationalFocus: o.educationalFocus || approvedOutline.educationalFocus,
        textRequirements: o.textRequirements || [],
        thingsToAvoid: o.thingsToAvoid || [],
      };
    }

    // Resolve style snapshot
    const catalogStyle = ILLUSTRATION_STYLES_CATALOG.find((s) => s.id === assetRow.style_id);
    const approvedStyle: ApprovedStyleSnapshot = {
      id: assetRow.style_id,
      name: assetRow.style_name || catalogStyle?.name || "Standard Educational",
      version: assetRow.style_version || 1,
      description: catalogStyle?.description || "Gaya ilustrasi edukatif terstandar",
      visualRules: catalogStyle?.visualRules || [],
    };

    items.push({
      asset: {
        id: assetRow.id,
        generationId: assetRow.generation_id,
        requestId: assetRow.request_id,
        generationPlanId: assetRow.generation_plan_id,
        moduleId: assetRow.module_id,
        ownerId: assetRow.owner_id,
        sha256Hash: assetRow.sha256_hash,
        storageProvider: assetRow.storage_provider,
        storagePath: assetRow.storage_path,
        publicUrl: assetRow.public_url,
        mimeType: assetRow.mime_type,
        width: assetRow.width,
        height: assetRow.height,
        byteSize: assetRow.byte_size,
        lifecycleStatus: assetRow.lifecycle_status,
        attachedSectionId: assetRow.attached_section_id || null,
        attachedAt: assetRow.attached_at || null,
        styleId: assetRow.style_id,
        styleVersion: assetRow.style_version,
        styleName: assetRow.style_name,
        promptSnapshot: assetRow.prompt_snapshot,
        groundingSnapshot: assetRow.grounding_snapshot,
        pedagogicalMetadata: assetRow.pedagogical_metadata,
        createdAt: assetRow.created_at,
        updatedAt: assetRow.updated_at,
      },
      review: toReview(revRow),
      approvedOutline,
      approvedStyle,
    });
  }

  // Sort chronologically (newest first)
  items.sort((a, b) => new Date(b.asset.createdAt).getTime() - new Date(a.asset.createdAt).getTime());

  return { status: "success", items };
}

export const listReviewableIllustrationsServerFn = createServerFn({
  method: "GET",
})
  .middleware([requireTeacherAiAuth])
  .validator((input: unknown) => {
    const parsed = ListReviewableIllustrationsInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        "Parameter daftar ulasan ilustrasi tidak valid."
      );
    }
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    return executeListReviewableIllustrations(data, context as any);
  });
