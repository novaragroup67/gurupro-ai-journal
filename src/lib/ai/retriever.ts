/**
 * GuruPro AI Foundation (AI-1) — Enhanced Provenance-Preserving Source Retriever
 *
 * Implements:
 * - Safe regex escaping (prevents RegExp injection / syntax errors on ?, +, (, ), etc.)
 * - Indonesian educational stopword pruning for query intent
 * - Title boosting (3x weight for section headings #, ##, ###)
 * - Exact multi-word phrase matching bonus
 * - Saturation-weighted term frequency (prevents long chunks from drowning short exact chunks)
 * - Negative retrieval detection (hasRelevantMatch: false when score is 0 / absent)
 * - Deterministic tie-breaking (order by chunk index)
 * - Strict tenant isolation (rejects cross-user access with ROLE_FORBIDDEN)
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

export interface ScoredChunk extends AiSourceChunk {
  score?: number;
  relevanceScore?: number;
}

export interface RetrievalResult {
  sourceId: string;
  sourceTitle: string;
  contentHash: string;
  totalChunks: number;
  retrievedChunks: ScoredChunk[];
  combinedContext: string;
  hasRelevantMatch?: boolean;
  topScore?: number;
}

const INDO_STOPWORDS = new Set([
  "apa", "apakah", "bagaimana", "bagaimanakah", "kenapa", "mengapa", "kapan", "dimana", "siapa",
  "yang", "dan", "atau", "dari", "ke", "pada", "dalam", "untuk", "dengan", "adalah", "yaitu",
  "sebagai", "ini", "itu", "akan", "dapat", "bisa", "harus", "oleh", "secara", "karena", "maka",
  "jika", "tentang", "jelaskan", "sebutkan", "uraikan", "tuliskan", "analisis", "tahapan",
  "langkah", "berikut", "sebuah", "suatu", "pada", "tiap", "setiap", "serta"
]);

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSignificantKeywords(rawQuery: string): { keywords: string[]; phrase: string } {
  // Strip punctuation but keep alphanumeric and hyphens
  const cleaned = rawQuery
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  const allWords = cleaned.split(" ").filter((w) => w.length >= 2);
  const significant = allWords.filter((w) => !INDO_STOPWORDS.has(w) && w.length >= 3);

  // If all words were stopwords, fallback to non-stopwords >= 2 chars or original words
  const finalKeywords = significant.length > 0 ? significant : allWords;
  return {
    keywords: Array.from(new Set(finalKeywords)),
    phrase: significant.join(" "),
  };
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
      hasRelevantMatch: false,
      topScore: 0,
    };
  }

  // If query is provided, execute scoring
  let selectedChunks: ScoredChunk[] = [];
  let hasRelevantMatch = true;
  let topScore = 0;

  if (query.query && query.query.trim()) {
    const rawQuery = query.query.trim();
    const { keywords, phrase } = extractSignificantKeywords(rawQuery);

    const scored = allChunks.map((chunk) => {
      const lower = chunk.content.toLowerCase();
      const titleLower = (chunk.title || "").toLowerCase();
      let score = 0;

      // 1. Exact phrase match bonus
      if (phrase.length >= 5) {
        if (titleLower.includes(phrase)) {
          score += 15;
        } else if (lower.includes(phrase)) {
          score += 10;
        }
      }

      // 2. Individual keyword matching
      for (const kw of keywords) {
        const safeKw = escapeRegex(kw);

        // Section Title Boost (3x)
        if (titleLower.includes(kw)) {
          score += 6;
        }

        // Body match with saturation (cap at 5 matches per term)
        const regex = new RegExp(`\\b${safeKw}\\b`, "gi");
        const matches = (lower.match(regex) || []).length;
        score += Math.min(matches, 5) * 2;

        // Substring fallback if word boundary didn't match (for compound terms/technical codes)
        if (matches === 0 && lower.includes(kw)) {
          score += 1;
        }
      }

      return {
        ...chunk,
        score,
        relevanceScore: Math.min(1.0, score / 20),
      };
    });

    // Sort by score DESC, then index ASC for deterministic tie-breaking
    scored.sort((a, b) => (b.score || 0) - (a.score || 0) || a.index - b.index);

    topScore = scored[0]?.score || 0;

    if (topScore > 0) {
      const topScored = scored.filter((s) => (s.score || 0) > 0);
      // Re-sort selected chunks by original index to maintain logical pedagogical sequence
      selectedChunks = topScored.slice(0, maxChunks).sort((a, b) => a.index - b.index);
      hasRelevantMatch = true;
    } else {
      // Negative retrieval: no chunk matched query terms
      hasRelevantMatch = false;
      // Retain first chunk with 0 relevance for reference context, but clearly flag hasRelevantMatch: false
      selectedChunks = allChunks.slice(0, 1).map((c) => ({ ...c, score: 0, relevanceScore: 0 }));
    }
  } else {
    // If no query, return sequential chunks
    selectedChunks = allChunks.slice(0, maxChunks).map((c) => ({ ...c, score: 1, relevanceScore: 1 }));
    hasRelevantMatch = true;
    topScore = 1;
  }

  // Enforce word budget
  let currentWords = 0;
  const budgetChunks: ScoredChunk[] = [];
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
    hasRelevantMatch,
    topScore,
  };
}
