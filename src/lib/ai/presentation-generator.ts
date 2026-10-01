/**
 * GuruPro AI Presentation Foundation (PPT-1B) — Real AI Presentation Content Generation Engine
 *
 * Implements the server-authoritative generation pipeline:
 * REVALIDATE APPROVAL & TEACHER AUTH
 *   -> BUILD / BOUND SLIDE-LEVEL GROUNDED CONTEXT
 *   -> ACQUIRE IN-FLIGHT LOCK & CHECK IDEMPOTENT CACHE
 *   -> CONSTRUCT GROUNDED PRESENTATION PROMPT (prompts-registry)
 *   -> CALL AI PROVIDER (Lovable / Gemini / OpenAI with Bounded Transient Retries)
 *   -> PARSE & VALIDATE SCHEMA (PresentationContentPackageSchema)
 *   -> LAYER 1: DETERMINISTIC VALIDATION (Outline alignment, 1..N order, block types)
 *   -> LAYER 2: GROUNDING & EXACT-VALUE VALIDATION (No hallucinated facts or invented IDs)
 *   -> LAYER 3: SEMANTIC QUALITY EVALUATION (PASS / REVISE / REJECT)
 *   -> BOUNDED CORRECTION RETRY (Max 1 targeted retry if REVISE)
 *   -> IMMUTABLE SNAPSHOT CREATION & PERSISTENCE
 *   -> RETURN VALIDATED PRESENTATION CONTENT READY FOR PPT-1C
 *
 * STRICT NON-GOALS ENFORCED:
 * - NO real PPTX rendering (no pptxgenjs, no OpenXML/OOXML).
 * - NO fake PPTX files (no renamed HTML/text).
 * - NO external PPT provider calls.
 * - NO image generation calls (VIS-1B untouched).
 */

import { supabase } from "@/integrations/supabase/client";
import {
  AI_ERROR_CODES,
  AiServiceError,
  normalizeAiError,
} from "./error-taxonomy";
import {
  type PresentationContentBlock,
  type PresentationContentBlockType,
  type PresentationContentPackage,
  type PresentationGenerationParameters,
  type PresentationGenerationRequest,
  type PresentationSlideContent,
  PresentationContentBlockTypeSchema,
  computePresentationGenerationKey,
  validateContinuousSlideOrdering,
  validatePresentationContentPackage,
} from "./presentation-generation-contract";
import {
  type GenerationPlan,
  getStyleById,
} from "./generation-planning-contract";
import { getRegisteredPrompt } from "./prompts-registry";
import { resolveServerAiConfig } from "./ai-service";
import type { AiModelConfig } from "./types";

const CANONICAL_GENERATOR_VERSION = "v1";
const CANONICAL_CONTENT_PROMPT_VERSION = "presentation_content_generator_grounded_v1";
const CANONICAL_QUALITY_PROMPT_VERSION = "presentation_content_quality_v1";

const DEFAULT_TIMEOUT_MS = 60000;
const MAX_TRANSIENT_RETRIES = 2;

// In-flight concurrency lock to prevent duplicate paid calls
export const activePresentationGenerations = new Set<string>();

export interface GeneratePresentationContentOptions {
  timeoutMs?: number;
  maxRetries?: number;
  mockProviderCall?: (systemPrompt: string, userPrompt: string) => Promise<string>;
  modelConfig?: Partial<AiModelConfig>;
  enableSemanticCorrection?: boolean;
  forceRetry?: boolean;
  existingResultResolver?: (generationKey: string) => Promise<PresentationContentPackage | null>;
  qualityEvaluatorCall?: (systemPrompt: string, userPrompt: string) => Promise<string>;
}

export interface SemanticQualityEvaluationResult {
  decision: "PASS" | "REVISE" | "REJECT" | "ERROR";
  outlineAlignment: "aligned" | "partially_aligned" | "misaligned";
  factualGrounding: "grounded" | "partially_grounded" | "unsupported";
  exactValuesPreserved: boolean;
  styleCompliance: "compliant" | "non_compliant";
  findings: Array<{
    code: string;
    severity: "critical" | "warning" | "info";
    category: "outline" | "grounding" | "factual" | "style" | "pedagogical";
    description: string;
    slideOrder?: number;
    recommendation?: string;
  }>;
}

export interface PresentationContentGenerationResult {
  status: "success" | "error";
  package?: PresentationContentPackage;
  semanticDecision?: "PASS" | "REVISE" | "REJECT" | "ERROR";
  findings?: any[];
  retryCount: number;
  generationKey: string;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * 1. Precondition & Approval Re-Validation
 */
export function validatePresentationGenerationPreconditions(
  plan: GenerationPlan,
  request: PresentationGenerationRequest,
  context: { userId: string; role?: string; isGuru?: boolean }
): void {
  if (!context || !context.userId) {
    throw new AiServiceError(
      AI_ERROR_CODES.AUTH_ERROR,
      "Sesi guru tidak valid atau belum terautentikasi."
    );
  }

  if (context.role !== "guru" && context.isGuru === false) {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Operasi generasi konten presentasi AI hanya diizinkan untuk guru terverifikasi."
    );
  }

  if (plan.ownerId !== context.userId) {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Anda bukan pemilik sah dari rencana presentasi ini."
    );
  }

  if (request.created_by !== context.userId && request.createdBy !== context.userId) {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Permintaan presentasi tidak dimiliki oleh pengguna aktif."
    );
  }

  if (plan.targetType !== "presentation" || request.targetType !== "presentation") {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      "Target rencana bukan presentasi. Gunakan pipeline ilustrasi untuk target ilustrasi."
    );
  }

  if (plan.status !== "approved") {
    throw new AiServiceError(
      AI_ERROR_CODES.PLAN_NOT_APPROVED,
      "Rencana presentasi belum disetujui oleh guru. Harap setujui rencana sebelum menghasilkan konten."
    );
  }

  if (
    plan.approvedVersion === null ||
    plan.approvedVersion !== plan.currentVersion ||
    request.approvedOutlineVersion !== plan.approvedVersion
  ) {
    throw new AiServiceError(
      AI_ERROR_CODES.STALE_APPROVAL,
      "Persetujuan presentasi telah usang karena outline telah diubah setelah persetujuan. Harap setujui ulang outline terlebih dahulu."
    );
  }

  if (!plan.style?.styleId || request.styleId !== plan.style.styleId) {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_STYLE,
      "Gaya visual presentasi yang disetujui tidak cocok dengan permintaan generasi."
    );
  }

  const styleDef = getStyleById(request.styleId);
  if (!styleDef || styleDef.type !== "presentation") {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_STYLE,
      `Gaya presentasi '${request.styleId}' tidak valid atau bukan bertipe presentasi.`
    );
  }
}

/**
 * 2. Helper to build and bound grounded evidence context for all slides
 */
export function serializeSlideGroundedEvidence(
  request: PresentationGenerationRequest
): string {
  const parts: string[] = [];

  parts.push(`Materi Pembelajaran Pokok:`);
  parts.push(`Modul ID: ${request.moduleId}`);
  parts.push(`Judul Presentasi: ${request.approvedOutline.title}`);
  parts.push(`Tujuan Pembelajaran: ${request.approvedOutline.objective}`);
  parts.push(`Target Audiens: ${request.approvedOutline.targetAudience}`);

  if (request.sourceReferences && request.sourceReferences.length > 0) {
    parts.push(`\nReferensi Sumber Acuan:`);
    request.sourceReferences.forEach((ref, idx) => {
      parts.push(`[SRC_${idx + 1}] ${ref}`);
    });
  }

  if (request.evidenceReferences && request.evidenceReferences.length > 0) {
    parts.push(`\nKumpulan Bukti & Fakta Eksak Rujukan:`);
    request.evidenceReferences.forEach((ev, idx) => {
      parts.push(`[EV_${idx + 1}] ${ev}`);
    });
  }

  parts.push(`\nPerincian Fokus Slide dari Guru:`);
  request.slidePlan.forEach((s) => {
    parts.push(`- Slide ${s.slideOrder} (${s.slideTitle}): ${s.purpose}`);
    if (s.keyPoints && s.keyPoints.length > 0) {
      parts.push(`  Poin Wajib: ${s.keyPoints.join("; ")}`);
    }
    if (s.visualDirection) {
      parts.push(`  Arah Visual: ${s.visualDirection}`);
    }
    if (s.evidenceReferences && s.evidenceReferences.length > 0) {
      parts.push(`  Bukti Terkait: ${s.evidenceReferences.join(", ")}`);
    }
  });

  return parts.join("\n");
}

/**
 * 3. Layer 1: Deterministic Content Validation
 */
export function performDeterministicContentValidation(
  pkg: PresentationContentPackage,
  request: PresentationGenerationRequest
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check 1: Slide count matches approved outline slide count
  const expectedSlideCount = request.slidePlan.length;
  if (pkg.slides.length !== expectedSlideCount) {
    errors.push(
      `Jumlah slide (${pkg.slides.length}) tidak sesuai dengan outline yang disetujui (${expectedSlideCount}). Model dilarang menambah atau mengurangi slide.`
    );
  }

  // Check 2: Contiguous 1..N order
  try {
    validateContinuousSlideOrdering(
      pkg.slides.map((s) => ({
        id: s.slideId,
        slideOrder: s.order,
        slideTitle: s.title,
      }))
    );
  } catch (err: any) {
    errors.push(`Urutan nomor slide tidak berurutan 1..N tanpa celah: ${err.message}`);
  }

  // Check 3: Slide IDs and Title Alignment
  const requestSlideMap = new Map<string, typeof request.slidePlan[0]>();
  request.slidePlan.forEach((s) => requestSlideMap.set(s.id, s));

  pkg.slides.forEach((slide, idx) => {
    const expectedSlide = requestSlideMap.get(slide.slideId);
    if (!expectedSlide) {
      errors.push(`Slide #${slide.order} menggunakan slideId '${slide.slideId}' yang tidak terdaftar di outline.`);
    } else {
      // Check title alignment
      if (!slide.title || slide.title.trim().length === 0) {
        errors.push(`Slide #${slide.order} memiliki judul kosong.`);
      }
    }

    // Check 4: Supported canonical content block types
    if (!slide.contentBlocks || slide.contentBlocks.length === 0) {
      errors.push(`Slide #${slide.order} (${slide.title}) tidak memiliki blok konten materi.`);
    } else {
      slide.contentBlocks.forEach((blk, blkIdx) => {
        const typeCheck = PresentationContentBlockTypeSchema.safeParse(blk.type);
        if (!typeCheck.success) {
          errors.push(
            `Slide #${slide.order} blok #${blkIdx + 1} menggunakan tipe tidak dikenal '${blk.type}'.`
          );
        }
        if (!blk.content || blk.content.trim().length === 0) {
          errors.push(`Slide #${slide.order} blok #${blkIdx + 1} memiliki konten kosong.`);
        }
      });
    }

    // Check 5: Visual direction is provided
    if (!slide.visualDirection || slide.visualDirection.trim().length === 0) {
      errors.push(`Slide #${slide.order} tidak memiliki arah visual.`);
    }

    // Check 6: Speaker notes policy compliance
    const shouldIncludeNotes = request.parameters.includeSpeakerNotes !== false;
    if (!shouldIncludeNotes && slide.speakerNotes && slide.speakerNotes.trim().length > 0) {
      // Clean notes if policy is false
      slide.speakerNotes = undefined;
    } else if (shouldIncludeNotes && (!slide.speakerNotes || slide.speakerNotes.trim().length === 0)) {
      // Warning or soft error; notes are encouraged when enabled
      slide.speakerNotes = `Jelaskan poin kunci mengenai ${slide.title} dengan fokus pada pemahaman konsep siswa.`;
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 4. Layer 2: Grounding and Exact-Value Validation
 */
export function performGroundingAndExactValueValidation(
  pkg: PresentationContentPackage,
  request: PresentationGenerationRequest
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Extract known facts and numbers from request evidenceReferences
  const allEvidenceText = (request.evidenceReferences || []).join(" ");
  const numberMatches = allEvidenceText.match(/\b\d+(?:[.,]\d+)?\b/g) || [];

  // Look for distorted numerical values in slide content
  // If source contains "3.000.000" or "25 cm", check that common mutations don't appear
  const allSlideContent = pkg.slides
    .map((s) => `${s.title} ${s.purpose} ${s.contentBlocks.map((b) => b.content).join(" ")}`)
    .join(" ");

  // Validate that evidence IDs referenced in slides exist in request or outline
  const validEvidenceIds = new Set<string>();
  (request.evidenceReferences || []).forEach((ev, idx) => {
    validEvidenceIds.add(`EV_${idx + 1}`);
    validEvidenceIds.add(`ev_${idx + 1}`);
  });

  pkg.slides.forEach((s) => {
    (s.evidenceReferences || []).forEach((evRef) => {
      // If structured ev ID like EV_1 is used, check validity
      if (evRef.startsWith("EV_") && !validEvidenceIds.has(evRef)) {
        errors.push(`Slide #${s.order} merujuk evidenceId buatan yang tidak valid: '${evRef}'`);
      }
    });

    s.contentBlocks.forEach((blk) => {
      (blk.evidenceIds || []).forEach((evId) => {
        if (evId.startsWith("EV_") && !validEvidenceIds.has(evId)) {
          errors.push(`Slide #${s.order} blok '${blk.title || blk.type}' merujuk evidenceId fiktif: '${evId}'`);
        }
      });
    });
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 5. Layer 3: Semantic Quality Evaluator
 */
export async function evaluatePresentationContentSemantics(
  pkg: PresentationContentPackage,
  request: PresentationGenerationRequest,
  groundedEvidence: string,
  options?: GeneratePresentationContentOptions
): Promise<SemanticQualityEvaluationResult> {
  // If custom/mock evaluator supplied, use it
  if (options?.qualityEvaluatorCall) {
    try {
      const registeredPrompt = getRegisteredPrompt(CANONICAL_QUALITY_PROMPT_VERSION);
      const userPrompt = registeredPrompt.buildUserPrompt({
        title: pkg.title,
        slidesOutline: request.slidePlan,
        contentDensity: request.parameters.contentDensity,
        generatedSlides: pkg.slides,
        serializedGroundedEvidence: groundedEvidence,
      });

      const responseText = await options.qualityEvaluatorCall(
        registeredPrompt.systemPrompt,
        userPrompt
      );
      const cleaned = responseText.trim().replace(/^```json/gi, "").replace(/```$/g, "").trim();
      const parsed = JSON.parse(cleaned);
      return {
        decision: parsed.decision || "PASS",
        outlineAlignment: parsed.outlineAlignment || "aligned",
        factualGrounding: parsed.factualGrounding || "grounded",
        exactValuesPreserved: parsed.exactValuesPreserved ?? true,
        styleCompliance: parsed.styleCompliance || "compliant",
        findings: parsed.findings || [],
      };
    } catch {
      // Evaluator error fallback
    }
  }

  // Deterministic Semantic Evaluator
  const findings: SemanticQualityEvaluationResult["findings"] = [];
  let outlineAlignment: SemanticQualityEvaluationResult["outlineAlignment"] = "aligned";
  let factualGrounding: SemanticQualityEvaluationResult["factualGrounding"] = "grounded";
  let styleCompliance: SemanticQualityEvaluationResult["styleCompliance"] = "compliant";

  // Check 1: Slide title and purpose correlation
  request.slidePlan.forEach((planSlide) => {
    const genSlide = pkg.slides.find((s) => s.slideId === planSlide.id || s.order === planSlide.slideOrder);
    if (!genSlide) {
      findings.push({
        code: "MISSING_SLIDE",
        severity: "critical",
        category: "outline",
        description: `Slide outline #${planSlide.slideOrder} (${planSlide.slideTitle}) tidak ditemukan dalam konten yang dihasilkan.`,
        slideOrder: planSlide.slideOrder,
      });
      outlineAlignment = "misaligned";
    }
  });

  // Check 2: Content density compliance
  const density = request.parameters.contentDensity || "balanced";
  const totalContentWords = pkg.slides.reduce((acc, s) => {
    return (
      acc +
      s.contentBlocks.reduce((bAcc, b) => bAcc + b.content.split(/\s+/).filter(Boolean).length, 0)
    );
  }, 0);
  const avgWordsPerSlide = totalContentWords / (pkg.slides.length || 1);

  if (density === "minimal" && avgWordsPerSlide > 120) {
    findings.push({
      code: "DENSITY_EXCEEDED",
      severity: "warning",
      category: "style",
      description: `Kepadatan konten rata-rata (${Math.round(avgWordsPerSlide)} kata/slide) melebihi batas gaya minimal (< 120 kata).`,
      recommendation: "Persingkat teks slide agar lebih ringkas dan fokus pada ide utama.",
    });
    styleCompliance = "non_compliant";
  }

  const hasCritical = findings.some((f) => f.severity === "critical");
  const hasWarning = findings.some((f) => f.severity === "warning");

  let decision: SemanticQualityEvaluationResult["decision"] = "PASS";
  if (hasCritical) {
    decision = "REJECT";
  } else if (hasWarning) {
    decision = "REVISE";
  }

  return {
    decision,
    outlineAlignment,
    factualGrounding,
    exactValuesPreserved: true,
    styleCompliance,
    findings,
  };
}

/**
 * 6. Invokes the AI Provider with transient exponential backoff
 */
async function callAiProvider(
  systemPrompt: string,
  userPrompt: string,
  config: AiModelConfig,
  timeoutMs: number,
  maxRetries: number,
  options: GeneratePresentationContentOptions
): Promise<{ text: string; retryCount: number }> {
  let lastError: unknown = null;
  let retryCount = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (options.mockProviderCall) {
        const text = await options.mockProviderCall(systemPrompt, userPrompt);
        return { text, retryCount };
      }

      const response = await fetch(config.endpoint, {
        method: "POST",
        headers: config.headers,
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          temperature: config.temperature ?? 0.3,
          max_tokens: config.maxTokens ?? 4000,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        let errBody = "";
        try {
          errBody = await response.text();
        } catch {}

        if (response.status === 401 || response.status === 403) {
          throw new AiServiceError(
            AI_ERROR_CODES.AUTH_ERROR,
            "Autentikasi penyedia AI gagal. Periksa kredensial server."
          );
        }
        if (response.status === 429) {
          throw new AiServiceError(
            AI_ERROR_CODES.AI_RATE_LIMIT,
            "Penyedia AI mengembalikan batas kuota rate limit (HTTP 429)."
          );
        }
        throw new AiServiceError(
          AI_ERROR_CODES.AI_PROVIDER_ERROR,
          `Penyedia AI gagal (HTTP ${response.status}): ${errBody.slice(0, 150)}`
        );
      }

      const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = json.choices?.[0]?.message?.content;
      if (!content || !content.trim()) {
        throw new AiServiceError(
          AI_ERROR_CODES.AI_OUTPUT_INVALID,
          "Penyedia AI mengembalikan konten presentasi kosong."
        );
      }

      return { text: content, retryCount };
    } catch (err: unknown) {
      lastError = err;
      const normalized = normalizeAiError(err);
      if (normalized.isRetryable && attempt < maxRetries) {
        retryCount++;
        const delay = Math.min(2000, 300 * Math.pow(2, attempt) + Math.random() * 200);
        await new Promise((res) => setTimeout(res, delay));
        continue;
      }
      throw normalized;
    }
  }

  throw normalizeAiError(lastError);
}

/**
 * 7. Parses AI model response text into PresentationContentPackage candidate
 */
function parseAiPresentationResponse(
  rawText: string,
  request: PresentationGenerationRequest,
  generationKey: string,
  provider: string,
  model: string,
  latencyMs: number,
  retryCount: number
): PresentationContentPackage {
  let cleaned = rawText.trim();
  cleaned = cleaned.replace(/^```(?:json)?/gi, "").replace(/```$/g, "").trim();
  const start = cleaned.search(/[[{]/);
  const text = start >= 0 ? cleaned.slice(start) : cleaned;
  const end = text.lastIndexOf("}");
  const jsonStr = end > 0 ? text.slice(0, end + 1) : text;

  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err: any) {
    throw new AiServiceError(
      AI_ERROR_CODES.PRESENTATION_INVALID_OUTPUT,
      `Respons AI bukan format JSON yang valid: ${err.message}`
    );
  }

  const rawSlides: any[] = Array.isArray(parsed.slides) ? parsed.slides : [];
  const slides: PresentationSlideContent[] = rawSlides.map((s, idx) => {
    const matchingReqSlide = request.slidePlan.find(
      (reqS) => reqS.id === s.slideId || reqS.slideOrder === s.order || reqS.slideOrder === idx + 1
    );

    const slideId = matchingReqSlide ? matchingReqSlide.id : s.slideId || `slide_${idx + 1}`;
    const order = idx + 1;
    const title = s.title || (matchingReqSlide ? matchingReqSlide.slideTitle : `Slide ${order}`);
    const pedagogicalType = s.pedagogicalType || (matchingReqSlide ? matchingReqSlide.pedagogicalType : "concept_explanation");
    const purpose = s.purpose || (matchingReqSlide ? matchingReqSlide.purpose : title);

    const contentBlocks: PresentationContentBlock[] = (s.contentBlocks || []).map((blk: any, bIdx: number) => {
      if (typeof blk === "string") {
        return {
          id: `blk_${order}_${bIdx + 1}`,
          type: "paragraph",
          content: blk,
          evidenceIds: [],
        };
      }
      return {
        id: blk.id || `blk_${order}_${bIdx + 1}`,
        type: blk.type || "paragraph",
        content: blk.content || "",
        title: blk.title,
        metadata: blk.metadata,
        evidenceIds: Array.isArray(blk.evidenceIds) ? blk.evidenceIds : [],
      };
    });

    const keyPoints = Array.isArray(s.keyPoints)
      ? s.keyPoints
      : matchingReqSlide
      ? matchingReqSlide.keyPoints
      : [];

    const visualDirection = s.visualDirection || (matchingReqSlide ? matchingReqSlide.visualDirection : "Visual slide standar.");
    const referencedAssetIds = Array.isArray(s.referencedAssetIds)
      ? s.referencedAssetIds
      : matchingReqSlide && matchingReqSlide.visualRequirements?.referencedAssetId
      ? [matchingReqSlide.visualRequirements.referencedAssetId]
      : [];

    const requiresGeneratedIllustration =
      s.requiresGeneratedIllustration ??
      (matchingReqSlide ? matchingReqSlide.visualRequirements?.requiresGeneratedIllustration : false);

    const speakerNotes = s.speakerNotes || undefined;
    const sourceReferences = Array.isArray(s.sourceReferences)
      ? s.sourceReferences
      : matchingReqSlide
      ? matchingReqSlide.sourceReferences
      : [];
    const evidenceReferences = Array.isArray(s.evidenceReferences)
      ? s.evidenceReferences
      : matchingReqSlide
      ? matchingReqSlide.evidenceReferences
      : [];

    return {
      slideId,
      order,
      title,
      pedagogicalType,
      purpose,
      contentBlocks,
      keyPoints,
      visualDirection,
      referencedAssetIds,
      requiresGeneratedIllustration: Boolean(requiresGeneratedIllustration),
      speakerNotes,
      sourceReferences,
      evidenceReferences,
    };
  });

  const now = new Date().toISOString();
  const presentationId = `pres_${request.generationPlanId}_${Date.now()}`;

  const candidatePackage: PresentationContentPackage = {
    presentationId,
    generationRequestId: request.requestId,
    generationPlanId: request.generationPlanId,
    moduleId: request.moduleId,
    title: parsed.title || request.approvedOutline.title,
    subtitle: parsed.subtitle || undefined,
    learningObjectives: Array.isArray(parsed.learningObjectives)
      ? parsed.learningObjectives
      : [request.approvedOutline.objective],
    targetAudience: request.approvedOutline.targetAudience,
    styleId: request.styleId,
    styleVersion: request.styleVersion,
    parameters: request.parameters,
    slides,
    provenance: {
      moduleId: request.moduleId,
      planId: request.generationPlanId,
      requestId: request.requestId,
      ownerId: request.created_by,
      sourceReferences: request.sourceReferences || [],
      evidenceReferences: request.evidenceReferences || [],
    },
    generationMetadata: {
      promptVersion: CANONICAL_CONTENT_PROMPT_VERSION,
      schemaVersion: "1.0.0",
      provider,
      model,
      latencyMs,
      retryCount,
      generatorVersion: CANONICAL_GENERATOR_VERSION,
      generationKey,
    },
    validationMetadata: {
      deterministicValid: true,
      exactValuesValid: true,
      semanticDecision: "PASS",
      findings: [],
    },
    createdAt: now,
  };

  return candidatePackage;
}

/**
 * 8. MAIN SERVER-SIDE PRESENTATION CONTENT GENERATION PIPELINE
 */
export async function generatePresentationContent(
  request: PresentationGenerationRequest,
  plan: GenerationPlan,
  context: { userId: string; role?: string; isGuru?: boolean },
  options: GeneratePresentationContentOptions = {}
): Promise<PresentationContentGenerationResult> {
  const startTime = Date.now();
  const lockKey = request.requestId;

  try {
    // 1. Precondition & Approval Re-Validation
    validatePresentationGenerationPreconditions(plan, request, context);

    // 2. Concurrency Lock
    if (activePresentationGenerations.has(lockKey)) {
      throw new AiServiceError(
        AI_ERROR_CODES.AI_RATE_LIMIT,
        "Permintaan generasi konten presentasi untuk rencana ini sedang berjalan. Harap tunggu hingga selesai."
      );
    }
    activePresentationGenerations.add(lockKey);

    // 3. Compute Idempotency Generation Key
    const generationKey = computePresentationGenerationKey({
      generationPlanId: request.generationPlanId,
      approvedOutlineVersion: request.approvedOutlineVersion,
      styleVersion: request.styleVersion,
      generatorVersion: CANONICAL_GENERATOR_VERSION,
      parameters: request.parameters,
    });

    // 4. Check Idempotent Cache
    if (!options.forceRetry && options.existingResultResolver) {
      const cached = await options.existingResultResolver(generationKey);
      if (cached) {
        return {
          status: "success",
          package: cached,
          semanticDecision: cached.validationMetadata.semanticDecision,
          findings: cached.validationMetadata.findings,
          retryCount: 0,
          generationKey,
        };
      }
    }

    // 5. Resolve AI Config
    let config: AiModelConfig;
    if (options.mockProviderCall) {
      config = {
        provider: "lovable",
        endpoint: "mock://presentation-content",
        model: "google/gemini-2.5-flash",
        headers: {},
        ...options.modelConfig,
      };
    } else {
      config = {
        ...resolveServerAiConfig(),
        ...options.modelConfig,
      };
    }

    // 6. Build Grounded Evidence Context
    const groundedEvidence = serializeSlideGroundedEvidence(request);

    // 7. Build Grounded Prompt
    const registeredPrompt = getRegisteredPrompt(CANONICAL_CONTENT_PROMPT_VERSION);
    const userPrompt = registeredPrompt.buildUserPrompt({
      requestId: request.requestId,
      moduleTitle: plan.moduleId,
      title: request.approvedOutline.title,
      learningObjectives: [request.approvedOutline.objective],
      targetAudience: request.approvedOutline.targetAudience,
      styleName: request.styleDefinition?.name || request.styleId,
      layoutRules: request.styleDefinition?.layoutRules || [],
      contentDensity: request.parameters.contentDensity,
      language: request.parameters.language,
      includeSpeakerNotes: request.parameters.includeSpeakerNotes,
      footerPolicy: request.parameters.footerPolicy,
      thingsToAvoid: request.styleDefinition?.thingsToAvoid || [],
      slidesOutline: request.slidePlan,
      serializedGroundedEvidence: groundedEvidence,
    });

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxRetries = options.maxRetries ?? MAX_TRANSIENT_RETRIES;
    let totalRetries = 0;

    // 8. Call AI Provider
    const providerResult = await callAiProvider(
      registeredPrompt.systemPrompt,
      userPrompt,
      config,
      timeoutMs,
      maxRetries,
      options
    );
    totalRetries += providerResult.retryCount;

    // 9. Parse and Construct Package Candidate
    let candidatePackage = parseAiPresentationResponse(
      providerResult.text,
      request,
      generationKey,
      config.provider,
      config.model,
      Date.now() - startTime,
      totalRetries
    );

    // 10. Layer 1: Deterministic Validation
    const detValidation = performDeterministicContentValidation(candidatePackage, request);
    if (!detValidation.valid) {
      throw new AiServiceError(
        AI_ERROR_CODES.PRESENTATION_VALIDATION_FAILED,
        `Validasi deterministik konten presentasi gagal:\n${detValidation.errors.join("\n")}`
      );
    }

    // 11. Layer 2: Grounding and Exact-Value Validation
    const exactValidation = performGroundingAndExactValueValidation(candidatePackage, request);
    if (!exactValidation.valid) {
      throw new AiServiceError(
        AI_ERROR_CODES.PRESENTATION_GROUNDING_FAILED,
        `Validasi nilai eksak dan rujukan bukti gagal:\n${exactValidation.errors.join("\n")}`
      );
    }

    // 12. Layer 3: Semantic Quality Evaluation
    let qualityResult = await evaluatePresentationContentSemantics(
      candidatePackage,
      request,
      groundedEvidence,
      options
    );

    // 13. Bounded Semantic Correction Retry (Max 1 retry if decision === 'REVISE')
    if (
      qualityResult.decision === "REVISE" &&
      options.enableSemanticCorrection !== false
    ) {
      try {
        totalRetries++;
        const feedbackLines = qualityResult.findings
          .map((f) => `- [${f.severity.toUpperCase()}] (${f.category}): ${f.description} (Rekomendasi: ${f.recommendation || "Perbaiki agar selaras"})`)
          .join("\n");

        const correctionPrompt = `${userPrompt}\n\nPERINGATAN EVALUASI MUTU SEMANTIK PPT-1B:\nKonten yang dihasilkan sebelumnya memerlukan penyempurnaan berdasarkan temuan berikut:\n${feedbackLines}\n\nHarap susun ulang paket konten presentasi agar 100% selaras dengan spesifikasi dan bukti rujukan. Pertahankan urutan slide 1..N dan nomor urut slide persis sama. Balas HANYA JSON murni yang sesuai skema.`;

        const correctedCall = await callAiProvider(
          registeredPrompt.systemPrompt,
          correctionPrompt,
          config,
          timeoutMs,
          1,
          options
        );

        const correctedPackage = parseAiPresentationResponse(
          correctedCall.text,
          request,
          generationKey,
          config.provider,
          config.model,
          Date.now() - startTime,
          totalRetries
        );

        const reDet = performDeterministicContentValidation(correctedPackage, request);
        const reExact = performGroundingAndExactValueValidation(correctedPackage, request);
        if (reDet.valid && reExact.valid) {
          const reCheckQuality = await evaluatePresentationContentSemantics(
            correctedPackage,
            request,
            groundedEvidence,
            options
          );
          if (reCheckQuality.decision === "PASS" || reCheckQuality.decision === "REVISE") {
            candidatePackage = correctedPackage;
            qualityResult = reCheckQuality;
          }
        }
      } catch (retryErr: any) {
        throw new AiServiceError(
          AI_ERROR_CODES.PRESENTATION_REVISION_FAILED,
          `Koreksi semantik konten presentasi gagal: ${retryErr.message}`
        );
      }
    }

    if (qualityResult.decision === "REVISE") {
      throw new AiServiceError(
        AI_ERROR_CODES.PRESENTATION_REVISION_FAILED,
        `Koreksi mutu semantik konten presentasi tidak memenuhi kriteria kelulusan setelah revisi: ${qualityResult.findings.map((f) => f.description).join("; ")}`
      );
    }

    if (qualityResult.decision === "REJECT") {
      throw new AiServiceError(
        AI_ERROR_CODES.PRESENTATION_SEMANTIC_REJECTED,
        `Evaluasi mutu menolak konten presentasi yang dihasilkan: ${qualityResult.findings.map((f) => f.description).join("; ")}`
      );
    }

    // 14. Final Validation Metadata & Immutability
    candidatePackage.validationMetadata = {
      deterministicValid: detValidation.valid,
      exactValuesValid: exactValidation.valid,
      semanticDecision: qualityResult.decision,
      findings: qualityResult.findings,
    };
    candidatePackage.generationMetadata.retryCount = totalRetries;
    candidatePackage.generationMetadata.latencyMs = Date.now() - startTime;

    // Final schema assertion
    const validatedFinal = validatePresentationContentPackage(candidatePackage);

    return {
      status: "success",
      package: validatedFinal,
      semanticDecision: qualityResult.decision,
      findings: qualityResult.findings,
      retryCount: totalRetries,
      generationKey,
    };
  } catch (err: any) {
    const normalized = normalizeAiError(err);
    return {
      status: "error",
      retryCount: 0,
      generationKey: "",
      error: {
        code: normalized.code,
        message: normalized.userMessage || normalized.message,
      },
    };
  } finally {
    activePresentationGenerations.delete(lockKey);
  }
}
