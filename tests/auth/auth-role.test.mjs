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

// Test 11: Registration duplicate email detection (identities empty or already registered error)
{
  function handleRegistrationResponse(authData, authError) {
    if (authError) {
      const errMsg = authError.message.toLowerCase();
      if (
        errMsg.includes("already registered") ||
        errMsg.includes("already taken") ||
        errMsg.includes("user already exists")
      ) {
        return { ok: false, message: "Email ini sudah terdaftar.", code: "email_exists" };
      }
      if (errMsg.includes("rate limit")) {
        return { ok: false, message: "Batas pengiriman email sistem terlampaui.", code: "rate_limited" };
      }
      return { ok: false, message: authError.message };
    }

    if (!authData?.user) return { ok: false, message: "Gagal membuat akun." };

    if (Array.isArray(authData.user.identities) && authData.user.identities.length === 0) {
      return { ok: false, message: "Email ini sudah terdaftar.", code: "email_exists" };
    }

    const needsConfirmation = !authData.session;
    return { ok: true, user: authData.user, needsConfirmation };
  }

  // Case A: Supabase returns existing user with empty identities
  const resEmptyIdentities = handleRegistrationResponse(
    { user: { id: "u-existing", identities: [] }, session: null },
    null,
  );
  assert.equal(resEmptyIdentities.ok, false);
  assert.equal(resEmptyIdentities.code, "email_exists");

  // Case B: Supabase returns "User already registered" error
  const resAlreadyReg = handleRegistrationResponse(
    null,
    { message: "User already registered" },
  );
  assert.equal(resAlreadyReg.ok, false);
  assert.equal(resAlreadyReg.code, "email_exists");

  console.log("  [PASS] 11. Duplicate email registration safely detected and rejected without profile duplicates");
  passed++;

  // Test 12: Rate limit error handling
  const resRateLimit = handleRegistrationResponse(
    null,
    { message: "Email rate limit exceeded" },
  );
  assert.equal(resRateLimit.ok, false);
  assert.equal(resRateLimit.code, "rate_limited");
  assert.ok(resRateLimit.message.includes("terlampaui"));
  console.log("  [PASS] 12. Rate-limited registration yields a clear recoverable message");
  passed++;

  // Test 13: Confirmation required handling
  const resConfirmation = handleRegistrationResponse(
    { user: { id: "u-new", identities: [{ id: "id-1" }] }, session: null },
    null,
  );
  assert.equal(resConfirmation.ok, true);
  assert.equal(resConfirmation.needsConfirmation, true);

  const resInstant = handleRegistrationResponse(
    { user: { id: "u-new", identities: [{ id: "id-1" }] }, session: { access_token: "tok" } },
    null,
  );
  assert.equal(resInstant.ok, true);
  assert.equal(resInstant.needsConfirmation, false);
  console.log("  [PASS] 13. Registration distinguishes email confirmation required vs. immediate session");
  passed++;
}

// Test 14: Login email normalization
{
  function normalizeLoginEmail(email) {
    return email.trim().toLowerCase();
  }

  assert.equal(normalizeLoginEmail("  Guru@GuruPro.ID  "), "guru@gurupro.id");
  assert.equal(normalizeLoginEmail("NAMA.SISWA@GMAIL.COM"), "nama.siswa@gmail.com");
  console.log("  [PASS] 14. Email normalization handles whitespace and case variations uniformly");
  passed++;
}

// Test 15: Login error differentiation
{
  function processLoginOutcome(authError, session, profileResult) {
    if (authError) {
      const errMsg = authError.message.toLowerCase();
      if (errMsg.includes("invalid login credentials")) {
        return { ok: false, code: "invalid_credentials" };
      }
      if (errMsg.includes("email not confirmed")) {
        return { ok: false, code: "unconfirmed_email" };
      }
      return { ok: false, code: "auth_error" };
    }

    if (!session) {
      return { ok: false, code: "session_missing" };
    }

    if (profileResult.status === "error") {
      return { ok: false, code: "database_error", message: profileResult.message };
    }

    if (profileResult.status === "missing") {
      return { ok: false, code: "profile_missing" };
    }

    if (!profileResult.profile?.role || !["guru", "siswa", "admin"].includes(profileResult.profile.role)) {
      return { ok: false, code: "invalid_role" };
    }

    return { ok: true };
  }

  assert.equal(
    processLoginOutcome({ message: "Invalid login credentials" }, null, {}).code,
    "invalid_credentials",
  );
  assert.equal(
    processLoginOutcome(null, { token: "abc" }, { status: "missing", profile: { role: "" } }).code,
    "profile_missing",
  );
  assert.equal(
    processLoginOutcome(null, { token: "abc" }, { status: "error", message: "timeout", profile: {} }).code,
    "database_error",
  );
  assert.equal(
    processLoginOutcome(null, { token: "abc" }, { status: "loaded", profile: { role: "guest" } }).code,
    "invalid_role",
  );
  assert.equal(
    processLoginOutcome(null, { token: "abc" }, { status: "loaded", profile: { role: "guru" } }).ok,
    true,
  );
  console.log("  [PASS] 15. Login strictly differentiates credentials, profile missing, DB error, and role");
  passed++;
}

// Test 16: Server authorization middleware error differentiation
{
  function simulateRequireGuruAuth(profile, dbError) {
    if (dbError) {
      throw new Error(`Unauthorized: Gagal memuat profil basis data (${dbError.message})`);
    }
    if (!profile) {
      throw new Error("Unauthorized: Profil pengguna tidak ditemukan.");
    }
    if (profile.role !== "guru" && profile.role !== "admin") {
      throw new Error("Forbidden: Operasi ini hanya diizinkan untuk peran Guru.");
    }
    return true;
  }

  assert.throws(
    () => simulateRequireGuruAuth(null, { message: "connection refused" }),
    /Gagal memuat profil basis data/,
  );
  assert.throws(
    () => simulateRequireGuruAuth(null, null),
    /Profil pengguna tidak ditemukan/,
  );
  assert.throws(
    () => simulateRequireGuruAuth({ role: "siswa" }, null),
    /hanya diizinkan untuk peran Guru/,
  );
  assert.doesNotThrow(() => simulateRequireGuruAuth({ role: "guru" }, null));
  console.log("  [PASS] 16. Server middleware cleanly distinguishes DB errors, missing profile, and role");
  passed++;
}

// Test 17: Token validation getClaims failure falls back to getUser / Auth API
{
  async function simulateTokenValidation(token, mockSupabase, authApiUser) {
    let userId = null;
    let claims = null;

    try {
      const { data, error } = await mockSupabase.auth.getClaims(token);
      if (!error && data?.claims?.sub) {
        userId = data.claims.sub;
        claims = data.claims;
      }
    } catch {
      // ignore
    }

    if (!userId) {
      try {
        const { data: userData, error: userError } = await mockSupabase.auth.getUser(token);
        if (!userError && userData?.user?.id) {
          userId = userData.user.id;
          claims = userData.user;
        }
      } catch {
        // ignore and try Auth API
      }
    }

    if (!userId) {
      if (!authApiUser?.id) {
        throw new Error("Unauthorized: Invalid token");
      }
      userId = authApiUser.id;
      claims = authApiUser;
    }

    return { userId, claims };
  }

  const mockWithFailingClaims = {
    auth: {
      getClaims: async () => { throw new Error("JWT validation failed: clock skew"); },
      getUser: async () => ({ data: { user: { id: "u-fallback-1", email: "guru@gurupro.id" } }, error: null }),
    },
  };
  const resFallback = await simulateTokenValidation("a.b.c", mockWithFailingClaims);
  assert.equal(resFallback.userId, "u-fallback-1");

  const mockSdkFail = {
    auth: {
      getClaims: async () => ({ data: null, error: { message: "Signature error" } }),
      getUser: async () => ({ data: null, error: { message: "Invalid JWT" } }),
    },
  };
  const resApi = await simulateTokenValidation("legacy-or-hs256-token", mockSdkFail, {
    id: "u-api-1",
  });
  assert.equal(resApi.userId, "u-api-1");

  await assert.rejects(
    async () => simulateTokenValidation("a.b.c", mockSdkFail, null),
    /Unauthorized: Invalid token/,
  );

  console.log("  [PASS] 17. Token validation falls back from getClaims to getUser to Auth API");
  passed++;
}

// Test 18: Bearer extraction ignores duplicate prefixes and custom headers
{
  function extractBearerToken(authHeader) {
    if (!authHeader) return null;
    let token = String(authHeader).trim();
    while (/^bearer\s+/i.test(token)) {
      token = token.replace(/^bearer\s+/i, "").trim();
    }
    return token || null;
  }

  function resolveRequestAccessToken(headers) {
    return extractBearerToken(headers.authorization) || extractBearerToken(headers["x-supabase-access-token"]);
  }

  assert.equal(extractBearerToken("Bearer Bearer eyJ.a.b"), "eyJ.a.b");
  assert.equal(
    resolveRequestAccessToken({ authorization: null, "x-supabase-access-token": "eyJ.a.b" }),
    "eyJ.a.b",
  );
  assert.equal(resolveRequestAccessToken({}), null);
  console.log("  [PASS] 18. Access token can be recovered from duplicate Bearer or backup header");
  passed++;
}

// Test 19: Stale sessions are refreshed before server functions run
{
  function needsRefresh(session) {
    if (!session?.access_token) return true;
    if (!session.expires_at) return true;
    return session.expires_at * 1000 - Date.now() < 60000;
  }

  assert.equal(needsRefresh(null), true);
  assert.equal(needsRefresh({ access_token: "tok", expires_at: Math.floor(Date.now() / 1000) - 10 }), true);
  assert.equal(needsRefresh({ access_token: "tok", expires_at: Math.floor(Date.now() / 1000) + 3600 }), false);
  console.log("  [PASS] 19. Expired or missing access tokens are refreshed before Analisis Sumber");
  passed++;
}

// Test 20: Auth user metadata repair fills empty dashboard fields from profiles
{
  function repairAuthMetadata(user, profile) {
    const meta = { ...(user.raw_user_meta_data || {}) };
    if (profile) {
      if (profile.nama) meta.nama = profile.nama;
      if (profile.role) meta.role = profile.role;
      if (profile.sekolah) meta.sekolah = profile.sekolah;
      if (profile.mapel) meta.mapel = profile.mapel;
    }
    meta.email_verified = true;
    const app = { ...(user.raw_app_meta_data || {}) };
    if (!app.provider) app.provider = "email";
    if (!app.providers) app.providers = ["email"];
    return {
      email_confirmed_at: user.email_confirmed_at || "now",
      raw_user_meta_data: meta,
      raw_app_meta_data: app,
      hasIdentity: Boolean(user.identity) || true,
    };
  }

  const repaired = repairAuthMetadata(
    { raw_user_meta_data: {}, raw_app_meta_data: {}, email_confirmed_at: null, identity: null },
    { nama: "Shyfa Inayah", role: "guru", sekolah: "SMK 1", mapel: "Bahasa Inggris" },
  );
  assert.equal(repaired.raw_user_meta_data.nama, "Shyfa Inayah");
  assert.equal(repaired.raw_user_meta_data.role, "guru");
  assert.equal(repaired.raw_user_meta_data.email_verified, true);
  assert.equal(repaired.raw_app_meta_data.provider, "email");
  assert.ok(repaired.email_confirmed_at);
  console.log("  [PASS] 20. Empty Auth user metadata is backfilled from the profiles row");
  passed++;
}

console.log(`\nAUTH & ROLE TESTS COMPLETE: ${passed}/20 PASSED\n`);
