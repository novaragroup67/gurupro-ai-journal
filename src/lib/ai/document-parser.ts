/**
 * GuruPro AI Foundation (AI-1) — Real Document Parser
 *
 * Extracts structured educational text from real file formats:
 * - DOCX: Extracts headings, lists, tables, and paragraphs from word/document.xml using fflate.
 * - PDF: Extracts page text, structural sections, and lists using unpdf.
 * - Plain Text & Markdown: Decodes UTF-8 and normalizes newlines.
 * - HTML: Uses standard DOM-like structural text extractor.
 *
 * Strict fidelity guarantees:
 * - Factual statements, numbers, formulas, dates, and definitions are NEVER rewritten.
 * - Corrupted or unreadable files fail safely with SOURCE_PARSE_ERROR without hallucination.
 */

import { unzipSync, strFromU8 } from "fflate";
import { extractText } from "unpdf";
import { AI_ERROR_CODES, AiServiceError } from "./error-taxonomy";
import { normalizeHtmlContent } from "./source-normalizer";

export type SupportedDocumentFormat = "docx" | "pdf" | "text" | "html";

export interface DocumentExtractOptions {
  buffer: Uint8Array | Buffer;
  fileName?: string;
  mimeType?: string;
}

export interface DocumentExtractResult {
  text: string;
  title?: string;
  format: SupportedDocumentFormat;
  pageCount?: number;
  wordCount: number;
  charCount: number;
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

/**
 * Extracts structured text and Markdown headings from DOCX word/document.xml
 */
export function extractDocxText(buffer: Uint8Array | Buffer): { text: string; title?: string } {
  const uint8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  if (uint8.byteLength < 4) {
    throw new AiServiceError(AI_ERROR_CODES.SOURCE_EMPTY, "File DOCX kosong (0 byte).");
  }

  // Verify PK zip signature (0x50, 0x4B, 0x03, 0x04)
  if (uint8[0] !== 0x50 || uint8[1] !== 0x4B) {
    throw new AiServiceError(
      AI_ERROR_CODES.SOURCE_PARSE_ERROR,
      "Format file bukan arsip DOCX yang valid (signature zip tidak cocok).",
    );
  }

  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(uint8);
  } catch (err: any) {
    throw new AiServiceError(
      AI_ERROR_CODES.SOURCE_PARSE_ERROR,
      `Gagal membaca file DOCX: arsip zip rusak atau terenkripsi (${err?.message || "unzip error"}).`,
    );
  }

  const docXmlBytes = unzipped["word/document.xml"];
  if (!docXmlBytes) {
    throw new AiServiceError(
      AI_ERROR_CODES.SOURCE_PARSE_ERROR,
      "File DOCX tidak memiliki komponen word/document.xml yang valid.",
    );
  }

  const xml = strFromU8(docXmlBytes);
  let firstHeading: string | undefined;
  const sections: string[] = [];

  // Parse paragraphs and tables
  // Match both <w:p>...</w:p> and <w:tbl>...</w:tbl>
  const blockRegex = /<(w:p|w:tbl)\b[\s\S]*?<\/\1>/gi;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(xml)) !== null) {
    const blockXml = match[0];
    const isTable = match[1].toLowerCase() === "w:tbl";

    if (isTable) {
      // Parse table rows
      const rowMatches = blockXml.match(/<w:tr\b[\s\S]*?<\/w:tr>/gi) || [];
      const tableRows: string[] = [];

      for (const rowXml of rowMatches) {
        const cellMatches = rowXml.match(/<w:tc\b[\s\S]*?<\/w:tc>/gi) || [];
        const cells: string[] = [];
        for (const cellXml of cellMatches) {
          const textRuns = (cellXml.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi) || [])
            .map((t) => t.replace(/<w:t\b[^>]*>|<\/w:t>/gi, ""))
            .join("");
          cells.push(decodeXmlEntities(textRuns).trim());
        }
        if (cells.length > 0 && cells.some((c) => c.length > 0)) {
          tableRows.push(`| ${cells.join(" | ")} |`);
        }
      }

      if (tableRows.length > 0) {
        // Add table separator after header if >= 2 rows
        if (tableRows.length >= 2) {
          const colCount = tableRows[0].split("|").length - 2;
          const sep = `| ${Array(colCount).fill("---").join(" | ")} |`;
          tableRows.splice(1, 0, sep);
        }
        sections.push(tableRows.join("\n"));
      }
    } else {
      // Paragraph <w:p>
      // Check paragraph style (e.g. Heading1, Heading2, Title)
      const styleMatch = /<w:pStyle\b[^>]*w:val="([^"]+)"/i.exec(blockXml);
      const styleVal = styleMatch ? styleMatch[1].toLowerCase() : "";

      // Check list numbering
      const isList = /<w:numPr\b/i.test(blockXml);

      // Extract all text elements <w:t>
      const textMatches = blockXml.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi) || [];
      const rawText = textMatches
        .map((t) => t.replace(/<w:t\b[^>]*>|<\/w:t>/gi, ""))
        .join("");
      const cleanText = decodeXmlEntities(rawText).trim();

      if (!cleanText) continue;

      let prefix = "";
      if (styleVal.includes("title") || styleVal === "heading1" || styleVal === "judul1") {
        prefix = "# ";
        if (!firstHeading) firstHeading = cleanText;
      } else if (styleVal === "heading2" || styleVal === "judul2") {
        prefix = "## ";
        if (!firstHeading) firstHeading = cleanText;
      } else if (styleVal === "heading3" || styleVal === "judul3") {
        prefix = "### ";
      } else if (styleVal === "heading4" || styleVal === "judul4") {
        prefix = "#### ";
      } else if (isList) {
        prefix = "- ";
      }

      sections.push(`${prefix}${cleanText}`);
    }
  }

  const structuredText = sections.join("\n\n").trim();
  if (!structuredText) {
    throw new AiServiceError(
      AI_ERROR_CODES.SOURCE_EMPTY,
      "Dokumen DOCX tidak memiliki teks konten yang dapat dibaca.",
    );
  }

  return {
    text: structuredText,
    title: firstHeading,
  };
}

/**
 * Extracts structured text from PDF using unpdf
 */
export async function extractPdfText(
  buffer: Uint8Array | Buffer,
): Promise<{ text: string; title?: string; pageCount: number }> {
  const uint8 = buffer.buffer
    ? new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))
    : new Uint8Array(buffer);

  if (uint8.byteLength < 4) {
    throw new AiServiceError(AI_ERROR_CODES.SOURCE_EMPTY, "File PDF kosong (0 byte).");
  }

  // Verify %PDF- signature
  const header = String.fromCharCode(...uint8.slice(0, 5));
  if (!header.startsWith("%PDF")) {
    throw new AiServiceError(
      AI_ERROR_CODES.SOURCE_PARSE_ERROR,
      "Format file bukan dokumen PDF yang valid (%PDF signature tidak ditemukan).",
    );
  }

  let textPages: string[] = [];
  let totalPages = 0;

  try {
    const res = await extractText(uint8);
    totalPages = res.totalPages || 1;
    // res.text is an array of page strings or a single string depending on unpdf options
    if (Array.isArray(res.text)) {
      textPages = res.text;
    } else if (typeof res.text === "string") {
      textPages = [res.text];
    }
  } catch (err: any) {
    throw new AiServiceError(
      AI_ERROR_CODES.SOURCE_PARSE_ERROR,
      `Gagal mengekstrak teks dari PDF: dokumen rusak atau dilindungi kata sandi (${err?.message || "pdf error"}).`,
    );
  }

  const rawExtracted = textPages.join("\n\n").trim();
  if (!rawExtracted) {
    throw new AiServiceError(
      AI_ERROR_CODES.SOURCE_PARSE_ERROR,
      "Dokumen PDF tidak berisi teks yang dapat diekstrak (kemungkinan berupa dokumen hasil scan/gambar murni tanpa lapisan teks).",
    );
  }

  // Structure paragraphs and recognize headings
  const lines = rawExtracted.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const structuredParagraphs: string[] = [];
  let currentParagraphLines: string[] = [];
  let firstHeading: string | undefined;

  for (const line of lines) {
    // Detect headings in PDF:
    // 1. Starts with Markdown heading (#)
    // 2. Starts with BAB / MODUL / CAPAIAN PEMBELAJARAN
    // 3. Numbered section heading like "1. Pendahuluan", "2.1 Konsep"
    // 4. Short uppercase line (< 60 chars) without ending period
    const isExplicitHeading = /^#{1,4}\s+.+$/.test(line);
    const isCapHeading = /^(BAB\s+[IVX0-9]+|MODUL\s+[0-9]+|CAPAIAN\s+PEMBELAJARAN|TUJUAN\s+PEMBELAJARAN)/i.test(line);
    const isNumberedHeading = /^[0-9]+(\.[0-9]+)*\s+[A-Z][a-zA-Z0-9\s]{3,60}$/.test(line);
    const isShortUpper = line.length <= 60 && line.length >= 4 && line === line.toUpperCase() && !/[.!?]$/.test(line) && !/^\d+$/.test(line);

    if (isExplicitHeading || isCapHeading || isNumberedHeading || isShortUpper) {
      if (currentParagraphLines.length > 0) {
        structuredParagraphs.push(currentParagraphLines.join(" "));
        currentParagraphLines = [];
      }
      const headingText = line.replace(/^#{1,4}\s*/, "").trim();
      if (!firstHeading) {
        firstHeading = headingText;
      }
      const prefix = isCapHeading ? "# " : isNumberedHeading ? "## " : "# ";
      structuredParagraphs.push(isExplicitHeading ? line : `${prefix}${headingText}`);
    } else if (/^[-*•]\s+/.test(line)) {
      if (currentParagraphLines.length > 0) {
        structuredParagraphs.push(currentParagraphLines.join(" "));
        currentParagraphLines = [];
      }
      structuredParagraphs.push(line);
    } else {
      currentParagraphLines.push(line);
    }
  }

  if (currentParagraphLines.length > 0) {
    structuredParagraphs.push(currentParagraphLines.join(" "));
  }

  const structuredText = structuredParagraphs.join("\n\n").trim();
  return {
    text: structuredText || rawExtracted,
    title: firstHeading,
    pageCount: totalPages,
  };
}

/**
 * Extracts plain text or markdown
 */
export function extractPlainText(buffer: Uint8Array | Buffer): { text: string; title?: string } {
  const uint8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const raw = decoder.decode(uint8);

  const clean = raw.replace(/\r\n/g, "\n").trim();
  if (!clean) {
    throw new AiServiceError(AI_ERROR_CODES.SOURCE_EMPTY, "Materi teks sumber kosong.");
  }

  const titleMatch = /^#\s+(.+)$/m.exec(clean) || /^Title:\s*(.+)$/im.exec(clean);
  return {
    text: clean,
    title: titleMatch ? titleMatch[1].trim() : undefined,
  };
}

/**
 * Determines file format and extracts structured text server-side
 */
export async function extractDocumentText(
  options: DocumentExtractOptions,
): Promise<DocumentExtractResult> {
  const { buffer, fileName = "", mimeType = "" } = options;

  if (!buffer || buffer.byteLength === 0) {
    throw new AiServiceError(AI_ERROR_CODES.SOURCE_EMPTY, "File dokumen kosong (0 byte).");
  }

  const lowerName = fileName.toLowerCase();
  const lowerMime = mimeType.toLowerCase();

  let format: SupportedDocumentFormat = "text";

  if (
    lowerName.endsWith(".docx") ||
    lowerMime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    format = "docx";
    const { text, title } = extractDocxText(buffer);
    const words = text.split(/\s+/).filter(Boolean).length;
    return {
      text,
      title,
      format,
      wordCount: words,
      charCount: text.length,
    };
  }

  if (lowerName.endsWith(".pdf") || lowerMime === "application/pdf") {
    format = "pdf";
    const { text, title, pageCount } = await extractPdfText(buffer);
    const words = text.split(/\s+/).filter(Boolean).length;
    return {
      text,
      title,
      format,
      pageCount,
      wordCount: words,
      charCount: text.length,
    };
  }

  if (
    lowerName.endsWith(".html") ||
    lowerName.endsWith(".htm") ||
    lowerMime === "text/html"
  ) {
    format = "html";
    const decoder = new TextDecoder("utf-8");
    const rawHtml = decoder.decode(buffer);
    const { normalized, title } = normalizeHtmlContent(rawHtml);
    const words = normalized.split(/\s+/).filter(Boolean).length;
    return {
      text: normalized,
      title,
      format,
      wordCount: words,
      charCount: normalized.length,
    };
  }

  // Default to plain text / markdown (.txt, .md)
  format = "text";
  const { text, title } = extractPlainText(buffer);
  const words = text.split(/\s+/).filter(Boolean).length;
  return {
    text,
    title,
    format,
    wordCount: words,
    charCount: text.length,
  };
}
