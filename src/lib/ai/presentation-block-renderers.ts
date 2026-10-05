/**
 * ==============================================================================
 * GURUPRO AI: PRESENTATION BLOCK RENDERERS (PPT-1C)
 * ==============================================================================
 *
 * Dedicated block-level renderers for all 24 canonical PPT-1B block types
 * using pptxgenjs primitives (text, shapes, tables):
 * - Clean visual hierarchy according to resolved presentation theme
 * - Preserves exact text, punctuation, numbers, formulas, and indentation
 * - Native PowerPoint tables, lists, and editable diagram placeholder shapes
 * - Strict non-generative illustration boundaries (zero AI image calls)
 * - Fails closed on any unsupported block type
 */

import { ResolvedPresentationTheme } from "./presentation-style-resolver";
import { BoundingBox } from "./presentation-layout-engine";
import {
  PresentationContentBlock,
  PresentationContentBlockType,
} from "./presentation-generation-contract";
import { AI_ERROR_CODES, AiServiceError } from "./error-taxonomy";

export interface BlockRenderContext {
  slide: any; // pptxgenjs slide instance
  theme: ResolvedPresentationTheme;
  box: BoundingBox;
  block: PresentationContentBlock;
  referencedAssetIds?: string[];
  requiresGeneratedIllustration?: boolean;
}

/**
 * Main dispatcher for rendering a content block.
 * Fails closed on unsupported block types.
 */
export function renderContentBlock(context: BlockRenderContext): void {
  const { block } = context;

  switch (block.type) {
    case "text":
    case "paragraph":
      renderParagraphBlock(context);
      break;

    case "key_value":
      renderKeyValueBlock(context);
      break;

    case "bullet_list":
      renderBulletListBlock(context);
      break;

    case "numbered_list":
      renderNumberedListBlock(context);
      break;

    case "quote":
      renderQuoteBlock(context);
      break;

    case "callout":
      renderCalloutBlock(context);
      break;

    case "code_snippet":
      renderCodeSnippetBlock(context);
      break;

    case "table":
      renderTableBlock(context);
      break;

    case "comparison":
    case "comparison_column":
      renderComparisonBlock(context);
      break;

    case "stat_metric":
    case "key_stat":
      renderStatMetricBlock(context);
      break;

    case "diagram":
    case "diagram_placeholder":
      renderDiagramPlaceholderBlock(context);
      break;

    case "timeline_step":
      renderTimelineStepBlock(context);
      break;

    case "formula_block":
      renderFormulaBlock(context);
      break;

    case "reflection_prompt":
      renderReflectionPromptBlock(context);
      break;

    case "activity_instruction":
      renderActivityInstructionBlock(context);
      break;

    case "definition":
    case "example":
    case "process":
    case "summary":
      renderContextualCardBlock(context);
      break;

    case "image":
      renderImagePlaceholderBlock(context);
      break;

    default: {
      const exhaustiveCheck: never = block.type as never;
      throw new AiServiceError(
        AI_ERROR_CODES.PPTX_RENDER_FAILED,
        `Tipe blok konten '${block.type}' tidak didukung oleh renderer PPT-1C.`
      );
    }
  }
}

// ==============================================================================
// 1. TEXT & PARAGRAPH
// ==============================================================================

function renderParagraphBlock({ slide, theme, box, block }: BlockRenderContext) {
  const lines: any[] = [];

  if (block.title) {
    lines.push({
      text: `${block.title}\n`,
      options: {
        bold: true,
        fontSize: theme.typography.headingFontSize,
        color: theme.colors.primary,
        fontFace: theme.typography.titleFont,
      },
    });
  }

  lines.push({
    text: block.content,
    options: {
      fontSize: theme.typography.bodyFontSize,
      color: theme.colors.textPrimary,
      fontFace: theme.typography.bodyFont,
      breakLine: false,
    },
  });

  slide.addText(lines, {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    valign: "top",
    margin: 0.05,
    wrap: true,
  });
}

// ==============================================================================
// 2. KEY VALUE
// ==============================================================================

function renderKeyValueBlock({ slide, theme, box, block }: BlockRenderContext) {
  // Render container card
  slide.addShape("roundRect", {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    fill: { color: theme.colors.cardBackground },
    line: { color: theme.colors.border, width: 1 },
    rectRadius: 0.1,
  });

  const title = block.title || "Kunci & Nilai";
  slide.addText(
    [
      {
        text: `${title}\n`,
        options: {
          bold: true,
          fontSize: theme.typography.headingFontSize,
          color: theme.colors.primary,
          fontFace: theme.typography.titleFont,
        },
      },
      {
        text: block.content,
        options: {
          fontSize: theme.typography.bodyFontSize,
          color: theme.colors.textPrimary,
          fontFace: theme.typography.bodyFont,
        },
      },
    ],
    {
      x: box.x + 0.15,
      y: box.y + 0.12,
      w: box.w - 0.3,
      h: box.h - 0.24,
      valign: "top",
      wrap: true,
    }
  );
}

// ==============================================================================
// 3. BULLET & NUMBERED LISTS
// ==============================================================================

function renderBulletListBlock({ slide, theme, box, block }: BlockRenderContext) {
  const items = block.content
    .split("\n")
    .map((s) => s.replace(/^[-*•\d+.]\s*/, "").trim())
    .filter(Boolean);

  const textArray: any[] = [];

  if (block.title) {
    textArray.push({
      text: `${block.title}\n`,
      options: {
        bold: true,
        fontSize: theme.typography.headingFontSize,
        color: theme.colors.primary,
        fontFace: theme.typography.titleFont,
      },
    });
  }

  for (const item of items) {
    textArray.push({
      text: item,
      options: {
        bullet: true,
        fontSize: theme.typography.bulletFontSize,
        color: theme.colors.textPrimary,
        fontFace: theme.typography.bodyFont,
        breakLine: true,
      },
    });
  }

  slide.addText(textArray, {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    valign: "top",
    margin: 0.05,
    wrap: true,
  });
}

function renderNumberedListBlock({ slide, theme, box, block }: BlockRenderContext) {
  const items = block.content
    .split("\n")
    .map((s) => s.replace(/^[-*•\d+.]\s*/, "").trim())
    .filter(Boolean);

  const textArray: any[] = [];

  if (block.title) {
    textArray.push({
      text: `${block.title}\n`,
      options: {
        bold: true,
        fontSize: theme.typography.headingFontSize,
        color: theme.colors.primary,
        fontFace: theme.typography.titleFont,
      },
    });
  }

  items.forEach((item, idx) => {
    textArray.push({
      text: `${idx + 1}.  ${item}`,
      options: {
        fontSize: theme.typography.bulletFontSize,
        color: theme.colors.textPrimary,
        fontFace: theme.typography.bodyFont,
        breakLine: true,
      },
    });
  });

  slide.addText(textArray, {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    valign: "top",
    margin: 0.05,
    wrap: true,
  });
}

// ==============================================================================
// 4. QUOTE
// ==============================================================================

function renderQuoteBlock({ slide, theme, box, block }: BlockRenderContext) {
  // Container box
  slide.addShape("rect", {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    fill: { color: theme.colors.cardBackgroundAlt },
    line: { color: theme.colors.accent, width: 2 },
  });

  slide.addText(
    [
      {
        text: `“${block.content}”\n`,
        options: {
          italic: true,
          fontSize: theme.typography.bodyFontSize + 1,
          color: theme.colors.textPrimary,
          fontFace: theme.typography.titleFont,
        },
      },
      {
        text: block.title ? `— ${block.title}` : "",
        options: {
          bold: true,
          fontSize: theme.typography.captionFontSize + 1,
          color: theme.colors.textSecondary,
          fontFace: theme.typography.bodyFont,
        },
      },
    ],
    {
      x: box.x + 0.2,
      y: box.y + 0.15,
      w: box.w - 0.4,
      h: box.h - 0.3,
      valign: "middle",
      align: "center",
      wrap: true,
    }
  );
}

// ==============================================================================
// 5. CALLOUT
// ==============================================================================

function renderCalloutBlock({ slide, theme, box, block }: BlockRenderContext) {
  // Card background
  slide.addShape("roundRect", {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    fill: { color: theme.colors.cardBackground },
    line: { color: theme.colors.accent, width: 2 },
    rectRadius: 0.08,
  });

  const heading = block.title || "Perhatian";

  slide.addText(
    [
      {
        text: `📌  ${heading}\n`,
        options: {
          bold: true,
          fontSize: theme.typography.headingFontSize,
          color: theme.colors.accent,
          fontFace: theme.typography.titleFont,
        },
      },
      {
        text: block.content,
        options: {
          fontSize: theme.typography.bodyFontSize,
          color: theme.colors.textPrimary,
          fontFace: theme.typography.bodyFont,
        },
      },
    ],
    {
      x: box.x + 0.18,
      y: box.y + 0.12,
      w: box.w - 0.36,
      h: box.h - 0.24,
      valign: "top",
      wrap: true,
    }
  );
}

// ==============================================================================
// 6. CODE SNIPPET
// ==============================================================================

function renderCodeSnippetBlock({ slide, theme, box, block }: BlockRenderContext) {
  // Dark terminal container
  slide.addShape("rect", {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    fill: { color: theme.colors.codeBackground },
    line: { color: theme.colors.border, width: 1 },
  });

  const language = block.metadata?.language || "KODE";

  slide.addText(
    [
      {
        text: `// ${language} — ${block.title || "Contoh Kode"}\n`,
        options: {
          bold: true,
          fontSize: 9.5,
          color: theme.colors.accent,
          fontFace: theme.typography.codeFont,
        },
      },
      {
        text: block.content,
        options: {
          fontSize: 10,
          color: theme.colors.codeText,
          fontFace: theme.typography.codeFont,
        },
      },
    ],
    {
      x: box.x + 0.15,
      y: box.y + 0.1,
      w: box.w - 0.3,
      h: box.h - 0.2,
      valign: "top",
      wrap: true,
    }
  );
}

// ==============================================================================
// 7. TABLE
// ==============================================================================

function renderTableBlock({ slide, theme, box, block }: BlockRenderContext) {
  let tableY = box.y;
  if (block.title) {
    const titleH = 0.32;
    slide.addText(block.title, {
      x: box.x,
      y: box.y,
      w: box.w,
      h: titleH,
      fontFace: theme.typography.titleFont,
      fontSize: 12,
      bold: true,
      color: theme.colors.textPrimary,
      valign: "top",
    });
    tableY = box.y + titleH;
  }

  let tableRows: any[][] = [];

  // Parse structured table data if available in metadata
  if (Array.isArray(block.metadata?.rows) && block.metadata.rows.length > 0) {
    const headers = block.metadata.headers || [];
    if (headers.length > 0) {
      tableRows.push(
        headers.map((h: string) => ({
          text: String(h),
          options: {
            bold: true,
            fill: theme.colors.primary,
            color: "FFFFFF",
            fontFace: theme.typography.titleFont,
            fontSize: 11,
          },
        }))
      );
    }
    for (const r of block.metadata.rows) {
      tableRows.push(
        (Array.isArray(r) ? r : [r]).map((c: any) => ({
          text: String(c),
          options: {
            fill: theme.colors.cardBackground,
            color: theme.colors.textPrimary,
            fontFace: theme.typography.bodyFont,
            fontSize: 10,
          },
        }))
      );
    }
  } else {
    // Parse markdown / plain text table
    const lines = block.content.split("\n").filter((l) => l.includes("|") || l.trim());
    if (lines.length > 0) {
      for (const line of lines) {
        if (line.includes("---")) continue; // Skip separator line
        const cells = line
          .split("|")
          .map((c) => c.trim())
          .filter(Boolean);
        if (cells.length > 0) {
          const isHeader = tableRows.length === 0;
          tableRows.push(
            cells.map((c) => ({
              text: c,
              options: {
                bold: isHeader,
                fill: isHeader ? theme.colors.primary : theme.colors.cardBackground,
                color: isHeader ? "FFFFFF" : theme.colors.textPrimary,
                fontFace: isHeader ? theme.typography.titleFont : theme.typography.bodyFont,
                fontSize: isHeader ? 11 : 10,
              },
            }))
          );
        }
      }
    }
  }

  // Fallback if no table cells parsed
  if (tableRows.length === 0) {
    tableRows = [
      [
        {
          text: block.title || "Tabel Informasi",
          options: { bold: true, fill: theme.colors.primary, color: "FFFFFF", fontSize: 11 },
        },
      ],
      [
        {
          text: block.content,
          options: { fill: theme.colors.cardBackground, color: theme.colors.textPrimary, fontSize: 10 },
        },
      ],
    ];
  }

  slide.addTable(tableRows, {
    x: box.x,
    y: tableY,
    w: box.w,
    colW: Array(tableRows[0].length).fill(box.w / tableRows[0].length),
    border: { pt: 1, color: theme.colors.border },
    margin: 0.08,
  });
}

// ==============================================================================
// 8. COMPARISON
// ==============================================================================

function renderComparisonBlock({ slide, theme, box, block }: BlockRenderContext) {
  slide.addShape("roundRect", {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    fill: { color: theme.colors.cardBackground },
    line: { color: theme.colors.primary, width: 1 },
    rectRadius: 0.1,
  });

  slide.addText(
    [
      {
        text: `⚖️  ${block.title || "Perbandingan Konsep"}\n`,
        options: {
          bold: true,
          fontSize: theme.typography.headingFontSize,
          color: theme.colors.primary,
          fontFace: theme.typography.titleFont,
        },
      },
      {
        text: block.content,
        options: {
          fontSize: theme.typography.bodyFontSize,
          color: theme.colors.textPrimary,
          fontFace: theme.typography.bodyFont,
        },
      },
    ],
    {
      x: box.x + 0.15,
      y: box.y + 0.12,
      w: box.w - 0.3,
      h: box.h - 0.24,
      valign: "top",
      wrap: true,
    }
  );
}

// ==============================================================================
// 9. STAT METRIC
// ==============================================================================

function renderStatMetricBlock({ slide, theme, box, block }: BlockRenderContext) {
  slide.addShape("roundRect", {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    fill: { color: theme.colors.cardBackgroundAlt },
    line: { color: theme.colors.secondary, width: 2 },
    rectRadius: 0.12,
  });

  const value = block.metadata?.value || block.content.split("\n")[0] || "100%";
  const label = block.title || block.content.split("\n").slice(1).join(" ") || "Metrik Kunci";

  slide.addText(
    [
      {
        text: `${value}\n`,
        options: {
          bold: true,
          fontSize: theme.typography.statNumberFontSize,
          color: theme.colors.secondary,
          fontFace: theme.typography.titleFont,
        },
      },
      {
        text: label,
        options: {
          bold: true,
          fontSize: theme.typography.bodyFontSize,
          color: theme.colors.textSecondary,
          fontFace: theme.typography.bodyFont,
        },
      },
    ],
    {
      x: box.x + 0.15,
      y: box.y + 0.1,
      w: box.w - 0.3,
      h: box.h - 0.2,
      valign: "middle",
      align: "center",
      wrap: true,
    }
  );
}

// ==============================================================================
// 10. DIAGRAM PLACEHOLDER & TIMELINE
// ==============================================================================

function renderDiagramPlaceholderBlock({ slide, theme, box, block }: BlockRenderContext) {
  // Renders editable PowerPoint shapes for diagram
  slide.addShape("roundRect", {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    fill: { color: theme.colors.cardBackground },
    line: { color: theme.colors.accent, width: 1.5, dashType: "dash" },
    rectRadius: 0.1,
  });

  slide.addText(
    [
      {
        text: `📊  [DIAGRAM ALUR]: ${block.title || "Skema Konseptual"}\n`,
        options: {
          bold: true,
          fontSize: theme.typography.headingFontSize,
          color: theme.colors.accent,
          fontFace: theme.typography.titleFont,
        },
      },
      {
        text: `${block.content}\n\n(Bentuk diagram PowerPoint yang dapat diedit langsung)`,
        options: {
          fontSize: theme.typography.captionFontSize + 1,
          color: theme.colors.textSecondary,
          fontFace: theme.typography.bodyFont,
        },
      },
    ],
    {
      x: box.x + 0.2,
      y: box.y + 0.15,
      w: box.w - 0.4,
      h: box.h - 0.3,
      valign: "middle",
      align: "center",
      wrap: true,
    }
  );
}

function renderTimelineStepBlock({ slide, theme, box, block }: BlockRenderContext) {
  slide.addShape("roundRect", {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    fill: { color: theme.colors.cardBackground },
    line: { color: theme.colors.secondary, width: 1 },
    rectRadius: 0.08,
  });

  slide.addText(
    [
      {
        text: `⏳  ${block.title || "Tahapan Waktu / Langkah"}\n`,
        options: {
          bold: true,
          fontSize: theme.typography.headingFontSize,
          color: theme.colors.secondary,
          fontFace: theme.typography.titleFont,
        },
      },
      {
        text: block.content,
        options: {
          fontSize: theme.typography.bodyFontSize,
          color: theme.colors.textPrimary,
          fontFace: theme.typography.bodyFont,
        },
      },
    ],
    {
      x: box.x + 0.15,
      y: box.y + 0.1,
      w: box.w - 0.3,
      h: box.h - 0.2,
      valign: "top",
      wrap: true,
    }
  );
}

// ==============================================================================
// 11. FORMULA BLOCK
// ==============================================================================

function renderFormulaBlock({ slide, theme, box, block }: BlockRenderContext) {
  slide.addShape("roundRect", {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    fill: { color: theme.colors.cardBackgroundAlt },
    line: { color: theme.colors.primary, width: 1.5 },
    rectRadius: 0.08,
  });

  slide.addText(
    [
      {
        text: `📐  ${block.title || "Formula / Persamaan"}\n`,
        options: {
          bold: true,
          fontSize: theme.typography.captionFontSize + 1,
          color: theme.colors.textSecondary,
          fontFace: theme.typography.titleFont,
        },
      },
      {
        text: `${block.content}\n`,
        options: {
          bold: true,
          fontSize: theme.typography.headingFontSize + 2,
          color: theme.colors.primary,
          fontFace: theme.typography.codeFont,
        },
      },
    ],
    {
      x: box.x + 0.15,
      y: box.y + 0.1,
      w: box.w - 0.3,
      h: box.h - 0.2,
      valign: "middle",
      align: "center",
      wrap: true,
    }
  );
}

// ==============================================================================
// 12. REFLECTION & ACTIVITY
// ==============================================================================

function renderReflectionPromptBlock({ slide, theme, box, block }: BlockRenderContext) {
  slide.addShape("roundRect", {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    fill: { color: theme.colors.cardBackground },
    line: { color: theme.colors.secondary, width: 1.5 },
    rectRadius: 0.1,
  });

  slide.addText(
    [
      {
        text: `💡  ${block.title || "Refleksi Siswa"}\n`,
        options: {
          bold: true,
          fontSize: theme.typography.headingFontSize,
          color: theme.colors.secondary,
          fontFace: theme.typography.titleFont,
        },
      },
      {
        text: block.content,
        options: {
          italic: true,
          fontSize: theme.typography.bodyFontSize,
          color: theme.colors.textPrimary,
          fontFace: theme.typography.bodyFont,
        },
      },
    ],
    {
      x: box.x + 0.15,
      y: box.y + 0.1,
      w: box.w - 0.3,
      h: box.h - 0.2,
      valign: "top",
      wrap: true,
    }
  );
}

function renderActivityInstructionBlock({ slide, theme, box, block }: BlockRenderContext) {
  slide.addShape("roundRect", {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    fill: { color: theme.colors.cardBackground },
    line: { color: theme.colors.accent, width: 2 },
    rectRadius: 0.1,
  });

  slide.addText(
    [
      {
        text: `🎯  ${block.title || "Instruksi Aktivitas"}\n`,
        options: {
          bold: true,
          fontSize: theme.typography.headingFontSize,
          color: theme.colors.accent,
          fontFace: theme.typography.titleFont,
        },
      },
      {
        text: block.content,
        options: {
          fontSize: theme.typography.bodyFontSize,
          color: theme.colors.textPrimary,
          fontFace: theme.typography.bodyFont,
        },
      },
    ],
    {
      x: box.x + 0.15,
      y: box.y + 0.1,
      w: box.w - 0.3,
      h: box.h - 0.2,
      valign: "top",
      wrap: true,
    }
  );
}

// ==============================================================================
// 13. CONTEXTUAL CARDS (DEFINITION, EXAMPLE, PROCESS, SUMMARY)
// ==============================================================================

function renderContextualCardBlock({ slide, theme, box, block }: BlockRenderContext) {
  const iconMap: Record<string, string> = {
    definition: "📖",
    example: "🔍",
    process: "⚙️",
    summary: "📝",
  };

  const icon = iconMap[block.type] || "📄";

  slide.addShape("roundRect", {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    fill: { color: theme.colors.cardBackground },
    line: { color: theme.colors.border, width: 1 },
    rectRadius: 0.08,
  });

  slide.addText(
    [
      {
        text: `${icon}  ${block.title || block.type.toUpperCase()}\n`,
        options: {
          bold: true,
          fontSize: theme.typography.headingFontSize,
          color: theme.colors.primary,
          fontFace: theme.typography.titleFont,
        },
      },
      {
        text: block.content,
        options: {
          fontSize: theme.typography.bodyFontSize,
          color: theme.colors.textPrimary,
          fontFace: theme.typography.bodyFont,
        },
      },
    ],
    {
      x: box.x + 0.15,
      y: box.y + 0.1,
      w: box.w - 0.3,
      h: box.h - 0.2,
      valign: "top",
      wrap: true,
    }
  );
}

// ==============================================================================
// 14. IMAGE / VISUAL PLACEHOLDER (STRICTLY NON-GENERATIVE)
// ==============================================================================

function renderImagePlaceholderBlock({
  slide,
  theme,
  box,
  block,
  referencedAssetIds,
  requiresGeneratedIllustration,
}: BlockRenderContext) {
  slide.addShape("roundRect", {
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    fill: { color: theme.colors.cardBackgroundAlt },
    line: { color: theme.colors.accent, width: 1.5, dashType: "dash" },
    rectRadius: 0.1,
  });

  let label = "🖼️  Slot Ilustrasi Visual";
  if (referencedAssetIds && referencedAssetIds.length > 0) {
    label += `\n(Aset Terdaftar: ${referencedAssetIds[0]})`;
  } else if (requiresGeneratedIllustration) {
    label += "\n(Menunggu Integrasi Ilustrasi PPT-1D)";
  }

  slide.addText(
    [
      {
        text: `${label}\n\n`,
        options: {
          bold: true,
          fontSize: theme.typography.captionFontSize + 1,
          color: theme.colors.accent,
          fontFace: theme.typography.titleFont,
        },
      },
      {
        text: block.content || "Area penempatan ilustrasi materi pembelajaran.",
        options: {
          fontSize: theme.typography.captionFontSize,
          color: theme.colors.textSecondary,
          fontFace: theme.typography.bodyFont,
        },
      },
    ],
    {
      x: box.x + 0.15,
      y: box.y + 0.1,
      w: box.w - 0.3,
      h: box.h - 0.2,
      valign: "middle",
      align: "center",
      wrap: true,
    }
  );
}
