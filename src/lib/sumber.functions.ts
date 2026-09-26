import dns from "node:dns/promises";
import net from "node:net";
import { createServerFn } from "@tanstack/react-start";

import { requireTeacherAiAuth } from "@/integrations/supabase/auth-middleware";
import { ingestSource } from "./ai/source-ingestion";

export interface SumberPreview {
  url: string;
  judul: string;
  situs: string;
  konten: string;
  jumlahKata: number;
  cukup: boolean;
  snapshotId?: string;
  contentHash?: string;
}

const BLOCK_TAGS = [
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
];

function stripTags(html: string) {
  let out = html;
  for (const tag of BLOCK_TAGS) {
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, "gi"), " ");
  }
  out = out.replace(/<!--[\s\S]*?-->/g, " ");
  return out;
}

function decode(text: string) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)));
}

function extractReadable(html: string) {
  const cleaned = stripTags(html);
  const main =
    /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(cleaned)?.[1] ??
    /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(cleaned)?.[1] ??
    /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(cleaned)?.[1] ??
    cleaned;

  const blocks = main
    .replace(/<\/(p|div|li|h[1-6]|tr|section|blockquote)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ");

  return decode(blocks)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 2)
    .filter((line, i, arr) => arr.indexOf(line) === i)
    .join("\n")
    .slice(0, 16000);
}

export function isPrivateOrReservedIp(ip: string): boolean {
  let cleanIp = ip.toLowerCase().trim();
  if (cleanIp === "::1" || cleanIp === "::" || cleanIp === "0.0.0.0") return true;
  if (cleanIp.startsWith("::ffff:")) {
    cleanIp = cleanIp.slice(7);
  }
  if (net.isIPv4(cleanIp)) {
    const parts = cleanIp.split(".").map(Number);
    if (parts.length !== 4 || parts.some((n) => isNaN(n) || n < 0 || n > 255)) return true;
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 Link-local / Cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a === 192 && b === 0) return true; // 192.0.0.0/24
    if (a === 198 && (b === 18 || b === 19 || b === 51)) return true; // Benchmark & TEST-NET-2
    if (a === 203 && b === 0) return true; // TEST-NET-3
    if (a >= 224) return true; // Multicast & Reserved
    return false;
  }
  if (net.isIPv6(cleanIp)) {
    if (cleanIp.startsWith("fc") || cleanIp.startsWith("fd")) return true; // ULA fc00::/7
    if (/^fe[89ab]/i.test(cleanIp)) return true; // Link-local fe80::/10
    if (cleanIp.startsWith("ff")) return true; // Multicast
    if (cleanIp.startsWith("2001:db8:")) return true; // Documentation
    if (cleanIp.startsWith("64:ff9b:")) return true; // NAT64
    return false;
  }
  return true;
}

export async function validateHostSafety(hostname: string, isRedirect = false): Promise<void> {
  const clean = hostname
    .replace(/^\[|\]$/g, "")
    .toLowerCase()
    .trim();
  const errorMsg = isRedirect
    ? "Redirect ke alamat internal/lokal diblokir untuk keamanan."
    : "Link internal/lokal tidak dapat dibaca.";

  if (
    clean === "localhost" ||
    clean.endsWith(".localhost") ||
    clean.endsWith(".local") ||
    clean.endsWith(".internal") ||
    clean.endsWith(".lan") ||
    clean.endsWith(".home")
  ) {
    throw new Error(errorMsg);
  }

  if (net.isIP(clean)) {
    if (isPrivateOrReservedIp(clean)) {
      throw new Error(errorMsg);
    }
    return;
  }

  try {
    const addresses = await dns.lookup(clean, { all: true });
    if (!addresses || addresses.length === 0) {
      throw new Error("Domain tidak ditemukan atau tidak dapat diakses.");
    }
    for (const addr of addresses) {
      if (isPrivateOrReservedIp(addr.address)) {
        throw new Error(errorMsg);
      }
    }
  } catch (err: any) {
    if (
      err?.message?.includes("Link internal/lokal") ||
      err?.message?.includes("Redirect ke alamat")
    ) {
      throw err;
    }
    throw new Error("Domain tidak ditemukan atau tidak dapat diakses.");
  }
}

async function fetchSafeBody(
  response: Response,
  maxBytes: number = 2 * 1024 * 1024,
): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > maxBytes) {
    throw new Error(
      "Ukuran halaman terlalu besar (maksimal 2MB). Gunakan link artikel yang lebih ringkas.",
    );
  }

  if (!response.body) {
    return await response.text();
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let totalBytes = 0;
  let result = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel();
        } catch {}
        throw new Error(
          "Ukuran halaman terlalu besar (maksimal 2MB). Gunakan link artikel yang lebih ringkas.",
        );
      }
      result += decoder.decode(value, { stream: true });
    }
  }
  result += decoder.decode();
  return result;
}

/** Mengambil dan membersihkan isi halaman web agar bisa dipakai AI sebagai sumber dengan proteksi SSRF. */
export const analisisSumberUrl = createServerFn({ method: "POST" })
  .middleware([requireTeacherAiAuth])
  .inputValidator((input: { url: string }) => {
    const raw = String(input?.url ?? "").trim();
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    let parsed: URL;
    try {
      parsed = new URL(withProto);
    } catch {
      throw new Error("Format link tidak valid. Contoh: https://situs.com/artikel");
    }
    if (!/^https?:$/.test(parsed.protocol)) throw new Error("Hanya link http/https yang didukung.");
    return { url: parsed.toString() };
  })
  .handler(async ({ data, context }): Promise<SumberPreview> => {
    const userId = (context as any)?.userId || (context as any)?.profile?.id || "teacher_user";
    const snapshot = await ingestSource({
      sourceType: "url",
      input: data.url,
      userId,
    });

    return {
      url: snapshot.sourceUrl || data.url,
      judul: snapshot.sourceTitle || "",
      situs: new URL(snapshot.sourceUrl || data.url).hostname.replace(/^www\./, ""),
      konten: snapshot.normalizedContent,
      jumlahKata: snapshot.wordCount,
      cukup: snapshot.wordCount >= 150,
      snapshotId: snapshot.id,
      contentHash: snapshot.contentHash,
    };
  });

export interface DocumentInputPayload {
  fileName: string;
  fileType?: string;
  base64Data: string;
}

/** Mengekstrak teks dari file dokumen (PDF, DOCX, TXT, HTML) di sisi server untuk referensi AI */
export const analisisSumberDokumen = createServerFn({ method: "POST" })
  .middleware([requireTeacherAiAuth])
  .inputValidator((input: DocumentInputPayload) => {
    if (!input || !input.base64Data) {
      throw new Error("File dokumen kosong atau gagal diunggah.");
    }
    return {
      fileName: String(input.fileName || "dokumen").trim(),
      fileType: String(input.fileType || "").trim(),
      base64Data: input.base64Data,
    };
  })
  .handler(async ({ data, context }): Promise<SumberPreview> => {
    const userId = (context as any)?.userId || (context as any)?.profile?.id || "teacher_user";
    const snapshot = await ingestSource({
      sourceType: "dokumen",
      base64Data: data.base64Data,
      fileName: data.fileName,
      mimeType: data.fileType,
      userId,
    });

    return {
      url: "",
      judul: snapshot.sourceTitle || data.fileName,
      situs: data.fileName,
      konten: snapshot.normalizedContent,
      jumlahKata: snapshot.wordCount,
      cukup: snapshot.wordCount >= 30,
      snapshotId: snapshot.id,
      contentHash: snapshot.contentHash,
    };
  });

