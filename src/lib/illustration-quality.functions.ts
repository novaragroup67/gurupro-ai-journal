/**
 * ==============================================================================
 * GURUPRO AI: ILLUSTRATION QUALITY GATE SERVER FUNCTIONS (VIS-1E)
 * ==============================================================================
 *
 * Implements server-authoritative 3-layer quality validation:
 * - Layer 1: Deterministic Technical Validation (fails closed without calling AI)
 * - Layer 2: AI Vision / Semantic Evaluation against immutable approved snapshots
 * - Layer 3: Deterministic Post-Evaluation Guards & Final Decision Derivation
 * - In-flight Locking & Strict Cost Control Caching
 * - Cryptographic SHA-256 Hash Binding & Stale Protection
 * - Composite Usability Eligibility Check
 * - Multi-Tenant RBAC (Guru role & ownership verification)
 */

import { createServerFn } from "@tanstack/react-start";
import { requireTeacherAiAuth } from "@/integrations/supabase/auth-middleware";
import { AI_ERROR_CODES, AiServiceError } from "./ai/error-taxonomy";
import {
  type QualityDecision,
  type IllustrationQualityFinding,
  type DeterministicQualityChecks,
  type SemanticQualityChecks,
  type IllustrationQualityEvaluation,
  type IllustrationEligibility,
  CANONICAL_ILLUSTRATION_QUALITY_EVALUATOR_VERSION,
  EvaluateIllustrationQualityInputSchema,
  GetIllustrationQualityEvaluationInputSchema,
  ListIllustrationQualityEvaluationsInputSchema,
  CheckIllustrationEligibilityInputSchema,
  deriveQualityDecision,
} from "./ai/illustration-quality-contract";
import type { ApprovedOutlineSnapshot, ApprovedStyleSnapshot } from "./ai/illustration-review-contract";
import {
  fallbackIllustrationAssets,
  type StoredIllustrationAssetRow,
} from "./illustration-asset.functions";
import {
  fallbackIllustrationRequests,
  fallbackIllustrationGenerations,
  fallbackTestPlans,
} from "./illustration-generation.functions";
import { fallbackIllustrationReviews } from "./illustration-review.functions";
import { ILLUSTRATION_STYLES_CATALOG } from "./ai/generation-planning-contract";
import {
  inspectImageBinary,
  validateImageBinary,
  toUint8Array,
} from "./ai/image-validator";
import {
  computeSha256,
  resolveStorageDriver,
  MemoryStorageDriver,
} from "./ai/illustration-storage-service";
import {
  resolveIllustrationQualityEvaluator,
  type IllustrationQualityEvaluator,
} from "./ai/providers/illustration-quality-evaluator";

// ==============================================================================
// 1. IN-MEMORY STORAGE & IN-FLIGHT LOCKS
// ==============================================================================

export interface StoredIllustrationQualityEvaluationRow {
  id: string;
  asset_id: string;
  generation_id: string;
  generation_plan_id: string;
  module_id: string;
  asset_hash: string;
  outline_version: number;
  style_id: string;
  style_version: number;
  evaluator_version: string;
  provider: string;
  model: string;
  deterministic_checks: DeterministicQualityChecks;
  semantic_checks?: SemanticQualityChecks | null;
  decision: QualityDecision;
  findings: IllustrationQualityFinding[];
  evaluated_by: string;
  evaluated_at: string;
  created_at: string;
  updated_at: string;
}

export const fallbackIllustrationQualityEvaluations = new Map<string, StoredIllustrationQualityEvaluationRow>();
export const inFlightEvaluationLocks = new Set<string>();

// Mock binary cache for test scenarios where asset binary was stored in mock driver
export const mockAssetBinaries = new Map<string, Uint8Array>();

// ==============================================================================
// 2. HELPER FUNCTIONS: ASSET & SNAPSHOT RESOLUTION
// ==============================================================================

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

export async function retrieveAssetBinary(
  asset: StoredIllustrationAssetRow,
  supabaseClient?: any
): Promise<Uint8Array | null> {
  // 1. Check mock binary registry for test mocks
  if (mockAssetBinaries.has(asset.id)) {
    return mockAssetBinaries.get(asset.id)!;
  }

  // 2. Storage Driver resolution
  const storageDriver = resolveStorageDriver(supabaseClient);
  if (storageDriver instanceof MemoryStorageDriver) {
    const stored = storageDriver.getStored(asset.storage_path);
    if (stored && stored.bytes) {
      return stored.bytes;
    }
  }

  // 3. Fallback from publicUrl if base64 data URL
  if (asset.public_url && asset.public_url.startsWith("data:")) {
    try {
      return toUint8Array(asset.public_url);
    } catch {}
  }

  // 4. Fallback from generation record if available
  const genRecord = fallbackIllustrationGenerations.get(asset.generation_id);
  if (genRecord && genRecord.asset_reference) {
    try {
      return toUint8Array(genRecord.asset_reference);
    } catch {}
  }

  // 5. Supabase Storage download
  if (supabaseClient?.storage) {
    try {
      const { data, error } = await supabaseClient.storage
        .from("illustration-assets")
        .download(asset.storage_path);
      if (!error && data) {
        const arrayBuffer = await data.arrayBuffer();
        return new Uint8Array(arrayBuffer);
      }
    } catch {}
  }

  return null;
}

export function performDeterministicValidation(
  asset: StoredIllustrationAssetRow,
  bytes: Uint8Array | null
): DeterministicQualityChecks {
  const assetHash = asset.sha256_hash;

  // 1. Check binary existence
  if (!bytes || bytes.length === 0) {
    return {
      binaryExists: false,
      mimeTypeValid: false,
      dimensionsValid: false,
      aspectRatioValid: false,
      nonMockValid: false,
      byteSize: 0,
      hashMatches: false,
      assetHash,
      provenanceComplete: false,
      storageAccessible: false,
      passed: false,
      failureReason: "Binary gambar tidak ditemukan atau penyimpanan tidak dapat diakses.",
    };
  }

  const byteSize = bytes.length;
  const storageAccessible = true;

  // 2. Inspect image binary headers
  const inspected = inspectImageBinary(bytes);
  const mimeTypeValid = ["image/png", "image/jpeg", "image/webp"].includes(inspected.mimeType);
  const dimensionsValid =
    inspected.width >= 256 &&
    inspected.height >= 256 &&
    inspected.width <= 4096 &&
    inspected.height <= 4096;

  // 3. Non-mock / minimum size check
  const nonMockValid = byteSize >= 512 && inspected.format !== "unknown";

  // 4. Aspect ratio check
  let aspectRatioValid = true;
  let aspectRatioCalculated: number | undefined;
  if (inspected.width > 0 && inspected.height > 0) {
    aspectRatioCalculated = inspected.width / inspected.height;
    const expectedRatioStr = asset.aspect_ratio || "1:1";
    const binaryValidation = validateImageBinary(bytes, expectedRatioStr as any);
    aspectRatioValid = binaryValidation.valid;
  }

  // 5. Cryptographic SHA-256 Hash Integrity Check
  const computedHash = computeSha256(bytes);
  const hashMatches = computedHash.toLowerCase() === assetHash.toLowerCase();

  // 6. Provenance completeness check
  const provenanceComplete = Boolean(
    asset.generation_id &&
    asset.request_id &&
    asset.generation_plan_id &&
    asset.module_id &&
    asset.owner_id
  );

  let failureReason: string | undefined;
  if (!mimeTypeValid) {
    failureReason = `Format MIME tidak didukung: ${inspected.mimeType}.`;
  } else if (!nonMockValid) {
    failureReason = "Binary gambar berukuran terlalu kecil atau payload tidak valid (< 512 bytes).";
  } else if (!dimensionsValid) {
    failureReason = `Dimensi gambar (${inspected.width}x${inspected.height}) di luar batas yang diizinkan (256 - 4096px).`;
  } else if (!aspectRatioValid) {
    failureReason = `Aspek rasio gambar (${aspectRatioCalculated?.toFixed(2)}) tidak sesuai dengan toleransi target (${asset.aspect_ratio || "1:1"}).`;
  } else if (!hashMatches) {
    failureReason = `Integritas kriptografis gagal: SHA-256 terhitung (${computedHash.slice(0, 12)}...) tidak cocok dengan hash tersimpan (${assetHash.slice(0, 12)}...).`;
  } else if (!provenanceComplete) {
    failureReason = "Data rekam jejak (provenance) aset ilustrasi tidak lengkap.";
  }

  const passed = Boolean(
    mimeTypeValid &&
    dimensionsValid &&
    aspectRatioValid &&
    nonMockValid &&
    hashMatches &&
    provenanceComplete &&
    storageAccessible
  );

  return {
    binaryExists: true,
    mimeTypeValid,
    mimeType: inspected.mimeType,
    dimensionsValid,
    width: inspected.width,
    height: inspected.height,
    aspectRatioValid,
    aspectRatio: asset.aspect_ratio,
    aspectRatioCalculated,
    nonMockValid,
    byteSize,
    hashMatches,
    assetHash,
    provenanceComplete,
    storageAccessible,
    passed,
    failureReason,
  };
}

function resolveImmutableSnapshots(
  assetRow: StoredIllustrationAssetRow
): {
  approvedOutline: ApprovedOutlineSnapshot;
  approvedStyle: ApprovedStyleSnapshot;
  textPolicy?: any;
} {
  // 1. Resolve approved outline snapshot from generation request or fallback
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

  let textPolicy: any = {
    allowModelInventedText: false,
    requiredLabels: [],
    forbiddenLabels: [],
  };

  const genRequest = fallbackIllustrationRequests.get(assetRow.request_id);
  if (genRequest) {
    if (genRequest.approvedOutline) {
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
    if (genRequest.textPolicy) {
      textPolicy = genRequest.textPolicy;
    }
  } else {
    // Check fallbackTestPlans
    const testPlan = fallbackTestPlans.get(assetRow.generation_plan_id);
    if (testPlan && testPlan.currentPlan?.outline) {
      const o = testPlan.currentPlan.outline as any;
      approvedOutline = {
        version: testPlan.approvedVersion || 1,
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
  }

  // 2. Resolve approved style snapshot
  const stylePreset = ILLUSTRATION_STYLES_CATALOG.find((s) => s.id === assetRow.style_id);
  const approvedStyle: ApprovedStyleSnapshot = {
    id: assetRow.style_id,
    name: stylePreset?.name || assetRow.style_id,
    version: assetRow.style_version || 1,
    description: stylePreset?.description || "Gaya visual pembelajaran terpilih",
    visualRules: stylePreset?.visualRules || ["Mengikuti kaidah visual edukatif"],
  };

  return { approvedOutline, approvedStyle, textPolicy };
}

function mapRowToEvaluation(row: StoredIllustrationQualityEvaluationRow): IllustrationQualityEvaluation {
  return {
    id: row.id,
    assetId: row.asset_id,
    generationId: row.generation_id,
    generationPlanId: row.generation_plan_id,
    moduleId: row.module_id,
    assetHash: row.asset_hash,
    outlineVersion: row.outline_version,
    styleId: row.style_id,
    styleVersion: row.style_version,
    evaluatorVersion: row.evaluator_version,
    provider: row.provider,
    model: row.model,
    deterministicChecks: row.deterministic_checks,
    semanticChecks: row.semantic_checks,
    decision: row.decision,
    findings: row.findings || [],
    evaluatedBy: row.evaluated_by,
    evaluatedAt: row.evaluated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ==============================================================================
// 3. EXECUTE EVALUATE ILLUSTRATION QUALITY (3-LAYER GATE)
// ==============================================================================

export async function executeEvaluateIllustrationQuality(
  input: { assetId: string; forceReevaluate?: boolean },
  context: { userId: string; role?: string; isGuru?: boolean; profile?: any; supabase?: any },
  options?: { evaluator?: IllustrationQualityEvaluator; supabaseClient?: any }
): Promise<{ status: "success"; evaluation: IllustrationQualityEvaluation; cached: boolean }> {
  const userId = context.userId;

  // 1. Authoritative Role Guard (Guru only)
  const isTeacher = context.isGuru ?? (context.role === "guru" || context.profile?.role === "guru");
  if (!isTeacher) {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Hanya pengguna dengan peran Guru yang dapat menjalankan evaluasi mutu ilustrasi."
    );
  }

  // 2. Fetch Asset & Ownership Guard
  const assetRow = await resolveAssetRow(input.assetId, context.supabase || options?.supabaseClient);
  if (!assetRow) {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      "Aset ilustrasi tidak ditemukan."
    );
  }

  if (assetRow.owner_id !== userId) {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Anda tidak memiliki wewenang untuk mengevaluasi aset milik guru lain."
    );
  }

  if (assetRow.lifecycle_status === "soft_deleted") {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      "Aset ilustrasi telah dihapus lunak dan tidak dapat dievaluasi."
    );
  }

  // 3. In-flight Concurrency Lock Guard
  if (inFlightEvaluationLocks.has(input.assetId)) {
    throw new AiServiceError(
      AI_ERROR_CODES.CONCURRENT_REQUEST,
      "Evaluasi kualitas untuk aset ini sedang berjalan. Mohon tunggu proses selesai."
    );
  }

  inFlightEvaluationLocks.add(input.assetId);

  try {
    const { approvedOutline, approvedStyle, textPolicy } = resolveImmutableSnapshots(assetRow);

    // 4. Cost Control & Cache Lookup: check if valid evaluation already exists for this exact tuple
    if (!input.forceReevaluate) {
      let cachedRow: StoredIllustrationQualityEvaluationRow | null = null;
      try {
        const client = context.supabase || options?.supabaseClient;
        if (client) {
          const { data: dbEval } = await client
            .from("illustration_quality_evaluations")
            .select("*")
            .eq("asset_id", assetRow.id)
            .eq("asset_hash", assetRow.sha256_hash)
            .eq("outline_version", approvedOutline.version)
            .eq("style_version", approvedStyle.version)
            .eq("evaluator_version", CANONICAL_ILLUSTRATION_QUALITY_EVALUATOR_VERSION)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (dbEval) cachedRow = dbEval;
        }
      } catch {}

      if (!cachedRow) {
        // Check in-memory fallback cache
        for (const r of fallbackIllustrationQualityEvaluations.values()) {
          if (
            r.asset_id === assetRow.id &&
            r.asset_hash === assetRow.sha256_hash &&
            r.outline_version === approvedOutline.version &&
            r.style_version === approvedStyle.version &&
            r.evaluator_version === CANONICAL_ILLUSTRATION_QUALITY_EVALUATOR_VERSION
          ) {
            cachedRow = r;
            break;
          }
        }
      }

      if (cachedRow) {
        return {
          status: "success",
          evaluation: mapRowToEvaluation(cachedRow),
          cached: true,
        };
      }
    }

    // 5. Retrieve Stored Image Binary
    const binary = await retrieveAssetBinary(assetRow, context.supabase || options?.supabaseClient);

    // 6. LAYER 1: Deterministic Technical Validation
    const deterministicChecks = performDeterministicValidation(assetRow, binary);

    // Fail-Closed on Layer 1 Failure: DO NOT call expensive AI Vision Evaluator
    if (!deterministicChecks.passed || !binary) {
      const technicalFinding: IllustrationQualityFinding = {
        code: deterministicChecks.hashMatches === false ? "SHA256_HASH_MISMATCH" : "DETERMINISTIC_CHECK_FAILED",
        severity: "critical",
        category: "technical",
        description: deterministicChecks.failureReason || "Pemeriksaan teknis deterministik gambar gagal.",
        recommendation: "Pastikan berkas gambar valid, tidak rusak, dan memiliki integritas hash kriptografis yang sesuai.",
      };

      const now = new Date().toISOString();
      const failEvaluationRow: StoredIllustrationQualityEvaluationRow = {
        id: `eval_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        asset_id: assetRow.id,
        generation_id: assetRow.generation_id,
        generation_plan_id: assetRow.generation_plan_id,
        module_id: assetRow.module_id,
        asset_hash: assetRow.sha256_hash,
        outline_version: approvedOutline.version,
        style_id: approvedStyle.id,
        style_version: approvedStyle.version,
        evaluator_version: CANONICAL_ILLUSTRATION_QUALITY_EVALUATOR_VERSION,
        provider: "deterministic_validator",
        model: "rule_engine_v1",
        deterministic_checks: deterministicChecks,
        semantic_checks: null,
        decision: deriveQualityDecision(deterministicChecks, [technicalFinding]),
        findings: [technicalFinding],
        evaluated_by: userId,
        evaluated_at: now,
        created_at: now,
        updated_at: now,
      };

      fallbackIllustrationQualityEvaluations.set(failEvaluationRow.id, failEvaluationRow);
      return {
        status: "success",
        evaluation: mapRowToEvaluation(failEvaluationRow),
        cached: false,
      };
    }

    // 7. LAYER 2: AI Vision / Semantic Evaluation
    const evaluator = options?.evaluator || resolveIllustrationQualityEvaluator();
    const semanticResult = await evaluator.evaluate({
      assetId: assetRow.id,
      assetHash: assetRow.sha256_hash,
      imageBytes: binary,
      mimeType: deterministicChecks.mimeType || "image/png",
      approvedOutline,
      approvedStyle,
      groundingSnapshot: assetRow.grounding_snapshot,
      textPolicy,
    });

    // 8. LAYER 3: Deterministic Post-Evaluation Guards & Final Decision
    // Re-verify hash and binary integrity before accepting AI decision
    const recomputedHash = computeSha256(binary);
    if (recomputedHash.toLowerCase() !== assetRow.sha256_hash.toLowerCase()) {
      deterministicChecks.passed = false;
      deterministicChecks.hashMatches = false;
      deterministicChecks.failureReason = "Integritas kriptografis gambar berubah pasca-evaluasi.";
      semanticResult.findings.unshift({
        code: "POST_EVALUATION_HASH_MISMATCH",
        severity: "critical",
        category: "technical",
        description: "Hash SHA-256 gambar berubah selama siklus evaluasi.",
      });
    }

    const finalDecision = deriveQualityDecision(deterministicChecks, semanticResult.findings);
    const now = new Date().toISOString();

    const evaluationRow: StoredIllustrationQualityEvaluationRow = {
      id: `eval_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      asset_id: assetRow.id,
      generation_id: assetRow.generation_id,
      generation_plan_id: assetRow.generation_plan_id,
      module_id: assetRow.module_id,
      asset_hash: assetRow.sha256_hash,
      outline_version: approvedOutline.version,
      style_id: approvedStyle.id,
      style_version: approvedStyle.version,
      evaluator_version: CANONICAL_ILLUSTRATION_QUALITY_EVALUATOR_VERSION,
      provider: evaluator.providerName,
      model: evaluator.modelName,
      deterministic_checks: deterministicChecks,
      semantic_checks: semanticResult.semanticChecks,
      decision: finalDecision,
      findings: semanticResult.findings,
      evaluated_by: userId,
      evaluated_at: now,
      created_at: now,
      updated_at: now,
    };

    // Persist to Supabase and fallback map
    try {
      const client = context.supabase || options?.supabaseClient;
      if (client) {
        await client.from("illustration_quality_evaluations").insert(evaluationRow);
      }
    } catch {}

    fallbackIllustrationQualityEvaluations.set(evaluationRow.id, evaluationRow);

    return {
      status: "success",
      evaluation: mapRowToEvaluation(evaluationRow),
      cached: false,
    };
  } finally {
    inFlightEvaluationLocks.delete(input.assetId);
  }
}

export const evaluateIllustrationQualityServerFn = createServerFn({
  method: "POST",
})
  .middleware([requireTeacherAiAuth])
  .validator((input: unknown) => {
    const parsed = EvaluateIllustrationQualityInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        "Parameter evaluasi mutu ilustrasi tidak valid."
      );
    }
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    return executeEvaluateIllustrationQuality(data, context as any);
  });

// ==============================================================================
// 4. GET & LIST ILLUSTRATION QUALITY EVALUATIONS
// ==============================================================================

export async function executeGetIllustrationQualityEvaluation(
  data: { assetId: string },
  context: { userId: string; role?: string; isGuru?: boolean; profile?: any; supabase?: any }
): Promise<{ status: "success"; evaluation: IllustrationQualityEvaluation | null }> {
  const userId = context.userId;

  // 1. Role Guard
  const isTeacher = context.isGuru ?? (context.role === "guru" || context.profile?.role === "guru");
  if (!isTeacher) {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Hanya pengguna dengan peran Guru yang dapat melihat evaluasi mutu ilustrasi."
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
      "Akses ditolak: Anda tidak memiliki wewenang untuk melihat aset milik guru lain."
    );
  }

  // 3. Resolve latest evaluation for this asset
  let evalRow: StoredIllustrationQualityEvaluationRow | null = null;
  try {
    if (context.supabase) {
      const { data: dbEval } = await context.supabase
        .from("illustration_quality_evaluations")
        .select("*")
        .eq("asset_id", data.assetId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (dbEval) evalRow = dbEval;
    }
  } catch {}

  if (!evalRow) {
    const matches = Array.from(fallbackIllustrationQualityEvaluations.values())
      .filter((e) => e.asset_id === data.assetId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (matches.length > 0) {
      evalRow = matches[0];
    }
  }

  return {
    status: "success",
    evaluation: evalRow ? mapRowToEvaluation(evalRow) : null,
  };
}

export const getIllustrationQualityEvaluationServerFn = createServerFn({
  method: "POST",
})
  .middleware([requireTeacherAiAuth])
  .validator((input: unknown) => {
    const parsed = GetIllustrationQualityEvaluationInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        "Parameter pencarian evaluasi mutu ilustrasi tidak valid."
      );
    }
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    return executeGetIllustrationQualityEvaluation(data, context as any);
  });

export async function executeListIllustrationQualityEvaluations(
  data: { moduleId: string },
  context: { userId: string; role?: string; isGuru?: boolean; profile?: any; supabase?: any }
): Promise<{ status: "success"; evaluations: IllustrationQualityEvaluation[] }> {
  const userId = context.userId;

  // 1. Role Guard
  const isTeacher = context.isGuru ?? (context.role === "guru" || context.profile?.role === "guru");
  if (!isTeacher) {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Hanya pengguna dengan peran Guru yang dapat melihat daftar evaluasi mutu."
    );
  }

  let rows: StoredIllustrationQualityEvaluationRow[] = [];
  try {
    if (context.supabase) {
      const { data: dbEvals } = await context.supabase
        .from("illustration_quality_evaluations")
        .select("*")
        .eq("module_id", data.moduleId)
        .eq("evaluated_by", userId)
        .order("created_at", { ascending: false });
      if (dbEvals) rows = dbEvals;
    }
  } catch {}

  if (rows.length === 0) {
    rows = Array.from(fallbackIllustrationQualityEvaluations.values())
      .filter((e) => e.module_id === data.moduleId && e.evaluated_by === userId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  return {
    status: "success",
    evaluations: rows.map(mapRowToEvaluation),
  };
}

export const listIllustrationQualityEvaluationsServerFn = createServerFn({
  method: "POST",
})
  .middleware([requireTeacherAiAuth])
  .validator((input: unknown) => {
    const parsed = ListIllustrationQualityEvaluationsInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        "Parameter daftar evaluasi mutu ilustrasi tidak valid."
      );
    }
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    return executeListIllustrationQualityEvaluations(data, context as any);
  });

// ==============================================================================
// 5. COMPOSITE USABILITY ELIGIBILITY CHECK
// ==============================================================================

export async function executeCheckIllustrationEligibility(
  data: { assetId: string },
  context: { userId: string; role?: string; isGuru?: boolean; profile?: any; supabase?: any }
): Promise<{ status: "success"; eligibility: IllustrationEligibility }> {
  const userId = context.userId;

  // 1. Role Guard
  const isTeacher = context.isGuru ?? (context.role === "guru" || context.profile?.role === "guru");
  if (!isTeacher) {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Hanya pengguna dengan peran Guru yang dapat memeriksa kelayakan aset."
    );
  }

  // 2. Fetch Asset & Review
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
      "Akses ditolak: Anda tidak memiliki wewenang untuk memeriksa aset milik guru lain."
    );
  }

  // 3. Resolve Review
  const reviewResult = fallbackIllustrationReviews.get(data.assetId);
  const reviewStatus = reviewResult?.review_status || "pending";

  // 4. Resolve Quality Evaluation
  const evalResult = await executeGetIllustrationQualityEvaluation({ assetId: data.assetId }, context);
  const qualityEvaluation = evalResult.evaluation;
  const qualityStatus: QualityDecision = qualityEvaluation?.decision || "ERROR";
  const deterministicPassed = qualityEvaluation?.deterministicChecks?.passed ?? false;

  // 5. Evaluate Composite Usability
  const reasons: string[] = [];
  const validAsset = assetRow.lifecycle_status !== "soft_deleted";

  if (!validAsset) {
    reasons.push("Aset dalam status dihapus lunak.");
  }
  if (reviewStatus !== "approved_for_use") {
    reasons.push(`Guru belum menyetujui aset untuk digunakan (status tinjauan: ${reviewStatus}).`);
  }
  if (qualityStatus !== "PASS") {
    reasons.push(`Pemeriksaan kualitas AI belum berstatus PASS (status saat ini: ${qualityStatus}).`);
  }
  if (!deterministicPassed) {
    reasons.push("Pemeriksaan teknis deterministik belum terpenuhi secara valid.");
  }

  const eligibleForUse = Boolean(
    validAsset &&
    reviewStatus === "approved_for_use" &&
    qualityStatus === "PASS" &&
    deterministicPassed
  );

  return {
    status: "success",
    eligibility: {
      eligibleForUse,
      assetId: data.assetId,
      moduleId: assetRow.module_id,
      reviewStatus,
      qualityStatus,
      deterministicPassed,
      reasons,
    },
  };
}

export const checkIllustrationEligibilityServerFn = createServerFn({
  method: "POST",
})
  .middleware([requireTeacherAiAuth])
  .validator((input: unknown) => {
    const parsed = CheckIllustrationEligibilityInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        "Parameter pemeriksaan kelayakan tidak valid."
      );
    }
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    return executeCheckIllustrationEligibility(data, context as any);
  });
