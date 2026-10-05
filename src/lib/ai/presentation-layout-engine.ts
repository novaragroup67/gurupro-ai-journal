/**
 * ==============================================================================
 * GURUPRO AI: PRESENTATION LAYOUT ENGINE (PPT-1C)
 * ==============================================================================
 *
 * Deterministic slide coordinate system and layout calculator:
 * - Aspect ratios: 16:9 (13.333" x 7.5") and 4:3 (10.0" x 7.5")
 * - Layout regions: Header (title + badge), Content Body, Multi-Columns, Footer
 * - Strict bounds checking to prevent content clipping and negative coordinates
 * - Specialized pedagogical layout profiles
 */

import { ResolvedPresentationTheme } from "./presentation-style-resolver";
import {
  SlidePedagogicalType,
  IllustrationPlacement,
} from "./presentation-generation-contract";
import { AI_ERROR_CODES, AiServiceError } from "./error-taxonomy";

export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SlideLayoutDimensions {
  aspectRatio: "16:9" | "4:3";
  width: number; // inches
  height: number; // inches
}

export interface ComputedSlideLayout {
  dimensions: SlideLayoutDimensions;
  header: {
    badge: BoundingBox;
    title: BoundingBox;
    divider: BoundingBox;
  };
  contentArea: BoundingBox;
  columns2: {
    left: BoundingBox;
    right: BoundingBox;
  };
  columns3: {
    col1: BoundingBox;
    col2: BoundingBox;
    col3: BoundingBox;
  };
  footer: {
    leftInfo: BoundingBox;
    pageNumber: BoundingBox;
  };
  pedagogicalType: SlidePedagogicalType;
}

/**
 * Returns standard dimensions in inches for supported aspect ratios.
 */
export function getSlideDimensions(aspectRatio: "16:9" | "4:3" = "16:9"): SlideLayoutDimensions {
  if (aspectRatio === "4:3") {
    return {
      aspectRatio: "4:3",
      width: 10.0,
      height: 7.5,
    };
  }
  return {
    aspectRatio: "16:9",
    width: 13.333,
    height: 7.5,
  };
}

/**
 * Computes deterministic slide regions based on theme, aspect ratio, and pedagogical type.
 */
export function computeSlideLayout(
  theme: ResolvedPresentationTheme,
  pedagogicalType: SlidePedagogicalType = "concept_explanation",
  aspectRatio: "16:9" | "4:3" = "16:9",
  isCoverSlide = false
): ComputedSlideLayout {
  const dim = getSlideDimensions(aspectRatio);
  const { marginLeft, marginRight, marginTop, marginBottom, titleBottomGap } = theme.spacing;

  const contentWidth = Math.max(1, dim.width - (marginLeft + marginRight));
  const footerHeight = 0.35;
  const footerY = dim.height - marginBottom;

  // Cover Slide (Slide 1 Introduction) Layout
  if (isCoverSlide) {
    const coverTitleY = dim.height * 0.28;
    const coverTitleH = 1.4;
    return {
      dimensions: dim,
      header: {
        badge: { x: marginLeft, y: coverTitleY - 0.5, w: 3.5, h: 0.35 },
        title: { x: marginLeft, y: coverTitleY, w: contentWidth, h: coverTitleH },
        divider: { x: marginLeft, y: coverTitleY + coverTitleH + 0.15, w: 2.5, h: 0.04 },
      },
      contentArea: {
        x: marginLeft,
        y: coverTitleY + coverTitleH + 0.35,
        w: contentWidth,
        h: footerY - (coverTitleY + coverTitleH + 0.5),
      },
      columns2: {
        left: { x: marginLeft, y: coverTitleY + coverTitleH + 0.35, w: (contentWidth - 0.4) / 2, h: 2.2 },
        right: { x: marginLeft + (contentWidth - 0.4) / 2 + 0.4, y: coverTitleY + coverTitleH + 0.35, w: (contentWidth - 0.4) / 2, h: 2.2 },
      },
      columns3: {
        col1: { x: marginLeft, y: 3.0, w: contentWidth / 3, h: 2.0 },
        col2: { x: marginLeft + contentWidth / 3, y: 3.0, w: contentWidth / 3, h: 2.0 },
        col3: { x: marginLeft + (contentWidth / 3) * 2, y: 3.0, w: contentWidth / 3, h: 2.0 },
      },
      footer: {
        leftInfo: { x: marginLeft, y: footerY, w: contentWidth - 1.5, h: footerHeight },
        pageNumber: { x: dim.width - marginRight - 1.2, y: footerY, w: 1.2, h: footerHeight },
      },
      pedagogicalType,
    };
  }

  // Standard Header Region
  const badgeH = 0.28;
  const badgeW = 2.4;
  const badgeY = marginTop;

  const titleY = badgeY + badgeH + 0.06;
  const titleH = 0.75;

  const dividerY = titleY + titleH + 0.08;
  const dividerH = 0.03;

  // Content Area Region
  const contentY = dividerY + titleBottomGap;
  const contentH = Math.max(1.0, footerY - contentY - 0.15);

  // 2-Column Split calculation (Gap = 0.35")
  const colGap2 = 0.35;
  const colW2 = (contentWidth - colGap2) / 2;
  const colLeft: BoundingBox = { x: marginLeft, y: contentY, w: colW2, h: contentH };
  const colRight: BoundingBox = { x: marginLeft + colW2 + colGap2, y: contentY, w: colW2, h: contentH };

  // 3-Column Split calculation (Gap = 0.25")
  const colGap3 = 0.25;
  const colW3 = (contentWidth - colGap3 * 2) / 3;
  const col1: BoundingBox = { x: marginLeft, y: contentY, w: colW3, h: contentH };
  const col2: BoundingBox = { x: marginLeft + colW3 + colGap3, y: contentY, w: colW3, h: contentH };
  const col3: BoundingBox = { x: marginLeft + (colW3 + colGap3) * 2, y: contentY, w: colW3, h: contentH };

  return {
    dimensions: dim,
    header: {
      badge: { x: marginLeft, y: badgeY, w: badgeW, h: badgeH },
      title: { x: marginLeft, y: titleY, w: contentWidth, h: titleH },
      divider: { x: marginLeft, y: dividerY, w: contentWidth, h: dividerH },
    },
    contentArea: {
      x: marginLeft,
      y: contentY,
      w: contentWidth,
      h: contentH,
    },
    columns2: {
      left: colLeft,
      right: colRight,
    },
    columns3: {
      col1,
      col2,
      col3,
    },
    footer: {
      leftInfo: { x: marginLeft, y: footerY, w: contentWidth - 1.5, h: footerHeight },
      pageNumber: { x: dim.width - marginRight - 1.2, y: footerY, w: 1.2, h: footerHeight },
    },
    pedagogicalType,
  };
}

/**
 * Asserts that a bounding box fits strictly inside slide bounds.
 * Throws typed AiServiceError if bounds are breached.
 */
export function assertWithinSlideBounds(
  box: BoundingBox,
  dim: SlideLayoutDimensions,
  label = "Elemen slide"
): void {
  if (box.x < 0 || box.y < 0) {
    throw new AiServiceError(
      AI_ERROR_CODES.PPTX_RENDER_FAILED,
      `Batas slide terlanggar: ${label} memiliki koordinat negatif (x=${box.x}, y=${box.y}).`
    );
  }
  if (box.x + box.w > dim.width + 0.05) {
    throw new AiServiceError(
      AI_ERROR_CODES.PPTX_RENDER_FAILED,
      `Batas lebar slide terlanggar: ${label} melebihi lebar slide (x+w=${box.x + box.w}, maxWidth=${dim.width}).`
    );
  }
  if (box.y + box.h > dim.height + 0.05) {
    throw new AiServiceError(
      AI_ERROR_CODES.PPTX_RENDER_FAILED,
      `Batas tinggi slide terlanggar: ${label} melebihi tinggi slide (y+h=${box.y + box.h}, maxHeight=${dim.height}).`
    );
  }
}

// ==============================================================================
// ILLUSTRATION SLIDE LAYOUT ENGINE (PPT-1D)
// ==============================================================================

export interface IllustrationSlideLayout {
  textBox: BoundingBox;
  illustrationBox: BoundingBox;
  captionBox?: BoundingBox;
  placement: IllustrationPlacement;
}

/**
 * Computes non-overlapping, aspect-ratio-preserving layout for slides embedding
 * approved illustrations.
 */
export function computeIllustrationSlideLayout(
  layout: ComputedSlideLayout,
  placement: IllustrationPlacement = "right",
  imageAspectRatio = 1.0, // width / height
  hasCaption = false
): IllustrationSlideLayout {
  const content = layout.contentArea;
  const captionH = hasCaption ? 0.45 : 0;
  const gap = 0.35;

  let textBox: BoundingBox;
  let rawIllBox: BoundingBox;

  switch (placement) {
    case "left": {
      // Left: 45% width for illustration, 55% for text
      const leftW = (content.w - gap) * 0.45;
      const rightW = (content.w - gap) * 0.55;
      rawIllBox = { x: content.x, y: content.y, w: leftW, h: Math.max(1.0, content.h - captionH) };
      textBox = { x: content.x + leftW + gap, y: content.y, w: rightW, h: content.h };
      break;
    }
    case "center": {
      const illW = Math.min(content.w * 0.75, 7.5);
      const illH = Math.min(content.h * 0.65, 3.5) - captionH;
      const illX = content.x + (content.w - illW) / 2;
      rawIllBox = { x: illX, y: content.y + (content.h - illH - captionH) / 2, w: illW, h: Math.max(1.0, illH) };
      textBox = { x: content.x, y: content.y, w: content.w, h: 0.85 };
      break;
    }
    case "full_width": {
      const illW = content.w;
      const illH = Math.max(1.0, content.h - captionH);
      rawIllBox = { x: content.x, y: content.y, w: illW, h: illH };
      textBox = { x: content.x, y: content.y, w: content.w, h: 0.05 };
      break;
    }
    case "split_card":
    case "right":
    default: {
      // Right: 55% for text, 45% for illustration
      const leftW = (content.w - gap) * 0.55;
      const rightW = (content.w - gap) * 0.45;
      textBox = { x: content.x, y: content.y, w: leftW, h: content.h };
      rawIllBox = { x: content.x + leftW + gap, y: content.y, w: rightW, h: Math.max(1.0, content.h - captionH) };
      break;
    }
  }

  // Preserve aspect ratio inside rawIllBox (fit within bounds)
  const safeAspectRatio = imageAspectRatio > 0 ? imageAspectRatio : 1.0;
  let fitW = rawIllBox.w;
  let fitH = fitW / safeAspectRatio;
  if (fitH > rawIllBox.h) {
    fitH = rawIllBox.h;
    fitW = fitH * safeAspectRatio;
  }

  // Center fitted image within rawIllBox
  const illustrationBox: BoundingBox = {
    x: rawIllBox.x + (rawIllBox.w - fitW) / 2,
    y: rawIllBox.y + (rawIllBox.h - fitH) / 2,
    w: fitW,
    h: fitH,
  };

  let captionBox: BoundingBox | undefined = undefined;
  if (hasCaption) {
    captionBox = {
      x: rawIllBox.x,
      y: rawIllBox.y + rawIllBox.h + 0.05,
      w: rawIllBox.w,
      h: Math.max(0.3, captionH - 0.05),
    };
    assertWithinSlideBounds(captionBox, layout.dimensions, "Kotak keterangan ilustrasi");
  }

  assertWithinSlideBounds(textBox, layout.dimensions, "Kotak teks slide");
  assertWithinSlideBounds(illustrationBox, layout.dimensions, "Kotak ilustrasi slide");

  return {
    textBox,
    illustrationBox,
    captionBox,
    placement,
  };
}
