import assert from "node:assert/strict";

console.log("======================================================");
console.log("  GURUPRO TEST SUITE: PENUGASAN (ASSIGNMENT) MODULE  ");
console.log("======================================================");

let passed = 0;

// ==========================================
// 1. RLS POLICY SIMULATION & AUTHORIZATION
// ==========================================

function evaluatePenugasanRls({
  action, // 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'
  userRole, // 'anon' | 'guru' | 'siswa'
  userId,
  assignment,
  targetClass,
  targetPaketSoal,
  studentMembership,
}) {
  // 1. Anonymous access is completely blocked
  if (userRole === "anon" || !userId) {
    return false;
  }

  // 2. Student rules
  if (userRole === "siswa") {
    // Siswa CANNOT mutate (INSERT, UPDATE, DELETE)
    if (action === "INSERT" || action === "UPDATE" || action === "DELETE") {
      return false;
    }
    // Siswa can only SELECT published or closed assignments from active membership classes
    if (action === "SELECT") {
      if (!assignment) return false;
      // Draft is strictly hidden
      if (assignment.status !== "published" && assignment.status !== "closed") {
        return false;
      }
      // Must be approved member in the assignment's class
      if (
        !studentMembership ||
        studentMembership.kelasId !== assignment.kelasId ||
        studentMembership.siswaId !== userId ||
        studentMembership.status !== "aktif"
      ) {
        return false;
      }
      return true;
    }
    return false;
  }

  // 3. Teacher rules
  if (userRole === "guru") {
    if (action === "SELECT") {
      return assignment.guruId === userId;
    }
    if (action === "INSERT") {
      // Must own the assignment
      if (assignment.guruId !== userId) return false;
      // Must own the target class
      if (!targetClass || targetClass.guruId !== userId) return false;
      // Must own the target question package
      if (!targetPaketSoal || targetPaketSoal.userId !== userId) return false;
      return true;
    }
    if (action === "UPDATE") {
      if (assignment.guruId !== userId) return false;
      if (targetClass && targetClass.guruId !== userId) return false;
      if (targetPaketSoal && targetPaketSoal.userId !== userId) return false;
      return true;
    }
    if (action === "DELETE") {
      return assignment.guruId === userId;
    }
    return false;
  }

  return false;
}

// ==========================================
// 2. SECURITY & ISOLATION TESTS
// ==========================================

console.log("\n--- SECTION A: SECURITY & ISOLATION TESTS ---");

const teacherA = "teacher-uuid-AAA";
const teacherB = "teacher-uuid-BBB";
const student1 = "student-uuid-111";
const student2 = "student-uuid-222";

const classA1 = { id: "class-A1", guruId: teacherA, nama: "Kelas 10A" };
const classB1 = { id: "class-B1", guruId: teacherB, nama: "Kelas 10B" };

const paketSoalA1 = { id: "paket-A1", userId: teacherA, judul: "Kuis Aljabar A" };
const paketSoalB1 = { id: "paket-B1", userId: teacherB, judul: "Kuis Biologi B" };

const assignmentA1_Draft = {
  id: "asg-A1",
  kelasId: classA1.id,
  paketSoalId: paketSoalA1.id,
  guruId: teacherA,
  judul: "Tugas Aljabar 1",
  status: "draft",
};

const assignmentA1_Published = {
  id: "asg-A2",
  kelasId: classA1.id,
  paketSoalId: paketSoalA1.id,
  guruId: teacherA,
  judul: "Tugas Aljabar 2",
  status: "published",
};

const assignmentB1_Published = {
  id: "asg-B1",
  kelasId: classB1.id,
  paketSoalId: paketSoalB1.id,
  guruId: teacherB,
  judul: "Tugas Biologi Sel",
  status: "published",
};

// 1. Anonymous access blocked
{
  assert.equal(
    evaluatePenugasanRls({
      action: "SELECT",
      userRole: "anon",
      userId: null,
      assignment: assignmentA1_Published,
    }),
    false,
  );
  assert.equal(
    evaluatePenugasanRls({
      action: "INSERT",
      userRole: "anon",
      userId: null,
      assignment: assignmentA1_Published,
    }),
    false,
  );
  console.log("  [PASS] 1. Anonymous access to penugasan is completely blocked");
  passed++;
}

// 2. Teacher A cannot read or manage Teacher B's assignments
{
  // Read
  assert.equal(
    evaluatePenugasanRls({
      action: "SELECT",
      userRole: "guru",
      userId: teacherA,
      assignment: assignmentB1_Published,
    }),
    false,
    "Teacher A must not read Teacher B's assignment",
  );
  // Update
  assert.equal(
    evaluatePenugasanRls({
      action: "UPDATE",
      userRole: "guru",
      userId: teacherA,
      assignment: assignmentB1_Published,
    }),
    false,
    "Teacher A must not update Teacher B's assignment",
  );
  // Delete
  assert.equal(
    evaluatePenugasanRls({
      action: "DELETE",
      userRole: "guru",
      userId: teacherA,
      assignment: assignmentB1_Published,
    }),
    false,
    "Teacher A must not delete Teacher B's assignment",
  );
  console.log("  [PASS] 2. Teacher A cannot read, update, or delete Teacher B's assignments");
  passed++;
}

// 3. Teacher cannot create an assignment for another teacher's class
{
  assert.equal(
    evaluatePenugasanRls({
      action: "INSERT",
      userRole: "guru",
      userId: teacherA,
      assignment: { ...assignmentA1_Draft, kelasId: classB1.id },
      targetClass: classB1,
      targetPaketSoal: paketSoalA1,
    }),
    false,
    "Teacher A must not assign to Teacher B's class",
  );
  console.log("  [PASS] 3. Teacher cannot create assignment for another teacher's class");
  passed++;
}

// 4. Teacher cannot use another teacher's question package
{
  assert.equal(
    evaluatePenugasanRls({
      action: "INSERT",
      userRole: "guru",
      userId: teacherA,
      assignment: { ...assignmentA1_Draft, paketSoalId: paketSoalB1.id },
      targetClass: classA1,
      targetPaketSoal: paketSoalB1,
    }),
    false,
    "Teacher A must not use Teacher B's paket_soal",
  );
  console.log(
    "  [PASS] 4. Teacher cannot create assignment using another teacher's question package",
  );
  passed++;
}

// 5. Student cannot mutate assignments (INSERT, UPDATE, DELETE)
{
  assert.equal(
    evaluatePenugasanRls({
      action: "INSERT",
      userRole: "siswa",
      userId: student1,
      assignment: assignmentA1_Published,
    }),
    false,
  );
  assert.equal(
    evaluatePenugasanRls({
      action: "UPDATE",
      userRole: "siswa",
      userId: student1,
      assignment: assignmentA1_Published,
    }),
    false,
  );
  assert.equal(
    evaluatePenugasanRls({
      action: "DELETE",
      userRole: "siswa",
      userId: student1,
      assignment: assignmentA1_Published,
    }),
    false,
  );
  console.log("  [PASS] 5. Student cannot insert, update, or delete assignments");
  passed++;
}

// 6. Draft assignments are NEVER visible to students
{
  const studentActiveMemA = { kelasId: classA1.id, siswaId: student1, status: "aktif" };
  assert.equal(
    evaluatePenugasanRls({
      action: "SELECT",
      userRole: "siswa",
      userId: student1,
      assignment: assignmentA1_Draft, // status: 'draft'
      studentMembership: studentActiveMemA,
    }),
    false,
    "Student must not see draft assignments even in joined class",
  );
  console.log("  [PASS] 6. Draft assignments are strictly hidden from students");
  passed++;
}

// 7. Published assignment is visible to approved student in that class
{
  const studentActiveMemA = { kelasId: classA1.id, siswaId: student1, status: "aktif" };
  assert.equal(
    evaluatePenugasanRls({
      action: "SELECT",
      userRole: "siswa",
      userId: student1,
      assignment: assignmentA1_Published,
      studentMembership: studentActiveMemA,
    }),
    true,
    "Approved student must be able to view published assignment",
  );
  console.log("  [PASS] 7. Published assignment is visible to approved student in class");
  passed++;
}

// 8. Unapproved student ('menunggu' / 'ditolak' / not member) cannot see assignments
{
  const studentPendingMemA = { kelasId: classA1.id, siswaId: student2, status: "menunggu" };
  assert.equal(
    evaluatePenugasanRls({
      action: "SELECT",
      userRole: "siswa",
      userId: student2,
      assignment: assignmentA1_Published,
      studentMembership: studentPendingMemA,
    }),
    false,
    "Pending student must not see assignments",
  );

  const studentRejectedMemA = { kelasId: classA1.id, siswaId: student2, status: "ditolak" };
  assert.equal(
    evaluatePenugasanRls({
      action: "SELECT",
      userRole: "siswa",
      userId: student2,
      assignment: assignmentA1_Published,
      studentMembership: studentRejectedMemA,
    }),
    false,
    "Rejected student must not see assignments",
  );

  assert.equal(
    evaluatePenugasanRls({
      action: "SELECT",
      userRole: "siswa",
      userId: student2,
      assignment: assignmentA1_Published,
      studentMembership: null,
    }),
    false,
    "Non-member student must not see assignments",
  );
  console.log(
    "  [PASS] 8. Unapproved students (pending, rejected, non-member) cannot access assignments",
  );
  passed++;
}

// ==========================================
// 3. FUNCTIONAL LIFECYCLE TESTS
// ==========================================

console.log("\n--- SECTION B: FUNCTIONAL LIFECYCLE TESTS ---");

class MockPenugasanStore {
  constructor() {
    this.items = [];
  }

  create({ kelasId, paketSoalId, guruId, judul, instruksi, deadline, status }) {
    if (!kelasId) throw new Error("Pilih kelas target penugasan.");
    if (!paketSoalId) throw new Error("Pilih paket soal untuk penugasan ini.");
    if (!judul || !judul.trim()) throw new Error("Judul penugasan wajib diisi.");

    const item = {
      id: "asg-" + Math.random().toString(36).slice(2, 8),
      kelasId,
      paketSoalId,
      guruId,
      judul: judul.trim(),
      instruksi: instruksi || null,
      deadline: deadline || null,
      status: status || "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.items.unshift(item);
    return item;
  }

  update(id, patch) {
    const found = this.items.find((i) => i.id === id);
    if (!found) throw new Error("Penugasan tidak ditemukan.");
    Object.assign(found, patch, { updatedAt: new Date().toISOString() });
    return found;
  }

  publish(id) {
    return this.update(id, { status: "published" });
  }

  close(id) {
    return this.update(id, { status: "closed" });
  }

  delete(id) {
    const initialLen = this.items.length;
    this.items = this.items.filter((i) => i.id !== id);
    return this.items.length < initialLen;
  }
}

const store = new MockPenugasanStore();

// Test 9: Form validation on create
{
  assert.throws(
    () => store.create({ kelasId: "", paketSoalId: "ps1", judul: "Test" }),
    /Pilih kelas/,
  );
  assert.throws(
    () => store.create({ kelasId: "k1", paketSoalId: "", judul: "Test" }),
    /Pilih paket soal/,
  );
  assert.throws(
    () => store.create({ kelasId: "k1", paketSoalId: "ps1", judul: "" }),
    /Judul penugasan/,
  );
  console.log("  [PASS] 9. Form validation correctly rejects incomplete inputs");
  passed++;
}

// Test 10: Create assignment as draft
let createdAsg;
{
  createdAsg = store.create({
    kelasId: "k1",
    paketSoalId: "ps1",
    guruId: teacherA,
    judul: "Ulangan Harian Bab 1",
    instruksi: "Kerjakan dengan teliti",
    deadline: "2026-09-30T15:00:00.000Z",
    status: "draft",
  });
  assert.equal(createdAsg.judul, "Ulangan Harian Bab 1");
  assert.equal(createdAsg.status, "draft");
  console.log("  [PASS] 10. Assignment created successfully as draft");
  passed++;
}

// Test 11: Update assignment
{
  const updated = store.update(createdAsg.id, {
    judul: "Ulangan Harian Bab 1 (Revisi)",
    instruksi: "Kerjakan tanpa kalkulator",
  });
  assert.equal(updated.judul, "Ulangan Harian Bab 1 (Revisi)");
  assert.equal(updated.instruksi, "Kerjakan tanpa kalkulator");
  console.log("  [PASS] 11. Assignment updated successfully");
  passed++;
}

// Test 12: Publish assignment
{
  const published = store.publish(createdAsg.id);
  assert.equal(published.status, "published");
  console.log("  [PASS] 12. Assignment published successfully (draft -> published)");
  passed++;
}

// Test 13: Close assignment
{
  const closed = store.close(createdAsg.id);
  assert.equal(closed.status, "closed");
  console.log("  [PASS] 13. Assignment closed successfully (published -> closed)");
  passed++;
}

// Test 14: Delete assignment
{
  const deleted = store.delete(createdAsg.id);
  assert.equal(deleted, true);
  assert.equal(
    store.items.some((i) => i.id === createdAsg.id),
    false,
  );
  console.log("  [PASS] 14. Assignment deleted successfully");
  passed++;
}

console.log("\n======================================================");
console.log(`  PENUGASAN SUITE COMPLETE: ${passed}/14 TESTS PASSED (0 FAILED)`);
console.log("======================================================\n");
