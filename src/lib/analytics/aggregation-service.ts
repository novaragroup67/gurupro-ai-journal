/**
 * GuruPro OPS-2: Product Analytics Aggregation Engine
 *
 * Computes aggregated adoption, feature usage, workflow conversion funnels,
 * AI reliability metrics, and feedback summaries across time windows
 * (today, last_7_days, last_30_days).
 */

import { supabase } from "@/integrations/supabase/client";
import {
  fallbackProductEvents,
  PRODUCT_EVENT_NAMES,
  StoredProductEvent,
} from "./product-events";
import { fallbackUserFeedbacks, UserFeedbackItem } from "./feedback-service";

export type AnalyticsTimeWindow = "today" | "last_7_days" | "last_30_days";

export interface FunnelStage {
  name: string;
  count: number;
  conversionRate: number; // percentage (0-100) compared to first step
}

export interface ProductAnalyticsReport {
  timeWindow: AnalyticsTimeWindow;
  generatedAt: string;
  adoption: {
    totalEvents: number;
    activeTeachers: number;
    activeStudents: number;
    activeAdmins: number;
    byRole: Record<string, number>;
  };
  featureUsage: Record<string, number>;
  funnels: {
    modulAjar: FunnelStage[];
    generatorSoal: FunnelStage[];
    penugasan: FunnelStage[];
    penilaian: FunnelStage[];
    presentation: FunnelStage[];
  };
  aiReliability: {
    totalGenerations: number;
    successRate: number; // percentage (0-100)
    failoverCount: number;
    safetyBlockedCount: number;
    providerBreakdown: {
      gemini: number;
      openai: number;
    };
    errorBreakdown: Record<string, number>;
  };
  feedback: {
    total: number;
    unresolvedCount: number;
    byCategory: Record<string, number>;
    byStatus: Record<string, number>;
    recent: UserFeedbackItem[];
  };
}

function getWindowStartDate(window: AnalyticsTimeWindow): Date {
  const now = new Date();
  if (window === "today") {
    now.setHours(0, 0, 0, 0);
    return now;
  }
  if (window === "last_7_days") {
    return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  }
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
}

function computeFunnel(
  events: StoredProductEvent[],
  stages: { name: string; match: (e: StoredProductEvent) => boolean }[],
): FunnelStage[] & { conversionRate: number; totalStarts: number; totalCompletions: number } {
  let firstCount = 0;
  const list: any = stages.map((st, idx) => {
    const count = events.filter(st.match).length;
    if (idx === 0) firstCount = count;
    const rate = firstCount > 0 ? Math.round((count / firstCount) * 100) : 0;
    return { name: st.name, count, conversionRate: rate };
  });

  const lastCount = list.length > 0 ? list[list.length - 1].count : 0;
  list.conversionRate = firstCount > 0 ? Math.round((lastCount / firstCount) * 100) : 0;
  list.totalStarts = firstCount;
  list.totalCompletions = lastCount;

  return list;
}

/**
 * Computes aggregated product metrics for the given time window.
 */
export async function getAggregatedProductMetrics(
  window: AnalyticsTimeWindow = "last_7_days",
): Promise<ProductAnalyticsReport> {
  const startDate = getWindowStartDate(window);
  const nowIso = new Date().toISOString();

  let events: StoredProductEvent[] = [];
  let feedbacks: UserFeedbackItem[] = [];

  // 1. Fetch events (Supabase DB with memory fallback)
  try {
    const { data, error } = await supabase
      .from("product_events")
      .select("*")
      .gte("created_at", startDate.toISOString())
      .order("created_at", { ascending: false });

    if (!error && Array.isArray(data) && data.length > 0) {
      events = data.map((r) => ({
        id: String(r.id),
        eventName: String(r.event_name),
        feature: String(r.feature),
        actorId: r.actor_id ? String(r.actor_id) : null,
        role: r.role ? String(r.role) : null,
        sessionId: r.session_id ? String(r.session_id) : null,
        correlationId: r.correlation_id ? String(r.correlation_id) : null,
        metadata: (r.metadata as Record<string, unknown>) || {},
        createdAt: String(r.created_at),
      }));
    } else {
      events = fallbackProductEvents.filter((e) => new Date(e.createdAt) >= startDate);
    }
  } catch {
    events = fallbackProductEvents.filter((e) => new Date(e.createdAt) >= startDate);
  }

  // 2. Fetch feedback items
  try {
    const { data, error } = await supabase
      .from("user_feedback")
      .select("*")
      .gte("created_at", startDate.toISOString())
      .order("created_at", { ascending: false });

    if (!error && Array.isArray(data) && data.length > 0) {
      feedbacks = data.map((r: any) => ({
        id: String(r.id),
        userId: String(r.user_id),
        role: r.role || "guru",
        category: r.category || "suggestion",
        priority: r.priority || "sedang",
        feature: r.feature || "umum",
        message: r.message || "",
        correlationId: r.correlation_id || null,
        status: r.status || "new",
        adminNotes: r.admin_notes || null,
        resolvedAt: r.resolved_at || null,
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      }));
    } else {
      feedbacks = fallbackUserFeedbacks.filter((f) => new Date(f.createdAt) >= startDate);
    }
  } catch {
    feedbacks = fallbackUserFeedbacks.filter((f) => new Date(f.createdAt) >= startDate);
  }

  // 3. Adoption aggregations
  const uniqueTeachers = new Set<string>();
  const uniqueStudents = new Set<string>();
  const uniqueAdmins = new Set<string>();
  const byRole: Record<string, number> = { guru: 0, siswa: 0, admin: 0 };
  const featureUsage: Record<string, number> = {};

  for (const e of events) {
    if (e.role === "guru" && e.actorId) uniqueTeachers.add(e.actorId);
    if (e.role === "siswa" && e.actorId) uniqueStudents.add(e.actorId);
    if (e.role === "admin" && e.actorId) uniqueAdmins.add(e.actorId);

    const r = e.role || "umum";
    byRole[r] = (byRole[r] || 0) + 1;

    const f = e.feature || "umum";
    featureUsage[f] = (featureUsage[f] || 0) + 1;
  }

  // 4. Conversion Funnels
  const modulAjar = computeFunnel(events, [
    {
      name: "Buka Modul Ajar",
      match: (e) =>
        e.eventName === PRODUCT_EVENT_NAMES.MODUL_OPENED ||
        e.eventName === PRODUCT_EVENT_NAMES.MODUL_SOURCE_ANALYSIS_STARTED,
    },
    {
      name: "Generasi Selesai",
      match: (e) => e.eventName === PRODUCT_EVENT_NAMES.MODUL_GENERATION_COMPLETED,
    },
    {
      name: "Draf Disimpan",
      match: (e) => e.eventName === PRODUCT_EVENT_NAMES.MODUL_DRAFT_SAVED,
    },
    {
      name: "Modul Diterbitkan",
      match: (e) => e.eventName === PRODUCT_EVENT_NAMES.MODUL_PUBLISHED,
    },
  ]);

  const generatorSoal = computeFunnel(events, [
    {
      name: "Buka Generator Soal",
      match: (e) =>
        e.eventName === PRODUCT_EVENT_NAMES.QUESTION_GENERATOR_OPENED ||
        e.eventName === PRODUCT_EVENT_NAMES.QUESTION_GENERATION_STARTED,
    },
    {
      name: "Soal Selesai Digenerasi",
      match: (e) => e.eventName === PRODUCT_EVENT_NAMES.QUESTION_GENERATION_COMPLETED,
    },
    {
      name: "Paket Disimpan",
      match: (e) => e.eventName === PRODUCT_EVENT_NAMES.QUESTION_PACKAGE_SAVED,
    },
    {
      name: "Paket Diterbitkan",
      match: (e) => e.eventName === PRODUCT_EVENT_NAMES.QUESTION_PACKAGE_PUBLISHED,
    },
  ]);

  const penugasan = computeFunnel(events, [
    {
      name: "Tugas Dibuat",
      match: (e) => e.eventName === PRODUCT_EVENT_NAMES.ASSIGNMENT_CREATED,
    },
    {
      name: "Tugas Diterbitkan",
      match: (e) => e.eventName === PRODUCT_EVENT_NAMES.ASSIGNMENT_PUBLISHED,
    },
    {
      name: "Siswa Mulai Mengerjakan",
      match: (e) => e.eventName === PRODUCT_EVENT_NAMES.SUBMISSION_STARTED,
    },
    {
      name: "Siswa Mengumpulkan",
      match: (e) => e.eventName === PRODUCT_EVENT_NAMES.SUBMISSION_SUBMITTED,
    },
  ]);

  const penilaian = computeFunnel(events, [
    {
      name: "Buka Penilaian",
      match: (e) => e.eventName === PRODUCT_EVENT_NAMES.GRADING_OPENED,
    },
    {
      name: "Nilai Esai Disimpan",
      match: (e) => e.eventName === PRODUCT_EVENT_NAMES.ESSAY_GRADE_SAVED,
    },
    {
      name: "Penilaian Selesai",
      match: (e) => e.eventName === PRODUCT_EVENT_NAMES.GRADING_COMPLETED,
    },
    {
      name: "Siswa Melihat Hasil",
      match: (e) => e.eventName === PRODUCT_EVENT_NAMES.STUDENT_RESULT_OPENED,
    },
  ]);

  const presentation = computeFunnel(events, [
    {
      name: "Mulai Generasi Presentasi",
      match: (e) => e.eventName === PRODUCT_EVENT_NAMES.PRESENTATION_GENERATION_STARTED,
    },
    {
      name: "Guru Menyetujui Presentasi",
      match: (e) => e.eventName === PRODUCT_EVENT_NAMES.PRESENTATION_APPROVED,
    },
    {
      name: "Lolos Quality Gate",
      match: (e) => e.eventName === PRODUCT_EVENT_NAMES.PRESENTATION_QUALITY_PASSED,
    },
    {
      name: "Presentasi Diunduh (PPTX)",
      match: (e) => e.eventName === PRODUCT_EVENT_NAMES.PRESENTATION_DOWNLOADED,
    },
  ]);

  // 5. AI Reliability
  const aiSuccesses = events.filter((e) => e.eventName === PRODUCT_EVENT_NAMES.AI_GENERATION_SUCCESS).length;
  const aiFailures = events.filter((e) => e.eventName === PRODUCT_EVENT_NAMES.AI_GENERATION_FAILURE).length;
  const aiFailovers = events.filter((e) => e.eventName === PRODUCT_EVENT_NAMES.AI_PROVIDER_FAILOVER).length;
  const safetyBlocked = events.filter(
    (e) => e.metadata?.code === "AI_SAFETY_BLOCKED" || e.metadata?.safety_blocked === true,
  ).length;

  const totalGenerations = aiSuccesses + aiFailures;
  const successRate = totalGenerations > 0 ? Math.round((aiSuccesses / totalGenerations) * 100) : 100;

  let geminiCount = 0;
  let openAiCount = 0;
  const errorBreakdown: Record<string, number> = {};

  for (const e of events) {
    if (e.feature === "ai_core" || e.metadata?.provider) {
      const p = String(e.metadata?.provider || "").toLowerCase();
      if (p.includes("gemini")) geminiCount++;
      if (p.includes("openai")) openAiCount++;
    }
    if (e.eventName === PRODUCT_EVENT_NAMES.AI_GENERATION_FAILURE || e.metadata?.error_code) {
      const code = String(e.metadata?.error_code || e.metadata?.code || "AI_PROVIDER_ERROR");
      errorBreakdown[code] = (errorBreakdown[code] || 0) + 1;
    }
  }

  // 6. Feedback metrics
  const byCategory: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let unresolvedCount = 0;

  for (const fb of feedbacks) {
    byCategory[fb.category] = (byCategory[fb.category] || 0) + 1;
    byStatus[fb.status] = (byStatus[fb.status] || 0) + 1;
    if (fb.status === "new" || fb.status === "triaged" || fb.status === "in_progress") {
      unresolvedCount++;
    }
  }

  return {
    timeWindow: window,
    generatedAt: nowIso,
    adoption: {
      totalEvents: events.length,
      activeTeachers: uniqueTeachers.size,
      activeStudents: uniqueStudents.size,
      activeAdmins: uniqueAdmins.size,
      byRole,
    },
    featureUsage,
    funnels: {
      modulAjar,
      generatorSoal,
      penugasan,
      penilaian,
      presentation,
    },
    aiReliability: {
      totalGenerations,
      successRate,
      failoverCount: aiFailovers,
      safetyBlockedCount: safetyBlocked,
      providerBreakdown: {
        gemini: geminiCount,
        openai: openAiCount,
      },
      errorBreakdown,
    },
    feedback: {
      total: feedbacks.length,
      unresolvedCount,
      byCategory,
      byStatus,
      recent: feedbacks.slice(0, 5),
    },
  };
}

export function calculateAdoptionMetrics(events: any[]) {
  const uniqueTeachers = new Set<string>();
  const uniqueStudents = new Set<string>();
  const uniqueAdmins = new Set<string>();
  const byRole: Record<string, number> = { guru: 0, siswa: 0, admin: 0 };
  let totalModulesCreated = 0;
  let totalAssignmentsPublished = 0;
  let totalSubmissions = 0;

  for (const e of events) {
    const actorId = e.actorId || e.actor_id;
    const role = e.role || "umum";
    const eventName = e.eventName || e.event_name;

    if (role === "guru" && actorId) uniqueTeachers.add(actorId);
    if (role === "siswa" && actorId) uniqueStudents.add(actorId);
    if (role === "admin" && actorId) uniqueAdmins.add(actorId);

    byRole[role] = (byRole[role] || 0) + 1;

    if (eventName === "MODUL_PUBLISHED") totalModulesCreated++;
    if (eventName === "ASSIGNMENT_PUBLISHED") totalAssignmentsPublished++;
    if (eventName === "SUBMISSION_SUBMITTED") totalSubmissions++;
  }

  return {
    totalEvents: events.length,
    activeTeachers: uniqueTeachers.size,
    activeStudents: uniqueStudents.size,
    activeAdmins: uniqueAdmins.size,
    totalModulesCreated,
    totalAssignmentsPublished,
    totalSubmissions,
    byRole,
  };
}

export function calculateFunnelMetrics(events: any[]) {
  const getEventName = (e: any) => e.eventName || e.event_name;

  const modulStarts = events.filter((e) => getEventName(e) === "MODUL_OPENED").length;
  const modulCompletions = events.filter((e) => getEventName(e) === "MODUL_PUBLISHED").length;
  const modulRate = modulStarts > 0 ? Math.round((modulCompletions / modulStarts) * 100) : 0;

  const soalStarts = events.filter((e) => getEventName(e) === "QUESTION_GENERATOR_OPENED").length;
  const soalCompletions = events.filter((e) => getEventName(e) === "QUESTION_PACKAGE_PUBLISHED").length;
  const soalRate = soalStarts > 0 ? Math.round((soalCompletions / soalStarts) * 100) : 0;

  const tugasStarts = events.filter((e) => getEventName(e) === "ASSIGNMENT_CREATED").length;
  const tugasCompletions = events.filter((e) => getEventName(e) === "GRADING_COMPLETED").length;
  const tugasRate = tugasStarts > 0 ? Math.round((tugasCompletions / tugasStarts) * 100) : 0;

  const pptStarts = events.filter((e) => getEventName(e) === "PRESENTATION_QUALITY_PASSED").length;
  const pptCompletions = events.filter((e) => getEventName(e) === "PRESENTATION_DOWNLOADED").length;
  const pptRate = pptStarts > 0 ? Math.round((pptCompletions / pptStarts) * 100) : 0;

  return {
    modulAjar: { totalStarts: modulStarts, totalCompletions: modulCompletions, conversionRate: modulRate },
    generatorSoal: { totalStarts: soalStarts, totalCompletions: soalCompletions, conversionRate: soalRate },
    penugasanDanPenilaian: { totalStarts: tugasStarts, totalCompletions: tugasCompletions, conversionRate: tugasRate },
    presentation: { totalStarts: pptStarts, totalCompletions: pptCompletions, conversionRate: pptRate },
  };
}

export function calculateAiReliabilityMetrics(events: any[]) {
  const getEventName = (e: any) => e.eventName || e.event_name;
  const aiSuccesses = events.filter((e) => getEventName(e) === "AI_GENERATION_SUCCESS").length;
  const aiFailures = events.filter((e) => getEventName(e) === "AI_GENERATION_FAILURE").length;
  const aiFailovers = events.filter((e) => getEventName(e) === "AI_PROVIDER_FAILOVER").length;
  const safetyBlocked = events.filter((e) => getEventName(e) === "AI_SAFETY_BLOCKED").length;

  const totalCalls = aiSuccesses + aiFailures + aiFailovers + safetyBlocked;
  const successRate = totalCalls > 0 ? Math.round((aiSuccesses / totalCalls) * 100) : 100;

  return {
    totalCalls,
    successfulCalls: aiSuccesses,
    failoverCalls: aiFailovers,
    safetyBlockedCalls: safetyBlocked,
    successRate,
  };
}

export function calculateFeedbackSummary(feedbacks: any[]) {
  const byCategory: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let unresolvedCount = 0;

  for (const fb of feedbacks) {
    byCategory[fb.category] = (byCategory[fb.category] || 0) + 1;
    byStatus[fb.status] = (byStatus[fb.status] || 0) + 1;
    if (fb.status === "new" || fb.status === "triaged" || fb.status === "in_progress") {
      unresolvedCount++;
    }
  }

  return {
    total: feedbacks.length,
    unresolvedCount,
    byCategory,
    byStatus,
  };
}

export async function aggregateProductAnalytics(options?: { timeWindow?: AnalyticsTimeWindow }) {
  const window = options?.timeWindow || "last_7_days";
  const report = await getAggregatedProductMetrics(window);
  return {
    ...report,
    recentEvents: [] as any[],
  };
}

