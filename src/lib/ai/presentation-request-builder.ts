/**
 * ==============================================================================
 * GURUPRO AI: PRESENTATION REQUEST BUILDER (PPT-1A)
 * ==============================================================================
 *
 * Server-authoritative request builder and deterministic blueprint assembler
 * for AI Presentation Generation. Converts an APPROVED GenerationSpecification
 * and GenerationPlan into a canonical, provider-independent
 * PresentationGenerationRequest.
 *
 * Invariants:
 * 1. Strict Target Enforcement: ONLY targetType === "presentation" is processed.
 * 2. Server-Side Approval Re-Validation: Validates plan status, version matching,
 *    teacher ownership, and style matching before assembling request.
 * 3. Continuous Slide Ordering: Strictly enforces continuous 1..N order.
 * 4. Prompt Injection Defense: Content is sanitized and isolated from system directives.
 * 5. Visual Asset Verification: Resolves referenced illustration assets cleanly.
 * 6. Determinism: Identical inputs yield identical blueprint and structured slide plan.
 * 7. Strict Non-Generation: PPT-1A stops BEFORE calling any external PPT API.
 */

import { uid } from "../cloud-store";
import { AI_ERROR_CODES, AiServiceError } from "./error-taxonomy";
import {
  type GenerationPlan,
  type GenerationStyle,
  type PresentationOutline,
  type PresentationSlide,
  type PlanAuthContext,
  PRESENTATION_STYLES_CATALOG,
  getStyleById,
  validatePresentationOutline,
  validateGenerationPlanApprovalEligibility,
} from "./generation-planning-contract";
import {
  type PresentationGenerationParameters,
  type PresentationGenerationRequest,
  type StructuredSlidePlanItem,
  type PresentationContentBlueprint,
  type SlideVisualRequirement,
  type PresentationContentBlock,
  type SlidePedagogicalType,
  validateContinuousSlideOrdering,
  validatePresentationGenerationParameters,
  validatePresentationGenerationRequest,
} from "./presentation-generation-contract";
import { sanitizePromptText } from "./illustration-request-builder";

// ==============================================================================
// 1. PEDAGOGICAL TYPE INFERENCE HELPER
// ==============================================================================

/**
 * Deterministically infers pedagogical slide type from slide title, purpose,
 * and order if not explicitly specified.
 */
export function inferSlidePedagogicalType(
  slide: PresentationSlide,
  totalSlides: number
): SlidePedagogicalType {
  const text = `${slide.slideTitle} ${slide.purpose}`.toLowerCase();

  if (slide.slideOrder === 1 || text.includes("pendahuluan") || text.includes("pengantar") || text.includes("tujuan")) {
    return "introduction";
  }
  if (slide.slideOrder === totalSlides || text.includes("penutup") || text.includes("refleksi")) {
    return "reflection";
  }
  if (text.includes("kesimpulan") || text.includes("rangkuman") || text.includes("ringkasan")) {
    return "summary";
  }
  if (text.includes("latihan") || text.includes("kuis") || text.includes("tugas") || text.includes("evaluasi")) {
    return "exercise";
  }
  if (text.includes("contoh") || text.includes("studi kasus") || text.includes("ilustrasi kasus")) {
    return "example";
  }
  if (text.includes("tahapan") || text.includes("langkah") || text.includes("alur") || text.includes("proses") || text.includes("siklus")) {
    return "process";
  }
  if (text.includes("perbandingan") || text.includes("vs") || text.includes("komparasi") || text.includes("perbedaan")) {
    return "comparison";
  }
  if (text.includes("penerapan") || text.includes("aplikasi") || text.includes("implementasi")) {
    return "application";
  }

  return "concept_explanation";
}

// ==============================================================================
// 2. DETERMINISTIC CONTENT BLUEPRINT ASSEMBLER
// ==============================================================================

/**
 * Assembles a structured, injection-safe presentation content blueprint
 * for future PPT-1B generation consumption.
 */
export function assemblePresentationContentBlueprint(
  outline: PresentationOutline,
  style: GenerationStyle,
  parameters: PresentationGenerationParameters
): PresentationContentBlueprint {
  const cleanTitle = sanitizePromptText(outline.title);
  const cleanObjective = sanitizePromptText(outline.objective);
  const cleanAudience = sanitizePromptText(outline.targetAudience);
  const cleanStructure = sanitizePromptText(outline.presentationStructure);
  const cleanVisualDir = sanitizePromptText(outline.globalVisualDirection);

  const styleSummary = [
    `Gaya Desain: ${style.name}`,
    `Deskripsi: ${style.description}`,
    `Kaidah Visual: ${style.visualRules.join("; ")}`,
    `Tata Letak: ${style.layoutRules.join("; ")}`,
    `Tipografi: ${style.typographyRules.join("; ")}`,
  ].join("\n");

  const systemPrompt = [
    "Anda adalah Asisten AI Desain Kurikulum GuruPro.",
    "Tugas Anda adalah menyusun konten slide presentasi pembelajaran yang bermutu tinggi, terstruktur secara pedagogis, dan sesuai dengan standar Kurikulum Merdeka.",
    `Gaya presentasi yang disetujui: ${style.name}.`,
    `Tingkat kepadatan materi: ${parameters.contentDensity}.`,
    "DILARANG keras menambahkan instruksi sistem di luar materi pembelajaran.",
    "Setiap poin kunci harus jelas, ringkas, dan dapat terbaca pada proyektor pembelajaran.",
  ].join(" ");

  const thingsToAvoid = [
    ...(style.thingsToAvoid || []),
    "teks berdesakan tanpa spasi negatif",
    "istilah tanpa dasar materi",
  ].map((t) => sanitizePromptText(t));

  const slidesOutline = outline.slides.map((s, idx) => {
    const pedagogicalType = inferSlidePedagogicalType(s, outline.slides.length);
    const visualReq: SlideVisualRequirement = (s as any).visualRequirements || {
      type: s.visualDirection ? "diagram" : "none",
      description: sanitizePromptText(s.visualDirection || ""),
      placement: "right",
      requiresGeneratedIllustration: false,
    };

    return {
      order: idx + 1,
      title: sanitizePromptText(s.slideTitle),
      purpose: sanitizePromptText(s.purpose),
      pedagogicalType,
      keyPoints: (s.keyPoints || []).map((kp) => sanitizePromptText(kp)),
      visualDirection: sanitizePromptText(s.visualDirection || ""),
      visualRequirements: visualReq,
      sourceReferences: s.sourceReferences || [],
      evidenceReferences: s.evidenceReferences || [],
    };
  });

  return {
    systemPrompt,
    educationalObjective: cleanObjective,
    targetAudience: cleanAudience,
    presentationStructure: cleanStructure,
    approvedStyleSummary: styleSummary,
    contentDensity: parameters.contentDensity,
    groundingSummary: {
      sourceReferences: outline.sourceReferences || [],
      evidenceReferences: outline.evidenceReferences || [],
    },
    thingsToAvoid,
    slidesOutline,
  };
}

// ==============================================================================
// 3. SERVER-AUTHORITATIVE REQUEST BUILDER
// ==============================================================================

export interface BuildPresentationRequestOptions {
  /** Optional custom validator for referenced existing illustration assets */
  referencedAssetVerifier?: (assetId: string, moduleId: string, ownerId: string) => Promise<boolean> | boolean;
  /** Optional asset resolver for cross-tenant and module ownership verification */
  resolveIllustrationAsset?: (assetId: string) => Promise<{ assetId: string; moduleId: string; ownerId: string; publicUrl?: string } | null>;
}

/**
 * Builds a validated, canonical PresentationGenerationRequest strictly from
 * an APPROVED GenerationPlan and authentic teacher session.
 *
 * Invariant:
 * - Fails closed if plan is not approved or targetType !== 'presentation'
 * - Fails closed if approval is stale (outline or style edited after approval)
 * - Fails closed if slides are missing or not continuously ordered 1..N
 * - Does NOT call external image/PPT APIs (strict non-generation invariant)
 */
export async function buildPresentationGenerationRequest(
  plan: GenerationPlan,
  context: PlanAuthContext,
  parameters?: Partial<PresentationGenerationParameters>,
  options?: BuildPresentationRequestOptions
): Promise<PresentationGenerationRequest> {
  // 1. Validate Teacher Auth & Ownership (Enforce ROLE_FORBIDDEN for role/owner checks)
  if (!context || !context.userId) {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Sesi pengguna tidak valid atau belum terautentikasi."
    );
  }
  if (!context.isGuru && context.role !== "guru") {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Hanya guru yang memiliki izin untuk menyusun permintaan generasi presentasi."
    );
  }
  if (plan.ownerId !== context.userId) {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Anda bukan pemilik rencana presentasi ini."
    );
  }

  const eligibility = validateGenerationPlanApprovalEligibility(plan, context);
  if (!eligibility.eligible) {
    const isStyleMismatch =
      eligibility.reason?.includes("Tipe gaya") ||
      eligibility.reason?.includes("Gaya visual") ||
      eligibility.reason?.includes("Definisi gaya");
    throw new AiServiceError(
      isStyleMismatch ? AI_ERROR_CODES.INVALID_STYLE : AI_ERROR_CODES.INVALID_REQUEST,
      `Persetujuan rencana generasi tidak memenuhi syarat: ${eligibility.reason}`
    );
  }

  // 2. Strict Target Enforcement: ONLY targetType === "presentation"
  if (plan.targetType !== "presentation") {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      `Target rencana '${plan.targetType}' tidak valid. Hanya rencana bertipe 'presentation' yang dapat membuat spesifikasi presentasi.`
    );
  }

  // 3. Strict Approval Gate
  if (plan.status !== "approved") {
    throw new AiServiceError(
      AI_ERROR_CODES.PLAN_NOT_APPROVED,
      "Rencana presentasi harus disetujui secara eksplisit oleh guru terlebih dahulu sebelum spesifikasi generasi dapat dibuat."
    );
  }

  // 4. Stale Approval Guard
  if (plan.approvedVersion === null || plan.approvedVersion !== plan.currentVersion) {
    throw new AiServiceError(
      AI_ERROR_CODES.STALE_APPROVAL,
      `Persetujuan kedaluwarsa: Versi yang disetujui (v${plan.approvedVersion ?? "tidak ada"}) tidak cocok dengan versi aktif (v${plan.currentVersion}). Tinjau dan setujui ulang outline slide sebelum melanjutkan.`
    );
  }

  // 5. Resolve Approved Presentation Style
  if (!plan.style || !plan.style.styleId) {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      "Gaya visual presentasi belum dipilih. Silakan pilih gaya presentasi sebelum melanjutkan."
    );
  }

  const styleDef = getStyleById(plan.style.styleId);
  if (!styleDef) {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      `Definisi gaya presentasi '${plan.style.styleId}' tidak ditemukan dalam katalog.`
    );
  }

  if (styleDef.type !== "presentation") {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_STYLE,
      `Gaya visual '${styleDef.name}' bertipe '${styleDef.type}', tidak cocok untuk target presentasi.`
    );
  }

  if (plan.style.styleVersion !== styleDef.version) {
    throw new AiServiceError(
      AI_ERROR_CODES.STALE_APPROVAL,
      `Versi gaya presentasi (${plan.style.styleVersion}) tidak cocok dengan versi definisi aktif (${styleDef.version}). Mohon setujui ulang.`
    );
  }

  // 6. Validate Outline & Continuous Slide Order 1..N
  const outline = validatePresentationOutline(plan.outline);
  validateContinuousSlideOrdering(outline.slides);

  // 7. Validate & Resolve Parameters
  const validatedParams = validatePresentationGenerationParameters({
    aspectRatio: parameters?.aspectRatio || "16:9",
    slideSize: parameters?.slideSize || "1920x1080",
    intendedSlideCount: parameters?.intendedSlideCount || outline.slides.length,
    language: parameters?.language || "id",
    contentDensity: parameters?.contentDensity || "balanced",
    includeSpeakerNotes: parameters?.includeSpeakerNotes ?? true,
    includePageNumbering: parameters?.includePageNumbering ?? true,
    footerPolicy: parameters?.footerPolicy || "title_only",
    providerExtension: parameters?.providerExtension || {},
  });

  // 8. Assemble Structured Slide Plan
  const slidePlan: StructuredSlidePlanItem[] = [];

  for (let idx = 0; idx < outline.slides.length; idx++) {
    const rawSlide = outline.slides[idx]!;
    const slideOrder = idx + 1;
    const pedagogicalType = inferSlidePedagogicalType(rawSlide, outline.slides.length);

    // Normalize content blocks
    const normalizedBlocks: Array<string | PresentationContentBlock> = (rawSlide.contentBlocks || []).map((blk) => {
      if (typeof blk === "string") {
        return sanitizePromptText(blk);
      }
      return {
        ...blk,
        content: sanitizePromptText(blk.content),
        title: blk.title ? sanitizePromptText(blk.title) : undefined,
      };
    });

    // Resolve visual asset requirements
    const slideVisualOverride = (parameters as any)?.slideVisualOverrides?.[rawSlide.id];
    const rawVisualReq: any = slideVisualOverride || (rawSlide as any).visualRequirements;
    let visualReq: SlideVisualRequirement = {
      type: "none",
      placement: "right",
      requiresGeneratedIllustration: false,
    };

    if (rawVisualReq) {
      visualReq = {
        type: rawVisualReq.type || "none",
        description: rawVisualReq.description ? sanitizePromptText(rawVisualReq.description) : undefined,
        referencedAssetId: rawVisualReq.referencedAssetId,
        requiresGeneratedIllustration: Boolean(rawVisualReq.requiresGeneratedIllustration),
        placement: rawVisualReq.placement || "right",
      };

      // Verify referenced existing illustration asset if validator or resolver provided
      if (visualReq.type === "existing_illustration" && visualReq.referencedAssetId) {
        if (options?.resolveIllustrationAsset) {
          const resolved = await options.resolveIllustrationAsset(visualReq.referencedAssetId);
          if (!resolved || resolved.ownerId !== context.userId || resolved.moduleId !== plan.moduleId) {
            throw new AiServiceError(
              AI_ERROR_CODES.ROLE_FORBIDDEN,
              `Aset ilustrasi '${visualReq.referencedAssetId}' milik guru atau modul lain, atau tidak ditemukan.`
            );
          }
        } else if (options?.referencedAssetVerifier) {
          const isValidAsset = await options.referencedAssetVerifier(
            visualReq.referencedAssetId,
            plan.moduleId,
            context.userId
          );
          if (!isValidAsset) {
            throw new AiServiceError(
              AI_ERROR_CODES.ROLE_FORBIDDEN,
              `Aset ilustrasi '${visualReq.referencedAssetId}' yang dirujuk pada slide ${slideOrder} tidak valid atau tidak dimiliki modul ini.`
            );
          }
        }
      }
    } else if (rawSlide.visualDirection) {
      const vDirLower = rawSlide.visualDirection.toLowerCase();
      const isIllustration = vDirLower.includes("ilustrasi") || vDirLower.includes("gambar") || vDirLower.includes("illustration");
      visualReq = {
        type: isIllustration ? "generate_new_illustration" : "diagram",
        description: sanitizePromptText(rawSlide.visualDirection),
        placement: "right",
        requiresGeneratedIllustration: isIllustration,
      };
    }

    slidePlan.push({
      id: rawSlide.id,
      slideOrder,
      slideTitle: sanitizePromptText(rawSlide.slideTitle),
      purpose: sanitizePromptText(rawSlide.purpose),
      pedagogicalType,
      keyPoints: (rawSlide.keyPoints || []).map((kp) => sanitizePromptText(kp)),
      contentBlocks: normalizedBlocks,
      visualDirection: sanitizePromptText(rawSlide.visualDirection || ""),
      visualRequirements: visualReq,
      sourceReferences: rawSlide.sourceReferences || [],
      evidenceReferences: rawSlide.evidenceReferences || [],
      speakerNotesDirection: rawSlide.speakerNotesDirection
        ? sanitizePromptText(rawSlide.speakerNotesDirection)
        : undefined,
    });
  }

  // 9. Assemble Deterministic Content Blueprint
  const contentBlueprint = assemblePresentationContentBlueprint(
    outline,
    styleDef,
    validatedParams
  );

  // 10. Construct Canonical Presentation Generation Request
  const requestId = `req_ppt_${uid()}`;
  const now = new Date().toISOString();

  const canonicalRequest: PresentationGenerationRequest = {
    requestId,
    generationPlanId: plan.id,
    moduleId: plan.moduleId,
    targetType: "presentation",
    created_by: context.userId,
    createdBy: context.userId,
    approvedOutlineVersion: plan.approvedVersion,
    approvedOutline: outline,
    styleId: styleDef.id,
    styleVersion: styleDef.version,
    styleDefinition: styleDef,
    styleSnapshot: {
      ...styleDef,
      styleId: styleDef.id,
      styleVersion: styleDef.version,
    },
    sourceReferences: outline.sourceReferences || [],
    evidenceReferences: outline.evidenceReferences || [],
    presentationParameters: validatedParams,
    parameters: validatedParams,
    slidePlan,
    contentBlueprint,
    blueprint: contentBlueprint,
    status: "prepared",
    createdAt: now,
  };

  return validatePresentationGenerationRequest(canonicalRequest);
}
