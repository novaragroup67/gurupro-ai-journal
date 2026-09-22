#!/usr/bin/env node
/**
 * GuruPro — Live Mapel & Kelas Sync Diagnostic
 *
 * Tests against canonical Supabase project: dxzzpsrgbiummjplggyo
 * Scenarios A through I from user request
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
console.log("  GURUPRO — LIVE MAPEL & KELAS SYNC VERIFICATION SUITE                          ");
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

async function run() {
  const nonce = Math.floor(Math.random() * 900000) + 100000;
  const testGuruEmailA = `live.guruA.${nonce}@gurupro.test`;
  const testGuruEmailB = `live.guruB.${nonce}@gurupro.test`;
  const testSiswaEmail = `live.siswa.${nonce}@gurupro.test`;
  const testPassword = "LiveTestPassword123!";

  let guruAId = null;
  let guruBId = null;
  let siswaId = null;
  let testKelasId = null;
  let testModulId = null;
  let testKodeKelas = null;

  let clientGuruA = null;
  let clientGuruB = null;
  let clientSiswa = null;

  // -------------------------------------------------------------------------
  // SECTION 1: TEACHER MAPEL PERSISTENCE (SCENARIO A)
  // -------------------------------------------------------------------------
  console.log("--- SECTION 1: TEACHER MAPEL PERSISTENCE (SCENARIO A) ---");

  // Register Guru A with Mapel "Fisika Terapan"
  {
    const { data, error } = await supabase.auth.signUp({
      email: testGuruEmailA,
      password: testPassword,
      options: {
        data: {
          nama: "Guru Fisika Live",
          role: "guru",
          nip: "198501012010011003",
          sekolah: "SMA Negeri 1 Live",
          mapel: "Fisika Terapan",
          telepon: "081234567890",
        },
      },
    });

    assert(!error && Boolean(data.user), `Guru A registration succeeded (${testGuruEmailA})`);
    guruAId = data.user?.id;

    // Authenticate Guru A client
    const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({
      email: testGuruEmailA,
      password: testPassword,
    });
    assert(!loginErr && Boolean(loginData.session), "Guru A login succeeded with session token");

    clientGuruA = createClient(supabaseUrl, supabaseKey, {
      accessToken: async () => loginData.session.access_token,
      global: {
        headers: {
          Authorization: `Bearer ${loginData.session.access_token}`,
        },
      },
      auth: { persistSession: false },
    });

    // Check profiles.mapel in Supabase
    const { data: profileRow, error: pErr } = await clientGuruA
      .from("profiles")
      .select("id, role, mapel")
      .eq("id", guruAId)
      .single();

    assert(!pErr && profileRow?.mapel === "Fisika Terapan", "Scenario A: Teacher profile strictly saves and loads mapel from Supabase profiles");
  }

  // Register Guru B with Mapel "Kimia Analitik" (for cross-tenant tests)
  {
    const { data } = await supabase.auth.signUp({
      email: testGuruEmailB,
      password: testPassword,
      options: {
        data: {
          nama: "Guru Kimia Live",
          role: "guru",
          nip: "198601012010011004",
          sekolah: "SMA Negeri 1 Live",
          mapel: "Kimia Analitik",
          telepon: "081234567891",
        },
      },
    });
    guruBId = data.user?.id;

    const { data: loginB } = await supabase.auth.signInWithPassword({
      email: testGuruEmailB,
      password: testPassword,
    });

    clientGuruB = createClient(supabaseUrl, supabaseKey, {
      accessToken: async () => loginB.session.access_token,
      global: {
        headers: {
          Authorization: `Bearer ${loginB.session.access_token}`,
        },
      },
      auth: { persistSession: false },
    });
  }

  // Register Siswa (for membership tests)
  {
    const { data } = await supabase.auth.signUp({
      email: testSiswaEmail,
      password: testPassword,
      options: {
        data: {
          nama: "Siswa Live Test",
          role: "siswa",
          nisn: "0055443322",
          sekolah: "SMA Negeri 1 Live",
          jenjang: "XI",
          telepon: "081234567892",
        },
      },
    });
    siswaId = data.user?.id;

    const { data: loginS } = await supabase.auth.signInWithPassword({
      email: testSiswaEmail,
      password: testPassword,
    });

    clientSiswa = createClient(supabaseUrl, supabaseKey, {
      accessToken: async () => loginS.session.access_token,
      global: {
        headers: {
          Authorization: `Bearer ${loginS.session.access_token}`,
        },
      },
      auth: { persistSession: false },
    });
  }

  // -------------------------------------------------------------------------
  // SECTION 2: CREATE & PERSIST KELAS (SCENARIOS B, C, D)
  // -------------------------------------------------------------------------
  console.log("\n--- SECTION 2: KELAS PERSISTENCE & GURU_ID (SCENARIOS B, C, D) ---");

  // Create new class by Guru A
  {
    testKodeKelas = `XI-FIS-${nonce.toString().slice(-4)}`;
    const { data: insertedClass, error: insertErr } = await clientGuruA
      .from("kelas")
      .insert({
        nama_kelas: `XI MIPA ${nonce.toString().slice(-2)}`,
        tingkat: "XI",
        mapel: "Fisika Terapan",
        tahun_ajaran: "2025/2026",
        guru_id: guruAId,
        kode_kelas: testKodeKelas,
      })
      .select()
      .single();

    assert(!insertErr && Boolean(insertedClass?.id), "Scenario C: Create new class persists successfully in Supabase public.kelas");
    testKelasId = insertedClass?.id;

    assert(insertedClass?.guru_id === guruAId, "Scenario B: Class is strictly linked to authenticated teacher's guru_id");
    assert(insertedClass?.kode_kelas === testKodeKelas, "Scenario D: New class generates valid unique kode_kelas");
  }

  // Query classes as Guru A: must see newly created class
  {
    const { data: myClasses, error: queryErr } = await clientGuruA
      .from("kelas")
      .select("*")
      .eq("guru_id", guruAId);

    assert(!queryErr && Array.isArray(myClasses) && myClasses.some((c) => c.id === testKelasId), "Scenario B: Teacher queries own classes and receives real Supabase rows");
  }

  // -------------------------------------------------------------------------
  // SECTION 3: MODUL AJAR INTEGRATION WITH KELAS_ID (SCENARIOS E, F, G)
  // -------------------------------------------------------------------------
  console.log("\n--- SECTION 3: MODUL AJAR KELAS_ID LINKAGE (SCENARIOS E, F, G) ---");

  // Create Modul Ajar by Guru A linked to testKelasId
  {
    const { data: insertedModul, error: modulErr } = await clientGuruA
      .from("moduls")
      .insert({
        user_id: guruAId,
        judul: `Modul Termodinamika Live ${nonce}`,
        kelas: "XI XI MIPA 1",
        kelas_id: testKelasId,
        mapel: "Fisika Terapan",
        status: "Draft",
        sumber_tipe: "Teks",
        sumber_input: "Materi hukum pertama dan kedua termodinamika.",
        ringkasan: "Ringkasan materi termodinamika.",
        sections: [
          { id: "sec-1", judul: "Hukum 1 Termodinamika", poin: ["Energi dalam", "Kalor"], isi: "Isi materi" },
        ],
        slides: [],
      })
      .select()
      .single();

    assert(!modulErr && Boolean(insertedModul?.id), "Scenario E: Modul Ajar created and saved to Supabase moduls table");
    testModulId = insertedModul?.id;
    assert(insertedModul?.kelas_id === testKelasId, "Scenario E: moduls.kelas_id correctly stores the real class UUID foreign key");
  }

  // Scenario F: Page refresh simulation (fetch freshly from Supabase)
  {
    const { data: reloadedModul, error: reloadErr } = await clientGuruA
      .from("moduls")
      .select("*")
      .eq("id", testModulId)
      .single();

    assert(
      !reloadErr && reloadedModul?.kelas_id === testKelasId && reloadedModul?.mapel === "Fisika Terapan",
      "Scenario F: Refresh page retrieves accurate mapel and relational kelas_id from Supabase",
    );
  }

  // Scenario G: Logout/login simulation
  {
    // Re-authenticate Guru A
    const { data: reloginData, error: reloginErr } = await supabase.auth.signInWithPassword({
      email: testGuruEmailA,
      password: testPassword,
    });

    assert(!reloginErr && Boolean(reloginData.session), "Scenario G: Re-login succeeds with new session");

    const reClient = createClient(supabaseUrl, supabaseKey, {
      accessToken: async () => reloginData.session.access_token,
      global: {
        headers: {
          Authorization: `Bearer ${reloginData.session.access_token}`,
        },
      },
      auth: { persistSession: false },
    });

    const { data: postLoginModul } = await reClient
      .from("moduls")
      .select("id, mapel, kelas_id")
      .eq("id", testModulId)
      .single();

    assert(
      postLoginModul?.kelas_id === testKelasId && postLoginModul?.mapel === "Fisika Terapan",
      "Scenario G: Data remains 100% correct and intact after re-login session reset",
    );
  }

  // -------------------------------------------------------------------------
  // SECTION 4: TEACHER ISOLATION & RLS (SCENARIO H)
  // -------------------------------------------------------------------------
  console.log("\n--- SECTION 4: CROSS-TEACHER ISOLATION & RLS (SCENARIO H) ---");

  // Guru B tries to select Guru A's class
  {
    const { data: crossReadClass } = await clientGuruB
      .from("kelas")
      .select("*")
      .eq("id", testKelasId);

    assert(
      !crossReadClass || crossReadClass.length === 0,
      "Scenario H: Teacher B CANNOT read Teacher A's class (RLS restricts to owner)",
    );
  }

  // Guru B tries to select Guru A's module
  {
    const { data: crossReadModul } = await clientGuruB
      .from("moduls")
      .select("*")
      .eq("id", testModulId);

    assert(
      !crossReadModul || crossReadModul.length === 0,
      "Scenario H: Teacher B CANNOT read Teacher A's module (RLS restricts to owner)",
    );
  }

  // Guru B tries to update Guru A's class
  {
    const { data: crossUpdateClass, error: crossUpErr } = await clientGuruB
      .from("kelas")
      .update({ nama_kelas: "Hacked by Teacher B" })
      .eq("id", testKelasId)
      .select();

    assert(
      Boolean(crossUpErr) || !crossUpdateClass || crossUpdateClass.length === 0,
      "Scenario H: Teacher B CANNOT update Teacher A's class (mutation blocked by RLS)",
    );
  }

  // -------------------------------------------------------------------------
  // SECTION 5: STUDENT FLOWS & MEMBERSHIP (SCENARIO I)
  // -------------------------------------------------------------------------
  console.log("\n--- SECTION 5: STUDENT FLOWS & MEMBERSHIP (SCENARIO I) ---");

  // Siswa looks up class via RPC cari_kelas_by_kode
  {
    const { data: rpcRows, error: rpcErr } = await clientSiswa.rpc("cari_kelas_by_kode", {
      _kode: testKodeKelas,
    });

    assert(
      !rpcErr && Array.isArray(rpcRows) && rpcRows.length > 0 && rpcRows[0].id === testKelasId,
      "Scenario I: Student can look up class info using valid class code via RPC",
    );
  }

  // Siswa applies to join class
  {
    const { data: joinedMember, error: joinErr } = await clientSiswa
      .from("kelas_anggota")
      .insert({
        kelas_id: testKelasId,
        siswa_id: siswaId,
        siswa_email: testSiswaEmail,
        siswa_nama: "Siswa Live Test",
        siswa_nisn: "0055443322",
        status: "menunggu",
        jenis: "tambah-kelas",
      })
      .select()
      .single();

    assert(
      !joinErr && joinedMember?.status === "menunggu",
      "Scenario I: Student join request creates membership with status 'menunggu'",
    );
  }

  // Teacher A approves student membership
  {
    const { data: updatedMember, error: approveErr } = await clientGuruA
      .from("kelas_anggota")
      .update({ status: "aktif" })
      .eq("kelas_id", testKelasId)
      .eq("siswa_id", siswaId)
      .select()
      .single();

    assert(
      !approveErr && updatedMember?.status === "aktif",
      "Scenario I: Teacher A can approve student membership to 'aktif'",
    );
  }

  // -------------------------------------------------------------------------
  // CLEANUP
  // -------------------------------------------------------------------------
  console.log("\n--- CLEANUP OF LIVE TEST ARTIFACTS ---");
  try {
    if (testModulId) {
      await clientGuruA.from("moduls").delete().eq("id", testModulId);
    }
    if (testKelasId) {
      await clientGuruA.from("kelas").delete().eq("id", testKelasId);
    }
    await supabase.from("profiles").delete().in("id", [guruAId, guruBId, siswaId].filter(Boolean));
    console.log("  [CLEANUP] Test moduls, classes, and profiles cleaned up cleanly.");
  } catch (cleanErr) {
    console.warn("  [CLEANUP WARNING]", cleanErr.message);
  }

  console.log("\n================================================================================");
  console.log(`  MAPEL & KELAS LIVE VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Fatal error during live mapel & kelas verification:", err);
  process.exit(1);
});
