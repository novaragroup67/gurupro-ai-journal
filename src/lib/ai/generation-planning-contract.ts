/**
 * ==============================================================================
 * GURUPRO AI: GENERATION PLANNING FOUNDATION CONTRACT (GEN-0)
 * ==============================================================================
 *
 * Canonical domain model, schemas, validation rules, style catalogs, and
 * generation specification contracts for:
 * 1. AI Illustration Planning
 * 2. AI Presentation (PPT) Planning
 *
 * Enforces:
 * - Structured editable outlines (no monolithic free-form prompts)
 * - Strict outline versioning and immutable history
 * - Hard approval gate: generation requires explicit current approval
 * - Invalidation policy: edits or style changes revoke previous approvals
 * - Fail-closed deterministic validation without expensive AI calls
 * - Zero real image / PPTX generation in GEN-0
 */

import { z } from "zod";
import { AI_ERROR_CODES, AiServiceError } from "./error-taxonomy";

// ==============================================================================
// 1. CONSTANTS & ENUMS
// ==============================================================================

export const GENERATION_PLAN_SCHEMA_VERSION = "gen_plan_v1";

export const GenerationPlanTargetTypeSchema = z.enum(["illustration", "presentation"]);
export type GenerationPlanTargetType = z.infer<typeof GenerationPlanTargetTypeSchema>;

export const GenerationPlanStatusSchema = z.enum([
  "draft",
  "ready",
  "approved",
  "generating",
  "completed",
  "failed",
  "archived",
]);
export type GenerationPlanStatus = z.infer<typeof GenerationPlanStatusSchema>;

export const GenerationStyleTypeSchema = z.enum(["illustration", "presentation"]);
export type GenerationStyleType = z.infer<typeof GenerationStyleTypeSchema>;

// ==============================================================================
// 2. ILLUSTRATION OUTLINE CONTRACT
// ==============================================================================

export const IllustrationOutlineSchema = z.object({
  title: z.string().trim().min(3, "Judul ilustrasi minimal 3 karakter."),
  objective: z.string().trim().min(5, "Tujuan edukatif ilustrasi minimal 5 karakter."),
  mainSubject: z.string().trim().min(3, "Subjek visual utama minimal 3 karakter."),
  supportingElements: z.array(z.string().trim()).default([]),
  environmentBackground: z.string().trim().min(3, "Deskripsi latar/lingkungan minimal 3 karakter."),
  composition: z.string().trim().min(3, "Komposisi visual minimal 3 karakter."),
  perspectiveView: z.string().trim().min(3, "Sudut pandang/perspektif minimal 3 karakter."),
  poseAction: z.string().trim().optional(),
  importantVisualDetails: z.array(z.string().trim()).default([]),
  labelsTextRequirements: z.array(z.string().trim()).default([]),
  educationalFocus: z.string().trim().min(3, "Fokus pembelajaran minimal 3 karakter."),
  thingsToAvoid: z.array(z.string().trim()).default([]),
  sourceReferences: z.array(z.string().trim()).default([]),
  evidenceReferences: z.array(z.string().trim()).default([]),
  sectionId: z.string().trim().optional(),
});

export type IllustrationOutline = z.infer<typeof IllustrationOutlineSchema>;

// ==============================================================================
// 3. PRESENTATION OUTLINE CONTRACT
// ==============================================================================

export const PresentationSlideSchema = z.object({
  id: z.string().min(1, "ID slide wajib ada."),
  slideOrder: z.number().int().min(1, "Urutan slide minimal 1."),
  slideTitle: z.string().trim().min(3, "Judul slide minimal 3 karakter."),
  purpose: z.string().trim().min(3, "Tujuan slide minimal 3 karakter."),
  keyPoints: z.array(z.string().trim().min(1)).min(1, "Slide wajib memiliki minimal 1 poin kunci."),
  contentBlocks: z.array(z.string().trim()).default([]),
  visualDirection: z.string().trim().min(3, "Arah visual slide minimal 3 karakter."),
  sourceReferences: z.array(z.string().trim()).default([]),
  evidenceReferences: z.array(z.string().trim()).default([]),
  speakerNotesDirection: z.string().trim().optional(),
});

export type PresentationSlide = z.infer<typeof PresentationSlideSchema>;

export const PresentationOutlineSchema = z.object({
  title: z.string().trim().min(3, "Judul presentasi minimal 3 karakter."),
  objective: z.string().trim().min(5, "Tujuan pembelajaran presentasi minimal 5 karakter."),
  targetAudience: z.string().trim().min(3, "Target audiens minimal 3 karakter."),
  intendedSlideCount: z.number().int().min(1).max(50, "Jumlah slide maksimal 50."),
  presentationStructure: z.string().trim().min(3, "Struktur presentasi minimal 3 karakter."),
  styleRequirements: z.string().trim().default(""),
  globalVisualDirection: z.string().trim().min(3, "Arah visual global minimal 3 karakter."),
  sourceReferences: z.array(z.string().trim()).default([]),
  evidenceReferences: z.array(z.string().trim()).default([]),
  slides: z.array(PresentationSlideSchema).min(1, "Presentasi wajib memiliki minimal satu slide."),
});

export type PresentationOutline = z.infer<typeof PresentationOutlineSchema>;

// ==============================================================================
// 4. SHARED STYLE SYSTEM & PRESET CATALOGS
// ==============================================================================

export const GenerationStyleSchema = z.object({
  id: z.string().min(1),
  type: GenerationStyleTypeSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  visualRules: z.array(z.string()).default([]),
  layoutRules: z.array(z.string()).default([]),
  typographyRules: z.array(z.string()).default([]),
  promptModifiers: z.array(z.string()).default([]),
  thingsToAvoid: z.array(z.string()).default([]),
  version: z.number().int().min(1).default(1),
});

export type GenerationStyle = z.infer<typeof GenerationStyleSchema>;

export const SelectedStyleInfoSchema = z.object({
  styleId: z.string().min(1),
  styleVersion: z.number().int().min(1),
  styleName: z.string().min(1),
  type: GenerationStyleTypeSchema,
  selectedAt: z.string(),
});

export type SelectedStyleInfo = z.infer<typeof SelectedStyleInfoSchema>;

/**
 * Canonical Presets for AI Illustration Planning (7 Presets)
 */
export const ILLUSTRATION_STYLES_CATALOG: GenerationStyle[] = [
  {
    id: "style_ill_flat_edu",
    type: "illustration",
    name: "Flat Educational",
    description: "Gaya vektor datar bersih dan modern, sangat mudah dipahami siswa dengan saturasi seimbang.",
    visualRules: ["Garis kontur bersih", "Warna solid harmonis", "Bebas gradien berlebih", "Karakter bersahabat"],
    layoutRules: ["Subjek utama di tengah", "Spasi negatif lapang", "Hierarki elemen visual jelas"],
    typographyRules: ["Label sans-serif tebal jika diperlukan", "Maksimal 3 label teks"],
    promptModifiers: ["clean flat 2D vector educational illustration", "minimalist shapes", "clear silhouette"],
    thingsToAvoid: ["tekstur bising", "bayangan realistis gelap", "elemen visual berdesakan"],
    version: 1,
  },
  {
    id: "style_ill_3d_edu",
    type: "illustration",
    name: "3D Educational",
    description: "Render 3D halus dengan pencahayaan lembut bergaya animasi modern yang menarik minat belajar.",
    visualRules: ["Bentuk 3D rounded lembut", "Pencahayaan difus", "Bahan matte plastisin halus"],
    layoutRules: ["Kedalaman ruang terukur", "Isometrik atau perspektif 3/4"],
    typographyRules: ["Label mengambang dengan kartu latar semi-transparan"],
    promptModifiers: ["cute stylized 3D clay-render", "soft studio lighting", "isometric view"],
    thingsToAvoid: ["fotorealisme menyeramkan", "pencahayaan kontras keras", "tekstur kasar"],
    version: 1,
  },
  {
    id: "style_ill_modern_vector",
    type: "illustration",
    name: "Modern Vector",
    description: "Ilustrasi grafis vektor dinamis kontemporer untuk materi sains, teknologi, dan kejuruan.",
    visualRules: ["Aksen garis geometris presisi", "Palet warna bertema teknologi", "Gradien halus terkontrol"],
    layoutRules: ["Komposisi grid terstruktur", "Penekanan alur proses"],
    typographyRules: ["Monospace atau sans-serif modern"],
    promptModifiers: ["crisp modern vector artwork", "infographic feel", "geometric harmony"],
    thingsToAvoid: ["detail berantakan", "garis sketsa acak"],
    version: 1,
  },
  {
    id: "style_ill_hand_drawn",
    type: "illustration",
    name: "Hand Drawn",
    description: "Gaya sketsa tangan artistik dengan tekstur pensil/cat air lembut untuk materi sejarah, sastra, dan seni.",
    visualRules: ["Garis pensil organik", "Sapuan cat air pastel", "Estetika buku cerita edukatif"],
    layoutRules: ["Komposisi luwes alami", "Sentuhan ilustrasi buku teks klasik"],
    typographyRules: ["Font berkarakter tulisan tangan rapi atau serif hangat"],
    promptModifiers: ["warm hand-drawn storybook illustration", "pencil sketch watercolor wash"],
    thingsToAvoid: ["garis vektor kaku", "warna neon mencolok"],
    version: 1,
  },
  {
    id: "style_ill_realistic",
    type: "illustration",
    name: "Realistic",
    description: "Visual realistis presisi tinggi untuk biologi, anatomi, geografi, dan fenomena alam nyata.",
    visualRules: ["Proporsi anatomi/alam akurat", "Detail permukaan alami", "Pencahayaan natural"],
    layoutRules: ["Fokus makro pada bagian penting", "Latar belakang kontekstual yang mendukung"],
    typographyRules: ["Label penunjuk anatomi garis lurus bersih"],
    promptModifiers: ["accurate realistic natural science illustration", "high pedagogical clarity"],
    thingsToAvoid: ["distorsi karikatur", "fantasi fiktif non-ilmiah"],
    version: 1,
  },
  {
    id: "style_ill_infographic",
    type: "illustration",
    name: "Infographic",
    description: "Ilustrasi terstruktur berorientasi data dan perbandingan konsep untuk mempermudah telaah analitis.",
    visualRules: ["Ikonografi visual konsisten", "Kode warna kategori", "Panah alur kausalitas"],
    layoutRules: ["Komposisi terbagi per kolom/alur bertingkat", "Perbandingan berdampingan"],
    typographyRules: ["Hierarki angka dan judul tegas"],
    promptModifiers: ["instructional infographic diagram", "clear step-by-step visual hierarchy"],
    thingsToAvoid: ["dekorasi tanpa makna", "arah baca membingungkan"],
    version: 1,
  },
  {
    id: "style_ill_tech_diagram",
    type: "illustration",
    name: "Technical Diagram",
    description: "Diagram teknik, skema kelistrikan, topologi jaringan, atau mesin dengan akurasi simbolis standar.",
    visualRules: ["Garis ortogonal rapi", "Simbol teknik standar ISO/IEEE", "Skema terukur"],
    layoutRules: ["Alur kiri-ke-kanan atau atas-ke-bawah", "Pemisahan blok fungsional"],
    typographyRules: ["Teks monospaced teknis jelas terbaca"],
    promptModifiers: ["precise engineering schematic diagram", "blueprint technical illustration"],
    thingsToAvoid: ["elemen artistik hiasan", "garis miring tanpa fungsi"],
    version: 1,
  },
];

/**
 * Canonical Presets for AI Presentation (PPT) Planning (6 Presets)
 */
export const PRESENTATION_STYLES_CATALOG: GenerationStyle[] = [
  {
    id: "style_ppt_modern_minimal",
    type: "presentation",
    name: "Modern Minimal",
    description: "Slide elegan berfokus pada kekuatan tipografi, spasi lapang, dan satu ide kunci per slide.",
    visualRules: ["Latar belakang putih/terang bersih", "Kontras tinggi judul vs isi", "Elemen visual terpusat"],
    layoutRules: ["Spasi margin lebar", "Maksimal 4 baris teks per slide", "Tata letak asimetris seimbang"],
    typographyRules: ["Font Display Sans-Serif modern", "Ukuran judul minimal 32pt"],
    promptModifiers: ["clean minimalist presentation slide", "ample whitespace", "bold editorial layout"],
    thingsToAvoid: ["tumpukan teks berulang", "bullet points berjejal", "clipart generik"],
    version: 1,
  },
  {
    id: "style_ppt_edu_classroom",
    type: "presentation",
    name: "Educational Classroom",
    description: "Desain ramah pembelajaran kelas dengan kartu konsep berwarna lembut dan penanda visual fokus.",
    visualRules: ["Palet warna ramah siswa (biru/hijau/emas)", "Bingkai kartu sudut melengkung"],
    layoutRules: ["Struktur 2 kolom (konsep vs contoh)", "Penomoran langkah yang mencolok"],
    typographyRules: ["Font sans-serif ramah baca dengan keterbacaan proyektor tinggi"],
    promptModifiers: ["interactive educational slide layout", "concept cards", "friendly instructional hierarchy"],
    thingsToAvoid: ["kontras rendah yang sulit terbaca proyektor", "huruf serif terlalu tipis"],
    version: 1,
  },
  {
    id: "style_ppt_corp_pro",
    type: "presentation",
    name: "Corporate Professional",
    description: "Gaya profesional terstruktur untuk materi manajemen, bisnis, kepemimpinan, dan kejuruan industri.",
    visualRules: ["Palet navy profesional dan abu-abu netral", "Garis pembatas tegas"],
    layoutRules: ["Grid korporat 3 kolom", "Header slide formal konsisten"],
    typographyRules: ["Kombinasi font sans-serif korporat tegas"],
    promptModifiers: ["executive corporate presentation", "structured clean data alignment"],
    thingsToAvoid: ["warna-warni pelangi tak teratur", "ikon kekanak-kanakan"],
    version: 1,
  },
  {
    id: "style_ppt_visual_learning",
    type: "presentation",
    name: "Visual Learning",
    description: "Fokus pada gambar/diagram besar di satu sisi dengan ringkasan poin inti di sisi sebelahnya.",
    visualRules: ["Rasio 60:40 (visual besar : penjelasan ringkas)", "Penyorot kata kunci berwarna"],
    layoutRules: ["Pemisahan horizontal atau split-screen vertikal"],
    typographyRules: ["Teks ringkas butir-butir pendek"],
    promptModifiers: ["visual-first slide deck", "split screen diagram and key takeaways"],
    thingsToAvoid: ["paragraf panjang tanpa visual", "visual terlalu kecil"],
    version: 1,
  },
  {
    id: "style_ppt_technical",
    type: "presentation",
    name: "Technical",
    description: "Cocok untuk materi pemrograman, rekayasa, IPA kuantitatif, dan alur prosedur teknis.",
    visualRules: ["Blok kode atau rumus dengan kotak terpisah", "Palet warna terminal/slate"],
    layoutRules: ["Struktur problem-solution atau step-by-step"],
    typographyRules: ["Font monospaced untuk kode/rumus dan sans-serif untuk deskripsi"],
    promptModifiers: ["technical documentation presentation", "code block layout", "formula callout"],
    thingsToAvoid: ["format kode tidak beraturan", "tanda kurung hilang"],
    version: 1,
  },
  {
    id: "style_ppt_academic",
    type: "presentation",
    name: "Academic",
    description: "Format klasik terstruktur untuk penelitian, studi literatur, telaah sejarah, dan seminar.",
    visualRules: ["Gaya akademis rapi dengan catatan sitasi di kaki slide", "Palet netral berwibawa"],
    layoutRules: ["Kolom terstruktur dengan kutipan dan temuan data"],
    typographyRules: ["Font serif elegan pada judul dan sans-serif pada konten"],
    promptModifiers: ["scholarly academic presentation slide", "formal research layout"],
    thingsToAvoid: ["animasi berlebihan", "warna norak"],
    version: 1,
  },
];

export function getStyleById(styleId: string): GenerationStyle | undefined {
  return (
    ILLUSTRATION_STYLES_CATALOG.find((s) => s.id === styleId) ||
    PRESENTATION_STYLES_CATALOG.find((s) => s.id === styleId)
  );
}

// ==============================================================================
// 5. VERSIONING CONTRACT
// ==============================================================================

export const GenerationPlanVersionSchema = z.object({
  id: z.string().min(1),
  planId: z.string().min(1),
  versionNumber: z.number().int().min(1),
  outlineSnapshot: z.union([IllustrationOutlineSchema, PresentationOutlineSchema]),
  styleSnapshot: SelectedStyleInfoSchema.nullable().default(null),
  changeMetadata: z
    .object({
      summary: z.string().optional(),
      changedFields: z.array(z.string()).optional(),
      editedAt: z.string(),
    })
    .default({ editedAt: new Date().toISOString() }),
  isApproved: z.boolean().default(false),
  approvedAt: z.string().nullable().optional(),
  approvedBy: z.string().nullable().optional(),
  createdBy: z.string().min(1),
  createdAt: z.string(),
});

export type GenerationPlanVersion = z.infer<typeof GenerationPlanVersionSchema>;

// ==============================================================================
// 6. GENERATION PLAN CANONICAL DOMAIN MODEL
// ==============================================================================

export const GenerationPlanSchema = z.object({
  id: z.string().min(1),
  ownerId: z.string().min(1),
  moduleId: z.string().min(1),
  targetType: GenerationPlanTargetTypeSchema,
  status: GenerationPlanStatusSchema.default("draft"),
  currentVersion: z.number().int().min(1).default(1),
  approvedVersion: z.number().int().min(1).nullable().default(null),
  outline: z.union([IllustrationOutlineSchema, PresentationOutlineSchema]),
  style: SelectedStyleInfoSchema.nullable().default(null),
  provenance: z
    .object({
      sourceSnapshotIds: z.array(z.string()).default([]),
      evidenceRefs: z.array(z.any()).default([]),
      modulId: z.string(),
      sectionId: z.string().optional(),
    })
    .default({ modulId: "" }),
  generationSettings: z.record(z.any()).default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type GenerationPlan = z.infer<typeof GenerationPlanSchema>;

// ==============================================================================
// 7. GENERATION SPECIFICATION (APPROVED CONSUMABLE CONTRACT)
// ==============================================================================

export const GenerationSpecificationSchema = z.object({
  authorizationId: z.string().min(1),
  generationPlanId: z.string().min(1),
  moduleId: z.string().min(1),
  targetType: GenerationPlanTargetTypeSchema,
  approvedOutlineVersion: z.number().int().min(1),
  approvedOutline: z.union([IllustrationOutlineSchema, PresentationOutlineSchema]),
  styleId: z.string().min(1),
  styleVersion: z.number().int().min(1),
  styleSnapshot: GenerationStyleSchema,
  prompt: z.string().min(1),
  parameters: z.object({
    dimensions: z.object({ width: z.number(), height: z.number() }).optional(),
    aspectRatio: z.string().default("1:1"),
  }),
  sourceReferences: z.array(z.string()).default([]),
  evidenceReferences: z.array(z.string()).default([]),
  generationSettings: z.record(z.any()).default({}),
  createdAt: z.string(),
});

export type GenerationSpecification = z.infer<typeof GenerationSpecificationSchema>;

// ==============================================================================
// 8. DETERMINISTIC VALIDATION & APPROVAL INVARIANTS
// ==============================================================================

export interface PlanAuthContext {
  userId: string;
  role: string;
  isGuru: boolean;
  verificationStatus?: string;
}

/**
 * Validates structural integrity of an Illustration outline.
 */
export function validateIllustrationOutline(data: unknown): IllustrationOutline {
  const result = IllustrationOutlineSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      `Validasi outline ilustrasi gagal: ${issues}`,
    );
  }
  return result.data;
}

/**
 * Validates structural integrity of a Presentation outline.
 */
export function validatePresentationOutline(data: unknown): PresentationOutline {
  const result = PresentationOutlineSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      `Validasi outline presentasi gagal: ${issues}`,
    );
  }

  const outline = result.data;
  // Verify slide order continuity
  const orders = outline.slides.map((s) => s.slideOrder);
  const sorted = [...orders].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] !== i + 1) {
      throw new AiServiceError(
        AI_ERROR_CODES.INVALID_REQUEST,
        `Struktur urutan slide tidak valid: ditemukan celah atau duplikasi nomor slide (${orders.join(", ")}).`,
      );
    }
  }

  return outline;
}

/**
 * Evaluates whether a GenerationPlan is eligible for explicit teacher approval.
 *
 * Enforces:
 * 1. Authenticated teacher role
 * 2. Teacher ownership (`ownerId === context.userId`)
 * 3. Non-archived state
 * 4. Outline structural validity
 * 5. Selected style presence and targetType match
 */
export function validateGenerationPlanApprovalEligibility(
  plan: GenerationPlan,
  context: PlanAuthContext,
): { eligible: boolean; reason?: string } {
  if (!context || !context.userId) {
    return { eligible: false, reason: "Sesi pengguna tidak valid." };
  }
  if (!context.isGuru && context.role !== "guru") {
    return { eligible: false, reason: "Hanya guru yang memiliki izin menyetujui rencana generasi." };
  }
  if (context.verificationStatus && context.verificationStatus !== "verified" && context.verificationStatus !== "terverifikasi") {
    return { eligible: false, reason: "Akun guru belum terverifikasi." };
  }
  if (plan.ownerId !== context.userId) {
    return { eligible: false, reason: "Akses ditolak: Anda bukan pemilik rencana generasi ini." };
  }
  if (plan.status === "archived") {
    return { eligible: false, reason: "Rencana generasi yang telah diarsipkan tidak dapat disetujui." };
  }

  // Style presence check
  if (!plan.style) {
    return { eligible: false, reason: "Gaya visual belum dipilih. Pilih gaya terlebih dahulu sebelum menyetujui rencana." };
  }
  if (plan.style.type !== plan.targetType) {
    return { eligible: false, reason: `Tipe gaya '${plan.style.type}' tidak cocok dengan target rencana '${plan.targetType}'.` };
  }

  const styleDef = getStyleById(plan.style.styleId);
  if (!styleDef) {
    return { eligible: false, reason: `Definisi gaya '${plan.style.styleId}' tidak ditemukan dalam katalog.` };
  }

  // Outline validation check
  try {
    if (plan.targetType === "illustration") {
      validateIllustrationOutline(plan.outline);
    } else if (plan.targetType === "presentation") {
      validatePresentationOutline(plan.outline);
    } else {
      return { eligible: false, reason: `Target generasi tidak valid: ${plan.targetType}` };
    }
  } catch (err: any) {
    return { eligible: false, reason: err.message || "Struktur outline tidak valid." };
  }

  return { eligible: true };
}

/**
 * Creates the canonical GenerationSpecification strictly from an approved, current GenerationPlan.
 *
 * Invariant: Rejects if plan is not approved, or if approvedVersion !== currentVersion (stale approval).
 */
export function createGenerationSpecification(
  plan: GenerationPlan,
  context: PlanAuthContext,
): GenerationSpecification {
  const eligibility = validateGenerationPlanApprovalEligibility(plan, context);
  if (!eligibility.eligible) {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      `Tidak dapat membuat spesifikasi generasi: ${eligibility.reason}`,
    );
  }

  if (plan.status !== "approved") {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      "Rencana generasi harus disetujui secara eksplisit oleh guru sebelum spesifikasi generasi dapat dibuat.",
    );
  }

  if (plan.approvedVersion === null || plan.approvedVersion !== plan.currentVersion) {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      `Persetujuan kedaluwarsa: Versi yang disetujui (v${plan.approvedVersion ?? "tidak ada"}) tidak cocok dengan versi aktif (v${plan.currentVersion}). Tinjau dan setujui ulang rencana sebelum melakukan generasi.`,
    );
  }

  const styleDef = getStyleById(plan.style!.styleId);
  if (!styleDef) {
    throw new AiServiceError(
      AI_ERROR_CODES.INVALID_REQUEST,
      `Definisi gaya '${plan.style!.styleId}' tidak ditemukan.`,
    );
  }

  const outline = plan.outline as any;
  const sourceRefs = Array.isArray(outline.sourceReferences) ? outline.sourceReferences : [];
  const evidenceRefs = Array.isArray(outline.evidenceReferences) ? outline.evidenceReferences : [];

  let prompt = "";
  let parameters: { dimensions?: { width: number; height: number }; aspectRatio: string } = {
    aspectRatio: "1:1",
  };

  if (plan.targetType === "illustration") {
    const ill = outline as IllustrationOutline;
    prompt = [
      ill.title,
      `Subjek utama: ${ill.mainSubject}`,
      `Latar belakang: ${ill.environmentBackground}`,
      `Komposisi: ${ill.composition}`,
      `Sudut pandang: ${ill.perspectiveView}`,
      `Fokus edukatif: ${ill.educationalFocus}`,
      styleDef.promptModifiers.join(", "),
      ill.thingsToAvoid && ill.thingsToAvoid.length > 0 ? `Hindari: ${ill.thingsToAvoid.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join(". ");

    parameters = {
      dimensions: { width: 1024, height: 1024 },
      aspectRatio: "1:1",
    };
  } else {
    const ppt = outline as PresentationOutline;
    prompt = [
      ppt.title,
      `Tujuan: ${ppt.objective}`,
      `Target: ${ppt.targetAudience}`,
      `Arah visual: ${ppt.globalVisualDirection}`,
      styleDef.promptModifiers.join(", "),
    ]
      .filter(Boolean)
      .join(". ");

    parameters = {
      aspectRatio: "16:9",
    };
  }

  const authId = `auth_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  return {
    authorizationId: authId,
    generationPlanId: plan.id,
    moduleId: plan.moduleId,
    targetType: plan.targetType,
    approvedOutlineVersion: plan.approvedVersion,
    approvedOutline: plan.outline,
    styleId: plan.style!.styleId,
    styleVersion: plan.style!.styleVersion,
    styleSnapshot: styleDef,
    prompt,
    parameters,
    sourceReferences: sourceRefs,
    evidenceReferences: evidenceRefs,
    generationSettings: plan.generationSettings || {},
    createdAt: new Date().toISOString(),
  };
}
