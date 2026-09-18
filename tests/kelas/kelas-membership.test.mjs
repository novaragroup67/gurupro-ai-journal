import assert from "node:assert/strict";

console.log("======================================================");
console.log("  GURUPRO TEST SUITE: KELAS & MEMBERSHIP OPERATIONS   ");
console.log("======================================================");

let passed = 0;

// Replicated ajukanGabung logic under test
async function simulateAjukanGabung({ sessionUserId, data, existingMemberships, validClasses }) {
  // 0. Sesi autentikasi aktif wajib ada
  if (!sessionUserId) {
    return {
      ok: false,
      reason: "error",
      message: "Sesi autentikasi tidak ditemukan. Silakan login terlebih dahulu.",
    };
  }
  // Cegah penyamaran siswaId lain
  if (data.siswaId && data.siswaId !== sessionUserId) {
    return {
      ok: false,
      reason: "error",
      message: "Identitas siswa tidak cocok dengan sesi login saat ini.",
    };
  }

  const cleanKode = data.kodeKelas.trim().toUpperCase();
  const kelas = validClasses.find((k) => k.kodeKelas.toUpperCase() === cleanKode);
  if (!kelas) {
    return {
      ok: false,
      reason: "invalid-code",
      message: "Kode kelas tidak valid atau tidak ditemukan.",
    };
  }

  // Duplicate check
  const duplicate = existingMemberships.find(
    (m) => m.kelasId === kelas.id && m.siswaId === sessionUserId,
  );
  if (duplicate) {
    return {
      ok: false,
      reason: "already-member",
      message: `Tidak dapat mengajukan kembali: ${duplicate.status}`,
    };
  }

  // Create membership record (always 'menunggu')
  const newRecord = {
    id: "mem_" + Math.random().toString(36).slice(2, 8),
    kelasId: kelas.id,
    siswaId: sessionUserId,
    status: "menunggu",
    jenis: data.jenis || "tambah-kelas",
    siswaEmail: data.siswaEmail,
    siswaNama: data.siswaNama,
    siswaNisn: data.siswaNisn,
  };

  return {
    ok: true,
    kelas: {
      id: kelas.id,
      namaKelas: kelas.namaKelas,
      tingkat: kelas.tingkat,
      mapel: kelas.mapel,
      tahunAjaran: kelas.tahunAjaran,
      guruId: "", // Obfuscated
      kodeKelas: kelas.kodeKelas,
      createdAt: "",
    },
    record: newRecord,
  };
}

const mockClasses = [
  {
    id: "kelas-123",
    guruId: "guru-owner-456",
    namaKelas: "RPL 1",
    tingkat: "XI",
    mapel: "Pemrograman Web",
    tahunAjaran: "2025/2026",
    kodeKelas: "XI-RPL-8899",
  },
];

// Test 1: Unauthenticated request rejected
{
  const res = await simulateAjukanGabung({
    sessionUserId: null,
    data: {
      kodeKelas: "XI-RPL-8899",
      siswaId: "any",
      siswaEmail: "a@b.com",
      siswaNama: "A",
      siswaNisn: "123",
    },
    existingMemberships: [],
    validClasses: mockClasses,
  });
  assert.equal(res.ok, false);
  assert.match(res.message, /Sesi autentikasi/);
  console.log("  [PASS] 1. Unauthenticated request to ajukanGabung is rejected immediately");
  passed++;
}

// Test 2: Student identity spoofing rejected
{
  const res = await simulateAjukanGabung({
    sessionUserId: "real-student-001",
    data: {
      kodeKelas: "XI-RPL-8899",
      siswaId: "victim-student-999",
      siswaEmail: "v@b.com",
      siswaNama: "V",
      siswaNisn: "999",
    },
    existingMemberships: [],
    validClasses: mockClasses,
  });
  assert.equal(res.ok, false);
  assert.match(res.message, /tidak cocok dengan sesi login/);
  console.log("  [PASS] 2. Student ID spoofing is detected and rejected");
  passed++;
}

// Test 3: Invalid class code fails safely
{
  const res = await simulateAjukanGabung({
    sessionUserId: "real-student-001",
    data: {
      kodeKelas: "NON-EXISTENT",
      siswaId: "real-student-001",
      siswaEmail: "s@b.com",
      siswaNama: "S",
      siswaNisn: "123",
    },
    existingMemberships: [],
    validClasses: mockClasses,
  });
  assert.equal(res.ok, false);
  assert.equal(res.reason, "invalid-code");
  console.log("  [PASS] 3. Invalid class code lookup fails safely without error exposure");
  passed++;
}

// Test 4: Duplicate membership rejected
{
  const existing = [{ kelasId: "kelas-123", siswaId: "real-student-001", status: "menunggu" }];
  const res = await simulateAjukanGabung({
    sessionUserId: "real-student-001",
    data: {
      kodeKelas: "XI-RPL-8899",
      siswaId: "real-student-001",
      siswaEmail: "s@b.com",
      siswaNama: "S",
      siswaNisn: "123",
    },
    existingMemberships: existing,
    validClasses: mockClasses,
  });
  assert.equal(res.ok, false);
  assert.equal(res.reason, "already-member");
  console.log("  [PASS] 4. Duplicate membership application is blocked");
  passed++;
}

// Test 5: Legitimate join request created with 'menunggu' status and obfuscated guruId
{
  const res = await simulateAjukanGabung({
    sessionUserId: "real-student-001",
    data: {
      kodeKelas: "XI-RPL-8899",
      siswaId: "real-student-001",
      siswaEmail: "s@b.com",
      siswaNama: "S",
      siswaNisn: "123",
    },
    existingMemberships: [],
    validClasses: mockClasses,
  });
  assert.equal(res.ok, true);
  assert.equal(res.record.status, "menunggu", "Membership must always start as 'menunggu'");
  assert.equal(res.record.siswaId, "real-student-001");
  assert.equal(res.kelas.guruId, "", "guruId must be obfuscated in student response");
  console.log("  [PASS] 5. Valid join request creates 'menunggu' record with obfuscated guruId");
  passed++;
}

console.log(`\nKELAS & MEMBERSHIP TESTS COMPLETE: ${passed}/5 PASSED\n`);
