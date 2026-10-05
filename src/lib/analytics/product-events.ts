/**
 * GuruPro OPS-2: Product Analytics & Event Tracking Engine
 *
 * Implements a non-blocking, privacy-safe event tracking abstraction
 * covering major product journeys (Modul Ajar, Soal, Penugasan, Submission,
 * Penilaian, Presentation, and AI reliability) with strict secret scrubbing.
 */

import { supabase } from "@/integrations/supabase/client";

const RAW_EVENT_MAP = {
  // Authentication
  USER_LOGIN: "USER_LOGIN",
  USER_LOGOUT: "USER_LOGOUT",
  USER_REGISTER: "USER_REGISTER",
  AUTH_REGISTER_STARTED: "auth_register_started",
  AUTH_REGISTER_COMPLETED: "auth_register_completed",
  AUTH_LOGIN_COMPLETED: "auth_login_completed",
  AUTH_LOGOUT: "auth_logout",

  // Dashboard
  DASHBOARD_OPENED: "dashboard_opened",

  // Modul Ajar
  MODUL_OPENED: "MODUL_OPENED",
  MODUL_SOURCE_ANALYSIS_STARTED: "modul_source_analysis_started",
  MODUL_SOURCE_ANALYSIS_COMPLETED: "modul_source_analysis_completed",
  MODUL_GENERATION_STARTED: "modul_generation_started",
  MODUL_GENERATION_COMPLETED: "modul_generation_completed",
  MODUL_GENERATION_FAILED: "modul_generation_failed",
  MODUL_DRAFT_SAVED: "MODUL_DRAFT_SAVED",
  MODUL_PUBLISHED: "MODUL_PUBLISHED",

  // Generator Soal
  QUESTION_GENERATOR_OPENED: "QUESTION_GENERATOR_OPENED",
  QUESTION_GENERATION_STARTED: "question_generation_started",
  QUESTION_GENERATION_COMPLETED: "question_generation_completed",
  QUESTION_GENERATION_FAILED: "question_generation_failed",
  QUESTION_PACKAGE_SAVED: "question_package_saved",
  QUESTION_PACKAGE_PUBLISHED: "QUESTION_PACKAGE_PUBLISHED",

  // Penugasan
  ASSIGNMENT_CREATED: "ASSIGNMENT_CREATED",
  ASSIGNMENT_PUBLISHED: "ASSIGNMENT_PUBLISHED",
  ASSIGNMENT_OPENED: "assignment_opened",

  // Student Submission
  SUBMISSION_STARTED: "SUBMISSION_STARTED",
  ANSWER_SAVED: "ANSWER_SAVED",
  SUBMISSION_SUBMITTED: "SUBMISSION_SUBMITTED",

  // Penilaian
  GRADING_OPENED: "GRADING_OPENED",
  ESSAY_GRADE_SAVED: "essay_grade_saved",
  GRADING_COMPLETED: "GRADING_COMPLETED",
  STUDENT_RESULT_OPENED: "student_result_opened",

  // Presentation
  PRESENTATION_GENERATION_STARTED: "presentation_generation_started",
  PRESENTATION_GENERATION_COMPLETED: "presentation_generation_completed",
  PRESENTATION_GENERATION_FAILED: "presentation_generation_failed",
  PRESENTATION_REVIEW_STARTED: "presentation_review_started",
  PRESENTATION_APPROVED: "presentation_approved",
  PRESENTATION_REJECTED: "presentation_rejected",
  PRESENTATION_QUALITY_PASSED: "PRESENTATION_QUALITY_PASSED",
  PRESENTATION_QUALITY_FAILED: "presentation_quality_failed",
  PRESENTATION_DOWNLOADED: "PRESENTATION_DOWNLOADED",

  // AI
  AI_GENERATION_SUCCESS: "AI_GENERATION_SUCCESS",
  AI_GENERATION_FAILURE: "AI_GENERATION_FAILURE",
  AI_PROVIDER_FAILOVER: "AI_PROVIDER_FAILOVER",
  AI_PROVIDER_UNAVAILABLE: "AI_PROVIDER_UNAVAILABLE",
  AI_SAFETY_BLOCKED: "AI_SAFETY_BLOCKED",

  // Feedback
  FEEDBACK_SUBMITTED: "FEEDBACK_SUBMITTED",
} as const;

export const PRODUCT_EVENT_NAMES: string[] & typeof RAW_EVENT_MAP = Object.assign(
  Object.keys(RAW_EVENT_MAP),
  RAW_EVENT_MAP,
);

export type ProductEventName = keyof typeof RAW_EVENT_MAP | string;

export type ProductFeature =
  | "auth"
  | "dashboard"
  | "modul"
  | "modul_ajar"
  | "soal"
  | "generator_soal"
  | "penugasan"
  | "submission"
  | "penilaian"
  | "presentation"
  | "ai"
  | "ai_core"
  | "feedback";

export interface ProductEventInput {
  eventName: ProductEventName | string;
  feature?: ProductFeature | string;
  actorId?: string | null;
  userId?: string | null;
  role?: string | null;
  sessionId?: string | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface StoredProductEvent {
  id: string;
  eventName: string;
  feature: string;
  actorId: string | null;
  role: string | null;
  sessionId: string | null;
  correlationId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// In-memory fallback event ledger for resilience & isolated test executions
export const fallbackProductEvents: StoredProductEvent[] = [];

/**
 * Strips secrets, raw student answers, JWT tokens, and sensitive keys from metadata.
 */
export function sanitizeEventMetadata(
  meta?: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!meta || typeof meta !== "object") {
    return {};
  }

  const sanitized: Record<string, unknown> = {};
  const forbiddenKeyRegex = /(password|token|jwt|apikey|api_key|openai|gemini|_key$|key$|secret|bearer|authorization|cookie|session_id)/i;
  const privateContentKeyRegex = /(raw_answer|student_answer|jawaban_lengkap|raw_prompt|full_prompt|raw_response)/i;

  for (const [key, rawVal] of Object.entries(meta)) {
    // 1. Redact forbidden credential keys
    if (forbiddenKeyRegex.test(key)) {
      sanitized[key] = "[REDACTED]";
      continue;
    }

    // 2. Coarse-grain sensitive student content (store length/count instead of raw private answer text)
    if (privateContentKeyRegex.test(key)) {
      if (typeof rawVal === "string") {
        sanitized[key] = { length: rawVal.length };
        sanitized[`${key}_length`] = rawVal.length;
      } else if (Array.isArray(rawVal)) {
        sanitized[key] = { count: rawVal.length };
        sanitized[`${key}_count`] = rawVal.length;
      }
      continue;
    }

    // 3. String value redactions
    if (typeof rawVal === "string") {
      let cleaned = rawVal;
      // Strip Bearer JWTs
      cleaned = cleaned.replace(/eyJ[a-zA-Z0-9_-]{5,}\.[a-zA-Z0-9_-]{5,}\.[a-zA-Z0-9_-]*/g, "[REDACTED_JWT]");
      // Strip Gemini keys
      cleaned = cleaned.replace(/AIzaSy[A-Za-z0-9_-]+/g, "[REDACTED_GEMINI_KEY]");
      // Strip OpenAI keys
      cleaned = cleaned.replace(/sk-[a-zA-Z0-9_-]+/g, "[REDACTED_OPENAI_KEY]");
      // Strip Passwords
      cleaned = cleaned.replace(/password[:=]\s*[^\s,;]+/gi, "password=[REDACTED]");

      // Truncate overly verbose strings (> 500 chars) to prevent bloated analytics payloads
      if (cleaned.length > 500) {
        cleaned = cleaned.slice(0, 500) + "...[TRUNCATED]";
      }
      sanitized[key] = cleaned;
    } else if (typeof rawVal === "number" || typeof rawVal === "boolean") {
      sanitized[key] = rawVal;
    } else if (Array.isArray(rawVal)) {
      // Limit arrays to first 10 items
      sanitized[key] = rawVal.slice(0, 10);
    } else if (rawVal && typeof rawVal === "object") {
      sanitized[key] = sanitizeEventMetadata(rawVal as Record<string, unknown>);
    } else {
      sanitized[key] = null;
    }
  }

  return sanitized;
}

export interface TrackProductEventResult {
  ok: boolean;
  eventId: string;
  recordedAt: string;
}

/**
 * Non-blocking central product event logger.
 * Catches all errors safely so analytics NEVER blocks primary business workflows.
 */
export async function trackProductEvent(
  eventOrInput: ProductEventName | string | ProductEventInput,
  featureOrOptions?: ProductFeature | string | Record<string, unknown>,
  options?: {
    userId?: string | null;
    actorId?: string | null;
    role?: string | null;
    sessionId?: string | null;
    correlationId?: string | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<TrackProductEventResult> {
  const eventId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const nowIso = new Date().toISOString();

  try {
    let cleanEventName = "";
    let cleanFeature = "general";
    let actorId: string | null = null;
    let role: string | null = null;
    let sessionId: string | null = null;
    let correlationId: string | null = null;
    let metadata: Record<string, unknown> | null = null;

    if (typeof eventOrInput === "object" && eventOrInput !== null) {
      cleanEventName = String(eventOrInput.eventName || "").trim();
      cleanFeature = String(eventOrInput.feature || "general").trim();
      actorId = eventOrInput.actorId || eventOrInput.userId || null;
      role = eventOrInput.role || null;
      sessionId = eventOrInput.sessionId || null;
      correlationId = eventOrInput.correlationId || null;
      metadata = eventOrInput.metadata || null;
    } else {
      cleanEventName = String(eventOrInput || "").trim();
      if (typeof featureOrOptions === "string") {
        cleanFeature = featureOrOptions.trim();
        if (options && typeof options === "object") {
          actorId = options.actorId || options.userId || null;
          role = options.role || null;
          sessionId = options.sessionId || null;
          correlationId = options.correlationId || null;
          metadata = options.metadata || null;
        }
      } else if (typeof featureOrOptions === "object" && featureOrOptions !== null) {
        cleanFeature = (featureOrOptions.feature as string) || "general";
        actorId = (featureOrOptions.actorId as string) || (featureOrOptions.userId as string) || null;
        role = (featureOrOptions.role as string) || null;
        sessionId = (featureOrOptions.sessionId as string) || null;
        correlationId = (featureOrOptions.correlationId as string) || null;
        metadata = (featureOrOptions.metadata as Record<string, unknown>) || null;
      }
    }

    if (!cleanEventName) {
      return { ok: false, eventId, recordedAt: nowIso };
    }

    const sanitizedMeta = sanitizeEventMetadata(metadata);

    const record: StoredProductEvent = {
      id: eventId,
      eventName: cleanEventName,
      feature: cleanFeature,
      actorId,
      role,
      sessionId,
      correlationId,
      metadata: sanitizedMeta,
      createdAt: nowIso,
    };

    // Always mirror to fallback memory buffer for fast diagnostics and test verification
    fallbackProductEvents.push(record);
    if (fallbackProductEvents.length > 1000) {
      fallbackProductEvents.shift(); // Bound memory consumption
    }

    // Non-blocking database persist attempt
    try {
      const { error } = await supabase.from("product_events").insert({
        id: record.id,
        event_name: record.eventName,
        feature: record.feature,
        actor_id: record.actorId,
        role: record.role,
        session_id: record.sessionId,
        correlation_id: record.correlationId,
        metadata: record.metadata,
        created_at: record.createdAt,
      });

      if (error) {
        if (process.env.NODE_ENV === "development") {
          console.debug("[Analytics] Event logged to memory (DB note: " + error.message + ")");
        }
      }
    } catch {
      // Completely non-blocking: ignore DB failure
    }

    return { ok: true, eventId, recordedAt: nowIso };
  } catch (err) {
    console.warn("[Analytics] Silently suppressed error in trackProductEvent:", err);
    return { ok: false, eventId, recordedAt: nowIso };
  }
}

/**
 * Resets fallback memory records (for test isolation)
 */
export function clearFallbackProductEvents(): void {
  fallbackProductEvents.length = 0;
}
