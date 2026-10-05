/**
 * ==============================================================================
 * GURUPRO AI: PRESENTATION ARTIFACT CONTRACT (PPT-1C)
 * ==============================================================================
 *
 * Defines the canonical contract for real PowerPoint (.pptx) presentation artifacts:
 * - Immutable binary artifact metadata
 * - Cryptographic SHA-256 integrity verification
 * - Non-destructive lifecycle state management
 * - Multi-tenant isolation and teacher ownership bindings
 */

import { z } from "zod";
import { AI_ERROR_CODES, AiServiceError } from "./error-taxonomy";

export const PPTX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation" as const;

export const PresentationArtifactLifecycleStatusSchema = z.enum([
  "generating",
  "ready",
  "failed",
  "archived",
]);
export type PresentationArtifactLifecycleStatus = z.infer<
  typeof PresentationArtifactLifecycleStatusSchema
>;

export const PresentationArtifactStorageProviderSchema = z.enum([
  "supabase_storage",
  "local_fs",
]);
export type PresentationArtifactStorageProvider = z.infer<
  typeof PresentationArtifactStorageProviderSchema
>;

export const PresentationArtifactRenderMetadataSchema = z.object({
  library: z.string().default("pptxgenjs"),
  libraryVersion: z.string().default("4.0.1"),
  aspectRatio: z.string().default("16:9"),
  slideDimensions: z
    .object({
      width: z.number(),
      height: z.number(),
      unit: z.string().default("inches"),
    })
    .optional(),
  themeApplied: z.string().default("default"),
  totalBlocksRendered: z.number().int().default(0),
  speakerNotesEmbeddedCount: z.number().int().default(0),
  renderDurationMs: z.number().default(0),
  validationPassed: z.boolean().default(true),
  ooxmlPartsVerified: z.array(z.string()).default([]),
  referencedAssetCount: z.number().int().default(0),
  requiresIllustrationPlaceholderCount: z.number().int().default(0),
  embeddedIllustrationCount: z.number().int().default(0),
  embeddedIllustrations: z
    .array(
      z.object({
        assetId: z.string(),
        slideId: z.string(),
        sha256Hash: z.string(),
        reviewId: z.string().optional(),
        placement: z.string().default("right"),
        byteSize: z.number().int().optional(),
      })
    )
    .default([]),
  generatorVersion: z.string().default("v1"),
});
export type PresentationArtifactRenderMetadata = z.infer<
  typeof PresentationArtifactRenderMetadataSchema
>;

export const PresentationArtifactSchema = z.object({
  id: z.string().min(1, "Artifact ID wajib ada."),
  generationRequestId: z.string().min(1, "Request ID wajib ada."),
  contentResultId: z.string().min(1, "Content result ID wajib ada."),
  generationPlanId: z.string().min(1, "Generation plan ID wajib ada."),
  moduleId: z.string().min(1, "Module ID wajib ada."),
  ownerId: z.string().min(1, "Owner ID wajib ada."),
  tenantId: z.string().default("default"),
  storageReference: z.string().min(1, "Storage reference path wajib ada."),
  storageProvider: PresentationArtifactStorageProviderSchema.default(
    "supabase_storage"
  ),
  publicUrl: z.string().min(1, "Public/Storage URL wajib ada."),
  downloadUrl: z.string().min(1, "Download URL wajib ada."),
  filename: z.string().min(1, "Filename wajib ada."),
  mimeType: z.literal(PPTX_MIME_TYPE).default(PPTX_MIME_TYPE),
  byteSize: z.number().int().nonnegative("Ukuran file harus non-negatif."),
  fileHash: z
    .string()
    .length(64, "SHA-256 hash wajib 64 karakter heksadesimal."),
  slideCount: z.number().int().min(1, "Minimal terdapat 1 slide."),
  outlineVersion: z.number().int().min(1),
  styleId: z.string().min(1),
  styleVersion: z.number().int().min(1),
  rendererVersion: z.string().default("v1.0.0"),
  status: PresentationArtifactLifecycleStatusSchema.default("generating"),
  renderMetadata: PresentationArtifactRenderMetadataSchema.default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PresentationArtifact = z.infer<typeof PresentationArtifactSchema>;

export const RenderPresentationPptxInputSchema = z.object({
  contentResultId: z.string().min(1, "Content Result ID wajib diisi."),
  forceReRender: z.boolean().default(false),
  options: z
    .object({
      customFilename: z.string().optional(),
    })
    .optional(),
});
export type RenderPresentationPptxInput = z.infer<
  typeof RenderPresentationPptxInputSchema
>;

export const GetPresentationArtifactInputSchema = z.object({
  artifactId: z.string().min(1, "Artifact ID wajib diisi."),
});
export type GetPresentationArtifactInput = z.infer<
  typeof GetPresentationArtifactInputSchema
>;

export const ListPresentationArtifactsInputSchema = z.object({
  moduleId: z.string().optional(),
  generationPlanId: z.string().optional(),
  contentResultId: z.string().optional(),
});
export type ListPresentationArtifactsInput = z.infer<
  typeof ListPresentationArtifactsInputSchema
>;

/**
 * Validates lifecycle transition for presentation artifacts.
 */
export function assertValidArtifactLifecycleTransition(
  current: PresentationArtifactLifecycleStatus,
  next: PresentationArtifactLifecycleStatus
): void {
  const allowedTransitions: Record<
    PresentationArtifactLifecycleStatus,
    PresentationArtifactLifecycleStatus[]
  > = {
    generating: ["ready", "failed"],
    ready: ["archived", "failed"],
    failed: ["generating"], // Retry allowed
    archived: [], // Terminal
  };

  if (!allowedTransitions[current]?.includes(next)) {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      `Transisi status artefak tidak sah: tidak dapat mengubah status dari '${current}' ke '${next}'.`
    );
  }
}

/**
 * Slugifies presentation title into clean .pptx filename.
 */
export function slugifyPresentationFilename(title: string): string {
  const clean = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return clean ? `${clean}.pptx` : "presentasi.pptx";
}

/**
 * Validates that an object conforms to canonical PresentationArtifact.
 */
export function validatePresentationArtifact(data: unknown): PresentationArtifact {
  const result = PresentationArtifactSchema.safeParse(data);
  if (!result.success) {
    const errorDetails = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join(", ");
    throw new AiServiceError(
      AI_ERROR_CODES.PPTX_VALIDATION_FAILED,
      `Validasi rekaman artefak presentasi gagal: ${errorDetails}`
    );
  }
  return result.data;
}
