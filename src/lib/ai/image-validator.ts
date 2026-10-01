/**
 * ==============================================================================
 * GURUPRO AI: IMAGE BINARY VALIDATOR & PARSER (VIS-1B)
 * ==============================================================================
 *
 * Lightweight, zero-native-dependency image binary validation and header parsing.
 * Inspects raw buffer/base64 bytes to verify:
 * - Magic byte signatures (PNG, JPEG, WebP)
 * - Exact dimensions (width, height)
 * - Non-empty and non-mock artifact payload
 * - Aspect ratio conformance
 */

import { AI_ERROR_CODES, AiServiceError } from "./error-taxonomy";
import type { IllustrationAspectRatio } from "./illustration-generation-contract";

export interface ImageBinaryValidationResult {
  valid: boolean;
  mimeType?: "image/png" | "image/jpeg" | "image/webp";
  format?: "png" | "jpeg" | "webp";
  width?: number;
  height?: number;
  byteSize: number;
  aspectRatioCalculated?: number;
  reason?: string;
}

const MINIMUM_IMAGE_BYTES = 512;
const MINIMUM_IMAGE_DIMENSION = 256;
const MAXIMUM_IMAGE_DIMENSION = 4096;

/**
 * Expected numerical aspect ratios and reasonable tolerance (+/- 12%)
 */
const EXPECTED_RATIOS: Record<IllustrationAspectRatio, number> = {
  "1:1": 1.0,
  "16:9": 16 / 9, // ~1.777
  "4:3": 4 / 3,   // ~1.333
  "3:4": 3 / 4,   // 0.75
  "9:16": 9 / 16, // 0.5625
};

/**
 * Converts a base64 string or Uint8Array/Buffer to Uint8Array.
 */
export function toUint8Array(input: string | Uint8Array | Buffer): Uint8Array {
  if (typeof input === "string") {
    // Strip data URL header if present (e.g. data:image/png;base64,...)
    const cleanB64 = input.replace(/^data:image\/[a-zA-Z+]+;base64,/, "").trim();
    if (typeof Buffer !== "undefined") {
      return Buffer.from(cleanB64, "base64");
    }
    const binaryStr = atob(cleanB64);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
  }
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

/**
 * Parse PNG dimensions from IHDR chunk.
 */
function parsePngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  const isPng =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  if (!isPng) return null;

  // IHDR chunk begins at offset 12
  // Chunk type 'IHDR' = 49 48 44 52
  const isIhdr =
    bytes[12] === 0x49 &&
    bytes[13] === 0x48 &&
    bytes[14] === 0x44 &&
    bytes[15] === 0x52;
  if (!isIhdr) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false); // Big endian
  const height = view.getUint32(20, false); // Big endian
  return { width, height };
}

/**
 * Parse JPEG dimensions from SOF marker.
 */
function parseJpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4) return null;
  // JPEG starts with FF D8 FF
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    return null;
  }

  let offset = 2;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  while (offset < bytes.length - 8) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }

    const marker = bytes[offset + 1];
    // SOF0 (0xC0), SOF1 (0xC1), SOF2 (0xC2)
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      const height = view.getUint16(offset + 5, false);
      const width = view.getUint16(offset + 7, false);
      return { width, height };
    }

    // Skip to next marker using length header
    const markerLength = view.getUint16(offset + 2, false);
    offset += 2 + markerLength;
  }

  return null;
}

/**
 * Parse WebP dimensions.
 */
function parseWebpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 30) return null;
  // RIFF header
  const isRiff =
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46;
  // WEBP signature
  const isWebp =
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;

  if (!isRiff || !isWebp) return null;

  // VP8 chunk (lossy)
  if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x20) {
    if (bytes.length < 30) return null;
    const width = ((bytes[27] & 0x3f) << 8) | bytes[26];
    const height = ((bytes[29] & 0x3f) << 8) | bytes[28];
    return { width, height };
  }

  // VP8X chunk (extended)
  if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x58) {
    if (bytes.length < 30) return null;
    const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
    const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
    return { width, height };
  }

  // VP8L chunk (lossless)
  if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x4c) {
    if (bytes.length < 25) return null;
    const b1 = bytes[21];
    const b2 = bytes[22];
    const b3 = bytes[23];
    const b4 = bytes[24];
    const width = 1 + (((b2 & 0x3f) << 8) | b1);
    const height = 1 + (((b4 & 0xf) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
    return { width, height };
  }

  return null;
}

/**
 * Detect image format and dimensions from binary payload.
 */
export function inspectImageBinary(input: string | Uint8Array | Buffer): {
  format: "png" | "jpeg" | "webp" | "unknown";
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "application/octet-stream";
  width: number;
  height: number;
  byteSize: number;
} {
  const bytes = toUint8Array(input);
  const byteSize = bytes.length;

  if (byteSize === 0) {
    return {
      format: "unknown",
      mimeType: "application/octet-stream",
      width: 0,
      height: 0,
      byteSize: 0,
    };
  }

  // Check PNG
  const pngDims = parsePngDimensions(bytes);
  if (pngDims) {
    return {
      format: "png",
      mimeType: "image/png",
      width: pngDims.width,
      height: pngDims.height,
      byteSize,
    };
  }

  // Check JPEG
  const jpegDims = parseJpegDimensions(bytes);
  if (jpegDims) {
    return {
      format: "jpeg",
      mimeType: "image/jpeg",
      width: jpegDims.width,
      height: jpegDims.height,
      byteSize,
    };
  }

  // Check WebP
  const webpDims = parseWebpDimensions(bytes);
  if (webpDims) {
    return {
      format: "webp",
      mimeType: "image/webp",
      width: webpDims.width,
      height: webpDims.height,
      byteSize,
    };
  }

  return {
    format: "unknown",
    mimeType: "application/octet-stream",
    width: 0,
    height: 0,
    byteSize,
  };
}

/**
 * Validates generated image binary against requirements and expected aspect ratio.
 */
export function validateImageBinary(
  input: string | Uint8Array | Buffer,
  expectedAspectRatio?: IllustrationAspectRatio
): ImageBinaryValidationResult {
  // 1. Reject obvious mock SVG or text placeholders (check string and raw bytes)
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (
      trimmed.startsWith("<svg") ||
      trimmed.startsWith("<?xml") ||
      trimmed.startsWith("<!DOCTYPE") ||
      trimmed.includes("<svg")
    ) {
      return {
        valid: false,
        byteSize: trimmed.length,
        reason:
          "Payload gambar berupa mock SVG atau XML teks. Generasi gambar nyata mewajibkan format raster (PNG/JPEG/WebP).",
      };
    }
  }

  const bytes = toUint8Array(input);
  const byteSize = bytes.length;

  // Check bytes for SVG / XML signatures as well
  const startStr = String.fromCharCode(...bytes.slice(0, Math.min(bytes.length, 64)));
  if (startStr.includes("<svg") || startStr.includes("<?xml") || startStr.includes("<!DOCTYPE")) {
    return {
      valid: false,
      byteSize,
      reason:
        "Payload gambar berupa mock SVG atau XML teks. Generasi gambar nyata mewajibkan format raster (PNG/JPEG/WebP).",
    };
  }

  // 2. Minimum Payload Size Check
  if (byteSize < MINIMUM_IMAGE_BYTES) {
    return {
      valid: false,
      byteSize,
      reason: `Ukuran payload gambar terlalu kecil (${byteSize} bytes, minimum ${MINIMUM_IMAGE_BYTES} bytes). Kemungkinan respon gagal atau kosong.`,
    };
  }

  // 3. Format & Dimension Inspection
  const inspected = inspectImageBinary(bytes);
  if (inspected.format === "unknown") {
    return {
      valid: false,
      byteSize,
      reason: "Format gambar tidak dikenali atau header binary tidak valid. Harus berupa PNG, JPEG, atau WebP.",
    };
  }

  // 4. Dimension Bounds Check
  if (
    inspected.width < MINIMUM_IMAGE_DIMENSION ||
    inspected.height < MINIMUM_IMAGE_DIMENSION ||
    inspected.width > MAXIMUM_IMAGE_DIMENSION ||
    inspected.height > MAXIMUM_IMAGE_DIMENSION
  ) {
    return {
      valid: false,
      format: inspected.format,
      mimeType: inspected.mimeType,
      width: inspected.width,
      height: inspected.height,
      byteSize,
      reason: `Dimensi gambar (${inspected.width}x${inspected.height}) berada di luar batas yang diizinkan (${MINIMUM_IMAGE_DIMENSION}-${MAXIMUM_IMAGE_DIMENSION}px).`,
    };
  }

  // 5. Aspect Ratio Check (if specified)
  const actualRatio = inspected.width / inspected.height;
  if (expectedAspectRatio && EXPECTED_RATIOS[expectedAspectRatio]) {
    const targetRatio = EXPECTED_RATIOS[expectedAspectRatio];
    const diff = Math.abs(actualRatio - targetRatio);
    // Allow up to 15% tolerance due to provider grid constraints
    const maxAllowedDiff = targetRatio * 0.15;
    if (diff > maxAllowedDiff) {
      return {
        valid: false,
        format: inspected.format,
        mimeType: inspected.mimeType,
        width: inspected.width,
        height: inspected.height,
        byteSize,
        aspectRatioCalculated: actualRatio,
        reason: `Rasio aspek gambar aktual (${actualRatio.toFixed(2)}) tidak sesuai dengan permintaan (${expectedAspectRatio} ~ ${targetRatio.toFixed(2)}).`,
      };
    }
  }

  return {
    valid: true,
    format: inspected.format,
    mimeType: inspected.mimeType,
    width: inspected.width,
    height: inspected.height,
    byteSize,
    aspectRatioCalculated: actualRatio,
  };
}

/**
 * Asserts image binary validity or throws AiServiceError.
 */
export function assertValidImageBinary(
  input: string | Uint8Array | Buffer,
  expectedAspectRatio?: IllustrationAspectRatio
): { mimeType: string; width: number; height: number; byteSize: number } {
  const result = validateImageBinary(input, expectedAspectRatio);
  if (!result.valid) {
    throw new AiServiceError(
      AI_ERROR_CODES.GENERATION_FAILED,
      `Validasi artefak gambar AI gagal: ${result.reason}`
    );
  }
  return {
    mimeType: result.mimeType!,
    width: result.width!,
    height: result.height!,
    byteSize: result.byteSize,
  };
}
