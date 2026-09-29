/**
 * ==============================================================================
 * GURUPRO AI: GENERATION PLANNING SERVICE (GEN-0)
 * ==============================================================================
 *
 * Implements:
 * - Low-cost grounded outline generator from Modul Ajar
 * - Deterministic slide editing & reordering operations
 * - Version lifecycle transitions and immutable version creation
 * - Approval state machine with automatic revocation on outline/style edits
 * - Strict non-generation invariant (zero image / PPTX rendering)
 */

import { uid } from "../cloud-store";
import type { Modul, ModulSection } from "../modul-types";
import {
  AI_ERROR_CODES,
  AiServiceError,
} from "./error-taxonomy";
import {
  IllustrationOutline,
  PresentationOutline,
  PresentationSlide,
  GenerationPlan,
  GenerationPlanVersion,
  GenerationPlanTargetType,
  SelectedStyleInfo,
  PlanAuthContext,
  getStyleById,
  validateIllustrationOutline,
  validatePresentationOutline,
  validateGenerationPlanApprovalEligibility,
} from "./generation-planning-contract";

/**
 * Builds a grounded initial IllustrationOutline from a Modul Ajar without external AI calls.
 */
export function generateInitialIllustrationOutline(
  modul: Modul,
  sectionId?: string,
): IllustrationOutline {
  let targetSection: ModulSection | undefined;
  if (sectionId) {
    targetSection = modul.sections.find((s) => s.id === sectionId);
  }
  if (!targetSection && modul.sections.length > 0) {
    targetSection = modul.sections[0];
  }

  const subjectTitle = targetSection?.judul || modul.judul;
  const rawPoin = targetSection?.poin || [];
  const rawIsi = targetSection?.isi || modul.ringkasan || "";

  // Grounded extraction
  const mainSubject = subjectTitle.replace(/^(\d+[\.\)]|\s*Bab\s*\d+:?)\s*/i, "").trim();
  const supportingElements = rawPoin.slice(0, 4).map((p) => p.trim());
  if (supportingElements.length === 0) {
    supportingElements.push(`Visualisasi materi ${mainSubject}`);
  }

  const educationalFocus = `Memvisualisasikan konsep ${mainSubject} agar siswa kelas ${modul.kelas || "terkait"} dapat mengamati keterkaitan komponen materi secara konseptual.`;
  const environment = `Ruang kelas atau lingkungan kontekstual terapan materi ${mainSubject}, bersih dengan pencahayaan jelas.`;
  const composition = "Komposisi seimbang dengan subjek utama di bagian tengah, elemen pendukung terdistribusi rapi di sisi kiri dan kanan.";
  const perspectiveView = "Tampilan isometrik atau perspektif 3/4 dengan sudut pandang mata normal (*eye-level*).";

  const importantVisualDetails = [
    `Detail struktur utama dari ${mainSubject}`,
    "Warna dan kontras yang jelas untuk membedakan antar-bagian",
    "Gaya visual informatif dan ramah siswa",
  ];

  const labelsText = supportingElements.slice(0, 3).map((e) => e.slice(0, 30));

  const thingsToAvoid = [
    "Teks berjejal atau paragraf panjang di dalam gambar",
    "Visual gelap dengan kontras rendah",
    "Elemen dekoratif membingungkan yang tidak relevan dengan kurikulum",
  ];

  const sourceRefs = [
    `modul:${modul.id}`,
    ...(targetSection ? [`section:${targetSection.id}`] : []),
  ];

  const evidenceRefs = modul.aiMetadata?.evidenceRefs?.map((e: any) => e.evidenceId || e.chunkId || e.sourceId).filter(Boolean) || [
    "ev_modul_grounding",
  ];

  return {
    title: `Ilustrasi: ${subjectTitle}`,
    objective: `Mendukung pemahaman siswa mengenai ${mainSubject} melalui visualisasi konsep.`,
    mainSubject,
    supportingElements,
    environmentBackground: environment,
    composition,
    perspectiveView,
    poseAction: "Subjek ditampilkan dalam kondisi interaktif/beroperasi normal.",
    importantVisualDetails,
    labelsTextRequirements: labelsText,
    educationalFocus,
    thingsToAvoid,
    sourceReferences: sourceRefs,
    evidenceReferences: evidenceRefs,
    sectionId: targetSection?.id,
  };
}

/**
 * Builds a grounded initial PresentationOutline from a Modul Ajar without external AI calls.
 */
export function generateInitialPresentationOutline(
  modul: Modul,
  options?: { targetSlideCount?: number },
): PresentationOutline {
  const slides: PresentationSlide[] = [];
  const sourceRefs = [`modul:${modul.id}`];
  const evidenceRefs = modul.aiMetadata?.evidenceRefs?.map((e: any) => e.evidenceId || e.chunkId || e.sourceId).filter(Boolean) || [
    "ev_modul_grounding",
  ];

  // 1. Title / Intro Slide
  slides.push({
    id: `slide_${uid()}`,
    slideOrder: 1,
    slideTitle: modul.judul,
    purpose: "Membuka sesi pembelajaran, menyampaikan apersepsi dan judul topik.",
    keyPoints: [
      modul.kelas || "Mata Pelajaran & Kelas",
      modul.ringkasan?.slice(0, 100) || "Pengantar modul pembelajaran interaktif",
      "Disusun berbasis Kurikulum Merdeka",
    ],
    contentBlocks: [
      `Topik: ${modul.judul}`,
      `Kelas: ${modul.kelas || "Semua Tingkat"}`,
    ],
    visualDirection: "Desain sampul yang bersih dengan judul utama kontras tinggi dan grafis pembuka yang menarik.",
    sourceReferences: sourceRefs,
    evidenceReferences: evidenceRefs,
    speakerNotesDirection: "Guru menyapa siswa, mengecek kehadiran, dan mengaitkan topik hari ini dengan pengalaman sehari-hari.",
  });

  // 2. Learning Objectives Slide
  if (Array.isArray(modul.tujuan) && modul.tujuan.length > 0) {
    slides.push({
      id: `slide_${uid()}`,
      slideOrder: 2,
      slideTitle: "Tujuan Pembelajaran",
      purpose: "Memberikan kejelasan arah capaian kompetensi kepada siswa sebelum materi dimulai.",
      keyPoints: modul.tujuan.slice(0, 4),
      contentBlocks: modul.tujuan.slice(0, 4).map((t, idx) => `${idx + 1}. ${t}`),
      visualDirection: "Tata letak kartu tujuan dengan ikon bernomor untuk memudahkan navigasi capaian.",
      sourceReferences: sourceRefs,
      evidenceReferences: evidenceRefs,
      speakerNotesDirection: "Jelaskan manfaat praktis mempelajari tujuan ini bagi kehidupan siswa di masa depan.",
    });
  }

  // 3. Body Slides from Modul Sections
  const sections = modul.sections && modul.sections.length > 0 ? modul.sections : [];
  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i]!;
    const slideNumber = slides.length + 1;
    const points = sec.poin && sec.poin.length > 0 ? sec.poin.slice(0, 4) : [`Ulasan pokok materi ${sec.judul}`];

    slides.push({
      id: `slide_${uid()}`,
      slideOrder: slideNumber,
      slideTitle: sec.judul,
      purpose: `Mengupas konsep inti dan langkah penerapan pada sub-materi ${sec.judul}.`,
      keyPoints: points,
      contentBlocks: [
        sec.isi ? sec.isi.slice(0, 180) + (sec.isi.length > 180 ? "..." : "") : `Penjelasan mengenai ${sec.judul}`,
      ],
      visualDirection: "Struktur split-screen (tengah/kiri: penjelasan butir inti, kanan: diagram/ruang ilustrasi).",
      sourceReferences: [`modul:${modul.id}`, `section:${sec.id}`],
      evidenceReferences: evidenceRefs,
      speakerNotesDirection: `Jelaskan ${sec.judul} secara bertahap, berikan kesempatan siswa bertanya atau berdiskusi kelompok.`,
    });
  }

  // 4. Closing / Summary & Assessment Slide
  slides.push({
    id: `slide_${uid()}`,
    slideOrder: slides.length + 1,
    slideTitle: "Rangkuman & Refleksi",
    purpose: "Menutup pembelajaran, merangkum poin esensial, dan mengukur pemahaman siswa.",
    keyPoints: [
      "Poin utama telah dipelajari bersama",
      "Tugas mandiri / latihan pemahaman",
      "Refleksi tindak lanjut pertemuan berikutnya",
    ],
    contentBlocks: [
      modul.kesimpulan || "Pembelajaran menekankan pemahaman konsep yang bermakna dan aplikatif.",
    ],
    visualDirection: "Penutup formal dengan ruang tanya-jawab dan daftar rujukan bacaan tambahan.",
    sourceReferences: sourceRefs,
    evidenceReferences: evidenceRefs,
    speakerNotesDirection: "Ajak 2-3 siswa menyampaikan hal paling menarik yang dipelajari hari ini sebelum menutup kelas.",
  });

  return {
    title: `Presentasi: ${modul.judul}`,
    objective: modul.tujuan?.[0] || `Menyajikan modul ${modul.judul} secara interaktif dan komunikatif.`,
    targetAudience: `Siswa ${modul.kelas || "Sekolah Menengah"}`,
    intendedSlideCount: slides.length,
    presentationStructure: "Pembuka → Tujuan Pembelajaran → Konsep Inti Bertahap → Rangkuman & Refleksi",
    styleRequirements: "Kontras tinggi proyektor, spasi bersih, kartu konsep ramah siswa.",
    globalVisualDirection: "Gaya visual konsisten antar-slide dengan palet warna terkoordinasi dan tipografi sans-serif ramah baca.",
    sourceReferences: sourceRefs,
    evidenceReferences: evidenceRefs,
    slides,
  };
}

// ==============================================================================
// SLIDE MANIPULATION HELPERS (FOR PRESENTATION OUTLINES)
// ==============================================================================

export function addSlideToPresentationOutline(
  outline: PresentationOutline,
  slideData: Partial<PresentationSlide>,
  targetIndex?: number,
): PresentationOutline {
  const currentSlides = [...outline.slides];
  const insertAt = typeof targetIndex === "number" && targetIndex >= 0 && targetIndex <= currentSlides.length
    ? targetIndex
    : currentSlides.length;

  const newSlide: PresentationSlide = {
    id: slideData.id || `slide_${uid()}`,
    slideOrder: insertAt + 1,
    slideTitle: slideData.slideTitle || "Slide Baru",
    purpose: slideData.purpose || "Tujuan pembahasan slide.",
    keyPoints: slideData.keyPoints && slideData.keyPoints.length > 0 ? slideData.keyPoints : ["Poin kunci materi"],
    contentBlocks: slideData.contentBlocks || [],
    visualDirection: slideData.visualDirection || "Tata letak kartu konsep seimbang.",
    sourceReferences: slideData.sourceReferences || outline.sourceReferences,
    evidenceReferences: slideData.evidenceReferences || outline.evidenceReferences,
    speakerNotesDirection: slideData.speakerNotesDirection,
  };

  currentSlides.splice(insertAt, 0, newSlide);

  // Re-index all slide orders continuously
  const reindexedSlides = currentSlides.map((s, idx) => ({
    ...s,
    slideOrder: idx + 1,
  }));

  const updatedOutline: PresentationOutline = {
    ...outline,
    intendedSlideCount: reindexedSlides.length,
    slides: reindexedSlides,
  };

  return validatePresentationOutline(updatedOutline);
}

export function removeSlideFromPresentationOutline(
  outline: PresentationOutline,
  slideId: string,
): PresentationOutline {
  if (outline.slides.length <= 1) {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      "Presentasi wajib memiliki minimal satu slide. Tidak dapat menghapus slide terakhir.",
    );
  }

  const remaining = outline.slides.filter((s) => s.id !== slideId);
  if (remaining.length === outline.slides.length) {
    throw new AiServiceError(AI_ERROR_CODES.INVALID_REQUEST, `Slide dengan ID '${slideId}' tidak ditemukan.`);
  }

  const reindexed = remaining.map((s, idx) => ({
    ...s,
    slideOrder: idx + 1,
  }));

  const updatedOutline: PresentationOutline = {
    ...outline,
    intendedSlideCount: reindexed.length,
    slides: reindexed,
  };

  return validatePresentationOutline(updatedOutline);
}

export function reorderSlidesInPresentationOutline(
  outline: PresentationOutline,
  slideIdsInOrder: string[],
): PresentationOutline {
  if (slideIdsInOrder.length !== outline.slides.length) {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      "Daftar ID urutan slide harus memiliki panjang yang sama dengan jumlah slide saat ini.",
    );
  }

  const slideMap = new Map(outline.slides.map((s) => [s.id, s]));
  const reordered: PresentationSlide[] = [];

  for (let i = 0; i < slideIdsInOrder.length; i++) {
    const id = slideIdsInOrder[i]!;
    const slide = slideMap.get(id);
    if (!slide) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        `Slide ID '${id}' tidak ditemukan dalam presentasi.`,
      );
    }
    reordered.push({
      ...slide,
      slideOrder: i + 1,
    });
  }

  const updatedOutline: PresentationOutline = {
    ...outline,
    slides: reordered,
  };

  return validatePresentationOutline(updatedOutline);
}

export function updateSlideInPresentationOutline(
  outline: PresentationOutline,
  slideId: string,
  patch: Partial<PresentationSlide>,
): PresentationOutline {
  const index = outline.slides.findIndex((s) => s.id === slideId);
  if (index === -1) {
    throw new AiServiceError(AI_ERROR_CODES.INVALID_REQUEST, `Slide dengan ID '${slideId}' tidak ditemukan.`);
  }

  const current = outline.slides[index]!;
  const updatedSlide: PresentationSlide = {
    ...current,
    ...patch,
    id: current.id, // Immutable ID
    slideOrder: current.slideOrder, // Preserve order unless explicit reorder
  };

  const updatedSlides = [...outline.slides];
  updatedSlides[index] = updatedSlide;

  const updatedOutline: PresentationOutline = {
    ...outline,
    slides: updatedSlides,
  };

  return validatePresentationOutline(updatedOutline);
}

// ==============================================================================
// PLAN LIFECYCLE & VERSION MANAGEMENT
// ==============================================================================

/**
 * Creates an initial GenerationPlan and its Version 1 snapshot.
 */
export function createInitialPlan(
  ownerId: string,
  moduleId: string,
  targetType: GenerationPlanTargetType,
  outline: IllustrationOutline | PresentationOutline,
  initialStyleId?: string,
): { plan: GenerationPlan; initialVersion: GenerationPlanVersion } {
  // Validate outline structure
  if (targetType === "illustration") {
    validateIllustrationOutline(outline);
  } else {
    validatePresentationOutline(outline);
  }

  let styleInfo: SelectedStyleInfo | null = null;
  if (initialStyleId) {
    const styleDef = getStyleById(initialStyleId);
    if (styleDef && styleDef.type === targetType) {
      styleInfo = {
        styleId: styleDef.id,
        styleVersion: styleDef.version,
        styleName: styleDef.name,
        type: styleDef.type,
        selectedAt: new Date().toISOString(),
      };
    }
  }

  const planId = `plan_${uid()}`;
  const nowIso = new Date().toISOString();

  const plan: GenerationPlan = {
    id: planId,
    ownerId,
    moduleId,
    targetType,
    status: "ready",
    currentVersion: 1,
    approvedVersion: null,
    outline,
    style: styleInfo,
    provenance: {
      modulId: moduleId,
      sectionId: (outline as any).sectionId,
      sourceSnapshotIds: (outline as any).sourceReferences || [],
      evidenceRefs: (outline as any).evidenceReferences || [],
    },
    generationSettings: {},
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const initialVersion: GenerationPlanVersion = {
    id: `ver_${uid()}`,
    planId,
    versionNumber: 1,
    outlineSnapshot: JSON.parse(JSON.stringify(outline)),
    styleSnapshot: styleInfo ? JSON.parse(JSON.stringify(styleInfo)) : null,
    changeMetadata: {
      summary: "Inisialisasi draf outline perencanaan generasi.",
      changedFields: ["outline"],
      editedAt: nowIso,
    },
    isApproved: false,
    approvedAt: null,
    approvedBy: null,
    createdBy: ownerId,
    createdAt: nowIso,
  };

  return { plan, initialVersion };
}

/**
 * Applies teacher updates to an outline.
 *
 * Invariant:
 * - Bumps currentVersion (e.g. v1 -> v2)
 * - If plan was previously approved, revokes approval (approvedVersion = null, status = 'ready')
 * - Generates immutable historical version record
 */
export function applyOutlineEdits(
  plan: GenerationPlan,
  newOutline: IllustrationOutline | PresentationOutline,
  editorUserId: string,
  summary?: string,
): { updatedPlan: GenerationPlan; newVersion: GenerationPlanVersion } {
  if (editorUserId && plan.ownerId && editorUserId !== plan.ownerId) {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Anda bukan pemilik rencana generasi ini.",
    );
  }

  // Validate new outline
  if (plan.targetType === "illustration") {
    validateIllustrationOutline(newOutline);
  } else {
    validatePresentationOutline(newOutline);
  }

  const nextVersionNumber = plan.currentVersion + 1;
  const nowIso = new Date().toISOString();

  // If plan was approved, modifying the outline revokes previous approval!
  const statusAfterEdit = "ready";
  const approvedVersionAfterEdit = null;

  const updatedPlan: GenerationPlan = {
    ...plan,
    currentVersion: nextVersionNumber,
    approvedVersion: approvedVersionAfterEdit,
    status: statusAfterEdit,
    outline: newOutline,
    updatedAt: nowIso,
  };

  const newVersion: GenerationPlanVersion = {
    id: `ver_${uid()}`,
    planId: plan.id,
    versionNumber: nextVersionNumber,
    outlineSnapshot: JSON.parse(JSON.stringify(newOutline)),
    styleSnapshot: plan.style ? JSON.parse(JSON.stringify(plan.style)) : null,
    changeMetadata: {
      summary: summary || `Penyuntingan outline versi ${nextVersionNumber} oleh guru.`,
      changedFields: ["outline"],
      editedAt: nowIso,
    },
    isApproved: false,
    approvedAt: null,
    approvedBy: null,
    createdBy: editorUserId,
    createdAt: nowIso,
  };

  return { updatedPlan, newVersion };
}

/**
 * Updates selected style on a generation plan.
 *
 * Invariant:
 * - If plan was approved and style changes, revokes approval!
 */
export function applyStyleSelection(
  plan: GenerationPlan,
  styleId: string,
  editorUserId?: string,
): GenerationPlan {
  if (editorUserId && plan.ownerId && editorUserId !== plan.ownerId) {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Anda bukan pemilik rencana generasi ini.",
    );
  }

  const styleDef = getStyleById(styleId);
  if (!styleDef) {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      `Gaya dengan ID '${styleId}' tidak ditemukan dalam katalog.`,
    );
  }

  if (styleDef.type !== plan.targetType) {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      `Tipe gaya '${styleDef.type}' tidak cocok dengan target rencana '${plan.targetType}'.`,
    );
  }

  const isStyleChanged = !plan.style || plan.style.styleId !== styleId || plan.style.styleVersion !== styleDef.version;
  const nowIso = new Date().toISOString();

  const newStyleInfo: SelectedStyleInfo = {
    styleId: styleDef.id,
    styleVersion: styleDef.version,
    styleName: styleDef.name,
    type: styleDef.type,
    selectedAt: nowIso,
  };

  // If style changed and was previously approved, invalidate approval!
  let nextStatus = plan.status;
  let nextApprovedVersion = plan.approvedVersion;

  if (isStyleChanged && plan.status === "approved") {
    nextStatus = "ready";
    nextApprovedVersion = null;
  }

  return {
    ...plan,
    style: newStyleInfo,
    status: nextStatus,
    approvedVersion: nextApprovedVersion,
    updatedAt: nowIso,
  };
}

/**
 * Explicit Teacher Approval Gate.
 *
 * Invariant:
 * - Requires verified teacher ownership
 * - Requires valid outline structure
 * - Requires selected style
 * - Sets approvedVersion = currentVersion, status = 'approved'
 */
export function applyPlanApproval(
  plan: GenerationPlan,
  context: PlanAuthContext,
): { approvedPlan: GenerationPlan } {
  const eligibility = validateGenerationPlanApprovalEligibility(plan, context);
  if (!eligibility.eligible) {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      `Persetujuan rencana generasi ditolak: ${eligibility.reason}`,
    );
  }

  const nowIso = new Date().toISOString();

  const approvedPlan: GenerationPlan = {
    ...plan,
    status: "approved",
    approvedVersion: plan.currentVersion,
    updatedAt: nowIso,
  };

  return { approvedPlan };
}

/**
 * Revokes an existing approval.
 */
export function applyPlanApprovalRevocation(
  plan: GenerationPlan,
  context: PlanAuthContext,
): GenerationPlan {
  if (plan.ownerId !== context.userId) {
    throw new AiServiceError(
      AI_ERROR_CODES.ROLE_FORBIDDEN,
      "Akses ditolak: Hanya pemilik rencana yang dapat mencabut persetujuan.",
    );
  }

  return {
    ...plan,
    status: "ready",
    approvedVersion: null,
    updatedAt: new Date().toISOString(),
  };
}
