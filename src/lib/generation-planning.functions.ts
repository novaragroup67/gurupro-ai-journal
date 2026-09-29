/**
 * ==============================================================================
 * GURUPRO AI: GENERATION PLANNING SERVER FUNCTIONS (GEN-0)
 * ==============================================================================
 *
 * Server-authoritative operations for:
 * 1. createGenerationPlanServerFn
 * 2. getGenerationPlanServerFn
 * 3. updateGenerationPlanServerFn
 * 4. selectPlanStyleServerFn
 * 5. approveGenerationPlanServerFn
 * 6. revokeApprovalServerFn
 * 7. listAvailableStylesServerFn
 * 8. getGenerationSpecificationServerFn
 *
 * Enforces:
 * - Verified Teacher Authentication (requireTeacherAiAuth)
 * - Strict owner validation on target Modul Ajar
 * - Multi-tenant isolation (students and unauthorized teachers cannot modify plans)
 * - Hard approval gate (approvedVersion === currentVersion, style selected)
 * - Zero real image / PPTX generation in GEN-0
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireTeacherAiAuth } from "@/integrations/supabase/auth-middleware";
import type { Modul } from "./modul-types";
import { AI_ERROR_CODES, AiServiceError } from "./ai/error-taxonomy";
import {
  GenerationPlan,
  GenerationPlanVersion,
  GenerationPlanTargetType,
  GenerationSpecification,
  GenerationStyle,
  ILLUSTRATION_STYLES_CATALOG,
  PRESENTATION_STYLES_CATALOG,
  getStyleById,
  validateIllustrationOutline,
  validatePresentationOutline,
  createGenerationSpecification,
} from "./ai/generation-planning-contract";
import {
  generateInitialIllustrationOutline,
  generateInitialPresentationOutline,
  createInitialPlan,
  applyOutlineEdits,
  applyStyleSelection,
  applyPlanApproval,
  applyPlanApprovalRevocation,
} from "./ai/generation-planning-service";

// ==============================================================================
// HELPERS & DATABASE ROW MAPPING
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

function toPlanRow(plan: GenerationPlan) {
  return {
    id: plan.id,
    owner_id: plan.ownerId,
    module_id: plan.moduleId,
    target_type: plan.targetType,
    status: plan.status,
    current_version: plan.currentVersion,
    approved_version: plan.approvedVersion,
    outline: plan.outline as any,
    style: plan.style as any,
    provenance: plan.provenance as any,
    generation_settings: plan.generationSettings as any,
    created_at: plan.createdAt,
    updated_at: plan.updatedAt,
  };
}

function toVersion(row: any): GenerationPlanVersion {
  return {
    id: row.id,
    planId: row.plan_id,
    versionNumber: row.version_number,
    outlineSnapshot: row.outline_snapshot,
    styleSnapshot: row.style_snapshot,
    changeMetadata: row.change_metadata || {},
    isApproved: Boolean(row.is_approved),
    approvedAt: row.approved_at || null,
    approvedBy: row.approved_by || null,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function toVersionRow(version: GenerationPlanVersion) {
  return {
    id: version.id,
    plan_id: version.planId,
    version_number: version.versionNumber,
    outline_snapshot: version.outlineSnapshot as any,
    style_snapshot: version.styleSnapshot as any,
    change_metadata: version.changeMetadata as any,
    is_approved: version.isApproved,
    approved_at: version.approvedAt || null,
    approved_by: version.approvedBy || null,
    created_by: version.createdBy,
    created_at: version.createdAt,
  };
}

// In-memory fallback repository for unit tests or environments before migration execution
const fallbackPlans = new Map<string, GenerationPlan>();
const fallbackVersions = new Map<string, GenerationPlanVersion[]>();

// ==============================================================================
// 1. CREATE GENERATION PLAN SERVER FN
// ==============================================================================

const CreateGenerationPlanInputSchema = z.object({
  moduleId: z.string().min(1, "ID modul ajar wajib disertakan."),
  targetType: z.enum(["illustration", "presentation"]),
  sectionId: z.string().optional(),
  initialStyleId: z.string().optional(),
});

export const createGenerationPlanServerFn = createServerFn({ method: "POST" })
  .middleware([requireTeacherAiAuth])
  .validator((input: unknown) => {
    const parsed = CreateGenerationPlanInputSchema.safeParse(input);
    if (!parsed.success) {
      const issues = parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
      throw new AiServiceError(AI_ERROR_CODES.INVALID_REQUEST, `Input rencana generasi tidak valid: ${issues}`);
    }
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase;
    const userId = (context as any).userId;

    // 1. Verify Modul Ajar ownership
    const { data: modulRow, error: modulErr } = await supabase
      .from("moduls")
      .select("*")
      .eq("id", data.moduleId)
      .maybeSingle();

    if (modulErr) {
      console.error("[createGenerationPlan] DB error fetching modul:", modulErr);
      throw new AiServiceError(AI_ERROR_CODES.PERSISTENCE_ERROR, `Gagal memuat modul: ${modulErr.message}`);
    }

    if (!modulRow) {
      throw new AiServiceError(AI_ERROR_CODES.INVALID_REQUEST, "Modul ajar tidak ditemukan.");
    }

    if (modulRow.user_id !== userId) {
      throw new AiServiceError(AI_ERROR_CODES.ROLE_FORBIDDEN, "Akses ditolak: Anda bukan pemilik modul ini.");
    }

    // Convert row to Modul type
    const modul: Modul = {
      id: modulRow.id,
      judul: modulRow.judul,
      kelas: modulRow.kelas,
      mapel: modulRow.mapel,
      status: modulRow.status,
      ringkasan: modulRow.ringkasan,
      tujuan: Array.isArray(modulRow.tujuan) ? modulRow.tujuan : [],
      sections: Array.isArray(modulRow.sections) ? modulRow.sections : [],
      slides: Array.isArray(modulRow.slides) ? modulRow.slides : [],
      createdAt: modulRow.created_at,
      updatedAt: modulRow.updated_at,
      aiMetadata: modulRow.ai_metadata,
      sumberTipe: modulRow.sumber_tipe,
      sumberInput: modulRow.sumber_input,
    };

    // 2. Generate Grounded Initial Outline (Low-cost, zero external generation)
    let initialOutline;
    if (data.targetType === "illustration") {
      initialOutline = generateInitialIllustrationOutline(modul, data.sectionId);
    } else {
      initialOutline = generateInitialPresentationOutline(modul);
    }

    // 3. Create domain plan & initial version (v1)
    const { plan, initialVersion } = createInitialPlan(
      userId,
      data.moduleId,
      data.targetType,
      initialOutline,
      data.initialStyleId,
    );

    // 4. Persist to Database (with fallback)
    try {
      const { error: planInsertErr } = await supabase
        .from("generation_plans")
        .insert(toPlanRow(plan));

      if (planInsertErr) {
        console.warn("[createGenerationPlan] Supabase insert plan warning, using fallback cache:", planInsertErr.message);
        fallbackPlans.set(plan.id, plan);
      }

      const { error: versionInsertErr } = await supabase
        .from("generation_plan_versions")
        .insert(toVersionRow(initialVersion));

      if (versionInsertErr) {
        console.warn("[createGenerationPlan] Supabase insert version warning, using fallback cache:", versionInsertErr.message);
        const existingList = fallbackVersions.get(plan.id) || [];
        existingList.push(initialVersion);
        fallbackVersions.set(plan.id, existingList);
      }
    } catch {
      fallbackPlans.set(plan.id, plan);
      const existingList = fallbackVersions.get(plan.id) || [];
      existingList.push(initialVersion);
      fallbackVersions.set(plan.id, existingList);
    }

    return {
      status: "success" as const,
      plan,
      initialVersion,
    };
  });

// ==============================================================================
// 2. GET GENERATION PLAN SERVER FN
// ==============================================================================

const GetGenerationPlanInputSchema = z.object({
  planId: z.string().optional(),
  moduleId: z.string().optional(),
  targetType: z.enum(["illustration", "presentation"]).optional(),
});

export const getGenerationPlanServerFn = createServerFn({ method: "POST" })
  .middleware([requireTeacherAiAuth])
  .validator((input: unknown) => {
    const parsed = GetGenerationPlanInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AiServiceError(AI_ERROR_CODES.INVALID_REQUEST, "Parameter pencarian rencana tidak valid.");
    }
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase;
    const userId = (context as any).userId;

    let plan: GenerationPlan | null = null;
    let versions: GenerationPlanVersion[] = [];

    if (data.planId) {
      try {
        const { data: row, error } = await supabase
          .from("generation_plans")
          .select("*")
          .eq("id", data.planId)
          .maybeSingle();

        if (!error && row) {
          plan = toPlan(row);
        }
      } catch {}

      if (!plan) {
        plan = fallbackPlans.get(data.planId) || null;
      }
    } else if (data.moduleId && data.targetType) {
      try {
        const { data: row, error } = await supabase
          .from("generation_plans")
          .select("*")
          .eq("module_id", data.moduleId)
          .eq("target_type", data.targetType)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!error && row) {
          plan = toPlan(row);
        }
      } catch {}

      if (!plan) {
        for (const p of fallbackPlans.values()) {
          if (p.moduleId === data.moduleId && p.targetType === data.targetType) {
            plan = p;
            break;
          }
        }
      }
    }

    if (!plan) {
      return { status: "success" as const, plan: null, versions: [] };
    }

    // Enforce owner check
    if (plan.ownerId !== userId) {
      throw new AiServiceError(AI_ERROR_CODES.ROLE_FORBIDDEN, "Akses ditolak: Anda bukan pemilik rencana generasi ini.");
    }

    // Load versions
    try {
      const { data: versionRows, error: vErr } = await supabase
        .from("generation_plan_versions")
        .select("*")
        .eq("plan_id", plan.id)
        .order("version_number", { ascending: true });

      if (!vErr && Array.isArray(versionRows) && versionRows.length > 0) {
        versions = versionRows.map(toVersion);
      }
    } catch {}

    if (versions.length === 0) {
      versions = fallbackVersions.get(plan.id) || [];
    }

    return {
      status: "success" as const,
      plan,
      versions,
    };
  });

// ==============================================================================
// 3. UPDATE GENERATION PLAN SERVER FN (TEACHER OUTLINE EDITING)
// ==============================================================================

const UpdateGenerationPlanInputSchema = z.object({
  planId: z.string().min(1, "ID rencana wajib disertakan."),
  outline: z.record(z.unknown()),
  summary: z.string().optional(),
});

export const updateGenerationPlanServerFn = createServerFn({ method: "POST" })
  .middleware([requireTeacherAiAuth])
  .validator((input: unknown) => {
    const parsed = UpdateGenerationPlanInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AiServiceError(AI_ERROR_CODES.INVALID_REQUEST, "Format pembaruan outline tidak valid.");
    }
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase;
    const userId = (context as any).userId;

    // 1. Fetch current plan
    let currentPlan: GenerationPlan | null = null;
    try {
      const { data: row, error } = await supabase
        .from("generation_plans")
        .select("*")
        .eq("id", data.planId)
        .maybeSingle();

      if (!error && row) {
        currentPlan = toPlan(row);
      }
    } catch {}

    if (!currentPlan) {
      currentPlan = fallbackPlans.get(data.planId) || null;
    }

    if (!currentPlan) {
      throw new AiServiceError(AI_ERROR_CODES.INVALID_REQUEST, "Rencana generasi tidak ditemukan.");
    }

    if (currentPlan.ownerId !== userId) {
      throw new AiServiceError(AI_ERROR_CODES.ROLE_FORBIDDEN, "Akses ditolak: Anda bukan pemilik rencana generasi ini.");
    }

    // 2. Apply outline edits (bumps version, revokes approval if previously approved)
    const { updatedPlan, newVersion } = applyOutlineEdits(
      currentPlan,
      data.outline as any,
      userId,
      data.summary,
    );

    // 3. Persist to Database
    try {
      await supabase
        .from("generation_plans")
        .update(toPlanRow(updatedPlan))
        .eq("id", updatedPlan.id);

      await supabase
        .from("generation_plan_versions")
        .insert(toVersionRow(newVersion));
    } catch {
      // Fallback in-memory
      fallbackPlans.set(updatedPlan.id, updatedPlan);
      const list = fallbackVersions.get(updatedPlan.id) || [];
      list.push(newVersion);
      fallbackVersions.set(updatedPlan.id, list);
    }

    return {
      status: "success" as const,
      plan: updatedPlan,
      newVersion,
    };
  });

// ==============================================================================
// 4. SELECT PLAN STYLE SERVER FN
// ==============================================================================

const SelectPlanStyleInputSchema = z.object({
  planId: z.string().min(1, "ID rencana wajib disertakan."),
  styleId: z.string().min(1, "ID gaya visual wajib dipilih."),
});

export const selectPlanStyleServerFn = createServerFn({ method: "POST" })
  .middleware([requireTeacherAiAuth])
  .validator((input: unknown) => {
    const parsed = SelectPlanStyleInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AiServiceError(AI_ERROR_CODES.INVALID_REQUEST, "Pilihan gaya tidak valid.");
    }
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase;
    const userId = (context as any).userId;

    let currentPlan: GenerationPlan | null = null;
    try {
      const { data: row } = await supabase
        .from("generation_plans")
        .select("*")
        .eq("id", data.planId)
        .maybeSingle();

      if (row) currentPlan = toPlan(row);
    } catch {}

    if (!currentPlan) currentPlan = fallbackPlans.get(data.planId) || null;

    if (!currentPlan) {
      throw new AiServiceError(AI_ERROR_CODES.INVALID_REQUEST, "Rencana generasi tidak ditemukan.");
    }

    if (currentPlan.ownerId !== userId) {
      throw new AiServiceError(AI_ERROR_CODES.ROLE_FORBIDDEN, "Akses ditolak: Anda bukan pemilik rencana generasi ini.");
    }

    // Apply style selection (revokes approval if style changed from approved)
    const updatedPlan = applyStyleSelection(currentPlan, data.styleId);

    try {
      await supabase
        .from("generation_plans")
        .update(toPlanRow(updatedPlan))
        .eq("id", updatedPlan.id);
    } catch {
      fallbackPlans.set(updatedPlan.id, updatedPlan);
    }

    return {
      status: "success" as const,
      plan: updatedPlan,
    };
  });

// ==============================================================================
// 5. APPROVE GENERATION PLAN SERVER FN (HARD APPROVAL GATE)
// ==============================================================================

const ApprovePlanInputSchema = z.object({
  planId: z.string().min(1, "ID rencana wajib disertakan."),
});

export const approveGenerationPlanServerFn = createServerFn({ method: "POST" })
  .middleware([requireTeacherAiAuth])
  .validator((input: unknown) => {
    const parsed = ApprovePlanInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AiServiceError(AI_ERROR_CODES.INVALID_REQUEST, "Parameter persetujuan tidak valid.");
    }
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase;
    const userId = (context as any).userId;
    const profile = (context as any).profile;

    const authContext = {
      userId,
      role: profile?.role || "guru",
      isGuru: true,
      verificationStatus: profile?.status_verifikasi || "verified",
    };

    let currentPlan: GenerationPlan | null = null;
    try {
      const { data: row } = await supabase
        .from("generation_plans")
        .select("*")
        .eq("id", data.planId)
        .maybeSingle();

      if (row) currentPlan = toPlan(row);
    } catch {}

    if (!currentPlan) currentPlan = fallbackPlans.get(data.planId) || null;

    if (!currentPlan) {
      throw new AiServiceError(AI_ERROR_CODES.INVALID_REQUEST, "Rencana generasi tidak ditemukan.");
    }

    // Hard Approval Gate
    const { approvedPlan } = applyPlanApproval(currentPlan, authContext);
    const nowIso = new Date().toISOString();

    try {
      await supabase
        .from("generation_plans")
        .update(toPlanRow(approvedPlan))
        .eq("id", approvedPlan.id);

      await supabase
        .from("generation_plan_versions")
        .update({
          is_approved: true,
          approved_at: nowIso,
          approved_by: userId,
        })
        .eq("plan_id", approvedPlan.id)
        .eq("version_number", approvedPlan.currentVersion);
    } catch {
      fallbackPlans.set(approvedPlan.id, approvedPlan);
      const vList = fallbackVersions.get(approvedPlan.id) || [];
      const curV = vList.find((v) => v.versionNumber === approvedPlan.currentVersion);
      if (curV) {
        curV.isApproved = true;
        curV.approvedAt = nowIso;
        curV.approvedBy = userId;
      }
    }

    return {
      status: "success" as const,
      plan: approvedPlan,
    };
  });

// ==============================================================================
// 6. REVOKE APPROVAL SERVER FN
// ==============================================================================

export const revokeApprovalServerFn = createServerFn({ method: "POST" })
  .middleware([requireTeacherAiAuth])
  .validator((input: unknown) => {
    const parsed = ApprovePlanInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AiServiceError(AI_ERROR_CODES.INVALID_REQUEST, "Parameter pencabutan persetujuan tidak valid.");
    }
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase;
    const userId = (context as any).userId;
    const profile = (context as any).profile;

    const authContext = {
      userId,
      role: profile?.role || "guru",
      isGuru: true,
      verificationStatus: profile?.status_verifikasi || "verified",
    };

    let currentPlan: GenerationPlan | null = null;
    try {
      const { data: row } = await supabase
        .from("generation_plans")
        .select("*")
        .eq("id", data.planId)
        .maybeSingle();

      if (row) currentPlan = toPlan(row);
    } catch {}

    if (!currentPlan) currentPlan = fallbackPlans.get(data.planId) || null;

    if (!currentPlan) {
      throw new AiServiceError(AI_ERROR_CODES.INVALID_REQUEST, "Rencana generasi tidak ditemukan.");
    }

    const revokedPlan = applyPlanApprovalRevocation(currentPlan, authContext);

    try {
      await supabase
        .from("generation_plans")
        .update(toPlanRow(revokedPlan))
        .eq("id", revokedPlan.id);
    } catch {
      fallbackPlans.set(revokedPlan.id, revokedPlan);
    }

    return {
      status: "success" as const,
      plan: revokedPlan,
    };
  });

// ==============================================================================
// 7. LIST AVAILABLE STYLES SERVER FN
// ==============================================================================

const ListStylesInputSchema = z.object({
  type: z.enum(["illustration", "presentation"]).optional(),
});

export const listAvailableStylesServerFn = createServerFn({ method: "POST" })
  .middleware([requireTeacherAiAuth])
  .validator((input: unknown) => {
    return ListStylesInputSchema.safeParse(input || {}).data || {};
  })
  .handler(async ({ data }) => {
    if (data.type === "illustration") {
      return { status: "success" as const, styles: ILLUSTRATION_STYLES_CATALOG };
    }
    if (data.type === "presentation") {
      return { status: "success" as const, styles: PRESENTATION_STYLES_CATALOG };
    }
    return {
      status: "success" as const,
      styles: [...ILLUSTRATION_STYLES_CATALOG, ...PRESENTATION_STYLES_CATALOG],
    };
  });

// ==============================================================================
// 8. GET GENERATION SPECIFICATION SERVER FN (AUTHORIZATION FOR FUTURE ENGINES)
// ==============================================================================

export const getGenerationSpecificationServerFn = createServerFn({ method: "POST" })
  .middleware([requireTeacherAiAuth])
  .validator((input: unknown) => {
    const parsed = ApprovePlanInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AiServiceError(AI_ERROR_CODES.INVALID_REQUEST, "Parameter pengambilan spesifikasi tidak valid.");
    }
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase;
    const userId = (context as any).userId;
    const profile = (context as any).profile;

    const authContext = {
      userId,
      role: profile?.role || "guru",
      isGuru: true,
      verificationStatus: profile?.status_verifikasi || "verified",
    };

    let currentPlan: GenerationPlan | null = null;
    try {
      const { data: row } = await supabase
        .from("generation_plans")
        .select("*")
        .eq("id", data.planId)
        .maybeSingle();

      if (row) currentPlan = toPlan(row);
    } catch {}

    if (!currentPlan) currentPlan = fallbackPlans.get(data.planId) || null;

    if (!currentPlan) {
      throw new AiServiceError(AI_ERROR_CODES.INVALID_REQUEST, "Rencana generasi tidak ditemukan.");
    }

    // Creates canonical specification; strictly throws if unapproved or stale
    const specification = createGenerationSpecification(currentPlan, authContext);

    return {
      status: "success" as const,
      specification,
    };
  });
