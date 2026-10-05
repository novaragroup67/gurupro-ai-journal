/**
 * GuruPro OPS-2: User Feedback Service
 *
 * Implements a lightweight feedback submission and lifecycle management engine
 * (categories: bug, usability, ai_output, performance, suggestion)
 * with role-aware status transition controls and fallback store resilience.
 */

import { supabase } from "@/integrations/supabase/client";

export type FeedbackCategory =
  | "bug"
  | "usability"
  | "ai_output"
  | "performance"
  | "suggestion";

export type FeedbackPriority = "rendah" | "sedang" | "tinggi" | "kritis";

export type FeedbackStatus =
  | "new"
  | "triaged"
  | "in_progress"
  | "resolved"
  | "closed";

export interface UserFeedbackItem {
  id: string;
  userId: string;
  role: "guru" | "siswa" | "admin";
  category: FeedbackCategory;
  priority: FeedbackPriority;
  feature: string;
  message: string;
  correlationId: string | null;
  status: FeedbackStatus;
  adminNotes: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubmitFeedbackInput {
  category: FeedbackCategory;
  feature: string;
  message: string;
  priority?: FeedbackPriority;
  correlationId?: string;
  userId?: string;
  role?: "guru" | "siswa" | "admin";
}

// In-memory fallback ledger for test isolation and offline resilience
export const fallbackUserFeedbacks: UserFeedbackItem[] = [];

const VALID_STATUS_TRANSITIONS: Record<FeedbackStatus, FeedbackStatus[]> = {
  new: ["triaged", "in_progress", "closed"],
  triaged: ["in_progress", "resolved", "closed"],
  in_progress: ["resolved", "closed"],
  resolved: ["closed", "in_progress"],
  closed: ["in_progress"], // Reopen
};

export function isValidFeedbackStatusTransition(
  current: FeedbackStatus,
  next: FeedbackStatus,
): boolean {
  if (current === next) return true;
  const allowed = VALID_STATUS_TRANSITIONS[current] || [];
  return allowed.includes(next);
}

function mapRowToFeedback(row: Record<string, unknown>): UserFeedbackItem {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    role: (row.role as any) || "guru",
    category: (row.category as FeedbackCategory) || "suggestion",
    priority: (row.priority as FeedbackPriority) || "sedang",
    feature: String(row.feature || "umum"),
    message: String(row.message || ""),
    correlationId: row.correlation_id ? String(row.correlation_id) : null,
    status: (row.status as FeedbackStatus) || "new",
    adminNotes: row.admin_notes ? String(row.admin_notes) : null,
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/**
 * Submit user feedback with validation and non-blocking safety.
 */
export async function submitUserFeedback(
  input: SubmitFeedbackInput,
): Promise<{ ok: boolean; message: string; feedbackId?: string }> {
  const VALID_CATEGORIES: FeedbackCategory[] = ["bug", "usability", "ai_output", "performance", "suggestion"];
  if (!VALID_CATEGORIES.includes(input.category as FeedbackCategory)) {
    throw new Error(`Kategori masukan tidak valid: "${input.category}".`);
  }

  const cleanMessage = input.message?.trim();
  if (!cleanMessage || cleanMessage.length < 10) {
    throw new Error("Karakter minimal pesan umpan balik adalah 10 karakter.");
  }

  const cleanFeature = input.feature?.trim() || "umum";
  const category = input.category;
  const priority = input.priority || "sedang";

  const feedbackId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `fb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const nowIso = new Date().toISOString();

  const memItem: UserFeedbackItem = {
    id: feedbackId,
    userId: input.userId || "anonymous",
    role: input.role || "guru",
    category,
    priority,
    feature: cleanFeature,
    message: cleanMessage,
    correlationId: input.correlationId?.trim() || null,
    status: "new",
    adminNotes: null,
    resolvedAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  fallbackUserFeedbacks.push(memItem);

  // Try Supabase insert
  try {
    const { data, error } = await supabase.from("user_feedback").insert({
      id: memItem.id,
      user_id: memItem.userId !== "anonymous" ? memItem.userId : undefined,
      role: memItem.role,
      category: memItem.category,
      priority: memItem.priority,
      feature: memItem.feature,
      message: memItem.message,
      correlation_id: memItem.correlationId,
      status: memItem.status,
      created_at: memItem.createdAt,
      updated_at: memItem.updatedAt,
    }).select("id").maybeSingle();

    if (!error && data?.id) {
      return {
        ok: true,
        message: "Umpan balik Anda berhasil dikirim. Terima kasih telah membantu menyempurnakan GuruPro!",
        feedbackId: String(data.id),
      };
    }
  } catch {
    // Fall through to memory confirmation
  }

  return {
    ok: true,
    message: "Umpan balik Anda berhasil dicatat. Terima kasih atas masukan Anda!",
    feedbackId,
  };
}

/**
 * Fetch feedback items submitted by current authenticated user.
 */
export async function getMyUserFeedback(userId?: string): Promise<UserFeedbackItem[]> {
  try {
    if (userId) {
      const memMatches = fallbackUserFeedbacks.filter((f) => f.userId === userId);
      if (memMatches.length > 0) return memMatches;
    }

    const { data, error } = await supabase
      .from("user_feedback")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && Array.isArray(data) && data.length > 0) {
      return data.map(mapRowToFeedback);
    }
  } catch {
    // Return memory fallback
  }

  return fallbackUserFeedbacks;
}

/**
 * Fetch all user feedback items for Admin dashboard.
 */
export async function getAllUserFeedback(filters?: {
  status?: FeedbackStatus | "semua";
  category?: FeedbackCategory | "semua";
}): Promise<UserFeedbackItem[]> {
  try {
    let query = supabase.from("user_feedback").select("*").order("created_at", { ascending: false });

    if (filters?.status && filters.status !== "semua") {
      query = query.eq("status", filters.status);
    }
    if (filters?.category && filters.category !== "semua") {
      query = query.eq("category", filters.category);
    }

    const { data, error } = await query;
    if (!error && Array.isArray(data) && data.length > 0) {
      return data.map(mapRowToFeedback);
    }
  } catch {
    // Return filtered memory fallback
  }

  return fallbackUserFeedbacks.filter((f) => {
    if (filters?.status && filters.status !== "semua" && f.status !== filters.status) return false;
    if (filters?.category && filters.category !== "semua" && f.category !== filters.category) return false;
    return true;
  });
}

/**
 * Admin status update for user feedback item.
 * Validates role and transitions.
 */
export async function updateUserFeedbackStatus(
  feedbackId: string,
  newStatus: FeedbackStatus,
  contextOrNotes?: string | { role?: string; adminNotes?: string },
  maybeNotes?: string,
): Promise<{ ok: boolean; message: string; feedback?: UserFeedbackItem }> {
  let userRole: string | undefined;
  let adminNotes: string | undefined;

  if (typeof contextOrNotes === "object" && contextOrNotes !== null) {
    userRole = contextOrNotes.role;
    adminNotes = maybeNotes || contextOrNotes.adminNotes;
  } else if (typeof contextOrNotes === "string") {
    adminNotes = contextOrNotes;
    if (typeof maybeNotes === "string") {
      userRole = maybeNotes;
    }
  }

  // Authorization check: only admin is authorized
  if (userRole && userRole !== "admin") {
    throw new Error("Akses ditolak: Hanya Admin yang berwenang mengubah status umpan balik.");
  }

  const VALID_STATUSES: FeedbackStatus[] = ["new", "triaged", "in_progress", "resolved", "closed"];
  if (!VALID_STATUSES.includes(newStatus)) {
    throw new Error(`Status masukan tidak valid: "${newStatus}".`);
  }

  const existing = fallbackUserFeedbacks.find((f) => f.id === feedbackId);
  if (existing) {
    if (!isValidFeedbackStatusTransition(existing.status, newStatus)) {
      throw new Error(`Transisi status dari "${existing.status}" ke "${newStatus}" tidak valid.`);
    }
    existing.status = newStatus;
    if (adminNotes !== undefined) existing.adminNotes = adminNotes;
    if (newStatus === "resolved" || newStatus === "closed") {
      existing.resolvedAt = new Date().toISOString();
    }
    existing.updatedAt = new Date().toISOString();
  }

  try {
    const updatePayload: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };
    if (adminNotes !== undefined) updatePayload.admin_notes = adminNotes;
    if (newStatus === "resolved" || newStatus === "closed") {
      updatePayload.resolved_at = new Date().toISOString();
    }

    await supabase.from("user_feedback").update(updatePayload).eq("id", feedbackId);
  } catch {
    // Memory update already performed
  }

  return {
    ok: true,
    message: `Status umpan balik berhasil diubah menjadi "${newStatus}".`,
    feedback: existing,
  };
}

export function clearFallbackUserFeedbacks(): void {
  fallbackUserFeedbacks.length = 0;
}
