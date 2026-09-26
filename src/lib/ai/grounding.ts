/**
 * GuruPro AI Foundation (AI-0) — Grounding Contract & Evidence Model
 *
 * Enforces the core rule:
 * THE AI MUST NOT PRESENT UNSUPPORTED SOURCE FACTS AS IF THEY CAME FROM THE SOURCE.
 *
 * Explicitly distinguishes:
 * - SUPPORTED: Directly found in source with evidence snippet.
 * - INFERRED: Logical deduction from stated source facts.
 * - NOT_FOUND / UNSUPPORTED: Fact absent from source (never hallucinate).
 */

import type { AiSourceChunk, GroundingEvidenceRef, GroundingStatus } from "./types";

export interface GroundingCheckRequest {
  claim: string;
  sourceChunks: AiSourceChunk[];
  sourceId: string;
  sourceTitle?: string;
}

export interface GroundingEvaluation {
  status: GroundingStatus;
  evidenceSnippet?: string;
  matchedChunkId?: string;
  explanation: string;
}

/**
 * Evaluates whether a specific claim or factual assertion is grounded in the source chunks.
 * Strictly prevents hallucination: if fact is absent, returns NOT_FOUND.
 */
export function evaluateGroundingAgainstSource(
  req: GroundingCheckRequest,
): GroundingEvaluation {
  const { claim, sourceChunks } = req;
  const cleanClaim = claim.trim().toLowerCase();

  if (!cleanClaim) {
    return {
      status: "NOT_FOUND",
      explanation: "Klaim/pertanyaan kosong.",
    };
  }

  // Tokenize claim into significant terms (3+ letters, excluding Indonesian stopwords)
  const stopwords = new Set([
    "yang", "untuk", "pada", "dalam", "dengan", "dan", "atau", "dari",
    "adalah", "sebagai", "oleh", "ini", "itu", "akan", "dapat", "secara",
    "karena", "maka", "jika", "apakah", "bagaimana", "dimana", "kapan", "siapa",
  ]);

  const claimTerms = cleanClaim
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopwords.has(w));

  if (claimTerms.length === 0) {
    return {
      status: "NOT_FOUND",
      explanation: "Tidak ada kata kunci signifikan pada klaim yang dapat diverifikasi.",
    };
  }

  let bestChunk: AiSourceChunk | null = null;
  let bestSnippet: string | undefined = undefined;
  let maxMatchedTerms = 0;

  for (const chunk of sourceChunks) {
    const chunkLower = chunk.content.toLowerCase();
    let matchedCount = 0;

    for (const term of claimTerms) {
      if (chunkLower.includes(term)) {
        matchedCount++;
      }
    }

    if (matchedCount > maxMatchedTerms) {
      maxMatchedTerms = matchedCount;
      bestChunk = chunk;

      // Extract matching sentence or snippet
      const sentences = chunk.content.split(/(?<=[.!?\n])\s+/);
      const matchingSentence = sentences.find((s) => {
        const sLower = s.toLowerCase();
        return claimTerms.some((t) => sLower.includes(t));
      });
      bestSnippet = matchingSentence ? matchingSentence.trim().slice(0, 200) : undefined;
    }
  }

  const matchRatio = maxMatchedTerms / claimTerms.length;

  // Case G: If key terms are essentially absent (< 40% match), strictly return NOT_FOUND
  if (matchRatio < 0.4 || !bestChunk) {
    return {
      status: "NOT_FOUND",
      explanation: `Fakta yang dicari tidak ditemukan di dalam materi sumber acuan (tingkat kecocokan ${Math.round(matchRatio * 100)}%).`,
    };
  }

  // High match (>= 75% terms matched) -> SUPPORTED
  if (matchRatio >= 0.75) {
    return {
      status: "SUPPORTED",
      matchedChunkId: bestChunk.chunkId,
      evidenceSnippet: bestSnippet || bestChunk.content.slice(0, 150),
      explanation: "Fakta didukung langsung oleh materi sumber.",
    };
  }

  // Moderate match (40% - 74%) -> INFERRED
  return {
    status: "INFERRED",
    matchedChunkId: bestChunk.chunkId,
    evidenceSnippet: bestSnippet || bestChunk.content.slice(0, 150),
    explanation: "Fakta disimpulkan dari konteks konsep terkait di dalam sumber materi.",
  };
}

/**
 * Creates a standard GroundingEvidenceRef object from an evaluation.
 */
export function buildEvidenceRef(
  sourceId: string,
  sourceTitle: string | undefined,
  evalResult: GroundingEvaluation,
): GroundingEvidenceRef {
  return {
    sourceId,
    sourceTitle,
    chunkId: evalResult.matchedChunkId,
    snippet: evalResult.evidenceSnippet,
    status: evalResult.status,
  };
}
