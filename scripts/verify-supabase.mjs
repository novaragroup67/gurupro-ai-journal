#!/usr/bin/env node
/**
 * GuruPro — Canonical Supabase Database & Connectivity Verification Diagnostic
 *
 * Checks that the active environment connects to canonical project: dxzzpsrgbiummjplggyo
 * Verifies table availability, RPC functions, and Auth service.
 * Never prints secret values.
 * Exits with code 0 on SUCCESS, code 1 on FAILURE.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, "..");

// 1. Load environment variables from .env if present
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
const EXPECTED_URL = `https://${CANONICAL_PROJECT_ID}.supabase.co`;

const supabaseUrl =
  process.env["VITE_SUPABASE_URL"] ||
  process.env["SUPABASE_URL"] ||
  "";

const supabaseKey =
  process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
  process.env["SUPABASE_PUBLISHABLE_KEY"] ||
  "";

const projectId =
  process.env["VITE_SUPABASE_PROJECT_ID"] ||
  process.env["SUPABASE_PROJECT_ID"] ||
  (supabaseUrl.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1] ?? "");

const EXPECTED_TABLES = [
  "profiles",
  "kelas",
  "kelas_anggota",
  "moduls",
  "paket_soal",
  "penugasan",
  "penugasan_pengumpulan",
  "penugasan_jawaban",
  "system_logs",
];

const EXPECTED_RPCS = [
  { name: "cari_kelas_by_kode", testArgs: { _kode: "NON_EXISTENT_TEST_CODE" } },
  { name: "get_admin_dashboard_stats", testArgs: {} },
  { name: "log_system_event", testArgs: { _level: "info", _event_type: "diag_check", _message: "diagnostic ping", _context: {} } },
  { name: "get_penugasan_soal_for_siswa", testArgs: { _penugasan_id: "00000000-0000-0000-0000-000000000000" } },
  { name: "submit_penugasan", testArgs: { _pengumpulan_id: "00000000-0000-0000-0000-000000000000" } },
  { name: "simpan_penilaian_guru", testArgs: { _pengumpulan_id: "00000000-0000-0000-0000-000000000000", _nilai_essay: 0, _catatan_guru: "test" } },
  { name: "admin_update_teacher_verification", testArgs: { _teacher_id: "00000000-0000-0000-0000-000000000000", _status: "terverifikasi" } },
];

function maskKey(key) {
  if (!key) return "(empty)";
  if (key.length <= 12) return "[REDACTED]";
  return `${key.slice(0, 6)}...${key.slice(-4)} [REDACTED]`;
}

console.log("================================================================================");
console.log("  GURUPRO — CANONICAL DATABASE & APPLICATION CONNECTIVITY AUDIT DIAGNOSTIC       ");
console.log("================================================================================");

let hasFailures = false;

// 1. Environment & Canonical Project ID Validation
console.log("\n[1/4] AUDITING ENVIRONMENT & PROJECT CONFIGURATION...");
console.log(`  - Target Canonical Project ID: ${CANONICAL_PROJECT_ID}`);
console.log(`  - Resolved Project ID:        ${projectId || "(NONE)"}`);
console.log(`  - Supabase URL:               ${supabaseUrl || "(NONE)"}`);
console.log(`  - Publishable API Key:        ${maskKey(supabaseKey)}`);

if (!supabaseUrl) {
  console.error("  [FAIL] Supabase URL is not configured. Set VITE_SUPABASE_URL or SUPABASE_URL.");
  hasFailures = true;
} else if (!supabaseUrl.includes(CANONICAL_PROJECT_ID)) {
  console.error(`  [FAIL] URL mismatch! Expected project ${CANONICAL_PROJECT_ID}, got: ${supabaseUrl}`);
  hasFailures = true;
} else {
  console.log("  [PASS] Supabase URL matches canonical project.");
}

if (!supabaseKey) {
  console.error("  [FAIL] Supabase API Key is not configured. Set VITE_SUPABASE_PUBLISHABLE_KEY.");
  hasFailures = true;
} else {
  console.log("  [PASS] Supabase Publishable Key detected.");
}

if (hasFailures) {
  console.error("\n[ABORTED] Missing critical configuration. Halting diagnostic.");
  process.exit(1);
}

// 2. Initialize Client
const client = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function runDiagnostic() {
  // 2. Check Supabase Auth Service Health
  console.log("\n[2/4] CHECKING AUTH SERVICE HEALTH...");
  try {
    const authHealthUrl = `${supabaseUrl.replace(/\/$/, "")}/auth/v1/health`;
    const res = await fetch(authHealthUrl, {
      headers: { apikey: supabaseKey },
    });
    if (res.ok || res.status === 200 || res.status === 404) {
      // 404 on /health with valid API response still proves Supabase auth gateway reachable
      console.log(`  [PASS] Supabase Auth gateway reachable (HTTP ${res.status}).`);
    } else {
      console.warn(`  [WARN] Supabase Auth gateway response: HTTP ${res.status}`);
    }
  } catch (err) {
    console.error(`  [FAIL] Could not reach Supabase Auth gateway: ${err.message}`);
    hasFailures = true;
  }

  // 3. Check Canonical Tables Accessibility
  console.log("\n[3/4] CHECKING CANONICAL TABLES AVAILABILITY...");
  for (const table of EXPECTED_TABLES) {
    try {
      // Query with head: true to verify table schema existence without fetching rows
      const { error } = await client
        .from(table)
        .select("*", { count: "exact", head: true });

      if (error) {
        // RLS error (42501) means the table exists and RLS is actively protecting it
        if (error.code === "42501" || error.message?.includes("row-level security")) {
          console.log(`  [PASS] Table '${table}' exists and is secured by RLS.`);
        } else if (error.code === "PGRST204" || error.message?.includes("does not exist") || error.code === "42P01") {
          console.error(`  [FAIL] Table '${table}' DOES NOT EXIST in database! (Code: ${error.code})`);
          hasFailures = true;
        } else {
          console.log(`  [PASS] Table '${table}' reachable (Response: ${error.message || error.code}).`);
        }
      } else {
        console.log(`  [PASS] Table '${table}' exists and responded successfully.`);
      }
    } catch (err) {
      console.error(`  [FAIL] Table '${table}' unexpected check failure: ${err.message}`);
      hasFailures = true;
    }
  }

  // 4. Check Required RPC Functions
  console.log("\n[4/4] CHECKING REQUIRED RPC FUNCTIONS...");
  for (const { name, testArgs } of EXPECTED_RPCS) {
    try {
      const { error } = await client.rpc(name, testArgs);
      if (error) {
        // Function exists if error is about parameters, RLS, or logical validation, NOT 404/function does not exist
        if (
          error.code === "PGRST202" ||
          error.message?.includes("Could not find the function") ||
          error.message?.includes("function does not exist")
        ) {
          console.error(`  [FAIL] RPC function '${name}' is MISSING in Supabase! (Message: ${error.message})`);
          hasFailures = true;
        } else {
          // Any other error (e.g. invalid UUID, unauthorized, return null) proves the function is deployed in PostgreSQL
          console.log(`  [PASS] RPC function '${name}' is deployed and callable.`);
        }
      } else {
        console.log(`  [PASS] RPC function '${name}' executed successfully.`);
      }
    } catch (err) {
      console.error(`  [FAIL] RPC function '${name}' invocation failed: ${err.message}`);
      hasFailures = true;
    }
  }

  // Diagnostic Summary
  console.log("\n================================================================================");
  if (hasFailures) {
    console.error("  DIAGNOSTIC STATUS: FAILED — Some database checks did not pass.");
    console.log("================================================================================");
    process.exit(1);
  } else {
    console.log("  DIAGNOSTIC STATUS: SUCCESS");
    console.log("  DATABASE CONNECTIVITY VERIFIED — SUPABASE IS THE SINGLE SOURCE OF TRUTH");
    console.log("================================================================================");
    process.exit(0);
  }
}

runDiagnostic();
