import { createServerFn } from "@tanstack/react-start";

import { requireTeacherAiAuth } from "@/integrations/supabase/auth-middleware";
import { ingestSource, getCachedSnapshotsForUser } from "./ai/source-ingestion";
import { isIP, isPrivateOrReservedIp } from "./ai/ip-utils";

export { isPrivateOrReservedIp } from "./ai/ip-utils";

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

  if (isIP(clean)) {
    if (isPrivateOrReservedIp(clean)) {
      throw new Error(errorMsg);
    }
    return;
  }

  try {
    const dnsMod = "node:dns/promises";
    const dns = await import(/* @vite-ignore */ dnsMod);
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

export interface TextInputPayload {
  text: string;
  title?: string;
}

/** Mengekstrak dan menyerap teks input langsung / CP-ATP di sisi server menjadi AiSourceSnapshot */
export const analisisSumberTeks = createServerFn({ method: "POST" })
  .middleware([requireTeacherAiAuth])
  .inputValidator((input: TextInputPayload) => {
    const raw = String(input?.text ?? "").trim();
    if (raw.length < 50) {
      throw new Error("Materi teks terlalu pendek (minimal 50 karakter) agar modul dapat disusun secara faktual.");
    }
    return {
      text: raw,
      title: String(input?.title || "").trim(),
    };
  })
  .handler(async ({ data, context }): Promise<SumberPreview> => {
    const userId = (context as any)?.userId || (context as any)?.profile?.id || "teacher_user";
    const snapshot = await ingestSource({
      sourceType: "text",
      input: data.text,
      title: data.title || "Materi Teks Pembelajaran",
      userId,
    });

    return {
      url: "",
      judul: snapshot.sourceTitle || "Materi Teks Pembelajaran",
      situs: "Teks / Catatan Guru",
      konten: snapshot.normalizedContent,
      jumlahKata: snapshot.wordCount,
      cukup: snapshot.wordCount >= 20,
      snapshotId: snapshot.id,
      contentHash: snapshot.contentHash,
    };
  });

export interface TeacherSourceItem {
  id: string;
  title: string;
  type: string;
  wordCount: number;
  createdAt: string;
}

/** Menampilkan daftar materi sumber yang telah diserap oleh guru yang sedang login */
export const listTeacherSourcesServerFn = createServerFn({ method: "GET" })
  .middleware([requireTeacherAiAuth])
  .handler(async ({ context }): Promise<TeacherSourceItem[]> => {
    const userId = (context as any)?.userId;
    const snapshots = getCachedSnapshotsForUser(userId);
    return snapshots.map((s) => ({
      id: s.id,
      title: s.sourceTitle || "Materi Sumber",
      type: s.sourceType,
      wordCount: s.wordCount,
      createdAt: s.createdAt,
    }));
  });

