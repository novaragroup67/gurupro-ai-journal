/**
 * GuruPro AI Foundation (AI-0) — Provenance-Preserving Source Retriever
 *
 * Enforces strict tenant isolation, preserves chunk metadata,
 * and extracts relevant context for grounded generation.
 */

import { AI_ERROR_CODES, AiServiceError } from "./error-taxonomy";
import { getCachedSourceSnapshot } from "./source-ingestion";
import type { AiSourceChunk, AiSourceSnapshot } from "./types";

export interface RetrievalQuery {
  sourceId: string;
  userId: string;
  query?: string;
  maxChunks?: number;
  maxWords?: number;
}

export interface RetrievalResult {
  sourceId: string;
  sourceTitle: string;
  contentHash: string;
  totalChunks: number;
  retrievedChunks: AiSourceChunk[];
  combinedContext: string;
}

/**
 * Retrieves authorized chunks from a source snapshot.
 * Never leaks data across different users.
 */
export async function retrieveSourceContext(query: RetrievalQuery): Promise<RetrievalResult> {
  const { sourceId, userId, maxChunks = 4, maxWords = 3000 } = query;

  if (!sourceId || !userId) {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      "Parameter sourceId dan userId wajib diisi untuk retrieval.",
    );
  }

  const snapshot: AiSourceSnapshot | undefined = getCachedSourceSnapshot(sourceId);
  if (!snapshot) {
    throw new AiServiceError(
      AI_ERROR_CODES.RETRIEVAL_ERROR,
      `Snapshot sumber "${sourceId}" tidak ditemukan atau belum diserap.`,
    );
  }

  // Tenant / Ownership Isolation check:
  if (snapshot.userId !== userId) {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Anda tidak memiliki izin untuk mengakses data sumber milik guru lain.",
    );
  }

  const allChunks = snapshot.chunks || [];
  if (allChunks.length === 0) {
    return {
      sourceId: snapshot.id,
      sourceTitle: snapshot.sourceTitle || "Materi Sumber",
      contentHash: snapshot.contentHash,
      totalChunks: 0,
      retrievedChunks: [],
      combinedContext: snapshot.normalizedContent,
    };
  }

  // If small source (<= 2 chunks), return all chunks sequentially
  if (allChunks.length <= 2) {
    const combinedContext = allChunks.map((c) => c.content).join("\n\n");
    return {
      sourceId: snapshot.id,
      sourceTitle: snapshot.sourceTitle || "Materi Sumber",
      contentHash: snapshot.contentHash,
      totalChunks: allChunks.length,
      retrievedChunks: allChunks,
      combinedContext,
    };
  }

  // Score relevance if query keywords are provided
  let selectedChunks: AiSourceChunk[] = [];
  if (query.query && query.query.trim()) {
    const keywords = query.query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);

    const scored = allChunks.map((chunk) => {
      const lower = chunk.content.toLowerCase();
      const titleLower = (chunk.title || "").toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        if (titleLower.includes(kw)) score += 3;
        const matches = (lower.match(new RegExp(kw, "g")) || []).length;
        score += matches;
      }
      return { chunk, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const topScored = scored.filter((s) => s.score > 0).map((s) => s.chunk);

    if (topScored.length > 0) {
      // Re-sort selected chunks by original index to maintain logical sequence
      selectedChunks = topScored.slice(0, maxChunks).sort((a, b) => a.index - b.index);
    }
  }

  // Fallback to initial sequential chunks if no keyword match
  if (selectedChunks.length === 0) {
    selectedChunks = allChunks.slice(0, maxChunks);
  }

  // Enforce word budget
  let currentWords = 0;
  const budgetChunks: AiSourceChunk[] = [];
  for (const chunk of selectedChunks) {
    if (currentWords + chunk.wordCount <= maxWords || budgetChunks.length === 0) {
      budgetChunks.push(chunk);
      currentWords += chunk.wordCount;
    } else {
      break;
    }
  }

  const combinedContext = budgetChunks
    .map((c) => (c.title ? `### ${c.title}\n${c.content}` : c.content))
    .join("\n\n");

  return {
    sourceId: snapshot.id,
    sourceTitle: snapshot.sourceTitle || "Materi Sumber",
    contentHash: snapshot.contentHash,
    totalChunks: allChunks.length,
    retrievedChunks: budgetChunks,
    combinedContext,
  };
}
