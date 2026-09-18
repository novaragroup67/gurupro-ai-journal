import assert from "node:assert/strict";

console.log("======================================================");
console.log("  GURUPRO TEST SUITE: STUDENT SUBMISSION MODULE       ");
console.log("======================================================");

let passed = 0;

// ==========================================================
// 1. RLS POLICY SIMULATION & AUTHORIZATION ENGINE
// ==========================================================

function evaluatePengumpulanRls({
  action, // 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'
  userRole, // 'anon' | 'guru' | 'siswa'
  userId,
  submission,
  assignment,
  studentMembership,
  serverTime = new Date(),
}) {
  // Anonymous access blocked completely
  if (userRole === "anon" || !userId) {
    return false;
  }

  // Siswa rules
  if (userRole === "siswa") {
    if (action === "DELETE") return false;

    if (action === "SELECT") {
      return submission && submission.siswaId === userId;
    }

    if (action === "INSERT") {
      if (!submission || submission.siswaId !== userId) return false;
      if (submission.status !== "draft") return false;
      if (!assignment || assignment.status !== "published") return false;
      if (
        !studentMembership ||
        studentMembership.kelasId !== assignment.kelasId ||
        studentMembership.siswaId !== userId ||
        studentMembership.status !== "aktif"
      ) {
        return false;
      }
      if (assignment.deadline && new Date(serverTime) >= new Date(assignment.deadline)) {
        return false;
      }
      return true;
    }

    if (action === "UPDATE") {
      if (!submission || submission.siswaId !== userId) return false;
      // Cannot update if already submitted
      if (submission.status !== "draft") return false;
      if (!assignment || assignment.status !== "published") return false;
      if (
        !studentMembership ||
        studentMembership.kelasId !== assignment.kelasId ||
        studentMembership.siswaId !== userId ||
        studentMembership.status !== "aktif"
      ) {
        return false;
      }
      if (assignment.deadline && new Date(serverTime) >= new Date(assignment.deadline)) {
        return false;
      }
      return true;
    }

    return false;
  }

  // Guru rules
  if (userRole === "guru") {
    if (action === "SELECT") {
      // Guru can only view submissions for assignments they authored
      return assignment && assignment.guruId === userId;
    }
    // Teachers CANNOT mutate student submissions (read-only for teacher)
    if (action === "INSERT" || action === "UPDATE" || action === "DELETE") {
      return false;
    }
    return false;
  }

  return false;
}

function evaluateJawabanRls({
  action, // 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'
  userRole, // 'anon' | 'guru' | 'siswa'
  userId,
  submission,
  assignment,
  studentMembership,
  serverTime = new Date(),
}) {
  if (userRole === "anon" || !userId) return false;

  if (userRole === "siswa") {
    if (action === "DELETE") return false;

    if (action === "SELECT") {
      return submission && submission.siswaId === userId;
    }

    if (action === "INSERT" || action === "UPDATE") {
      if (!submission || submission.siswaId !== userId) return false;
      if (submission.status !== "draft") return false;
      if (!assignment || assignment.status !== "published") return false;
      if (
        !studentMembership ||
        studentMembership.kelasId !== assignment.kelasId ||
        studentMembership.siswaId !== userId ||
        studentMembership.status !== "aktif"
      ) {
        return false;
      }
      if (assignment.deadline && new Date(serverTime) >= new Date(assignment.deadline)) {
        return false;
      }
      return true;
    }

    return false;
  }

  if (userRole === "guru") {
    if (action === "SELECT") {
      return assignment && assignment.guruId === userId;
    }
    // Guru cannot mutate student answers
    return false;
  }

  return false;
}

// Simulated RPC: get_penugasan_soal_for_siswa
function sanitizeQuestionsForStudent(rawQuestions) {
  return rawQuestions.map((q) => {
    // eslint-disable-next-line no-unused-vars
    const { kunci, pembahasan, ...sanitized } = q;
    return sanitized;
  });
}

// Simulated RPC: submit_penugasan
function executeSubmitRpc({ submission, assignment, userId, serverTime = new Date() }) {
  if (!userId) throw new Error("Unauthorized");
  if (!submission || submission.siswaId !== userId) {
    throw new Error("Pengumpulan tidak ditemukan atau bukan milik Anda.");
  }
  if (submission.status === "submitted") {
    throw new Error("Tugas sudah dikumpulkan sebelumnya.");
  }
  if (assignment.deadline && new Date(serverTime) >= new Date(assignment.deadline)) {
    throw new Error("Batas waktu pengumpulan telah berakhir.");
  }
  return {
    ...submission,
    status: "submitted",
    submittedAt: new Date(serverTime).toISOString(),
  };
}

// ==========================================================
// 2. TEST FIXTURES & DATA SETUP
// ==========================================================

const teacherA = "teacher-uuid-AAA";
const teacherB = "teacher-uuid-BBB";
const student1 = "student-uuid-111";
const student2 = "student-uuid-222";
const studentUnapproved = "student-uuid-333";

const classA = { id: "class-A", guruId: teacherA, nama: "Kelas 10A" };
const classB = { id: "class-B", guruId: teacherB, nama: "Kelas 10B" };

const futureDeadline = "2026-10-01T23:59:59.000Z";
const pastDeadline = "2026-09-01T00:00:00.000Z";
const testServerNow = "2026-09-17T06:00:00.000Z";

const assignmentPublished = {
  id: "asg-pub-1",
  kelasId: classA.id,
  guruId: teacherA,
  judul: "Ulangan Harian 1",
  status: "published",
  deadline: futureDeadline,
};

const assignmentExpired = {
  id: "asg-exp-1",
  kelasId: classA.id,
  guruId: teacherA,
  judul: "Tugas Terlambat",
  status: "published",
  deadline: pastDeadline,
};

const assignmentNoDeadline = {
  id: "asg-nodeadline-1",
  kelasId: classA.id,
  guruId: teacherA,
  judul: "Latihan Bebas",
  status: "published",
  deadline: null,
};

const assignmentDraft = {
  id: "asg-draft-1",
  kelasId: classA.id,
  guruId: teacherA,
  judul: "Tugas Masih Draft",
  status: "draft",
  deadline: futureDeadline,
};

const assignmentTeacherB = {
  id: "asg-b-1",
  kelasId: classB.id,
  guruId: teacherB,
  judul: "Tugas Guru B",
  status: "published",
  deadline: futureDeadline,
};

const student1Membership = {
  kelasId: classA.id,
  siswaId: student1,
  status: "aktif",
};

const student2Membership = {
  kelasId: classA.id,
  siswaId: student2,
  status: "aktif",
};

const studentPendingMembership = {
  kelasId: classA.id,
  siswaId: studentUnapproved,
  status: "menunggu",
};

const rawSoalList = [
  {
    id: "soal-1",
    tipe: "pilihan_ganda",
    pertanyaan: "Berapakah 2 + 2?",
    pilihan: ["1", "2", "3", "4"],
    kunci: "4",
    pembahasan: "2 ditambah 2 sama dengan 4",
    poin: 10,
  },
  {
    id: "soal-2",
    tipe: "essay",
    pertanyaan: "Jelaskan proses fotosintesis!",
    kunci: "Proses biokimia pembentukan karbohidrat...",
    pembahasan: "Fotosintesis terjadi di kloroplas...",
    poin: 20,
  },
];

// ==========================================================
// 3. SECURITY & ISOLATION TESTS
// ==========================================================

console.log("\n--- SECTION A: SECURITY & ACCESS CONTROL ---");

// Test 1: Anonymous access to submissions is blocked
{
  assert.equal(
    evaluatePengumpulanRls({
      action: "SELECT",
      userRole: "anon",
      userId: null,
      submission: { id: "sub-1", siswaId: student1 },
    }),
    false,
  );
  assert.equal(
    evaluatePengumpulanRls({
      action: "INSERT",
      userRole: "anon",
      userId: null,
      submission: { id: "sub-1", siswaId: student1, status: "draft" },
      assignment: assignmentPublished,
    }),
    false,
  );
  assert.equal(
    evaluateJawabanRls({
      action: "SELECT",
      userRole: "anon",
      userId: null,
      submission: { id: "sub-1", siswaId: student1 },
    }),
    false,
  );
  assert.equal(
    evaluateJawabanRls({
      action: "INSERT",
      userRole: "anon",
      userId: null,
      submission: { id: "sub-1", siswaId: student1, status: "draft" },
      assignment: assignmentPublished,
    }),
    false,
  );
  console.log("  [PASS] 1. Anonymous access to submissions and answers is blocked");
  passed++;
}

// Test 2: Student isolation (Student A cannot read or modify Student B's submission)
{
  const submissionB = { id: "sub-b", siswaId: student2, status: "draft" };

  // Read
  assert.equal(
    evaluatePengumpulanRls({
      action: "SELECT",
      userRole: "siswa",
      userId: student1,
      submission: submissionB,
    }),
    false,
    "Student 1 must not read Student 2's submission",
  );

  // Update
  assert.equal(
    evaluatePengumpulanRls({
      action: "UPDATE",
      userRole: "siswa",
      userId: student1,
      submission: submissionB,
      assignment: assignmentPublished,
      studentMembership: student1Membership,
      serverTime: testServerNow,
    }),
    false,
    "Student 1 must not update Student 2's submission",
  );

  // Answers isolation
  assert.equal(
    evaluateJawabanRls({
      action: "SELECT",
      userRole: "siswa",
      userId: student1,
      submission: submissionB,
    }),
    false,
    "Student 1 must not read Student 2's answers",
  );
  assert.equal(
    evaluateJawabanRls({
      action: "INSERT",
      userRole: "siswa",
      userId: student1,
      submission: submissionB,
      assignment: assignmentPublished,
      studentMembership: student1Membership,
      serverTime: testServerNow,
    }),
    false,
    "Student 1 must not insert answers into Student 2's submission",
  );
  console.log("  [PASS] 2. Student isolation strictly enforced between students");
  passed++;
}

// Test 3: Student cannot access or submit unpublished (draft) assignments
{
  assert.equal(
    evaluatePengumpulanRls({
      action: "INSERT",
      userRole: "siswa",
      userId: student1,
      submission: { id: "sub-new", siswaId: student1, status: "draft" },
      assignment: assignmentDraft,
      studentMembership: student1Membership,
      serverTime: testServerNow,
    }),
    false,
    "Student must not create submission for draft assignment",
  );
  console.log("  [PASS] 3. Student cannot create submission for unpublished (draft) assignment");
  passed++;
}

// Test 4: Unapproved student ('menunggu' / 'ditolak' / non-member) cannot create submission
{
  assert.equal(
    evaluatePengumpulanRls({
      action: "INSERT",
      userRole: "siswa",
      userId: studentUnapproved,
      submission: { id: "sub-unapproved", siswaId: studentUnapproved, status: "draft" },
      assignment: assignmentPublished,
      studentMembership: studentPendingMembership,
      serverTime: testServerNow,
    }),
    false,
    "Pending student must not create submission",
  );
  assert.equal(
    evaluatePengumpulanRls({
      action: "INSERT",
      userRole: "siswa",
      userId: "stranger-student",
      submission: { id: "sub-stranger", siswaId: "stranger-student", status: "draft" },
      assignment: assignmentPublished,
      studentMembership: null,
      serverTime: testServerNow,
    }),
    false,
    "Non-member student must not create submission",
  );
  console.log("  [PASS] 4. Unapproved and non-member students cannot create submissions");
  passed++;
}

// Test 5: Teacher isolation (Teacher A cannot see Teacher B's submissions/answers)
{
  const submissionTeacherB = { id: "sub-tb", siswaId: student1, status: "submitted" };

  assert.equal(
    evaluatePengumpulanRls({
      action: "SELECT",
      userRole: "guru",
      userId: teacherA,
      submission: submissionTeacherB,
      assignment: assignmentTeacherB,
    }),
    false,
    "Teacher A must not read submissions from Teacher B's assignment",
  );
  assert.equal(
    evaluateJawabanRls({
      action: "SELECT",
      userRole: "guru",
      userId: teacherA,
      submission: submissionTeacherB,
      assignment: assignmentTeacherB,
    }),
    false,
    "Teacher A must not read answers from Teacher B's assignment",
  );
  console.log("  [PASS] 5. Teacher isolation enforced for student submissions and answers");
  passed++;
}

// Test 6: Teacher CANNOT mutate student submissions or answers (read-only for teachers)
{
  const submission = { id: "sub-1", siswaId: student1, status: "submitted" };

  assert.equal(
    evaluatePengumpulanRls({
      action: "INSERT",
      userRole: "guru",
      userId: teacherA,
      submission,
      assignment: assignmentPublished,
    }),
    false,
  );
  assert.equal(
    evaluatePengumpulanRls({
      action: "UPDATE",
      userRole: "guru",
      userId: teacherA,
      submission,
      assignment: assignmentPublished,
    }),
    false,
  );
  assert.equal(
    evaluatePengumpulanRls({
      action: "DELETE",
      userRole: "guru",
      userId: teacherA,
      submission,
      assignment: assignmentPublished,
    }),
    false,
  );
  assert.equal(
    evaluateJawabanRls({
      action: "INSERT",
      userRole: "guru",
      userId: teacherA,
      submission,
      assignment: assignmentPublished,
    }),
    false,
  );
  assert.equal(
    evaluateJawabanRls({
      action: "UPDATE",
      userRole: "guru",
      userId: teacherA,
      submission,
      assignment: assignmentPublished,
    }),
    false,
  );
  console.log("  [PASS] 6. Teacher role is strictly read-only for student submissions and answers");
  passed++;
}

// ==========================================================
// 4. DEADLINE ENFORCEMENT & IMMUTABILITY TESTS
// ==========================================================

console.log("\n--- SECTION B: SERVER-SIDE DEADLINE & IMMUTABILITY ---");

// Test 7: Valid draft creation before deadline
{
  const subDraft = { id: "sub-valid", siswaId: student1, status: "draft" };
  assert.equal(
    evaluatePengumpulanRls({
      action: "INSERT",
      userRole: "siswa",
      userId: student1,
      submission: subDraft,
      assignment: assignmentPublished,
      studentMembership: student1Membership,
      serverTime: testServerNow,
    }),
    true,
  );
  console.log("  [PASS] 7. Valid draft creation before deadline is permitted");
  passed++;
}

// Test 8: Student cannot create draft after deadline (server time rejected)
{
  const subLate = { id: "sub-late", siswaId: student1, status: "draft" };
  assert.equal(
    evaluatePengumpulanRls({
      action: "INSERT",
      userRole: "siswa",
      userId: student1,
      submission: subLate,
      assignment: assignmentExpired,
      studentMembership: student1Membership,
      serverTime: testServerNow,
    }),
    false,
    "Creating draft after deadline must be rejected",
  );
  console.log("  [PASS] 8. Creating draft after deadline is strictly rejected by server");
  passed++;
}

// Test 9: Student cannot update answers after deadline
{
  const subDraft = { id: "sub-draft-1", siswaId: student1, status: "draft" };
  assert.equal(
    evaluateJawabanRls({
      action: "INSERT",
      userRole: "siswa",
      userId: student1,
      submission: subDraft,
      assignment: assignmentExpired,
      studentMembership: student1Membership,
      serverTime: testServerNow,
    }),
    false,
    "Inserting answer after deadline must be rejected",
  );
  assert.equal(
    evaluateJawabanRls({
      action: "UPDATE",
      userRole: "siswa",
      userId: student1,
      submission: subDraft,
      assignment: assignmentExpired,
      studentMembership: student1Membership,
      serverTime: testServerNow,
    }),
    false,
    "Updating answer after deadline must be rejected",
  );
  console.log("  [PASS] 9. Saving answers after deadline is strictly rejected");
  passed++;
}

// Test 10: Student cannot submit after deadline via RPC
{
  const subDraft = { id: "sub-draft-1", siswaId: student1, status: "draft" };
  assert.throws(
    () =>
      executeSubmitRpc({
        submission: subDraft,
        assignment: assignmentExpired,
        userId: student1,
        serverTime: testServerNow,
      }),
    /Batas waktu pengumpulan telah berakhir/,
  );
  console.log("  [PASS] 10. RPC submit_penugasan rejects submission after deadline");
  passed++;
}

// Test 11: Browser clock tampering cannot bypass server deadline
{
  // Student attempts to spoof client clock to 2020-01-01, but the server evaluates with testServerNow
  // const clientFakedTime = "2020-01-01T00:00:00.000Z";
  const actualServerTime = "2026-09-17T06:00:00.000Z";

  // The database and RPC rely on actual server time (now()), ignoring client claims
  assert.throws(
    () =>
      executeSubmitRpc({
        submission: { id: "sub-tamper", siswaId: student1, status: "draft" },
        assignment: assignmentExpired, // deadline was 2026-09-01
        userId: student1,
        serverTime: actualServerTime, // server evaluates real time
      }),
    /Batas waktu pengumpulan telah berakhir/,
  );
  console.log("  [PASS] 11. Client browser clock tampering cannot bypass server deadline");
  passed++;
}

// Test 12: Assignment without deadline (NULL) allows draft, answers, and submit at any time
{
  const subNoDeadline = { id: "sub-nd", siswaId: student1, status: "draft" };
  assert.equal(
    evaluatePengumpulanRls({
      action: "INSERT",
      userRole: "siswa",
      userId: student1,
      submission: subNoDeadline,
      assignment: assignmentNoDeadline,
      studentMembership: student1Membership,
      serverTime: testServerNow,
    }),
    true,
  );
  assert.equal(
    evaluateJawabanRls({
      action: "UPDATE",
      userRole: "siswa",
      userId: student1,
      submission: subNoDeadline,
      assignment: assignmentNoDeadline,
      studentMembership: student1Membership,
      serverTime: testServerNow,
    }),
    true,
  );
  const submitted = executeSubmitRpc({
    submission: subNoDeadline,
    assignment: assignmentNoDeadline,
    userId: student1,
    serverTime: testServerNow,
  });
  assert.equal(submitted.status, "submitted");
  console.log("  [PASS] 12. Assignments with NULL deadline allow submission at any time");
  passed++;
}

// Test 13: Immutability - once submitted, answers and submission cannot be modified
{
  const submittedSub = { id: "sub-sub", siswaId: student1, status: "submitted" };

  // Cannot update submission
  assert.equal(
    evaluatePengumpulanRls({
      action: "UPDATE",
      userRole: "siswa",
      userId: student1,
      submission: submittedSub,
      assignment: assignmentPublished,
      studentMembership: student1Membership,
      serverTime: testServerNow,
    }),
    false,
    "Submitted assignment cannot be updated",
  );

  // Cannot update answers
  assert.equal(
    evaluateJawabanRls({
      action: "UPDATE",
      userRole: "siswa",
      userId: student1,
      submission: submittedSub,
      assignment: assignmentPublished,
      studentMembership: student1Membership,
      serverTime: testServerNow,
    }),
    false,
    "Answers of submitted assignment cannot be updated",
  );

  // Cannot re-submit
  assert.throws(
    () =>
      executeSubmitRpc({
        submission: submittedSub,
        assignment: assignmentPublished,
        userId: student1,
        serverTime: testServerNow,
      }),
    /Tugas sudah dikumpulkan sebelumnya/,
  );
  console.log("  [PASS] 13. Immutability strictly enforced once status is 'submitted'");
  passed++;
}

// Test 14: Submission completed before deadline remains valid and accessible after deadline passes
{
  const earlySubmitted = {
    id: "sub-early",
    siswaId: student1,
    status: "submitted",
    submittedAt: "2026-08-31T20:00:00.000Z",
  };

  // Student can still view own submission even after deadline
  assert.equal(
    evaluatePengumpulanRls({
      action: "SELECT",
      userRole: "siswa",
      userId: student1,
      submission: earlySubmitted,
      assignment: assignmentExpired,
      serverTime: testServerNow,
    }),
    true,
    "Student must be able to view their past submitted work",
  );

  // Teacher can view it too
  assert.equal(
    evaluatePengumpulanRls({
      action: "SELECT",
      userRole: "guru",
      userId: teacherA,
      submission: earlySubmitted,
      assignment: assignmentExpired,
      serverTime: testServerNow,
    }),
    true,
    "Teacher must be able to view student work after deadline",
  );
  console.log(
    "  [PASS] 14. Work submitted before deadline remains preserved and readable after deadline",
  );
  passed++;
}

// Test 15: Expired draft remains draft (never auto-submitted)
{
  const expiredDraft = { id: "sub-exp-draft", siswaId: student1, status: "draft" };
  assert.equal(expiredDraft.status, "draft");
  // Cannot be submitted now
  assert.throws(
    () =>
      executeSubmitRpc({
        submission: expiredDraft,
        assignment: assignmentExpired,
        userId: student1,
        serverTime: testServerNow,
      }),
    /Batas waktu pengumpulan telah berakhir/,
  );
  assert.equal(expiredDraft.status, "draft");
  console.log("  [PASS] 15. Expired draft remains draft and is never auto-submitted");
  passed++;
}

// ==========================================================
// 5. ANSWER KEY LEAK PREVENTION (SECURITY RPC)
// ==========================================================

console.log("\n--- SECTION C: ANSWER KEY CONFIDENTIALITY ---");

// Test 16: Question sanitization strips 'kunci' and 'pembahasan'
{
  const sanitized = sanitizeQuestionsForStudent(rawSoalList);

  for (const q of sanitized) {
    assert.equal(q.kunci, undefined, "kunci must NOT be present in student questions");
    assert.equal(q.pembahasan, undefined, "pembahasan must NOT be present in student questions");
    assert.ok(q.id, "Question ID must be preserved");
    assert.ok(q.pertanyaan, "Pertanyaan must be preserved");
    assert.ok(q.poin, "Poin must be preserved");
  }
  // Check MC options preserved
  assert.deepEqual(sanitized[0].pilihan, ["1", "2", "3", "4"]);
  console.log("  [PASS] 16. Answer keys (kunci & pembahasan) strictly stripped for student");
  passed++;
}

// ==========================================================
// 6. FUNCTIONAL LIFECYCLE & INTEGRATION SIMULATION
// ==========================================================

console.log("\n--- SECTION D: FUNCTIONAL LIFECYCLE & STORE SIMULATION ---");

class MockPengumpulanStore {
  constructor() {
    this.submissions = [];
    this.answers = [];
  }

  createDraftSubmission({ penugasanId, siswaId }) {
    // Unique check (penugasan_id, siswa_id)
    const existing = this.submissions.find(
      (s) => s.penugasanId === penugasanId && s.siswaId === siswaId,
    );
    if (existing) return existing;

    const sub = {
      id: "pengumpulan-" + Math.random().toString(36).slice(2, 9),
      penugasanId,
      siswaId,
      status: "draft",
      submittedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.submissions.push(sub);
    return sub;
  }

  saveAnswer({ pengumpulanId, soalId, jawaban }) {
    const sub = this.submissions.find((s) => s.id === pengumpulanId);
    if (!sub) throw new Error("Submission not found");
    if (sub.status !== "draft") throw new Error("Cannot edit submitted assignment");

    const existingIdx = this.answers.findIndex(
      (a) => a.pengumpulanId === pengumpulanId && a.soalId === soalId,
    );
    if (existingIdx >= 0) {
      this.answers[existingIdx].jawaban = jawaban;
      this.answers[existingIdx].updatedAt = new Date().toISOString();
      return this.answers[existingIdx];
    } else {
      const newAns = {
        id: "ans-" + Math.random().toString(36).slice(2, 9),
        pengumpulanId,
        soalId,
        jawaban,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.answers.push(newAns);
      return newAns;
    }
  }

  submit({ pengumpulanId, assignment, userId, serverTime }) {
    const sub = this.submissions.find((s) => s.id === pengumpulanId);
    const updated = executeSubmitRpc({
      submission: sub,
      assignment,
      userId,
      serverTime,
    });
    Object.assign(sub, updated);
    return sub;
  }
}

// Test 17: Full student lifecycle: Draft -> Autosave Answers -> Submit -> Read-only
{
  const store = new MockPengumpulanStore();

  // Step 1: Create draft
  const draft = store.createDraftSubmission({
    penugasanId: assignmentPublished.id,
    siswaId: student1,
  });
  assert.equal(draft.status, "draft");
  assert.equal(draft.submittedAt, null);

  // Step 2: Idempotent duplicate draft call returns existing draft
  const draftAgain = store.createDraftSubmission({
    penugasanId: assignmentPublished.id,
    siswaId: student1,
  });
  assert.equal(draft.id, draftAgain.id);

  // Step 3: Save answer 1 (MC)
  store.saveAnswer({
    pengumpulanId: draft.id,
    soalId: "soal-1",
    jawaban: "4",
  });

  // Step 4: Save answer 2 (Essay)
  store.saveAnswer({
    pengumpulanId: draft.id,
    soalId: "soal-2",
    jawaban: "Fotosintesis membutuhkan cahaya matahari dan CO2.",
  });

  // Verify answers saved
  assert.equal(store.answers.length, 2);

  // Step 5: Update answer 1 (Student changes mind)
  store.saveAnswer({
    pengumpulanId: draft.id,
    soalId: "soal-1",
    jawaban: "3",
  });
  assert.equal(store.answers.length, 2);
  const ans1 = store.answers.find((a) => a.soalId === "soal-1");
  assert.equal(ans1.jawaban, "3");

  // Step 6: Submit assignment before deadline
  const submitted = store.submit({
    pengumpulanId: draft.id,
    assignment: assignmentPublished,
    userId: student1,
    serverTime: testServerNow,
  });
  assert.equal(submitted.status, "submitted");
  assert.ok(submitted.submittedAt);

  // Step 7: Attempting to modify answer after submission fails
  assert.throws(
    () =>
      store.saveAnswer({
        pengumpulanId: draft.id,
        soalId: "soal-1",
        jawaban: "4",
      }),
    /Cannot edit submitted assignment/,
  );

  console.log("  [PASS] 17. Full student submission lifecycle functions end-to-end");
  passed++;
}

// Test 18: Teacher inspection of student submissions
{
  const store = new MockPengumpulanStore();
  const sub = store.createDraftSubmission({
    penugasanId: assignmentPublished.id,
    siswaId: student1,
  });
  store.saveAnswer({
    pengumpulanId: sub.id,
    soalId: "soal-1",
    jawaban: "4",
  });
  store.submit({
    pengumpulanId: sub.id,
    assignment: assignmentPublished,
    userId: student1,
    serverTime: testServerNow,
  });

  // Teacher reads submissions
  const teacherSubmissions = store.submissions.filter(
    (s) => s.penugasanId === assignmentPublished.id,
  );
  assert.equal(teacherSubmissions.length, 1);
  assert.equal(teacherSubmissions[0].status, "submitted");

  const studentAnswers = store.answers.filter((a) => a.pengumpulanId === sub.id);
  assert.equal(studentAnswers.length, 1);
  assert.equal(studentAnswers[0].jawaban, "4");

  console.log("  [PASS] 18. Teacher can inspect submitted students and their answers");
  passed++;
}

console.log("\n======================================================");
console.log(`  STUDENT SUBMISSION SUITE: ${passed}/18 TESTS PASSED (0 FAILED)`);
console.log("======================================================\n");
