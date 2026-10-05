/**
 * ==============================================================================
 * GURUPRO AI: PRESENTATION ARTIFACT STORAGE SERVICE (PPT-1C)
 * ==============================================================================
 *
 * Implements persistent storage abstraction for PowerPoint (.pptx) binaries:
 * - Deterministic SHA-256 cryptographic hashing
 * - Driver strategy: Supabase Storage or In-Memory test driver
 * - Path convention: tenant/{tenantId}/modules/{moduleId}/presentations/{artifactId}.pptx
 * - Fails closed on storage errors
 */

import crypto from "crypto";
import { AI_ERROR_CODES, AiServiceError } from "./error-taxonomy";
import {
  PPTX_MIME_TYPE,
  PresentationArtifactStorageProvider,
} from "./presentation-artifact-contract";

export interface PresentationStorageUploadResult {
  publicUrl: string;
  downloadUrl: string;
  storagePath: string;
  provider: PresentationArtifactStorageProvider;
  byteSize: number;
}

export interface PresentationArtifactStorageDriver {
  readonly providerType: PresentationArtifactStorageProvider;
  upload(
    storagePath: string,
    bytes: Uint8Array,
    mimeType: string
  ): Promise<PresentationStorageUploadResult>;
  delete(storagePath: string): Promise<void>;
  getDownloadUrl(storagePath: string): Promise<string>;
}

/**
 * Computes deterministic SHA-256 checksum hex string over raw binary payload.
 */
export function computePptxSha256(input: Uint8Array | Buffer): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

/**
 * Builds canonical storage path conforming to:
 * tenant/{tenantId}/modules/{moduleId}/presentations/{artifactId}.pptx
 */
export function buildPresentationStoragePath(
  tenantId: string,
  moduleId: string,
  artifactId: string
): string {
  const cleanTenant = tenantId.replace(/[^a-zA-Z0-9_-]/g, "") || "default";
  const cleanModule = moduleId.replace(/[^a-zA-Z0-9_-]/g, "");
  const cleanArtifact = artifactId.replace(/[^a-zA-Z0-9_-]/g, "");
  return `tenant/${cleanTenant}/modules/${cleanModule}/presentations/${cleanArtifact}.pptx`;
}

// ==============================================================================
// 1. SUPABASE STORAGE DRIVER
// ==============================================================================

export class SupabasePresentationStorageDriver
  implements PresentationArtifactStorageDriver
{
  readonly providerType: PresentationArtifactStorageProvider = "supabase_storage";
  private readonly supabaseClient: any;
  private readonly bucketName: string;

  constructor(supabaseClient: any, bucketName = "presentation-artifacts") {
    this.supabaseClient = supabaseClient;
    this.bucketName = bucketName;
  }

  async upload(
    storagePath: string,
    bytes: Uint8Array,
    mimeType = PPTX_MIME_TYPE
  ): Promise<PresentationStorageUploadResult> {
    if (!this.supabaseClient?.storage) {
      throw new AiServiceError(
        AI_ERROR_CODES.PPTX_STORAGE_FAILED,
        "Klien Supabase Storage tidak tersedia untuk penyimpanan PPTX."
      );
    }

    try {
      const { error } = await this.supabaseClient.storage
        .from(this.bucketName)
        .upload(storagePath, bytes, {
          contentType: mimeType,
          upsert: true,
        });

      if (error) {
        throw new Error(error.message);
      }

      const { data: publicData } = this.supabaseClient.storage
        .from(this.bucketName)
        .getPublicUrl(storagePath);

      const publicUrl = publicData?.publicUrl || storagePath;
      const downloadUrl = publicUrl;

      return {
        publicUrl,
        downloadUrl,
        storagePath,
        provider: this.providerType,
        byteSize: bytes.length,
      };
    } catch (err: any) {
      throw new AiServiceError(
        AI_ERROR_CODES.PPTX_STORAGE_FAILED,
        `Gagal mengunggah file PPTX ke Supabase Storage: ${err.message}`
      );
    }
  }

  async delete(storagePath: string): Promise<void> {
    if (!this.supabaseClient?.storage) return;
    try {
      await this.supabaseClient.storage.from(this.bucketName).remove([storagePath]);
    } catch {}
  }

  async getDownloadUrl(storagePath: string): Promise<string> {
    if (!this.supabaseClient?.storage) return storagePath;
    try {
      const { data } = await this.supabaseClient.storage
        .from(this.bucketName)
        .createSignedUrl(storagePath, 3600); // 1 hour signed URL
      return data?.signedUrl || storagePath;
    } catch {
      const { data } = this.supabaseClient.storage
        .from(this.bucketName)
        .getPublicUrl(storagePath);
      return data?.publicUrl || storagePath;
    }
  }
}

// ==============================================================================
// 2. IN-MEMORY STORAGE DRIVER (FOR TESTING & OFFLINE RESILIENCE)
// ==============================================================================

export class MemoryPresentationStorageDriver
  implements PresentationArtifactStorageDriver
{
  readonly providerType: PresentationArtifactStorageProvider = "local_fs";
  private readonly store = new Map<
    string,
    { bytes: Uint8Array; mimeType: string }
  >();
  private readonly baseUrl: string;

  constructor(baseUrl = "https://assets.gurupro.internal/presentations") {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async upload(
    storagePath: string,
    bytes: Uint8Array,
    mimeType = PPTX_MIME_TYPE
  ): Promise<PresentationStorageUploadResult> {
    this.store.set(storagePath, { bytes, mimeType });
    const publicUrl = `${this.baseUrl}/${storagePath}`;
    return {
      publicUrl,
      downloadUrl: publicUrl,
      storagePath,
      provider: this.providerType,
      byteSize: bytes.length,
    };
  }

  async delete(storagePath: string): Promise<void> {
    this.store.delete(storagePath);
  }

  async getDownloadUrl(storagePath: string): Promise<string> {
    return `${this.baseUrl}/${storagePath}`;
  }

  getStored(storagePath: string): { bytes: Uint8Array; mimeType: string } | undefined {
    return this.store.get(storagePath);
  }

  clear(): void {
    this.store.clear();
  }
}

// ==============================================================================
// 3. STORAGE DRIVER FACTORY & REGISTRY
// ==============================================================================

let registeredMockDriver: PresentationArtifactStorageDriver | null = null;

export function registerMockPresentationStorageDriver(
  driver: PresentationArtifactStorageDriver | null
): void {
  registeredMockDriver = driver;
}

export function resolvePresentationStorageDriver(
  supabaseClient?: any
): PresentationArtifactStorageDriver {
  if (registeredMockDriver) {
    return registeredMockDriver;
  }

  if (supabaseClient && supabaseClient.storage) {
    return new SupabasePresentationStorageDriver(supabaseClient);
  }

  return new MemoryPresentationStorageDriver();
}
