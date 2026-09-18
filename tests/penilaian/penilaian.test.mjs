import assert from "node:assert/strict";

console.log("======================================================");
console.log("  GURUPRO TEST SUITE: PENILAIAN (GRADING) MODULE      ");
console.log("======================================================");

let passed = 0;

// ==========================================================
// 1. EVALUATION & AUTO-GRADING SIMULATION ENGINE
// ==========================================================

function evaluateMultipleChoiceMatch(studentAnswer, key, options = []) {
  if (!studentAnswer || !key) return false;
  const ans = String(studentAnswer).trim();
  const k = String(key).trim();

  // 1. Exact match (case-insensitive)
  if (ans.toLowerCase() === k.toLowerCase()) return true;

  // 2. Single letter key ('A' - 'E') matching answer starting with letter
  if (
    k.length === 1 &&
    (ans.toUpperCase().startsWith(k.toUpperCase() + ".") || ans.toUpperCase() === k.toUpperCase())
  ) {
    return true;
  }

  // 3. Single letter student answer matching key starting with letter
  if (
    ans.length === 1 &&
    (k.toUpperCase().startsWith(ans.toUpperCase() + ".") || k.toUpperCase() === ans.toUpperCase())
  ) {
    return true;
  }

  // 4. Match against options array by letter index
  if (k.length === 1 && Array.isArray(options)) {
    const idx = k.toUpperCase().charCodeAt(0) - 65;
    if (idx >= 0 && idx < options.length) {
      const optText = String(options[idx]).trim().toLowerCase();
      if (ans.toLowerCase() === optText || ans.toLowerCase() === `${k.toLowerCase()}. ${optText}`) {
        return true;
      }
    }
  }

  return false;
}

function simulateAutoGradeSubmission({ submission, assignment, paketSoal, answers = [] }) {
  if (!submission || submission.status !== "draft") {
    throw new Error("Hanya tugas draf yang dapat dikumpulkan dan dinilai.");
  }

  const questions = paketSoal.soal || [];
  const pgQuestions = questions.filter((q) => q.jenis === "Pilihan Ganda");
  const essayQuestions = questions.filter((q) => q.jenis === "Esai");

  let correctPgCount = 0;
  const gradedAnswers = answers.map((ans) => {
    const question = questions.find((q) => q.id === ans.soalId);
    if (!question) return { ...ans, isCorrect: null, skor: 0 };

    if (question.jenis === "Pilihan Ganda") {
      const isCorrect = evaluateMultipleChoiceMatch(ans.jawaban, question.kunci, question.opsi);
      if (isCorrect) correctPgCount++;
      return {
        ...ans,
        isCorrect,
        skor: isCorrect ? 1 : 0,
      };
    } else {
      return {
        ...ans,
        isCorrect: null,
        skor: null,
      };
    }
  });

  const totalQuestions = questions.length;
  const weightPerQuestion = totalQuestions > 0 ? 100 / totalQuestions : 0;
  const nilaiPg = Math.round(correctPgCount * weightPerQuestion * 100) / 100;

  const hasEssay = essayQuestions.length > 0;
  const statusPenilaian = hasEssay ? "perlu_penilaian_manual" : "dinilai";
  const nilaiEssay = hasEssay ? null : 0;
  const nilaiAkhir = hasEssay ? null : nilaiPg;
  const gradedAt = hasEssay ? null : new Date().toISOString();

  return {
    submission: {
      ...submission,
      status: "submitted",
      submittedAt: new Date().toISOString(),
      nilaiPg,
      nilaiEssay,
      nilaiAkhir,
      statusPenilaian,
      catatanGuru: null,
      gradedAt,
    },
    answers: gradedAnswers,
  };
}

function simulateTeacherGradeEssay({
  submission,
  assignment,
  teacherId,
  essayScores = {},
  catatanGuru = "",
  essayNotes = {},
}) {
  // Authorization check
  if (!teacherId || assignment.guruId !== teacherId) {
    throw new Error("Akses ditolak: Hanya guru pemilik penugasan yang dapat memberikan penilaian.");
  }

  if (submission.status !== "submitted") {
    throw new Error("Hanya tugas yang telah dikumpulkan yang dapat dinilai.");
  }

  const totalEssayScore = Object.values(essayScores).reduce((a, b) => a + Number(b), 0);
  const cleanEssayScore = Math.round(totalEssayScore * 100) / 100;
  const pgScore = Number(submission.nilaiPg) || 0;
  const finalScore = Math.min(
    100,
    Math.max(0, Math.round((pgScore + cleanEssayScore) * 100) / 100),
  );

  return {
    ...submission,
    nilaiEssay: cleanEssayScore,
    nilaiAkhir: finalScore,
    statusPenilaian: "dinilai",
    catatanGuru: catatanGuru.trim() || null,
    gradedAt: new Date().toISOString(),
  };
}

function evaluateGradingRls({
  action, // 'SELECT' | 'UPDATE'
  target, // 'pengumpulan' | 'jawaban'
  userRole, // 'anon' | 'guru' | 'siswa'
  userId,
  submission,
  assignment,
}) {
  if (userRole === "anon" || !userId) return false;

  if (userRole === "siswa") {
    if (action === "SELECT") {
      // Siswa can only see their own submission/result
      return submission && submission.siswaId === userId;
    }
    if (action === "UPDATE") {
      // Siswa can NEVER modify grading data (nilai_pg, nilai_essay, nilai_akhir, status_penilaian)
      return false;
    }
    return false;
  }

  if (userRole === "guru") {
    if (action === "SELECT" || action === "UPDATE") {
      // Guru can view and update grading ONLY on assignments they own
      return assignment && assignment.guruId === userId;
    }
    return false;
  }

  return false;
}

// ==========================================================
// 2. TEST FIXTURES
// ==========================================================

const teacherA = "teacher-uuid-AAA";
const teacherB = "teacher-uuid-BBB";
const student1 = "student-uuid-111";
const student2 = "student-uuid-222";

const classA = { id: "class-A", guruId: teacherA, nama: "Kelas 10A" };
const classB = { id: "class-B", guruId: teacherB, nama: "Kelas 10B" };

const paketSoalPgOnly = {
  id: "paket-pg-only",
  userId: teacherA,
  judul: "Kuis Pilihan Ganda (4 Soal)",
  soal: [
    {
      id: "q1",
      jenis: "Pilihan Ganda",
      pertanyaan: "1 + 1 = ?",
      opsi: ["1", "2", "3", "4"],
      kunci: "B",
    },
    {
      id: "q2",
      jenis: "Pilihan Ganda",
      pertanyaan: "Ibukota Indonesia?",
      opsi: ["Bandung", "Jakarta", "Surabaya", "Medan"],
      kunci: "Jakarta",
    },
    {
      id: "q3",
      jenis: "Pilihan Ganda",
      pertanyaan: "Air mendidih pada suhu?",
      opsi: ["50C", "80C", "100C", "120C"],
      kunci: "C. 100C",
    },
    {
      id: "q4",
      jenis: "Pilihan Ganda",
      pertanyaan: "Hewan mamalia?",
      opsi: ["Ayam", "Kucing", "Katak", "Penyu"],
      kunci: "B. Kucing",
    },
  ],
};

const paketSoalEssayOnly = {
  id: "paket-essay-only",
  userId: teacherA,
  judul: "Ujian Esai (2 Soal)",
  soal: [
    {
      id: "e1",
      jenis: "Esai",
      pertanyaan: "Jelaskan fotosintesis!",
      kunci: "Proses pembuatan makanan...",
    },
    {
      id: "e2",
      jenis: "Esai",
      pertanyaan: "Jelaskan siklus air!",
      kunci: "Evaporasi, kondensasi, presipitasi...",
    },
  ],
};

const paketSoalMixed = {
  id: "paket-mixed",
  userId: teacherA,
  judul: "Ulangan Harian Campuran (2 PG + 2 Esai)",
  soal: [
    {
      id: "mq1",
      jenis: "Pilihan Ganda",
      pertanyaan: "2 x 3 = ?",
      opsi: ["5", "6", "7", "8"],
      kunci: "B",
    },
    {
      id: "mq2",
      jenis: "Pilihan Ganda",
      pertanyaan: "Planet merah?",
      opsi: ["Venus", "Mars", "Jupiter", "Saturnus"],
      kunci: "Mars",
    },
    {
      id: "me1",
      jenis: "Esai",
      pertanyaan: "Uraikan hukum Newton 1!",
      kunci: "Benda tetap diam...",
    },
    { id: "me2", jenis: "Esai", pertanyaan: "Uraikan hukum Newton 2!", kunci: "F = m * a..." },
  ],
};

const assignmentTeacherA = {
  id: "asg-A",
  kelasId: classA.id,
  guruId: teacherA,
  paketSoalId: paketSoalMixed.id,
  judul: "Tugas Fisika Dasar",
  status: "published",
};

const assignmentTeacherB = {
  id: "asg-B",
  kelasId: classB.id,
  guruId: teacherB,
  paketSoalId: "paket-b",
  judul: "Tugas Biologi B",
  status: "published",
};

// ==========================================================
// 3. AUTO-GRADING TESTS (MULTIPLE CHOICE)
// ==========================================================

console.log("\n--- SECTION A: AUTOMATIC MULTIPLE CHOICE GRADING ---");

// Test 1: All correct multiple choice answers → Score 100% and auto-graded
{
  const submissionDraft = {
    id: "sub-1",
    penugasanId: assignmentTeacherA.id,
    siswaId: student1,
    status: "draft",
  };
  const answers = [
    { soalId: "q1", jawaban: "B" },
    { soalId: "q2", jawaban: "Jakarta" },
    { soalId: "q3", jawaban: "C. 100C" },
    { soalId: "q4", jawaban: "B. Kucing" },
  ];

  const result = simulateAutoGradeSubmission({
    submission: submissionDraft,
    assignment: assignmentTeacherA,
    paketSoal: paketSoalPgOnly,
    answers,
  });

  assert.equal(result.submission.status, "submitted");
  assert.equal(result.submission.nilaiPg, 100);
  assert.equal(result.submission.nilaiAkhir, 100);
  assert.equal(result.submission.statusPenilaian, "dinilai");
  assert.ok(result.submission.gradedAt);
  assert.equal(
    result.answers.every((a) => a.isCorrect === true),
    true,
  );
  console.log("  [PASS] 1. Multiple choice 100% correct auto-graded to 100 and marked 'dinilai'");
  passed++;
}

// Test 2: Partial correct answers (2 of 4) → Score 50%
{
  const submissionDraft = {
    id: "sub-2",
    penugasanId: assignmentTeacherA.id,
    siswaId: student1,
    status: "draft",
  };
  const answers = [
    { soalId: "q1", jawaban: "B" }, // correct
    { soalId: "q2", jawaban: "Bandung" }, // wrong
    { soalId: "q3", jawaban: "C. 100C" }, // correct
    { soalId: "q4", jawaban: "Ayam" }, // wrong
  ];

  const result = simulateAutoGradeSubmission({
    submission: submissionDraft,
    assignment: assignmentTeacherA,
    paketSoal: paketSoalPgOnly,
    answers,
  });

  assert.equal(result.submission.nilaiPg, 50);
  assert.equal(result.submission.nilaiAkhir, 50);
  assert.equal(result.submission.statusPenilaian, "dinilai");
  assert.equal(result.answers.filter((a) => a.isCorrect === true).length, 2);
  console.log("  [PASS] 2. Multiple choice partial correct auto-graded proportionally (50%)");
  passed++;
}

// Test 3: Zero correct answers → Score 0%
{
  const submissionDraft = {
    id: "sub-3",
    penugasanId: assignmentTeacherA.id,
    siswaId: student1,
    status: "draft",
  };
  const answers = [
    { soalId: "q1", jawaban: "A" },
    { soalId: "q2", jawaban: "Medan" },
    { soalId: "q3", jawaban: "50C" },
    { soalId: "q4", jawaban: "Penyu" },
  ];

  const result = simulateAutoGradeSubmission({
    submission: submissionDraft,
    assignment: assignmentTeacherA,
    paketSoal: paketSoalPgOnly,
    answers,
  });

  assert.equal(result.submission.nilaiPg, 0);
  assert.equal(result.submission.nilaiAkhir, 0);
  assert.equal(result.submission.statusPenilaian, "dinilai");
  console.log("  [PASS] 3. Multiple choice zero correct auto-graded to 0%");
  passed++;
}

// Test 4: Option matching tolerance (letter vs text vs option index)
{
  // Question with key 'B' and options ['1', '2', '3', '4']
  assert.equal(evaluateMultipleChoiceMatch("B", "B"), true);
  assert.equal(evaluateMultipleChoiceMatch("B. 2", "B"), true);
  assert.equal(evaluateMultipleChoiceMatch("2", "B", ["1", "2", "3", "4"]), true);
  // Case insensitivity
  assert.equal(evaluateMultipleChoiceMatch("jakarta", "Jakarta"), true);
  assert.equal(evaluateMultipleChoiceMatch("c. 100c", "C. 100C"), true);
  console.log("  [PASS] 4. Robust answer matching across letter formats, option texts, and cases");
  passed++;
}

// ==========================================================
// 4. TEACHER ESSAY GRADING & FINAL SCORE TESTS
// ==========================================================

console.log("\n--- SECTION B: TEACHER ESSAY GRADING & FINAL SCORE ---");

// Test 5: Mixed package auto-grades MC and awaits manual essay grading
{
  const submissionDraft = {
    id: "sub-mixed",
    penugasanId: assignmentTeacherA.id,
    siswaId: student1,
    status: "draft",
  };
  const answers = [
    { soalId: "mq1", jawaban: "B. 6" }, // correct PG (1/4 = 25 pts)
    { soalId: "mq2", jawaban: "Mars" }, // correct PG (1/4 = 25 pts)
    { soalId: "me1", jawaban: "Benda akan diam jika resultan gaya = 0." }, // Essay 1
    { soalId: "me2", jawaban: "Percepatan sebanding dengan gaya." }, // Essay 2
  ];

  const submitResult = simulateAutoGradeSubmission({
    submission: submissionDraft,
    assignment: assignmentTeacherA,
    paketSoal: paketSoalMixed,
    answers,
  });

  // 2 out of 4 total questions are correct PG -> 50 points
  assert.equal(submitResult.submission.nilaiPg, 50);
  assert.equal(submitResult.submission.nilaiEssay, null);
  assert.equal(submitResult.submission.nilaiAkhir, null);
  assert.equal(submitResult.submission.statusPenilaian, "perlu_penilaian_manual");
  console.log(
    "  [PASS] 5. Mixed assignment auto-grades PG and sets status 'perlu_penilaian_manual'",
  );
  passed++;

  // Now teacher grades the essays
  const gradedResult = simulateTeacherGradeEssay({
    submission: submitResult.submission,
    assignment: assignmentTeacherA,
    teacherId: teacherA,
    essayScores: {
      me1: 22,
      me2: 24,
    },
    catatanGuru: "Penjelasan hukum Newton sangat baik dan runtut.",
  });

  assert.equal(gradedResult.nilaiPg, 50);
  assert.equal(gradedResult.nilaiEssay, 46);
  assert.equal(gradedResult.nilaiAkhir, 96); // 50 + 46 = 96
  assert.equal(gradedResult.statusPenilaian, "dinilai");
  assert.equal(gradedResult.catatanGuru, "Penjelasan hukum Newton sangat baik dan runtut.");
  assert.ok(gradedResult.gradedAt);
  console.log("  [PASS] 6. Teacher grades essay, final score correctly calculated (50 + 46 = 96)");
  passed++;
}

// Test 7: Essay-only package (starts at 0 PG, graded manually to 100)
{
  const submissionDraft = {
    id: "sub-essay",
    penugasanId: assignmentTeacherA.id,
    siswaId: student1,
    status: "draft",
  };
  const answers = [
    { soalId: "e1", jawaban: "Fotosintesis menghasilkan glukosa dan oksigen." },
    { soalId: "e2", jawaban: "Siklus air melibatkan penguapan dan hujan." },
  ];

  const submitResult = simulateAutoGradeSubmission({
    submission: submissionDraft,
    assignment: assignmentTeacherA,
    paketSoal: paketSoalEssayOnly,
    answers,
  });

  assert.equal(submitResult.submission.nilaiPg, 0);
  assert.equal(submitResult.submission.statusPenilaian, "perlu_penilaian_manual");

  const gradedResult = simulateTeacherGradeEssay({
    submission: submitResult.submission,
    assignment: assignmentTeacherA,
    teacherId: teacherA,
    essayScores: {
      e1: 45,
      e2: 45,
    },
    catatanGuru: "Jawaban esai sangat memuaskan.",
  });

  assert.equal(gradedResult.nilaiEssay, 90);
  assert.equal(gradedResult.nilaiAkhir, 90);
  assert.equal(gradedResult.statusPenilaian, "dinilai");
  console.log("  [PASS] 7. Essay-only assignment correctly graded manually to 90/100");
  passed++;
}

// Test 8: Final score capping (never exceeds 100 or drops below 0)
{
  const submission = {
    id: "sub-cap",
    penugasanId: assignmentTeacherA.id,
    siswaId: student1,
    status: "submitted",
    nilaiPg: 60,
  };

  const overGraded = simulateTeacherGradeEssay({
    submission,
    assignment: assignmentTeacherA,
    teacherId: teacherA,
    essayScores: { e1: 60 }, // 60 + 60 = 120 -> capped to 100
  });
  assert.equal(overGraded.nilaiAkhir, 100);

  const underGraded = simulateTeacherGradeEssay({
    submission: { ...submission, nilaiPg: 0 },
    assignment: assignmentTeacherA,
    teacherId: teacherA,
    essayScores: { e1: -20 }, // capped to 0
  });
  assert.equal(underGraded.nilaiAkhir, 0);
  console.log("  [PASS] 8. Final score strictly clamped between 0 and 100");
  passed++;
}

// ==========================================================
// 5. SECURITY & ISOLATION TESTS
// ==========================================================

console.log("\n--- SECTION C: SECURITY, RLS & ISOLATION ---");

// Test 9: Anonymous access to grading data is completely blocked
{
  assert.equal(
    evaluateGradingRls({
      action: "SELECT",
      target: "pengumpulan",
      userRole: "anon",
      userId: null,
      submission: { siswaId: student1 },
      assignment: assignmentTeacherA,
    }),
    false,
  );
  assert.equal(
    evaluateGradingRls({
      action: "UPDATE",
      target: "pengumpulan",
      userRole: "anon",
      userId: null,
      submission: { siswaId: student1 },
      assignment: assignmentTeacherA,
    }),
    false,
  );
  console.log("  [PASS] 9. Anonymous access to grading data is blocked");
  passed++;
}

// Test 10: Teacher ownership isolation (Teacher A cannot grade Teacher B's assignments)
{
  const submissionTeacherB = {
    id: "sub-tb",
    penugasanId: assignmentTeacherB.id,
    siswaId: student1,
    status: "submitted",
    nilaiPg: 50,
  };

  // RLS evaluation
  assert.equal(
    evaluateGradingRls({
      action: "UPDATE",
      target: "pengumpulan",
      userRole: "guru",
      userId: teacherA, // Teacher A
      submission: submissionTeacherB,
      assignment: assignmentTeacherB, // Owned by Teacher B
    }),
    false,
    "Teacher A must not update grading on Teacher B's assignment",
  );

  // RPC execution check
  assert.throws(
    () =>
      simulateTeacherGradeEssay({
        submission: submissionTeacherB,
        assignment: assignmentTeacherB,
        teacherId: teacherA, // Teacher A attempting to grade Teacher B's assignment
        essayScores: { q: 20 },
      }),
    /Akses ditolak/,
  );
  console.log("  [PASS] 10. Teacher A cannot grade or alter Teacher B's assignments");
  passed++;
}

// Test 11: Student cannot modify their own grades or grade themselves
{
  assert.equal(
    evaluateGradingRls({
      action: "UPDATE",
      target: "pengumpulan",
      userRole: "siswa",
      userId: student1,
      submission: { id: "sub-1", siswaId: student1, nilaiAkhir: 50 },
      assignment: assignmentTeacherA,
    }),
    false,
    "Student must not update submission grading fields",
  );

  assert.throws(
    () =>
      simulateTeacherGradeEssay({
        submission: { id: "sub-1", siswaId: student1, status: "submitted", nilaiPg: 40 },
        assignment: assignmentTeacherA,
        teacherId: student1, // Student attempting to pass self as teacher
        essayScores: { e1: 60 },
      }),
    /Akses ditolak/,
  );
  console.log("  [PASS] 11. Student cannot modify grades or self-grade");
  passed++;
}

// Test 12: Student result isolation (Student 1 cannot see Student 2's grade)
{
  const submissionStudent2 = {
    id: "sub-s2",
    penugasanId: assignmentTeacherA.id,
    siswaId: student2,
    status: "submitted",
    nilaiAkhir: 95,
  };

  assert.equal(
    evaluateGradingRls({
      action: "SELECT",
      target: "pengumpulan",
      userRole: "siswa",
      userId: student1, // Student 1
      submission: submissionStudent2, // Student 2's submission
      assignment: assignmentTeacherA,
    }),
    false,
    "Student 1 must not read Student 2's grades",
  );

  assert.equal(
    evaluateGradingRls({
      action: "SELECT",
      target: "pengumpulan",
      userRole: "siswa",
      userId: student2, // Student 2 reading own
      submission: submissionStudent2,
      assignment: assignmentTeacherA,
    }),
    true,
    "Student 2 can read their own grades",
  );
  console.log("  [PASS] 12. Student result isolation strictly enforced between students");
  passed++;
}

// ==========================================================
// 6. PERSISTENCE & IMMUTABILITY TESTS
// ==========================================================

console.log("\n--- SECTION D: PERSISTENCE & IMMUTABILITY ---");

// Test 13: Grading persists across simulated store reloads
{
  class MockGradingDatabase {
    constructor() {
      this.submissions = new Map();
    }

    saveSubmission(sub) {
      this.submissions.set(sub.id, JSON.parse(JSON.stringify(sub)));
    }

    getSubmission(id) {
      const data = this.submissions.get(id);
      return data ? JSON.parse(JSON.stringify(data)) : null;
    }
  }

  const db = new MockGradingDatabase();
  const sub = {
    id: "sub-persist",
    penugasanId: assignmentTeacherA.id,
    siswaId: student1,
    status: "submitted",
    nilaiPg: 40,
    nilaiEssay: 45,
    nilaiAkhir: 85,
    statusPenilaian: "dinilai",
    catatanGuru: "Sangat baik!",
    gradedAt: new Date().toISOString(),
  };

  db.saveSubmission(sub);

  // Reload from database
  const loaded = db.getSubmission("sub-persist");
  assert.equal(loaded.nilaiPg, 40);
  assert.equal(loaded.nilaiEssay, 45);
  assert.equal(loaded.nilaiAkhir, 85);
  assert.equal(loaded.statusPenilaian, "dinilai");
  assert.equal(loaded.catatanGuru, "Sangat baik!");
  assert.ok(loaded.gradedAt);
  console.log("  [PASS] 13. Grading attributes, scores, and feedback persist accurately");
  passed++;
}

// Test 14: Teacher can update / regrade essay and feedback
{
  const submission = {
    id: "sub-regrade",
    penugasanId: assignmentTeacherA.id,
    siswaId: student1,
    status: "submitted",
    nilaiPg: 50,
    nilaiEssay: 30,
    nilaiAkhir: 80,
    statusPenilaian: "dinilai",
    catatanGuru: "Perlu ditambah penjelasan.",
  };

  // Teacher revises essay score after student clarification
  const revised = simulateTeacherGradeEssay({
    submission,
    assignment: assignmentTeacherA,
    teacherId: teacherA,
    essayScores: { e1: 45 },
    catatanGuru: "Setelah revisi, nilai ditambahkan.",
  });

  assert.equal(revised.nilaiEssay, 45);
  assert.equal(revised.nilaiAkhir, 95); // 50 + 45 = 95
  assert.equal(revised.catatanGuru, "Setelah revisi, nilai ditambahkan.");
  console.log("  [PASS] 14. Teacher can regrade or update feedback seamlessly");
  passed++;
}

console.log("\n======================================================");
console.log(`  PENILAIAN SUITE COMPLETE: ${passed}/14 TESTS PASSED (0 FAILED)`);
console.log("======================================================\n");
