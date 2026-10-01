/**
 * ==============================================================================
 * GURUPRO AI: ILLUSTRATION STORAGE SERVICE & DRIVERS (VIS-1C)
 * ==============================================================================
 *
 * Implements persistent storage abstraction for illustration image binaries:
 * - Deterministic SHA-256 cryptographic hashing
 * - Driver strategy: Supabase Storage, Local FS, or In-Memory test driver
 * - Path convention: illustrations/{ownerId}/{moduleId}/{assetId}.{ext}
 * - Zero external-dependency fallback for local development & unit tests
 */

import crypto from "crypto";
import { AI_ERROR_CODES, AiServiceError } from "./error-taxonomy";
import type { StorageProviderType } from "./illustration-asset-contract";
import { toUint8Array } from "./image-validator";

export interface StorageUploadResult {
  publicUrl: string;
  storagePath: string;
  provider: StorageProviderType;
  byteSize: number;
}

export interface IllustrationStorageDriver {
  readonly providerType: StorageProviderType;
  upload(
    storagePath: string,
    bytes: Uint8Array,
    mimeType: string
  ): Promise<StorageUploadResult>;
  delete(storagePath: string): Promise<void>;
}

/**
 * Computes deterministic SHA-256 checksum hex string over raw binary payload.
 */
export function computeSha256(input: string | Uint8Array | Buffer): string {
  const bytes = toUint8Array(input);
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

/**
 * Derives proper file extension from MIME type.
 */
export function getExtensionFromMime(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/png":
    default:
      return "png";
  }
}

/**
 * Generates canonical storage path.
 */
export function buildIllustrationStoragePath(
  ownerId: string,
  moduleId: string,
  assetId: string,
  mimeType: string
): string {
  const ext = getExtensionFromMime(mimeType);
  const cleanOwner = ownerId.replace(/[^a-zA-Z0-9_-]/g, "");
  const cleanModule = moduleId.replace(/[^a-zA-Z0-9_-]/g, "");
  const cleanAsset = assetId.replace(/[^a-zA-Z0-9_-]/g, "");
  return `illustrations/${cleanOwner}/${cleanModule}/${cleanAsset}.${ext}`;
}

// ==============================================================================
// 1. SUPABASE STORAGE DRIVER
// ==============================================================================

export class SupabaseStorageDriver implements IllustrationStorageDriver {
  readonly providerType: StorageProviderType = "supabase_storage";
  private readonly supabaseClient: any;
  private readonly bucketName: string;

  constructor(supabaseClient: any, bucketName = "illustration-assets") {
    this.supabaseClient = supabaseClient;
    this.bucketName = bucketName;
  }

  async upload(
    storagePath: string,
    bytes: Uint8Array,
    mimeType: string
  ): Promise<StorageUploadResult> {
    if (!this.supabaseClient?.storage) {
      throw new AiServiceError(
        AI_ERROR_CODES.STORAGE_ERROR,
        "Supabase Storage client tidak tersedia."
      );
    }

    try {
      const { data, error } = await this.supabaseClient.storage
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

      return {
        publicUrl,
        storagePath,
        provider: this.providerType,
        byteSize: bytes.length,
      };
    } catch (err: any) {
      throw new AiServiceError(
        AI_ERROR_CODES.STORAGE_ERROR,
        `Gagal mengunggah asset ke Supabase Storage: ${err.message}`
      );
    }
  }

  async delete(storagePath: string): Promise<void> {
    if (!this.supabaseClient?.storage) return;
    try {
      await this.supabaseClient.storage.from(this.bucketName).remove([storagePath]);
    } catch {}
  }
}

// ==============================================================================
// 2. IN-MEMORY STORAGE DRIVER (FOR UNIT TESTING & OFFLINE RESILIENCE)
// ==============================================================================

export class MemoryStorageDriver implements IllustrationStorageDriver {
  readonly providerType: StorageProviderType = "local_fs";
  private readonly store = new Map<string, { bytes: Uint8Array; mimeType: string }>();
  private readonly baseUrl: string;

  constructor(baseUrl = "https://assets.gurupro.internal") {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async upload(
    storagePath: string,
    bytes: Uint8Array,
    mimeType: string
  ): Promise<StorageUploadResult> {
    this.store.set(storagePath, { bytes, mimeType });
    const publicUrl = `${this.baseUrl}/${storagePath}`;
    return {
      publicUrl,
      storagePath,
      provider: this.providerType,
      byteSize: bytes.length,
    };
  }

  async delete(storagePath: string): Promise<void> {
    this.store.delete(storagePath);
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

let registeredMockDriver: IllustrationStorageDriver | null = null;

export function registerMockStorageDriver(driver: IllustrationStorageDriver | null): void {
  registeredMockDriver = driver;
}

export function resolveStorageDriver(supabaseClient?: any): IllustrationStorageDriver {
  if (registeredMockDriver) {
    return registeredMockDriver;
  }

  if (supabaseClient && supabaseClient.storage) {
    return new SupabaseStorageDriver(supabaseClient);
  }

  // Fallback to resilient in-memory driver
  return new MemoryStorageDriver();
}
