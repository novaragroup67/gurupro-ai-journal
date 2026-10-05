/**
 * ==============================================================================
 * GURUPRO AI: PRESENTATION GENERATION CONTRACT (PPT-1A)
 * ==============================================================================
 *
 * Canonical provider-agnostic domain contract, request specifications,
 * parameter schemas, structured slide plan schemas, visual asset requirements,
 * and content blueprint models for AI Presentation Generation.
 *
 * Invariants:
 * 1. Strict Target Enforcement: ONLY targetType === "presentation" is allowed.
 * 2. Immutable Approved Specification: Must originate from teacher-approved GEN-0 plan.
 * 3. Continuous Slide Ordering: Strictly continuous 1..N order with no gaps or duplicates.
 * 4. Structured Slide Contract: Preserves titles, purposes, content blocks, and visual requirements.
 * 5. Grounding & Provenance: Module-level and slide-level source/evidence references preserved.
 * 6. Visual Asset Integration: Supports referencing existing illustration assets without binary duplication.
 * 7. Strict Non-Generation: PPT-1A prepares the contract only. NO PPTX rendering or AI API calls.
 */

import { z } from "zod";
import { AI_ERROR_CODES, AiServiceError } from "./error-taxonomy";
import {
  PresentationOutlineSchema,
  type PresentationOutline,
  PresentationSlideSchema,
  type PresentationSlide,
  GenerationStyleSchema,
  type GenerationStyle,
} from "./generation-planning-contract";

// ==============================================================================
// 1. PRESENTATION PARAMETERS & CONFIGURATION
// ==============================================================================

export const PresentationAspectRatioSchema = z.enum(["16:9", "4:3"]);
export type PresentationAspectRatio = z.infer<typeof PresentationAspectRatioSchema>;

export const PresentationSlideDimensionSchema = z.object({
  width: z.number().int().min(640).max(3840),
  height: z.number().int().min(480).max(2160),
});
export type PresentationSlideDimension = z.infer<typeof PresentationSlideDimensionSchema>;

export const PresentationSlideSizeSchema = z.union([
  PresentationSlideDimensionSchema,
  z.enum(["1920x1080", "1440x1080", "1024x768", "standard"]),
]);
export type PresentationSlideSize = z.infer<typeof PresentationSlideSizeSchema>;

export const PresentationContentDensitySchema = z.enum([
  "minimal",   // Minimal text, large emphasis on key concept or visual
  "balanced",  // Standard balanced educational density
  "detailed",  // Rich instructional notes, definitions, and multiple bullet points
]);
export type PresentationContentDensity = z.infer<typeof PresentationContentDensitySchema>;

export const PresentationLanguageSchema = z.enum(["id", "en"]);
export type PresentationLanguage = z.infer<typeof PresentationLanguageSchema>;

export const PresentationFooterPolicySchema = z.enum([
  "none",
  "title_only",
  "standard",
  "minimal",
  "full",
]);
export type PresentationFooterPolicy = z.infer<typeof PresentationFooterPolicySchema>;

export const PresentationGenerationParametersSchema = z.object({
  aspectRatio: PresentationAspectRatioSchema.default("16:9"),
  slideSize: PresentationSlideSizeSchema.default("standard"),
  intendedSlideCount: z.number().int().min(1).max(50).optional(),
  language: PresentationLanguageSchema.default("id"),
  contentDensity: PresentationContentDensitySchema.default("balanced"),
  includeSpeakerNotes: z.boolean().default(true),
  includePageNumbering: z.boolean().default(true),
  footerPolicy: PresentationFooterPolicySchema.default("standard"),
  slideVisualOverrides: z.record(z.any()).optional(),
  providerExtension: z.record(z.any()).default({}),
});
export type PresentationGenerationParameters = z.infer<
  typeof PresentationGenerationParametersSchema
>;

// ==============================================================================
// 2. SLIDE CONTENT BLOCKS & PEDAGOGICAL STRUCTURE
// ==============================================================================

export const PresentationContentBlockTypeSchema = z.enum([
  "text",
  "paragraph",
  "key_value",
  "bullet_list",
  "numbered_list",
  "quote",
  "definition",
  "example",
  "process",
  "comparison",
  "comparison_column",
  "table",
  "diagram",
  "diagram_placeholder",
  "code_snippet",
  "stat_metric",
  "timeline_step",
  "formula_block",
  "reflection_prompt",
  "activity_instruction",
  "callout",
  "image",
  "summary",
  "key_stat",
]);
export type PresentationContentBlockType = z.infer<
  typeof PresentationContentBlockTypeSchema
>;

export const PresentationContentBlockSchema = z.object({
  id: z.string().optional(),
  type: PresentationContentBlockTypeSchema.default("paragraph"),
  content: z.string().min(1, "Konten blok tidak boleh kosong."),
  title: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  evidenceIds: z.array(z.string()).default([]),
});
export type PresentationContentBlock = z.infer<typeof PresentationContentBlockSchema>;

export const SlidePedagogicalTypeSchema = z.enum([
  "introduction",
  "learning_objective",
  "concept_explanation",
  "example",
  "process",
  "application",
  "case_study",
  "comparison",
  "activity",
  "exercise",
  "reflection",
  "summary",
]);
export type SlidePedagogicalType = z.infer<typeof SlidePedagogicalTypeSchema>;

// ==============================================================================
// 3. SLIDE VISUAL ASSET REQUIREMENTS
// ==============================================================================

export const SlideVisualRequirementTypeSchema = z.enum([
  "none",
  "existing_illustration",
  "generate_new_illustration",
  "diagram",
  "chart",
  "iconography",
  "table",
  "placeholder",
]);
export type SlideVisualRequirementType = z.infer<
  typeof SlideVisualRequirementTypeSchema
>;

export const SlideVisualPlacementSchema = z.enum([
  "left",
  "right",
  "top",
  "bottom",
  "background",
  "full",
]);
export type SlideVisualPlacement = z.infer<typeof SlideVisualPlacementSchema>;

export const SlideVisualRequirementSchema = z.object({
  type: SlideVisualRequirementTypeSchema.default("none"),
  description: z.string().optional(),
  /** Reference ID of a persisted GuruPro illustration asset (from VIS-1C) */
  referencedAssetId: z.string().optional(),
  /** Declaration flag only; PPT-1A strictly does NOT trigger real generation */
  requiresGeneratedIllustration: z.boolean().default(false),
  placement: SlideVisualPlacementSchema.default("right"),
});
export type SlideVisualRequirement = z.infer<typeof SlideVisualRequirementSchema>;

// ==============================================================================
// 4. CANONICAL STRUCTURED SLIDE PLAN ITEM
// ==============================================================================

export const StructuredSlidePlanItemSchema = z.object({
  id: z.string().min(1, "ID slide wajib ada."),
  slideOrder: z.number().int().min(1, "Urutan slide minimal 1."),
  slideTitle: z.string().trim().min(3, "Judul slide minimal 3 karakter."),
  purpose: z.string().trim().min(3, "Tujuan slide minimal 3 karakter."),
  pedagogicalType: SlidePedagogicalTypeSchema.default("concept_explanation"),
  keyPoints: z.array(z.string().trim().min(1)).min(1, "Slide wajib memiliki minimal 1 poin kunci."),
  contentBlocks: z.array(z.union([z.string(), PresentationContentBlockSchema])).default([]),
  visualDirection: z.string().trim().min(3, "Arah visual slide minimal 3 karakter."),
  visualRequirements: SlideVisualRequirementSchema.default({ type: "none" }),
  sourceReferences: z.array(z.string().trim()).default([]),
  evidenceReferences: z.array(z.string().trim()).default([]),
  speakerNotesDirection: z.string().trim().optional(),
});
export type StructuredSlidePlanItem = z.infer<typeof StructuredSlidePlanItemSchema>;

// ==============================================================================
// 5. CONTENT BLUEPRINT CONTRACT (FOR PPT-1B CONTENT GENERATION ENGINE)
// ==============================================================================

export const PresentationContentBlueprintSchema = z.object({
  systemPrompt: z.string().min(1),
  educationalObjective: z.string().min(1),
  targetAudience: z.string().min(1),
  presentationStructure: z.string().min(1),
  approvedStyleSummary: z.string().min(1),
  contentDensity: PresentationContentDensitySchema,
  groundingSummary: z.object({
    sourceReferences: z.array(z.string()).default([]),
    evidenceReferences: z.array(z.string()).default([]),
  }),
  thingsToAvoid: z.array(z.string()).default([]),
  slidesOutline: z.array(
    z.object({
      order: z.number().int().min(1),
      title: z.string(),
      purpose: z.string(),
      pedagogicalType: SlidePedagogicalTypeSchema,
      keyPoints: z.array(z.string()),
      visualDirection: z.string(),
      visualRequirements: SlideVisualRequirementSchema,
      sourceReferences: z.array(z.string()),
      evidenceReferences: z.array(z.string()),
    })
  ),
});
export type PresentationContentBlueprint = z.infer<
  typeof PresentationContentBlueprintSchema
>;

// ==============================================================================
// 6. CANONICAL PRESENTATION GENERATION REQUEST
// ==============================================================================

export const PresentationGenerationRequestSchema = z.object({
  requestId: z.string().min(1, "Request ID wajib ada."),
  generationPlanId: z.string().min(1, "Generation plan ID wajib ada."),
  moduleId: z.string().min(1, "Module ID wajib ada."),
  targetType: z.literal("presentation"),
  created_by: z.string().min(1, "Owner ID wajib ada."),
  createdBy: z.string().optional(),
  approvedOutlineVersion: z.number().int().min(1),
  approvedOutline: PresentationOutlineSchema,
  styleId: z.string().min(1),
  styleVersion: z.number().int().min(1),
  styleDefinition: GenerationStyleSchema,
  styleSnapshot: z.any().optional(),
  sourceReferences: z.array(z.string()).default([]),
  evidenceReferences: z.array(z.string()).default([]),
  presentationParameters: z.any(),
  parameters: z.any().optional(),
  slidePlan: z.array(StructuredSlidePlanItemSchema).min(1, "Slide plan minimal 1 slide."),
  contentBlueprint: PresentationContentBlueprintSchema,
  blueprint: z.any().optional(),
  status: z.enum(["prepared", "ready_for_generation"]).default("prepared"),
  createdAt: z.string(),
});
export type PresentationGenerationRequest = z.infer<
  typeof PresentationGenerationRequestSchema
>;

// ==============================================================================
// 7. DETERMINISTIC VALIDATION HELPERS
// ==============================================================================

/**
 * Validates that slides maintain strictly continuous 1..N order with no gaps,
 * non-positive numbers, or duplicates.
 */
export function validateContinuousSlideOrdering(
  slides: Array<{ slideOrder: number; id?: string; slideTitle?: string }>
): void {
  if (!slides || slides.length === 0) {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      "Daftar slide tidak boleh kosong."
    );
  }

  const seenOrders = new Set<number>();
  for (let i = 0; i < slides.length; i++) {
    const expected = i + 1;
    const actual = slides[i].slideOrder;

    if (seenOrders.has(actual)) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        `Duplikasi nomor urut slide terdeteksi: nomor ${actual} muncul lebih dari satu kali.`
      );
    }
    seenOrders.add(actual);

    if (actual !== expected) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        `Urutan slide tidak kontinu: slide ke-${expected} memiliki nomor urut ${actual}. Urutan wajib tepat 1..${slides.length}.`
      );
    }
  }
}

/**
 * Validates presentation generation parameters against contract bounds.
 */
export function validatePresentationGenerationParameters(
  params?: unknown
): PresentationGenerationParameters & { slideSize: { width: number; height: number } } {
  const result = PresentationGenerationParametersSchema.safeParse(params || {});
  if (!result.success) {
    const errorDetails = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join(", ");
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      `Parameter generasi presentasi tidak valid: ${errorDetails}`
    );
  }

  const data = result.data;
  let resolvedSize: { width: number; height: number };

  if (typeof data.slideSize === "object" && "width" in data.slideSize && "height" in data.slideSize) {
    resolvedSize = data.slideSize as { width: number; height: number };
  } else if (data.slideSize === "1920x1080") {
    resolvedSize = { width: 1920, height: 1080 };
  } else if (data.slideSize === "1440x1080") {
    resolvedSize = { width: 1440, height: 1080 };
  } else if (data.slideSize === "1024x768") {
    resolvedSize = { width: 1024, height: 768 };
  } else {
    resolvedSize = data.aspectRatio === "4:3"
      ? { width: 1024, height: 768 }
      : { width: 1920, height: 1080 };
  }

  return {
    ...data,
    slideSize: resolvedSize,
  };
}

/**
 * Validates canonical presentation generation request against contract schema.
 */
export function validatePresentationGenerationRequest(
  request: unknown
): PresentationGenerationRequest {
  const result = PresentationGenerationRequestSchema.safeParse(request);
  if (!result.success) {
    const errorDetails = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join(", ");
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      `Spesifikasi permintaan generasi presentasi tidak valid: ${errorDetails}`
    );
  }

  // Also verify continuous ordering on the slidePlan
  validateContinuousSlideOrdering(result.data.slidePlan);

  return result.data;
}

// ==============================================================================
// 7. PPT-1B & PPT-1D PRESENTATION CONTENT & ILLUSTRATION REFERENCE CONTRACT
// ==============================================================================

export const IllustrationPlacementSchema = z.enum([
  "right",
  "left",
  "center",
  "full_width",
  "split_card",
]);
export type IllustrationPlacement = z.infer<typeof IllustrationPlacementSchema>;

export const SlideIllustrationReferenceSchema = z.object({
  assetId: z.string().min(1, "Asset ID wajib ada."),
  storagePath: z.string().optional(),
  publicUrl: z.string().optional(),
  caption: z.string().optional(),
  altText: z.string().optional(),
  placement: IllustrationPlacementSchema.default("right"),
  aspectRatio: z.enum(["16:9", "4:3", "1:1", "3:2"]).optional(),
  isApproved: z.boolean().default(false),
  reviewStatus: z.enum(["pending", "reviewed", "approved_for_use", "rejected"]).optional(),
  provenance: z
    .object({
      generationId: z.string().optional(),
      moduleId: z.string().optional(),
      styleId: z.string().optional(),
      ownerId: z.string().optional(),
      sourceReferences: z.array(z.string()).default([]),
    })
    .optional(),
});
export type SlideIllustrationReference = z.infer<
  typeof SlideIllustrationReferenceSchema
>;

export const PresentationSlideContentSchema = z.object({
  slideId: z.string().min(1, "ID slide wajib ada."),
  order: z.number().int().min(1, "Nomor urut slide minimal 1."),
  title: z.string().trim().min(1, "Judul slide tidak boleh kosong."),
  pedagogicalType: SlidePedagogicalTypeSchema.default("concept_explanation"),
  purpose: z.string().trim().min(1, "Tujuan slide tidak boleh kosong."),
  contentBlocks: z
    .array(PresentationContentBlockSchema)
    .min(1, "Slide wajib memiliki minimal 1 blok konten."),
  keyPoints: z.array(z.string().trim()).default([]),
  visualDirection: z.string().trim().min(1, "Arah visual slide wajib ada."),
  referencedAssetIds: z.array(z.string()).default([]),
  requiresGeneratedIllustration: z.boolean().default(false),
  illustrationReference: SlideIllustrationReferenceSchema.optional().nullable(),
  speakerNotes: z.string().optional(),
  sourceReferences: z.array(z.string()).default([]),
  evidenceReferences: z.array(z.string()).default([]),
});
export type PresentationSlideContent = z.infer<
  typeof PresentationSlideContentSchema
>;

export const PresentationContentPackageSchema = z.object({
  presentationId: z.string().min(1, "Presentation ID wajib ada."),
  generationRequestId: z.string().min(1, "Request ID wajib ada."),
  generationPlanId: z.string().min(1, "Generation plan ID wajib ada."),
  moduleId: z.string().min(1, "Module ID wajib ada."),
  title: z.string().trim().min(1, "Judul presentasi wajib ada."),
  subtitle: z.string().trim().optional(),
  learningObjectives: z.array(z.string().trim()).default([]),
  targetAudience: z.string().trim().min(1, "Target audiens wajib ada."),
  styleId: z.string().min(1, "Style ID wajib ada."),
  styleVersion: z.number().int().min(1),
  parameters: PresentationGenerationParametersSchema,
  slides: z
    .array(PresentationSlideContentSchema)
    .min(1, "Presentasi wajib memiliki minimal satu slide konten."),
  provenance: z.object({
    moduleId: z.string(),
    planId: z.string(),
    requestId: z.string(),
    ownerId: z.string(),
    sourceReferences: z.array(z.string()).default([]),
    evidenceReferences: z.array(z.string()).default([]),
  }),
  generationMetadata: z.object({
    promptVersion: z.string(),
    schemaVersion: z.string().default("1.0.0"),
    provider: z.string(),
    model: z.string(),
    latencyMs: z.number().default(0),
    retryCount: z.number().default(0),
    generatorVersion: z.string().default("v1"),
    generationKey: z.string(),
  }),
  validationMetadata: z.object({
    deterministicValid: z.boolean(),
    exactValuesValid: z.boolean(),
    semanticDecision: z.enum(["PASS", "REVISE", "REJECT", "ERROR"]),
    findings: z.array(z.any()).default([]),
  }),
  createdAt: z.string(),
});
export type PresentationContentPackage = z.infer<
  typeof PresentationContentPackageSchema
>;

/**
 * Validates a generated presentation content package.
 */
export function validatePresentationContentPackage(
  data: unknown
): PresentationContentPackage {
  const result = PresentationContentPackageSchema.safeParse(data);
  if (!result.success) {
    const errorDetails = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join(", ");
    throw new AiServiceError(
      AI_ERROR_CODES.PRESENTATION_VALIDATION_FAILED,
      `Validasi paket konten presentasi gagal: ${errorDetails}`
    );
  }

  // Validate contiguous 1..N order on the slides
  validateContinuousSlideOrdering(
    result.data.slides.map((s) => ({
      ...s,
      id: s.slideId,
      slideOrder: s.order,
      slideTitle: s.title,
    }))
  );

  return result.data;
}

/**
 * Computes deterministic generation key for idempotency & caching.
 */
export function computePresentationGenerationKey(params: {
  generationPlanId: string;
  approvedOutlineVersion: number;
  styleVersion: number;
  generatorVersion?: string;
  parameters?: Record<string, any>;
}): string {
  const genVer = params.generatorVersion || "v1";
  const p = params.parameters || {};
  const relevantParams = [
    p.aspectRatio || "16:9",
    typeof p.slideSize === "string" ? p.slideSize : `${p.slideSize?.width}x${p.slideSize?.height}`,
    p.contentDensity || "balanced",
    p.language || "id",
    p.includeSpeakerNotes !== false ? "notes" : "no-notes",
    p.footerPolicy || "standard",
  ].join("-");

  const rawKey = `ppt1b:${params.generationPlanId}:v${params.approvedOutlineVersion}:s${params.styleVersion}:${genVer}:${relevantParams}`;
  return rawKey;
}
