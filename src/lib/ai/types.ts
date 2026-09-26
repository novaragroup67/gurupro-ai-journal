/**
 * GuruPro AI Foundation (AI-0) — Core Types & Contracts
 */

export type AiSourceType = "text" | "url" | "kurikulum" | "dokumen";

export interface AiSourceChunk {
  chunkId: string;
  sourceId: string;
  index: number;
  title?: string;
  content: string;
  wordCount: number;
  charCount: number;
}

export interface AiSourceSnapshot {
  id: string;
  userId: string;
  sourceType: AiSourceType;
  sourceUrl?: string;
  sourceTitle?: string;
  contentType: string;
  contentHash: string; // SHA-256 hex digest
  retrievedAt: string; // ISO 8601
  normalizedContent: string;
  wordCount: number;
  charCount: number;
  chunks: AiSourceChunk[];
  metadata: Record<string, unknown>;
  ingestionStatus: "pending" | "completed" | "failed";
  createdAt: string;
}

export type GroundingStatus = "SUPPORTED" | "INFERRED" | "NOT_FOUND";

export interface GroundingEvidenceRef {
  sourceId: string;
  chunkId?: string;
  sourceTitle?: string;
  snippet?: string;
  status: GroundingStatus;
  relevanceScore?: number;
}

export interface GroundedSection<T = unknown> {
  content: T;
  evidence: GroundingEvidenceRef[];
  unsupportedClaims?: string[];
  isFullyGrounded: boolean;
}

export interface AiModelConfig {
  provider: "lovable" | "gemini" | "openai";
  endpoint: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  headers: Record<string, string>;
}

export interface AiRequestContract<T = unknown> {
  feature: string; // e.g. "modul_ajar", "generator_soal", "ai_foundation_test"
  userId: string;
  userRole: "guru";
  promptVersion: string; // e.g. "modul_ajar_grounded_v1"
  sourceSnapshotId?: string;
  sourceContent?: string;
  userPrompt: string;
  systemPrompt?: string;
  schemaValidator?: (data: unknown) => T;
  maxRetries?: number;
  timeoutMs?: number;
  modelConfig?: Partial<AiModelConfig>;
}

export interface AiUsageMetadata {
  userId: string;
  feature: string;
  promptVersion: string;
  model: string;
  provider: string;
  latencyMs: number;
  inputCharCount: number;
  outputCharCount: number;
  timestamp: string;
  status: "success" | "error";
  errorCode?: string;
  sourceId?: string;
}

export interface IngestionOptions {
  sourceType: AiSourceType;
  input?: string;
  documentBuffer?: Uint8Array | Buffer;
  base64Data?: string;
  fileName?: string;
  mimeType?: string;
  title?: string;
  userId: string;
  metadata?: Record<string, unknown>;
}
