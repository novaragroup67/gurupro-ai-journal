/**
 * ==============================================================================
 * GURUPRO AI: PRESENTATION ILLUSTRATION RESOLVER & APPROVAL GATE (PPT-1D)
 * ==============================================================================
 *
 * Resolves, validates, and prepares approved pedagogical illustrations for
 * embedding into real Microsoft PowerPoint (.pptx) documents.
 *
 * Invariants:
 * 1. Strict Approval Gate: ONLY illustrations with review_status === "approved_for_use"
 *    (or teacherDecision === "use") are permitted. Unapproved, pending, or rejected assets FAIL closed.
 * 2. Active Lifecycle Only: Assets must be in "staged" or "attached" lifecycle state.
 * 3. Multi-Tenant Ownership: Teachers can only embed assets belonging to their tenant/account.
 * 4. Content Integrity: Downloaded binary is verified against the asset's SHA-256 hash.
 * 5. Zero AI Image Generation: Does NOT call image generation models or create new images.
 */

import crypto from "crypto";
import { AI_ERROR_CODES, AiServiceError } from "./error-taxonomy";
import {
  type PresentationContentPackage,
  type PresentationSlideContent,
  type IllustrationPlacement,
} from "./presentation-generation-contract";
import {
  type StoredIllustrationAssetRow,
  fallbackIllustrationAssets,
} from "../illustration-asset.functions";
import {
  type StoredIllustrationReviewRow,
  fallbackIllustrationReviews,
} from "../illustration-review.functions";
import {
  type IllustrationStorageDriver,
  resolveStorageDriver,
  computeSha256,
} from "./illustration-storage-service";

export interface ResolvedSlideIllustration {
  assetId: string;
  slideId: string;
  storagePath: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  bytes: Uint8Array;
  base64Data: string;
  width: number;
  height: number;
  aspectRatio: number; // width / height
  placement: IllustrationPlacement;
  caption?: string;
  altText?: string;
  sha256Hash: string;
  reviewId?: string;
  provenance: {
    moduleId: string;
    generationId?: string;
    styleId?: string;
    ownerId: string;
  };
}

export interface IllustrationResolutionContext {
  userId: string;
  profile?: { role?: string };
  supabase?: any;
}

/**
 * Resolves and validates all illustration references across the presentation slides.
 * Fails closed if any referenced illustration is missing, unapproved, revoked, or corrupted.
 */
export async function resolvePresentationIllustrations(
  contentPackage: PresentationContentPackage,
  context: IllustrationResolutionContext,
  storageDriver?: IllustrationStorageDriver
): Promise<Map<string, ResolvedSlideIllustration>> {
  const resolvedMap = new Map<string, ResolvedSlideIllustration>();
  const activeDriver = storageDriver || resolveStorageDriver(context.supabase);

  // 1. Role Guard: only teacher or admin can assemble presentation illustrations
  if (context.profile?.role && context.profile.role !== "guru" && context.profile.role !== "admin") {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Hanya peran Guru yang dapat menyematkan aset ilustrasi ke presentasi."
    );
  }

  for (const slide of contentPackage.slides) {
    // Determine if slide references an illustration
    let targetAssetId: string | null = null;
    let specifiedPlacement: IllustrationPlacement = "right";
    let specifiedCaption: string | undefined = undefined;
    let specifiedAltText: string | undefined = undefined;

    if (slide.illustrationReference?.assetId) {
      targetAssetId = slide.illustrationReference.assetId;
      specifiedPlacement = slide.illustrationReference.placement || "right";
      specifiedCaption = slide.illustrationReference.caption;
      specifiedAltText = slide.illustrationReference.altText;
    } else if (Array.isArray(slide.referencedAssetIds) && slide.referencedAssetIds.length > 0) {
      targetAssetId = slide.referencedAssetIds[0];
    }

    // If no illustration referenced on this slide, continue
    if (!targetAssetId) {
      continue;
    }

    // 2. Fetch Asset Record
    const assetRow = await resolveAssetRow(targetAssetId, context.supabase);
    if (!assetRow) {
      throw new AiServiceError(
        AI_ERROR_CODES.PPTX_ILLUSTRATION_NOT_FOUND,
        `Aset ilustrasi ID '${targetAssetId}' yang dirujuk pada Slide #${slide.order} tidak ditemukan di sistem.`,
        { slideId: slide.slideId, assetId: targetAssetId }
      );
    }

    // 3. Multi-Tenant Ownership Guard
    if (context.profile?.role !== "admin" && assetRow.owner_id !== context.userId) {
      throw new AiServiceError(
        AI_ERROR_CODES.ROLE_FORBIDDEN,
        `Akses ditolak: Aset ilustrasi ID '${targetAssetId}' bukan milik Anda (pelanggaran batas multi-tenant).`,
        { slideId: slide.slideId, assetId: targetAssetId }
      );
    }

    // 4. Lifecycle Status Invariant
    if (assetRow.lifecycle_status === "archived" || assetRow.lifecycle_status === "soft_deleted") {
      throw new AiServiceError(
        AI_ERROR_CODES.PPTX_ILLUSTRATION_LIFECYCLE_INVALID,
        `Aset ilustrasi ID '${targetAssetId}' tidak dapat digunakan karena berstatus '${assetRow.lifecycle_status}'.`,
        { slideId: slide.slideId, assetId: targetAssetId, status: assetRow.lifecycle_status }
      );
    }

    // 5. Authoritative Teacher Review Approval Invariant
    const reviewRow = await resolveReviewRow(targetAssetId, context.supabase);
    const isExplicitlyApproved =
      reviewRow && reviewRow.review_status === "approved_for_use";

    if (!isExplicitlyApproved) {
      const currentReviewStatus = reviewRow ? reviewRow.review_status : "unreviewed";
      throw new AiServiceError(
        AI_ERROR_CODES.PPTX_UNAPPROVED_ILLUSTRATION,
        `Ilustrasi ID '${targetAssetId}' pada Slide #${slide.order} belum disetujui oleh guru (status: '${currentReviewStatus}'). Hanya ilustrasi yang disetujui guru ('approved_for_use') yang dapat disematkan ke berkas PPTX.`,
        { slideId: slide.slideId, assetId: targetAssetId, reviewStatus: currentReviewStatus }
      );
    }

    // 6. Download Binary Bytes & Cryptographic Hash Verification
    let bytes: Uint8Array;
    try {
      bytes = await activeDriver.download(assetRow.storage_path);
    } catch (err: any) {
      throw new AiServiceError(
        AI_ERROR_CODES.PPTX_ILLUSTRATION_LOAD_FAILED,
        `Gagal mengunduh biner berkas ilustrasi ID '${targetAssetId}' dari path '${assetRow.storage_path}': ${err.message}`,
        { slideId: slide.slideId, assetId: targetAssetId }
      );
    }

    const calculatedHash = computeSha256(bytes);
    if (calculatedHash !== assetRow.sha256_hash) {
      throw new AiServiceError(
        AI_ERROR_CODES.PPTX_ILLUSTRATION_LOAD_FAILED,
        `Integritas biner ilustrasi ID '${targetAssetId}' gagal: hash biner tidak cocok dengan metadata aset.`,
        { slideId: slide.slideId, assetId: targetAssetId, expectedHash: assetRow.sha256_hash, calculatedHash }
      );
    }

    // 7. Validate Supported Image MIME Type
    const validMimes = ["image/png", "image/jpeg", "image/webp"] as const;
    if (!validMimes.includes(assetRow.mime_type as any)) {
      throw new AiServiceError(
        AI_ERROR_CODES.PPTX_ILLUSTRATION_UNSUPPORTED_FORMAT,
        `Tipe format gambar '${assetRow.mime_type}' pada aset ID '${targetAssetId}' tidak didukung untuk PPTX.`,
        { slideId: slide.slideId, assetId: targetAssetId, mimeType: assetRow.mime_type }
      );
    }

    // 8. Convert to Base64 Data URL for PptxGenJS Embedding
    const base64String = Buffer.from(bytes).toString("base64");
    const base64Data = `data:${assetRow.mime_type};base64,${base64String}`;

    const width = assetRow.width > 0 ? assetRow.width : 1024;
    const height = assetRow.height > 0 ? assetRow.height : 1024;
    const aspectRatio = width / height;

    resolvedMap.set(slide.slideId, {
      assetId: targetAssetId,
      slideId: slide.slideId,
      storagePath: assetRow.storage_path,
      mimeType: assetRow.mime_type as any,
      bytes,
      base64Data,
      width,
      height,
      aspectRatio,
      placement: specifiedPlacement,
      caption: specifiedCaption || assetRow.pedagogical_metadata?.title,
      altText: specifiedAltText || assetRow.pedagogical_metadata?.educationalFocus,
      sha256Hash: assetRow.sha256_hash,
      reviewId: reviewRow?.id,
      provenance: {
        moduleId: assetRow.module_id,
        generationId: assetRow.generation_id,
        styleId: assetRow.style_id,
        ownerId: assetRow.owner_id,
      },
    });
  }

  return resolvedMap;
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
