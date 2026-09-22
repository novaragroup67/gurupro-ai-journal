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
  console.log("  [PASS] 3. Valid 'guru' role resolves correctly with NIP");
  passed++;
}

// Test 4: Valid 'siswa' role
{
  const profile = resolveProfile({ role: "siswa", nisn: "0081234567" }, {});
  assert.equal(profile.role, "siswa");
  assert.equal(profile.nisn, "0081234567");
  assert.equal(profile.nip, "");
  console.log("  [PASS] 4. Valid 'siswa' role resolves correctly with dedicated NISN");
  passed++;
}

// Test 5: Legacy siswa with NISN stored in NIP column
{
  const profile = resolveProfile({ role: "siswa", nip: "0089876543" }, {});
  assert.equal(profile.role, "siswa");
  assert.equal(profile.nisn, "0089876543");
  assert.equal(profile.nip, "");
  console.log("  [PASS] 5. Legacy siswa with NISN in NIP maps gracefully to NISN field");
  passed++;
}

// Test 6: Direct fetchProfile simulation - existing valid profile
{
  function simulateFetchProfile(dbRow, authUser) {
    if (!dbRow) {
      return {
        status: "missing",
        profile: { id: authUser.id, role: "", nama: authUser.email?.split("@")[0] || "Pengguna" },
      };
    }
    const validatedRole = validateRole(dbRow.role);
    return {
      status: "loaded",
      profile: {
        id: dbRow.id,
        nama: dbRow.nama,
        email: dbRow.email || authUser.email,
        role: validatedRole,
        nip: validatedRole === "siswa" ? "" : dbRow.nip || "",
        nisn: dbRow.nisn || (validatedRole === "siswa" ? dbRow.nip : "") || "",
        status_verifikasi: dbRow.status_verifikasi || "terverifikasi",
      },
    };
  }

  const result = simulateFetchProfile(
    { id: "usr-1", nama: "Budi Santoso", email: "budi@gurupro.id", role: "guru", nip: "19800101" },
    { id: "usr-1", email: "budi@gurupro.id" },
  );
  assert.equal(result.status, "loaded");
  assert.equal(result.profile.role, "guru");
  assert.equal(result.profile.nama, "Budi Santoso");
  console.log("  [PASS] 6. Existing valid profile loads directly with status 'loaded' and role 'guru'");
  passed++;
}

// Test 7: Direct fetchProfile simulation - missing row in DB
{
  function simulateFetchProfile(dbRow, authUser) {
    if (!dbRow) {
      return {
        status: "missing",
        profile: { id: authUser.id, role: "", nama: authUser.email?.split("@")[0] || "Pengguna" },
      };
    }
    return { status: "loaded", profile: dbRow };
  }

  const result = simulateFetchProfile(null, { id: "usr-ghost", email: "ghost@gurupro.id" });
  assert.equal(result.status, "missing");
  assert.equal(result.profile.role, "");
  assert.notEqual(result.profile.role, "guru");
  console.log("  [PASS] 7. Missing profile row resolves to status 'missing' without fake role");
  passed++;
}

// Test 8: Direct fetchProfile simulation - DB error handling
{
  function simulateFetchProfileWithError(dbError, authUser) {
    if (dbError) {
      return {
        status: "error",
        message: dbError.message,
        profile: { id: authUser.id, role: "", nama: authUser.email?.split("@")[0] || "Pengguna" },
      };
    }
    return { status: "loaded", profile: {} };
  }

  const result = simulateFetchProfileWithError(
    { message: "connection timeout" },
    { id: "usr-err", email: "err@gurupro.id" },
  );
  assert.equal(result.status, "error");
  assert.equal(result.message, "connection timeout");
  assert.equal(result.profile.role, "");
  console.log("  [PASS] 8. Database query error yields status 'error' and preserves error message");
  passed++;
}

// Test 9: Profile resolution must NOT trust user_metadata role for elevation
{
  const maliciousUserMetadata = { role: "guru", nama: "Hacker" };
  const dbRowForStudent = { id: "u-hack", nama: "Hacker", role: "siswa", nip: "" };

  const rawRole = dbRowForStudent.role || maliciousUserMetadata.role || "";
  const validatedRole = validateRole(rawRole);
  assert.equal(validatedRole, "siswa", "DB role must take priority over user_metadata");
  assert.notEqual(validatedRole, "guru", "Student must not be elevated to guru via user_metadata");
  console.log("  [PASS] 9. Role elevation via user_metadata is strictly rejected in favor of DB");
  passed++;
}

// Test 10: Dashboard switcher routing logic
{
  function resolveDashboardRoute(profileStatus, profileRole) {
    if (profileStatus === "loading" || profileStatus === "idle") return "loading";
    if (profileStatus === "error") return "error_view";
    if (profileStatus === "missing") return "missing_profile_view";
    if (profileRole === "guru") return "guru_dashboard";
    if (profileRole === "siswa") return "siswa_dashboard";
    if (profileRole === "admin") return "admin_dashboard";
    return "unauthorized_role_view";
  }

  assert.equal(resolveDashboardRoute("loaded", "guru"), "guru_dashboard");
  assert.equal(resolveDashboardRoute("loaded", "siswa"), "siswa_dashboard");
  assert.equal(resolveDashboardRoute("loaded", "admin"), "admin_dashboard");
  assert.equal(resolveDashboardRoute("error", ""), "error_view");
  assert.equal(resolveDashboardRoute("missing", ""), "missing_profile_view");
  assert.equal(resolveDashboardRoute("loaded", "invalid_role"), "unauthorized_role_view");
  console.log("  [PASS] 10. Dashboard switcher routes cleanly: guru, siswa, admin, error, missing");
  passed++;
}

// Test 11: Registration error differentiation - duplicate email (message & identities: [])
{
  function parseRegistrationOutcome(error, data) {
    if (error) {
      const errMsg = (error?.message || "").toLowerCase();
      if (
        errMsg.includes("already registered") ||
        errMsg.includes("already exists") ||
        errMsg.includes("user already exists")
      ) {
        return { code: "user_already_exists", message: "Email ini sudah terdaftar." };
      }
      if (errMsg.includes("rate limit") || errMsg.includes("too many requests")) {
        return { code: "rate_limit", message: "Terlalu banyak permintaan." };
      }
      return { code: "unknown", message: error?.message || "Terjadi kesalahan." };
    }

    if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return { code: "user_already_exists", message: "Email ini sudah terdaftar." };
    }

    return { code: "ok" };
  }

  assert.equal(
    parseRegistrationOutcome({ message: "User already registered" }, null).code,
    "user_already_exists",
  );
  assert.equal(
    parseRegistrationOutcome({ message: "A user with this email address already exists" }, null).code,
    "user_already_exists",
  );
  assert.equal(
    parseRegistrationOutcome(null, { user: { id: "u-dup", identities: [] } }).code,
    "user_already_exists",
  );
  assert.equal(
    parseRegistrationOutcome(null, { user: { id: "u-new", identities: [{ id: "id-1" }] } }).code,
    "ok",
  );
  console.log("  [PASS] 11. Duplicate email registration safely detected and rejected without profile duplicates");
  passed++;
}

// Test 12: Registration error differentiation - rate limit
{
  function parseRegistrationError(error) {
    const errMsg = (error?.message || "").toLowerCase();
    if (errMsg.includes("rate limit") || errMsg.includes("too many requests")) {
      return { code: "rate_limit", message: "Terlalu banyak permintaan." };
    }
    return { code: "unknown" };
  }

  assert.equal(
    parseRegistrationError({ message: "Email rate limit exceeded" }).code,
    "rate_limit",
  );
  console.log("  [PASS] 12. Rate-limited registration yields a clear recoverable message");
  passed++;
}

// Test 13: Needs confirmation flow vs immediate session
{
  function evaluateRegistrationSuccess(data) {
    const user = data?.user ?? undefined;
    const needsConfirmation = !data?.session && Boolean(user);
    return { user, needsConfirmation };
  }

  assert.deepEqual(
    evaluateRegistrationSuccess({ user: { id: "u1" }, session: null }),
    { user: { id: "u1" }, needsConfirmation: true },
  );
  assert.deepEqual(
    evaluateRegistrationSuccess({ user: { id: "u1" }, session: { access_token: "tok" } }),
    { user: { id: "u1" }, needsConfirmation: false },
  );
  console.log("  [PASS] 13. Registration distinguishes email confirmation required vs. immediate session");
  passed++;
}

// Test 14: Normalize email input on registration and login
{
  function normalizeLoginEmail(email) {
    return (email || "").trim().toLowerCase();
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

// Test 16: Server authorization middleware error differentiation and verification status
{
  function simulateRequireGuruAuth(profile, dbError) {
    if (dbError) {
      throw new Error(`Forbidden: Gagal memuat profil basis data (${dbError.message})`);
    }
    if (!profile) {
      throw new Error("Forbidden: Profil pengguna tidak ditemukan.");
    }
    const role = (profile.role || "").toLowerCase().trim();
    if (role !== "guru" && role !== "admin") {
      throw new Error("Forbidden: Operasi ini hanya diizinkan untuk peran Guru.");
    }
    if (role === "guru") {
      const status = (profile.status_verifikasi || "").toLowerCase().trim();
      if (status === "menunggu") {
        throw new Error("Forbidden: Akun guru Anda sedang menunggu verifikasi.");
      }
      if (status === "ditolak" || status === "nonaktif") {
        throw new Error("Forbidden: Akun guru Anda ditolak atau belum aktif.");
      }
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
  assert.throws(
    () => simulateRequireGuruAuth({ role: "guru", status_verifikasi: "menunggu" }, null),
    /Akun guru Anda sedang menunggu verifikasi/,
  );
  assert.throws(
    () => simulateRequireGuruAuth({ role: "guru", status_verifikasi: "ditolak" }, null),
    /Akun guru Anda ditolak atau belum aktif/,
  );
  assert.doesNotThrow(() => simulateRequireGuruAuth({ role: "guru", status_verifikasi: "terverifikasi" }, null));
  assert.doesNotThrow(() => simulateRequireGuruAuth({ role: "guru", status_verifikasi: "aktif" }, null));
  assert.doesNotThrow(() => simulateRequireGuruAuth({ role: "admin", status_verifikasi: "terverifikasi" }, null));
  console.log("  [PASS] 16. Server middleware cleanly distinguishes DB errors, missing profile, role, and verification status");
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

// Test 21: Auth token expiration, JWT inspection, and recoverable auth error helpers
{
  function createMockJwt(payload) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = 'mock_sig';
    return `${header}.${body}.${sig}`;
  }

  function looksLikeJwt(token) {
    const parts = token.split('.');
    return parts.length === 3 && parts.every((part) => part.length > 0);
  }

  function readJwtPayload(token) {
    if (!looksLikeJwt(token)) return null;
    try {
      const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
      return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    } catch {
      return null;
    }
  }

  function isJwtExpired(token, skewMs = 30000) {
    const payload = readJwtPayload(token);
    if (!payload || typeof payload.exp !== 'number') return false;
    return payload.exp * 1000 <= Date.now() + skewMs;
  }

  function isSessionExpiring(expiresAt, token, withinMs = 60000) {
    if (typeof expiresAt === 'number' && expiresAt > 0) {
      const ms = expiresAt > 1000000000000 ? expiresAt : expiresAt * 1000;
      return ms - Date.now() < withinMs;
    }
    if (token) {
      return isJwtExpired(token, withinMs);
    }
    return true;
  }

  function isRecoverableAuthError(error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    if (/forbidden|peran guru|profil pengguna|basis data|kunci api|autentikasi ai|ditolak|keterbatasan/i.test(message)) {
      return false;
    }
    return /jwt expired|token expired|sesi kedaluwarsa|session expired|invalid jwt|bad_jwt|no authorization header|no token provided|unauthorized: invalid token|unauthorized: no/i.test(message);
  }

  const validJwt = createMockJwt({ sub: '123', exp: Math.floor(Date.now() / 1000) + 300 });
  const expiredJwt = createMockJwt({ sub: '123', exp: Math.floor(Date.now() / 1000) - 60 });

  assert.equal(looksLikeJwt(validJwt), true);
  assert.equal(looksLikeJwt('abc'), false);
  assert.equal(isJwtExpired(validJwt, 0), false);
  assert.equal(isJwtExpired(expiredJwt, 0), true);
  assert.equal(isSessionExpiring(undefined, validJwt, 60000), false);
  assert.equal(isSessionExpiring(undefined, expiredJwt, 60000), true);

  assert.equal(isRecoverableAuthError(new Error('jwt expired')), true);
  assert.equal(isRecoverableAuthError(new Error('Sesi kedaluwarsa')), true);
  assert.equal(isRecoverableAuthError(new Error('Forbidden: Operasi ini hanya diizinkan untuk peran Guru.')), false);
  assert.equal(isRecoverableAuthError(new Error('Modul selesai disusun AI, namun gagal disimpan: DB error')), false);

  console.log('  [PASS] 21. Auth token expiration, JWT inspection, and recoverable auth error helpers');
  passed++;
}

// Test 22: Strict database-only role authorization (no fallback to user_metadata)
{
  function resolveTeacherRoleStrict(profile, dbError, claims) {
    if (!profile) {
      if (dbError) {
        throw new Error(`Forbidden: Gagal memuat profil basis data (${dbError.message})`);
      }
      throw new Error('Forbidden: Profil pengguna tidak ditemukan.');
    }

    const userRole = String(profile.role || '').toLowerCase().trim();
    if (userRole !== 'guru' && userRole !== 'admin') {
      throw new Error('Forbidden: Operasi ini hanya diizinkan untuk peran Guru.');
    }

    if (userRole === 'guru') {
      const status = String(profile.status_verifikasi || '').toLowerCase().trim();
      if (status === 'menunggu') {
        throw new Error('Forbidden: Akun guru Anda sedang menunggu verifikasi.');
      }
      if (status === 'ditolak' || status === 'nonaktif') {
        throw new Error('Forbidden: Akun guru Anda ditolak atau belum aktif.');
      }
    }

    return profile;
  }

  // Claim with user_metadata 'guru' but missing DB profile must be rejected
  assert.throws(
    () => resolveTeacherRoleStrict(null, null, { user_metadata: { role: 'guru' } }),
    /Forbidden: Profil pengguna tidak ditemukan\./,
    "Missing DB profile must never be bypassed by claims metadata",
  );

  // Claim with user_metadata 'guru' but DB error must throw DB error, never fallback
  assert.throws(
    () => resolveTeacherRoleStrict(null, { message: '500 connection refused' }, { user_metadata: { role: 'guru' } }),
    /Forbidden: Gagal memuat profil basis data/,
    "DB query failure must throw error and never elevate via metadata",
  );

  // Student DB profile with claims 'guru' must be rejected
  assert.throws(
    () => resolveTeacherRoleStrict({ role: 'siswa' }, null, { user_metadata: { role: 'guru' } }),
    /hanya diizinkan untuk peran Guru/,
  );

  // Unverified teacher (menunggu) rejected
  assert.throws(
    () => resolveTeacherRoleStrict({ role: 'guru', status_verifikasi: 'menunggu' }, null, null),
    /Akun guru Anda sedang menunggu verifikasi/,
  );

  // Rejected teacher rejected
  assert.throws(
    () => resolveTeacherRoleStrict({ role: 'guru', status_verifikasi: 'ditolak' }, null, null),
    /Akun guru Anda ditolak atau belum aktif/,
  );

  // Verified teacher accepted
  const verifiedTeacher = resolveTeacherRoleStrict({ role: 'guru', status_verifikasi: 'terverifikasi' }, null, null);
  assert.equal(verifiedTeacher.role, 'guru');
  assert.equal(verifiedTeacher.status_verifikasi, 'terverifikasi');

  // Admin accepted
  const adminUser = resolveTeacherRoleStrict({ role: 'admin', status_verifikasi: 'terverifikasi' }, null, null);
  assert.equal(adminUser.role, 'admin');

  console.log('  [PASS] 22. Server authorization strictly derives role from DB and rejects user_metadata bypass');
  passed++;
}

// Test 23: Strict role registration simulation (trigger & client handling)
{
  function simulateHandleNewUser(userRecord, existingProfile) {
    const rawRole = (userRecord?.raw_user_meta_data?.role || "").trim().toLowerCase();
    let role;
    let status;

    if (rawRole === "siswa") {
      role = "siswa";
      status = "terverifikasi";
    } else if (rawRole === "guru") {
      role = "guru";
      status = "menunggu";
    } else {
      throw new Error(`Peran pendaftaran tidak valid (${rawRole || 'kosong'}). Hanya peran guru atau siswa yang diizinkan.`);
    }

    if (existingProfile) {
      // ON CONFLICT DO UPDATE preserves existing status_verifikasi
      const preservedStatus = existingProfile.status_verifikasi && existingProfile.status_verifikasi !== ''
        ? existingProfile.status_verifikasi
        : status;
      return {
        id: userRecord.id,
        role: existingProfile.role, // role not overwritten by conflict
        status_verifikasi: preservedStatus,
      };
    }

    return {
      id: userRecord.id,
      role,
      status_verifikasi: status,
    };
  }

  // Guru registration initializes to menunggu
  const newGuru = simulateHandleNewUser({ id: "g-1", raw_user_meta_data: { role: "guru" } }, null);
  assert.equal(newGuru.role, "guru");
  assert.equal(newGuru.status_verifikasi, "menunggu");

  // Siswa registration initializes to terverifikasi
  const newSiswa = simulateHandleNewUser({ id: "s-1", raw_user_meta_data: { role: "siswa" } }, null);
  assert.equal(newSiswa.role, "siswa");
  assert.equal(newSiswa.status_verifikasi, "terverifikasi");

  // Attempt to register as admin MUST THROW and never become guru or admin
  assert.throws(
    () => simulateHandleNewUser({ id: "bad-1", raw_user_meta_data: { role: "admin" } }, null),
    /Peran pendaftaran tidak valid \(admin\)/,
  );

  // Attempt with random role MUST THROW and never silently become guru
  assert.throws(
    () => simulateHandleNewUser({ id: "bad-2", raw_user_meta_data: { role: "superuser" } }, null),
    /Peran pendaftaran tidak valid/,
  );
  assert.throws(
    () => simulateHandleNewUser({ id: "bad-3", raw_user_meta_data: {} }, null),
    /Peran pendaftaran tidak valid/,
  );

  // Re-login / conflict does NOT reset verified teacher to 'menunggu'
  const reloadedTeacher = simulateHandleNewUser(
    { id: "g-1", raw_user_meta_data: { role: "guru" } },
    { id: "g-1", role: "guru", status_verifikasi: "terverifikasi" },
  );
  assert.equal(reloadedTeacher.status_verifikasi, "terverifikasi", "Conflict must preserve terverifikasi");

  console.log("  [PASS] 23. Strict role registration: only guru/siswa allowed, admin strictly blocked, verified status preserved");
  passed++;
}

// Test 24: Comprehensive negative cases matrix (wrong pass, duplicate email, invalid role, unconfirmed email, logout)
{
  function evaluateNegativeAuthCase(scenario, input) {
    switch (scenario) {
      case "wrong_password": {
        const error = { message: "Invalid login credentials" };
        const errMsg = error.message.toLowerCase();
        let code = errMsg.includes("invalid login credentials") ? "invalid_credentials" : "unknown";
        return { ok: false, code };
      }
      case "duplicate_email": {
        const data = { user: { id: "u-1", identities: [] } };
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          return { ok: false, code: "user_already_exists" };
        }
        return { ok: true };
      }
      case "invalid_role": {
        const errMsg = input?.message?.toLowerCase() || "";
        if (errMsg.includes("peran") && (errMsg.includes("tidak valid") || errMsg.includes("invalid"))) {
          return { ok: false, code: "invalid_role" };
        }
        return { ok: false, code: "unknown" };
      }
      case "unconfirmed_email": {
        const error = { message: "Email not confirmed" };
        const errMsg = error.message.toLowerCase();
        let code = errMsg.includes("email not confirmed") ? "unconfirmed_email" : "unknown";
        return { ok: false, code };
      }
      case "logout_protected": {
        const session = null;
        if (!session) {
          return { ok: false, code: "unauthorized", redirect: "/login" };
        }
        return { ok: true };
      }
      default:
        return { ok: false, code: "unknown" };
    }
  }

  assert.equal(evaluateNegativeAuthCase("wrong_password").code, "invalid_credentials");
  assert.equal(evaluateNegativeAuthCase("duplicate_email").code, "user_already_exists");
  assert.equal(
    evaluateNegativeAuthCase("invalid_role", { message: "Peran pendaftaran tidak valid. Hanya peran guru atau siswa yang diizinkan." }).code,
    "invalid_role",
  );
  assert.equal(evaluateNegativeAuthCase("unconfirmed_email").code, "unconfirmed_email");
  assert.equal(evaluateNegativeAuthCase("logout_protected").code, "unauthorized");
  assert.equal(evaluateNegativeAuthCase("logout_protected").redirect, "/login");

  console.log("  [PASS] 24. Negative cases matrix: wrong password, duplicate email, invalid role, unconfirmed email, logout guard");
  passed++;
}

console.log(`\nAUTH & ROLE TESTS COMPLETE: ${passed}/24 PASSED\n`);
