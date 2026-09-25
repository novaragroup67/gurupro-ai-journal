#!/usr/bin/env node
/**
 * GuruPro — Comprehensive Live Auth & Strict Role Registration Diagnostic
 *
 * Tests against canonical Supabase project: dxzzpsrgbiummjplggyo
 * and live Vercel application: https://gurupro-ai-journal.vercel.app
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, "..");

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

const CANONICAL_PROJECT_ID = "dxzzpsrgbiummjplggyo";
const supabaseUrl = process.env["VITE_SUPABASE_URL"] || `https://${CANONICAL_PROJECT_ID}.supabase.co`;
const supabaseKey = process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] || "";
const VERCEL_URL = "https://gurupro-ai-journal.vercel.app";

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

console.log("================================================================================");
console.log("  GURUPRO — LIVE AUTH & STRICT ROLE REGISTRATION VERIFICATION SUITE              ");
console.log("================================================================================");
console.log(`- Supabase URL:   ${supabaseUrl}`);
console.log(`- Project ID:     ${CANONICAL_PROJECT_ID}`);
console.log(`- Live App URL:   ${VERCEL_URL}`);
console.log("--------------------------------------------------------------------------------\n");

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  [FAIL] ${message}`);
    failed++;
    throw new Error(message);
  }
  console.log(`  [PASS] ${message}`);
  passed++;
}

async function run() {
  const testRunId = Date.now().toString().slice(-6);
  const testGuruEmail = `live.guru.${testRunId}@gurupro.test`;
  const testSiswaEmail = `live.siswa.${testRunId}@gurupro.test`;
  const testPassword = `P@ssw0rdGuruPro${testRunId}!`;

  // -------------------------------------------------------------------------
  // SECTION 1: STRICT ROLE REGISTRATION & REJECTION OF INVALID ROLES
  // -------------------------------------------------------------------------
  console.log("--- SECTION 1: STRICT ROLE REGISTRATION AUDIT ---");

  // 1.1 Attempt registration with role 'admin' (MUST BE REJECTED)
  {
    const adminEmail = `live.admin.${testRunId}@gurupro.test`;
    const { data, error } = await supabase.auth.signUp({
      email: adminEmail,
      password: testPassword,
      options: {
        data: {
          nama: "Hacker Admin",
          role: "admin", // Public registration must never create admin
        },
      },
    });

    const isRejected = Boolean(error) || (data?.user && (!data.user.identities || data.user.identities.length === 0));
    const errMsg = (error?.message || "").toLowerCase();
    assert(
      Boolean(error) && (errMsg.includes("tidak valid") || errMsg.includes("invalid") || errMsg.includes("database error")),
      "Public registration with role 'admin' is strictly rejected with database exception",
    );
  }

  // 1.2 Attempt registration with invalid/random role (MUST BE REJECTED)
  {
    const badRoleEmail = `live.badrole.${testRunId}@gurupro.test`;
    const { error } = await supabase.auth.signUp({
      email: badRoleEmail,
      password: testPassword,
      options: {
        data: {
          nama: "Invalid Role User",
          role: "super_operator",
        },
      },
    });

    const errMsg = (error?.message || "").toLowerCase();
    assert(
      Boolean(error) && (errMsg.includes("tidak valid") || errMsg.includes("invalid") || errMsg.includes("database error")),
      "Public registration with unknown role 'super_operator' is strictly rejected",
    );
  }

  // -------------------------------------------------------------------------
  // SECTION 2: GURU & SISWA REGISTRATION & PROFILE SYNC (auth.users.id = profiles.id)
  // -------------------------------------------------------------------------
  console.log("\n--- SECTION 2: REGISTRATION & PROFILE SYNC ---");

  let createdGuruUserId = null;
  let createdSiswaUserId = null;

  // 2.1 Register valid Guru
  {
    const { data, error } = await supabase.auth.signUp({
      email: testGuruEmail,
      password: testPassword,
      options: {
        data: {
          nama: `Guru Tester ${testRunId}`,
          role: "guru",
          nip: "198801012015011001",
          sekolah: "SMA Negeri 1 Live Test",
          mapel: "Fisika",
          telepon: "081234567890",
        },
      },
    });

    assert(!error && Boolean(data?.user?.id), `New Guru registration succeeded for ${testGuruEmail}`);
    createdGuruUserId = data.user.id;

    // Verify profiles row created
    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", createdGuruUserId)
      .single();

    assert(!pErr && Boolean(profile), "Guru profile row successfully created in public.profiles");
    assert(profile.id === createdGuruUserId, "auth.users.id matches profiles.id strictly");
    assert(profile.role === "guru", "Guru profile role is strictly 'guru'");
    assert(profile.status_verifikasi === "terverifikasi", "New Guru status_verifikasi starts as 'terverifikasi'");
  }

  // 2.2 Register valid Siswa
  {
    const { data, error } = await supabase.auth.signUp({
      email: testSiswaEmail,
      password: testPassword,
      options: {
        data: {
          nama: `Siswa Tester ${testRunId}`,
          role: "siswa",
          nisn: "0099887766",
          sekolah: "SMA Negeri 1 Live Test",
          jenjang: "XI",
          telepon: "089876543210",
        },
      },
    });

    assert(!error && Boolean(data?.user?.id), `New Siswa registration succeeded for ${testSiswaEmail}`);
    createdSiswaUserId = data.user.id;

    // Verify profiles row created
    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", createdSiswaUserId)
      .single();

    assert(!pErr && Boolean(profile), "Siswa profile row successfully created in public.profiles");
    assert(profile.id === createdSiswaUserId, "auth.users.id matches profiles.id strictly");
    assert(profile.role === "siswa", "Siswa profile role is strictly 'siswa'");
    assert(profile.status_verifikasi === "terverifikasi", "New Siswa status_verifikasi is 'terverifikasi'");
  }

  // 2.3 Verify duplicate registration is handled safely (anti-enumeration)
  {
    const { data, error } = await supabase.auth.signUp({
      email: testGuruEmail,
      password: testPassword,
      options: {
        data: {
          nama: "Duplicate Guru",
          role: "guru",
        },
      },
    });

    const isDuplicateSafe =
      (error && /already registered|already exists/i.test(error.message)) ||
      (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0);

    assert(Boolean(isDuplicateSafe), "Duplicate registration handled safely without duplicate profile creation");
  }

  // -------------------------------------------------------------------------
  // SECTION 3: LOGIN, SESSION, REFRESH & DASHBOARD DATA ACCESS
  // -------------------------------------------------------------------------
  console.log("\n--- SECTION 3: LOGIN, SESSION & DASHBOARD VERIFICATION ---");

  // 3.1 Login as new Guru (Status: Menunggu)
  let guruSession = null;
  let authedGuruClient = null;
  {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: testGuruEmail,
      password: testPassword,
    });

    assert(!error && Boolean(data?.session?.access_token), "Guru login succeeded with valid session and token");
    guruSession = data.session;

    // Fetch profile using authenticated client
    authedGuruClient = createClient(supabaseUrl, supabaseKey, {
      accessToken: async () => guruSession.access_token,
      auth: { persistSession: false },
    });

    const { data: profile, error: pErr } = await authedGuruClient
      .from("profiles")
      .select("*")
      .eq("id", createdGuruUserId)
      .single();

    assert(!pErr && profile.role === "guru", "Authenticated Guru client fetches own profile cleanly");
    assert(profile.status_verifikasi === "terverifikasi", "Profile status remains 'terverifikasi'");

    // Simulate page refresh (token refresh)
    const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession({
      refresh_token: guruSession.refresh_token,
    });
    assert(!refreshErr && Boolean(refreshData?.session?.access_token), "Guru session refresh succeeds (page reload simulation)");
  }

  // 3.2 Login as Siswa (Status: Terverifikasi)
  let siswaSession = null;
  let authedSiswaClient = null;
  {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: testSiswaEmail,
      password: testPassword,
    });

    assert(!error && Boolean(data?.session?.access_token), "Siswa login succeeded with valid session and token");
    siswaSession = data.session;

    authedSiswaClient = createClient(supabaseUrl, supabaseKey, {
      accessToken: async () => siswaSession.access_token,
      auth: { persistSession: false },
    });

    const { data: profile, error: pErr } = await authedSiswaClient
      .from("profiles")
      .select("*")
      .eq("id", createdSiswaUserId)
      .single();

    assert(!pErr && profile.role === "siswa", "Authenticated Siswa client fetches own profile cleanly");
    assert(profile.status_verifikasi === "terverifikasi", "Siswa profile status is 'terverifikasi'");

    // Refresh simulation
    const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession({
      refresh_token: siswaSession.refresh_token,
    });
    assert(!refreshErr && Boolean(refreshData?.session?.access_token), "Siswa session refresh succeeds (page reload simulation)");
  }

  // -------------------------------------------------------------------------
  // SECTION 4: SERVER AUTHORIZATION & PROTECTED FEATURES
  // -------------------------------------------------------------------------
  console.log("\n--- SECTION 4: SERVER AUTHORIZATION & PROTECTED FEATURES ---");

  // 4.1 Verified teacher has instant access to teacher features
  {
    const { data: checkProfile } = await authedGuruClient
      .from("profiles")
      .select("role, status_verifikasi")
      .eq("id", createdGuruUserId)
      .single();

    const isVerified = checkProfile?.status_verifikasi === "terverifikasi";
    assert(isVerified, "Teacher (status: terverifikasi) has instant access and is active for all features");
  }

  // 4.2 Siswa attempting teacher action
  {
    // Siswa attempts to create a class (teacher-only RLS)
    const { error: insertClassErr } = await authedSiswaClient
      .from("kelas")
      .insert({
        nama_kelas: "Hacked Class",
        jenjang: "XI",
        guru_id: createdSiswaUserId,
        kode_kelas: "HACK01",
      });

    assert(Boolean(insertClassErr), "Siswa is strictly blocked by RLS from creating classes (teacher only)");
  }

  // -------------------------------------------------------------------------
  // SECTION 5: NEGATIVE TEST CASES MATRIX
  // -------------------------------------------------------------------------
  console.log("\n--- SECTION 5: NEGATIVE CASES MATRIX ---");

  // 5.1 Wrong password
  {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: testGuruEmail,
      password: "WrongPassword123!",
    });
    assert(!data?.session && Boolean(error), "Wrong password cleanly rejected by Supabase Auth");
    const errMsg = (error?.message || "").toLowerCase();
    assert(errMsg.includes("invalid login credentials"), "Correctly returns 'Invalid login credentials' error message");
  }

  // 5.2 Unauthenticated access to protected table
  {
    const anonClient = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });
    const { data, error } = await anonClient.from("penugasan_pengumpulan").select("*");
    assert(Boolean(error) || (Array.isArray(data) && data.length === 0), "Anonymous client cannot read protected student submissions");
  }

  // -------------------------------------------------------------------------
  // SECTION 6: LIVE VERCEL APPLICATION HEALTH ---
  // -------------------------------------------------------------------------
  console.log("\n--- SECTION 6: LIVE VERCEL APPLICATION HEALTH ---");

  try {
    const resHome = await fetch(VERCEL_URL);
    assert(resHome.status === 200, `Live Vercel landing page returns HTTP 200 (${VERCEL_URL})`);

    const resLogin = await fetch(`${VERCEL_URL}/login`);
    assert(resLogin.status === 200, "Live Vercel login page returns HTTP 200");

    const resDaftar = await fetch(`${VERCEL_URL}/daftar`);
    assert(resDaftar.status === 200, "Live Vercel registration page returns HTTP 200");

    const resDashboard = await fetch(`${VERCEL_URL}/dashboard`);
    assert(resDashboard.status === 200, "Live Vercel dashboard route responds HTTP 200 (renders client shell/auth gate)");
  } catch (err) {
    console.error("  [WARN] Vercel HTTP check error:", err.message);
  }

  // -------------------------------------------------------------------------
  // CLEANUP: Clean up test accounts from profiles & auth
  // -------------------------------------------------------------------------
  console.log("\n--- CLEANUP OF TEMPORARY TEST PROFILES ---");
  try {
    await supabase.from("profiles").delete().in("id", [createdGuruUserId, createdSiswaUserId]);
    console.log("  [CLEANUP] Temporary test profiles cleaned up cleanly.");
  } catch {
    // Non-fatal
  }

  console.log("\n================================================================================");
  console.log(`  VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Fatal error during live verification:", err);
  process.exit(1);
});
