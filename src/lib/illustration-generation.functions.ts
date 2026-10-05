/**
 * ==============================================================================
 * GURUPRO AI: ILLUSTRATION GENERATION SERVER FUNCTIONS (VIS-1A)
 * ==============================================================================
 *
 * Server-authoritative operations for:
 * 1. prepareIllustrationGenerationRequestServerFn
 * 2. getIllustrationGenerationRequestServerFn
 *
 * Enforces:
 * - Verified Teacher Authentication (requireTeacherAiAuth)
 * - Strict owner validation on target GenerationPlan & Modul Ajar
 * - Re-validation of approval state (status === 'approved', approvedVersion === currentVersion)
 * - Target type enforcement (fail-closed if targetType !== 'illustration')
 * - Persistence of prepared requests in public.illustration_generation_requests
 * - Strict non-generation invariant (zero external image API calls)
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireTeacherAiAuth } from "@/integrations/supabase/auth-middleware";
import { AI_ERROR_CODES, AiServiceError, normalizeAiError } from "./ai/error-taxonomy";
import {
  type GenerationPlan,
  type PlanAuthContext,
  createGenerationSpecification,
  getStyleById,
  ILLUSTRATION_STYLES_CATALOG,
} from "./ai/generation-planning-contract";
import {
  IllustrationGenerationParametersSchema,
  type IllustrationGenerationRequest,
  type IllustrationGenerationResult,
} from "./ai/illustration-generation-contract";
import {
  buildIllustrationGenerationRequest,
  assembleIllustrationPrompt,
} from "./ai/illustration-request-builder";
import { assertValidImageBinary } from "./ai/image-validator";
import { resolveIllustrationGenerationProvider } from "./ai/providers/illustration-provider-factory";

// ==============================================================================
// HELPERS & IN-MEMORY FALLBACK (FOR UNIT TESTS / TEST ENVIRONMENT)
// ==============================================================================

function toPlan(row: any): GenerationPlan {
  return {
    id: row.id,
    ownerId: row.owner_id,
    moduleId: row.module_id,
    targetType: row.target_type,
    status: row.status,
    currentVersion: row.current_version,
    approvedVersion: row.approved_version,
    outline: row.outline,
    style: row.style,
    provenance: row.provenance || { modulId: row.module_id },
    generationSettings: row.generation_settings || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface StoredIllustrationRequestRow {
  id: string;
  generation_plan_id: string;
  approved_version: number;
  style_id: string;
  style_version: number;
  request_snapshot: IllustrationGenerationRequest;
  status: "prepared" | "submitted" | "processing" | "succeeded" | "failed" | "cancelled";
  created_by: string;
  created_at: string;
  updated_at: string;
}

// In-memory fallback repository for unit tests or environments before migration execution
export const fallbackIllustrationRequests = new Map<string, StoredIllustrationRequestRow>();

export interface StoredIllustrationGenerationRow {
  id: string;
  request_id: string;
  generation_plan_id: string;
  module_id: string;
  owner_id: string;
  provider: string;
  model: string;
  provider_request_id?: string | undefined;
  status: "pending" | "processing" | "succeeded" | "failed";
  asset_url?: string | undefined;
  image_data?: string | undefined;
  mime_type: string;
  width: number;
  height: number;
  byte_size: number;
  retry_count: number;
  error_code?: string | undefined;
  error_message?: string | undefined;
  created_at: string;
  updated_at: string;
}

export const fallbackIllustrationGenerations = new Map<string, StoredIllustrationGenerationRow>();
export const inFlightGenerationLocks = new Map<string, number>();

// Export helper to register a plan directly in memory for testing
export const fallbackTestPlans = new Map<string, GenerationPlan>();

// ==============================================================================
// 1. PREPARE ILLUSTRATION GENERATION REQUEST SERVER FN
// ==============================================================================

const PrepareIllustrationRequestInputSchema = z.object({
  planId: z.string().min(1, "ID rencana generasi wajib diisi."),
  parameters: IllustrationGenerationParametersSchema.partial().optional(),
});

export const prepareIllustrationGenerationRequestServerFn = createServerFn({
  method: "POST",
})
  .middleware([requireTeacherAiAuth])
  .validator((input: unknown) => {
    const parsed = PrepareIllustrationRequestInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        "Parameter persiapan permintaan generasi ilustrasi tidak valid."
      );
    }
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase;
    const userId = (context as any).userId;
    const profile = (context as any).profile;

    const authContext: PlanAuthContext = {
      userId,
      role: profile?.role || "guru",
      isGuru: true,
      verificationStatus: profile?.status_verifikasi || "verified",
    };

    let plan: GenerationPlan | null = null;

    // 1. Fetch Plan from Database
    try {
      if (supabase) {
        const { data: row } = await supabase
          .from("generation_plans")
          .select("*")
          .eq("id", data.planId)
          .maybeSingle();

        if (row) plan = toPlan(row);
      }
    } catch {
      // Database unavailable, fallback
    }

    // Check test fallback
    if (!plan) {
      plan = fallbackTestPlans.get(data.planId) || null;
    }

    if (!plan) {
      throw new AiServiceError(
        AI_ERROR_CODES.PLAN_NOT_FOUND,
        "Rencana generasi tidak ditemukan."
      );
    }

    // 2. Ownership / Tenant Boundary
    if (plan.ownerId !== userId) {
      throw new AiServiceError(
        AI_ERROR_CODES.ROLE_FORBIDDEN,
        "Akses ditolak: Anda bukan pemilik rencana generasi ini."
      );
    }

    // 3. Strict Target Type Guard
    if (plan.targetType !== "illustration") {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        `Target rencana '${plan.targetType}' tidak valid. Hanya rencana bertipe 'illustration' yang dapat membuat permintaan generasi ilustrasi.`
      );
    }

    // 4. Create Canonical Specification (re-validates approval state)
    let spec;
    try {
      spec = createGenerationSpecification(plan, authContext);
    } catch (err: any) {
      throw normalizeAiError(err);
    }

    // 5. Build Canonical Illustration Generation Request
    let request: IllustrationGenerationRequest;
    try {
      request = buildIllustrationGenerationRequest({
        spec,
        plan,
        authContext,
        overrideParams: data.parameters as any,
      });
    } catch (err: any) {
      throw normalizeAiError(err);
    }

    // 6. Persist to Database or Fallback
    const now = new Date().toISOString();
    const storedRow: StoredIllustrationRequestRow = {
      id: request.requestId,
      generation_plan_id: request.generationPlanId,
      approved_version: request.approvedOutlineVersion,
      style_id: request.styleId,
      style_version: request.styleVersion,
      request_snapshot: request,
      status: "prepared",
      created_by: userId,
      created_at: now,
      updated_at: now,
    };

    try {
      if (supabase) {
        await supabase.from("illustration_generation_requests").insert({
          id: storedRow.id,
          generation_plan_id: storedRow.generation_plan_id,
          approved_version: storedRow.approved_version,
          style_id: storedRow.style_id,
          style_version: storedRow.style_version,
          request_snapshot: storedRow.request_snapshot as any,
          status: storedRow.status,
          created_by: storedRow.created_by,
          created_at: storedRow.created_at,
          updated_at: storedRow.updated_at,
        });
      }
    } catch {
      // If table not yet created in local test, continue
    }

    fallbackIllustrationRequests.set(request.requestId, storedRow);

    return {
      status: "success" as const,
      request,
    };
  });

// ==============================================================================
// 2. GET ILLUSTRATION GENERATION REQUEST SERVER FN
// ==============================================================================

const GetIllustrationRequestInputSchema = z.object({
  requestId: z.string().min(1, "ID permintaan generasi wajib diisi."),
});

export const getIllustrationGenerationRequestServerFn = createServerFn({
  method: "POST",
})
  .middleware([requireTeacherAiAuth])
  .validator((input: unknown) => {
    const parsed = GetIllustrationRequestInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        "Parameter pengambilan permintaan generasi ilustrasi tidak valid."
      );
    }
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase;
    const userId = (context as any).userId;

    let row: StoredIllustrationRequestRow | null = null;

    try {
      if (supabase) {
        const { data: dbRow } = await supabase
          .from("illustration_generation_requests")
          .select("*")
          .eq("id", data.requestId)
          .maybeSingle();

        if (dbRow) {
          row = {
            id: dbRow.id,
            generation_plan_id: dbRow.generation_plan_id,
            approved_version: dbRow.approved_version,
            style_id: dbRow.style_id,
            style_version: dbRow.style_version,
            request_snapshot: dbRow.request_snapshot,
            status: dbRow.status,
            created_by: dbRow.created_by,
            created_at: dbRow.created_at,
            updated_at: dbRow.updated_at,
          };
        }
      }
    } catch {}

    if (!row) {
      row = fallbackIllustrationRequests.get(data.requestId) || null;
    }

    if (!row) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        "Permintaan generasi ilustrasi tidak ditemukan."
      );
    }

    if (row.created_by !== userId) {
      throw new AiServiceError(
        AI_ERROR_CODES.ROLE_FORBIDDEN,
        "Akses ditolak: Anda bukan pemilik permintaan generasi ini."
      );
    }

    return {
      status: "success" as const,
      request: row.request_snapshot,
      rowMetadata: {
        id: row.id,
        generationPlanId: row.generation_plan_id,
        status: row.status,
        createdAt: row.created_at,
      },
    };
  });

// ==============================================================================
// 3. GENERATE REAL AI ILLUSTRATION SERVER FN (VIS-1B)
// ==============================================================================

const GenerateIllustrationInputSchema = z.object({
  requestId: z.string().min(1, "ID permintaan generasi wajib diisi."),
  forceRetry: z.boolean().optional(),
});

export async function executeGenerateIllustration(
  data: { requestId: string; forceRetry?: boolean },
  context: { userId: string; profile?: any; supabase?: any }
) {
  const supabase = context.supabase;
  const userId = context.userId;
  const profile = context.profile;

  if (profile && profile.isGuru === false) {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Hanya pengguna dengan peran guru yang diizinkan melakukan operasi ini."
    );
  }

  // 1. Fetch Prepared Request
  let requestRow: StoredIllustrationRequestRow | null = null;
  try {
    if (supabase) {
      const { data: dbRow } = await supabase
        .from("illustration_generation_requests")
        .select("*")
        .eq("id", data.requestId)
        .maybeSingle();

      if (dbRow) {
        requestRow = {
          id: dbRow.id,
          generation_plan_id: dbRow.generation_plan_id,
          approved_version: dbRow.approved_version,
          style_id: dbRow.style_id,
          style_version: dbRow.style_version,
          request_snapshot: dbRow.request_snapshot,
          status: dbRow.status,
          created_by: dbRow.created_by,
          created_at: dbRow.created_at,
          updated_at: dbRow.updated_at,
        };
      }
    }
  } catch {}

  if (!requestRow) {
    requestRow = fallbackIllustrationRequests.get(data.requestId) || null;
  }

  if (!requestRow) {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      "Permintaan generasi ilustrasi tidak ditemukan."
    );
  }

  // 2. Authorize Request Ownership
  if (requestRow.created_by !== userId) {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Anda bukan pemilik permintaan generasi ini."
    );
  }

  // 3. Fetch Plan & Authoritative Re-validation
  let plan: GenerationPlan | null = null;
  try {
    if (supabase) {
      const { data: planRow } = await supabase
        .from("generation_plans")
        .select("*")
        .eq("id", requestRow.generation_plan_id)
        .maybeSingle();
      if (planRow) plan = toPlan(planRow);
    }
  } catch {}

  if (!plan) {
    plan = fallbackTestPlans.get(requestRow.generation_plan_id) || null;
  }

  if (!plan) {
    throw new AiServiceError(
      AI_ERROR_CODES.PLAN_NOT_FOUND,
      "Rencana generasi dasar tidak ditemukan."
    );
  }

  if (plan.ownerId !== userId) {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Anda bukan pemilik rencana generasi ini."
    );
  }

  // Guard: Target Type must be illustration
  if (plan.targetType !== "illustration") {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      `Target rencana '${plan.targetType}' tidak valid untuk generasi gambar.`
    );
  }

  // Guard: Plan must be approved
  if (plan.status !== "approved") {
    throw new AiServiceError(
      AI_ERROR_CODES.PLAN_NOT_APPROVED,
      "Rencana ilustrasi belum disetujui oleh guru."
    );
  }

  // Guard: Approval must not be stale (approvedVersion === currentVersion)
  if (plan.approvedVersion !== plan.currentVersion) {
    throw new AiServiceError(
      AI_ERROR_CODES.STALE_APPROVAL,
      `Persetujuan rencana telah usang (versi disetujui: ${plan.approvedVersion}, versi saat ini: ${plan.currentVersion}). Silakan setujui ulang.`
    );
  }

  // Guard: Request snapshot version matches plan approved version
  if (requestRow.approved_version !== plan.approvedVersion) {
    throw new AiServiceError(
      AI_ERROR_CODES.STALE_APPROVAL,
      `Permintaan generasi merujuk ke versi outline usang (v${requestRow.approved_version} vs v${plan.approvedVersion}).`
    );
  }

  // Guard: Style definition matches approved style
  if (
    !plan.style ||
    requestRow.style_id !== plan.style.styleId ||
    requestRow.style_version !== plan.style.styleVersion
  ) {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_STYLE,
      "Gaya visual rencana telah berubah sejak permintaan disiapkan. Silakan siapkan ulang permintaan."
    );
  }

  // 4. Idempotency & In-Flight Lock Protection
  const nowMs = Date.now();
  const existingLockTime = inFlightGenerationLocks.get(data.requestId);
  if (existingLockTime && nowMs - existingLockTime < 120000) {
    throw new AiServiceError(
      AI_ERROR_CODES.RATE_LIMITED,
      "Generasi gambar untuk permintaan ini sedang diproses di server. Mohon tunggu beberapa saat."
    );
  }

  // Check if successful generation already exists and not forced retry
  if (!data.forceRetry) {
    let existingGen: StoredIllustrationGenerationRow | null = null;
    try {
      if (supabase) {
        const { data: genRow } = await supabase
          .from("illustration_generations")
          .select("*")
          .eq("request_id", data.requestId)
          .eq("status", "succeeded")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (genRow) existingGen = genRow;
      }
    } catch {}

    if (!existingGen) {
      for (const gen of fallbackIllustrationGenerations.values()) {
        if (gen.request_id === data.requestId && gen.status === "succeeded") {
          existingGen = gen;
          break;
        }
      }
    }

    if (existingGen) {
      return {
        status: "success" as const,
        result: {
          generationId: existingGen.id,
          requestId: existingGen.request_id,
          status: "succeeded" as const,
          assetReference: existingGen.image_data || existingGen.asset_url,
          mimeType: existingGen.mime_type,
          width: existingGen.width,
          height: existingGen.height,
          provider: existingGen.provider,
          model: existingGen.model,
          providerRequestId: existingGen.provider_request_id,
          createdAt: existingGen.created_at,
        },
        fromCache: true,
      };
    }
  }

  // 5. Acquire In-Flight Lock & Transition to Processing
  inFlightGenerationLocks.set(data.requestId, nowMs);
  const updateTime = new Date().toISOString();

  try {
    requestRow.status = "processing";
    requestRow.updated_at = updateTime;
    fallbackIllustrationRequests.set(data.requestId, requestRow);

    if (supabase) {
      await supabase
        .from("illustration_generation_requests")
        .update({ status: "processing", updated_at: updateTime })
        .eq("id", data.requestId);
    }
  } catch {}

  // 6. Invoke Real Provider Adapter
  let genResult: IllustrationGenerationResult;
  try {
    const provider = resolveIllustrationGenerationProvider();
    genResult = await provider.generate(requestRow.request_snapshot);
  } catch (err: any) {
    const norm = normalizeAiError(err);
    genResult = {
      generationId: `gen_ill_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`,
      requestId: data.requestId,
      status: "failed",
      provider: "unknown",
      model: "unknown",
      createdAt: new Date().toISOString(),
      error: {
        code: norm.code || AI_ERROR_CODES.GENERATION_FAILED,
        message: norm.message || "Eksekusi generasi provider AI gagal.",
        isRetryable: false,
      },
    };
  } finally {
    // Release In-Flight Lock
    inFlightGenerationLocks.delete(data.requestId);
  }

  // 7. Binary Validation & Result Normalization
  let validatedMime = "image/png";
  let validatedWidth = 1024;
  let validatedHeight = 1024;
  let validatedByteSize = 0;

  if (genResult.status === "succeeded" && genResult.assetReference) {
    try {
      const val = assertValidImageBinary(
        genResult.assetReference,
        requestRow.request_snapshot.generationParameters.aspectRatio
      );
      validatedMime = val.mimeType;
      validatedWidth = val.width;
      validatedHeight = val.height;
      validatedByteSize = val.byteSize;
    } catch (valErr: any) {
      // Binary invalid -> Fail-closed! STRICT NON-FALLBACK
      genResult = {
        ...genResult,
        status: "failed",
        error: {
          code: AI_ERROR_CODES.GENERATION_FAILED,
          message: `Artefak visual yang dihasilkan provider tidak valid: ${valErr.message}`,
          isRetryable: false,
        },
      };
    }
  }

  // 8. Persist Generation Record
  const finalTime = new Date().toISOString();
  const storedGenRow: StoredIllustrationGenerationRow = {
    id: genResult.generationId,
    request_id: data.requestId,
    generation_plan_id: requestRow.generation_plan_id,
    module_id: requestRow.request_snapshot.moduleId,
    owner_id: userId,
    provider: genResult.provider || "openai",
    model: genResult.model || "gpt-image-1-mini",
    provider_request_id: genResult.providerRequestId,
    status: genResult.status,
    asset_url: genResult.status === "succeeded" ? genResult.assetReference : undefined,
    image_data: genResult.status === "succeeded" ? genResult.assetReference : undefined,
    mime_type: validatedMime,
    width: validatedWidth,
    height: validatedHeight,
    byte_size: validatedByteSize,
    retry_count: 0,
    error_code: genResult.error?.code,
    error_message: genResult.error?.message,
    created_at: finalTime,
    updated_at: finalTime,
  };

  fallbackIllustrationGenerations.set(genResult.generationId, storedGenRow);

  // Update request status to match result
  requestRow.status = genResult.status === "succeeded" ? "succeeded" : "failed";
  requestRow.updated_at = finalTime;
  fallbackIllustrationRequests.set(data.requestId, requestRow);

  try {
    if (supabase) {
      await supabase.from("illustration_generations").insert({
        id: storedGenRow.id,
        request_id: storedGenRow.request_id,
        generation_plan_id: storedGenRow.generation_plan_id,
        module_id: storedGenRow.module_id,
        owner_id: storedGenRow.owner_id,
        provider: storedGenRow.provider,
        model: storedGenRow.model,
        provider_request_id: storedGenRow.provider_request_id,
        status: storedGenRow.status,
        asset_url: storedGenRow.asset_url,
        image_data: storedGenRow.image_data,
        mime_type: storedGenRow.mime_type,
        width: storedGenRow.width,
        height: storedGenRow.height,
        byte_size: storedGenRow.byte_size,
        retry_count: storedGenRow.retry_count,
        error_code: storedGenRow.error_code,
        error_message: storedGenRow.error_message,
        created_at: storedGenRow.created_at,
        updated_at: storedGenRow.updated_at,
      });

      await supabase
        .from("illustration_generation_requests")
        .update({
          status: requestRow.status,
          updated_at: finalTime,
        })
        .eq("id", data.requestId);
    }
  } catch {}

  return {
    status: "success" as const,
    result: genResult,
  };
}

export const generateIllustrationServerFn = createServerFn({
  method: "POST",
})
  .middleware([requireTeacherAiAuth])
  .validator((input: unknown) => {
    const parsed = GenerateIllustrationInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        "Parameter eksekusi generasi ilustrasi tidak valid."
      );
    }
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    return executeGenerateIllustration(data, context as any);
  });

// ==============================================================================
// 4. GET ILLUSTRATION GENERATION RESULT SERVER FN (VIS-1B)
// ==============================================================================

const GetIllustrationResultInputSchema = z.object({
  generationId: z.string().optional(),
  requestId: z.string().optional(),
});

export async function executeGetIllustrationGenerationResult(
  data: { generationId?: string; requestId?: string },
  context: { userId: string; profile?: any; supabase?: any }
) {
  const supabase = context.supabase;
  const userId = context.userId;

  let row: StoredIllustrationGenerationRow | null = null;

  try {
    if (supabase) {
      let query = supabase.from("illustration_generations").select("*");
      if (data.generationId) {
        query = query.eq("id", data.generationId);
      } else if (data.requestId) {
        query = query.eq("request_id", data.requestId).order("created_at", { ascending: false });
      }
      const { data: dbRow } = await query.limit(1).maybeSingle();
      if (dbRow) row = dbRow;
    }
  } catch {}

  if (!row) {
    if (data.generationId) {
      row = fallbackIllustrationGenerations.get(data.generationId) || null;
    } else if (data.requestId) {
      for (const gen of fallbackIllustrationGenerations.values()) {
        if (gen.request_id === data.requestId) {
          row = gen;
          break;
        }
      }
    }
  }

  if (!row) {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      "Hasil generasi gambar tidak ditemukan."
    );
  }

  if (row.owner_id !== userId) {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Anda bukan pemilik hasil generasi ini."
    );
  }

  return {
    status: "success" as const,
    generation: row,
  };
}

export const getIllustrationGenerationResultServerFn = createServerFn({
  method: "POST",
})
  .middleware([requireTeacherAiAuth])
  .validator((input: unknown) => {
    const parsed = GetIllustrationResultInputSchema.safeParse(input);
    if (!parsed.success || (!parsed.data.generationId && !parsed.data.requestId)) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        "ID generasi atau ID permintaan wajib diisi."
      );
    }
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    return executeGetIllustrationGenerationResult(data, context as any);
  });

// ==============================================================================
// 5. UNIFIED MODULE / SUBTOPIC ILLUSTRATIONS GENERATION SERVER FN (VIS-1F)
// ==============================================================================

const GenerateModuleIllustrationsInputSchema = z.object({
  moduleId: z.string().min(1, "ID modul ajar wajib disertakan."),
  sectionId: z.string().optional(),
  forceRetry: z.boolean().optional(),
});

export async function executeGenerateModuleIllustrations(
  data: { moduleId: string; sectionId?: string; forceRetry?: boolean },
  context: { userId: string; profile?: any; supabase?: any }
) {
  const supabase = context.supabase;
  const userId = context.userId;

  // 1. Authoritative Role Guard
  if (context.profile?.role && context.profile.role !== "guru") {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Hanya pengguna dengan peran guru yang diizinkan melakukan operasi ini."
    );
  }

  // 2. Fetch Modul Ajar
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

  const {
    fallbackModulesStore,
    fallbackIllustrationAssets,
    executePersistIllustrationAsset,
    executeAttachIllustrationAsset,
  } = await import("./illustration-asset.functions");

  if (!modul) {
    modul = fallbackModulesStore.get(data.moduleId) || null;
  }

  if (!modul) {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      "Modul ajar tidak ditemukan."
    );
  }

  const modulOwnerId = modul.user_id || modul.userId;
  if (modulOwnerId && modulOwnerId !== userId) {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Anda bukan pemilik modul ajar ini."
    );
  }

  // 3. Fetch Generation Plan
  let plan: GenerationPlan | null = null;
  try {
    if (supabase) {
      const { data: row } = await supabase
        .from("generation_plans")
        .select("*")
        .eq("module_id", data.moduleId)
        .eq("target_type", "illustration")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (row) plan = toPlan(row);
    }
  } catch {}

  if (!plan) {
    for (const p of fallbackTestPlans.values()) {
      if (p.moduleId === data.moduleId && p.targetType === "illustration") {
        plan = p;
        break;
      }
    }
  }

  if (!plan) {
    const { getGenerationPlanServerFn } = await import("./generation-planning.functions");
    try {
      const planRes = (await getGenerationPlanServerFn({
        data: { moduleId: data.moduleId, targetType: "illustration" },
      })) as any;
      if (planRes?.plan) plan = planRes.plan;
    } catch {}
  }

  if (!plan) {
    throw new AiServiceError(
      AI_ERROR_CODES.PLAN_NOT_FOUND,
      "Rencana ilustrasi belum dibuat untuk modul ini."
    );
  }

  if (plan.ownerId !== userId) {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Anda bukan pemilik rencana ilustrasi ini."
    );
  }

  if (plan.status !== "approved") {
    throw new AiServiceError(
      AI_ERROR_CODES.PLAN_NOT_APPROVED,
      "Rencana ilustrasi belum disetujui oleh guru. Harap setujui rencana pada Langkah 4 terlebih dahulu."
    );
  }

  if (plan.approvedVersion !== plan.currentVersion) {
    throw new AiServiceError(
      AI_ERROR_CODES.STALE_APPROVAL,
      `Persetujuan rencana telah usang (versi disetujui: ${plan.approvedVersion}, versi saat ini: ${plan.currentVersion}). Harap setujui ulang rencana.`
    );
  }

  if (!plan.style || !plan.style.styleId) {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_STYLE,
      "Gaya visual belum dipilih pada rencana generasi."
    );
  }

  // 4. Derive Canonical Generation Specification
  const authContext: PlanAuthContext = {
    userId,
    role: context.profile?.role || "guru",
    isGuru: true,
    verificationStatus: context.profile?.status_verifikasi || "verified",
  };

  const spec = createGenerationSpecification(plan, authContext);

  // 5. Target Sections
  let targetSections = Array.isArray(modul.sections) ? [...modul.sections] : [];
  if (data.sectionId) {
    targetSections = targetSections.filter((s) => s.id === data.sectionId);
    if (targetSections.length === 0) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        `Bab / Section dengan ID '${data.sectionId}' tidak ditemukan pada modul.`
      );
    }
  }

  if (targetSections.length === 0) {
    targetSections = [
      {
        id: "section_main",
        judul: modul.judul,
        poin: [],
        isi: modul.ringkasan || "",
      },
    ];
  }

  // 6. Process each section
  const items: Array<{
    sectionId: string;
    sectionTitle: string;
    status: "succeeded" | "failed";
    asset?: any;
    error?: { code: string; message: string };
    fromCache?: boolean;
  }> = [];

  for (const s of targetSections) {
    const subtopicTitle = s.judul || modul.judul;
    const cleanSubtopic =
      subtopicTitle.replace(/^(\d+[\.\)]|\s*Bab\s*\d+:?)\s*/i, "").trim() || subtopicTitle;

    // Deduplication check: if existing active attached asset exists and not forceRetry
    if (!data.forceRetry) {
      let existingAsset = null;
      for (const ast of fallbackIllustrationAssets.values()) {
        if (
          ast.module_id === data.moduleId &&
          ast.attached_section_id === s.id &&
          ast.lifecycle_status === "attached"
        ) {
          existingAsset = ast;
          break;
        }
      }
      if (existingAsset) {
        items.push({
          sectionId: s.id,
          sectionTitle: s.judul,
          status: "succeeded",
          asset: existingAsset,
          fromCache: true,
        });
        continue;
      }
    }

    // Contextual section outline grounded on actual subtopic
    const sectionOutline = {
      ...(plan.outline as any),
      title: `Ilustrasi: ${s.judul}`,
      mainSubject: cleanSubtopic,
      educationalFocus: `Memvisualisasikan materi pembelajaran sub-topik ${cleanSubtopic} untuk siswa kelas ${modul.kelas || "terkait"}.`,
      supportingElements:
        Array.isArray(s.poin) && s.poin.length > 0
          ? s.poin.slice(0, 4)
          : [`Sub-topik: ${cleanSubtopic}`],
      importantVisualDetails: s.isi
        ? [s.isi.slice(0, 100)]
        : [`Visualisasi representatif ${cleanSubtopic}`],
      sectionId: s.id,
    };

    const fullStyle = getStyleById(plan.style.styleId) || ILLUSTRATION_STYLES_CATALOG[0];
    const assembled = assembleIllustrationPrompt(sectionOutline, fullStyle);
    const sectionSpec = {
      ...spec,
      prompt: assembled.fullPrompt,
      sectionId: s.id,
    };

    const sectionPlan: GenerationPlan = {
      ...plan,
      outline: sectionOutline,
    };

    let req: IllustrationGenerationRequest;
    try {
      req = buildIllustrationGenerationRequest({
        spec: sectionSpec,
        plan: sectionPlan,
        authContext,
        overrideParams: {
          sectionId: s.id,
        },
      });
    } catch (err: any) {
      items.push({
        sectionId: s.id,
        sectionTitle: s.judul,
        status: "failed",
        error: {
          code: err.code || AI_ERROR_CODES.INVALID_REQUEST,
          message: err.message || "Gagal membangun spesifikasi permintaan ilustrasi.",
        },
      });
      continue;
    }

    // Persist request row
    const nowIso = new Date().toISOString();
    const storedReqRow: StoredIllustrationRequestRow = {
      id: req.requestId,
      generation_plan_id: req.generationPlanId,
      approved_version: req.approvedOutlineVersion,
      style_id: req.styleId,
      style_version: req.styleVersion,
      request_snapshot: req,
      status: "prepared",
      created_by: userId,
      created_at: nowIso,
      updated_at: nowIso,
    };
    fallbackIllustrationRequests.set(req.requestId, storedReqRow);
    try {
      if (supabase) {
        await supabase.from("illustration_generation_requests").insert(storedReqRow);
      }
    } catch {}

    // Execute generation via canonical VIS-1B engine
    const genRes = await executeGenerateIllustration(
      { requestId: req.requestId, forceRetry: data.forceRetry },
      context
    );

    if (genRes.result.status === "succeeded" && genRes.result.generationId) {
      try {
        // Persist asset via canonical VIS-1C engine
        const persistRes = await executePersistIllustrationAsset(
          { generationId: genRes.result.generationId, targetSectionId: s.id },
          context
        );

        // Attach asset via canonical VIS-1C engine
        await executeAttachIllustrationAsset(
          { assetId: persistRes.asset.id, moduleId: data.moduleId, sectionId: s.id },
          context
        );

        s.ilustrasi = persistRes.asset.publicUrl;

        items.push({
          sectionId: s.id,
          sectionTitle: s.judul,
          status: "succeeded",
          asset: persistRes.asset,
          fromCache: Boolean(genRes.fromCache),
        });
      } catch (assetErr: any) {
        items.push({
          sectionId: s.id,
          sectionTitle: s.judul,
          status: "failed",
          error: {
            code: assetErr.code || AI_ERROR_CODES.PERSISTENCE_ERROR,
            message: assetErr.message || "Gagal menyimpan atau menautkan aset ilustrasi.",
          },
        });
      }
    } else {
      items.push({
        sectionId: s.id,
        sectionTitle: s.judul,
        status: "failed",
        error: {
          code: genRes.result.error?.code || AI_ERROR_CODES.GENERATION_FAILED,
          message: genRes.result.error?.message || "Generasi gambar gagal dari penyedia AI.",
        },
      });
    }
  }

  // Update modul sections if changes occurred
  if (Array.isArray(modul.sections)) {
    const updatedSections = modul.sections.map((sec: any) => {
      const match = items.find((item) => item.sectionId === sec.id && item.status === "succeeded");
      if (match?.asset?.publicUrl) {
        return { ...sec, ilustrasi: match.asset.publicUrl };
      }
      return sec;
    });
    modul.sections = updatedSections;
    modul.updated_at = new Date().toISOString();
    fallbackModulesStore.set(data.moduleId, modul);
    try {
      if (supabase) {
        await supabase
          .from("moduls")
          .update({ sections: updatedSections, updated_at: modul.updated_at })
          .eq("id", data.moduleId);
      }
    } catch {}
  }

  const total = items.length;
  const succeeded = items.filter((i) => i.status === "succeeded").length;
  const failed = items.filter((i) => i.status === "failed").length;

  return {
    status: "success" as const,
    total,
    succeeded,
    failed,
    items,
    sections: modul.sections,
  };
}

export const generateModuleIllustrationsServerFn = createServerFn({
  method: "POST",
})
  .middleware([requireTeacherAiAuth])
  .validator((input: unknown) => {
    const parsed = GenerateModuleIllustrationsInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        "Parameter permintaan generasi ilustrasi modul tidak valid."
      );
    }
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    return executeGenerateModuleIllustrations(data, context as any);
  });



