/**
 * GuruPro AI Foundation (AI-0) — Server-Side Rate Limiter & Concurrency Guard
 */

import { AI_ERROR_CODES, AiServiceError } from "./error-taxonomy";

interface UserRateBucket {
  timestamps: number[];
  activeRequests: number;
}

const userBuckets = new Map<string, UserRateBucket>();

// Default configuration: max 20 requests per minute, max 2 concurrent requests per user
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;
const MAX_CONCURRENT_REQUESTS = 2;

export function checkAndAcquireRateSlot(
  userId: string,
  options?: { maxPerWindow?: number; maxConcurrent?: number },
): () => void {
  const now = Date.now();
  const maxPerWindow = options?.maxPerWindow ?? MAX_REQUESTS_PER_WINDOW;
  const maxConcurrent = options?.maxConcurrent ?? MAX_CONCURRENT_REQUESTS;

  let bucket = userBuckets.get(userId);
  if (!bucket) {
    bucket = { timestamps: [], activeRequests: 0 };
    userBuckets.set(userId, bucket);
  }

  // Filter out timestamps outside the sliding window
  bucket.timestamps = bucket.timestamps.filter((ts) => now - ts < WINDOW_MS);

  if (bucket.activeRequests >= maxConcurrent) {
    throw new AiServiceError(
      AI_ERROR_CODES.AI_RATE_LIMIT,
      "Anda memiliki permintaan AI yang sedang berjalan. Tunggu hingga proses sebelumnya selesai.",
    );
  }

  if (bucket.timestamps.length >= maxPerWindow) {
    throw new AiServiceError(
      AI_ERROR_CODES.AI_RATE_LIMIT,
      `Batas frekuensi permintaan AI tercapai (${maxPerWindow} permintaan/menit). Tunggu beberapa saat sebelum mencoba lagi.`,
    );
  }

  // Acquire slot
  bucket.timestamps.push(now);
  bucket.activeRequests++;

  let released = false;
  return function release() {
    if (!released) {
      released = true;
      bucket.activeRequests = Math.max(0, bucket.activeRequests - 1);
    }
  };
}

export function resetRateLimiterForTesting() {
  userBuckets.clear();
}
