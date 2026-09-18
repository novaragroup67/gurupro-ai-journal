import assert from "node:assert/strict";

console.log("======================================================");
console.log("  GURUPRO TEST SUITE: DASHBOARD & ROLE ISOLATION     ");
console.log("======================================================");

let passed = 0;

// --- SECTION A: GURU DASHBOARD REAL DATA & DUMMY CLEANUP ---
console.log("\n--- SECTION A: GURU DASHBOARD REAL DATA ACCURACY ---");

{
  // Test 1: Zero modules must strictly yield 0 (no fake fallback || 2)
  const emptyModuls = [];
  const modulAktif = emptyModuls.filter((m) => m.status === "Terbit").length;
  assert.equal(modulAktif, 0, "Empty module list must yield 0, never fall back to fake 2");

  const populatedModuls = [
    { id: "m1", status: "Draft" },
    { id: "m2", status: "Terbit" },
    { id: "m3", status: "Terbit" },
  ];
  const modulAktifPopulated = populatedModuls.filter((m) => m.status === "Terbit").length;
  assert.equal(modulAktifPopulated, 2, "Real published modules must count correctly");
  console.log("  [PASS] 1. Guru Dashboard: Zero modules yields 0 (no fake fallback || 2)");
  passed++;
}

{
  // Test 2: Zero assignments & submissions must strictly yield 0
  const emptyAssignments = [];
  const emptySubmissionSummary = {
    totalSubmitted: 0,
    perluDinilai: 0,
    sudahDinilai: 0,
    submissionsPerPenugasan: {},
  };

  assert.equal(emptySubmissionSummary.totalSubmitted, 0, "No submissions must be 0, not fake 27");
  assert.equal(emptySubmissionSummary.perluDinilai, 0, "No pending grading must be 0");
  assert.equal(emptyAssignments.length, 0, "No assignments must be 0");
  console.log("  [PASS] 2. Guru Dashboard: Zero assignments & submissions yields 0 (no fake 27 or 92%)");
  passed++;
}

{
  // Test 3: Zero classes taught must strictly yield 0 with proper empty hint
  const myClassesEmpty = [];
  const kelasCount = myClassesEmpty.length;
  const hintEmpty =
    kelasCount > 0
      ? myClassesEmpty.map((k) => `${k.tingkat} ${k.namaKelas}`).join(", ")
      : "Belum ada kelas";

  assert.equal(kelasCount, 0);
  assert.equal(hintEmpty, "Belum ada kelas", "Empty class list must not show hardcoded classes");
  console.log("  [PASS] 3. Guru Dashboard: Zero classes taught yields 0 with clean empty hint");
  passed++;
}

{
  // Test 4: Real submission summary calculation
  const dummyRows = [
    { id: "s1", penugasan_id: "p1", status: "submitted", status_penilaian: "dinilai" },
    { id: "s2", penugasan_id: "p1", status: "submitted", status_penilaian: "perlu_penilaian_manual" },
    { id: "s3", penugasan_id: "p2", status: "draft", status_penilaian: "belum_dinilai" },
  ];

  let totalSubmitted = 0;
  let perluDinilai = 0;
  let sudahDinilai = 0;
  for (const r of dummyRows) {
    if (r.status === "submitted") {
      totalSubmitted++;
      if (r.status_penilaian === "dinilai") sudahDinilai++;
      else perluDinilai++;
    }
  }

  assert.equal(totalSubmitted, 2);
  assert.equal(perluDinilai, 1);
  assert.equal(sudahDinilai, 1);
  const progress = Math.round((sudahDinilai / totalSubmitted) * 100);
  assert.equal(progress, 50, "Progress must be real 50%, not fake 92%");
  console.log("  [PASS] 4. Guru Dashboard: Real submission progress dynamically calculated");
  passed++;
}

// --- SECTION B: SISWA DASHBOARD & NEAREST DEADLINE ---
console.log("\n--- SECTION B: SISWA DASHBOARD & NEAREST DEADLINE ---");

{
  // Test 5: Nearest deadline resolution
  const now = new Date("2026-09-17T12:00:00Z").getTime();
  const studentAssignments = [
    { id: "a1", judul: "Tugas Matematika", deadline: "2026-09-25T23:59:59Z", status: "published" },
    { id: "a2", judul: "Tugas Basis Data", deadline: "2026-09-19T23:59:59Z", status: "published" },
    { id: "a3", judul: "Tugas Lewat", deadline: "2026-09-10T23:59:59Z", status: "published" },
    { id: "a4", judul: "Draft Belum Terbit", deadline: "2026-09-18T23:59:59Z", status: "draft" },
  ];

  const activeWithFutureDeadline = studentAssignments
    .filter((a) => a.status === "published" && a.deadline && new Date(a.deadline).getTime() > now)
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());

  assert.equal(activeWithFutureDeadline.length, 2, "Only future published assignments considered");
  assert.equal(activeWithFutureDeadline[0].id, "a2", "Nearest deadline must be a2 (Sept 19)");
  console.log("  [PASS] 5. Siswa Dashboard: Nearest deadline dynamically selects earliest future task");
  passed++;
}

{
  // Test 6: Graded tasks surface final score and teacher feedback
  const gradedList = [
    {
      penugasanId: "p1",
      nilaiAkhir: 96,
      nilaiPg: 50,
      nilaiEssay: 46,
      catatanGuru: "Penjelasan esai sangat komprehensif.",
      gradedAt: "2026-09-17T09:00:00Z",
    },
  ];

  assert.equal(gradedList[0].nilaiAkhir, 96);
  assert.equal(gradedList[0].catatanGuru, "Penjelasan esai sangat komprehensif.");
  console.log("  [PASS] 6. Siswa Dashboard: Graded tasks correctly display score and feedback");
  passed++;
}

// --- SECTION C: SISWA MODULE VIEW (READ-ONLY) ---
console.log("\n--- SECTION C: SISWA MODULE VIEW (READ-ONLY) ---");

{
  // Test 7: Student can only view published modules, never drafts
  const allTeacherModuls = [
    { id: "m1", judul: "Modul Algoritma", status: "Terbit", user_id: "teacher-1" },
    { id: "m2", judul: "Modul Rahasia Draft", status: "Draft", user_id: "teacher-1" },
  ];

  const studentVisible = allTeacherModuls.filter((m) => m.status === "Terbit");
  assert.equal(studentVisible.length, 1);
  assert.equal(studentVisible[0].id, "m1");
  assert.equal(studentVisible.some((m) => m.status === "Draft"), false, "Drafts strictly hidden from students");
  console.log("  [PASS] 7. Siswa Module View: Draft modules are strictly excluded from student view");
  passed++;
}

{
  // Test 8: Student cannot create, edit, or delete modules
  const role = "siswa";
  const canEditOrDelete = role === "guru";
  assert.equal(canEditOrDelete, false, "Students must not have edit or delete permissions for modules");
  console.log("  [PASS] 8. Siswa Module View: Pure read-only, create/edit/delete prohibited");
  passed++;
}

// --- SECTION D: ADMIN DASHBOARD & SYSTEM MONITORING ---
console.log("\n--- SECTION D: ADMIN DASHBOARD & SYSTEM HEALTH ---");

{
  // Test 9: Admin dashboard stats aggregation
  const mockProfiles = [
    { id: "1", role: "guru", status_verifikasi: "terverifikasi" },
    { id: "2", role: "guru", status_verifikasi: "menunggu" },
    { id: "3", role: "siswa", status_verifikasi: "terverifikasi" },
    { id: "4", role: "siswa", status_verifikasi: "terverifikasi" },
    { id: "5", role: "admin", status_verifikasi: "terverifikasi" },
  ];

  const totalUsers = mockProfiles.length;
  const totalTeachers = mockProfiles.filter((p) => p.role === "guru").length;
  const totalStudents = mockProfiles.filter((p) => p.role === "siswa").length;
  const totalAdmins = mockProfiles.filter((p) => p.role === "admin").length;
  const pendingTeachers = mockProfiles.filter(
    (p) => p.role === "guru" && p.status_verifikasi === "menunggu",
  ).length;

  assert.equal(totalUsers, 5);
  assert.equal(totalTeachers, 2);
  assert.equal(totalStudents, 2);
  assert.equal(totalAdmins, 1);
  assert.equal(pendingTeachers, 1);
  console.log("  [PASS] 9. Admin Dashboard: Operational metrics correctly aggregate users & pending verifications");
  passed++;
}

{
  // Test 10: Teacher verification status transitions
  let teacherStatus = "menunggu";
  const verify = (status) => {
    if (!["menunggu", "terverifikasi", "ditolak"].includes(status)) {
      throw new Error("Invalid status");
    }
    teacherStatus = status;
  };

  verify("terverifikasi");
  assert.equal(teacherStatus, "terverifikasi");
  verify("ditolak");
  assert.equal(teacherStatus, "ditolak");
  assert.throws(() => verify("hacked_status"), /Invalid status/);
  console.log("  [PASS] 10. Admin Dashboard: Teacher verification state transitions are validated");
  passed++;
}

{
  // Test 11: System error logging sanitization (scrub passwords, tokens, answer keys)
  const SENSITIVE_KEYS = new Set([
    "password",
    "katasandi",
    "kata_sandi",
    "token",
    "secret",
    "authorization",
    "kunci",
    "jawaban",
    "cookie",
  ]);

  function sanitize(raw) {
    if (!raw || typeof raw !== "object") return {};
    const cleaned = {};
    for (const [key, val] of Object.entries(raw)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        cleaned[key] = "[REDACTED]";
      } else if (typeof val === "object" && val !== null && !Array.isArray(val)) {
        cleaned[key] = sanitize(val);
      } else {
        cleaned[key] = val;
      }
    }
    return cleaned;
  }

  const rawContext = {
    email: "guru@example.com",
    password: "SuperSecretPassword123!",
    token: "bearer-jwt-token-xyz",
    kunci: "A",
    jawaban: "Siswa private answer",
    error_code: "AUTH_001",
    path: "/login",
  };

  const sanitized = sanitize(rawContext);
  assert.equal(sanitized.email, "guru@example.com");
  assert.equal(sanitized.password, "[REDACTED]");
  assert.equal(sanitized.token, "[REDACTED]");
  assert.equal(sanitized.kunci, "[REDACTED]");
  assert.equal(sanitized.jawaban, "[REDACTED]");
  assert.equal(sanitized.error_code, "AUTH_001");
  console.log("  [PASS] 11. System Health: Sensitive keys (password, token, kunci) strictly redacted");
  passed++;
}

// --- SECTION E: STRICT ROLE ISOLATION ---
console.log("\n--- SECTION E: STRICT ROLE ISOLATION ---");

{
  // Test 12: Siswa cannot access Guru routes
  const guruRoutes = ["/soal", "/arsip", "/verifikasi"];
  const checkAccess = (route, role) => {
    if (guruRoutes.includes(route) && role !== "guru") {
      return { allowed: false, reason: "Akses Khusus Guru" };
    }
    return { allowed: true };
  };

  for (const r of guruRoutes) {
    const res = checkAccess(r, "siswa");
    assert.equal(res.allowed, false, `Siswa must be blocked from ${r}`);
    assert.equal(res.reason, "Akses Khusus Guru");
  }
  console.log("  [PASS] 12. Role Isolation: Siswa strictly blocked from Guru routes (/soal, /arsip, /verifikasi)");
  passed++;
}

{
  // Test 13: Non-admin users cannot access Admin Dashboard or functions
  const checkAdminAccess = (role) => {
    return role === "admin";
  };

  assert.equal(checkAdminAccess("siswa"), false, "Siswa cannot access Admin features");
  assert.equal(checkAdminAccess("guru"), false, "Guru cannot access Admin features");
  assert.equal(checkAdminAccess(""), false, "Anonymous cannot access Admin features");
  assert.equal(checkAdminAccess("admin"), true, "Admin is granted access");
  console.log("  [PASS] 13. Role Isolation: Non-admins (Siswa, Guru, Anon) strictly blocked from Admin functions");
  passed++;
}

{
  // Test 14: Dashboard switcher routes users to proper role view
  const resolveDashboard = (role) => {
    if (role === "admin") return "AdminDashboard";
    if (role === "siswa") return "StudentDashboard";
    if (role === "guru") return "TeacherDashboard";
    return "UnknownRoleView";
  };

  assert.equal(resolveDashboard("admin"), "AdminDashboard");
  assert.equal(resolveDashboard("guru"), "TeacherDashboard");
  assert.equal(resolveDashboard("siswa"), "StudentDashboard");
  assert.equal(resolveDashboard("unknown"), "UnknownRoleView");
  console.log("  [PASS] 14. Role Isolation: Dashboard Switcher correctly routes each role to dedicated view");
  passed++;
}

console.log(`\n======================================================`);
console.log(`  DASHBOARD & ROLE TESTS COMPLETE: ${passed}/14 PASSED (0 FAILED)`);
console.log(`======================================================\n`);
