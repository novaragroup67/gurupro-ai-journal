import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface SumberPreview {
  url: string;
  judul: string;
  situs: string;
  konten: string;
  jumlahKata: number;
  cukup: boolean;
}

const BLOCK_TAGS = ["script", "style", "noscript", "nav", "footer", "header", "aside", "form", "svg", "iframe"];

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

/** Mengambil dan membersihkan isi halaman web agar bisa dipakai AI sebagai sumber. */
export const analisisSumberUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
    if (/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(parsed.hostname)) {
      throw new Error("Link internal/lokal tidak dapat dibaca.");
    }
    return { url: parsed.toString() };
  })
  .handler(async ({ data }): Promise<SumberPreview> => {
    let response: Response;
    try {
      response = await fetch(data.url, {
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; GuruProBot/1.0; +https://gurupro.id)",
          accept: "text/html,application/xhtml+xml",
          "accept-language": "id,en;q=0.8",
        },
        redirect: "follow",
      });
    } catch {
      throw new Error("Sumber tidak dapat diakses. Periksa link atau coba sumber lain.");
    }

    if (!response.ok) {
      throw new Error(`Sumber tidak dapat diakses (status ${response.status}). Coba link lain.`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain|application\/xhtml/.test(contentType)) {
      throw new Error(
        "Isi halaman bukan teks yang bisa dibaca (misal PDF atau media). Gunakan link halaman artikel.",
      );
    }

    const html = await response.text();
    const judul =
      decode(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1] ?? "").trim() ||
      decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").trim() ||
      new URL(data.url).hostname;

    const konten = extractReadable(html);
    const jumlahKata = konten.split(/\s+/).filter(Boolean).length;

    if (jumlahKata < 60) {
      throw new Error(
        "Isi halaman terlalu sedikit untuk dijadikan modul. Gunakan halaman materi/artikel yang lebih lengkap.",
      );
    }

    return {
      url: data.url,
      judul,
      situs: new URL(data.url).hostname.replace(/^www\./, ""),
      konten,
      jumlahKata,
      cukup: jumlahKata >= 150,
    };
  });
