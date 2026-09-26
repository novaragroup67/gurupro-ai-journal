/**
 * GuruPro AI Foundation (AI-0) — Deterministic Source Normalizer
 *
 * Strips web/formatting noise while strictly preserving factual content,
 * headings, lists, technical terms, and structural integrity.
 */

const REMOVABLE_HTML_TAGS = [
  "script",
  "style",
  "noscript",
  "nav",
  "footer",
  "header",
  "aside",
  "form",
  "svg",
  "iframe",
  "button",
];

const BOILERPLATE_PATTERNS = [
  /(?:kami menggunakan cookie|kebijakan privasi|privacy policy|terms of service|all rights reserved|hak cipta dilindungi|bagikan artikel ini|share this|ikuti kami di media sosial)[^\n.]*[.\n]/gi,
  /(?:advertisement|iklan|sponsor|baca juga:|read also:)[^\n.]*[.\n]/gi,
];

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

/**
 * Normalizes raw HTML into clean, structured Markdown-like text
 * while preserving factual content, headings, and lists.
 */
export function normalizeHtmlContent(html: string): { normalized: string; title?: string } {
  let cleaned = html;

  // Extract title before stripping tags
  let title: string | undefined;
  const ogTitleMatch = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(cleaned);
  const titleTagMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(cleaned);
  if (ogTitleMatch?.[1]) {
    title = decodeHtmlEntities(ogTitleMatch[1]).trim();
  } else if (titleTagMatch?.[1]) {
    title = decodeHtmlEntities(titleTagMatch[1]).trim();
  }

  // Remove block tags
  for (const tag of REMOVABLE_HTML_TAGS) {
    cleaned = cleaned.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, "gi"), " ");
  }

  // Remove comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, " ");

  // Prefer main content container if present
  const mainContent =
    /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(cleaned)?.[1] ??
    /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(cleaned)?.[1] ??
    /<div[^>]+id=["'](?:content|main|article)["'][^>]*>([\s\S]*?)<\/div>/i.exec(cleaned)?.[1] ??
    /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(cleaned)?.[1] ??
    cleaned;

  // Convert headings to Markdown headings
  let converted = mainContent
    .replace(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi, "\n\n# $1\n\n")
    .replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi, "\n\n## $1\n\n")
    .replace(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi, "\n\n### $1\n\n")
    .replace(/<h[4-6]\b[^>]*>([\s\S]*?)<\/h[4-6]>/gi, "\n\n#### $1\n\n")
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, "\n- $1")
    .replace(/<\/(p|div|tr|section|blockquote)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  converted = decodeHtmlEntities(converted);

  // Strip boilerplate
  for (const pattern of BOILERPLATE_PATTERNS) {
    converted = converted.replace(pattern, "");
  }

  // Clean lines and normalize whitespace
  const lines = converted
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0);

  // De-duplicate immediately adjacent repeated lines
  const deduplicated: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const current = lines[i];
    if (i === 0 || current !== lines[i - 1]) {
      deduplicated.push(current);
    }
  }

  const normalized = deduplicated.join("\n\n").trim();
  return { normalized, title };
}

/**
 * Normalizes plain text or markdown input.
 * Preserves paragraphs, lists, headings, and technical nomenclature.
 */
export function normalizeTextContent(raw: string): string {
  if (!raw) return "";

  let text = raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ");

  // Strip boilerplate patterns
  for (const pattern of BOILERPLATE_PATTERNS) {
    text = text.replace(pattern, "");
  }

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  return lines.join("\n\n").trim();
}
