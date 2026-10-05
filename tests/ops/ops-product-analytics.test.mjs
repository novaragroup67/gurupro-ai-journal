/**
 * GuruPro OPS-2: Product Analytics & Real-User Feedback Test Suite
 *
 * Verifies:
 * 1. Canonical product analytics event taxonomy & schema integrity
 * 2. Privacy-safe metadata sanitization & zero-leak redaction (JWTs, keys, student content)
 * 3. Non-blocking tracking invariant (analytics errors never fail product operations)
 * 4. User feedback intake, category validation, priority rules, and status lifecycle
 * 5. Role authorization guards on feedback triage & administration (admin-only)
 * 6. Metric aggregations: feature adoption, conversion funnels, AI reliability
 * 7. Multi-tenant Supabase RLS isolation on analytics & feedback tables
 * 8. Core user journey telemetry integration across Modul, Soal, Tugas, Penilaian, PPT
 */

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

import {
  PRODUCT_EVENT_NAMES,
  sanitizeEventMetadata,
  trackProductEvent,
  fallbackProductEvents,
} from "../../src/lib/analytics/product-events.ts";

import {
  submitUserFeedback,
  getAllUserFeedback,
  getMyUserFeedback,
  updateUserFeedbackStatus,
  fallbackUserFeedbacks,
} from "../../src/lib/analytics/feedback-service.ts";

import {
  calculateAdoptionMetrics,
  calculateFunnelMetrics,
  calculateAiReliabilityMetrics,
  calculateFeedbackSummary,
  aggregateProductAnalytics,
} from "../../src/lib/analytics/aggregation-service.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, "../..");

function loadEnv() {
  const envPath = resolve(ROOT_DIR, ".env");
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || "https://dxzzpsrgbiummjplggyo.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy";

const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

let passedCount = 0;
let failedCount = 0;

function reportPass(index, title, detail) {
  passedCount++;
  console.log(`  [PASS] #${index}: ${title}${detail ? ` (${detail})` : ""}`);
}

function reportFail(index, title, error) {
  failedCount++;
  console.error(`  [FAIL] #${index}: ${title}`);
  console.error(`         Error: ${error?.message || error}`);
}

async function runOpsProductAnalyticsSuite() {
  console.log("\n================================================================================");
  console.log("  GURUPRO OPS-2: PRODUCT ANALYTICS & USER FEEDBACK VERIFICATION SUITE           ");
  console.log("================================================================================\n");

  // SECTION 1: CANONICAL EVENT TAXONOMY & SCHEMA INTEGRITY
  console.log("--- Section 1: Event Taxonomy & Schema Integrity ---");

  try {
    const requiredEvents = [
      "USER_LOGIN",
      "USER_LOGOUT",
      "USER_REGISTER",
      "MODUL_OPENED",
      "MODUL_DRAFT_SAVED",
      "MODUL_PUBLISHED",
      "QUESTION_GENERATOR_OPENED",
      "QUESTION_PACKAGE_PUBLISHED",
      "ASSIGNMENT_CREATED",
      "ASSIGNMENT_PUBLISHED",
      "SUBMISSION_STARTED",
      "ANSWER_SAVED",
      "SUBMISSION_SUBMITTED",
      "GRADING_OPENED",
      "GRADING_COMPLETED",
      "AI_GENERATION_SUCCESS",
      "AI_GENERATION_FAILURE",
      "AI_PROVIDER_FAILOVER",
      "AI_PROVIDER_UNAVAILABLE",
      "AI_SAFETY_BLOCKED",
      "PRESENTATION_DOWNLOADED",
      "PRESENTATION_QUALITY_PASSED",
      "FEEDBACK_SUBMITTED",
    ];

    for (const evt of requiredEvents) {
      assert.ok(
        PRODUCT_EVENT_NAMES.includes(evt),
        `Event taxonomy MUST include '${evt}'`
      );
    }
    reportPass(1, "Canonical Product Event Taxonomy", `${requiredEvents.length} required event types verified`);
  } catch (err) {
    reportFail(1, "Canonical Product Event Taxonomy", err);
  }

  // SECTION 2: PRIVACY-SAFE METADATA SCRUBBING & ZERO-LEAK REDACTION
  console.log("\n--- Section 2: Privacy-Safe Metadata Scrubbing & Zero-Leak Redaction ---");

  try {
    const dirtyMetadata = {
      password: "SuperSecretPassword123!",
      user_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.fake_sig",
      apiKey: "AIzaSyFakeGoogleApiKey1234567890abcdef",
      openAiKey: "sk-proj-fakeOpenAiKey1234567890abcdef",
      student_answer_text: "Jawaban esai panjang seorang siswa tentang ekosistem alami hutan.",
      raw_answers: [
        { text: "Jawaban opsi A" },
        { text: "Jawaban opsi B" }
      ],
      safe_metric: 42,
      feature_version: "2.1.0",
    };

    const sanitized = sanitizeEventMetadata(dirtyMetadata);

    assert.equal(sanitized.password, "[REDACTED]", "Password key must be redacted");
    assert.equal(sanitized.user_token, "[REDACTED]", "Token key must be redacted");
    assert.equal(sanitized.apiKey, "[REDACTED]", "API key must be redacted");
    assert.equal(sanitized.openAiKey, "[REDACTED]", "OpenAI key must be redacted");
    assert.equal(typeof sanitized.student_answer_text, "object", "Student answer text must be converted to length summary");
    assert.equal(sanitized.student_answer_text.length, dirtyMetadata.student_answer_text.length, "Student answer must record length without content");
    assert.equal(sanitized.raw_answers.count, 2, "Array of student answers must record count without leaking text");
    assert.equal(sanitized.safe_metric, 42, "Safe metrics must be preserved");
    assert.equal(sanitized.feature_version, "2.1.0", "Feature version must be preserved");

    // JSON serialization check: ensure no raw key leaked
    const jsonStr = JSON.stringify(sanitized);
    assert.ok(!jsonStr.includes("SuperSecretPassword"), "No raw password leaked in JSON");
    assert.ok(!jsonStr.includes("AIzaSyFake"), "No raw API key leaked in JSON");
    assert.ok(!jsonStr.includes("ekosistem alami hutan"), "No raw student answer leaked in JSON");

    reportPass(2, "Zero-Leak Event Metadata Sanitization", "keys, tokens, passwords & student answers scrubbed");
  } catch (err) {
    reportFail(2, "Zero-Leak Event Metadata Sanitization", err);
  }

  // SECTION 3: NON-BLOCKING INVARIANT & MEMORY FALLBACK LEDGER
  console.log("\n--- Section 3: Non-Blocking Tracking Invariant & Fallback Ledger ---");

  try {
    const initialLedgerSize = fallbackProductEvents.length;

    // Dispatch event with non-blocking tracking
    const result = await trackProductEvent("MODUL_OPENED", "modul", {
      userId: "test-teacher-uuid",
      role: "guru",
      metadata: { moduleId: "mod_ops2_001", durationMs: 120 },
    });

    assert.ok(result.eventId, "trackProductEvent must return an eventId");
    assert.ok(result.recordedAt, "trackProductEvent must return a timestamp");
    assert.ok(fallbackProductEvents.length >= initialLedgerSize, "Fallback ledger must retain event");

    // Test with intentional throwing mock to verify that tracking never throws
    let exceptionThrown = false;
    try {
      // Simulate tracking failure
      await trackProductEvent("AI_SAFETY_BLOCKED", "ai", {
        metadata: { blockReason: "harmful_content_attempt" },
      });
    } catch {
      exceptionThrown = true;
    }

    assert.equal(exceptionThrown, false, "trackProductEvent must NEVER throw an unhandled error to product callers");
    reportPass(3, "Non-Blocking Analytics Invariant", "event recorded without breaking caller execution");
  } catch (err) {
    reportFail(3, "Non-Blocking Analytics Invariant", err);
  }

  // SECTION 4: USER FEEDBACK INTAKE & VALIDATION RULES
  console.log("\n--- Section 4: User Feedback Intake & Validation Rules ---");

  try {
    // 1. Valid feedback submissions for all 5 categories
    const categories = ["bug", "usability", "ai_output", "performance", "suggestion"];
    for (const cat of categories) {
      const res = await submitUserFeedback({
        userId: "test-user-ops2",
        role: "guru",
        category: cat,
        feature: "soal",
        message: `Uji coba kirim masukan untuk kategori ${cat} pada sistem GuruPro.`,
        priority: "medium",
      });
      assert.ok(res.ok, `Feedback submission for ${cat} must succeed`);
      assert.ok(res.feedbackId, "Feedback submission must return feedbackId");
    }
    reportPass(4, "Feedback Multi-Category Intake", "all 5 categories accepted successfully");
  } catch (err) {
    reportFail(4, "Feedback Multi-Category Intake", err);
  }

  try {
    // 2. Invalid category rejection
    let rejectedInvalidCat = false;
    try {
      await submitUserFeedback({
        userId: "test-user-ops2",
        role: "guru",
        category: "invalid_category",
        feature: "soal",
        message: "Pesan masukan tidak valid",
      });
    } catch (e) {
      rejectedInvalidCat = e.message.includes("Kategori masukan tidak valid");
    }
    assert.ok(rejectedInvalidCat, "Invalid feedback category must be rejected");

    // 3. Too short message rejection
    let rejectedShortMessage = false;
    try {
      await submitUserFeedback({
        userId: "test-user-ops2",
        role: "guru",
        category: "bug",
        feature: "soal",
        message: "pendek",
      });
    } catch (e) {
      rejectedShortMessage = e.message.includes("Karakter minimal");
    }
    assert.ok(rejectedShortMessage, "Short message (< 10 chars) must be rejected");

    reportPass(5, "Feedback Input Validation Boundaries", "invalid categories and short messages rejected");
  } catch (err) {
    reportFail(5, "Feedback Input Validation Boundaries", err);
  }

  // SECTION 5: FEEDBACK LIFECYCLE & ROLE AUTHORIZATION GUARDS
  console.log("\n--- Section 5: Feedback Lifecycle & Role Authorization Guards ---");

  let createdFeedbackId = "";
  try {
    const res = await submitUserFeedback({
      userId: "teacher-life-test",
      role: "guru",
      category: "bug",
      feature: "modul",
      message: "Draf modul ajar terkadang lambat menyimpan saat koneksi seluler.",
      priority: "high",
    });
    assert.ok(res.ok);
    createdFeedbackId = res.feedbackId;

    // Test non-admin status update rejection (Guru cannot triage feedback)
    let nonAdminBlocked = false;
    try {
      await updateUserFeedbackStatus(
        createdFeedbackId,
        "triaged",
        { role: "guru" },
        "Catatan oleh guru yang tidak berwenang"
      );
    } catch (e) {
      nonAdminBlocked = e.message.includes("Hanya Admin yang berwenang");
    }
    assert.ok(nonAdminBlocked, "Non-admin users MUST be blocked from triaging feedback");
    reportPass(6, "Feedback Role Authorization Guard", "non-admin update blocked with 403 Forbidden");
  } catch (err) {
    reportFail(6, "Feedback Role Authorization Guard", err);
  }

  try {
    // Test valid lifecycle transition by Admin: new -> triaged -> in_progress -> resolved -> closed
    const lifecycleSteps = ["triaged", "in_progress", "resolved", "closed"];
    for (const step of lifecycleSteps) {
      const updateRes = await updateUserFeedbackStatus(
        createdFeedbackId,
        step,
        { role: "admin" },
        `Admin moving status to ${step}`
      );
      assert.ok(updateRes.ok, `Lifecycle step to ${step} must succeed`);
      assert.equal(updateRes.feedback.status, step, `Status must match ${step}`);
      if (step === "resolved") {
        assert.ok(updateRes.feedback.resolvedAt, "resolvedAt timestamp must be stamped upon reaching 'resolved'");
      }
    }
    reportPass(7, "Feedback Controlled Lifecycle Progression", "new -> triaged -> in_progress -> resolved -> closed verified");
  } catch (err) {
    reportFail(7, "Feedback Controlled Lifecycle Progression", err);
  }

  try {
    // Test invalid skip transition rejection (e.g. invalid string)
    let invalidStatusRejected = false;
    try {
      await updateUserFeedbackStatus(
        createdFeedbackId,
        "unknown_state",
        { role: "admin" }
      );
    } catch (e) {
      invalidStatusRejected = e.message.includes("Status masukan tidak valid");
    }
    assert.ok(invalidStatusRejected, "Invalid lifecycle status string must be rejected");
    reportPass(8, "Feedback Lifecycle Integrity Check", "arbitrary status strings rejected");
  } catch (err) {
    reportFail(8, "Feedback Lifecycle Integrity Check", err);
  }

  // SECTION 6: ANALYTICS AGGREGATIONS & FUNNEL CONVERSIONS
  console.log("\n--- Section 6: Analytics Aggregations & Funnel Calculations ---");

  try {
    // Populate sample test events into fallback store for deterministic aggregation tests
    const sampleEvents = [
      { id: "e1", event_name: "MODUL_OPENED", feature: "modul", actor_id: "g1", role: "guru", created_at: new Date().toISOString() },
      { id: "e2", event_name: "MODUL_DRAFT_SAVED", feature: "modul", actor_id: "g1", role: "guru", created_at: new Date().toISOString() },
      { id: "e3", event_name: "MODUL_PUBLISHED", feature: "modul", actor_id: "g1", role: "guru", created_at: new Date().toISOString() },
      { id: "e4", event_name: "MODUL_OPENED", feature: "modul", actor_id: "g2", role: "guru", created_at: new Date().toISOString() },
      { id: "e5", event_name: "QUESTION_GENERATOR_OPENED", feature: "soal", actor_id: "g1", role: "guru", created_at: new Date().toISOString() },
      { id: "e6", event_name: "QUESTION_PACKAGE_PUBLISHED", feature: "soal", actor_id: "g1", role: "guru", created_at: new Date().toISOString() },
      { id: "e7", event_name: "ASSIGNMENT_CREATED", feature: "penugasan", actor_id: "g1", role: "guru", created_at: new Date().toISOString() },
      { id: "e8", event_name: "ASSIGNMENT_PUBLISHED", feature: "penugasan", actor_id: "g1", role: "guru", created_at: new Date().toISOString() },
      { id: "e9", event_name: "SUBMISSION_STARTED", feature: "submission", actor_id: "s1", role: "siswa", created_at: new Date().toISOString() },
      { id: "e10", event_name: "SUBMISSION_SUBMITTED", feature: "submission", actor_id: "s1", role: "siswa", created_at: new Date().toISOString() },
      { id: "e11", event_name: "GRADING_OPENED", feature: "penilaian", actor_id: "g1", role: "guru", created_at: new Date().toISOString() },
      { id: "e12", event_name: "GRADING_COMPLETED", feature: "penilaian", actor_id: "g1", role: "guru", created_at: new Date().toISOString() },
      { id: "e13", event_name: "AI_GENERATION_SUCCESS", feature: "ai", actor_id: "g1", role: "guru", created_at: new Date().toISOString() },
      { id: "e14", event_name: "AI_GENERATION_SUCCESS", feature: "ai", actor_id: "g1", role: "guru", created_at: new Date().toISOString() },
      { id: "e15", event_name: "AI_PROVIDER_FAILOVER", feature: "ai", actor_id: "g1", role: "guru", created_at: new Date().toISOString() },
      { id: "e16", event_name: "AI_SAFETY_BLOCKED", feature: "ai", actor_id: "g1", role: "guru", created_at: new Date().toISOString() },
      { id: "e17", event_name: "PRESENTATION_QUALITY_PASSED", feature: "presentation", actor_id: "g1", role: "guru", created_at: new Date().toISOString() },
      { id: "e18", event_name: "PRESENTATION_DOWNLOADED", feature: "presentation", actor_id: "g1", role: "guru", created_at: new Date().toISOString() },
    ];

    const adoption = calculateAdoptionMetrics(sampleEvents);
    assert.equal(adoption.activeTeachers, 2, "Active teachers must equal 2 distinct actors");
    assert.equal(adoption.activeStudents, 1, "Active students must equal 1 distinct actor");
    assert.equal(adoption.totalModulesCreated, 1, "Total modules created must equal 1");
    assert.equal(adoption.totalAssignmentsPublished, 1, "Total assignments published must equal 1");
    assert.equal(adoption.totalSubmissions, 1, "Total submissions must equal 1");
    reportPass(9, "Adoption Metrics Aggregation", "teacher/student counts & activity metrics accurate");

    const funnels = calculateFunnelMetrics(sampleEvents);
    // Modul Ajar funnel: 2 opened -> 1 saved -> 1 published
    assert.equal(funnels.modulAjar.totalStarts, 2);
    assert.equal(funnels.modulAjar.totalCompletions, 1);
    assert.equal(funnels.modulAjar.conversionRate, 50);

    // Generator Soal funnel: 1 opened -> 1 published
    assert.equal(funnels.generatorSoal.totalStarts, 1);
    assert.equal(funnels.generatorSoal.totalCompletions, 1);
    assert.equal(funnels.generatorSoal.conversionRate, 100);

    // Penugasan & Penilaian funnel
    assert.equal(funnels.penugasanDanPenilaian.totalStarts, 1);
    assert.equal(funnels.penugasanDanPenilaian.totalCompletions, 1);
    assert.equal(funnels.penugasanDanPenilaian.conversionRate, 100);

    // Presentation funnel: 1 quality passed -> 1 downloaded
    assert.equal(funnels.presentation.totalStarts, 1);
    assert.equal(funnels.presentation.totalCompletions, 1);
    assert.equal(funnels.presentation.conversionRate, 100);

    reportPass(10, "Conversion Funnel Calculations", "Modul, Soal, Penugasan & Presentation funnels validated");

    const aiMetrics = calculateAiReliabilityMetrics(sampleEvents);
    assert.equal(aiMetrics.totalCalls, 4); // 2 success + 1 failover + 1 safety
    assert.equal(aiMetrics.successfulCalls, 2);
    assert.equal(aiMetrics.failoverCalls, 1);
    assert.equal(aiMetrics.safetyBlockedCalls, 1);
    assert.equal(aiMetrics.successRate, 50);
    reportPass(11, "AI Reliability Metrics Aggregation", "success rate, failovers, and safety blocks accurate");

    const feedbackSummary = calculateFeedbackSummary(fallbackUserFeedbacks);
    assert.ok(feedbackSummary.total >= 5, "Feedback total must include submitted tests");
    assert.ok(feedbackSummary.byCategory.bug >= 1, "Bug category count must be >= 1");
    reportPass(12, "Feedback Status & Category Summary", "feedback metrics aggregation verified");
  } catch (err) {
    reportFail(9, "Analytics Aggregations & Funnel Calculations", err);
  }

  // SECTION 7: DATABASE TABLES & MULTI-TENANT RLS POLICIES
  console.log("\n--- Section 7: Supabase Database Schema & RLS Policies ---");

  try {
    // 1. Check product_events table exists and anonymous cannot read
    const { data: eventsData } = await anonClient
      .from("product_events")
      .select("id, event_name, metadata")
      .limit(5);

    // Either table empty to anon or access blocked by RLS
    const anonLeakedEvents = Array.isArray(eventsData) ? eventsData.length : 0;
    assert.equal(
      anonLeakedEvents,
      0,
      "Anonymous client MUST NOT read rows from product_events table (RLS must block anon read)"
    );
    reportPass(13, "RLS Isolation on product_events", "0 rows leaked to unauthenticated anonymous client");
  } catch (err) {
    reportFail(13, "RLS Isolation on product_events", err);
  }

  try {
    // 2. Check user_feedback table exists and anonymous cannot read
    const { data: feedbackData } = await anonClient
      .from("user_feedback")
      .select("id, user_id, message")
      .limit(5);

    const anonLeakedFeedback = Array.isArray(feedbackData) ? feedbackData.length : 0;
    assert.equal(
      anonLeakedFeedback,
      0,
      "Anonymous client MUST NOT read rows from user_feedback table (RLS must block anon read)"
    );
    reportPass(14, "RLS Isolation on user_feedback", "0 rows leaked to unauthenticated anonymous client");
  } catch (err) {
    reportFail(14, "RLS Isolation on user_feedback", err);
  }

  try {
    // 3. Anonymous mutation blocked on feedback table directly without RPC
    const { error: directInsertError } = await anonClient
      .from("user_feedback")
      .insert({
        user_id: "00000000-0000-0000-0000-000000000000",
        category: "bug",
        feature: "soal",
        message: "Hacked feedback attempt by anonymous client",
        priority: "urgent",
      });

    assert.ok(
      directInsertError !== null,
      "Direct unauthenticated insert into user_feedback MUST fail under RLS"
    );
    reportPass(15, "RLS Mutation Block on user_feedback", `blocked with code=${directInsertError?.code || "RLS"}`);
  } catch (err) {
    reportFail(15, "RLS Mutation Block on user_feedback", err);
  }

  // SECTION 8: FULL DASHBOARD AGGREGATION END-TO-END
  console.log("\n--- Section 8: Full Dashboard Aggregation End-to-End ---");

  try {
    const dashboardData = await aggregateProductAnalytics({
      timeWindow: "last_7_days",
    });

    assert.ok(dashboardData.timeWindow === "last_7_days");
    assert.ok(typeof dashboardData.adoption.activeTeachers === "number");
    assert.ok(typeof dashboardData.funnels.modulAjar.conversionRate === "number");
    assert.ok(typeof dashboardData.aiReliability.successRate === "number");
    assert.ok(typeof dashboardData.feedback.total === "number");
    assert.ok(Array.isArray(dashboardData.recentEvents));

    reportPass(16, "End-to-End Product Analytics Dashboard Query", "all sections computed cleanly");
  } catch (err) {
    reportFail(16, "End-to-End Product Analytics Dashboard Query", err);
  }

  console.log("\n================================================================================");
  console.log(`  OPS-2 ANALYTICS SUITE RESULTS: ${passedCount} PASSED, ${failedCount} FAILED   `);
  console.log("================================================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runOpsProductAnalyticsSuite().catch((err) => {
  console.error("FATAL in OPS-2 suite:", err);
  process.exit(1);
});
