/**
 * ==============================================================================
 * GURUPRO AI: ILLUSTRATION ASSET CONTRACT & LIFECYCLE (VIS-1C)
 * ==============================================================================
 *
 * Defines the canonical data structures, Zod validation schemas, and lifecycle
 * state machine for permanent pedagogical illustration assets.
 *
 * Invariants:
 * - Deterministic SHA-256 cryptographic content integrity
 * - Full provenance linking back to generation, request, plan, style, and module
 * - Non-destructive lifecycle: existing assets are superseded, never silently overwritten
 * - Strict multi-tenant RBAC (Guru role & ownership isolation)
 */

import { z } from "zod";
import { AI_ERROR_CODES, AiServiceError } from "./error-taxonomy";
import { GenerationStyleSchema } from "./generation-planning-contract";
import {
  AssembledIllustrationPromptSchema,
  IllustrationGenerationParametersSchema,
} from "./illustration-generation-contract";

// ==============================================================================
// 1. LIFECYCLE STATUS CONTRACT
// ==============================================================================

export const AssetLifecycleStatusSchema = z.enum([
  "staged",       // Persisted in storage & database, ready for use, not yet attached
  "attached",     // Actively attached and displayed in a Modul Ajar section
  "superseded",   // Replaced by a newer asset on the same section; retained for audit
  "archived",     // Manually archived by teacher; not shown in active view
  "soft_deleted", // Marked deleted; preserved in DB for provenance & audit trail
]);
export type AssetLifecycleStatus = z.infer<typeof AssetLifecycleStatusSchema>;

export const StorageProviderTypeSchema = z.enum([
  "supabase_storage",
  "local_fs",
  "data_url",
]);
export type StorageProviderType = z.infer<typeof StorageProviderTypeSchema>;

// ==============================================================================
// 2. PROVENANCE & PEDAGOGICAL METADATA SCHEMAS
// ==============================================================================

export const AssetGroundingSnapshotSchema = z.object({
  sourceReferences: z.array(z.string()).default([]),
  evidenceReferences: z.array(z.string()).default([]),
  subjectDiscipline: z.string().optional(),
  audienceLevel: z.string().optional(),
  curriculumContext: z.string().optional(),
});
export type AssetGroundingSnapshot = z.infer<typeof AssetGroundingSnapshotSchema>;

export const AssetPedagogicalMetadataSchema = z.object({
  title: z.string().min(1),
  objective: z.string().min(1),
  mainSubject: z.string().min(1),
  educationalFocus: z.string().min(1),
  targetSectionId: z.string().optional(),
  targetSectionTitle: z.string().optional(),
});
export type AssetPedagogicalMetadata = z.infer<typeof AssetPedagogicalMetadataSchema>;

// ==============================================================================
// 3. CANONICAL ILLUSTRATION ASSET CONTRACT
// ==============================================================================

export const IllustrationAssetSchema = z.object({
  id: z.string().min(1, "Asset ID wajib ada."),
  generationId: z.string().min(1, "Generation ID wajib ada."),
  requestId: z.string().min(1, "Request ID wajib ada."),
  generationPlanId: z.string().min(1, "Generation plan ID wajib ada."),
  moduleId: z.string().min(1, "Module ID wajib ada."),
  ownerId: z.string().min(1, "Owner ID wajib ada."),
  sha256Hash: z.string().length(64, "SHA-256 hash harus 64 karakter heksadesimal."),
  storageProvider: StorageProviderTypeSchema,
  storagePath: z.string().min(1, "Storage path wajib ada."),
  publicUrl: z.string().min(1, "Public URL wajib ada."),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  width: z.number().int().min(256),
  height: z.number().int().min(256),
  byteSize: z.number().int().min(512),
  lifecycleStatus: AssetLifecycleStatusSchema,
  attachedSectionId: z.string().optional().nullable(),
  attachedAt: z.string().optional().nullable(),
  styleId: z.string().min(1),
  styleVersion: z.number().int().min(1),
  styleName: z.string().min(1),
  promptSnapshot: AssembledIllustrationPromptSchema,
  groundingSnapshot: AssetGroundingSnapshotSchema,
  pedagogicalMetadata: AssetPedagogicalMetadataSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type IllustrationAsset = z.infer<typeof IllustrationAssetSchema>;

// ==============================================================================
// 4. SERVER FUNCTION INPUT SCHEMAS
// ==============================================================================

export const PersistIllustrationAssetInputSchema = z.object({
  generationId: z.string().min(1, "ID generasi wajib diisi."),
  targetSectionId: z.string().trim().optional(),
});
export type PersistIllustrationAssetInput = z.infer<typeof PersistIllustrationAssetInputSchema>;

export const AttachIllustrationAssetInputSchema = z.object({
  assetId: z.string().min(1, "ID asset wajib diisi."),
  moduleId: z.string().min(1, "ID modul ajar wajib diisi."),
  sectionId: z.string().min(1, "ID bab / section modul wajib diisi."),
});
export type AttachIllustrationAssetInput = z.infer<typeof AttachIllustrationAssetInputSchema>;

export const DetachIllustrationAssetInputSchema = z.object({
  assetId: z.string().min(1, "ID asset wajib diisi."),
});
export type DetachIllustrationAssetInput = z.infer<typeof DetachIllustrationAssetInputSchema>;

export const TransitionAssetLifecycleInputSchema = z.object({
  assetId: z.string().min(1, "ID asset wajib diisi."),
  targetStatus: z.enum(["staged", "archived", "soft_deleted"]),
});
export type TransitionAssetLifecycleInput = z.infer<typeof TransitionAssetLifecycleInputSchema>;

export const ListModuleIllustrationAssetsInputSchema = z.object({
  moduleId: z.string().min(1, "ID modul ajar wajib diisi."),
});
export type ListModuleIllustrationAssetsInput = z.infer<typeof ListModuleIllustrationAssetsInputSchema>;

// ==============================================================================
// 5. LIFECYCLE STATE MACHINE VALIDATION
// ==============================================================================

/**
 * Valid allowed state transitions matrix.
 */
const ALLOWED_TRANSITIONS: Record<AssetLifecycleStatus, AssetLifecycleStatus[]> = {
  staged: ["attached", "archived", "soft_deleted"],
  attached: ["superseded", "staged", "archived", "soft_deleted"],
  superseded: ["attached", "archived", "soft_deleted"],
  archived: ["staged", "soft_deleted"],
  soft_deleted: [], // Terminal state: no further mutations permitted
};

/**
 * Validates whether a lifecycle transition is permitted by the state machine.
 */
export function validateLifecycleTransition(
  currentStatus: AssetLifecycleStatus,
  targetStatus: AssetLifecycleStatus
): boolean {
  if (currentStatus === targetStatus) return true;
  const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
  return allowed.includes(targetStatus);
}

/**
 * Asserts a valid lifecycle transition or throws a typed AiServiceError.
 */
export function assertValidLifecycleTransition(
  currentStatus: AssetLifecycleStatus,
  targetStatus: AssetLifecycleStatus
): void {
  if (!validateLifecycleTransition(currentStatus, targetStatus)) {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      `Transisi status lifecycle asset dari '${currentStatus}' ke '${targetStatus}' tidak diizinkan.`
    );
  }
}
