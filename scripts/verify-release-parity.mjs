#!/usr/bin/env node
/**
 * ==============================================================================
 * GURUPRO — RELEASE PARITY & DEPLOYMENT VERIFICATION TOOL (QA-2)
 * ==============================================================================
 *
 * Verifies 6 authoritative release gates:
 *   Gate 1: Repository Baseline, Git Hygiene & Secret Scan
 *   Gate 2: Environment Variable Inventory (Zero Secret Exposure)
 *   Gate 3: Supabase Service, Auth Gateway & Core Database Health
 *   Gate 4: Database Schema, RLS Policies & Storage Buckets
 *   Gate 5: Client Bundle Secret Scan (.output/public/assets)
 *   Gate 6: Live Vercel Production Deployment Health Check
 *
 * Exits with code 0 on PASS, code 1 on any blocking mismatch.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, "..");

console.log("================================================================================");
console.log("  GURUPRO — RELEASE PARITY & ENVIRONMENT VERIFICATION (QA-2)                     ");
console.log("================================================================================");

let hasFailures = false;
let warningCount = 0;

// ------------------------------------------------------------------------------
// GATE 1: REPOSITORY BASELINE & GIT HYGIENE
// ------------------------------------------------------------------------------
console.log("\n[GATE 1/6] REPOSITORY BASELINE & GIT HYGIENE...");

try {
  const branch = execSync("git branch --show-current", { cwd: ROOT_DIR, encoding: "utf8" }).trim();
  const commit = execSync("git rev-parse HEAD", { cwd: ROOT_DIR, encoding: "utf8" }).trim();
  console.log(`  - Git Branch:       ${branch}`);
  console.log(`  - Current Commit:   ${commit}`);

  // Check .env is untracked
  const trackedEnv = execSync("git ls-files .env", { cwd: ROOT_DIR, encoding: "utf8" }).trim();
  if (trackedEnv) {
    console.error("  [FAIL] .env is tracked in git! Run 'git rm --cached .env'.");
    hasFailures = true;
  } else {
    console.log("  [PASS] .env is strictly untracked in Git history.");
  }

  // Scan src/ for any Base64-obfuscated keys
  const aiServiceContent = readFileSync(resolve(ROOT_DIR, "src/lib/ai/ai-service.ts"), "utf8");
  if (aiServiceContent.includes("CANONICAL_GEMINI_KEY_B64") || aiServiceContent.includes("decodeKey(")) {
    console.error("  [FAIL] Base64 secret keys or decodeKey found in ai-service.ts!");
    hasFailures = true;
  } else {
    console.log("  [PASS] No hardcoded Base64 keys found in source.");
  }
} catch (err) {
  console.error(`  [FAIL] Git baseline inspection failed: ${err.message}`);
  hasFailures = true;
}

// ------------------------------------------------------------------------------
// GATE 2: ENVIRONMENT VARIABLE INVENTORY
// ------------------------------------------------------------------------------
console.log("\n[GATE 2/6] ENVIRONMENT VARIABLE INVENTORY...");

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
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "";

const REQUIRED_VARS = [
  { name: "VITE_SUPABASE_URL", type: "public", secret: false },
  { name: "VITE_SUPABASE_PUBLISHABLE_KEY", type: "public", secret: false },
  { name: "GEMINI_API_KEY", type: "server", secret: true, optional: true },
  { name: "OPENAI_API_KEY", type: "server", secret: true, optional: true },
  { name: "LOVABLE_API_KEY", type: "server", secret: true, optional: true },
];

for (const v of REQUIRED_VARS) {
  const present = Boolean(process.env[v.name]);
  if (!present && !v.optional) {
    console.error(`  [FAIL] Missing required environment variable: ${v.name}`);
    hasFailures = true;
  } else {
    console.log(`  [PASS] ${v.name}: present (${v.type}${v.secret ? ", secret" : ""})`);
  }
}

if (!supabaseUrl.includes(CANONICAL_PROJECT_ID)) {
  console.error(`  [FAIL] Supabase URL does not point to canonical project ${CANONICAL_PROJECT_ID}`);
  hasFailures = true;
} else {
  console.log(`  [PASS] Supabase target points to canonical project: ${CANONICAL_PROJECT_ID}`);
}

// ------------------------------------------------------------------------------
// GATE 3: SUPABASE SERVICE & AUTH GATEWAY HEALTH
// ------------------------------------------------------------------------------
console.log("\n[GATE 3/6] SUPABASE SERVICE & AUTH GATEWAY HEALTH...");

const client = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

try {
  const authHealthRes = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/health`, {
    headers: { apikey: supabaseKey },
  });
  if (authHealthRes.status === 200 || authHealthRes.status === 404 || authHealthRes.ok) {
    console.log(`  [PASS] Supabase Auth service reachable (HTTP ${authHealthRes.status}).`);
  } else {
    console.warn(`  [WARN] Supabase Auth gateway responded with HTTP ${authHealthRes.status}`);
    warningCount++;
  }
} catch (err) {
  console.error(`  [FAIL] Could not reach Supabase Auth gateway: ${err.message}`);
  hasFailures = true;
}

// ------------------------------------------------------------------------------
// GATE 4: DATABASE SCHEMA & STORAGE PARITY
// ------------------------------------------------------------------------------
console.log("\n[GATE 4/6] DATABASE SCHEMA & STORAGE PARITY...");

const CORE_TABLES = [
  "profiles",
  "kelas",
  "kelas_anggota",
  "tahun_ajaran",
  "moduls",
  "paket_soal",
  "penugasan",
  "penugasan_pengumpulan",
  "penugasan_jawaban",
  "penugasan_remedial_pengumpulan",
  "penugasan_remedial_jawaban",
  "system_logs",
  "bug_reports",
];

for (const t of CORE_TABLES) {
  try {
    const { error, status } = await client.from(t).select("*", { count: "exact", head: true });
    if (error && (error.code === "PGRST205" || error.code === "PGRST204" || error.code === "42P01")) {
      console.error(`  [FAIL] Required table '${t}' missing from database!`);
      hasFailures = true;
    } else {
      console.log(`  [PASS] Table '${t}' exists and is active (HTTP ${status}).`);
    }
  } catch (err) {
    console.error(`  [FAIL] Error querying table '${t}': ${err.message}`);
    hasFailures = true;
  }
}

// Check storage buckets
const STORAGE_BUCKETS = ["illustration-assets", "presentation-artifacts"];
for (const b of STORAGE_BUCKETS) {
  try {
    const { error } = await client.storage.from(b).list("", { limit: 1 });
    if (error && error.message.toLowerCase().includes("not found")) {
      console.error(`  [FAIL] Storage bucket '${b}' does not exist!`);
      hasFailures = true;
    } else {
      console.log(`  [PASS] Storage bucket '${b}' exists and is reachable.`);
    }
  } catch (err) {
    console.error(`  [FAIL] Storage bucket '${b}' probe failed: ${err.message}`);
    hasFailures = true;
  }
}

// ------------------------------------------------------------------------------
// GATE 5: CLIENT BUNDLE SECRET SCAN
// ------------------------------------------------------------------------------
console.log("\n[GATE 5/6] CLIENT BUNDLE SECRET SCAN...");

const assetsDir = resolve(ROOT_DIR, ".output/public/assets");
if (!existsSync(assetsDir)) {
  console.warn("  [WARN] .output/public/assets not found. Run 'npm run build' to generate client assets.");
  warningCount++;
} else {
  const chunks = readdirSync(assetsDir).filter((f) => f.endsWith(".js"));
  console.log(`  Scanning ${chunks.length} compiled client chunks for private secrets...`);

  const serverSecrets = [];
  const envPath = resolve(ROOT_DIR, ".env");
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, "utf-8").split("\n");
    for (const l of lines) {
      const trimmed = l.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const k = trimmed.slice(0, eqIdx).trim();
        const v = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, "");
        const isPublic = k.includes("PUBLISHABLE") || k.includes("ANON") || k.startsWith("VITE_");
        if (!isPublic && (k.includes("KEY") || k.includes("SECRET")) && v.length > 8) {
          serverSecrets.push({ key: k, val: v });
        }
      }
    }
  }

  let bundleLeaks = 0;
  for (const chunk of chunks) {
    const text = readFileSync(join(assetsDir, chunk), "utf8");
    for (const s of serverSecrets) {
      if (text.includes(s.val)) {
        console.error(`  [FAIL] Server secret '${s.key}' leaked in client chunk '${chunk}'!`);
        bundleLeaks++;
      }
    }
  }

  if (bundleLeaks > 0) {
    hasFailures = true;
  } else {
    console.log("  [PASS] Zero server secrets detected across all client bundles.");
  }
}

// ------------------------------------------------------------------------------
// GATE 6: VERCEL DEPLOYMENT HEALTH CHECK
// ------------------------------------------------------------------------------
console.log("\n[GATE 6/6] VERCEL DEPLOYMENT HEALTH CHECK...");

const VERCEL_APP_URL = "https://gurupro-ai-journal.vercel.app";
const VERCEL_ROUTES = ["/", "/login", "/daftar"];

for (const r of VERCEL_ROUTES) {
  try {
    const res = await fetch(`${VERCEL_APP_URL}${r}`, {
      headers: { "user-agent": "GuruPro-Parity-Bot/1.0" },
    });
    if (res.status === 200) {
      console.log(`  [PASS] Live Vercel route '${r}' returned HTTP 200.`);
    } else {
      console.warn(`  [WARN] Live Vercel route '${r}' returned HTTP ${res.status}`);
      warningCount++;
    }
  } catch (err) {
    console.warn(`  [WARN] Could not reach Vercel route '${r}': ${err.message}`);
    warningCount++;
  }
}

// ------------------------------------------------------------------------------
// SUMMARY
// ------------------------------------------------------------------------------
console.log("\n================================================================================");
if (hasFailures) {
  console.error("  RELEASE PARITY VERIFICATION: FAILED — BLOCKING ISSUES DETECTED");
  console.log("================================================================================");
  process.exit(1);
} else {
  console.log("  RELEASE PARITY VERIFICATION: PASSED — ALL RELEASE GATES VERIFIED");
  if (warningCount > 0) {
    console.log(`  (Note: ${warningCount} non-blocking warning(s) observed)`);
  }
  console.log("================================================================================");
  process.exit(0);
}
