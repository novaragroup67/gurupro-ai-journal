/**
 * ==============================================================================
 * GURUPRO AI: PRESENTATION QUALITY GATE SERVER FUNCTIONS (PPT-1F)
 * ==============================================================================
 *
 * Server-authoritative operations for:
 * 1. evaluatePresentationQualityServerFn
 * 2. getPresentationQualityEvaluationServerFn
 * 3. listPresentationQualityEvaluationsServerFn
 * 4. downloadPresentationPptxServerFn
 *
 * Enforces:
 * - Strict Teacher Authentication (requireTeacherAiAuth)
 * - Multi-tenant isolation and ownership checks
 * - In-flight concurrency lock & idempotent repeat request handling
 * - Strict sovereign human authority gatekeeper (teacher approval required to pass)
 * - Secure download gatekeeper (only passes quality gate + approved artifacts downloadable)
 * - Non-destructive rejection semantics (never auto-deletes or regenerates)
 * - Zero AI model generation calls during quality evaluations
 */

import { createServerFn } from "@tanstack/react-start";
import { requireTeacherAiAuth } from "@/integrations/supabase/auth-middleware";
import { AI_ERROR_CODES, AiServiceError } from "./ai/error-taxonomy";
import {
  type PresentationQualityEvaluation,
  type PresentationQualityStatus,
  type PresentationQualityDecision,
  EvaluatePresentationQualityInputSchema,
  GetPresentationQualityEvaluationInputSchema,
  ListPresentationQualityEvaluationsInputSchema,
  DownloadPresentationPptxInputSchema,
} from "./ai/presentation-quality-contract";
import {
  evaluatePresentationQuality,
  computeBytesSha256,
} from "./ai/presentation-quality-evaluator";
import {
  fallbackPresentationArtifacts,
  type StoredPresentationArtifactRow,
} from "./presentation-artifact.functions";
import {
  fallbackPresentationResults,
  type StoredPresentationResultRow,
} from "./presentation-generation.functions";
import {
  fallbackPresentationReviews,
  type StoredPresentationReviewRow,
} from "./presentation-review.functions";
import {
  resolvePresentationStorageDriver,
  PresentationArtifactStorageDriver,
} from "./ai/presentation-artifact-storage";
import {
  resolvePresentationIllustrations,
  type ResolvedSlideIllustration,
} from "./ai/presentation-illustration-resolver";
import type { IllustrationStorageDriver } from "./ai/illustration-storage-service";
import { trackProductEvent } from "@/lib/analytics/product-events";

// ==============================================================================
// 1. DATA STORAGE & ROW INTERFACES
// ==============================================================================

export interface StoredPresentationQualityEvaluationRow {
  id: string;
  artifact_id: string;
  content_result_id: string;
  generation_plan_id: string;
  module_id: string;
  artifact_hash: string;
  presentation_version: number;
  approved_version: number;
  evaluator_version: string;
  status: PresentationQualityStatus;
  decision: PresentationQualityDecision;
  structural_checks: any;
  content_checks: any;
  illustration_checks: any;
  version_checks?: any;
  visual_checks: any;
  ai_evaluation?: any;
  findings: any[];
  evaluated_by: string;
  evaluated_at: string;
  created_at: string;
  updated_at: string;
}

// In-memory fallback repository for unit tests & offline resilience
export const fallbackPresentationQualityEvaluations = new Map<
  string,
  StoredPresentationQualityEvaluationRow
>();

// In-flight concurrency lock
export const inFlightQualityEvaluationLocks = new Set<string>();

// Mock binary cache for test scenarios where artifact binary was stored in memory
export const mockArtifactBinaries = new Map<string, Uint8Array>();

function toQualityEvaluation(
  row: StoredPresentationQualityEvaluationRow
): PresentationQualityEvaluation {
  return {
    id: row.id,
    artifactId: row.artifact_id,
    contentResultId: row.content_result_id,
    generationPlanId: row.generation_plan_id,
    moduleId: row.module_id,
    artifactHash: row.artifact_hash,
    presentationVersion: row.presentation_version,
    approvedVersion: row.approved_version,
    evaluatorVersion: row.evaluator_version,
    status: row.status,
    decision: row.decision,
    structuralChecks: row.structural_checks,
    contentChecks: row.content_checks,
    illustrationChecks: row.illustration_checks,
    versionChecks: row.version_checks || {
      planId: row.generation_plan_id,
      contentResultId: row.content_result_id,
      artifactId: row.artifact_id,
      artifactHash: row.artifact_hash,
      artifactHashMatches: true,
      presentationVersion: row.presentation_version,
      approvedVersion: row.approved_version,
      versionsMatch: row.presentation_version === row.approved_version,
      teacherApprovalActive: row.status === "passed",
      teacherApprovalStatus: row.status === "passed" ? "approved" : "unapproved",
      passed: row.status === "passed",
    },
    visualChecks: row.visual_checks,
    aiEvaluation: row.ai_evaluation || null,
    findings: row.findings || [],
    evaluatedBy: row.evaluated_by,
    evaluatedAt: row.evaluated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ==============================================================================
// 2. HELPER RESOLVERS
// ==============================================================================

async function resolveArtifactRow(
  artifactId: string,
  supabase?: any
): Promise<StoredPresentationArtifactRow | null> {
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from("presentation_artifacts")
        .select("*")
        .eq("id", artifactId)
        .maybeSingle();

      if (!error && data) return data;
    }
  } catch {}
  return fallbackPresentationArtifacts.get(artifactId) || null;
}

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

async function resolveReviewRow(
  contentResultId: string,
  supabase?: any
): Promise<StoredPresentationReviewRow | null> {
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from("presentation_reviews")
        .select("*")
        .eq("content_result_id", contentResultId)
        .maybeSingle();

      if (!error && data) return data;
    }
  } catch {}

  for (const r of fallbackPresentationReviews.values()) {
    if (r.content_result_id === contentResultId) {
      return r;
    }
  }
  return null;
}

async function resolveExistingEvaluation(
  artifactId: string,
  artifactHash: string,
  approvedVersion: number,
  supabase?: any
): Promise<StoredPresentationQualityEvaluationRow | null> {
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from("presentation_quality_evaluations")
        .select("*")
        .eq("artifact_id", artifactId)
        .eq("artifact_hash", artifactHash)
        .eq("approved_version", approvedVersion)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) return data;
    }
  } catch {}

  for (const row of fallbackPresentationQualityEvaluations.values()) {
    if (
      row.artifact_id === artifactId &&
      row.artifact_hash === artifactHash &&
      row.approved_version === approvedVersion
    ) {
      return row;
    }
  }
  return null;
}

// ==============================================================================
// 3. EXECUTE: EVALUATE PRESENTATION QUALITY
// ==============================================================================

export async function executeEvaluatePresentationQuality(
  data: {
    artifactId: string;
    forceReevaluate?: boolean;
    storageDriver?: PresentationArtifactStorageDriver;
    illustrationStorageDriver?: IllustrationStorageDriver;
    mockBytes?: Uint8Array;
    resolvedIllustrations?: Map<string, ResolvedSlideIllustration>;
    enableAiAdvisory?: boolean;
  },
  context: {
    userId: string;
    role?: string;
    profile?: any;
    supabase?: any;
  }
): Promise<{ status: "success"; evaluation: PresentationQualityEvaluation }> {
  const { artifactId, forceReevaluate } = data;
  const { userId, role, supabase } = context;

  // 1. Role Guard: Teacher Only
  if (!userId) {
    throw new AiServiceError(
      AI_ERROR_CODES.AUTH_ERROR,
      "Akses ditolak: Pengguna belum terautentikasi."
    );
  }
  const effectiveRole = role || context.profile?.role;
  if (effectiveRole && effectiveRole !== "guru") {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Operasi validasi mutu presentasi hanya diizinkan untuk peran Guru."
    );
  }

  // 2. In-flight Concurrency Lock
  const lockKey = `eval_${artifactId}`;
  if (inFlightQualityEvaluationLocks.has(lockKey)) {
    throw new AiServiceError(
      AI_ERROR_CODES.AI_RATE_LIMIT,
      "Evaluasi mutu untuk artefak presentasi ini sedang berjalan. Harap tunggu beberapa saat."
    );
  }
  inFlightQualityEvaluationLocks.add(lockKey);

  try {
    // 3. Resolve Artifact Row
    const artifactRow = await resolveArtifactRow(artifactId, supabase);
    if (!artifactRow) {
      throw new AiServiceError(
        AI_ERROR_CODES.PPTX_ARTIFACT_NOT_FOUND,
        `Artefak presentasi dengan ID '${artifactId}' tidak ditemukan.`
      );
    }

    // Tenant / Ownership Guard
    if (artifactRow.owner_id !== userId) {
      throw new AiServiceError(
        AI_ERROR_CODES.ROLE_FORBIDDEN,
        "Akses ditolak: Anda tidak memiliki akses ke artefak guru lain."
      );
    }

    // 4. Resolve Content Result & Review
    const resultRow = await resolveResultRow(artifactRow.content_result_id, supabase);
    if (!resultRow) {
      throw new AiServiceError(
        AI_ERROR_CODES.PPTX_INVALID_CONTENT,
        `Data konten presentasi '${artifactRow.content_result_id}' tidak ditemukan.`
      );
    }

    const reviewRow = await resolveReviewRow(artifactRow.content_result_id, supabase);

    // 5. Caching / Idempotency Check
    if (!forceReevaluate) {
      const existing = await resolveExistingEvaluation(
        artifactId,
        artifactRow.file_hash,
        reviewRow?.approved_version || artifactRow.outline_version,
        supabase
      );
      if (existing && existing.status === "passed") {
        return {
          status: "success",
          evaluation: toQualityEvaluation(existing),
        };
      }
    }

    // 6. Download / Retrieve Artifact Binary
    let artifactBytes = data.mockBytes || mockArtifactBinaries.get(artifactId);
    if (!artifactBytes) {
      const storageDriver =
        data.storageDriver || resolvePresentationStorageDriver(artifactRow.storage_provider);
      try {
        artifactBytes = await storageDriver.download(artifactRow.storage_reference);
      } catch (err: any) {
        // Fallback to empty mock buffer if storage unavailable, allowing evaluator to detect
        artifactBytes = new Uint8Array(0);
      }
    }

    // 7. Resolve Illustrations (if referenced)
    let resolvedIllustrations = data.resolvedIllustrations;
    if (
      !resolvedIllustrations &&
      resultRow.content_package.slides.some((s: any) => Boolean(s.illustrationReference))
    ) {
      try {
        const resolved = await resolvePresentationIllustrations(
          resultRow.content_package.slides,
          userId,
          supabase,
          data.illustrationStorageDriver
        );
        resolvedIllustrations = resolved.resolvedIllustrations;
      } catch {
        resolvedIllustrations = undefined;
      }
    }

    // 8. Run Multi-Tier Evaluator
    const evaluation = await evaluatePresentationQuality({
      artifactId: artifactRow.id,
      artifactBytes,
      storedFileHash: artifactRow.file_hash,
      outlineVersion: artifactRow.outline_version,
      contentPackage: resultRow.content_package,
      contentResultId: resultRow.id,
      generationPlanId: artifactRow.generation_plan_id,
      moduleId: artifactRow.module_id,
      teacherReview: reviewRow
        ? {
            reviewStatus: reviewRow.review_status,
            approvedVersion: reviewRow.approved_version,
            reviewedBy: reviewRow.reviewed_by,
          }
        : null,
      resolvedIllustrations,
      userId,
      enableAiAdvisory: data.enableAiAdvisory !== undefined ? data.enableAiAdvisory : true,
    });

    // 9. Supersede older evaluations if this one passed
    const nowIso = new Date().toISOString();
    if (evaluation.status === "passed") {
      if (supabase) {
        try {
          await supabase
            .from("presentation_quality_evaluations")
            .update({ status: "superseded", updated_at: nowIso })
            .eq("generation_plan_id", artifactRow.generation_plan_id)
            .neq("id", evaluation.id)
            .eq("status", "passed");
        } catch {}
      }
      for (const row of fallbackPresentationQualityEvaluations.values()) {
        if (
          row.generation_plan_id === artifactRow.generation_plan_id &&
          row.id !== evaluation.id &&
          row.status === "passed"
        ) {
          row.status = "superseded";
          row.updated_at = nowIso;
        }
      }
    }

    // 10. Persist Evaluation Row
    const evaluationRow: StoredPresentationQualityEvaluationRow = {
      id: evaluation.id,
      artifact_id: evaluation.artifactId,
      content_result_id: evaluation.contentResultId,
      generation_plan_id: evaluation.generationPlanId,
      module_id: evaluation.moduleId,
      artifact_hash: evaluation.artifactHash,
      presentation_version: evaluation.presentationVersion,
      approved_version: evaluation.approvedVersion,
      evaluator_version: evaluation.evaluatorVersion,
      status: evaluation.status,
      decision: evaluation.decision,
      structural_checks: evaluation.structuralChecks,
      content_checks: evaluation.contentChecks,
      illustration_checks: evaluation.illustrationChecks,
      version_checks: evaluation.versionChecks,
      visual_checks: evaluation.visualChecks,
      ai_evaluation: evaluation.aiEvaluation,
      findings: evaluation.findings,
      evaluated_by: userId,
      evaluated_at: evaluation.evaluatedAt,
      created_at: evaluation.createdAt,
      updated_at: evaluation.updatedAt,
    };

    if (supabase) {
      try {
        await supabase
          .from("presentation_quality_evaluations")
          .insert(evaluationRow);
      } catch {}
    }

    fallbackPresentationQualityEvaluations.set(evaluation.id, evaluationRow);

    if (evaluation.status === "passed" && evaluation.decision === "PASS") {
      void trackProductEvent("PRESENTATION_QUALITY_PASSED", "presentation", {
        userId,
        role: "guru",
        metadata: {
          artifactId,
          overallScore: evaluation.overallScore,
        },
      });
    }

    return {
      status: "success",
      evaluation,
    };
  } finally {
    inFlightQualityEvaluationLocks.delete(lockKey);
  }
}

// ==============================================================================
// 4. EXECUTE: GET PRESENTATION QUALITY EVALUATION
// ==============================================================================

export async function executeGetPresentationQualityEvaluation(
  data: { artifactId: string },
  context: {
    userId: string;
    role?: string;
    profile?: any;
    supabase?: any;
  }
): Promise<{ status: "success"; evaluation: PresentationQualityEvaluation | null }> {
  const { artifactId } = data;
  const { userId, role, supabase } = context;

  if (!userId) {
    throw new AiServiceError(
      AI_ERROR_CODES.AUTH_ERROR,
      "Akses ditolak: Pengguna belum terautentikasi."
    );
  }
  const effectiveRole = role || context.profile?.role;
  if (effectiveRole && effectiveRole !== "guru") {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Operasi ini hanya diizinkan untuk peran Guru."
    );
  }

  // Check Supabase
  if (supabase) {
    try {
      const { data: dbData, error } = await supabase
        .from("presentation_quality_evaluations")
        .select("*")
        .eq("artifact_id", artifactId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && dbData) {
        if (dbData.evaluated_by !== userId) {
          throw new AiServiceError(
            AI_ERROR_CODES.ROLE_FORBIDDEN,
            "Akses ditolak: Anda tidak memiliki akses ke evaluasi mutu guru lain."
          );
        }
        return { status: "success", evaluation: toQualityEvaluation(dbData) };
      }
    } catch (err: any) {
      if (err instanceof AiServiceError) throw err;
    }
  }

  // Fallback map
  let latestRow: StoredPresentationQualityEvaluationRow | null = null;
  for (const row of fallbackPresentationQualityEvaluations.values()) {
    if (row.artifact_id === artifactId) {
      if (!latestRow || row.created_at > latestRow.created_at) {
        latestRow = row;
      }
    }
  }

  if (latestRow) {
    if (latestRow.evaluated_by !== userId) {
      throw new AiServiceError(
        AI_ERROR_CODES.ROLE_FORBIDDEN,
        "Akses ditolak: Anda tidak memiliki akses ke evaluasi mutu guru lain."
      );
    }
    return { status: "success", evaluation: toQualityEvaluation(latestRow) };
  }

  return { status: "success", evaluation: null };
}

// ==============================================================================
// 5. EXECUTE: LIST PRESENTATION QUALITY EVALUATIONS
// ==============================================================================

export async function executeListPresentationQualityEvaluations(
  data: { moduleId?: string; generationPlanId?: string },
  context: {
    userId: string;
    role?: string;
    profile?: any;
    supabase?: any;
  }
): Promise<{ status: "success"; evaluations: PresentationQualityEvaluation[] }> {
  const { moduleId, generationPlanId } = data;
  const { userId, role, supabase } = context;

  if (!userId) {
    throw new AiServiceError(
      AI_ERROR_CODES.AUTH_ERROR,
      "Akses ditolak: Pengguna belum terautentikasi."
    );
  }
  const effectiveRole = role || context.profile?.role;
  if (effectiveRole && effectiveRole !== "guru") {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Operasi ini hanya diizinkan untuk peran Guru."
    );
  }

  const results: PresentationQualityEvaluation[] = [];

  if (supabase) {
    try {
      let query = supabase
        .from("presentation_quality_evaluations")
        .select("*")
        .eq("evaluated_by", userId);

      if (moduleId) query = query.eq("module_id", moduleId);
      if (generationPlanId) query = query.eq("generation_plan_id", generationPlanId);

      const { data: dbData, error } = await query.order("created_at", {
        ascending: false,
      });

      if (!error && Array.isArray(dbData)) {
        for (const row of dbData) {
          results.push(toQualityEvaluation(row));
        }
        return { status: "success", evaluations: results };
      }
    } catch {}
  }

  // Fallback map
  for (const row of fallbackPresentationQualityEvaluations.values()) {
    if (row.evaluated_by === userId) {
      if (moduleId && row.module_id !== moduleId) continue;
      if (generationPlanId && row.generation_plan_id !== generationPlanId) continue;
      results.push(toQualityEvaluation(row));
    }
  }

  results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { status: "success", evaluations: results };
}

// ==============================================================================
// 6. EXECUTE: SECURE DOWNLOAD PRESENTATION PPTX GATEKEEPER
// ==============================================================================

export async function executeSecureDownloadPresentationPptx(
  data: {
    artifactId: string;
    storageDriver?: PresentationArtifactStorageDriver;
    mockBytes?: Uint8Array;
  },
  context: {
    userId: string;
    role?: string;
    profile?: any;
    supabase?: any;
  }
): Promise<{
  status: "success";
  artifactId: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  downloadUrl: string;
  fileHash: string;
  authorizedAt: string;
  bytes?: Uint8Array;
}> {
  const { artifactId } = data;
  const { userId, role, supabase } = context;

  // 1. Authentication & Role Gate
  if (!userId) {
    throw new AiServiceError(
      AI_ERROR_CODES.AUTH_ERROR,
      "Akses ditolak: Pengguna belum terautentikasi."
    );
  }
  const effectiveRole = role || context.profile?.role;
  if (effectiveRole && effectiveRole !== "guru") {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Operasi unduh presentasi hanya diizinkan untuk peran Guru."
    );
  }

  // 2. Resolve Artifact
  const artifactRow = await resolveArtifactRow(artifactId, supabase);
  if (!artifactRow) {
    throw new AiServiceError(
      AI_ERROR_CODES.PPTX_ARTIFACT_NOT_FOUND,
      `Artefak presentasi dengan ID '${artifactId}' tidak ditemukan.`
    );
  }

  // Tenant / Ownership Guard
  if (artifactRow.owner_id !== userId) {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Anda tidak memiliki wewenang untuk mengunduh presentasi guru lain."
    );
  }

  // 3. Teacher Review Approval Gatekeeper
  const reviewRow = await resolveReviewRow(artifactRow.content_result_id, supabase);
  if (!reviewRow || reviewRow.review_status !== "approved") {
    throw new AiServiceError(
      AI_ERROR_CODES.PRESENTATION_DOWNLOAD_UNAUTHORIZED,
      `Unduhan ditolak: Presentasi belum disetujui oleh guru (status: ${
        reviewRow?.review_status || "unreviewed"
      }). Hanya dokumen yang telah disetujui yang dapat diunduh.`
    );
  }

  if (reviewRow.approved_version !== artifactRow.outline_version) {
    throw new AiServiceError(
      AI_ERROR_CODES.PRESENTATION_DOWNLOAD_UNAUTHORIZED,
      `Unduhan ditolak: Versi artefak (${artifactRow.outline_version}) tidak sesuai dengan versi yang disetujui (${reviewRow.approved_version}).`
    );
  }

  // 4. Quality Gatekeeper (Must have passed quality evaluation)
  const evalResult = await executeGetPresentationQualityEvaluation(
    { artifactId },
    context
  );
  const evaluation = evalResult.evaluation;

  if (!evaluation || evaluation.status !== "passed" || evaluation.decision !== "PASS") {
    throw new AiServiceError(
      AI_ERROR_CODES.PRESENTATION_QUALITY_GATE_BLOCKED,
      `Unduhan ditolak: Dokumen presentasi belum lolos gerbang mutu akhir (PPT-1F). Status: ${
        evaluation?.status || "unvalidated"
      }.`
    );
  }

  // 5. Verify Artifact Binary & SHA-256 Checksum
  let bytes = data.mockBytes || mockArtifactBinaries.get(artifactId);
  if (!bytes) {
    const storageDriver =
      data.storageDriver || resolvePresentationStorageDriver(artifactRow.storage_provider);
    try {
      bytes = await storageDriver.download(artifactRow.storage_reference);
    } catch (err: any) {
      throw new AiServiceError(
        AI_ERROR_CODES.PPTX_STORAGE_FAILED,
        `Gagal mengunduh biner berkas dari penyimpanan: ${err.message}`
      );
    }
  }

  const checksum = computeBytesSha256(bytes);
  if (checksum !== artifactRow.file_hash) {
    throw new AiServiceError(
      AI_ERROR_CODES.PRESENTATION_ARTIFACT_HASH_MISMATCH,
      "Integritas biner berkas rusak: checksum SHA-256 tidak cocok dengan artefak yang tercatat."
    );
  }

  void trackProductEvent("PRESENTATION_DOWNLOADED", "presentation", {
    userId,
    role: effectiveRole,
    metadata: {
      artifactId: artifactRow.id,
      byteSize: artifactRow.byte_size,
    },
  });

  return {
    status: "success",
    artifactId: artifactRow.id,
    filename: artifactRow.filename,
    mimeType: artifactRow.mime_type,
    byteSize: artifactRow.byte_size,
    downloadUrl: artifactRow.download_url,
    fileHash: artifactRow.file_hash,
    authorizedAt: new Date().toISOString(),
    bytes,
  };
}

// ==============================================================================
// 7. SERVER FUNCTION DEFINITIONS (TANSTACK START)
// ==============================================================================

export const evaluatePresentationQualityServerFn = createServerFn({
  method: "POST",
})
  .middleware([requireTeacherAiAuth])
  .validator((input: unknown) => {
    return EvaluatePresentationQualityInputSchema.parse(input);
  })
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase;
    const userId = (context as any).userId;
    const profile = (context as any).profile;
    return executeEvaluatePresentationQuality(data as any, {
      userId,
      profile,
      supabase,
    });
  });

export const getPresentationQualityEvaluationServerFn = createServerFn({
  method: "POST",
})
  .middleware([requireTeacherAiAuth])
  .validator((input: unknown) => {
    return GetPresentationQualityEvaluationInputSchema.parse(input);
  })
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase;
    const userId = (context as any).userId;
    const profile = (context as any).profile;
    return executeGetPresentationQualityEvaluation(data as any, {
      userId,
      profile,
      supabase,
    });
  });

export const listPresentationQualityEvaluationsServerFn = createServerFn({
  method: "POST",
})
  .middleware([requireTeacherAiAuth])
  .validator((input: unknown) => {
    return ListPresentationQualityEvaluationsInputSchema.parse(input);
  })
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase;
    const userId = (context as any).userId;
    const profile = (context as any).profile;
    return executeListPresentationQualityEvaluations(data as any, {
      userId,
      profile,
      supabase,
    });
  });

export const downloadPresentationPptxServerFn = createServerFn({
  method: "POST",
})
  .middleware([requireTeacherAiAuth])
  .validator((input: unknown) => {
    return DownloadPresentationPptxInputSchema.parse(input);
  })
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase;
    const userId = (context as any).userId;
    const profile = (context as any).profile;
    return executeSecureDownloadPresentationPptx(data as any, {
      userId,
      profile,
      supabase,
    });
  });
