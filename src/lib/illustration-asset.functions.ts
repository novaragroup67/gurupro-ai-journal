/**
 * ==============================================================================
 * GURUPRO AI: ILLUSTRATION ASSET SERVER FUNCTIONS (VIS-1C)
 * ==============================================================================
 *
 * Implements server-side asset persistence, cryptographic provenance binding,
 * non-destructive lifecycle management, and Modul Ajar section attachment.
 */

import { createServerFn } from "@tanstack/react-start";
import crypto from "crypto";
import { requireTeacherAiAuth } from "@/integrations/supabase/auth-middleware";
import { AI_ERROR_CODES, AiServiceError } from "./ai/error-taxonomy";
import {
  type IllustrationAsset,
  type AssetLifecycleStatus,
  type StorageProviderType,
  PersistIllustrationAssetInputSchema,
  AttachIllustrationAssetInputSchema,
  DetachIllustrationAssetInputSchema,
  TransitionAssetLifecycleInputSchema,
  ListModuleIllustrationAssetsInputSchema,
  assertValidLifecycleTransition,
} from "./ai/illustration-asset-contract";
import {
  computeSha256,
  buildIllustrationStoragePath,
  resolveStorageDriver,
} from "./ai/illustration-storage-service";
import { toUint8Array } from "./ai/image-validator";
import {
  fallbackIllustrationGenerations,
  fallbackIllustrationRequests,
  type StoredIllustrationGenerationRow,
} from "./illustration-generation.functions";

// ==============================================================================
// 1. DATA STORAGE & FALLBACKS
// ==============================================================================

export interface StoredIllustrationAssetRow {
  id: string;
  generation_id: string;
  request_id: string;
  generation_plan_id: string;
  module_id: string;
  owner_id: string;
  sha256_hash: string;
  storage_provider: StorageProviderType;
  storage_path: string;
  public_url: string;
  mime_type: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
  byte_size: number;
  lifecycle_status: AssetLifecycleStatus;
  attached_section_id?: string | null;
  attached_at?: string | null;
  style_id: string;
  style_version: number;
  style_name: string;
  prompt_snapshot: any;
  grounding_snapshot: any;
  pedagogical_metadata: any;
  created_at: string;
  updated_at: string;
}

export const fallbackIllustrationAssets = new Map<string, StoredIllustrationAssetRow>();
export const fallbackModulesStore = new Map<string, any>();

function toAsset(row: StoredIllustrationAssetRow): IllustrationAsset {
  return {
    id: row.id,
    generationId: row.generation_id,
    requestId: row.request_id,
    generationPlanId: row.generation_plan_id,
    moduleId: row.module_id,
    ownerId: row.owner_id,
    sha256Hash: row.sha256_hash,
    storageProvider: row.storage_provider,
    storagePath: row.storage_path,
    publicUrl: row.public_url,
    mimeType: row.mime_type,
    width: row.width,
    height: row.height,
    byteSize: row.byte_size,
    lifecycleStatus: row.lifecycle_status,
    attachedSectionId: row.attached_section_id || null,
    attachedAt: row.attached_at || null,
    styleId: row.style_id,
    styleVersion: row.style_version,
    styleName: row.style_name,
    promptSnapshot: row.prompt_snapshot,
    groundingSnapshot: row.grounding_snapshot,
    pedagogicalMetadata: row.pedagogical_metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ==============================================================================
// 2. PERSIST ILLUSTRATION ASSET
// ==============================================================================

export async function executePersistIllustrationAsset(
  data: { generationId: string; targetSectionId?: string },
  context: { userId: string; profile?: any; supabase?: any }
): Promise<{ status: "success"; asset: IllustrationAsset }> {
  const supabase = context.supabase;
  const userId = context.userId;

  // 1. Authoritative Role Guard
  if (context.profile?.role && context.profile.role !== "guru") {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Hanya pengguna dengan peran Guru yang dapat menyimpan aset ilustrasi."
    );
  }

  // 2. Fetch Generation Record
  let genRow: StoredIllustrationGenerationRow | null = null;
  try {
    if (supabase) {
      const { data: dbRow } = await supabase
        .from("illustration_generations")
        .select("*")
        .eq("id", data.generationId)
        .maybeSingle();
      if (dbRow) genRow = dbRow;
    }
  } catch {}

  if (!genRow) {
    genRow = fallbackIllustrationGenerations.get(data.generationId) || null;
  }

  if (!genRow) {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      "Data generasi ilustrasi tidak ditemukan."
    );
  }

  // 3. Ownership Guard
  if (genRow.owner_id !== userId) {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Anda bukan pemilik artefak generasi ini."
    );
  }

  // 4. Generation Success Guard
  if (genRow.status !== "succeeded") {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      `Generasi ilustrasi berstatus '${genRow.status}'. Hanya generasi berhasil yang dapat disimpan sebagai aset permanen.`
    );
  }

  // 5. Idempotency Check: Return existing asset if already persisted for this generation
  for (const asset of fallbackIllustrationAssets.values()) {
    if (asset.generation_id === data.generationId && asset.owner_id === userId) {
      return { status: "success", asset: toAsset(asset) };
    }
  }
  try {
    if (supabase) {
      const { data: existingAsset } = await supabase
        .from("illustration_assets")
        .select("*")
        .eq("generation_id", data.generationId)
        .maybeSingle();
      if (existingAsset) {
        return { status: "success", asset: toAsset(existingAsset) };
      }
    }
  } catch {}

  // 6. Resolve Image Binary Payload
  const rawPayload = genRow.asset_url || genRow.image_data;
  if (!rawPayload) {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      "Payload binary gambar tidak ditemukan pada rekor generasi."
    );
  }

  const bytes = toUint8Array(rawPayload);
  const sha256Hash = computeSha256(bytes);

  // 7. Resolve Request & Provenance Metadata
  let reqRow = fallbackIllustrationRequests.get(genRow.request_id) || null;
  try {
    if (!reqRow && supabase) {
      const { data: dbReq } = await supabase
        .from("illustration_generation_requests")
        .select("*")
        .eq("id", genRow.request_id)
        .maybeSingle();
      if (dbReq) reqRow = dbReq;
    }
  } catch {}

  const snapshot = reqRow?.request_snapshot;
  const promptSnapshot = snapshot?.assembledPrompt || {
    systemPrompt: "Educational Illustration",
    styleDirectives: "Pedagogical clarity",
    subjectDescription: "Curriculum illustration",
    compositionDirectives: "Centered",
    negativePrompt: "",
    fullPrompt: "Educational illustration",
  };

  const groundingSnapshot = {
    sourceReferences: snapshot?.sourceReferences || [],
    evidenceReferences: snapshot?.evidenceReferences || [],
    subjectDiscipline: snapshot?.grounding?.subjectDiscipline,
    audienceLevel: snapshot?.grounding?.audienceLevel,
    curriculumContext: "Kurikulum Merdeka",
  };

  const pedagogicalMetadata = {
    title: snapshot?.approvedOutline?.title || "Ilustrasi Modul Ajar",
    objective: snapshot?.approvedOutline?.objective || "Tujuan visualisasi",
    mainSubject: snapshot?.approvedOutline?.mainSubject || "Materi Pokok",
    educationalFocus: snapshot?.approvedOutline?.educationalFocus || "Konsep Inti",
    targetSectionId: data.targetSectionId || snapshot?.approvedOutline?.sectionId,
  };

  // 8. Ingest into Persistent Storage Driver
  const assetId = `ast_ill_${crypto.randomUUID()}`;
  const storagePath = buildIllustrationStoragePath(
    userId,
    genRow.module_id,
    assetId,
    genRow.mime_type
  );

  const storageDriver = resolveStorageDriver(supabase);
  const uploadResult = await storageDriver.upload(storagePath, bytes, genRow.mime_type);

  // 9. Persist Asset Row
  const now = new Date().toISOString();
  const initialStatus: AssetLifecycleStatus = data.targetSectionId ? "attached" : "staged";

  const assetRow: StoredIllustrationAssetRow = {
    id: assetId,
    generation_id: genRow.id,
    request_id: genRow.request_id,
    generation_plan_id: genRow.generation_plan_id || reqRow?.generation_plan_id,
    module_id: genRow.module_id,
    owner_id: userId,
    sha256_hash: sha256Hash,
    storage_provider: uploadResult.provider,
    storage_path: uploadResult.storagePath,
    public_url: uploadResult.publicUrl,
    mime_type: genRow.mime_type as any,
    width: genRow.width,
    height: genRow.height,
    byte_size: uploadResult.byteSize,
    lifecycle_status: initialStatus,
    attached_section_id: data.targetSectionId || null,
    attached_at: data.targetSectionId ? now : null,
    style_id: reqRow?.style_id || "style_ill_flat_edu",
    style_version: reqRow?.style_version || 1,
    style_name: snapshot?.styleDefinition?.name || "Gaya Ilustrasi Terpilih",
    prompt_snapshot: promptSnapshot,
    grounding_snapshot: groundingSnapshot,
    pedagogical_metadata: pedagogicalMetadata,
    created_at: now,
    updated_at: now,
  };

  fallbackIllustrationAssets.set(assetId, assetRow);

  try {
    if (supabase) {
      await supabase.from("illustration_assets").insert(assetRow);
    }
  } catch {}

  // If section ID was provided, also attach to module
  if (data.targetSectionId) {
    await executeAttachIllustrationAsset(
      {
        assetId,
        moduleId: genRow.module_id,
        sectionId: data.targetSectionId,
      },
      context
    );
  }

  return {
    status: "success",
    asset: toAsset(fallbackIllustrationAssets.get(assetId) || assetRow),
  };
}

export const persistIllustrationAssetServerFn = createServerFn({
  method: "POST",
})
  .middleware([requireTeacherAiAuth])
  .validator((input: unknown) => {
    const parsed = PersistIllustrationAssetInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        "Parameter penyimpanan aset ilustrasi tidak valid."
      );
    }
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    return executePersistIllustrationAsset(data, context as any);
  });

// ==============================================================================
// 3. ATTACH ILLUSTRATION ASSET TO MODULE SECTION
// ==============================================================================

export async function executeAttachIllustrationAsset(
  data: { assetId: string; moduleId: string; sectionId: string },
  context: { userId: string; profile?: any; supabase?: any }
): Promise<{ status: "success"; asset: IllustrationAsset; sectionTitle?: string }> {
  const supabase = context.supabase;
  const userId = context.userId;

  // 1. Authoritative Role Guard
  if (context.profile?.role && context.profile.role !== "guru") {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Hanya guru yang dapat menautkan aset ke modul ajar."
    );
  }

  // 2. Fetch Asset & Ownership Guard
  let assetRow: StoredIllustrationAssetRow | null = null;
  try {
    if (supabase) {
      const { data: dbAsset } = await supabase
        .from("illustration_assets")
        .select("*")
        .eq("id", data.assetId)
        .maybeSingle();
      if (dbAsset) assetRow = dbAsset;
    }
  } catch {}

  if (!assetRow) {
    assetRow = fallbackIllustrationAssets.get(data.assetId) || null;
  }

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
      "Aset yang telah dihapus tidak dapat ditautkan ke modul ajar."
    );
  }

  if (assetRow.module_id !== data.moduleId) {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      "Aset ilustrasi ini dibuat untuk modul ajar yang berbeda."
    );
  }

  // 3. Fetch Modul Ajar & Verify Section
  let modul: any = null;
  try {
    if (supabase) {
      const { data: dbModul } = await supabase
        .from("moduls")
        .select("*")
        .eq("id", data.moduleId)
        .maybeSingle();
      if (dbModul) modul = dbModul;
    }
  } catch {}

  if (!modul) {
    modul = fallbackModulesStore.get(data.moduleId) || null;
  }

  let sectionTitle = "";
  if (modul) {
    const sections: any[] = Array.isArray(modul.sections) ? modul.sections : [];
    const targetSection = sections.find((s) => s.id === data.sectionId);
    if (!targetSection) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        `Bab / Section dengan ID '${data.sectionId}' tidak ditemukan pada modul ajar.`
      );
    }
    sectionTitle = targetSection.judul;

    // Update section's ilustrasi URL
    targetSection.ilustrasi = assetRow.public_url;
    modul.updated_at = new Date().toISOString();
    fallbackModulesStore.set(data.moduleId, modul);

    try {
      if (supabase) {
        await supabase
          .from("moduls")
          .update({
            sections: modul.sections,
            updated_at: modul.updated_at,
          })
          .eq("id", data.moduleId);
      }
    } catch {}
  }

  // 4. NON-DESTRUCTIVE INVARIANT: Supersede previous active asset for this section
  const now = new Date().toISOString();
  for (const otherAsset of fallbackIllustrationAssets.values()) {
    if (
      otherAsset.module_id === data.moduleId &&
      otherAsset.attached_section_id === data.sectionId &&
      otherAsset.lifecycle_status === "attached" &&
      otherAsset.id !== data.assetId
    ) {
      otherAsset.lifecycle_status = "superseded";
      otherAsset.updated_at = now;
      fallbackIllustrationAssets.set(otherAsset.id, otherAsset);

      try {
        if (supabase) {
          await supabase
            .from("illustration_assets")
            .update({
              lifecycle_status: "superseded",
              updated_at: now,
            })
            .eq("id", otherAsset.id);
        }
      } catch {}
    }
  }

  // 5. Update Target Asset Status to Attached
  assetRow.lifecycle_status = "attached";
  assetRow.attached_section_id = data.sectionId;
  assetRow.attached_at = now;
  assetRow.updated_at = now;
  fallbackIllustrationAssets.set(data.assetId, assetRow);

  try {
    if (supabase) {
      await supabase
        .from("illustration_assets")
        .update({
          lifecycle_status: "attached",
          attached_section_id: data.sectionId,
          attached_at: now,
          updated_at: now,
        })
        .eq("id", data.assetId);
    }
  } catch {}

  return {
    status: "success",
    asset: toAsset(assetRow),
    sectionTitle,
  };
}

export const attachIllustrationAssetServerFn = createServerFn({
  method: "POST",
})
  .middleware([requireTeacherAiAuth])
  .validator((input: unknown) => {
    const parsed = AttachIllustrationAssetInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        "Parameter penautan aset ilustrasi tidak valid."
      );
    }
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    return executeAttachIllustrationAsset(data, context as any);
  });

// ==============================================================================
// 4. DETACH ILLUSTRATION ASSET
// ==============================================================================

export async function executeDetachIllustrationAsset(
  data: { assetId: string },
  context: { userId: string; profile?: any; supabase?: any }
): Promise<{ status: "success"; asset: IllustrationAsset }> {
  const supabase = context.supabase;
  const userId = context.userId;

  let assetRow: StoredIllustrationAssetRow | null = null;
  try {
    if (supabase) {
      const { data: dbAsset } = await supabase
        .from("illustration_assets")
        .select("*")
        .eq("id", data.assetId)
        .maybeSingle();
      if (dbAsset) assetRow = dbAsset;
    }
  } catch {}

  if (!assetRow) {
    assetRow = fallbackIllustrationAssets.get(data.assetId) || null;
  }

  if (!assetRow) {
    throw new AiServiceError(AI_ERROR_CODES.INVALID_REQUEST, "Aset ilustrasi tidak ditemukan.");
  }

  if (assetRow.owner_id !== userId) {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Anda bukan pemilik aset ilustrasi ini."
    );
  }

  const previousSectionId = assetRow.attached_section_id;
  const now = new Date().toISOString();

  // Transition to staged
  assertValidLifecycleTransition(assetRow.lifecycle_status, "staged");
  assetRow.lifecycle_status = "staged";
  assetRow.attached_section_id = null;
  assetRow.attached_at = null;
  assetRow.updated_at = now;
  fallbackIllustrationAssets.set(data.assetId, assetRow);

  // Unlink from modul sections if it was attached
  if (previousSectionId) {
    let modul = fallbackModulesStore.get(assetRow.module_id);
    if (modul && Array.isArray(modul.sections)) {
      const sec = modul.sections.find((s: any) => s.id === previousSectionId);
      if (sec && sec.ilustrasi === assetRow.public_url) {
        sec.ilustrasi = undefined;
        fallbackModulesStore.set(assetRow.module_id, modul);
      }
    }

    try {
      if (supabase) {
        await supabase
          .from("illustration_assets")
          .update({
            lifecycle_status: "staged",
            attached_section_id: null,
            attached_at: null,
            updated_at: now,
          })
          .eq("id", data.assetId);
      }
    } catch {}
  }

  return {
    status: "success",
    asset: toAsset(assetRow),
  };
}

export const detachIllustrationAssetServerFn = createServerFn({
  method: "POST",
})
  .middleware([requireTeacherAiAuth])
  .validator((input: unknown) => {
    const parsed = DetachIllustrationAssetInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        "Parameter pelepasan aset ilustrasi tidak valid."
      );
    }
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    return executeDetachIllustrationAsset(data, context as any);
  });

// ==============================================================================
// 5. TRANSITION ASSET LIFECYCLE (ARCHIVE / SOFT-DELETE / RESTORE)
// ==============================================================================

export async function executeTransitionAssetLifecycle(
  data: { assetId: string; targetStatus: "staged" | "archived" | "soft_deleted" },
  context: { userId: string; profile?: any; supabase?: any }
): Promise<{ status: "success"; asset: IllustrationAsset }> {
  const supabase = context.supabase;
  const userId = context.userId;

  let assetRow: StoredIllustrationAssetRow | null = null;
  try {
    if (supabase) {
      const { data: dbAsset } = await supabase
        .from("illustration_assets")
        .select("*")
        .eq("id", data.assetId)
        .maybeSingle();
      if (dbAsset) assetRow = dbAsset;
    }
  } catch {}

  if (!assetRow) {
    assetRow = fallbackIllustrationAssets.get(data.assetId) || null;
  }

  if (!assetRow) {
    throw new AiServiceError(AI_ERROR_CODES.INVALID_REQUEST, "Aset ilustrasi tidak ditemukan.");
  }

  if (assetRow.owner_id !== userId) {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Anda bukan pemilik aset ilustrasi ini."
    );
  }

  // Validate state machine rules
  assertValidLifecycleTransition(assetRow.lifecycle_status, data.targetStatus);

  const now = new Date().toISOString();
  const wasAttached = assetRow.lifecycle_status === "attached";
  const attachedSecId = assetRow.attached_section_id;

  assetRow.lifecycle_status = data.targetStatus;
  assetRow.updated_at = now;

  // If archiving or soft-deleting, detach from section
  if (data.targetStatus === "archived" || data.targetStatus === "soft_deleted") {
    assetRow.attached_section_id = null;
    assetRow.attached_at = null;

    if (wasAttached && attachedSecId) {
      const modul = fallbackModulesStore.get(assetRow.module_id);
      if (modul && Array.isArray(modul.sections)) {
        const sec = modul.sections.find((s: any) => s.id === attachedSecId);
        if (sec && sec.ilustrasi === assetRow.public_url) {
          sec.ilustrasi = undefined;
          fallbackModulesStore.set(assetRow.module_id, modul);
        }
      }
    }
  }

  fallbackIllustrationAssets.set(data.assetId, assetRow);

  try {
    if (supabase) {
      await supabase
        .from("illustration_assets")
        .update({
          lifecycle_status: data.targetStatus,
          attached_section_id: assetRow.attached_section_id,
          attached_at: assetRow.attached_at,
          updated_at: now,
        })
        .eq("id", data.assetId);
    }
  } catch {}

  return {
    status: "success",
    asset: toAsset(assetRow),
  };
}

export const transitionAssetLifecycleServerFn = createServerFn({
  method: "POST",
})
  .middleware([requireTeacherAiAuth])
  .validator((input: unknown) => {
    const parsed = TransitionAssetLifecycleInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        "Parameter transisi status aset tidak valid."
      );
    }
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    return executeTransitionAssetLifecycle(data, context as any);
  });

// ==============================================================================
// 6. LIST MODULE ILLUSTRATION ASSETS
// ==============================================================================

export async function executeListModuleIllustrationAssets(
  data: { moduleId: string },
  context: { userId: string; profile?: any; supabase?: any }
): Promise<{ status: "success"; assets: IllustrationAsset[] }> {
  const supabase = context.supabase;
  const userId = context.userId;

  const results: IllustrationAsset[] = [];

  try {
    if (supabase) {
      const { data: dbRows } = await supabase
        .from("illustration_assets")
        .select("*")
        .eq("module_id", data.moduleId)
        .eq("owner_id", userId)
        .neq("lifecycle_status", "soft_deleted")
        .order("created_at", { ascending: false });

      if (Array.isArray(dbRows)) {
        for (const row of dbRows) {
          results.push(toAsset(row));
        }
      }
    }
  } catch {}

  if (results.length === 0) {
    for (const asset of fallbackIllustrationAssets.values()) {
      if (
        asset.module_id === data.moduleId &&
        asset.owner_id === userId &&
        asset.lifecycle_status !== "soft_deleted"
      ) {
        results.push(toAsset(asset));
      }
    }
  }

  // Sort by created_at DESC
  results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return {
    status: "success",
    assets: results,
  };
}

export const listModuleIllustrationAssetsServerFn = createServerFn({
  method: "POST",
})
  .middleware([requireTeacherAiAuth])
  .validator((input: unknown) => {
    const parsed = ListModuleIllustrationAssetsInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        "Parameter pengambilan daftar aset tidak valid."
      );
    }
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    return executeListModuleIllustrationAssets(data, context as any);
  });
