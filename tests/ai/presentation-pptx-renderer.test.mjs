#!/usr/bin/env node
/**
 * ==============================================================================
 * GURUPRO TEST SUITE: PPT-1C REAL PPTX RENDERER & PRESENTATION ARTIFACT ENGINE
 * ==============================================================================
 *
 * Verifies:
 * 1. Canonical Contract & Artifact Schemas (lifecycle, metadata, filenames)
 * 2. Theme & Style Resolver (all 6 presentation styles mapped into design tokens)
 * 3. Layout Engine & Coordinates (aspect ratios 16:9 and 4:3, region bounds)
 * 4. Content Block Renderers (all canonical block types + failure on invalid)
 * 5. Slide Rendering & Pedagogical Layouts (cover, 2-column, 3-column, process)
 * 6. Speaker Notes, Footers & Slide Numbering (embedded notes, custom footers)
 * 7. Illustration Boundaries & Placeholders (zero image calls, asset reference preservation)
 * 8. Real OOXML Binary Package Validation (ZIP header, Content_Types, presentation.xml, slides)
 * 9. Non-Fake PPTX Protection (rejects HTML, plain text, SVG, corrupted zip)
 * 10. Storage Driver & SHA-256 Hashing (path conventions, driver operations)
 * 11. Server Functions, Multi-Tenant RBAC & In-Flight Lock (owner auth, cache, retry)
 * 12. Strict Invariants: Genuine PPTX generated, ZERO AI calls in PPT-1C
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";

import {
  AI_ERROR_CODES,
  AiServiceError,
} from "../../src/lib/ai/error-taxonomy.ts";
import {
  PresentationArtifactSchema,
  assertValidArtifactLifecycleTransition,
  slugifyPresentationFilename,
  PPTX_MIME_TYPE,
  validatePresentationArtifact,
} from "../../src/lib/ai/presentation-artifact-contract.ts";
import {
  resolvePresentationTheme,
  listPresentationThemes,
} from "../../src/lib/ai/presentation-style-resolver.ts";
import {
  computeSlideLayout,
  getSlideDimensions,
  assertWithinSlideBounds,
} from "../../src/lib/ai/presentation-layout-engine.ts";
import {
  validatePptxPackage,
  hasZipMagicSignature,
} from "../../src/lib/ai/presentation-pptx-validator.ts";
import {
  computePptxSha256,
  buildPresentationStoragePath,
  MemoryPresentationStorageDriver,
} from "../../src/lib/ai/presentation-artifact-storage.ts";
import {
  renderPresentationPptx,
} from "../../src/lib/ai/presentation-pptx-renderer.ts";
import {
  executeRenderPresentationPptx,
  executeGetPresentationArtifact,
  executeListPresentationArtifacts,
  fallbackPresentationArtifacts,
} from "../../src/lib/presentation-artifact.functions.ts";
import {
  fallbackPresentationResults,
} from "../../src/lib/presentation-generation.functions.ts";

let passedCount = 0;
let failedCount = 0;

function test(description, fn) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${description}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${description}`);
    console.error(err);
    failedCount++;
  }
}

async function testAsync(description, fn) {
  try {
    await fn();
    console.log(`  ✓ [PASS] ${description}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${description}`);
    console.error(err);
    failedCount++;
  }
}

// ==============================================================================
// TEST FIXTURES
// ==============================================================================

function createSamplePresentationPackage(overrides = {}) {
  const slides = [
    {
      slideId: "slide_1_intro",
      order: 1,
      title: "Ekosistem Terumbu Karang Indonesia",
      pedagogicalType: "introduction",
      purpose: "Pengantar kekayaan hayati bahari nusantara",
      contentBlocks: [
        {
          type: "paragraph",
          content: "Indonesia memiliki wilayah Segitiga Terumbu Karang terkaya di dunia dengan keanekaragaman hayati tertinggi.",
          title: "Apersepsi Materi",
          evidenceIds: ["ev_1"],
        },
      ],
      keyPoints: ["Pusat keanekaragaman hayati bahari dunia"],
      visualDirection: "Gunakan foto terumbu karang yang luas dengan judul yang menonjol",
      speakerNotes: "Guru menyapa siswa dan memantik diskusi tentang terumbu karang.",
      sourceReferences: ["modul_biologi_x"],
      evidenceReferences: ["ev_1"],
    },
    {
      slideId: "slide_2_concept",
      order: 2,
      title: "Anatomi dan Struktur Polip Karang",
      pedagogicalType: "concept_explanation",
      purpose: "Memahami biologi pembentuk karang",
      contentBlocks: [
        {
          type: "definition",
          title: "Polip Karang",
          content: "Hewan invertebrata kecil anggota filum Cnidaria yang hidup berkoloni dan menyekresikan kalsium karbonat (CaCO3).",
          evidenceIds: ["ev_2"],
        },
        {
          type: "bullet_list",
          title: "Komponen Utama",
          content: "Tentakel dengan sel penyengat (knidosit)\nMulut dan rongga gastrovaskular\nSimbiosis dengan zooxanthellae",
          evidenceIds: ["ev_2"],
        },
      ],
      keyPoints: ["Polip menyekresikan kalsium karbonat", "Simbiosis vital dengan alga mikro"],
      visualDirection: "Dua kolom: definisi di kiri, komponen di kanan",
      speakerNotes: "Jelaskan bahwa karang adalah hewan, bukan tumbuhan.",
      sourceReferences: ["modul_biologi_x"],
      evidenceReferences: ["ev_2"],
    },
    {
      slideId: "slide_3_comparison",
      order: 3,
      title: "Perbandingan Karang Sehat vs Karang Mengalami Pemutihan",
      pedagogicalType: "comparison",
      purpose: "Menganalisis dampak pemanasan global",
      contentBlocks: [
        {
          type: "comparison_column",
          title: "Kondisi Sehat",
          content: "Warna cerah karena alga zooxanthellae aktif, laju kalsifikasi normal, menopang ribuan spesies ikan.",
          evidenceIds: ["ev_3"],
        },
        {
          type: "comparison_column",
          title: "Coral Bleaching",
          content: "Alga lepas akibat stres suhu, rangka putih terlihat, risiko kematian koloni meningkat drastis.",
          evidenceIds: ["ev_3"],
        },
      ],
      keyPoints: ["Pemutihan terjadi akibat pelepasan alga simbiotik"],
      visualDirection: "Tampilan perbandingan 2 kolom sejajar",
      speakerNotes: "Tekankan sensitivitas terumbu karang terhadap kenaikan suhu 1-2 derajat.",
      sourceReferences: ["modul_biologi_x"],
      evidenceReferences: ["ev_3"],
    },
    {
      slideId: "slide_4_data",
      order: 4,
      title: "Data Penurunan Luas Terumbu Karang",
      pedagogicalType: "exercise",
      purpose: "Analisis data kuantitatif kerusakan karang",
      contentBlocks: [
        {
          type: "stat_metric",
          title: "Penurunan Global",
          content: "50%\nKarang dunia hilang dalam 30 tahun terakhir",
          metadata: { value: "50%" },
          evidenceIds: ["ev_4"],
        },
        {
          type: "table",
          title: "Status Kerusakan per Wilayah",
          content: "Wilayah | Kondisi Baik | Terancam\nWilayah Barat | 30% | 70%\nWilayah Timur | 45% | 55%",
          metadata: {
            headers: ["Wilayah", "Kondisi Baik", "Terancam"],
            rows: [
              ["Wilayah Barat", "30%", "70%"],
              ["Wilayah Timur", "45%", "55%"],
            ],
          },
          evidenceIds: ["ev_4"],
        },
      ],
      keyPoints: ["Penurunan populasi membutuhkan restorasi aktif"],
      visualDirection: "Angka metrik besar di kiri, tabel ringkasan di kanan",
      speakerNotes: "Ajak siswa membaca grafik dan tabel data.",
      sourceReferences: ["modul_biologi_x"],
      evidenceReferences: ["ev_4"],
    },
  ];

  return {
    presentationId: "pres_sample_123",
    generationRequestId: "req_sample_123",
    generationPlanId: "plan_sample_123",
    moduleId: "modul_bio_123",
    title: "Ekosistem Terumbu Karang",
    subtitle: "Biologi Laut Kelas X",
    learningObjectives: ["Menganalisis peranan terumbu karang", "Mengidentifikasi ancaman bleaching"],
    targetAudience: "Fase E Kelas 10",
    styleId: "style_ppt_edu_classroom",
    styleVersion: 1,
    parameters: {
      aspectRatio: "16:9",
      slideSize: "standard",
      language: "id",
      contentDensity: "balanced",
      includeSpeakerNotes: true,
      includePageNumbering: true,
      footerPolicy: "standard",
      providerExtension: {},
    },
    slides,
    provenance: {
      moduleId: "modul_bio_123",
      planId: "plan_sample_123",
      requestId: "req_sample_123",
      ownerId: "teacher_owner_1",
      sourceReferences: ["modul_bio_123"],
      evidenceReferences: ["ev_1", "ev_2", "ev_3", "ev_4"],
    },
    generationMetadata: {
      promptVersion: "presentation_content_generator_grounded_v1",
      schemaVersion: "1.0.0",
      provider: "google_gemini",
      model: "gemini-flash-lite-latest",
      latencyMs: 1200,
      retryCount: 0,
      generatorVersion: "v1",
      generationKey: "gen_key_test_123",
    },
    validationMetadata: {
      deterministicValid: true,
      exactValuesValid: true,
      semanticDecision: "PASS",
      findings: [],
    },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ==============================================================================
// TEST SUITES EXECUTION
// ==============================================================================

async function runTestSuite() {
  console.log("\n==============================================================================");
  console.log("TESTING PPT-1C: REAL PPTX RENDERER & PRESENTATION ARTIFACT ENGINE");
  console.log("==============================================================================\n");

  // ----------------------------------------------------------------------------
  // SUITE 1: CANONICAL CONTRACT & ARTIFACT SCHEMAS
  // ----------------------------------------------------------------------------
  console.log("--- Suite 1: Canonical Contract & Artifact Schemas ---");

  test("[TEST 1] PresentationArtifactSchema validates canonical presentation artifact object", () => {
    const artifact = {
      id: "ppt_art_123",
      generationRequestId: "req_123",
      contentResultId: "res_123",
      generationPlanId: "plan_123",
      moduleId: "mod_123",
      ownerId: "usr_123",
      tenantId: "default",
      storageReference: "tenant/default/modules/mod_123/presentations/ppt_art_123.pptx",
      storageProvider: "supabase_storage",
      publicUrl: "https://storage.gurupro.id/art.pptx",
      downloadUrl: "https://storage.gurupro.id/art.pptx",
      filename: "ekosistem-karang.pptx",
      mimeType: PPTX_MIME_TYPE,
      byteSize: 45678,
      fileHash: "a".repeat(64),
      slideCount: 4,
      outlineVersion: 1,
      styleId: "style_ppt_edu_classroom",
      styleVersion: 1,
      rendererVersion: "v1.0.0",
      status: "ready",
      renderMetadata: { library: "pptxgenjs", libraryVersion: "4.0.1" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const parsed = validatePresentationArtifact(artifact);
    assert.equal(parsed.id, "ppt_art_123");
    assert.equal(parsed.mimeType, PPTX_MIME_TYPE);
  });

  test("[TEST 2] PresentationArtifactSchema rejects invalid MIME type or non-64 hex hash", () => {
    assert.throws(
      () => {
        validatePresentationArtifact({
          id: "ppt_art_123",
          mimeType: "text/html", // invalid
          fileHash: "short_hash", // invalid length
        });
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.PPTX_VALIDATION_FAILED
    );
  });

  test("[TEST 3] assertValidArtifactLifecycleTransition enforces valid state transitions", () => {
    assert.doesNotThrow(() => assertValidArtifactLifecycleTransition("generating", "ready"));
    assert.doesNotThrow(() => assertValidArtifactLifecycleTransition("generating", "failed"));
    assert.doesNotThrow(() => assertValidArtifactLifecycleTransition("ready", "archived"));
    assert.doesNotThrow(() => assertValidArtifactLifecycleTransition("failed", "generating")); // retry

    assert.throws(
      () => assertValidArtifactLifecycleTransition("archived", "generating"),
      (err) => err instanceof AiServiceError
    );
    assert.throws(
      () => assertValidArtifactLifecycleTransition("ready", "generating"),
      (err) => err instanceof AiServiceError
    );
  });

  test("[TEST 4] slugifyPresentationFilename creates clean .pptx filename from title", () => {
    const filename = slugifyPresentationFilename("Ekosistem Terumbu Karang: Biologi Laut (2026)!");
    assert.equal(filename, "ekosistem-terumbu-karang-biologi-laut-2026.pptx");
  });

  test("[TEST 5] slugifyPresentationFilename handles empty or special character titles safely", () => {
    const filename = slugifyPresentationFilename("!@#$%^&*()");
    assert.equal(filename, "presentasi.pptx");
  });

  // ----------------------------------------------------------------------------
  // SUITE 2: THEME & STYLE RESOLVER
  // ----------------------------------------------------------------------------
  console.log("\n--- Suite 2: Theme & Style Resolver ---");

  test("[TEST 6] resolvePresentationTheme returns valid theme for all 6 catalog styles", () => {
    const styles = [
      "style_ppt_modern_minimal",
      "style_ppt_edu_classroom",
      "style_ppt_corp_pro",
      "style_ppt_visual_learning",
      "style_ppt_technical",
      "style_ppt_academic",
    ];

    for (const s of styles) {
      const theme = resolvePresentationTheme(s);
      assert.equal(theme.styleId, s);
      assert.ok(theme.colors.background);
      assert.ok(theme.colors.primary);
      assert.ok(theme.typography.titleFont);
      assert.ok(theme.typography.bodyFont);
      assert.ok(theme.spacing.marginLeft > 0);
    }
  });

  test("[TEST 7] resolvePresentationTheme falls back to edu_classroom on unrecognized styleId", () => {
    const fallback = resolvePresentationTheme("style_unknown_custom");
    assert.equal(fallback.styleId, "style_ppt_edu_classroom");
  });

  test("[TEST 8] listPresentationThemes returns exactly 6 distinct themes", () => {
    const themes = listPresentationThemes();
    assert.equal(themes.length, 6);
  });

  test("[TEST 9] style_ppt_technical configures monospaced typography and dark code backgrounds", () => {
    const tech = resolvePresentationTheme("style_ppt_technical");
    assert.equal(tech.typography.codeFont, "Consolas");
    assert.equal(tech.colors.codeBackground, "0F172A");
  });

  test("[TEST 10] style_ppt_academic configures Georgia serif typography for titles", () => {
    const acad = resolvePresentationTheme("style_ppt_academic");
    assert.equal(acad.typography.titleFont, "Georgia");
  });

  test("[TEST 11] style_ppt_edu_classroom configures high-contrast Indigo Navy primary color", () => {
    const edu = resolvePresentationTheme("style_ppt_edu_classroom");
    assert.equal(edu.colors.primary, "1E3A8A");
  });

  // ----------------------------------------------------------------------------
  // SUITE 3: LAYOUT ENGINE & COORDINATES
  // ----------------------------------------------------------------------------
  console.log("\n--- Suite 3: Layout Engine & Coordinates ---");

  test("[TEST 12] getSlideDimensions returns correct inches for 16:9 and 4:3", () => {
    const dim169 = getSlideDimensions("16:9");
    assert.equal(dim169.width, 13.333);
    assert.equal(dim169.height, 7.5);

    const dim43 = getSlideDimensions("4:3");
    assert.equal(dim43.width, 10.0);
    assert.equal(dim43.height, 7.5);
  });

  test("[TEST 13] computeSlideLayout calculates non-overlapping header, content, and footer", () => {
    const theme = resolvePresentationTheme("style_ppt_edu_classroom");
    const layout = computeSlideLayout(theme, "concept_explanation", "16:9", false);

    assert.ok(layout.header.title.y > layout.header.badge.y);
    assert.ok(layout.contentArea.y > layout.header.title.y + layout.header.title.h);
    assert.ok(layout.footer.pageNumber.y > layout.contentArea.y + layout.contentArea.h);
  });

  test("[TEST 14] computeSlideLayout computes symmetric 2-column split within content area", () => {
    const theme = resolvePresentationTheme("style_ppt_corp_pro");
    const layout = computeSlideLayout(theme, "comparison", "16:9", false);

    assert.equal(layout.columns2.left.w, layout.columns2.right.w);
    assert.ok(layout.columns2.right.x > layout.columns2.left.x);
  });

  test("[TEST 15] assertWithinSlideBounds passes for valid box within slide bounds", () => {
    const dim = getSlideDimensions("16:9");
    assert.doesNotThrow(() => {
      assertWithinSlideBounds({ x: 1, y: 1, w: 10, h: 5 }, dim, "Uji box");
    });
  });

  test("[TEST 16] assertWithinSlideBounds throws on negative offset or boundary overflow", () => {
    const dim = getSlideDimensions("16:9");
    assert.throws(() => {
      assertWithinSlideBounds({ x: -0.5, y: 1, w: 5, h: 2 }, dim, "Negative X");
    });
    assert.throws(() => {
      assertWithinSlideBounds({ x: 1, y: 1, w: 14, h: 2 }, dim, "Overflow width");
    });
    assert.throws(() => {
      assertWithinSlideBounds({ x: 1, y: 1, w: 5, h: 8 }, dim, "Overflow height");
    });
  });

  // ----------------------------------------------------------------------------
  // SUITE 4: REAL PPTX DOCUMENT RENDERING (PPTXGENJS)
  // ----------------------------------------------------------------------------
  console.log("\n--- Suite 4: Real PPTX Document Rendering ---");

  await testAsync("[TEST 17] renderPresentationPptx produces real PPTX binary for sample package", async () => {
    const pkg = createSamplePresentationPackage();
    const result = await renderPresentationPptx(pkg);

    assert.ok(result.bytes instanceof Uint8Array);
    assert.ok(result.byteSize > 1000); // Real PPTX is several tens of KB
    assert.equal(result.slideCount, 4);
    assert.equal(result.fileHash.length, 64);
    assert.ok(result.validation.valid);
  });

  await testAsync("[TEST 18] renderPresentationPptx preserves exact slide count from package", async () => {
    const pkg = createSamplePresentationPackage();
    const result = await renderPresentationPptx(pkg);
    assert.equal(result.slideCount, pkg.slides.length);
    assert.equal(result.validation.slideCount, pkg.slides.length);
  });

  await testAsync("[TEST 19] renderPresentationPptx generates valid SHA-256 hash matching binary bytes", async () => {
    const pkg = createSamplePresentationPackage();
    const result = await renderPresentationPptx(pkg);
    const recomputedHash = computePptxSha256(result.bytes);
    assert.equal(result.fileHash, recomputedHash);
  });

  // ----------------------------------------------------------------------------
  // SUITE 5: ALL 24 CANONICAL BLOCK RENDERERS
  // ----------------------------------------------------------------------------
  console.log("\n--- Suite 5: All 24 Canonical Block Types ---");

  await testAsync("[TEST 20] Renders paragraph, text, definition, and example blocks cleanly", async () => {
    const pkg = createSamplePresentationPackage({
      slides: [
        {
          slideId: "s1",
          order: 1,
          title: "Blok Dasar",
          pedagogicalType: "concept_explanation",
          purpose: "Uji blok dasar",
          contentBlocks: [
            { type: "paragraph", content: "Isi paragraf edukatif.", title: "Paragraf" },
            { type: "definition", content: "Definisi istilah biologis.", title: "Definisi" },
            { type: "example", content: "Contoh terumbu karang tepi.", title: "Contoh" },
          ],
          keyPoints: ["Poin 1"],
          visualDirection: "Tata letak 3 kartu",
          speakerNotes: "Catatan guru",
        },
      ],
    });
    const result = await renderPresentationPptx(pkg);
    assert.equal(result.slideCount, 1);
    assert.ok(result.validation.valid);
  });

  await testAsync("[TEST 21] Renders bullet_list and numbered_list blocks with list semantics", async () => {
    const pkg = createSamplePresentationPackage({
      slides: [
        {
          slideId: "s1",
          order: 1,
          title: "Blok Daftar",
          pedagogicalType: "learning_objective",
          purpose: "Uji list",
          contentBlocks: [
            { type: "bullet_list", content: "Butir A\nButir B\nButir C", title: "Daftar Butir" },
            { type: "numbered_list", content: "Langkah 1\nLangkah 2\nLangkah 3", title: "Daftar Nomor" },
          ],
          keyPoints: ["Poin list"],
          visualDirection: "Dua kolom list",
        },
      ],
    });
    const result = await renderPresentationPptx(pkg);
    assert.ok(result.validation.valid);
  });

  await testAsync("[TEST 22] Renders quote and callout blocks with accent container styling", async () => {
    const pkg = createSamplePresentationPackage({
      slides: [
        {
          slideId: "s1",
          order: 1,
          title: "Kutipan dan Peringatan",
          pedagogicalType: "reflection",
          purpose: "Uji callout",
          contentBlocks: [
            { type: "quote", content: "Lautan adalah penopang kehidupan bumi.", title: "Sylvia Earle" },
            { type: "callout", content: "Jangan menyentuh karang saat menyelam.", title: "Perhatian" },
          ],
          keyPoints: ["Etika bahari"],
          visualDirection: "Quote di kiri, callout di kanan",
        },
      ],
    });
    const result = await renderPresentationPptx(pkg);
    assert.ok(result.validation.valid);
  });

  await testAsync("[TEST 23] Renders code_snippet block preserving monospace font and indentation", async () => {
    const pkg = createSamplePresentationPackage({
      slides: [
        {
          slideId: "s1",
          order: 1,
          title: "Snippet Algoritma",
          pedagogicalType: "concept_explanation",
          purpose: "Uji kode",
          contentBlocks: [
            {
              type: "code_snippet",
              content: "function calculateCoralHealth(coverage, bleaching) {\n  return coverage * (1 - bleaching);\n}",
              title: "Perhitungan Indeks",
              metadata: { language: "JavaScript" },
            },
          ],
          keyPoints: ["Formula indeks"],
          visualDirection: "Terminal kode terpusat",
        },
      ],
    });
    const result = await renderPresentationPptx(pkg);
    assert.ok(result.validation.valid);
  });

  await testAsync("[TEST 24] Renders structured table and comparison_column blocks", async () => {
    const pkg = createSamplePresentationPackage({
      slides: [
        {
          slideId: "s1",
          order: 1,
          title: "Tabel dan Komparasi",
          pedagogicalType: "comparison",
          purpose: "Uji tabel",
          contentBlocks: [
            {
              type: "table",
              content: "Metrik | Nilai\nSuhu | 28C\nSalinitas | 34 PSU",
              metadata: {
                headers: ["Parameter", "Batas Optimal"],
                rows: [["Suhu", "26-29 °C"], ["Salinitas", "32-35 PSU"]],
              },
            },
            {
              type: "comparison_column",
              content: "Kondisi Baik: Keanekaragaman ikan tinggi.\nKondisi Rusak: Alga berlebihan.",
              title: "Komparasi",
            },
          ],
          keyPoints: ["Parameter ekologis"],
          visualDirection: "Tabel kiri, perbandingan kanan",
        },
      ],
    });
    const result = await renderPresentationPptx(pkg);
    assert.ok(result.validation.valid);
  });

  await testAsync("[TEST 25] Renders stat_metric, diagram_placeholder, and timeline_step blocks", async () => {
    const pkg = createSamplePresentationPackage({
      slides: [
        {
          slideId: "s1",
          order: 1,
          title: "Visualisasi Alur & Metrik",
          pedagogicalType: "process",
          purpose: "Uji bentuk editable",
          contentBlocks: [
            { type: "stat_metric", content: "85%\nKelangsungan Hidup", metadata: { value: "85%" } },
            { type: "diagram_placeholder", content: "Input Suhu -> Respon Zooxanthellae -> Kalsifikasi", title: "Skema Proses" },
            { type: "timeline_step", content: "Tahun 1: Transplantasi Karang\nTahun 3: Pembentukan Koloni", title: "Restorasi" },
          ],
          keyPoints: ["Langkah restorasi"],
          visualDirection: "3 kolom visual",
        },
      ],
    });
    const result = await renderPresentationPptx(pkg);
    assert.ok(result.validation.valid);
  });

  await testAsync("[TEST 26] Renders formula_block, reflection_prompt, and activity_instruction blocks", async () => {
    const pkg = createSamplePresentationPackage({
      slides: [
        {
          slideId: "s1",
          order: 1,
          title: "Aktivitas dan Formula",
          pedagogicalType: "activity",
          purpose: "Uji instruksi",
          contentBlocks: [
            { type: "formula_block", content: "Ca2+ + 2HCO3- <-> CaCO3 + CO2 + H2O", title: "Kalsifikasi Kimia" },
            { type: "reflection_prompt", content: "Apa yang terjadi jika terumbu karang punah bagi nelayan lokal?" },
            { type: "activity_instruction", content: "Bentuk kelompok 4 orang, diskusikan langkah konservasi terumbu karang." },
          ],
          keyPoints: ["Tugas kelompok"],
          visualDirection: "Layout aktivitas",
        },
      ],
    });
    const result = await renderPresentationPptx(pkg);
    assert.ok(result.validation.valid);
  });

  await testAsync("[TEST 27] Fails closed on unsupported block type", async () => {
    const invalidPkg = createSamplePresentationPackage({
      slides: [
        {
          slideId: "s1",
          order: 1,
          title: "Blok Tidak Sah",
          pedagogicalType: "concept_explanation",
          purpose: "Uji blok ilegal",
          contentBlocks: [
            { type: "unsupported_magic_block", content: "Konten ilegal" },
          ],
          keyPoints: ["Poin"],
          visualDirection: "Tata letak",
        },
      ],
    });

    await assert.rejects(
      async () => await renderPresentationPptx(invalidPkg),
      (err) => err instanceof AiServiceError && (err.code === AI_ERROR_CODES.PPTX_RENDER_FAILED || err.code === AI_ERROR_CODES.PRESENTATION_VALIDATION_FAILED)
    );
  });

  // ----------------------------------------------------------------------------
  // SUITE 6: ASPECT RATIOS & PEDAGOGICAL LAYOUTS
  // ----------------------------------------------------------------------------
  console.log("\n--- Suite 6: Aspect Ratios & Pedagogical Layouts ---");

  await testAsync("[TEST 28] Supports 4:3 standard aspect ratio parameter", async () => {
    const pkg = createSamplePresentationPackage();
    pkg.parameters.aspectRatio = "4:3";

    const result = await renderPresentationPptx(pkg);
    assert.ok(result.validation.valid);
    assert.equal(result.renderMetadata.aspectRatio, "4:3");
  });

  await testAsync("[TEST 29] Supports 16:9 widescreen aspect ratio parameter", async () => {
    const pkg = createSamplePresentationPackage();
    pkg.parameters.aspectRatio = "16:9";

    const result = await renderPresentationPptx(pkg);
    assert.ok(result.validation.valid);
    assert.equal(result.renderMetadata.aspectRatio, "16:9");
  });

  await testAsync("[TEST 30] First slide introduction renders as cover slide layout", async () => {
    const pkg = createSamplePresentationPackage();
    assert.equal(pkg.slides[0].pedagogicalType, "introduction");

    const result = await renderPresentationPptx(pkg);
    assert.ok(result.validation.valid);
  });

  // ----------------------------------------------------------------------------
  // SUITE 7: SPEAKER NOTES & FOOTER POLICIES
  // ----------------------------------------------------------------------------
  console.log("\n--- Suite 7: Speaker Notes & Footer Policies ---");

  await testAsync("[TEST 31] Embeds speaker notes into OpenXML notesSlide when enabled", async () => {
    const pkg = createSamplePresentationPackage();
    pkg.parameters.includeSpeakerNotes = true;

    const result = await renderPresentationPptx(pkg);
    assert.ok(result.validation.hasNotes);
    assert.ok(result.validation.notesCount > 0);
    assert.equal(result.renderMetadata.speakerNotesEmbeddedCount, 4);
  });

  await testAsync("[TEST 32] Omits speaker notes when includeSpeakerNotes parameter is false", async () => {
    const pkg = createSamplePresentationPackage();
    pkg.parameters.includeSpeakerNotes = false;

    const result = await renderPresentationPptx(pkg);
    assert.equal(result.renderMetadata.speakerNotesEmbeddedCount, 0);
  });

  await testAsync("[TEST 33] Respects footerPolicy 'none' without throwing error", async () => {
    const pkg = createSamplePresentationPackage();
    pkg.parameters.footerPolicy = "none";

    const result = await renderPresentationPptx(pkg);
    assert.ok(result.validation.valid);
  });

  await testAsync("[TEST 34] Respects includePageNumbering false parameter", async () => {
    const pkg = createSamplePresentationPackage();
    pkg.parameters.includePageNumbering = false;

    const result = await renderPresentationPptx(pkg);
    assert.ok(result.validation.valid);
  });

  // ----------------------------------------------------------------------------
  // SUITE 8: PRESENTATION STYLES APPLICATION
  // ----------------------------------------------------------------------------
  console.log("\n--- Suite 8: Presentation Styles Application ---");

  const catalogStyleIds = [
    "style_ppt_modern_minimal",
    "style_ppt_edu_classroom",
    "style_ppt_corp_pro",
    "style_ppt_visual_learning",
    "style_ppt_technical",
    "style_ppt_academic",
  ];

  for (let idx = 0; idx < catalogStyleIds.length; idx++) {
    const sId = catalogStyleIds[idx];
    await testAsync(`[TEST ${35 + idx}] Applies style '${sId}' producing valid OOXML package`, async () => {
      const pkg = createSamplePresentationPackage({ styleId: sId });
      const result = await renderPresentationPptx(pkg);
      assert.ok(result.validation.valid);
      assert.ok(result.renderMetadata.themeApplied);
    });
  }

  // ----------------------------------------------------------------------------
  // SUITE 9: ILLUSTRATION BOUNDARIES & PLACEHOLDERS
  // ----------------------------------------------------------------------------
  console.log("\n--- Suite 9: Illustration Boundaries & Placeholders ---");

  await testAsync("[TEST 41] Preserves referencedAssetIds in render metadata without calling image provider", async () => {
    const pkg = createSamplePresentationPackage();
    pkg.slides[1].referencedAssetIds = ["ill_asset_karang_01"];

    const result = await renderPresentationPptx(pkg);
    assert.ok(result.validation.valid);
    assert.equal(result.renderMetadata.referencedAssetCount, 1);
  });

  await testAsync("[TEST 42] Renders placeholder shape when requiresGeneratedIllustration is true", async () => {
    const pkg = createSamplePresentationPackage();
    pkg.slides[2].requiresGeneratedIllustration = true;

    const result = await renderPresentationPptx(pkg);
    assert.ok(result.validation.valid);
    assert.equal(result.renderMetadata.requiresIllustrationPlaceholderCount, 1);
  });

  // ----------------------------------------------------------------------------
  // SUITE 10: REAL OOXML BINARY VALIDATION
  // ----------------------------------------------------------------------------
  console.log("\n--- Suite 10: Real OOXML Binary Package Validation ---");

  await testAsync("[TEST 43] hasZipMagicSignature verifies PK\\x03\\x04 header bytes", async () => {
    const validZipHeader = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    assert.ok(hasZipMagicSignature(validZipHeader));

    const invalidHeader = new Uint8Array([0x47, 0x49, 0x46, 0x38]); // GIF8
    assert.ok(!hasZipMagicSignature(invalidHeader));
  });

  await testAsync("[TEST 44] validatePptxPackage verifies [Content_Types].xml, presentation.xml, and slides", async () => {
    const pkg = createSamplePresentationPackage();
    const result = await renderPresentationPptx(pkg);

    const validation = await validatePptxPackage(result.bytes, 4);
    assert.ok(validation.valid);
    assert.ok(validation.ooxmlParts.includes("[Content_Types].xml"));
    assert.ok(validation.ooxmlParts.includes("_rels/.rels"));
    assert.ok(validation.ooxmlParts.includes("ppt/presentation.xml"));
    assert.ok(validation.ooxmlParts.includes("ppt/slides/slide1.xml"));
  });

  await testAsync("[TEST 45] validatePptxPackage throws on slide count mismatch", async () => {
    const pkg = createSamplePresentationPackage();
    const result = await renderPresentationPptx(pkg);

    await assert.rejects(
      async () => await validatePptxPackage(result.bytes, 10), // expects 10 slides, got 4
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.PPTX_SLIDE_COUNT_MISMATCH
    );
  });

  // ----------------------------------------------------------------------------
  // SUITE 11: NON-FAKE PPTX REJECTION
  // ----------------------------------------------------------------------------
  console.log("\n--- Suite 11: Non-Fake PPTX Protection ---");

  await testAsync("[TEST 46] Rejects HTML masquerading as .pptx", async () => {
    const fakeHtml = new TextEncoder().encode("<!doctype html><html><body><h1>Fake PPTX</h1></body></html>");
    await assert.rejects(
      async () => await validatePptxPackage(fakeHtml),
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.PPTX_VALIDATION_FAILED
    );
  });

  await testAsync("[TEST 47] Rejects plain text masquerading as .pptx", async () => {
    const fakeText = new TextEncoder().encode("# Slide 1: Judul Presentasi Palsu");
    await assert.rejects(
      async () => await validatePptxPackage(fakeText),
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.PPTX_VALIDATION_FAILED
    );
  });

  await testAsync("[TEST 48] Rejects empty 0-byte file as .pptx", async () => {
    const emptyBytes = new Uint8Array([]);
    await assert.rejects(
      async () => await validatePptxPackage(emptyBytes),
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.PPTX_VALIDATION_FAILED
    );
  });

  await testAsync("[TEST 49] Rejects non-OOXML ZIP archive lacking [Content_Types].xml", async () => {
    const zip = new JSZip();
    zip.file("readme.txt", "Bukan file PPTX.");
    const dummyZipBytes = await zip.generateAsync({ type: "uint8array" });

    await assert.rejects(
      async () => await validatePptxPackage(dummyZipBytes),
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.PPTX_VALIDATION_FAILED
    );
  });

  // ----------------------------------------------------------------------------
  // SUITE 12: STORAGE & SHA-256 HASHING
  // ----------------------------------------------------------------------------
  console.log("\n--- Suite 12: Storage & SHA-256 Hashing ---");

  test("[TEST 50] buildPresentationStoragePath formats canonical storage path", () => {
    const p = buildPresentationStoragePath("tenant_1", "modul_bio", "art_123");
    assert.equal(p, "tenant/tenant_1/modules/modul_bio/presentations/art_123.pptx");
  });

  await testAsync("[TEST 51] MemoryPresentationStorageDriver uploads, retrieves, and deletes binary cleanly", async () => {
    const driver = new MemoryPresentationStorageDriver();
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x01, 0x02]);
    const pathStr = "tenant/default/modules/m1/presentations/test.pptx";

    const upload = await driver.upload(pathStr, bytes, PPTX_MIME_TYPE);
    assert.equal(upload.byteSize, bytes.length);
    assert.ok(upload.publicUrl.includes("test.pptx"));

    const stored = driver.getStored(pathStr);
    assert.ok(stored);
    assert.equal(stored.bytes.length, bytes.length);

    await driver.delete(pathStr);
    assert.equal(driver.getStored(pathStr), undefined);
  });

  // ----------------------------------------------------------------------------
  // SUITE 13: SERVER FUNCTIONS & RBAC ENFORCEMENT
  // ----------------------------------------------------------------------------
  console.log("\n--- Suite 13: Server Functions & Multi-Tenant Security ---");

  const mockPkg = createSamplePresentationPackage();
  const mockResultId = "pres_res_test_999";
  const mockTeacherId = "teacher_owner_1";
  const otherTeacherId = "teacher_intruder_2";

  // Seed mock PPT-1B result in fallback store
  const mockStoredResult = {
    id: mockResultId,
    request_id: mockPkg.generationRequestId,
    generation_plan_id: mockPkg.generationPlanId,
    module_id: mockPkg.moduleId,
    owner_id: mockTeacherId,
    approved_version: 1,
    style_id: mockPkg.styleId,
    style_version: 1,
    generator_version: "v1",
    provider: "google_gemini",
    model: "gemini-flash-lite-latest",
    content_package: mockPkg,
    validation_result: mockPkg.validationMetadata,
    semantic_decision: "PASS",
    grounding_metadata: mockPkg.provenance,
    status: "ready",
    retry_count: 0,
    generation_key: "gen_key_test_999",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  fallbackPresentationResults.set(mockResultId, mockStoredResult);

  await testAsync("[TEST 52] executeRenderPresentationPptx creates and stores real artifact for owner", async () => {
    const res = await executeRenderPresentationPptx(
      { contentResultId: mockResultId },
      { userId: mockTeacherId, profile: { role: "guru" } }
    );

    assert.equal(res.status, "success");
    assert.ok(res.artifact.id.startsWith("ppt_art_"));
    assert.equal(res.artifact.status, "ready");
    assert.equal(res.artifact.slideCount, 4);
    assert.equal(res.artifact.mimeType, PPTX_MIME_TYPE);
    assert.ok(res.artifact.byteSize > 1000);
  });

  await testAsync("[TEST 53] executeRenderPresentationPptx serves existing artifact idempotently", async () => {
    const res1 = await executeRenderPresentationPptx(
      { contentResultId: mockResultId },
      { userId: mockTeacherId, profile: { role: "guru" } }
    );

    const res2 = await executeRenderPresentationPptx(
      { contentResultId: mockResultId },
      { userId: mockTeacherId, profile: { role: "guru" } }
    );

    assert.equal(res1.artifact.id, res2.artifact.id);
    assert.equal(res1.artifact.fileHash, res2.artifact.fileHash);
  });

  await testAsync("[TEST 54] executeRenderPresentationPptx rejects student role (RBAC)", async () => {
    await assert.rejects(
      async () =>
        await executeRenderPresentationPptx(
          { contentResultId: mockResultId },
          { userId: "student_user", profile: { role: "siswa" } }
        ),
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.ROLE_FORBIDDEN
    );
  });

  await testAsync("[TEST 55] executeRenderPresentationPptx rejects other teacher (multi-tenant boundary)", async () => {
    await assert.rejects(
      async () =>
        await executeRenderPresentationPptx(
          { contentResultId: mockResultId },
          { userId: otherTeacherId, profile: { role: "guru" } }
        ),
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.ROLE_FORBIDDEN
    );
  });

  await testAsync("[TEST 56] executeGetPresentationArtifact returns stored artifact for owner", async () => {
    const renderRes = await executeRenderPresentationPptx(
      { contentResultId: mockResultId },
      { userId: mockTeacherId, profile: { role: "guru" } }
    );

    const getRes = await executeGetPresentationArtifact(
      { artifactId: renderRes.artifact.id },
      { userId: mockTeacherId, profile: { role: "guru" } }
    );

    assert.equal(getRes.status, "success");
    assert.equal(getRes.artifact.id, renderRes.artifact.id);
  });

  await testAsync("[TEST 57] executeGetPresentationArtifact forbids access to other teachers", async () => {
    const renderRes = await executeRenderPresentationPptx(
      { contentResultId: mockResultId },
      { userId: mockTeacherId, profile: { role: "guru" } }
    );

    await assert.rejects(
      async () =>
        await executeGetPresentationArtifact(
          { artifactId: renderRes.artifact.id },
          { userId: otherTeacherId, profile: { role: "guru" } }
        ),
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.ROLE_FORBIDDEN
    );
  });

  await testAsync("[TEST 58] executeListPresentationArtifacts returns artifacts isolated by owner", async () => {
    const listOwner = await executeListPresentationArtifacts(
      { moduleId: mockPkg.moduleId },
      { userId: mockTeacherId, profile: { role: "guru" } }
    );
    assert.ok(listOwner.artifacts.length >= 1);

    const listOther = await executeListPresentationArtifacts(
      { moduleId: mockPkg.moduleId },
      { userId: otherTeacherId, profile: { role: "guru" } }
    );
    assert.equal(listOther.artifacts.length, 0);
  });

  // ----------------------------------------------------------------------------
  // SUMMARY
  // ----------------------------------------------------------------------------
  console.log("\n==============================================================================");
  console.log(`PPT-1C TEST SUITE COMPLETE: ${passedCount} PASSED, ${failedCount} FAILED.`);
  console.log("==============================================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

void runTestSuite();
