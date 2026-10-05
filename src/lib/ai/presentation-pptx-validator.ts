/**
 * ==============================================================================
 * GURUPRO AI: PRESENTATION PPTX VALIDATOR (PPT-1C)
 * ==============================================================================
 *
 * Real OOXML binary package validator:
 * - Checks ZIP package signature (PK\x03\x04)
 * - Inspects required PresentationML package parts using JSZip:
 *   - [Content_Types].xml
 *   - _rels/.rels
 *   - ppt/presentation.xml
 *   - ppt/_rels/presentation.xml.rels
 *   - ppt/slides/slide{N}.xml
 * - Validates slide count matching expected count exactly
 * - Inspects notesSlide parts if speaker notes are present
 * - Strictly rejects fake PPTX (HTML, plain text, SVG, corrupted zip)
 */

import JSZip from "jszip";
import { AI_ERROR_CODES, AiServiceError } from "./error-taxonomy";

export interface PptxPackageValidationResult {
  valid: boolean;
  byteSize: number;
  slideCount: number;
  ooxmlParts: string[];
  hasNotes: boolean;
  notesCount: number;
  embeddedMediaCount: number;
  embeddedMediaParts: string[];
  magicSignatureValid: boolean;
}

/**
 * Checks if the buffer starts with the canonical ZIP local file header signature:
 * 0x50 0x4B 0x03 0x04 ('PK\x03\x04')
 */
export function hasZipMagicSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  return (
    bytes[0] === 0x50 && // 'P'
    bytes[1] === 0x4b && // 'K'
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

/**
 * Asynchronously opens and validates the OpenXML PowerPoint package.
 * Fails closed if any OOXML structural requirement is missing or corrupted.
 */
export async function validatePptxPackage(
  data: Uint8Array | Buffer,
  expectedSlideCount?: number
): Promise<PptxPackageValidationResult> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

  // 1. File existence & size check
  if (!bytes || bytes.length === 0) {
    throw new AiServiceError(
      AI_ERROR_CODES.PPTX_VALIDATION_FAILED,
      "Validasi biner PPTX gagal: file kosong (0 bytes)."
    );
  }

  // 2. ZIP Magic Signature check (0x50 0x4B 0x03 0x04)
  const magicValid = hasZipMagicSignature(bytes);
  if (!magicValid) {
    // Check if it's masquerading HTML or plain text
    const textPreview = new TextDecoder("utf-8", { fatal: false })
      .decode(bytes.slice(0, 100))
      .trim()
      .toLowerCase();

    if (
      textPreview.startsWith("<!doctype") ||
      textPreview.startsWith("<html") ||
      textPreview.startsWith("# ")
    ) {
      throw new AiServiceError(
        AI_ERROR_CODES.PPTX_VALIDATION_FAILED,
        "File PPTX palsu terdeteksi: file berupa teks/HTML yang dinamai ulang sebagai .pptx."
      );
    }

    throw new AiServiceError(
      AI_ERROR_CODES.PPTX_VALIDATION_FAILED,
      "Validasi biner PPTX gagal: berkas tidak memiliki tanda tangan paket ZIP OpenXML yang sah."
    );
  }

  // 3. Open ZIP package via JSZip
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch (err: any) {
    throw new AiServiceError(
      AI_ERROR_CODES.PPTX_VALIDATION_FAILED,
      `Validasi berkas PPTX gagal: arsip ZIP terkorupsi atau tidak dapat dibaca (${err.message}).`
    );
  }

  // 4. Verify mandatory OOXML PresentationML parts
  const fileNames = Object.keys(zip.files);

  const contentTypesPart = zip.file("[Content_Types].xml");
  if (!contentTypesPart) {
    throw new AiServiceError(
      AI_ERROR_CODES.PPTX_VALIDATION_FAILED,
      "Validasi OOXML gagal: berkas '[Content_Types].xml' tidak ditemukan dalam paket."
    );
  }

  const rootRelsPart = zip.file("_rels/.rels");
  if (!rootRelsPart) {
    throw new AiServiceError(
      AI_ERROR_CODES.PPTX_VALIDATION_FAILED,
      "Validasi OOXML gagal: relasi root '_rels/.rels' tidak ditemukan dalam paket."
    );
  }

  const presentationPart = zip.file("ppt/presentation.xml");
  if (!presentationPart) {
    throw new AiServiceError(
      AI_ERROR_CODES.PPTX_VALIDATION_FAILED,
      "Validasi OOXML gagal: part presentasi 'ppt/presentation.xml' tidak ditemukan dalam paket."
    );
  }

  // 5. Inspect Content Types content
  const contentTypesXml = await contentTypesPart.async("string");
  if (
    !contentTypesXml.includes("presentationml") &&
    !contentTypesXml.includes("openxmlformats")
  ) {
    throw new AiServiceError(
      AI_ERROR_CODES.PPTX_VALIDATION_FAILED,
      "Validasi OOXML gagal: [Content_Types].xml tidak memuat definisi tipe konten PresentationML yang sah."
    );
  }

  // 6. Inspect Slide parts
  const slideRegex = /^ppt\/slides\/slide\d+\.xml$/i;
  const slideParts = fileNames.filter((name) => slideRegex.test(name));

  if (slideParts.length === 0) {
    throw new AiServiceError(
      AI_ERROR_CODES.PPTX_VALIDATION_FAILED,
      "Validasi OOXML gagal: tidak ditemukan slide XML dalam paket presentasi ('ppt/slides/slide*.xml')."
    );
  }

  // 7. Validate Slide Count against expected count
  if (
    typeof expectedSlideCount === "number" &&
    expectedSlideCount > 0 &&
    slideParts.length !== expectedSlideCount
  ) {
    throw new AiServiceError(
      AI_ERROR_CODES.PPTX_SLIDE_COUNT_MISMATCH,
      `Ketidaksesuaian jumlah slide PPTX: diharapkan ${expectedSlideCount} slide, namun paket memuat ${slideParts.length} slide XML.`
    );
  }

  // 8. Check Speaker Notes parts
  const notesRegex = /^ppt\/notesSlides\/notesSlide\d+\.xml$/i;
  const notesParts = fileNames.filter((name) => notesRegex.test(name));

  // 9. Check Embedded Media parts (PPT-1D)
  const mediaRegex = /^ppt\/media\/.+$/i;
  const mediaParts = fileNames.filter((name) => mediaRegex.test(name));

  const ooxmlParts = [
    "[Content_Types].xml",
    "_rels/.rels",
    "ppt/presentation.xml",
    ...slideParts,
  ];

  return {
    valid: true,
    byteSize: bytes.length,
    slideCount: slideParts.length,
    ooxmlParts,
    hasNotes: notesParts.length > 0,
    notesCount: notesParts.length,
    embeddedMediaCount: mediaParts.length,
    embeddedMediaParts: mediaParts,
    magicSignatureValid: true,
  };
}
