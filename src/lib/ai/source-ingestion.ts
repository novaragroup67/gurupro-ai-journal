/**
 * GuruPro AI Foundation (AI-0) — Common Source Ingestion Pipeline
 *
 * Implements strict SSRF protection, protocol validation,
 * SHA-256 content hashing, normalization, chunking, and snapshot creation.
 */

import { createHash } from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";
import { AI_ERROR_CODES, AiServiceError } from "./error-taxonomy";
import { normalizeHtmlContent, normalizeTextContent } from "./source-normalizer";
import { chunkNormalizedSource } from "./source-chunker";
import type { AiSourceSnapshot, IngestionOptions } from "./types";

const MAX_BYTES = 2 * 1024 * 1024; // 2MB
const TIMEOUT_MS = 10000; // 10s
const MAX_REDIRECTS = 3;

// In-memory snapshot registry for server-side caching & instant retrieval
const inMemorySnapshots = new Map<string, AiSourceSnapshot>();

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
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 Link-local / Cloud metadata (AWS/GCP/Azure)
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
  const clean = hostname.replace(/^\[|\]$/g, "").toLowerCase().trim();
  const errorMsg = isRedirect
    ? "Redirect ke alamat internal atau jaringan lokal diblokir untuk keamanan."
    : "Tautan internal atau jaringan lokal tidak diizinkan.";

  if (
    clean === "localhost" ||
    clean.endsWith(".localhost") ||
    clean.endsWith(".local") ||
    clean.endsWith(".internal") ||
    clean.endsWith(".lan") ||
    clean.endsWith(".home") ||
    clean === "metadata.google.internal"
  ) {
    throw new AiServiceError(AI_ERROR_CODES.SOURCE_VALIDATION_ERROR, errorMsg);
  }

  if (net.isIP(clean)) {
    if (isPrivateOrReservedIp(clean)) {
      throw new AiServiceError(AI_ERROR_CODES.SOURCE_VALIDATION_ERROR, errorMsg);
    }
    return;
  }

  try {
    const addresses = await dns.lookup(clean, { all: true });
    if (!addresses || addresses.length === 0) {
      throw new AiServiceError(AI_ERROR_CODES.SOURCE_FETCH_ERROR, "Domain sumber tidak ditemukan atau tidak dapat diakses.");
    }
    for (const addr of addresses) {
      if (isPrivateOrReservedIp(addr.address)) {
        throw new AiServiceError(AI_ERROR_CODES.SOURCE_VALIDATION_ERROR, errorMsg);
      }
    }
  } catch (err: unknown) {
    if (err instanceof AiServiceError) throw err;
    throw new AiServiceError(AI_ERROR_CODES.SOURCE_FETCH_ERROR, "Domain sumber tidak ditemukan atau gagal di-resolve.");
  }
}

async function fetchSafeUrl(rawUrl: string): Promise<{ body: string; finalUrl: string; title?: string }> {
  let currentUrl = rawUrl.trim();
  let response: Response | null = null;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(currentUrl);
    } catch {
      throw new AiServiceError(AI_ERROR_CODES.SOURCE_VALIDATION_ERROR, "Format tautan tidak valid.");
    }

    if (!/^https?:$/.test(parsed.protocol)) {
      throw new AiServiceError(
        AI_ERROR_CODES.SOURCE_VALIDATION_ERROR,
        `Protokol "${parsed.protocol}" tidak didukung. Hanya protokol http dan https yang diizinkan.`,
      );
    }

    await validateHostSafety(parsed.hostname, hop > 0);

    try {
      const headers = new Headers({
        "user-agent": "Mozilla/5.0 (compatible; GuruProBot/1.0; +https://gurupro.id)",
        accept: "text/html,application/xhtml+xml,text/plain",
        "accept-language": "id,en;q=0.8",
      });
      headers.delete("authorization");

      response = await fetch(currentUrl, {
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err: any) {
      if (err?.name === "TimeoutError" || err?.name === "AbortError") {
        throw new AiServiceError(
          AI_ERROR_CODES.AI_TIMEOUT,
          "Permintaan ke link melebihi batas waktu (timeout 10 detik). Coba link lain.",
        );
      }
      throw new AiServiceError(
        AI_ERROR_CODES.SOURCE_FETCH_ERROR,
        `Sumber tidak dapat diakses (${err?.message || "koneksi gagal"}). Periksa link atau coba sumber lain.`,
      );
    }

    // Handle redirects
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        throw new AiServiceError(
          AI_ERROR_CODES.SOURCE_FETCH_ERROR,
          "Tautan mengarahkan ke lokasi kosong (redirect tanpa header location).",
        );
      }
      if (hop === MAX_REDIRECTS) {
        throw new AiServiceError(
          AI_ERROR_CODES.SOURCE_FETCH_ERROR,
          "Terlalu banyak pengalihan (redirect loop). Coba gunakan tautan langsung.",
        );
      }

      let nextParsed: URL;
      try {
        nextParsed = new URL(location, currentUrl);
      } catch {
        throw new AiServiceError(
          AI_ERROR_CODES.SOURCE_VALIDATION_ERROR,
          "Format tujuan pengalihan (redirect) tidak valid.",
        );
      }

      if (!/^https?:$/.test(nextParsed.protocol)) {
        throw new AiServiceError(
          AI_ERROR_CODES.SOURCE_VALIDATION_ERROR,
          "Protokol redirect tidak didukung (hanya http dan https).",
        );
      }

      currentUrl = nextParsed.toString();
      continue;
    }

    break;
  }

  if (!response || !response.ok) {
    const status = response ? ` (HTTP ${response.status})` : "";
    throw new AiServiceError(
      AI_ERROR_CODES.SOURCE_FETCH_ERROR,
      `Tautan sumber tidak dapat diakses${status}. Pastikan halaman dapat dibuka secara publik.`,
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!/text\/html|text\/plain|application\/xhtml/i.test(contentType)) {
    throw new AiServiceError(
      AI_ERROR_CODES.SOURCE_PARSE_ERROR,
      `Tipe konten "${contentType}" tidak didukung. Gunakan tautan halaman teks atau artikel web.`,
    );
  }

  // Check content length header
  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_BYTES) {
    throw new AiServiceError(
      AI_ERROR_CODES.SOURCE_TOO_LARGE,
      "Ukuran konten sumber melebihi batas maksimal 2MB.",
    );
  }

  let text = "";
  if (!response.body) {
    text = await response.text();
  } else {
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > MAX_BYTES) {
          try {
            await reader.cancel();
          } catch {}
          throw new AiServiceError(
            AI_ERROR_CODES.SOURCE_TOO_LARGE,
            "Ukuran konten sumber melebihi batas maksimal 2MB.",
          );
        }
        text += decoder.decode(value, { stream: true });
      }
    }
    text += decoder.decode();
  }

  return { body: text, finalUrl: currentUrl };
}

export async function ingestSource(options: IngestionOptions): Promise<AiSourceSnapshot> {
  const { sourceType, input, userId } = options;
  if (!userId) {
    throw new AiServiceError(AI_ERROR_CODES.AUTH_ERROR, "Pengguna harus terautentikasi untuk memasukkan sumber.");
  }
  if (!input || !input.trim()) {
    throw new AiServiceError(AI_ERROR_CODES.SOURCE_EMPTY, "Materi sumber tidak boleh kosong.");
  }

  let rawContent = input;
  let sourceUrl: string | undefined;
  let extractedTitle = options.title;
  let contentType = "text/plain";
  let normalizedContent = "";

  if (sourceType === "url") {
    const trimmed = input.trim();
    if (trimmed.includes("://") && !/^https?:\/\//i.test(trimmed)) {
      throw new AiServiceError(
        AI_ERROR_CODES.SOURCE_VALIDATION_ERROR,
        "Protokol URL tidak didukung. Hanya protokol http dan https yang diizinkan.",
      );
    }
    const toTest = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    let parsedTest: URL;
    try {
      parsedTest = new URL(toTest);
    } catch {
      throw new AiServiceError(AI_ERROR_CODES.SOURCE_VALIDATION_ERROR, "Format tautan tidak valid.");
    }
    if (!parsedTest.hostname || (!parsedTest.hostname.includes(".") && parsedTest.hostname !== "localhost")) {
      throw new AiServiceError(AI_ERROR_CODES.SOURCE_VALIDATION_ERROR, "Format tautan atau domain tidak valid.");
    }
    sourceUrl = toTest;
    const fetchResult = await fetchSafeUrl(sourceUrl);
    rawContent = fetchResult.body;
    sourceUrl = fetchResult.finalUrl;
    contentType = "text/html";

    const normalizedResult = normalizeHtmlContent(rawContent);
    normalizedContent = normalizedResult.normalized;
    if (!extractedTitle && normalizedResult.title) {
      extractedTitle = normalizedResult.title;
    }
  } else {
    // text, kurikulum, dokumen
    contentType = sourceType === "kurikulum" ? "text/markdown" : "text/plain";
    normalizedContent = normalizeTextContent(rawContent);
  }

  const words = normalizedContent.split(/\s+/).filter(Boolean);
  if (words.length < 15 || normalizedContent.length < 80) {
    throw new AiServiceError(
      AI_ERROR_CODES.SOURCE_EMPTY,
      `Isi materi sumber terlalu ringkas (${words.length} kata). Diperlukan materi yang memadai (minimal 15 kata) untuk memastikan isi faktual dan akurat.`,
    );
  }

  // Deterministic content hashing: SHA-256 of normalized text
  const contentHash = createHash("sha256").update(normalizedContent).digest("hex");
  const snapshotId = `src_${createHash("sha256").update(`${userId}:${contentHash}`).digest("hex").slice(0, 24)}`;

  const chunks = chunkNormalizedSource(snapshotId, normalizedContent);

  const snapshot: AiSourceSnapshot = {
    id: snapshotId,
    userId,
    sourceType,
    sourceUrl,
    sourceTitle: extractedTitle || (sourceUrl ? new URL(sourceUrl).hostname : "Materi Sumber"),
    contentType,
    contentHash,
    retrievedAt: new Date().toISOString(),
    normalizedContent,
    wordCount: words.length,
    charCount: normalizedContent.length,
    chunks,
    metadata: options.metadata ?? {},
    ingestionStatus: "completed",
    createdAt: new Date().toISOString(),
  };

  // Cache in memory for quick retrieval
  inMemorySnapshots.set(snapshot.id, snapshot);

  return snapshot;
}

export function getCachedSourceSnapshot(snapshotId: string): AiSourceSnapshot | undefined {
  return inMemorySnapshots.get(snapshotId);
}

export function clearSnapshotCacheForTesting() {
  inMemorySnapshots.clear();
}
