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

export const EDUCATIONAL_SYNONYMS: Record<string, string[]> = {
  perutean: ["routing", "rute"],
  routing: ["perutean", "rute"],
  "jarak administratif": ["administrative distance", "distance"],
  "administrative distance": ["jarak administratif", "distance"],
  jarak: ["distance"],
  distance: ["jarak"],
  administratif: ["administrative"],
  administrative: ["administratif"],
  biaya: ["beban"],
  beban: ["biaya"],
  penyusutan: ["depresiasi"],
  depresiasi: ["penyusutan"],
  sakelar: ["switch"],
  switch: ["sakelar"],
  antarmuka: ["interface"],
  interface: ["antarmuka"],
  bensin: ["fuel", "gasoline"],
  "bahan bakar": ["fuel", "bensin"],
  otomotif: ["kendaraan", "mesin"],
  standar: ["default", "baku"],
  default: ["standar"],
};

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
  unsupportedEntities?: string[];
}

/**
 * Extracts numbers from text, normalized for thousands separators and decimal points.
 */
function extractNumericTokens(text: string): string[] {
  const matches = text.match(/\b\d+(?:[.,]\d+)?\b/g) || [];
  return Array.from(new Set(matches.map((m) => m.replace(/[.,]/g, ""))));
}

/**
 * Checks if a specific number exists in target text, handling formatting variations.
 */
function textContainsNumber(targetText: string, rawNum: string): boolean {
  if (targetText.includes(rawNum)) return true;
  const digitsOnly = rawNum.replace(/[.,]/g, "");
  if (targetText.replace(/[.,]/g, "").includes(digitsOnly)) return true;
  return false;
}

const COMMON_INDO_WORDS = new Set([
  "apa", "apakah", "bagaimana", "bagaimanakah", "kenapa", "mengapa", "kapan", "dimana", "siapa",
  "berapa", "berapakah", "yang", "dan", "atau", "dari", "ke", "pada", "dalam", "untuk", "dengan",
  "adalah", "yaitu", "sebagai", "ini", "itu", "akan", "dapat", "bisa", "harus", "oleh", "secara",
  "karena", "maka", "jika", "tentang", "jelaskan", "sebutkan", "uraikan", "tuliskan", "analisis",
  "tahapan", "langkah", "berikut", "sebuah", "suatu", "tiap", "setiap", "serta", "konfigurasi",
  "sistem", "perusahaan", "lakukan", "terdapat", "antara", "menggunakan", "memakai", "mencatat",
  "membayar", "pembagian", "perhitungan", "pencatatan", "metode", "aturan", "pengujian",
  "refleksi", "studi", "kelebihan", "keunggulan", "perbedaan", "standar", "protokol", "perutean",
  "jurnal", "beban", "biaya", "aset", "nilai", "cara", "fungsi", "mesin", "komponen"
]);

/**
 * Extracts distinctive capitalized entities, acronyms, or proper nouns from the claim.
 */
function extractDistinctiveEntities(claim: string): string[] {
  const tokens = claim.match(/\b[A-Za-z0-9_-]+\b/g) || [];
  const entities: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const lower = token.toLowerCase();

    // Check if token has an uppercase letter or is an acronym (e.g. VLAN, IEEE, MAF, TPS, OBD, etc.)
    const isCapitalized = /^[A-Z]/.test(token);
    const isAcronym = /^[A-Z0-9]{2,}$/.test(token);

    // Skip the very first word of the sentence unless it is an explicit acronym
    if (i === 0 && !isAcronym) {
      continue;
    }

    // Skip if it's a common Indonesian word
    if (COMMON_INDO_WORDS.has(lower)) {
      continue;
    }

    if (isAcronym || (isCapitalized && token.length >= 3)) {
      entities.push(lower);
    }
  }

  return Array.from(new Set(entities));
}

/**
 * Evaluates whether a specific claim or factual assertion is grounded in the source chunks.
 * Strictly prevents hallucination: if fact or critical entity is absent, returns NOT_FOUND.
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
    "ke", "di", "bisa", "harus", "ada", "tidak", "bukan", "hanya", "juga",
    "serta", "yaitu", "yakni", "bagi", "tentang", "atas", "bawah", "saat",
  ]);

  const claimTerms = cleanClaim
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopwords.has(w));

  if (claimTerms.length === 0) {
    return {
      status: "NOT_FOUND",
      explanation: "Tidak ada kata kunci signifikan pada klaim yang dapat diverifikasi.",
    };
  }

  // Extract asserted numbers and distinctive entities from claim
  const claimNumbers = (claim.match(/\b\d+(?:[.,]\d+)?\b/g) || []).filter((n) => n.length >= 1);
  const distinctiveEntities = extractDistinctiveEntities(claim);

  let bestChunk: AiSourceChunk | null = null;
  let bestSnippet: string | undefined = undefined;
  let maxMatchedTerms = 0;

  for (const chunk of sourceChunks) {
    const chunkText = `${chunk.title ? chunk.title + " " : ""}${chunk.content}`;
    const chunkLower = chunkText.toLowerCase();
    let matchedCount = 0;

    for (const term of claimTerms) {
      if (chunkLower.includes(term)) {
        matchedCount++;
      } else if (EDUCATIONAL_SYNONYMS[term]) {
        const hasSynonym = EDUCATIONAL_SYNONYMS[term].some((syn) => chunkLower.includes(syn));
        if (hasSynonym) matchedCount++;
      }
    }

    if (matchedCount > maxMatchedTerms) {
      maxMatchedTerms = matchedCount;
      bestChunk = chunk;

      // Extract sentence with highest density of matching terms
      const sentences = chunk.content.split(/(?<=[.!?\n])\s+/);
      let bestSentMatch = 0;
      for (const s of sentences) {
        const sLower = s.toLowerCase();
        let sCount = 0;
        for (const t of claimTerms) {
          if (sLower.includes(t)) sCount++;
          else if (EDUCATIONAL_SYNONYMS[t]?.some((syn) => sLower.includes(syn))) sCount++;
        }
        if (sCount > bestSentMatch) {
          bestSentMatch = sCount;
          bestSnippet = s.trim().slice(0, 200);
        }
      }
    }
  }

  const matchRatio = maxMatchedTerms / claimTerms.length;

  // Case G: If key terms are essentially absent (< 40% match) or no chunk matched, strictly return NOT_FOUND
  if (matchRatio < 0.4 || !bestChunk) {
    return {
      status: "NOT_FOUND",
      explanation: `Fakta yang dicari tidak ditemukan di dalam materi sumber acuan (tingkat kecocokan ${Math.round(matchRatio * 100)}%).`,
    };
  }

  // Combine content of all provided source chunks to verify entity presence
  const combinedSourceLower = sourceChunks
    .map((c) => `${c.title || ""} ${c.content}`)
    .join(" ")
    .toLowerCase();

  // Validate asserted numeric tokens: if a claim asserts specific numbers not in source, flag as ungrounded
  const missingNumbers = claimNumbers.filter((num) => !textContainsNumber(combinedSourceLower, num));

  // Validate asserted distinctive entities: if a claim asserts specific entities/brands/acronyms not in source, flag as ungrounded
  const missingEntities = distinctiveEntities.filter((entity) => {
    if (combinedSourceLower.includes(entity)) return false;
    if (EDUCATIONAL_SYNONYMS[entity]?.some((syn) => combinedSourceLower.includes(syn))) return false;
    return true;
  });

  const unsupportedEntities = Array.from(new Set([...missingNumbers, ...missingEntities]));

  // If claim asserts specific entities or numbers that do NOT exist in the source, strictly reject as NOT_FOUND
  if (unsupportedEntities.length > 0) {
    return {
      status: "NOT_FOUND",
      unsupportedEntities,
      matchedChunkId: bestChunk.chunkId,
      explanation: `Klaim/pertanyaan memuat entitas atau parameter spesifik yang tidak ditemukan di dalam materi sumber acuan (${unsupportedEntities.join(", ")}).`,
    };
  }

  // High match (>= 70% terms matched) -> SUPPORTED
  if (matchRatio >= 0.70) {
    return {
      status: "SUPPORTED",
      matchedChunkId: bestChunk.chunkId,
      evidenceSnippet: bestSnippet || bestChunk.content.slice(0, 150),
      explanation: "Fakta didukung langsung oleh materi sumber.",
    };
  }

  // Moderate match (40% - 69%) -> INFERRED
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
