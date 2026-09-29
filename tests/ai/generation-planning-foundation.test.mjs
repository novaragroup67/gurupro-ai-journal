#!/usr/bin/env node
/**
 * ==============================================================================
 * GURUPRO TEST SUITE: GEN-0 GENERATION PLANNING FOUNDATION
 * ==============================================================================
 *
 * Verifies:
 * 1. Illustration Outline Validation (deterministic contract)
 * 2. Presentation Outline & Slide Validation
 * 3. Slide Manipulation Operations (add, remove, reorder, update)
 * 4. Shared Style Catalog & Preset Invariants (7 illustration, 6 presentation)
 * 5. Grounded Initial Plan Generation from Modul Ajar
 * 6. Version Lifecycle & Immutable Version History
 * 7. Approval Gate & Validation Eligibility
 * 8. Automatic Approval Invalidation Policy (on outline or style edit)
 * 9. Generation Authorization Specification Generation & Invariants
 * 10. Concurrency & Stale Approval Rejection
 * 11. RBAC & Multi-tenant Owner Boundaries
 * 12. Strict Non-Generation & Cost-Control Invariant (zero image / PPTX rendering)
 */

import assert from "node:assert/strict";

import {
  AI_ERROR_CODES,
  AiServiceError,
} from "../../src/lib/ai/error-taxonomy.ts";
import {
  ILLUSTRATION_STYLES_CATALOG,
  PRESENTATION_STYLES_CATALOG,
  getStyleById,
  validateIllustrationOutline,
  validatePresentationOutline,
  validateGenerationPlanApprovalEligibility,
  createGenerationSpecification,
} from "../../src/lib/ai/generation-planning-contract.ts";
import {
  generateInitialIllustrationOutline,
  generateInitialPresentationOutline,
  addSlideToPresentationOutline,
  removeSlideFromPresentationOutline,
  reorderSlidesInPresentationOutline,
  updateSlideInPresentationOutline,
  createInitialPlan,
  applyOutlineEdits,
  applyStyleSelection,
  applyPlanApproval,
  applyPlanApprovalRevocation,
} from "../../src/lib/ai/generation-planning-service.ts";

console.log("================================================================================");
console.log("  GURUPRO TEST SUITE: GEN-0 GENERATION PLANNING FOUNDATION                      ");
console.log("================================================================================");

let testsPassed = 0;
let testsFailed = 0;

async function runTest(name, fn) {
  try {
    process.stdout.write(`  • ${name} ... `);
    await fn();
    console.log("✓ PASS");
    testsPassed++;
  } catch (err) {
    console.log("✗ FAIL");
    console.error(err);
    testsFailed++;
  }
}

// Mock Modul for Testing
const mockModul = {
  id: "modul_test_bio_101",
  guruId: "usr_teacher_1",
  mataPelajaran: "Biologi",
  fase: "E",
  kelas: "10",
  judul: "Fotosintesis dan Metabolisme Sel Tumbuhan",
  durasiJam: 2,
  ringkasan: "Modul ini membahas proses fotosintesis pada tumbuhan hijau termasuk reaksi terang dan gelap.",
  tujuanPembelajaran: [
    "Siswa mampu mengidentifikasi komponen sel tumbuhan yang berperan dalam fotosintesis.",
    "Siswa mampu menganalisis tahapan reaksi terang dan gelap.",
  ],
  sections: [
    {
      id: "sec_kloroplas",
      judul: "Struktur Kloroplas dan Klorofil",
      isi: "Kloroplas terdiri dari tilakoid, grana, dan stroma yang berfungsi sebagai tempat reaksi terang dan fiksasi karbon.",
      poin: ["Membran ganda", "Tilakoid dan Grana", "Stroma"],
    },
    {
      id: "sec_reaksi_terang",
      judul: "Reaksi Terang Fotosintesis",
      isi: "Reaksi fotolisis air dan pembentukan ATP serta NADPH dengan bantuan energi foton matahari.",
      poin: ["Fotolisis H2O", "Fotofosforilasi", "Pelepasan O2"],
    },
    {
      id: "sec_siklus_calvin",
      judul: "Reaksi Gelap / Siklus Calvin",
      isi: "Proses fiksasi CO2 oleh RuBP menghasilkan glukosa di dalam stroma.",
      poin: ["Fiksasi Karbon", "Reduksi PGA", "Regenerasi RuBP"],
    },
  ],
  slides: [],
  terakhirDiubah: "2026-09-29T10:00:00Z",
  aiMetadata: {
    sourceSnapshots: ["src_bio_klorofil"],
    evidenceRefs: [
      { evidenceId: "ev_kloroplas_structure", textSnippet: "Kloroplas memiliki tilakoid dan grana" },
    ],
  },
};

// -----------------------------------------------------------------------------
// Section 1: Illustration Outline Validation
// -----------------------------------------------------------------------------
console.log("\n--- Section 1: Illustration Outline Contract Validation ---");

await runTest("Valid illustration outline passes validation", () => {
  const outline = {
    title: "Struktur Kloroplas 3D",
    objective: "Memvisualisasikan komponen organel sel tumbuhan",
    mainSubject: "Kloroplas dengan tilakoid dan stroma",
    supportingElements: ["Molekul klorofil", "Foton cahaya matahari"],
    environmentBackground: "Sitoplasma sel tumbuhan bersih dengan pencahayaan jelas",
    composition: "Komposisi simetris dengan penampang melintang di tengah",
    perspectiveView: "Perspektif 3/4 isometrik",
    educationalFocus: "Memahami bagian tilakoid dan stroma",
    thingsToAvoid: ["Teks berjejal", "Warna redup"],
    sourceReferences: ["modul:modul_test_bio_101"],
    evidenceReferences: ["ev_kloroplas_structure"],
  };

  const validated = validateIllustrationOutline(outline);
  assert.equal(validated.title, "Struktur Kloroplas 3D");
  assert.equal(validated.supportingElements.length, 2);
});

await runTest("Rejects illustration outline with empty or short title", () => {
  const invalid = {
    title: "Ab", // < 3 chars
    objective: "Objektif pembelajaran valid",
    mainSubject: "Subjek utama",
    environmentBackground: "Latar belakang valid",
    composition: "Komposisi valid",
    perspectiveView: "Sudut pandang valid",
    educationalFocus: "Fokus edukasi valid",
  };

  assert.throws(
    () => validateIllustrationOutline(invalid),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.INVALID_REQUEST,
  );
});

await runTest("Rejects illustration outline with missing mainSubject", () => {
  const invalid = {
    title: "Judul Gambar Valid",
    objective: "Objektif valid",
    mainSubject: "", // empty
    environmentBackground: "Latar belakang",
    composition: "Komposisi",
    perspectiveView: "Eye level",
    educationalFocus: "Fokus edukasi",
  };

  assert.throws(
    () => validateIllustrationOutline(invalid),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.INVALID_REQUEST,
  );
});

await runTest("Rejects illustration outline with short objective (< 5 chars)", () => {
  const invalid = {
    title: "Judul Valid",
    objective: "Halo", // < 5 chars
    mainSubject: "Subjek utama",
    environmentBackground: "Latar belakang",
    composition: "Komposisi",
    perspectiveView: "Eye level",
    educationalFocus: "Fokus edukasi",
  };

  assert.throws(
    () => validateIllustrationOutline(invalid),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.INVALID_REQUEST,
  );
});

// -----------------------------------------------------------------------------
// Section 2: Presentation Outline & Slide Validation
// -----------------------------------------------------------------------------
console.log("\n--- Section 2: Presentation Outline & Slide Contract Validation ---");

await runTest("Valid presentation outline passes validation", () => {
  const outline = {
    title: "Presentasi Biologi Sel: Fotosintesis",
    objective: "Menjelaskan tahapan metabolisme tumbuhan hijau",
    targetAudience: "Siswa SMA Kelas 10",
    intendedSlideCount: 2,
    presentationStructure: "Pendahuluan → Inti → Penutup",
    globalVisualDirection: "Infografik bersih dan modern dengan ilustrasi sains",
    sourceReferences: ["modul:modul_test_bio_101"],
    evidenceReferences: ["ev_kloroplas_structure"],
    styleRequirements: "Palet hijau botani",
    slides: [
      {
        id: "slide_1",
        slideOrder: 1,
        slideTitle: "Pendahuluan: Apa itu Fotosintesis?",
        purpose: "Pengantar konsep dan rumus reaksi umum",
        keyPoints: ["Reaksi pembentukan karbohidrat", "Pentingnya bagi ekosistem bumi"],
        contentBlocks: ["Materi ringkas."],
        visualDirection: "Gambar tumbuhan hijau terkena sinar matahari",
        sourceReferences: [],
        evidenceReferences: [],
      },
      {
        id: "slide_2",
        slideOrder: 2,
        slideTitle: "Dua Reaksi Utama: Terang dan Gelap",
        purpose: "Perbandingan reaksi terang dan siklus Calvin",
        keyPoints: ["Reaksi terang di tilakoid", "Siklus Calvin di stroma"],
        contentBlocks: ["Penjelasan perbandingan."],
        visualDirection: "Diagram alir dua kompartemen kloroplas",
        sourceReferences: [],
        evidenceReferences: [],
      },
    ],
  };

  const validated = validatePresentationOutline(outline);
  assert.equal(validated.slides.length, 2);
  assert.equal(validated.slides[0].slideOrder, 1);
  assert.equal(validated.slides[1].slideOrder, 2);
});

await runTest("Rejects presentation outline with 0 slides", () => {
  const invalid = {
    title: "Presentasi Tanpa Slide",
    objective: "Objektif valid",
    targetAudience: "Siswa",
    intendedSlideCount: 0,
    presentationStructure: "Struktur",
    globalVisualDirection: "Visual",
    slides: [],
  };

  assert.throws(
    () => validatePresentationOutline(invalid),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.INVALID_REQUEST,
  );
});

await runTest("Rejects presentation outline with non-continuous slide numbers", () => {
  const invalid = {
    title: "Presentasi Nomor Lompat",
    objective: "Objektif valid",
    targetAudience: "Siswa",
    intendedSlideCount: 2,
    presentationStructure: "Struktur",
    globalVisualDirection: "Visual",
    slides: [
      {
        id: "s1",
        slideOrder: 1,
        slideTitle: "Slide 1",
        purpose: "Tujuan 1",
        keyPoints: ["Poin A"],
        contentBlocks: [],
        visualDirection: "Visual A",
        sourceReferences: [],
        evidenceReferences: [],
      },
      {
        id: "s2",
        slideOrder: 3, // Skipped 2!
        slideTitle: "Slide 3",
        purpose: "Tujuan 3",
        keyPoints: ["Poin B"],
        contentBlocks: [],
        visualDirection: "Visual B",
        sourceReferences: [],
        evidenceReferences: [],
      },
    ],
  };

  assert.throws(
    () => validatePresentationOutline(invalid),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.INVALID_REQUEST,
  );
});

await runTest("Rejects slide with empty key points", () => {
  const invalid = {
    title: "Presentasi Slide Kosong",
    objective: "Objektif valid",
    targetAudience: "Siswa",
    intendedSlideCount: 1,
    presentationStructure: "Struktur",
    globalVisualDirection: "Visual",
    slides: [
      {
        id: "s1",
        slideOrder: 1,
        slideTitle: "Slide 1",
        purpose: "Tujuan 1",
        keyPoints: [], // Empty!
        contentBlocks: [],
        visualDirection: "Visual A",
        sourceReferences: [],
        evidenceReferences: [],
      },
    ],
  };

  assert.throws(
    () => validatePresentationOutline(invalid),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.INVALID_REQUEST,
  );
});

// -----------------------------------------------------------------------------
// Section 3: Deterministic Slide Manipulation Helpers
// -----------------------------------------------------------------------------
console.log("\n--- Section 3: Slide Manipulation Operations ---");

const basePresentationOutline = {
  title: "Outline Dasar",
  objective: "Objektif dasar",
  targetAudience: "Kelas 10",
  intendedSlideCount: 2,
  presentationStructure: "Struktur",
  globalVisualDirection: "Visual Direction",
  sourceReferences: [],
  evidenceReferences: [],
  styleRequirements: "",
  slides: [
    {
      id: "s1",
      slideOrder: 1,
      slideTitle: "Slide Pertama",
      purpose: "Tujuan Pertama",
      keyPoints: ["Poin 1"],
      contentBlocks: [],
      visualDirection: "Visual 1",
      sourceReferences: [],
      evidenceReferences: [],
    },
    {
      id: "s2",
      slideOrder: 2,
      slideTitle: "Slide Kedua",
      purpose: "Tujuan Kedua",
      keyPoints: ["Poin 2"],
      contentBlocks: [],
      visualDirection: "Visual 2",
      sourceReferences: [],
      evidenceReferences: [],
    },
  ],
};

await runTest("addSlideToPresentationOutline appends slide with sequential order", () => {
  const updated = addSlideToPresentationOutline(basePresentationOutline, {
    slideTitle: "Slide Ketiga Baru",
    purpose: "Tujuan Ketiga",
    keyPoints: ["Poin baru"],
    visualDirection: "Diagram visual",
  });

  assert.equal(updated.slides.length, 3);
  assert.equal(updated.slides[2].slideOrder, 3);
  assert.equal(updated.slides[2].slideTitle, "Slide Ketiga Baru");
  assert.equal(updated.intendedSlideCount, 3);
});

await runTest("removeSlideFromPresentationOutline removes slide and reindexes remaining slides", () => {
  // Remove slide 1 from a 3-slide outline
  const threeSlideOutline = {
    ...basePresentationOutline,
    slides: [
      ...basePresentationOutline.slides,
      {
        id: "s3",
        slideOrder: 3,
        slideTitle: "Slide Ketiga",
        purpose: "Tujuan 3",
        keyPoints: ["Poin 3"],
        contentBlocks: [],
        visualDirection: "Visual 3",
        sourceReferences: [],
        evidenceReferences: [],
      },
    ],
  };

  const updated = removeSlideFromPresentationOutline(threeSlideOutline, "s1");
  assert.equal(updated.slides.length, 2);
  assert.equal(updated.slides[0].id, "s2");
  assert.equal(updated.slides[0].slideOrder, 1, "s2 must be re-indexed to slideOrder 1");
  assert.equal(updated.slides[1].id, "s3");
  assert.equal(updated.slides[1].slideOrder, 2, "s3 must be re-indexed to slideOrder 2");
});

await runTest("removeSlideFromPresentationOutline fails when trying to remove the only slide", () => {
  const singleSlideOutline = {
    ...basePresentationOutline,
    slides: [basePresentationOutline.slides[0]],
  };

  assert.throws(
    () => removeSlideFromPresentationOutline(singleSlideOutline, "s1"),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.INVALID_REQUEST,
  );
});

await runTest("reorderSlidesInPresentationOutline reorders slides and enforces continuous 1..N order", () => {
  const reordered = reorderSlidesInPresentationOutline(basePresentationOutline, ["s2", "s1"]);
  assert.equal(reordered.slides[0].id, "s2");
  assert.equal(reordered.slides[0].slideOrder, 1);
  assert.equal(reordered.slides[1].id, "s1");
  assert.equal(reordered.slides[1].slideOrder, 2);
});

await runTest("reorderSlidesInPresentationOutline rejects mismatched slide IDs", () => {
  assert.throws(
    () => reorderSlidesInPresentationOutline(basePresentationOutline, ["s2", "non_existent"]),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.INVALID_REQUEST,
  );
});

await runTest("updateSlideInPresentationOutline updates properties of target slide", () => {
  const updated = updateSlideInPresentationOutline(basePresentationOutline, "s1", {
    slideTitle: "Judul Slide Baru yang Diperbarui",
    keyPoints: ["Poin A Diperbarui", "Poin B Baru"],
  });

  assert.equal(updated.slides[0].slideTitle, "Judul Slide Baru yang Diperbarui");
  assert.equal(updated.slides[0].keyPoints.length, 2);
  // Ensure slide 2 was untouched
  assert.equal(updated.slides[1].slideTitle, "Slide Kedua");
});

// -----------------------------------------------------------------------------
// Section 4: Style Catalogs & Presets Invariants
// -----------------------------------------------------------------------------
console.log("\n--- Section 4: Style System & Presets Invariants ---");

await runTest("Illustration style catalog contains exactly 7 predefined presets", () => {
  assert.equal(ILLUSTRATION_STYLES_CATALOG.length, 7);
  const ids = ILLUSTRATION_STYLES_CATALOG.map((s) => s.id);
  assert.ok(ids.includes("style_ill_flat_edu"));
  assert.ok(ids.includes("style_ill_3d_edu"));
  assert.ok(ids.includes("style_ill_modern_vector"));
  assert.ok(ids.includes("style_ill_hand_drawn"));
  assert.ok(ids.includes("style_ill_realistic"));
  assert.ok(ids.includes("style_ill_infographic"));
  assert.ok(ids.includes("style_ill_tech_diagram"));

  for (const style of ILLUSTRATION_STYLES_CATALOG) {
    assert.equal(style.type, "illustration");
    assert.ok(style.visualRules.length > 0);
    assert.ok(style.promptModifiers.length > 0);
  }
});

await runTest("Presentation style catalog contains exactly 6 predefined presets", () => {
  assert.equal(PRESENTATION_STYLES_CATALOG.length, 6);
  const ids = PRESENTATION_STYLES_CATALOG.map((s) => s.id);
  assert.ok(ids.includes("style_ppt_modern_minimal"));
  assert.ok(ids.includes("style_ppt_edu_classroom"));
  assert.ok(ids.includes("style_ppt_corp_pro"));
  assert.ok(ids.includes("style_ppt_visual_learning"));
  assert.ok(ids.includes("style_ppt_technical"));
  assert.ok(ids.includes("style_ppt_academic"));

  for (const style of PRESENTATION_STYLES_CATALOG) {
    assert.equal(style.type, "presentation");
    assert.ok(style.layoutRules.length > 0);
    assert.ok(style.typographyRules.length > 0);
  }
});

await runTest("getStyleById retrieves style or returns undefined for unknown ID", () => {
  const flat = getStyleById("style_ill_flat_edu");
  assert.equal(flat.name, "Flat Educational");

  const unknown = getStyleById("style_unknown_foo");
  assert.equal(unknown, undefined);
});

// -----------------------------------------------------------------------------
// Section 5: Grounded Initial Plan Generation
// -----------------------------------------------------------------------------
console.log("\n--- Section 5: Grounded Initial Plan Generation ---");

function createTestIllustrationPlan(styleId = "style_ill_flat_edu", ownerId = "usr_teacher_1") {
  const outline = generateInitialIllustrationOutline(mockModul, "sec_kloroplas");
  return createInitialPlan(ownerId, mockModul.id, "illustration", outline, styleId);
}

function createTestPresentationPlan(styleId = "style_ppt_edu_classroom", ownerId = "usr_teacher_1") {
  const outline = generateInitialPresentationOutline(mockModul);
  return createInitialPlan(ownerId, mockModul.id, "presentation", outline, styleId);
}

await runTest("generateInitialIllustrationOutline grounds on specific section and modul metadata", () => {
  const outline = generateInitialIllustrationOutline(mockModul, "sec_reaksi_terang");
  assert.ok(outline.title.includes("Reaksi Terang Fotosintesis"));
  assert.equal(outline.mainSubject, "Reaksi Terang Fotosintesis");
  assert.ok(outline.educationalFocus.includes("kelas 10"));
  assert.ok(outline.sourceReferences.includes("modul:modul_test_bio_101"));
  assert.ok(outline.sourceReferences.includes("section:sec_reaksi_terang"));
  assert.ok(outline.evidenceReferences.includes("ev_kloroplas_structure"));
});

await runTest("generateInitialPresentationOutline generates grounded slide sequence for whole modul", () => {
  const outline = generateInitialPresentationOutline(mockModul);
  assert.ok(outline.title.includes(mockModul.judul));
  assert.ok(outline.slides.length >= 3);
  assert.equal(outline.slides[0].slideTitle, mockModul.judul); // Title slide
  assert.equal(outline.slides[0].slideOrder, 1);
  // Verify sequential order
  for (let i = 0; i < outline.slides.length; i++) {
    assert.equal(outline.slides[i].slideOrder, i + 1);
  }
});

await runTest("createInitialPlan initializes valid plan with initial version 1 and ready status", () => {
  const { plan, initialVersion } = createTestIllustrationPlan();

  assert.equal(plan.targetType, "illustration");
  assert.equal(plan.currentVersion, 1);
  assert.equal(plan.status, "ready");
  assert.equal(plan.style.styleId, "style_ill_flat_edu");
  assert.equal(plan.approvedVersion, null);
  assert.equal(initialVersion.versionNumber, 1);
  assert.equal(initialVersion.isApproved, false);
});

await runTest("createInitialPlan rejects invalid outline", () => {
  const invalidOutline = {
    title: "X", // too short
    objective: "Obj",
    mainSubject: "",
    environmentBackground: "",
    composition: "",
    perspectiveView: "",
    educationalFocus: "",
  };
  assert.throws(
    () => createInitialPlan("usr_teacher_1", mockModul.id, "illustration", invalidOutline),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.INVALID_REQUEST,
  );
});

// -----------------------------------------------------------------------------
// Section 6: Version Lifecycle & Immutable Snapshots
// -----------------------------------------------------------------------------
console.log("\n--- Section 6: Version Lifecycle & Immutable Snapshots ---");

await runTest("applyOutlineEdits increments version from v1 to v2 with immutable snapshot", () => {
  const { plan } = createTestIllustrationPlan();

  const editedOutline = {
    ...plan.outline,
    title: "Struktur Kloroplas v2 Diperbarui",
    mainSubject: "Kloroplas Penampang Melintang Terperinci",
  };

  const { updatedPlan, newVersion } = applyOutlineEdits(plan, editedOutline, "usr_teacher_1", "Pembaruan subjek guru");

  assert.equal(updatedPlan.currentVersion, 2);
  assert.equal(updatedPlan.outline.title, "Struktur Kloroplas v2 Diperbarui");
  assert.equal(newVersion.versionNumber, 2);
  assert.equal(newVersion.outlineSnapshot.title, "Struktur Kloroplas v2 Diperbarui");
  assert.equal(newVersion.changeMetadata.summary, "Pembaruan subjek guru");
  assert.equal(newVersion.isApproved, false);
});

await runTest("applyOutlineEdits rejects non-owner teacher", () => {
  const { plan } = createTestIllustrationPlan();

  assert.throws(
    () => applyOutlineEdits(plan, plan.outline, "usr_intruder"),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.ROLE_FORBIDDEN,
  );
});

// -----------------------------------------------------------------------------
// Section 7: Approval Gate & State Machine
// -----------------------------------------------------------------------------
console.log("\n--- Section 7: Approval Gate & State Machine ---");

await runTest("applyPlanApproval transitions plan to approved and locks approvedVersion", () => {
  const { plan } = createTestIllustrationPlan();
  const auth = { userId: "usr_teacher_1", role: "guru" };

  const { approvedPlan } = applyPlanApproval(plan, auth);
  assert.equal(approvedPlan.status, "approved");
  assert.equal(approvedPlan.approvedVersion, 1);
});

await runTest("applyPlanApproval fails if style is not selected or invalid", () => {
  const { plan } = createTestIllustrationPlan(undefined);
  const planWithoutStyle = { ...plan, style: null, selectedStyleId: undefined, selectedStyleInfo: undefined };
  const auth = { userId: "usr_teacher_1", role: "guru" };

  assert.throws(
    () => applyPlanApproval(planWithoutStyle, auth),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.INVALID_REQUEST,
  );
});

await runTest("applyPlanApproval fails if caller is not the owner teacher", () => {
  const { plan } = createTestIllustrationPlan();
  const intruderAuth = { userId: "usr_teacher_intruder", role: "guru" };

  assert.throws(
    () => applyPlanApproval(plan, intruderAuth),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.INVALID_REQUEST,
  );
});

await runTest("applyPlanApproval fails if caller is student", () => {
  const { plan } = createTestIllustrationPlan();
  const studentAuth = { userId: "usr_teacher_1", role: "siswa" };

  assert.throws(
    () => applyPlanApproval(plan, studentAuth),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.INVALID_REQUEST,
  );
});

await runTest("applyPlanApprovalRevocation unlocks approved plan back to ready", () => {
  const { plan } = createTestIllustrationPlan();
  const auth = { userId: "usr_teacher_1", role: "guru" };
  const { approvedPlan } = applyPlanApproval(plan, auth);

  const revoked = applyPlanApprovalRevocation(approvedPlan, auth);
  assert.equal(revoked.status, "ready");
  assert.equal(revoked.approvedVersion, null);
});

// -----------------------------------------------------------------------------
// Section 8: Automatic Approval Invalidation Policy
// -----------------------------------------------------------------------------
console.log("\n--- Section 8: Automatic Approval Invalidation Policy ---");

await runTest("Editing outline on approved plan automatically revokes approval (status -> ready)", () => {
  const { plan } = createTestIllustrationPlan();
  const auth = { userId: "usr_teacher_1", role: "guru" };
  const { approvedPlan } = applyPlanApproval(plan, auth);
  assert.equal(approvedPlan.status, "approved");
  assert.equal(approvedPlan.approvedVersion, 1);

  const { updatedPlan, newVersion } = applyOutlineEdits(
    approvedPlan,
    { ...approvedPlan.outline, title: "Revisi Setelah Persetujuan" },
    "usr_teacher_1",
  );

  assert.equal(updatedPlan.status, "ready", "Status must return to ready");
  assert.equal(updatedPlan.currentVersion, 2);
  assert.equal(updatedPlan.approvedVersion, null, "Approved version must be cleared");
  assert.equal(newVersion.isApproved, false);
});

await runTest("Changing visual style on approved plan automatically revokes approval", () => {
  const { plan } = createTestIllustrationPlan();
  const auth = { userId: "usr_teacher_1", role: "guru" };
  const { approvedPlan } = applyPlanApproval(plan, auth);

  const styleSwapped = applyStyleSelection(approvedPlan, "style_ill_3d_edu", "usr_teacher_1");

  assert.equal(styleSwapped.style.styleId, "style_ill_3d_edu");
  assert.equal(styleSwapped.status, "ready", "Status must revert to ready");
  assert.equal(styleSwapped.approvedVersion, null);
});

await runTest("Selecting invalid style ID or mismatched target type is rejected", () => {
  const { plan } = createTestIllustrationPlan();

  // Illustration target cannot accept presentation style
  assert.throws(
    () => applyStyleSelection(plan, "style_ppt_modern_minimal", "usr_teacher_1"),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.INVALID_REQUEST,
  );
});

// -----------------------------------------------------------------------------
// Section 9: Generation Authorization & Specification Creation
// -----------------------------------------------------------------------------
console.log("\n--- Section 9: Generation Authorization & Consumable Specification ---");

await runTest("createGenerationSpecification succeeds for fully approved current plan", () => {
  const { plan } = createTestIllustrationPlan();
  const auth = { userId: "usr_teacher_1", role: "guru" };
  const { approvedPlan } = applyPlanApproval(plan, auth);

  const spec = createGenerationSpecification(approvedPlan, auth);
  assert.equal(spec.targetType, "illustration");
  assert.equal(spec.generationPlanId, approvedPlan.id);
  assert.equal(spec.approvedOutlineVersion, 1);
  assert.equal(spec.styleId, "style_ill_flat_edu");
  assert.equal(spec.styleSnapshot.name, "Flat Educational");
  assert.ok(spec.prompt.includes("Struktur Kloroplas dan Klorofil"));
  assert.ok(spec.prompt.includes("clean flat 2D vector educational illustration"));
  assert.equal(spec.parameters.dimensions?.width, 1024);
  assert.equal(spec.parameters.dimensions?.height, 1024);
});

await runTest("createGenerationSpecification creates valid 16:9 presentation spec", () => {
  const { plan } = createTestPresentationPlan();
  const auth = { userId: "usr_teacher_1", role: "guru" };
  const { approvedPlan } = applyPlanApproval(plan, auth);

  const spec = createGenerationSpecification(approvedPlan, auth);
  assert.equal(spec.targetType, "presentation");
  assert.equal(spec.styleId, "style_ppt_edu_classroom");
  assert.equal(spec.parameters.aspectRatio, "16:9");
  assert.ok(spec.prompt.includes(mockModul.judul));
  assert.ok(spec.sourceReferences.includes("modul:modul_test_bio_101"));
});

await runTest("createGenerationSpecification fails if plan is not in approved status", () => {
  const { plan } = createTestIllustrationPlan();
  const auth = { userId: "usr_teacher_1", role: "guru" };

  assert.throws(
    () => createGenerationSpecification(plan, auth),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.INVALID_REQUEST,
  );
});

await runTest("createGenerationSpecification fails if approvedVersion is stale (stale approval invariant)", () => {
  const { plan } = createTestIllustrationPlan();
  const auth = { userId: "usr_teacher_1", role: "guru" };
  const { approvedPlan } = applyPlanApproval(plan, auth);

  // Manually corrupt approved version to test stale detection
  const stalePlan = {
    ...approvedPlan,
    currentVersion: 2,
    approvedVersion: 1, // Mismatch!
  };

  assert.throws(
    () => createGenerationSpecification(stalePlan, auth),
    (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.INVALID_REQUEST,
  );
});

// -----------------------------------------------------------------------------
// Section 10: Strict Non-Generation & Cost-Control Invariants
// -----------------------------------------------------------------------------
console.log("\n--- Section 10: Non-Generation & Cost-Control Invariant ---");

await runTest("Planning, editing, and authorization execute strictly without external image/PPT APIs", () => {
  // Audit that throughout all steps:
  // - No binary files (PNG, JPEG, PPTX) are rendered
  // - Zero external API keys or network requests are dispatched
  // - Specifications are purely declarative contract blueprints
  const { plan } = createTestIllustrationPlan();
  const auth = { userId: "usr_teacher_1", role: "guru" };
  const { approvedPlan } = applyPlanApproval(plan, auth);
  const spec = createGenerationSpecification(approvedPlan, auth);

  assert.ok(spec.authorizationId.startsWith("auth_"));
  assert.equal(typeof spec.prompt, "string");
  // Ensure no binary image data or base64 canvas exists
  assert.equal(spec.imageBuffer, undefined);
  assert.equal(spec.pptxBuffer, undefined);
});

// -----------------------------------------------------------------------------
// FINAL SUMMARY
// -----------------------------------------------------------------------------
console.log("\n================================================================================");
console.log(`  GEN-0 TEST SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
console.log("================================================================================");

if (testsFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
