/**
 * GuruPro AI Foundation (AI-0) — Common Source Ingestion Pipeline
 *
 * Implements strict SSRF protection, protocol validation,
 * SHA-256 content hashing, normalization, chunking, and snapshot creation.
 */

import { sha256Hex } from "./sha256";
import { isIP, isPrivateOrReservedIp } from "./ip-utils";
import { AI_ERROR_CODES, AiServiceError } from "./error-taxonomy";
import { normalizeHtmlContent, normalizeTextContent } from "./source-normalizer";
import { chunkNormalizedSource } from "./source-chunker";
import { extractDocumentText } from "./document-parser";
import type { AiSourceSnapshot, IngestionOptions } from "./types";

export { isPrivateOrReservedIp } from "./ip-utils";

const MAX_BYTES = 2 * 1024 * 1024; // 2MB
const TIMEOUT_MS = 10000; // 10s
const MAX_REDIRECTS = 3;

// In-memory snapshot registry for server-side caching & instant retrieval
const inMemorySnapshots = new Map<string, AiSourceSnapshot>();

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

  if (isIP(clean)) {
    if (isPrivateOrReservedIp(clean)) {
      throw new AiServiceError(AI_ERROR_CODES.SOURCE_VALIDATION_ERROR, errorMsg);
    }
    return;
  }

  try {
    const dnsMod = "node:dns/promises";
    const dns = await import(/* @vite-ignore */ dnsMod);
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
  const hasData = (input && input.trim().length > 0) || options.documentBuffer || options.base64Data;
  if (!hasData) {
    throw new AiServiceError(AI_ERROR_CODES.SOURCE_EMPTY, "Materi sumber tidak boleh kosong.");
  }

  let rawContent = input || "";
  let sourceUrl: string | undefined;
  let extractedTitle = options.title || options.fileName;
  let contentType = "text/plain";
  let normalizedContent = "";

  if (sourceType === "url") {
    const trimmed = (input || "").trim();
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
  } else if (sourceType === "dokumen") {
    let docBuffer: Uint8Array | Buffer | undefined = options.documentBuffer;
    if (!docBuffer && options.base64Data) {
      const cleanB64 = options.base64Data.replace(/^data:[^;]+;base64,/, "");
      docBuffer = Buffer.from(cleanB64, "base64");
    } else if (!docBuffer && input && input.startsWith("data:")) {
      const cleanB64 = input.replace(/^data:[^;]+;base64,/, "");
      docBuffer = Buffer.from(cleanB64, "base64");
    }

    if (docBuffer) {
      const docRes = await extractDocumentText({
        buffer: docBuffer,
        fileName: options.fileName,
        mimeType: options.mimeType,
      });
      rawContent = docRes.text;
      if (!extractedTitle && docRes.title) {
        extractedTitle = docRes.title;
      }
      contentType =
        docRes.format === "docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : docRes.format === "pdf"
          ? "application/pdf"
          : "text/plain";
      normalizedContent = normalizeTextContent(rawContent);
    } else {
      contentType = "text/plain";
      normalizedContent = normalizeTextContent(rawContent);
    }
  } else {
    // text, kurikulum
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
  const contentHash = sha256Hex(normalizedContent);
  const snapshotId = `src_${sha256Hex(`${userId}:${contentHash}`).slice(0, 24)}`;

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

  // 1. Cache in memory (L1 fast cache)
  inMemorySnapshots.set(snapshot.id, snapshot);

  // 2. Persist to Supabase database (L2 persistent store)
  await persistSnapshotToDatabase(snapshot, (options as any)?.supabaseClient);

  return snapshot;
}

async function getSupabase() {
  try {
    const mod = await import("../../integrations/supabase/client.js").catch(() =>
      import("../../integrations/supabase/client"),
    );
    return mod.supabase;
  } catch {
    return null;
  }
}

async function persistSnapshotToDatabase(snapshot: AiSourceSnapshot, client?: any): Promise<void> {
  try {
    const supabase = client || (await getSupabase());
    if (!supabase) return;
    const row = {
      id: snapshot.id,
      user_id: snapshot.userId,
      source_type: snapshot.sourceType,
      source_url: snapshot.sourceUrl || null,
      source_title: snapshot.sourceTitle || null,
      content_type: snapshot.contentType,
      content_hash: snapshot.contentHash,
      retrieved_at: snapshot.retrievedAt,
      normalized_content: snapshot.normalizedContent,
      word_count: snapshot.wordCount,
      char_count: snapshot.charCount,
      chunks: snapshot.chunks as any,
      metadata: snapshot.metadata as any,
      ingestion_status: snapshot.ingestionStatus,
      created_at: snapshot.createdAt,
    };
    await supabase.from("ai_source_snapshots").upsert(row);
  } catch {
    // Non-blocking in pure mock/unit test environments
  }
}

export function setCachedSourceSnapshot(snapshot: AiSourceSnapshot): void {
  inMemorySnapshots.set(snapshot.id, snapshot);
}

export function getCachedSourceSnapshot(snapshotId: string): AiSourceSnapshot | undefined {
  return inMemorySnapshots.get(snapshotId);
}

export async function getPersistedSourceSnapshot(
  snapshotId: string,
  userId?: string,
  client?: any,
): Promise<AiSourceSnapshot | undefined> {
  // L1: Check in-memory cache first
  const cached = inMemorySnapshots.get(snapshotId);
  if (cached) {
    if (userId && cached.userId !== userId) {
      return undefined;
    }
    return cached;
  }

  // L2: Query persistent Supabase table
  try {
    const supabase = client || (await getSupabase());
    if (!supabase) return undefined;
    let query = supabase.from("ai_source_snapshots").select("*").eq("id", snapshotId);
    if (userId) query = query.eq("user_id", userId);
    const { data, error } = await query.maybeSingle();
    if (data && !error) {
      const restored: AiSourceSnapshot = {
        id: data.id,
        userId: data.user_id,
        sourceType: data.source_type as any,
        sourceUrl: data.source_url || undefined,
        sourceTitle: data.source_title || undefined,
        contentType: data.content_type,
        contentHash: data.content_hash,
        retrievedAt: data.retrieved_at,
        normalizedContent: data.normalized_content,
        wordCount: data.word_count,
        charCount: data.char_count,
        chunks: Array.isArray(data.chunks) ? data.chunks : [],
        metadata: data.metadata || {},
        ingestionStatus: data.ingestion_status as any,
        createdAt: data.created_at,
      };
      inMemorySnapshots.set(restored.id, restored);
      return restored;
    }
  } catch {
    // Fallback if table not available
  }
  return undefined;
}

export function getAllCachedSnapshots(): AiSourceSnapshot[] {
  return Array.from(inMemorySnapshots.values());
}

export function getCachedSnapshotsForUser(userId: string): AiSourceSnapshot[] {
  return Array.from(inMemorySnapshots.values()).filter((s) => s.userId === userId);
}

export async function getPersistedSnapshotsForUser(userId: string): Promise<AiSourceSnapshot[]> {
  const fromMemory = Array.from(inMemorySnapshots.values()).filter((s) => s.userId === userId);
  try {
    const supabase = await getSupabase();
    if (!supabase) return fromMemory;
    const { data, error } = await supabase
      .from("ai_source_snapshots")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (data && !error && data.length > 0) {
      const byId = new Map<string, AiSourceSnapshot>();
      for (const row of data) {
        const item: AiSourceSnapshot = {
          id: row.id,
          userId: row.user_id,
          sourceType: row.source_type as any,
          sourceUrl: row.source_url || undefined,
          sourceTitle: row.source_title || undefined,
          contentType: row.content_type,
          contentHash: row.content_hash,
          retrievedAt: row.retrieved_at,
          normalizedContent: row.normalized_content,
          wordCount: row.word_count,
          charCount: row.char_count,
          chunks: Array.isArray(row.chunks) ? row.chunks : [],
          metadata: row.metadata || {},
          ingestionStatus: row.ingestion_status as any,
          createdAt: row.created_at,
        };
        byId.set(item.id, item);
        inMemorySnapshots.set(item.id, item);
      }
      for (const m of fromMemory) {
        byId.set(m.id, m);
      }
      return Array.from(byId.values());
    }
  } catch {
    // Fallback to memory
  }
  return fromMemory;
}

export function clearSnapshotCacheForTesting() {
  inMemorySnapshots.clear();
}

