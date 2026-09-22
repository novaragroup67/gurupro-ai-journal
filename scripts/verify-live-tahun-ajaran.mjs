#!/usr/bin/env node
/**
 * GuruPro — Live Tahun Ajaran Context & Filter Diagnostic
 *
 * Tests against canonical Supabase project: dxzzpsrgbiummjplggyo
 * Verifies public.tahun_ajaran master table, RLS policies, teacher class
 * creation per academic year, academic year filtering, and penugasan hydration.
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

const anonClient = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

console.log("================================================================================");
console.log("  GURUPRO — LIVE TAHUN AJARAN CONTEXT VERIFICATION SUITE                        ");
console.log("================================================================================");
console.log(`- Supabase URL:   ${supabaseUrl}`);
console.log(`- Project ID:     ${CANONICAL_PROJECT_ID}`);
console.log(`- Live App URL:   ${VERCEL_URL}`);
console.log("--------------------------------------------------------------------------------\n");

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

async function runLiveVerification() {
  const nonce = Date.now();
  const testGuruEmail = `test.ta.guru.${nonce}@gurupro-test.sch.id`;
  const testPassword = `GuruProTA#${nonce}`;
  let guruId = null;
  let testKelas2026Id = null;
  let testKelas2025Id = null;
  let testPaketSoalId = null;
  let testPenugasanId = null;
  let clientGuru = null;

  try {
    // -------------------------------------------------------------------------
    // SECTION 1: MASTER TAHUN AJARAN TABLE & RLS
    // -------------------------------------------------------------------------
    console.log("--- SECTION 1: MASTER TAHUN AJARAN TABLE & RLS ---");
    const { data: years, error: yearsError } = await anonClient
      .from("tahun_ajaran")
      .select("*")
      .order("tahun", { ascending: false });

    assert(!yearsError, "public.tahun_ajaran exists and is queryable via anon/authenticated read policy");
    assert(Array.isArray(years) && years.length >= 3, `Found ${years?.length || 0} academic years in master table`);

    const yearNames = (years || []).map(y => y.tahun);
    console.log(`  [INFO] Master academic years in DB: ${yearNames.join(", ")}`);

    assert(yearNames.includes("2026/2027"), "Master table contains active year '2026/2027'");
    assert(yearNames.includes("2025/2026"), "Master table contains previous year '2025/2026'");
    assert(yearNames.includes("2024/2025"), "Master table contains historical year '2024/2025'");

    const activeYear = years?.find(y => y.is_active);
    assert(Boolean(activeYear), `Active academic year is defined: ${activeYear?.tahun}`);
    assert(activeYear?.tahun === "2026/2027", `Current active year is strictly '2026/2027' (got: ${activeYear?.tahun})`);

    // -------------------------------------------------------------------------
    // SECTION 2: AUTHENTICATED TEACHER SESSION & YEAR-SCOPED CLASS CREATION
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 2: TEACHER CLASS CREATION BY TAHUN AJARAN ---");
    const { data: signUpData, error: signUpError } = await anonClient.auth.signUp({
      email: testGuruEmail,
      password: testPassword,
      options: {
        data: {
          nama: "Guru TA Live",
          role: "guru",
          nip: "198701012012011001",
          sekolah: "SMA Negeri 1 Live TA",
          mapel: "Matematika Peminatan",
          telepon: "081299887766",
        },
      },
    });

    assert(!signUpError && Boolean(signUpData.user), `Teacher registration succeeded (${testGuruEmail})`);
    guruId = signUpData.user?.id;

    const { data: loginData, error: loginErr } = await anonClient.auth.signInWithPassword({
      email: testGuruEmail,
      password: testPassword,
    });
    assert(!loginErr && Boolean(loginData.session), "Teacher authentication succeeded with JWT");

    clientGuru = createClient(supabaseUrl, supabaseKey, {
      accessToken: async () => loginData.session.access_token,
      global: {
        headers: {
          Authorization: `Bearer ${loginData.session.access_token}`,
        },
      },
      auth: { persistSession: false },
    });

    // Create Class 1 in 2026/2027
    const { data: class2026, error: errC1 } = await clientGuru
      .from("kelas")
      .insert({
        nama_kelas: `XII MIPA 1 - ${nonce.toString().slice(-4)}`,
        tingkat: "XII",
        mapel: "Matematika Peminatan",
        tahun_ajaran: "2026/2027",
        guru_id: guruId,
        kode_kelas: `M26-${nonce.toString().slice(-4)}`,
      })
      .select()
      .single();

    assert(!errC1 && Boolean(class2026?.id), "Teacher created class successfully for active academic year '2026/2027'");
    testKelas2026Id = class2026?.id;

    // Create Class 2 in 2025/2026 (Past Year)
    const { data: class2025, error: errC2 } = await clientGuru
      .from("kelas")
      .insert({
        nama_kelas: `XI MIPA 1 - ${nonce.toString().slice(-4)}`,
        tingkat: "XI",
        mapel: "Matematika Peminatan",
        tahun_ajaran: "2025/2026",
        guru_id: guruId,
        kode_kelas: `M25-${nonce.toString().slice(-4)}`,
      })
      .select()
      .single();

    assert(!errC2 && Boolean(class2025?.id), "Teacher created class successfully for past academic year '2025/2026'");
    testKelas2025Id = class2025?.id;

    // -------------------------------------------------------------------------
    // SECTION 3: YEAR-SCOPED CLASS QUERY FILTERING ---
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 3: YEAR-SCOPED CLASS QUERY FILTERING ---");
    // Filter by 2026/2027
    const { data: classesIn2026, error: errQuery2026 } = await clientGuru
      .from("kelas")
      .select("id, nama_kelas, tahun_ajaran, guru_id")
      .eq("guru_id", guruId)
      .eq("tahun_ajaran", "2026/2027");

    assert(!errQuery2026, "Querying teacher classes filtered by tahun_ajaran = '2026/2027' succeeded");
    assert(classesIn2026?.length === 1 && classesIn2026[0].id === testKelas2026Id, "Filter '2026/2027' returns ONLY the 2026/2027 class");

    // Filter by 2025/2026
    const { data: classesIn2025, error: errQuery2025 } = await clientGuru
      .from("kelas")
      .select("id, nama_kelas, tahun_ajaran, guru_id")
      .eq("guru_id", guruId)
      .eq("tahun_ajaran", "2025/2026");

    assert(!errQuery2025, "Querying teacher classes filtered by tahun_ajaran = '2025/2026' succeeded");
    assert(classesIn2025?.length === 1 && classesIn2025[0].id === testKelas2025Id, "Filter '2025/2026' returns ONLY the 2025/2026 class");

    // Filter by 2024/2025 (No classes)
    const { data: classesIn2024 } = await clientGuru
      .from("kelas")
      .select("id")
      .eq("guru_id", guruId)
      .eq("tahun_ajaran", "2024/2025");

    assert(classesIn2024?.length === 0, "Filter '2024/2025' returns 0 classes when none exist for that year");

    // -------------------------------------------------------------------------
    // SECTION 4: PENUGASAN RELATIONAL TAHUN AJARAN HYDRATION ---
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 4: PENUGASAN RELATIONAL TAHUN AJARAN HYDRATION ---");
    const { data: insertedPaket, error: errPaket } = await clientGuru
      .from("paket_soal")
      .insert({
        user_id: guruId,
        judul: `Paket Soal TA ${nonce.toString().slice(-4)}`,
        topik: "Matematika Aljabar",
        status: "published",
        soal: [],
      })
      .select()
      .single();

    assert(!errPaket && Boolean(insertedPaket?.id), "Question package created successfully");
    testPaketSoalId = insertedPaket?.id;

    const { data: insertedPenugasan, error: errPenugasan } = await clientGuru
      .from("penugasan")
      .insert({
        guru_id: guruId,
        kelas_id: testKelas2026Id,
        paket_soal_id: testPaketSoalId,
        judul: `Tugas Integral - ${nonce.toString().slice(-4)}`,
        instruksi: "Kerjakan soal latihan integral",
        status: "published",
      })
      .select()
      .single();

    assert(!errPenugasan && Boolean(insertedPenugasan?.id), "Assignment created successfully linked to 2026/2027 class");
    testPenugasanId = insertedPenugasan?.id;

    // Fetch assignment with kelas:kelas_id join
    const { data: hydratedList, error: errHydrate } = await clientGuru
      .from("penugasan")
      .select("id, judul, kelas_id, kelas:kelas_id(id, nama_kelas, tahun_ajaran)")
      .eq("id", testPenugasanId)
      .single();

    assert(!errHydrate, "Assignment hydrated successfully via kelas:kelas_id join");
    assert(hydratedList?.kelas?.tahun_ajaran === "2026/2027", `Assignment correctly resolves class academic year: ${hydratedList?.kelas?.tahun_ajaran}`);

    // -------------------------------------------------------------------------
    // SECTION 5: MIGRATION DEFINITIONS ---
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 5: MIGRATION DEFINITIONS ---");
    const migrationPath = resolve(ROOT_DIR, "supabase/migrations/20260922123000_tahun_ajaran_context.sql");
    const exists = existsSync(migrationPath);
    assert(exists, "Migration file 20260922123000_tahun_ajaran_context.sql exists");

    if (exists) {
      const sql = readFileSync(migrationPath, "utf-8");
      assert(sql.includes("CREATE TABLE IF NOT EXISTS public.tahun_ajaran"), "Migration contains CREATE TABLE public.tahun_ajaran");
      assert(sql.includes("idx_kelas_guru_tahun"), "Migration contains idx_kelas_guru_tahun composite index");
      assert(sql.includes("2026/2027"), "Migration backfills '2026/2027'");
    }
  } catch (err) {
    console.error("Live test execution error:", err);
    assert(false, `Live test encountered unexpected error: ${err.message}`);
  } finally {
    // -------------------------------------------------------------------------
    // CLEANUP
    // -------------------------------------------------------------------------
    console.log("\n--- CLEANUP TEMPORARY TEST DATA ---");
    try {
      if (clientGuru) {
        if (testPenugasanId) {
          await clientGuru.from("penugasan").delete().eq("id", testPenugasanId);
          console.log("  [CLEANUP] Deleted test penugasan");
        }
        if (testPaketSoalId) {
          await clientGuru.from("paket_soal").delete().eq("id", testPaketSoalId);
          console.log("  [CLEANUP] Deleted test paket_soal");
        }
        if (testKelas2026Id) {
          await clientGuru.from("kelas").delete().eq("id", testKelas2026Id);
          console.log("  [CLEANUP] Deleted test kelas 2026");
        }
        if (testKelas2025Id) {
          await clientGuru.from("kelas").delete().eq("id", testKelas2025Id);
          console.log("  [CLEANUP] Deleted test kelas 2025");
        }
      }
    } catch (cleanErr) {
      console.warn("  [CLEANUP WARNING]", cleanErr.message);
    }
  }

  // Summary
  console.log("\n================================================================================");
  console.log(`  LIVE TAHUN AJARAN DIAGNOSTIC COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runLiveVerification().catch(err => {
  console.error("Diagnostic execution error:", err);
  process.exit(1);
});
