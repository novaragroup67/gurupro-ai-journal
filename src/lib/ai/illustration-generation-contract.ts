/**
 * ==============================================================================
 * GURUPRO AI: ILLUSTRATION GENERATION CONTRACT (VIS-1A)
 * ==============================================================================
 *
 * Canonical provider-agnostic domain contract, request specifications,
 * parameter schemas, prompt assembly structures, text policies, and
 * provider boundary interfaces for AI Illustration Generation.
 *
 * Invariants:
 * 1. Strict Target Enforcement: ONLY targetType === "illustration" is allowed.
 * 2. Provider-Agnostic: Request format does not depend on any specific external provider.
 * 3. Text-in-Image Control: Model is prohibited from inventing labels (allowModelInventedText: false).
 * 4. Grounding Preservation: Source and evidence provenance are carried forward.
 * 5. Strict Non-Generation: VIS-1A stops before external API calls.
 */

import { z } from "zod";
import { AI_ERROR_CODES, AiServiceError } from "./error-taxonomy";
import {
  IllustrationOutlineSchema,
  type IllustrationOutline,
  GenerationStyleSchema,
  type GenerationStyle,
} from "./generation-planning-contract";

// ==============================================================================
// 1. GENERATION PARAMETERS
// ==============================================================================

export const IllustrationAspectRatioSchema = z.enum([
  "1:1",
  "16:9",
  "4:3",
  "3:4",
  "9:16",
]);
export type IllustrationAspectRatio = z.infer<typeof IllustrationAspectRatioSchema>;

export const IllustrationQualitySchema = z.enum(["standard", "hd"]);
export type IllustrationQuality = z.infer<typeof IllustrationQualitySchema>;

export const IllustrationGenerationParametersSchema = z.object({
  aspectRatio: IllustrationAspectRatioSchema.default("1:1"),
  width: z.number().int().min(256).max(2048).default(1024),
  height: z.number().int().min(256).max(2048).default(1024),
  quality: IllustrationQualitySchema.default("standard"),
  numberOfImages: z.number().int().min(1).max(4).default(1),
  seed: z.number().int().optional(),
  providerExtension: z.record(z.any()).default({}),
});
export type IllustrationGenerationParameters = z.infer<
  typeof IllustrationGenerationParametersSchema
>;

// ==============================================================================
// 2. TEXT-IN-IMAGE POLICY
// ==============================================================================

export const TextRenderStrategySchema = z.enum([
  "clean_visual_only",
  "embedded_labels",
  "post_process_overlay",
]);
export type TextRenderStrategy = z.infer<typeof TextRenderStrategySchema>;

export const IllustrationTextPolicySchema = z.object({
  /** Exact label strings required by the teacher/outline */
  mustAppear: z.array(z.string().trim()).default([]),
  /** Permitted optional terms or symbols */
  mayAppear: z.array(z.string().trim()).default([]),
  /** Prohibited labels or watermarks */
  mustNotAppear: z.array(z.string().trim()).default([]),
  /** Strict ban on generative model inventing phantom labels */
  allowModelInventedText: z.literal(false).default(false),
  /** Visual rendering strategy */
  textRenderStrategy: TextRenderStrategySchema.default("clean_visual_only"),
});
export type IllustrationTextPolicy = z.infer<typeof IllustrationTextPolicySchema>;

// ==============================================================================
// 3. ASSEMBLED PROMPT STRUCTURE
// ==============================================================================

export const AssembledIllustrationPromptSchema = z.object({
  systemPrompt: z.string().trim().min(1, "System prompt wajib ada."),
  styleDirectives: z.string().trim().min(1, "Style directives wajib ada."),
  subjectDescription: z.string().trim().min(1, "Deskripsi subjek wajib ada."),
  compositionDirectives: z.string().trim().min(1, "Arahan komposisi visual wajib ada."),
  negativePrompt: z.string().trim(),
  fullPrompt: z.string().trim().min(1, "Full prompt terakit wajib ada."),
});
export type AssembledIllustrationPrompt = z.infer<
  typeof AssembledIllustrationPromptSchema
>;

// ==============================================================================
// 4. CANONICAL ILLUSTRATION GENERATION REQUEST
// ==============================================================================

export const IllustrationGenerationRequestSchema = z.object({
  requestId: z.string().min(1, "Request ID wajib ada."),
  generationPlanId: z.string().min(1, "Generation plan ID wajib ada."),
  moduleId: z.string().min(1, "Module ID wajib ada."),
  targetType: z.literal("illustration"),
  approvedOutlineVersion: z.number().int().min(1),
  approvedOutline: IllustrationOutlineSchema,
  styleId: z.string().min(1),
  styleVersion: z.number().int().min(1),
  styleDefinition: GenerationStyleSchema,
  sourceReferences: z.array(z.string()).default([]),
  evidenceReferences: z.array(z.string()).default([]),
  generationParameters: IllustrationGenerationParametersSchema,
  assembledPrompt: AssembledIllustrationPromptSchema,
  textPolicy: IllustrationTextPolicySchema,
  createdAt: z.string(),
});
export type IllustrationGenerationRequest = z.infer<
  typeof IllustrationGenerationRequestSchema
>;

// ==============================================================================
// 5. NORMALIZED GENERATION RESULT CONTRACT (FOR VIS-1B READY BOUNDARY)
// ==============================================================================

export const GenerationResultStatusSchema = z.enum([
  "pending",
  "processing",
  "succeeded",
  "failed",
]);
export type GenerationResultStatus = z.infer<typeof GenerationResultStatusSchema>;

export const GenerationResultErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  isRetryable: z.boolean().default(false),
});
export type GenerationResultError = z.infer<typeof GenerationResultErrorSchema>;

export const IllustrationGenerationResultSchema = z.object({
  generationId: z.string().min(1),
  requestId: z.string().min(1),
  status: GenerationResultStatusSchema,
  assetReference: z.string().optional(),
  mimeType: z.string().optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  providerRequestId: z.string().optional(),
  createdAt: z.string(),
  error: GenerationResultErrorSchema.optional(),
});
export type IllustrationGenerationResult = z.infer<
  typeof IllustrationGenerationResultSchema
>;

// ==============================================================================
// 6. PROVIDER ADAPTER BOUNDARY INTERFACE
// ==============================================================================

export interface IllustrationGenerationProvider {
  readonly providerName: string;
  validateRequest(
    request: IllustrationGenerationRequest
  ): Promise<{ valid: boolean; reason?: string }>;
  generate(
    request: IllustrationGenerationRequest
  ): Promise<IllustrationGenerationResult>;
  normalizeResult(
    rawOutput: unknown,
    request: IllustrationGenerationRequest
  ): IllustrationGenerationResult;
}

// ==============================================================================
// 7. VALIDATION HELPER FUNCTIONS
// ==============================================================================

/**
 * Validates canonical IllustrationGenerationParameters.
 */
export function validateIllustrationGenerationParameters(
  data: unknown
): IllustrationGenerationParameters {
  const result = IllustrationGenerationParametersSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.errors
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join(", ");
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_PARAMETERS,
      `Validasi parameter generasi gambar gagal: ${issues}`
    );
  }
  return result.data;
}

/**
 * Validates canonical IllustrationGenerationRequest.
 */
export function validateIllustrationGenerationRequest(
  data: unknown
): IllustrationGenerationRequest {
  const result = IllustrationGenerationRequestSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.errors
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join(", ");
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      `Validasi permintaan generasi gambar gagal: ${issues}`
    );
  }
  return result.data;
}
