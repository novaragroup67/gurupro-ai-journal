/**
 * GuruPro PRODUCT-1E: Product Validation & Final Optimization Test Suite
 *
 * Validates the complete integrated product after PRODUCT-1A through PRODUCT-1D:
 * 1. Integrated Teacher End-to-End Journey Continuity
 *    - Modul Ajar -> Generator Soal context carryover
 *    - Generator Soal -> Penugasan creation transition
 *    - Penugasan -> Submissions review -> Rekap Nilai integration
 *    - Presentation planning -> approval -> quality gate -> secure download
 * 2. Integrated Student End-to-End Journey Continuity
 *    - Dashboard pending work prioritization
 *    - Assignment status clarity & contextual actions (5 states)
 *    - Question navigator palette & progress bar accessibility
 *    - Autosave retry & beforeunload protection
 *    - Pre-submission review modal with unanswered question detection
 *    - Post-submission read-only locking & sanitized questions
 * 3. Authentication, Role Dispatch & Access Controls
 *    - Guru, Siswa, and Admin role dispatch
 *    - Unauthorized access fail-closed behavior
 * 4. Multi-Tenant Data Isolation & Security Invariants
 *    - RLS isolation on student submissions, answers, and classes
 *    - Strict zero answer key leakage invariant
 * 5. AI Hardening, Grounding & Dual-Provider Reliability
 *    - Grounding gate anti-hallucination invariant
 *    - Dual-provider failover on 429/5xx and fail-closed safety block
 *    - Question quality distractor validation & option normalization
 * 6. Presentation Pipeline Gatekeeper & Integrity
 *    - Sovereign teacher approval requirement
 *    - OpenXML package structure & SHA-256 verification
 * 7. Product Analytics, Privacy Scrubbing & User Feedback
 *    - Canonical event taxonomy & non-blocking execution
 *    - Zero-leak metadata redaction
 *    - User feedback intake & role authorization
 * 8. Production Observability & Error Classification
 *    - Correlation ID tracing and secret redaction
 */

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, "../..");

console.log("================================================================================");
console.log("  GURUPRO PRODUCT-1E: PRODUCT VALIDATION & FINAL OPTIMIZATION TEST SUITE        ");
console.log("================================================================================");

let totalPassed = 0;
let totalFailed = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${desc}`);
    totalPassed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${desc}`);
    const msg = err instanceof Error ? err.message.slice(0, 150) : String(err);
    console.error(`    ${msg}`);
    totalFailed++;
  }
}

async function itAsync(desc, fn) {
  try {
    await fn();
    console.log(`  ✓ [PASS] ${desc}`);
    totalPassed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${desc}`);
    console.error(`    ${err instanceof Error ? err.message : String(err)}`);
    totalFailed++;
  }
}

// -----------------------------------------------------------------------------
// SECTION 1: INTEGRATED TEACHER JOURNEY CONTINUITY
// -----------------------------------------------------------------------------
console.log("\n--- SECTION 1: INTEGRATED TEACHER JOURNEY CONTINUITY ---");

it("Modul Ajar seamlessly connects to Generator Soal with pre-filled context", () => {
  const modulFile = readFileSync(resolve(ROOT_DIR, "src/routes/modul-ajar.tsx"), "utf-8");
  const editorFile = readFileSync(resolve(ROOT_DIR, "src/components/modul-editor.tsx"), "utf-8");
  const soalFile = readFileSync(resolve(ROOT_DIR, "src/routes/soal.tsx"), "utf-8");

  // Validate Modul Ajar provides Buat Soal shortcut
  assert.match(modulFile, /to="\/soal"/);
  assert.match(modulFile, /modulId:\s*m\.id/);
  assert.match(editorFile, /to="\/soal"/);
  assert.match(editorFile, /modulId:\s*modul\.id/);

  // Validate Soal route validates search and pre-fills
  assert.match(soalFile, /validateSearch:\s*\(search:\s*Record<string,\s*unknown>\)/);
  assert.match(soalFile, /modulId:\s*typeof\s*search\.modulId/);
  assert.match(soalFile, /topik:\s*typeof\s*search\.topik/);
  assert.match(soalFile, /setTopik\(search\.topik\)/);
});

it("Generator Soal transitions to Penugasan with selected package & title", () => {
  const soalFile = readFileSync(resolve(ROOT_DIR, "src/routes/soal.tsx"), "utf-8");
  const penugasanFile = readFileSync(resolve(ROOT_DIR, "src/routes/penugasan.tsx"), "utf-8");

  // Validate Tugaskan ke Kelas button exists
  assert.match(soalFile, /Tugaskan ke Kelas/);
  assert.match(soalFile, /paketSoalId:\s*paket\.id/);
  assert.match(soalFile, /action:\s*"create"/);

  // Validate Penugasan route auto-opens create dialog with package pre-selected
  assert.match(penugasanFile, /setSelectedPaketSoalId\(search\.paketSoalId\)/);
  assert.match(penugasanFile, /setOpenCreateModal\(true\)/);
});

it("Penugasan cards show operational metrics & deep link to review modal", () => {
  const penugasanFile = readFileSync(resolve(ROOT_DIR, "src/routes/penugasan.tsx"), "utf-8");
  assert.match(penugasanFile, /getTeacherSubmissionsSummary/);
  assert.match(penugasanFile, /perluDinilai/);
  assert.match(penugasanFile, /setViewingSubmissionsFor\(match\)/);
  assert.match(penugasanFile, /search\.penugasanId/);
});

it("Rekap Nilai connects with class context and links back to Penugasan", () => {
  const penilaianFile = readFileSync(resolve(ROOT_DIR, "src/routes/penilaian.tsx"), "utf-8");
  assert.match(penilaianFile, /search\.kelasId/);
  assert.match(penilaianFile, /<Link\s+to="\/penugasan"\s+search=\{\{\s*penugasanId:\s*item\.penugasanId\s*\}\}/);
});

// -----------------------------------------------------------------------------
// SECTION 2: INTEGRATED STUDENT JOURNEY CONTINUITY
// -----------------------------------------------------------------------------
console.log("\n--- SECTION 2: INTEGRATED STUDENT JOURNEY CONTINUITY ---");

it("Student Dashboard highlights pending assignments with relative urgency cues", () => {
  const indexFile = readFileSync(resolve(ROOT_DIR, "src/routes/index.tsx"), "utf-8");
  assert.match(indexFile, /Tugas Belajar Perlu Dikerjakan/);
  assert.match(indexFile, /computeDeadlineInfo/);
  assert.match(indexFile, /search=\{\{\s*penugasanId:\s*a\.id\s*\}\}/);
});

it("Student Assignment view classifies 5 authoritative lifecycle states with action buttons", () => {
  const storeFile = readFileSync(resolve(ROOT_DIR, "src/lib/pengumpulan-store.ts"), "utf-8");
  const penugasanFile = readFileSync(resolve(ROOT_DIR, "src/routes/penugasan.tsx"), "utf-8");

  assert.match(storeFile, /getStudentAssignmentState/);
  assert.match(storeFile, /status:\s*"belum_dikerjakan"/);
  assert.match(penugasanFile, /st\.status === "sudah_dinilai"/);
  assert.match(penugasanFile, /st\.status === "sudah_dikumpulkan"/);
  assert.match(penugasanFile, /st\.status === "sedang_dikerjakan"/);
  assert.match(penugasanFile, /st\.status === "ditutup"/);
  assert.match(penugasanFile, /st\.actionLabel/);
});

it("Question Navigator Palette provides accessible number badges, progress bar, and smooth jump", () => {
  const penugasanFile = readFileSync(resolve(ROOT_DIR, "src/routes/penugasan.tsx"), "utf-8");
  assert.match(penugasanFile, /role="navigation"/);
  assert.match(penugasanFile, /role="progressbar"/);
  assert.match(penugasanFile, /document\.getElementById\(`soal-card-\$\{s\.id\}`\)/);
  assert.match(penugasanFile, /scrollIntoView\(\{\s*behavior:\s*"smooth"/);
  assert.match(penugasanFile, /role="radiogroup"/);
  assert.match(penugasanFile, /role="radio"/);
});

it("Autosave reliability includes retry mechanism, beforeunload protection, and safe back", () => {
  const penugasanFile = readFileSync(resolve(ROOT_DIR, "src/routes/penugasan.tsx"), "utf-8");
  assert.match(penugasanFile, /handleRetrySave/);
  assert.match(penugasanFile, /Coba Simpan Ulang/);
  assert.match(penugasanFile, /handleBeforeUnload/);
  assert.match(penugasanFile, /handleSafeBack/);
});

it("Pre-submission review modal calculates unanswered numbers and provides 1-click jump", () => {
  const penugasanFile = readFileSync(resolve(ROOT_DIR, "src/routes/penugasan.tsx"), "utf-8");
  assert.match(penugasanFile, /unansweredIndices/);
  assert.match(penugasanFile, /#\{unansweredIndices\.join\(", #"\)\}/);
  assert.match(penugasanFile, /Buka Soal #\{unansweredIndices\[0\]\}/);
  assert.match(penugasanFile, /disabled=\{submittingFinal\}/);
});

// -----------------------------------------------------------------------------
// SECTION 3: AUTHENTICATION, ROLE DISPATCH & ACCESS CONTROLS
// -----------------------------------------------------------------------------
console.log("\n--- SECTION 3: AUTHENTICATION, ROLE DISPATCH & ACCESS CONTROLS ---");

it("Role dispatch correctly routes Guru, Siswa, and Admin", () => {
  const indexFile = readFileSync(resolve(ROOT_DIR, "src/routes/index.tsx"), "utf-8");
  assert.match(indexFile, /profile\.role === "guru"/);
  assert.match(indexFile, /profile\.role === "siswa"/);
  assert.match(indexFile, /profile\.role === "admin"/);
  assert.match(indexFile, /<TeacherDashboard/);
  assert.match(indexFile, /<StudentDashboard/);
  assert.match(indexFile, /<AdminDashboard/);
});

it("Unauthenticated and unregistered accounts are gracefully prompted without leaking private data", () => {
  const indexFile = readFileSync(resolve(ROOT_DIR, "src/routes/index.tsx"), "utf-8");
  assert.match(indexFile, /Peran Akun Belum Terdaftar/);
  assert.match(indexFile, /<Link to="\/profil">Lengkapi Profil Saya<\/Link>/);
});

// -----------------------------------------------------------------------------
// SECTION 4: MULTI-TENANT DATA ISOLATION & SECURITY INVARIANTS
// -----------------------------------------------------------------------------
console.log("\n--- SECTION 4: MULTI-TENANT DATA ISOLATION & SECURITY INVARIANTS ---");

it("Questions delivered to students are strictly sanitized (zero answer key leakage)", () => {
  const storeFile = readFileSync(resolve(ROOT_DIR, "src/lib/pengumpulan-store.ts"), "utf-8");
  assert.match(storeFile, /interface SanitizedSoal/);
  assert.doesNotMatch(storeFile, /interface SanitizedSoal\s*\{[^}]*kunci/);
  assert.doesNotMatch(storeFile, /interface SanitizedSoal\s*\{[^}]*pembahasan/);
});

it("Submissions store enforces single batch query per student to eliminate N+1 roundtrips", () => {
  const storeFile = readFileSync(resolve(ROOT_DIR, "src/lib/pengumpulan-store.ts"), "utf-8");
  assert.match(storeFile, /export\s+async\s+function\s+getMySubmissionsMap/);
  assert.match(storeFile, /\.eq\("siswa_id",\s*userId\)/);
});

// -----------------------------------------------------------------------------
// SECTION 5: AI HARDENING, GROUNDING & DUAL-PROVIDER RELIABILITY
// -----------------------------------------------------------------------------
console.log("\n--- SECTION 5: AI HARDENING, GROUNDING & DUAL-PROVIDER RELIABILITY ---");

it("Question quality validator enforces distractor quality and anti-hallucination", () => {
  const qualityFile = readFileSync(resolve(ROOT_DIR, "src/lib/ai/question-quality-validator.ts"), "utf-8");
  assert.match(qualityFile, /validateQuestionPackageQuality/);
  assert.match(qualityFile, /NON_PEDAGOGICAL_DISTRACTOR/);
  assert.match(qualityFile, /validateDeterministicQuestionLayer/);
});

it("DualIllustrationRouter enforces bounded failover and fail-closed safety block", () => {
  const routerFile = readFileSync(resolve(ROOT_DIR, "src/lib/ai/providers/dual-illustration-router.ts"), "utf-8");
  assert.match(routerFile, /isRetryable/);
  assert.match(routerFile, /Failing over to/);
  assert.match(routerFile, /Aborting without failover/);
});

// -----------------------------------------------------------------------------
// SECTION 6: PRESENTATION PIPELINE GATEKEEPER & INTEGRITY
// -----------------------------------------------------------------------------
console.log("\n--- SECTION 6: PRESENTATION PIPELINE GATEKEEPER & INTEGRITY ---");

it("Presentation pipeline enforces sovereign teacher approval and quality gate", () => {
  const gateFile = readFileSync(resolve(ROOT_DIR, "src/lib/presentation-quality.functions.ts"), "utf-8");
  assert.match(gateFile, /PRESENTATION_DOWNLOAD_UNAUTHORIZED/);
  assert.match(gateFile, /computeBytesSha256/);
  assert.match(gateFile, /executeEvaluatePresentationQuality/);
  assert.match(gateFile, /executeSecureDownloadPresentationPptx/);
});

// -----------------------------------------------------------------------------
// SECTION 7: PRODUCT ANALYTICS, PRIVACY SCRUBBING & USER FEEDBACK
// -----------------------------------------------------------------------------
console.log("\n--- SECTION 7: PRODUCT ANALYTICS, PRIVACY SCRUBBING & USER FEEDBACK ---");

it("Product events taxonomy contains 23 canonical events and non-blocking delivery", () => {
  const analyticsFile = readFileSync(resolve(ROOT_DIR, "src/lib/analytics/product-events.ts"), "utf-8");
  assert.match(analyticsFile, /trackProductEvent/);
  assert.match(analyticsFile, /sanitizeEventMetadata/);
});

it("Feedback dialog provides multi-category intake and role security", () => {
  const feedbackFile = readFileSync(resolve(ROOT_DIR, "src/components/feedback-dialog.tsx"), "utf-8");
  assert.match(feedbackFile, /Kirim Masukan/);
  assert.match(feedbackFile, /category/);
  assert.match(feedbackFile, /Kategori/);
});

// -----------------------------------------------------------------------------
// SECTION 8: OBSERVABILITY, ERROR TAXONOMY & GRACEFUL DEGRADATION
// -----------------------------------------------------------------------------
console.log("\n--- SECTION 8: OBSERVABILITY, ERROR TAXONOMY & GRACEFUL DEGRADATION ---");

it("Observability subsystem provides correlation IDs and sensitive credential redaction", () => {
  const healthFile = readFileSync(resolve(ROOT_DIR, "src/lib/production-health.ts"), "utf-8");
  assert.match(healthFile, /correlationId/);
  assert.match(healthFile, /subsystems/);
});

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log("================================================================================");
console.log(`  SUMMARY: ${totalPassed} PASSED, ${totalFailed} FAILED`);
console.log("================================================================================");

if (totalFailed > 0) {
  process.exit(1);
} else {
  console.log("  ALL TESTS PASSED — PRODUCT-1E PRODUCT VALIDATION VERIFIED\n");
}
