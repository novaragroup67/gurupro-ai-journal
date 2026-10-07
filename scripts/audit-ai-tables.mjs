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

const supabaseUrl = process.env["VITE_SUPABASE_URL"] || "https://dxzzpsrgbiummjplggyo.supabase.co";
const supabaseKey = process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] || "";
const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"] || "";

console.log("Checking Supabase at:", supabaseUrl);
console.log("Publishable key present:", Boolean(supabaseKey));
console.log("Service role key present:", Boolean(serviceRoleKey));

const client = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const adminClient = serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
}) : null;

const targetTables = [
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
  "product_events",
  "user_feedback",
  "ai_source_snapshots",
  "generation_plans",
  "generation_plan_versions",
  "generation_styles",
  "illustration_generation_requests",
  "illustration_generations",
  "illustration_assets",
  "illustration_reviews",
  "illustration_quality_evaluations",
  "presentation_generation_requests",
  "presentation_generation_results",
  "presentation_artifacts",
  "presentation_reviews",
  "presentation_quality_evaluations"
];

async function checkTables() {
  console.log("\n================ TABLE STATUS ================");
  const results = {};
  for (const table of targetTables) {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*&limit=1`, {
        method: "GET",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`
        }
      });
      const text = await res.text();
      let statusDesc = "UNKNOWN";
      if (res.status === 200) {
        statusDesc = "EXISTS (HTTP 200 - Readable)";
      } else if (res.status === 401 || res.status === 403) {
        statusDesc = `EXISTS (HTTP ${res.status} - RLS Active)`;
      } else if (res.status === 404 || text.includes("PGRST205") || text.includes("PGRST200") || text.includes("schema cache")) {
        statusDesc = `MISSING (HTTP ${res.status} - Not in Schema Cache)`;
      } else {
        statusDesc = `HTTP ${res.status}: ${text.slice(0, 100)}`;
      }
      console.log(`${table.padEnd(36)}: ${statusDesc}`);
      results[table] = { status: res.status, desc: statusDesc };
    } catch (err) {
      console.log(`${table.padEnd(36)}: FETCH ERROR: ${err.message}`);
    }
  }

  console.log("\n================ STORAGE BUCKETS ================");
  const buckets = ["illustration-assets", "presentation-artifacts", "ai-source-materials"];
  for (const b of buckets) {
    try {
      const res = await fetch(`${supabaseUrl}/storage/v1/bucket/${b}`, {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`
        }
      });
      const text = await res.text();
      console.log(`${b.padEnd(36)}: HTTP ${res.status} -> ${text.slice(0, 100)}`);
    } catch (err) {
      console.log(`${b.padEnd(36)}: FETCH ERROR: ${err.message}`);
    }
  }
}

checkTables();
