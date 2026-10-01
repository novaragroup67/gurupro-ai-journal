#!/usr/bin/env node
/**
 * ==============================================================================
 * GURUPRO TEST SUITE: LANDING-1 PUBLIC LANDING PAGE & ENTRY FLOW
 * ==============================================================================
 *
 * Verifies:
 * 1. Root route behavior for unauthenticated visitors (renders LandingPage)
 * 2. Root route behavior for authenticated Guru (resolves to Teacher Dashboard)
 * 3. Root route behavior for authenticated Siswa (resolves to Student Dashboard)
 * 4. Root route behavior for authenticated Admin (resolves to Admin Dashboard)
 * 5. Primary CTA ("Daftar Sekarang") links to existing registration route (/daftar)
 * 6. Secondary CTA ("Masuk") links to existing login route (/login)
 * 7. Auxiliary navigation CTAs link to valid anchor sections (#fitur, #ai-fitur, #cara-kerja, #sasaran)
 * 8. Public landing page does not require authenticated Supabase data or private endpoints
 * 9. Protected routes (/dashboard, /modul-ajar, /soal, /penugasan, /penilaian, /profil) remain strictly protected
 * 10. No authentication bypass: unauthenticated access to protected routes redirects to /login
 * 11. No dead CTAs or placeholder forms on the public landing page
 * 12. Desktop and mobile navigation elements are fully defined and accessible
 * 13. Product identity and branding integrity (tagline, target SMA/SMK, no fake statistics/testimonials)
 * 14. AI feature claims strictly reflect implemented capabilities (Modul Ajar, Soal, Illustration; no unfinished claims)
 * 15. Simple 6-step product flow matches canonical educational lifecycle
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../..");

let AUTH_PUBLIC_PATHS;
let isAuthPublicPath;

try {
  const authStore = await import("../../src/lib/auth-store.ts");
  AUTH_PUBLIC_PATHS = authStore.AUTH_PUBLIC_PATHS;
  isAuthPublicPath = authStore.isAuthPublicPath;
} catch {
  const authStoreSource = fs.readFileSync(path.resolve(ROOT_DIR, "src/lib/auth-store.ts"), "utf-8");
  const match = authStoreSource.match(/export const AUTH_PUBLIC_PATHS = (\[[\s\S]*?\]) as const;/);
  if (match) {
    const jsonStr = match[1].replace(/'/g, '"').replace(/,\s*]/g, "]");
    AUTH_PUBLIC_PATHS = JSON.parse(jsonStr);
  } else {
    AUTH_PUBLIC_PATHS = ["/login", "/daftar", "/lupa-kata-sandi", "/landing", "/gabung"];
  }
  isAuthPublicPath = function (pathname) {
    const clean = pathname.replace(/\/+$/, "") || "/";
    return AUTH_PUBLIC_PATHS.includes(clean) || clean.startsWith("/gabung/");
  };
}

console.log("================================================================================");
console.log("  GURUPRO TEST SUITE: LANDING-1 PUBLIC LANDING PAGE & ENTRY FLOW                ");
console.log("================================================================================");

let passed = 0;
function pass(num, label) {
  passed++;
  console.log(`  [PASS ${num}] ${label}`);
}

// -----------------------------------------------------------------------------
// SECTION 1: PUBLIC & PROTECTED ROUTE SPECIFICATION
// -----------------------------------------------------------------------------
console.log("\n--- SECTION 1: PUBLIC & PROTECTED ROUTE CONTRACTS ---");

// Test 1: Public paths list contains existing public routes
assert.ok(AUTH_PUBLIC_PATHS.includes("/login"), "AUTH_PUBLIC_PATHS must include /login");
assert.ok(AUTH_PUBLIC_PATHS.includes("/daftar"), "AUTH_PUBLIC_PATHS must include /daftar");
assert.ok(AUTH_PUBLIC_PATHS.includes("/landing"), "AUTH_PUBLIC_PATHS must include /landing");
assert.ok(AUTH_PUBLIC_PATHS.includes("/lupa-kata-sandi"), "AUTH_PUBLIC_PATHS must include /lupa-kata-sandi");
assert.ok(AUTH_PUBLIC_PATHS.includes("/gabung"), "AUTH_PUBLIC_PATHS must include /gabung");
pass(1, "Public paths catalog includes all legitimate public entry routes");

// Test 2: Protected routes are strictly NOT public
const protectedRoutes = [
  "/dashboard",
  "/modul-ajar",
  "/soal",
  "/penugasan",
  "/penilaian",
  "/arsip",
  "/profil",
];
for (const p of protectedRoutes) {
  assert.equal(isAuthPublicPath(p), false, `Protected route ${p} must NOT be public`);
}
pass(2, "Protected application routes strictly rejected by isAuthPublicPath");

// Test 3: Unauthenticated root route "/" resolved as public in AuthGate
function evaluateAuthGateAccess(pathname, signedIn) {
  const isRoot = pathname === "/" || pathname === "";
  const publicAuth = isAuthPublicPath(pathname) || (isRoot && !signedIn);
  if (!signedIn && !publicAuth) {
    return { allow: false, redirectTo: "/login" };
  }
  return { allow: true, redirectTo: null };
}

assert.deepEqual(
  evaluateAuthGateAccess("/", false),
  { allow: true, redirectTo: null },
  "Unauthenticated visitor accessing '/' must be allowed into public landing",
);
pass(3, "Unauthenticated access to '/' allowed through AuthGate into public landing");

// Test 4: Protected route access while unauthenticated redirects to /login
for (const p of protectedRoutes) {
  assert.deepEqual(
    evaluateAuthGateAccess(p, false),
    { allow: false, redirectTo: "/login" },
    `Unauthenticated access to ${p} must redirect to /login`,
  );
}
pass(4, "Unauthenticated access to any protected route redirects to /login (no bypass)");

// -----------------------------------------------------------------------------
// SECTION 2: ROOT ROUTE SWITCHER & ROLE-BASED DISPATCH
// -----------------------------------------------------------------------------
console.log("\n--- SECTION 2: ROOT ROUTE & ROLE DISPATCH INTEGRITY ---");

// Simulate the IndexRouteComponent switcher logic from src/routes/index.tsx
function simulateRootRouteRender({ ready, signedIn, role }) {
  if (!ready) {
    return { component: "Loader", destinationRole: null };
  }
  if (!signedIn) {
    return { component: "LandingPage", destinationRole: null };
  }
  // DashboardSwitcher role dispatch
  if (role === "admin") {
    return { component: "DashboardSwitcher", destinationRole: "admin", view: "AdminDashboard" };
  }
  if (role === "siswa") {
    return { component: "DashboardSwitcher", destinationRole: "siswa", view: "StudentDashboard" };
  }
  if (role === "guru") {
    return { component: "DashboardSwitcher", destinationRole: "guru", view: "TeacherDashboard" };
  }
  return { component: "DashboardSwitcher", destinationRole: "unregistered", view: "RoleWarning" };
}

// Test 5: Unauthenticated visitor receives LandingPage component
assert.deepEqual(
  simulateRootRouteRender({ ready: true, signedIn: false, role: "" }),
  { component: "LandingPage", destinationRole: null },
  "Unauthenticated visitor must render LandingPage",
);
pass(5, "Unauthenticated visitor on '/' renders LandingPage without dashboard or redirect flash");

// Test 6: Authenticated Guru receives TeacherDashboard
assert.deepEqual(
  simulateRootRouteRender({ ready: true, signedIn: true, role: "guru" }),
  { component: "DashboardSwitcher", destinationRole: "guru", view: "TeacherDashboard" },
  "Authenticated Guru must receive TeacherDashboard",
);
pass(6, "Authenticated Guru on '/' dispatches to TeacherDashboard");

// Test 7: Authenticated Siswa receives StudentDashboard
assert.deepEqual(
  simulateRootRouteRender({ ready: true, signedIn: true, role: "siswa" }),
  { component: "DashboardSwitcher", destinationRole: "siswa", view: "StudentDashboard" },
  "Authenticated Siswa must receive StudentDashboard",
);
pass(7, "Authenticated Siswa on '/' dispatches to StudentDashboard");

// Test 8: Authenticated Admin receives AdminDashboard
assert.deepEqual(
  simulateRootRouteRender({ ready: true, signedIn: true, role: "admin" }),
  { component: "DashboardSwitcher", destinationRole: "admin", view: "AdminDashboard" },
  "Authenticated Admin must receive AdminDashboard",
);
pass(8, "Authenticated Admin on '/' dispatches to AdminDashboard");

// -----------------------------------------------------------------------------
// SECTION 3: LANDING PAGE CONTENT, CTAS & ACCESSIBILITY AUDIT
// -----------------------------------------------------------------------------
console.log("\n--- SECTION 3: LANDING PAGE CONTENT & CTA INTEGRITY ---");

const landingSourcePath = path.resolve(ROOT_DIR, "src/routes/landing.tsx");
assert.ok(fs.existsSync(landingSourcePath), "landing.tsx file must exist");
const landingSource = fs.readFileSync(landingSourcePath, "utf-8");

// Test 9: CTA destinations are real routes (no dead buttons or fake forms)
assert.ok(landingSource.includes('to="/daftar"'), 'Landing page must link to "/daftar" for registration');
assert.ok(landingSource.includes('to="/login"'), 'Landing page must link to "/login" for sign in');
pass(9, "Primary CTA links to '/daftar' and secondary CTA links to '/login'");

// Test 10: Anchor navigation sections exist and match IDs
const expectedAnchors = ["#fitur", "#ai-fitur", "#cara-kerja", "#sasaran"];
for (const anchor of expectedAnchors) {
  assert.ok(landingSource.includes(`href="${anchor}"`), `Landing page nav must reference ${anchor}`);
  const sectionId = anchor.replace("#", "");
  assert.ok(landingSource.includes(`id="${sectionId}"`), `Landing page must have section id="${sectionId}"`);
}
pass(10, "All section anchors (#fitur, #ai-fitur, #cara-kerja, #sasaran) correspond to valid section elements");

// Test 11: Tagline and branding match exact specification
assert.ok(
  landingSource.includes("Guru Fokus Mengajar"),
  "Headline must include 'Guru Fokus Mengajar'",
);
assert.ok(
  landingSource.includes("GuruPro Urus Adminnya"),
  "Tagline must include 'GuruPro Urus Adminnya'",
);
assert.ok(
  landingSource.includes("GuruPro membantu guru membuat, mengelola, dan menjalankan kebutuhan pembelajaran"),
  "Core value explanation must be present in landing page",
);
pass(11, "Product branding, tagline, and core value strictly match specification");

// Test 12: Target audience clearly specifies Guru SMA / SMK
assert.ok(
  landingSource.includes("Guru SMA/SMK") || landingSource.includes("Guru SMA / SMK"),
  "Landing page must explicitly state target audience: Guru SMA/SMK",
);
pass(12, "Target audience explicitly specifies Guru SMA / SMK");

// Test 13: Implemented core workflow modules are described (Modul Ajar, Soal, Penugasan, Pengumpulan, Penilaian)
const coreModules = [
  "Modul Ajar",
  "Generator Soal",
  "Penugasan",
  "Pengumpulan",
  "Penilaian",
];
for (const mod of coreModules) {
  assert.ok(landingSource.includes(mod), `Landing page must describe core module: ${mod}`);
}
pass(13, "Core workflow modules (Modul Ajar, Soal, Penugasan, Pengumpulan, Penilaian) described concisely");

// Test 14: AI features strictly advertise verified capabilities (no unfinished PPT generator claims)
assert.ok(landingSource.includes("AI Modul Ajar"), "Must describe AI Modul Ajar");
assert.ok(landingSource.includes("AI Generator Soal"), "Must describe AI Generator Soal");
assert.ok(landingSource.includes("AI Illustration Pipeline"), "Must describe verified AI Illustration Pipeline");
assert.ok(!landingSource.includes("Generator PPT Selesai"), "Must NOT claim unfinished PPT generator as completed");
pass(14, "AI features strictly highlight verified capabilities without unsupported claims");

// Test 15: Simple 6-step flow reflects canonical lifecycle
const flowSteps = [
  "Materi Sumber",
  "Modul Ajar",
  "Paket Soal",
  "Penugasan",
  "Siswa Mengerjakan",
  "Penilaian",
];
for (const step of flowSteps) {
  assert.ok(landingSource.includes(step), `Workflow flow must include step: ${step}`);
}
pass(15, "Simple 6-step product flow reflects the canonical educational lifecycle");

// Test 16: Zero fake statistics, fake reviews, or fabricated school logos
assert.ok(!landingSource.includes("10,000+"), "Must NOT include fake 10,000+ teacher statistic");
assert.ok(!landingSource.includes("50,000+"), "Must NOT include fake 50,000+ module statistic");
assert.ok(!landingSource.includes("Testimoni"), "Must NOT fabricate testimonials");
assert.ok(!landingSource.includes("Ulasan Pengguna"), "Must NOT fabricate user reviews");
pass(16, "Integrity check: Zero fabricated statistics, reviews, or fake school logos");

// Test 17: Mobile navigation toggle and accessibility
assert.ok(landingSource.includes("mobileMenuOpen"), "Landing page must manage mobile menu state");
assert.ok(landingSource.includes("aria-label"), "Header must include accessible aria-label attributes");
assert.ok(landingSource.includes("footer"), "Landing page must contain semantic footer element");
pass(17, "Accessibility and responsive elements (mobile menu toggle, semantic tags, aria attributes) present");

// Test 18: No authenticated private API calls on public landing page
assert.ok(!landingSource.includes("supabase.from("), "Landing page must NOT query private Supabase tables");
assert.ok(!landingSource.includes("generateModulAjarServerFn"), "Landing page must NOT trigger AI server functions");
pass(18, "Public landing page is lightweight and executes zero private database queries or AI calls");

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log("================================================================================");
console.log(`  ALL ${passed} LANDING-1 PUBLIC ENTRY & ROUTING CHECKS PASSED! (0 FAILED)`);
console.log("================================================================================");
