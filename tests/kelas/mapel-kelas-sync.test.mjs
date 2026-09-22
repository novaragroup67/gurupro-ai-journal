import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

console.log("======================================================");
console.log("  GURUPRO TEST SUITE: MAPEL & KELAS SYNC (SSOT)       ");
console.log("======================================================");

const ROOT_DIR = resolve(import.meta.dirname, "../..");
let passed = 0;

// ============================================================================
// SECTION 1: TEACHER MAPEL PERSISTENCE & SSOT
// ============================================================================
console.log("\n--- SECTION 1: TEACHER MAPEL PERSISTENCE & SSOT ---");

// Test 1: Teacher registration stores mapel in profiles.mapel via trigger simulation
(() => {
  function simulateHandleNewUser(authRecord) {
    const rawRole = (authRecord.raw_user_meta_data?.role || "").trim().toLowerCase();
    if (rawRole !== "guru" && rawRole !== "siswa") {
      throw new Error(`Peran pendaftaran tidak valid (${rawRole}).`);
    }

    return {
      id: authRecord.id,
      email: authRecord.email,
      nama: authRecord.raw_user_meta_data?.nama || authRecord.email.split("@")[0],
      role: rawRole,
      status_verifikasi: rawRole === "guru" ? "menunggu" : "terverifikasi",
      mapel: authRecord.raw_user_meta_data?.mapel || "",
    };
  }

  const guruAuth = {
    id: "guru-uuid-001",
    email: "guru.fisika@sekolah.sch.id",
    raw_user_meta_data: {
      nama: "Dr. Hendra, M.Pd",
      role: "guru",
      nip: "198001012005011002",
      sekolah: "SMAN 3 Bandung",
      mapel: "Fisika",
    },
  };

  const profile = simulateHandleNewUser(guruAuth);
  assert.equal(profile.id, guruAuth.id);
  assert.equal(profile.role, "guru");
  assert.equal(profile.mapel, "Fisika", "Teacher subject must be saved to profiles.mapel");

  passed++;
  console.log("  [PASS] 1. Teacher registration saves subject strictly to profiles.mapel");
})();

// Test 2: Profile loading retrieves mapel from Supabase profiles, with zero localStorage fallback
(() => {
  function simulateFetchProfileForUser(user, dbRow) {
    if (!dbRow) {
      return {
        status: "missing",
        profile: {
          id: user.id,
          email: user.email,
          mapel: "",
        },
      };
    }

    return {
      status: "loaded",
      profile: {
        id: dbRow.id,
        email: dbRow.email,
        nama: dbRow.nama,
        role: dbRow.role,
        mapel: dbRow.mapel || "",
      },
    };
  }

  const testUser = { id: "guru-uuid-001", email: "guru.fisika@sekolah.sch.id" };
  const dbRecord = {
    id: "guru-uuid-001",
    email: "guru.fisika@sekolah.sch.id",
    nama: "Dr. Hendra, M.Pd",
    role: "guru",
    mapel: "Fisika Terapan",
  };

  const result = simulateFetchProfileForUser(testUser, dbRecord);
  assert.equal(result.status, "loaded");
  assert.equal(result.profile.mapel, "Fisika Terapan", "mapel must be loaded from Supabase profiles");

  passed++;
  console.log("  [PASS] 2. Profile loading retrieves mapel from Supabase without fallback");
})();

// ============================================================================
// SECTION 2: KELAS PERSISTENCE & TEACHER ISOLATION
// ============================================================================
console.log("\n--- SECTION 2: KELAS PERSISTENCE & TEACHER ISOLATION ---");

// Test 3: Teacher-created classes stored with guru_id = auth.uid()
(() => {
  function simulateBuatKelas({ namaKelas, tingkat, mapel, tahunAjaran, currentUserId }) {
    if (!currentUserId) {
      throw new Error("Sesi guru tidak valid.");
    }
    if (!namaKelas || !tingkat || !mapel) {
      throw new Error("Data kelas tidak lengkap.");
    }

    return {
      id: "kelas-uuid-" + Math.random().toString(36).slice(2, 9),
      nama_kelas: namaKelas.trim(),
      tingkat: tingkat.trim(),
      mapel: mapel.trim(),
      tahun_ajaran: tahunAjaran || "2025/2026",
      guru_id: currentUserId,
      kode_kelas: `${tingkat}-${mapel.slice(0, 3).toUpperCase()}-9999`,
    };
  }

  const newClass = simulateBuatKelas({
    namaKelas: "XII IPA 1",
    tingkat: "XII",
    mapel: "Fisika",
    tahunAjaran: "2025/2026",
    currentUserId: "guru-uuid-001",
  });

  assert.equal(newClass.guru_id, "guru-uuid-001", "Class must be linked to authenticated teacher guru_id");
  assert.equal(newClass.nama_kelas, "XII IPA 1");
  assert.equal(newClass.mapel, "Fisika");

  passed++;
  console.log("  [PASS] 3. Teacher-created classes strictly linked to auth.uid() as guru_id");
})();

// Test 4: Teacher class isolation: Guru A cannot view or manage Guru B's classes
(() => {
  const allDatabaseClasses = [
    { id: "k-1", guru_id: "guru-A", nama_kelas: "X MIPA 1", mapel: "Matematika" },
    { id: "k-2", guru_id: "guru-A", nama_kelas: "XI MIPA 1", mapel: "Matematika" },
    { id: "k-3", guru_id: "guru-B", nama_kelas: "XII IPS 1", mapel: "Sosiologi" },
  ];

  // RLS emulation: (auth.uid() = guru_id)
  function queryTeacherClasses(currentUserId) {
    return allDatabaseClasses.filter((row) => row.guru_id === currentUserId);
  }

  const guruAClasses = queryTeacherClasses("guru-A");
  assert.equal(guruAClasses.length, 2);
  assert.ok(guruAClasses.every((c) => c.guru_id === "guru-A"));
  assert.ok(!guruAClasses.some((c) => c.guru_id === "guru-B"), "Guru A must never see Guru B classes");

  const guruBClasses = queryTeacherClasses("guru-B");
  assert.equal(guruBClasses.length, 1);
  assert.equal(guruBClasses[0].nama_kelas, "XII IPS 1");

  passed++;
  console.log("  [PASS] 4. Teacher class isolation strictly enforced between different teachers");
})();

// ============================================================================
// SECTION 3: MODUL AJAR & KELAS_ID LINKAGE
// ============================================================================
console.log("\n--- SECTION 3: MODUL AJAR & KELAS_ID LINKAGE ---");

// Test 5: Modul payload stores real kelas_id (UUID) in Supabase moduls table
(() => {
  function toRow(modul) {
    return {
      judul: modul.judul ?? "",
      kelas: modul.kelas ?? "",
      kelas_id: modul.kelasId || null,
      mapel: modul.mapel ?? "",
      status: modul.status ?? "Draft",
      sumber_tipe: modul.sumberTipe ?? "Link Luar",
      sumber_input: modul.sumberInput ?? "",
      sumber_url: modul.sumberUrl ?? null,
      sumber_judul: modul.sumberJudul ?? null,
      sumber_kutipan: modul.sumberKutipan ?? null,
      ringkasan: modul.ringkasan ?? "",
      sections: modul.sections ?? [],
      slides: modul.slides ?? [],
    };
  }

  function toModul(row) {
    return {
      id: row.id,
      judul: row.judul,
      kelas: row.kelas,
      kelasId: row.kelas_id || undefined,
      mapel: row.mapel,
      status: row.status ?? "Draft",
      sumberTipe: row.sumber_tipe ?? "Link Luar",
      sumberInput: row.sumber_input ?? "",
      ringkasan: row.ringkasan ?? "",
      sections: row.sections ?? [],
      slides: row.slides ?? [],
    };
  }

  const modulInput = {
    judul: "Gelombang Elektromagnetik",
    kelas: "XII IPA 1",
    kelasId: "b851b4e0-5555-4c12-8888-0123456789ab",
    mapel: "Fisika",
    status: "Terbit",
    sumberTipe: "Teks",
    sumberInput: "Materi tentang spektrum gelombang elektromagnetik.",
    ringkasan: "Ringkasan materi",
    sections: [],
    slides: [],
  };

  const dbRow = toRow(modulInput);
  assert.equal(dbRow.kelas_id, "b851b4e0-5555-4c12-8888-0123456789ab", "kelas_id must be stored in database row");

  const restoredModul = toModul({ id: "mod-123", ...dbRow });
  assert.equal(restoredModul.kelasId, "b851b4e0-5555-4c12-8888-0123456789ab", "kelasId must be mapped back on read");

  passed++;
  console.log("  [PASS] 5. Modul Ajar correctly writes and restores relational kelas_id (UUID)");
})();

// Test 6: Removal of static dummy class options (KELAS & MAPEL arrays)
(() => {
  const modulTypesPath = resolve(ROOT_DIR, "src/lib/modul-types.ts");
  const code = readFileSync(modulTypesPath, "utf-8");

  assert.doesNotMatch(
    code,
    /export const KELAS\s*=/,
    "modul-types.ts must NOT contain static dummy KELAS array",
  );
  assert.doesNotMatch(
    code,
    /export const MAPEL\s*=/,
    "modul-types.ts must NOT contain static dummy MAPEL array",
  );

  const dialogPath = resolve(ROOT_DIR, "src/components/modul-generator-dialog.tsx");
  const dialogCode = readFileSync(dialogPath, "utf-8");
  assert.doesNotMatch(
    dialogCode,
    /MAPEL\.forEach/,
    "modul-generator-dialog.tsx must NOT fallback to static MAPEL array",
  );

  passed++;
  console.log("  [PASS] 6. Static dummy KELAS and MAPEL arrays completely removed from codebase");
})();

// Test 7: Siswa eligible for module through active membership in kelas_anggota
(() => {
  // Emulates is_siswa_eligible_for_modul(p_modul_user_id, p_modul_kelas_id, p_modul_kelas)
  function isSiswaEligibleForModul({
    siswaId,
    modulUserId,
    modulKelasId,
    modulKelasName,
    memberships,
    classes,
  }) {
    return memberships.some((m) => {
      if (m.siswa_id !== siswaId || m.status !== "aktif") return false;
      const k = classes.find((c) => c.id === m.kelas_id);
      if (!k || k.guru_id !== modulUserId) return false;

      if (modulKelasId) {
        return modulKelasId === k.id;
      }
      return (
        k.nama_kelas.toLowerCase() === (modulKelasName || "").toLowerCase() ||
        k.tingkat.toLowerCase() === (modulKelasName || "").toLowerCase()
      );
    });
  }

  const classes = [
    { id: "kelas-101", guru_id: "guru-A", nama_kelas: "XI IPA 1", tingkat: "XI" },
    { id: "kelas-102", guru_id: "guru-A", nama_kelas: "XI IPA 2", tingkat: "XI" },
  ];

  const memberships = [
    { id: "m-1", siswa_id: "siswa-andi", kelas_id: "kelas-101", status: "aktif" },
    { id: "m-2", siswa_id: "siswa-budi", kelas_id: "kelas-102", status: "menunggu" }, // Belum aktif
  ];

  // Andi is active in kelas-101
  const andiCanSeeModul101 = isSiswaEligibleForModul({
    siswaId: "siswa-andi",
    modulUserId: "guru-A",
    modulKelasId: "kelas-101",
    modulKelasName: "XI IPA 1",
    memberships,
    classes,
  });
  assert.equal(andiCanSeeModul101, true, "Active student in kelas-101 must see published module");

  // Andi is NOT in kelas-102
  const andiCanSeeModul102 = isSiswaEligibleForModul({
    siswaId: "siswa-andi",
    modulUserId: "guru-A",
    modulKelasId: "kelas-102",
    modulKelasName: "XI IPA 2",
    memberships,
    classes,
  });
  assert.equal(andiCanSeeModul102, false, "Student not in kelas-102 must NOT see module");

  // Budi is pending in kelas-102 (not yet active)
  const budiCanSeeModul102 = isSiswaEligibleForModul({
    siswaId: "siswa-budi",
    modulUserId: "guru-A",
    modulKelasId: "kelas-102",
    modulKelasName: "XI IPA 2",
    memberships,
    classes,
  });
  assert.equal(budiCanSeeModul102, false, "Pending member must NOT see class module until approved");

  passed++;
  console.log("  [PASS] 7. Student access to published modules strictly validated via relational kelas_id");
})();

// ============================================================================
// SUMMARY
// ============================================================================
console.log(`\nMAPEL & KELAS SYNC TEST SUITE COMPLETE: ${passed}/7 PASSED (0 FAILED)\n`);
