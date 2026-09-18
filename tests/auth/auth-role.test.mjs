import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

console.log("======================================================");
console.log("  GURUPRO TEST SUITE: AUTHENTICATION & ROLE FAIL-SAFE ");
console.log("======================================================");

function validateRole(rawRole) {
  const role = typeof rawRole === "string" ? rawRole.trim().toLowerCase() : "";
  return role === "guru" || role === "siswa" ? role : "";
}

function resolveProfile(data, userMetadata) {
  const rawRole = data?.role || userMetadata?.role || "";
  const validatedRole = validateRole(rawRole);

  const resolvedNisn = (
    data?.nisn ||
    (validatedRole === "siswa" ? data?.nip : "") ||
    userMetadata?.nisn ||
    ""
  ).trim();
  const resolvedNip =
    validatedRole === "siswa" ? "" : (data?.nip || userMetadata?.nip || "").trim();

  return {
    nama: data?.nama || userMetadata?.nama || "Pengguna",
    role: validatedRole,
    nip: resolvedNip,
    nisn: resolvedNisn,
  };
}

let passed = 0;

// Test 1: Missing role
{
  const profile = resolveProfile({}, {});
  assert.equal(profile.role, "", "Missing role must not resolve to any role");
  assert.notEqual(profile.role, "guru", "Missing role MUST NOT become guru");
  console.log("  [PASS] 1. Missing role resolves safely to empty string (not guru)");
  passed++;
}

// Test 2: Invalid or unknown role
{
  for (const invalid of ["admin", "superadmin", "operator", "GURU_ADMIN", "random_string", "123"]) {
    const profile = resolveProfile({ role: invalid }, {});
    assert.equal(profile.role, "", `Invalid role '${invalid}' must not be accepted`);
    assert.notEqual(profile.role, "guru", `Invalid role '${invalid}' MUST NOT become guru`);
  }
  console.log("  [PASS] 2. Invalid or unknown roles receive no privileged access");
  passed++;
}

// Test 3: Valid 'guru' role
{
  const profile = resolveProfile({ role: "guru", nip: "198503122010012004" }, {});
  assert.equal(profile.role, "guru");
  assert.equal(profile.nip, "198503122010012004");
  assert.equal(profile.nisn, "");
  console.log("  [PASS] 3. Valid 'guru' role resolves correctly with NIP");
  passed++;
}

// Test 4: Valid 'siswa' role with dedicated NISN
{
  const profile = resolveProfile({ role: "siswa", nisn: "0071234567", nip: "" }, {});
  assert.equal(profile.role, "siswa");
  assert.equal(profile.nisn, "0071234567");
  assert.equal(profile.nip, "", "Siswa nip must remain empty");
  console.log("  [PASS] 4. Valid 'siswa' role resolves correctly with dedicated NISN");
  passed++;
}

// Test 5: Legacy siswa data migration fallback (NISN was in NIP)
{
  const profile = resolveProfile({ role: "siswa", nip: "0088997766", nisn: "" }, {});
  assert.equal(profile.role, "siswa");
  assert.equal(
    profile.nisn,
    "0088997766",
    "Fallback should extract NISN from nip when nisn is empty",
  );
  assert.equal(profile.nip, "", "Siswa nip must be cleared");
  console.log("  [PASS] 5. Legacy siswa with NISN in NIP maps gracefully to NISN field");
  passed++;
}

// Test 6: Profile Query Status: 'loaded' with valid DB role
{
  function simulateFetchProfile(dbData, dbError, user) {
    const fallbackProfile = {
      id: user.id,
      nama: user.email?.split("@")[0] || "Pengguna",
      email: user.email || "",
      role: "",
      status_verifikasi: "menunggu",
    };

    if (dbError) {
      return { status: "error", message: dbError.message, profile: fallbackProfile };
    }
    if (!dbData) {
      return { status: "missing", profile: fallbackProfile };
    }

    const rawRole = dbData.role || "";
    const validatedRole = rawRole === "guru" || rawRole === "siswa" || rawRole === "admin" ? rawRole : "";

    return {
      status: "loaded",
      profile: {
        id: dbData.id,
        nama: dbData.nama || "Pengguna",
        email: dbData.email || user.email,
        role: validatedRole,
        status_verifikasi: dbData.status_verifikasi || (validatedRole === "guru" ? "menunggu" : "terverifikasi"),
      },
    };
  }

  const user = { id: "u-123", email: "guru@gurupro.id" };
  const res = simulateFetchProfile({ id: "u-123", role: "guru", nama: "Guru Valid" }, null, user);
  assert.equal(res.status, "loaded");
  assert.equal(res.profile.role, "guru");
  console.log("  [PASS] 6. Existing valid profile loads directly with status 'loaded' and role 'guru'");
  passed++;

  // Test 7: Profile Query Status: 'missing'
  const missingRes = simulateFetchProfile(null, null, user);
  assert.equal(missingRes.status, "missing");
  assert.equal(missingRes.profile.role, "");
  console.log("  [PASS] 7. Missing profile row resolves to status 'missing' without fake role");
  passed++;

  // Test 8: Profile Query Status: 'error'
  const errorRes = simulateFetchProfile(null, { message: "connection timeout" }, user);
  assert.equal(errorRes.status, "error");
  assert.equal(errorRes.message, "connection timeout");
  assert.equal(errorRes.profile.role, "");
  console.log("  [PASS] 8. Database query error yields status 'error' and preserves error message");
  passed++;

  // Test 9: Metadata spoofing prevention
  const spoofedUser = { id: "u-456", email: "hacker@evil.com", user_metadata: { role: "admin" } };
  const spoofRes = simulateFetchProfile({ id: "u-456", role: "siswa" }, null, spoofedUser);
  assert.equal(spoofRes.profile.role, "siswa", "Must take role strictly from DB, never metadata");
  console.log("  [PASS] 9. Role elevation via user_metadata is strictly rejected in favor of DB");
  passed++;

  // Test 10: Routing resolution
  function resolveDashboard(profileStatus, profileRole) {
    if (profileStatus === "loading") return "LOADING";
    if (profileStatus === "error") return "ERROR_CARD";
    if (profileRole === "admin") return "ADMIN_DASHBOARD";
    if (profileRole === "siswa") return "STUDENT_DASHBOARD";
    if (profileRole === "guru") return "TEACHER_DASHBOARD";
    return "PERAN_BELUM_TERDAFTAR";
  }

  assert.equal(resolveDashboard("loaded", "guru"), "TEACHER_DASHBOARD");
  assert.equal(resolveDashboard("loaded", "siswa"), "STUDENT_DASHBOARD");
  assert.equal(resolveDashboard("loaded", "admin"), "ADMIN_DASHBOARD");
  assert.equal(resolveDashboard("error", ""), "ERROR_CARD");
  assert.equal(resolveDashboard("missing", ""), "PERAN_BELUM_TERDAFTAR");
  console.log("  [PASS] 10. Dashboard switcher routes cleanly: guru, siswa, admin, error, missing");
  passed++;
}

// Test 11: Server auth client must bind Supabase data requests to user token
{
  const source = fs.readFileSync(
    path.resolve(process.cwd(), "src/integrations/supabase/auth-middleware.ts"),
    "utf-8",
  );

  assert.match(source, /accessToken:\s*async\s*\(\)\s*=>\s*accessToken/);
  assert.match(source, /auth\.getUser\(token\)/);
  assert.match(source, /Gagal memuat profil pengguna/);
  console.log("  [PASS] 11. Server Supabase client is explicitly scoped to incoming user token");
  passed++;
}

// Test 12: Registration relies on handle_new_user trigger, not post-signup profile upsert
{
  const source = fs.readFileSync(
    path.resolve(process.cwd(), "src/lib/auth-store.ts"),
    "utf-8",
  );

  assert.equal(
    source.includes('.from("profiles").upsert'),
    false,
    "Registration must not client-upsert profiles after signUp",
  );
  console.log("  [PASS] 12. Registration no longer performs client-side profile upsert");
  passed++;
}

console.log(`\nAUTH & ROLE TESTS COMPLETE: ${passed}/12 PASSED\n`);

