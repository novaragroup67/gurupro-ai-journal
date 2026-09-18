import assert from "node:assert/strict";

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

console.log(`\nAUTH & ROLE TESTS COMPLETE: ${passed}/5 PASSED\n`);
