import assert from "node:assert/strict";

console.log("==================================================================");
console.log("  GURUPRO TEST SUITE: KKM & TEACHER-CONTROLLED REMEDIAL SYSTEM   ");
console.log("==================================================================");

let passed = 0;

// ============================================================================
// 1. KKM CONFIGURATION & CLAMPING RULES (RULES 1 & 2)
// ============================================================================

function sanitizeKkm(input) {
  if (input === undefined || input === null || isNaN(Number(input))) {
    return 75; // Default KKM
  }
  return Math.min(100, Math.max(0, Math.round(Number(input))));
}

console.log("\n[Test 1] KKM Default & Bounds Clamping");
assert.equal(sanitizeKkm(undefined), 75, "Default KKM must be 75 when undefined");
assert.equal(sanitizeKkm(null), 75, "Default KKM must be 75 when null");
assert.equal(sanitizeKkm("abc"), 75, "Default KKM must be 75 when invalid string");
assert.equal(sanitizeKkm(80), 80, "Specified KKM 80 must be preserved");
assert.equal(sanitizeKkm(-10), 0, "Negative KKM must clamp to 0");
assert.equal(sanitizeKkm(150), 100, "KKM > 100 must clamp to 100");
assert.equal(sanitizeKkm(72.6), 73, "Float KKM must round to integer");
console.log("  ✓ KKM properly defaults to 75 and clamps within [0, 100]");
passed++;

// ============================================================================
// 2. REMEDIAL PACKAGE INTEGRITY & CONSTRAINT VALIDATION (RULES 3 & 4)
// ============================================================================

function validateAssignmentPayload({ paketSoalId, kkm, remedialEnabled, remedialPaketSoalId }) {
  const cleanKkm = sanitizeKkm(kkm);
  const isRemedial = Boolean(remedialEnabled);

  if (isRemedial) {
    if (!remedialPaketSoalId) {
      return { ok: false, error: "Paket soal remedial wajib dipilih jika remedial diaktifkan" };
    }
    if (remedialPaketSoalId === paketSoalId) {
      return { ok: false, error: "Paket soal remedial harus berbeda dari paket soal utama" };
    }
  }

  return {
    ok: true,
    data: {
      paketSoalId,
      kkm: cleanKkm,
      remedialEnabled: isRemedial,
      remedialPaketSoalId: isRemedial ? remedialPaketSoalId : null,
    },
  };
}

console.log("\n[Test 2] Remedial Package Distinction & Constraints");
const invalidSamePackage = validateAssignmentPayload({
  paketSoalId: "paket-A",
  kkm: 75,
  remedialEnabled: true,
  remedialPaketSoalId: "paket-A",
});
assert.equal(invalidSamePackage.ok, false, "Must reject identical remedial and main package");
assert.match(invalidSamePackage.error, /harus berbeda/);

const invalidMissingRemedialPackage = validateAssignmentPayload({
  paketSoalId: "paket-A",
  kkm: 75,
  remedialEnabled: true,
  remedialPaketSoalId: null,
});
assert.equal(invalidMissingRemedialPackage.ok, false, "Must reject missing remedial package when enabled");

const validRemedial = validateAssignmentPayload({
  paketSoalId: "paket-A",
  kkm: 75,
  remedialEnabled: true,
  remedialPaketSoalId: "paket-B",
});
assert.equal(validRemedial.ok, true, "Must accept distinct remedial package");
assert.equal(validRemedial.data.remedialPaketSoalId, "paket-B");

const validDisabledRemedial = validateAssignmentPayload({
  paketSoalId: "paket-A",
  kkm: 70,
  remedialEnabled: false,
  remedialPaketSoalId: "paket-B",
});
assert.equal(validDisabledRemedial.ok, true);
assert.equal(validDisabledRemedial.data.remedialPaketSoalId, null, "Must nullify remedial package when disabled");
console.log("  ✓ Distinct package constraints and validation enforced strictly");
passed++;

// ============================================================================
// 3. REMEDIAL ELIGIBILITY LOGIC (RULES 5, 6, 12, 13)
// ============================================================================

function evaluateRemedialEligibility({
  penugasan,
  originalSubmission,
}) {
  if (!penugasan.remedialEnabled) {
    return {
      isEligible: false,
      reason: "Remedial tidak diaktifkan oleh guru untuk penugasan ini.",
    };
  }

  if (!penugasan.remedialPaketSoalId) {
    return {
      isEligible: false,
      reason: "Paket soal remedial belum dikonfigurasi oleh guru.",
    };
  }

  if (!originalSubmission || originalSubmission.status !== "submitted") {
    return {
      isEligible: false,
      reason: "Siswa belum mengumpulkan tugas utama.",
    };
  }

  if (originalSubmission.nilaiAkhir === null || originalSubmission.nilaiAkhir === undefined) {
    return {
      isEligible: false,
      reason: "Tugas utama siswa belum selesai dinilai oleh guru.",
    };
  }

  const kkm = penugasan.kkm ?? 75;
  if (originalSubmission.nilaiAkhir >= kkm) {
    return {
      isEligible: false,
      reason: `Nilai siswa (${originalSubmission.nilaiAkhir}) telah mencapai/melampaui KKM (${kkm}).`,
    };
  }

  return {
    isEligible: true,
    reason: `Nilai murni siswa (${originalSubmission.nilaiAkhir}) di bawah KKM (${kkm}). Siswa berhak mengikuti remedial.`,
  };
}

console.log("\n[Test 3] Remedial Eligibility Evaluation");
const tugasWithRemedial = { id: "tugas-1", kkm: 75, remedialEnabled: true, remedialPaketSoalId: "paket-rem" };
const tugasWithoutRemedial = { id: "tugas-2", kkm: 75, remedialEnabled: false, remedialPaketSoalId: null };

// Case A: Remedial disabled, score below KKM -> Ineligible (keeps original score)
const caseA = evaluateRemedialEligibility({
  penugasan: tugasWithoutRemedial,
  originalSubmission: { status: "submitted", nilaiAkhir: 60 },
});
assert.equal(caseA.isEligible, false, "Must be ineligible when remedial is disabled");
assert.match(caseA.reason, /tidak diaktifkan/);

// Case B: Remedial enabled, score >= KKM -> Ineligible (already passed)
const caseB = evaluateRemedialEligibility({
  penugasan: tugasWithRemedial,
  originalSubmission: { status: "submitted", nilaiAkhir: 85 },
});
assert.equal(caseB.isEligible, false, "Must be ineligible when score >= KKM");
assert.match(caseB.reason, /telah mencapai/);

// Case C: Remedial enabled, score below KKM -> ELIGIBLE
const caseC = evaluateRemedialEligibility({
  penugasan: tugasWithRemedial,
  originalSubmission: { status: "submitted", nilaiAkhir: 65 },
});
assert.equal(caseC.isEligible, true, "Must be eligible when score < KKM and remedial enabled");
assert.match(caseC.reason, /berhak mengikuti remedial/);

// Case D: Remedial enabled, not yet graded -> Ineligible
const caseD = evaluateRemedialEligibility({
  penugasan: tugasWithRemedial,
  originalSubmission: { status: "submitted", nilaiAkhir: null },
});
assert.equal(caseD.isEligible, false, "Must be ineligible before original grading is completed");
console.log("  ✓ Remedial eligibility correctly evaluates all conditions");
passed++;

// ============================================================================
// 4. IMMUTABILITY OF ORIGINAL SUBMISSION & NILAI MURNI (RULES 4, 7, 8, 10, 11)
// ============================================================================

class GradeDatabaseMock {
  constructor() {
    this.originalSubmissions = new Map();
    this.remedialSubmissions = new Map();
  }

  saveOriginalSubmission(sub) {
    this.originalSubmissions.set(sub.id, { ...sub });
  }

  saveRemedialSubmission(remSub) {
    this.remedialSubmissions.set(remSub.id, { ...remSub });
  }

  getStudentScoreView(siswaId, penugasanId, kkm) {
    const orig = Array.from(this.originalSubmissions.values()).find(
      (s) => s.siswaId === siswaId && s.penugasanId === penugasanId
    );
    const rem = Array.from(this.remedialSubmissions.values()).find(
      (r) => r.siswaId === siswaId && r.penugasanId === penugasanId
    );

    const nilaiMurni = orig ? orig.nilaiAkhir : null;
    const nilaiRemedial = rem ? rem.nilaiAkhir : null;
    const nilaiAktif =
      nilaiRemedial !== null && nilaiMurni !== null
        ? Math.max(nilaiMurni, nilaiRemedial)
        : nilaiMurni;

    return {
      nilaiMurni,
      nilaiRemedial,
      nilaiAktif,
      isTuntas: nilaiAktif !== null && nilaiAktif >= kkm,
      originalUntouched: Boolean(orig),
    };
  }
}

console.log("\n[Test 4] Physical Isolation & Nilai Murni Immutability");
const db = new GradeDatabaseMock();

// Student A scores 60 on original assignment
db.saveOriginalSubmission({
  id: "orig-sub-1",
  siswaId: "siswa-1",
  penugasanId: "tugas-1",
  nilaiPg: 30,
  nilaiEssay: 30,
  nilaiAkhir: 60,
  status: "submitted",
  statusPenilaian: "dinilai",
});

// Student A completes remedial and scores 88
db.saveRemedialSubmission({
  id: "rem-sub-1",
  siswaId: "siswa-1",
  penugasanId: "tugas-1",
  originalPengumpulanId: "orig-sub-1",
  nilaiPg: 48,
  nilaiEssay: 40,
  nilaiAkhir: 88,
  status: "submitted",
  statusPenilaian: "dinilai",
});

// Verify student score view
const viewA = db.getStudentScoreView("siswa-1", "tugas-1", 75);
assert.equal(viewA.nilaiMurni, 60, "Nilai Murni must remain permanently 60");
assert.equal(viewA.nilaiRemedial, 88, "Nilai Remedial must be 88");
assert.equal(viewA.nilaiAktif, 88, "Effective grade must be max(60, 88) = 88");
assert.equal(viewA.isTuntas, true, "Student is now Tuntas after remedial");

// Verify original record in database was NOT altered
const origRecord = db.originalSubmissions.get("orig-sub-1");
assert.equal(origRecord.nilaiAkhir, 60, "Original submission record in database was NEVER mutated");
assert.equal(origRecord.nilaiPg, 30);
assert.equal(origRecord.nilaiEssay, 30);
console.log("  ✓ Physical isolation guarantees Nilai Murni is 100% immutable");
passed++;

// ============================================================================
// 5. REMEDIAL SCORE LOWER THAN ORIGINAL (RULE 11 - MAX PRINCIPLE)
// ============================================================================

console.log("\n[Test 5] Lower Remedial Score Handling (Max Principle)");
// Student B scores 68 on original, but only 55 on remedial
db.saveOriginalSubmission({
  id: "orig-sub-2",
  siswaId: "siswa-2",
  penugasanId: "tugas-1",
  nilaiAkhir: 68,
  status: "submitted",
});

db.saveRemedialSubmission({
  id: "rem-sub-2",
  siswaId: "siswa-2",
  penugasanId: "tugas-1",
  originalPengumpulanId: "orig-sub-2",
  nilaiAkhir: 55,
  status: "submitted",
});

const viewB = db.getStudentScoreView("siswa-2", "tugas-1", 75);
assert.equal(viewB.nilaiMurni, 68, "Nilai Murni is 68");
assert.equal(viewB.nilaiRemedial, 55, "Nilai Remedial is 55");
assert.equal(viewB.nilaiAktif, 68, "Effective score must NOT degrade; max(68, 55) = 68");
console.log("  ✓ Max principle ensures remedial never harms student's original score");
passed++;

// ============================================================================
// 6. QUESTION SANITIZATION FOR REMEDIAL (RULE 14 - NO ANSWER LEAKS)
// ============================================================================

function sanitizeRemedialSoal(rawQuestions) {
  return rawQuestions.map((q) => {
    const { kunci, ...sanitized } = q;
    return sanitized;
  });
}

console.log("\n[Test 6] Remedial Question Sanitization (No Answer Leaks)");
const rawBankSoal = [
  { id: "q1", jenis: "Pilihan Ganda", pertanyaan: "Hasil 2+2?", opsi: ["2", "4", "6"], kunci: "B" },
  { id: "q2", jenis: "Esai", pertanyaan: "Jelaskan fotosintesis!", kunci: "Proses pembuatan makanan pada tumbuhan..." },
];

const sanitized = sanitizeRemedialSoal(rawBankSoal);
for (const q of sanitized) {
  assert.equal("kunci" in q, false, "Sanitized question must NOT leak 'kunci' to student");
  assert.ok(q.id && q.pertanyaan && q.jenis);
}
console.log("  ✓ Remedial questions strictly sanitize and remove answer keys");
passed++;

// ============================================================================
// 7. AUTO-GRADING FOR REMEDIAL PG & ESSAY WORKFLOW (RULES 15 & 16)
// ============================================================================

function autoGradeRemedialPg(questions, studentAnswers) {
  const pgQuestions = questions.filter((q) => q.jenis === "Pilihan Ganda");
  const total = questions.length;
  const weight = total > 0 ? 100 / total : 0;

  let correctCount = 0;
  for (const q of pgQuestions) {
    const ans = studentAnswers[q.id]?.trim()?.toLowerCase() || "";
    const key = String(q.kunci || "").trim().toLowerCase();
    if (ans === key || (key.length === 1 && ans.startsWith(key))) {
      correctCount++;
    }
  }

  return Math.round(correctCount * weight * 100) / 100;
}

console.log("\n[Test 7] Remedial PG Auto-Grading & Manual Essay Combination");
const remedialQuestions = [
  { id: "r1", jenis: "Pilihan Ganda", kunci: "A" },
  { id: "r2", jenis: "Pilihan Ganda", kunci: "B" },
  { id: "r3", jenis: "Esai", poin: 20 },
  { id: "r4", jenis: "Esai", poin: 30 },
];
// 4 questions total -> weight per question = 25
const studentAnswers = { r1: "A. Pilihan Satu", r2: "C. Pilihan Salah", r3: "Esai 1", r4: "Esai 2" };

const pgScore = autoGradeRemedialPg(remedialQuestions, studentAnswers);
assert.equal(pgScore, 25, "Student answered 1 of 2 PG questions correctly -> 25 points");

const essayScore = 40; // Teacher scores 15 on r3 and 25 on r4
const finalRemedialScore = Math.min(100, Math.max(0, pgScore + essayScore));
assert.equal(finalRemedialScore, 65, "Total remedial score = 25 (PG) + 40 (Esai) = 65");
console.log("  ✓ Remedial auto-grading and essay summation perform accurately");
passed++;

// ============================================================================
// 8. MATRIX TABLE REKAP DATA WITH KKM & REMEDIAL (RULE 17)
// ============================================================================

console.log("\n[Test 8] Grade Book Matrix Rekap Calculations");
const matrixRow = {
  siswaId: "siswa-1",
  nilaiPerTugas: {
    "tugas-1": {
      kkm: 75,
      nilaiMurni: 60,
      nilaiRemedial: 85,
      nilaiAktif: 85,
      isTuntas: true,
    },
    "tugas-2": {
      kkm: 80,
      nilaiMurni: 82,
      nilaiRemedial: null,
      nilaiAktif: 82,
      isTuntas: true,
    },
  },
};

const scores = Object.values(matrixRow.nilaiPerTugas).map((n) => n.nilaiAktif);
const average = scores.reduce((a, b) => a + b, 0) / scores.length;
assert.equal(average, 83.5, "Cumulative average correctly uses active/remedial scores (85 + 82)/2 = 83.5");
console.log("  ✓ Matrix rekapitulasi data structures calculate accurately");
passed++;

console.log("\n==================================================================");
console.log(`  ALL ${passed} KKM & REMEDIAL INTEGRITY TESTS PASSED SUCCESSFULLY!`);
console.log("==================================================================");
