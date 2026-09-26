/**
 * GuruPro AI Foundation (AI-0) — Boundary-Aware Source Chunker
 *
 * Chunks long sources while strictly preserving section headings,
 * sentence boundaries, and attaching provenance metadata.
 */

import { createHash } from "node:crypto";
import type { AiSourceChunk } from "./types";

export interface ChunkingOptions {
  maxWordsPerChunk?: number;
  minWordsPerChunk?: number;
  overlapWords?: number;
}

export function chunkNormalizedSource(
  sourceId: string,
  normalizedText: string,
  options?: ChunkingOptions,
): AiSourceChunk[] {
  const maxWords = options?.maxWordsPerChunk ?? 600;
  const minWords = options?.minWordsPerChunk ?? 100;
  const overlapWords = options?.overlapWords ?? 50;

  if (!normalizedText || !normalizedText.trim()) {
    return [];
  }

  // Split into paragraphs / sections
  const paragraphs = normalizedText
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: AiSourceChunk[] = [];
  let currentChunkParagraphs: string[] = [];
  let currentChunkWords: string[] = [];
  let currentTitle: string | undefined;

  function flushChunk(index: number) {
    if (currentChunkParagraphs.length === 0) return;

    const content = currentChunkParagraphs.join("\n\n").trim();
    const words = content.split(/\s+/).filter(Boolean);
    const chunkHash = createHash("sha256")
      .update(`${sourceId}:${index}:${content}`)
      .digest("hex")
      .slice(0, 16);

    chunks.push({
      chunkId: `chunk_${chunkHash}`,
      sourceId,
      index,
      title: currentTitle,
      content,
      wordCount: words.length,
      charCount: content.length,
    });
    currentTitle = undefined;
  }

  let chunkIndex = 0;

  for (const para of paragraphs) {
    // Check if this paragraph is a Markdown heading
    const headingMatch = /^#{1,4}\s+(.+)$/.exec(para);
    if (headingMatch) {
      // If we already have accumulated sufficient content, flush before new major heading
      if (currentChunkWords.length >= minWords) {
        flushChunk(chunkIndex++);
        // Retain overlap if needed
        const overlap = currentChunkWords.slice(-overlapWords).join(" ");
        currentChunkParagraphs = overlap ? [overlap] : [];
        currentChunkWords = overlap ? overlap.split(/\s+/).filter(Boolean) : [];
      }
      if (!currentTitle || headingMatch[0].startsWith("# ")) {
        currentTitle = headingMatch[1].trim();
      }
    }

    const paraWords = para.split(/\s+/).filter(Boolean);

    // If adding this paragraph exceeds maxWords and we have content, flush first
    if (currentChunkWords.length + paraWords.length > maxWords && currentChunkWords.length > 0) {
      flushChunk(chunkIndex++);
      const overlap = currentChunkWords.slice(-overlapWords).join(" ");
      currentChunkParagraphs = overlap ? [overlap, para] : [para];
      currentChunkWords = currentChunkParagraphs.join(" ").split(/\s+/).filter(Boolean);
    } else {
      currentChunkParagraphs.push(para);
      currentChunkWords.push(...paraWords);
    }
  }

  // Flush remaining paragraphs
  if (currentChunkParagraphs.length > 0) {
    flushChunk(chunkIndex);
  }

  // Fallback: If only 1 small chunk was produced, ensure it has index 0
  if (chunks.length === 0 && normalizedText.trim().length > 0) {
    const words = normalizedText.split(/\s+/).filter(Boolean);
    const chunkHash = createHash("sha256")
      .update(`${sourceId}:0:${normalizedText}`)
      .digest("hex")
      .slice(0, 16);

    chunks.push({
      chunkId: `chunk_${chunkHash}`,
      sourceId,
      index: 0,
      title: currentTitle,
      content: normalizedText.trim(),
      wordCount: words.length,
      charCount: normalizedText.trim().length,
    });
  }

  return chunks;
}
