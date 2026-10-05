/**
 * ==============================================================================
 * GURUPRO AI: REAL PPTX PRESENTATION RENDERER (PPT-1C)
 * ==============================================================================
 *
 * Converts a validated PresentationContentPackage (from PPT-1B)
 * into a genuine OOXML PowerPoint (.pptx) binary file:
 * - Real pptxgenjs document assembly
 * - Theme and style resolution (6 verified presentation styles)
 * - Deterministic coordinate layout engine (16:9 & 4:3)
 * - 24 canonical block renderers
 * - Native speaker notes and slide numbering
 * - Strict OOXML package validation and SHA-256 checksumming
 * - Strictly non-generative (zero AI calls, zero image provider calls)
 */

import PptxGenJS from "pptxgenjs";
import {
  PresentationContentPackage,
  PresentationSlideContent,
  validatePresentationContentPackage,
} from "./presentation-generation-contract";
import { resolvePresentationTheme, ResolvedPresentationTheme } from "./presentation-style-resolver";
import {
  computeSlideLayout,
  computeIllustrationSlideLayout,
  getSlideDimensions,
  ComputedSlideLayout,
  BoundingBox,
} from "./presentation-layout-engine";
import { renderContentBlock } from "./presentation-block-renderers";
import {
  validatePptxPackage,
  PptxPackageValidationResult,
} from "./presentation-pptx-validator";
import { computePptxSha256 } from "./presentation-artifact-storage";
import { AI_ERROR_CODES, AiServiceError } from "./error-taxonomy";
import { PresentationArtifactRenderMetadata } from "./presentation-artifact-contract";
import type { ResolvedSlideIllustration } from "./presentation-illustration-resolver";

export interface RenderedPresentationPptxResult {
  bytes: Uint8Array;
  byteSize: number;
  fileHash: string;
  slideCount: number;
  validation: PptxPackageValidationResult;
  renderMetadata: PresentationArtifactRenderMetadata;
}

export interface RenderPresentationPptxOptions {
  customTitle?: string;
  resolvedIllustrations?: Map<string, ResolvedSlideIllustration>;
}

/**
 * Maps pedagogical type to user-facing badge label in Bahasa Indonesia.
 */
function getPedagogicalBadgeLabel(type: string): string {
  const map: Record<string, string> = {
    introduction: "PENGANTAR",
    learning_objective: "TUJUAN PEMBELAJARAN",
    concept_explanation: "KONSEP UTAMA",
    example: "CONTOH NYATA",
    process: "ALUR & PROSES",
    application: "PENERAPAN",
    case_study: "STUDI KASUS",
    comparison: "PERBANDINGAN",
    activity: "AKTIVITAS KELAS",
    exercise: "LATIHAN SOAL",
    reflection: "REFLEKSI",
    summary: "RANGKUMAN",
  };
  return map[type] || "MATERI";
}

/**
 * Main Presentation PPTX Rendering Engine.
 * Converts immutable PresentationContentPackage into valid OOXML PPTX binary.
 */
export async function renderPresentationPptx(
  contentPackage: PresentationContentPackage,
  options?: RenderPresentationPptxOptions
): Promise<RenderedPresentationPptxResult> {
  const startTime = Date.now();

  // 1. Validate Input Integrity (strict PPT-1B contract)
  const validPackage = validatePresentationContentPackage(contentPackage);

  // 2. Resolve Approved Style & Theme
  const theme = resolvePresentationTheme(validPackage.styleId);

  // 3. Resolve Aspect Ratio & Slide Dimensions
  const aspectRatio: "16:9" | "4:3" =
    validPackage.parameters.aspectRatio === "4:3" ? "4:3" : "16:9";
  const dimensions = getSlideDimensions(aspectRatio);

  // 4. Initialize PptxGenJS instance
  const pptx = new PptxGenJS();
  pptx.layout = aspectRatio === "4:3" ? "LAYOUT_4x3" : "LAYOUT_16x9";
  pptx.title = options?.customTitle || validPackage.title;
  pptx.subject = validPackage.targetAudience;
  pptx.author = "GuruPro AI Presentation Engine";
  pptx.company = "GuruPro";

  let totalBlocksRendered = 0;
  let speakerNotesEmbeddedCount = 0;
  let referencedAssetCount = 0;
  let requiresIllustrationPlaceholderCount = 0;
  const embeddedIllustrationsList: {
    assetId: string;
    slideId: string;
    sha256Hash: string;
    reviewId?: string;
    placement: string;
    byteSize?: number;
  }[] = [];

  const totalSlides = validPackage.slides.length;

  // 5. Render Slide by Slide
  for (let i = 0; i < totalSlides; i++) {
    const slideData: PresentationSlideContent = validPackage.slides[i];
    const isCoverSlide = i === 0 && slideData.pedagogicalType === "introduction";

    const slide = pptx.addSlide();
    slide.background = { color: theme.colors.background };

    // Compute layout for this slide
    const layout: ComputedSlideLayout = computeSlideLayout(
      theme,
      slideData.pedagogicalType,
      aspectRatio,
      isCoverSlide
    );

    // Track visual requirements
    if (slideData.referencedAssetIds && slideData.referencedAssetIds.length > 0) {
      referencedAssetCount += slideData.referencedAssetIds.length;
    }
    if (slideData.requiresGeneratedIllustration) {
      requiresIllustrationPlaceholderCount++;
    }

    // A. Render Header
    const badgeLabel = getPedagogicalBadgeLabel(slideData.pedagogicalType);

    // Badge Card
    slide.addShape("roundRect", {
      x: layout.header.badge.x,
      y: layout.header.badge.y,
      w: layout.header.badge.w,
      h: layout.header.badge.h,
      fill: { color: theme.colors.badgeBackground },
      line: { color: theme.colors.badgeBackground, width: 0 },
      rectRadius: 0.05,
    });

    slide.addText(badgeLabel, {
      x: layout.header.badge.x,
      y: layout.header.badge.y,
      w: layout.header.badge.w,
      h: layout.header.badge.h,
      bold: true,
      fontSize: 9,
      color: theme.colors.badgeText,
      fontFace: theme.typography.titleFont,
      valign: "middle",
      align: "center",
    });

    // Slide Title
    slide.addText(slideData.title, {
      x: layout.header.title.x,
      y: layout.header.title.y,
      w: layout.header.title.w,
      h: layout.header.title.h,
      bold: true,
      fontSize: isCoverSlide ? theme.typography.titleFontSize + 6 : theme.typography.titleFontSize,
      color: theme.colors.primary,
      fontFace: theme.typography.titleFont,
      valign: isCoverSlide ? "middle" : "top",
      wrap: true,
    });

    // Header Divider Line
    if (theme.decorations.headerDivider) {
      slide.addShape("rect", {
        x: layout.header.divider.x,
        y: layout.header.divider.y,
        w: layout.header.divider.w,
        h: layout.header.divider.h,
        fill: { color: theme.colors.border },
        line: { color: theme.colors.border, width: 0 },
      });
    }

    // B. Render Content Blocks & Illustrations
    const blocks = slideData.contentBlocks;
    const blockCount = blocks.length;
    const resolvedIll = options?.resolvedIllustrations?.get(slideData.slideId);

    if (resolvedIll) {
      // PPT-1D: Slide embeds an approved, verified illustration asset
      const hasCaption = !!resolvedIll.caption;
      const illLayout = computeIllustrationSlideLayout(
        layout,
        resolvedIll.placement,
        resolvedIll.aspectRatio,
        hasCaption
      );

      // Embed Real Image Binary into OpenXML PresentationML via PptxGenJS
      slide.addImage({
        data: resolvedIll.base64Data,
        x: illLayout.illustrationBox.x,
        y: illLayout.illustrationBox.y,
        w: illLayout.illustrationBox.w,
        h: illLayout.illustrationBox.h,
        sizing: {
          type: "contain",
          w: illLayout.illustrationBox.w,
          h: illLayout.illustrationBox.h,
        },
        altText: resolvedIll.altText || resolvedIll.caption || "Ilustrasi Pembelajaran",
        rounding: true,
      });

      // Render Caption if present
      if (hasCaption && illLayout.captionBox) {
        slide.addText(resolvedIll.caption!, {
          x: illLayout.captionBox.x,
          y: illLayout.captionBox.y,
          w: illLayout.captionBox.w,
          h: illLayout.captionBox.h,
          fontFace: theme.typography.bodyFont,
          fontSize: 9,
          italic: true,
          align: "center",
          color: theme.colors.textSecondary,
          valign: "top",
        });
      }

      // Render Text Content Blocks inside illLayout.textBox (preventing collision)
      if (blockCount === 1) {
        renderContentBlock({
          slide,
          theme,
          box: illLayout.textBox,
          block: blocks[0],
          referencedAssetIds: slideData.referencedAssetIds,
          requiresGeneratedIllustration: false,
        });
        totalBlocksRendered++;
      } else {
        const subH = Math.max(0.6, (illLayout.textBox.h - 0.2 * (blockCount - 1)) / blockCount);
        for (let bi = 0; bi < blockCount; bi++) {
          const subBox: BoundingBox = {
            x: illLayout.textBox.x,
            y: illLayout.textBox.y + bi * (subH + 0.2),
            w: illLayout.textBox.w,
            h: subH,
          };
          renderContentBlock({
            slide,
            theme,
            box: subBox,
            block: blocks[bi],
            referencedAssetIds: slideData.referencedAssetIds,
            requiresGeneratedIllustration: false,
          });
          totalBlocksRendered++;
        }
      }

      embeddedIllustrationsList.push({
        assetId: resolvedIll.assetId,
        slideId: slideData.slideId,
        sha256Hash: resolvedIll.sha256Hash,
        reviewId: resolvedIll.reviewId,
        placement: resolvedIll.placement,
        byteSize: resolvedIll.bytes?.length || (resolvedIll.base64Data ? Buffer.byteLength(resolvedIll.base64Data, "base64") : 0),
      });
    } else if (blockCount === 1) {
      // Single block: occupies full content area
      renderContentBlock({
        slide,
        theme,
        box: layout.contentArea,
        block: blocks[0],
        referencedAssetIds: slideData.referencedAssetIds,
        requiresGeneratedIllustration: slideData.requiresGeneratedIllustration,
      });
      totalBlocksRendered++;
    } else if (blockCount === 2) {
      // 2 blocks: left and right column
      renderContentBlock({
        slide,
        theme,
        box: layout.columns2.left,
        block: blocks[0],
        referencedAssetIds: slideData.referencedAssetIds,
        requiresGeneratedIllustration: slideData.requiresGeneratedIllustration,
      });
      renderContentBlock({
        slide,
        theme,
        box: layout.columns2.right,
        block: blocks[1],
        referencedAssetIds: slideData.referencedAssetIds,
        requiresGeneratedIllustration: slideData.requiresGeneratedIllustration,
      });
      totalBlocksRendered += 2;
    } else if (blockCount === 3) {
      // 3 blocks: 3-column split
      renderContentBlock({
        slide,
        theme,
        box: layout.columns3.col1,
        block: blocks[0],
        referencedAssetIds: slideData.referencedAssetIds,
        requiresGeneratedIllustration: slideData.requiresGeneratedIllustration,
      });
      renderContentBlock({
        slide,
        theme,
        box: layout.columns3.col2,
        block: blocks[1],
        referencedAssetIds: slideData.referencedAssetIds,
        requiresGeneratedIllustration: slideData.requiresGeneratedIllustration,
      });
      renderContentBlock({
        slide,
        theme,
        box: layout.columns3.col3,
        block: blocks[2],
        referencedAssetIds: slideData.referencedAssetIds,
        requiresGeneratedIllustration: slideData.requiresGeneratedIllustration,
      });
      totalBlocksRendered += 3;
    } else {
      // 4 or more blocks: 2x2 grid distribution
      const halfW = layout.columns2.left.w;
      const halfH = (layout.contentArea.h - 0.25) / 2;
      const topY = layout.contentArea.y;
      const botY = topY + halfH + 0.25;

      const boxes: BoundingBox[] = [
        { x: layout.columns2.left.x, y: topY, w: halfW, h: halfH },
        { x: layout.columns2.right.x, y: topY, w: halfW, h: halfH },
        { x: layout.columns2.left.x, y: botY, w: halfW, h: halfH },
        { x: layout.columns2.right.x, y: botY, w: halfW, h: halfH },
      ];

      for (let bi = 0; bi < Math.min(blocks.length, 4); bi++) {
        renderContentBlock({
          slide,
          theme,
          box: boxes[bi],
          block: blocks[bi],
          referencedAssetIds: slideData.referencedAssetIds,
          requiresGeneratedIllustration: slideData.requiresGeneratedIllustration,
        });
        totalBlocksRendered++;
      }
    }

    // C. Render Footer & Slide Numbering
    const footerPolicy = validPackage.parameters.footerPolicy || "standard";
    if (footerPolicy !== "none") {
      // Left info: Title or minimal branding
      const leftFooterText =
        footerPolicy === "title_only" || footerPolicy === "standard" || footerPolicy === "full"
          ? `${validPackage.title} · ${validPackage.targetAudience}`
          : "GuruPro Presentasi";

      slide.addText(leftFooterText, {
        x: layout.footer.leftInfo.x,
        y: layout.footer.leftInfo.y,
        w: layout.footer.leftInfo.w,
        h: layout.footer.leftInfo.h,
        fontSize: 9,
        color: theme.colors.footerText,
        fontFace: theme.typography.bodyFont,
        valign: "middle",
      });

      // Right info: Slide numbering (if enabled)
      if (validPackage.parameters.includePageNumbering !== false) {
        slide.addText(`${slideData.order} / ${totalSlides}`, {
          x: layout.footer.pageNumber.x,
          y: layout.footer.pageNumber.y,
          w: layout.footer.pageNumber.w,
          h: layout.footer.pageNumber.h,
          fontSize: 9,
          bold: true,
          color: theme.colors.footerText,
          fontFace: theme.typography.bodyFont,
          valign: "middle",
          align: "right",
        });
      }
    }

    // D. Embed Speaker Notes (native OpenXML notesSlide)
    if (
      validPackage.parameters.includeSpeakerNotes !== false &&
      slideData.speakerNotes &&
      slideData.speakerNotes.trim()
    ) {
      slide.addNotes(slideData.speakerNotes.trim());
      speakerNotesEmbeddedCount++;
    }
  }

  // 6. Generate Genuine PPTX Binary Package
  let rawOutput: any;
  try {
    rawOutput = await pptx.write({ outputType: "uint8array" });
  } catch (err: any) {
    throw new AiServiceError(
      AI_ERROR_CODES.PPTX_RENDER_FAILED,
      `Gagal menghasilkan berkas PowerPoint biner: ${err.message}`
    );
  }

  const bytes = new Uint8Array(rawOutput as ArrayBuffer);

  // 7. Validate OOXML Binary Package Integrity
  const validation = await validatePptxPackage(bytes, totalSlides);

  // 8. Compute Deterministic SHA-256 Hash
  const fileHash = computePptxSha256(bytes);

  const durationMs = Date.now() - startTime;

  const renderMetadata: PresentationArtifactRenderMetadata = {
    library: "pptxgenjs",
    libraryVersion: "4.0.1",
    aspectRatio,
    slideDimensions: {
      width: dimensions.width,
      height: dimensions.height,
      unit: "inches",
    },
    themeApplied: theme.styleName,
    totalBlocksRendered,
    speakerNotesEmbeddedCount,
    renderDurationMs: durationMs,
    validationPassed: validation.valid,
    ooxmlPartsVerified: validation.ooxmlParts,
    referencedAssetCount,
    requiresIllustrationPlaceholderCount,
    embeddedIllustrationCount: embeddedIllustrationsList.length,
    embeddedIllustrations: embeddedIllustrationsList,
    generatorVersion: validPackage.generationMetadata.generatorVersion || "v1",
  };

  return {
    bytes,
    byteSize: bytes.length,
    fileHash,
    slideCount: totalSlides,
    validation,
    renderMetadata,
  };
}
