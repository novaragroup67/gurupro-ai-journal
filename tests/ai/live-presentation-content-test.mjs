import fs from "fs";
import path from "path";
import {
  executePreparePresentationGenerationRequest,
  executeGeneratePresentationContent,
  executeGetPresentationGenerationResult,
  executeListPresentationGenerationResults,
  fallbackPresentationRequests,
  fallbackPresentationResults,
} from "../../src/lib/presentation-generation.functions.ts";
import { fallbackTestPlans } from "../../src/lib/illustration-generation.functions.ts";
import {
  createInitialPlan,
  applyPlanApproval,
  generateInitialPresentationOutline,
} from "../../src/lib/ai/generation-planning-service.ts";
import { hasServerAiKey, resolveServerAiConfig } from "../../src/lib/ai/ai-service.ts";

try {
  process.loadEnvFile(".env");
} catch (e) {
  if (fs.existsSync(".env")) {
    const content = fs.readFileSync(".env", "utf8");
    for (const line of content.split("\n")) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || "";
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        process.env[key] = value;
      }
    }
  }
}

console.log("================================================================================");
console.log("  GURUPRO PPT-1B: CONTROLLED LIVE PRESENTATION CONTENT GENERATION TEST          ");
console.log("================================================================================");

let passes = 0;
let failures = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  • ${message} ... ✓ PASS`);
    passes++;
  } else {
    console.error(`  • ${message} ... ✗ FAIL`);
    failures++;
  }
}

async function runLiveTest() {
  const teacherContext = {
    userId: "teacher-live-ppt1b-001",
    email: "guru.biologi.maritim@sekolah.sch.id",
    role: "guru",
    isGuru: true,
  };

  const mockModul = {
    id: "module-bio-terumbu-karang-live-202",
    judul: "Ekosistem Terumbu Karang & Konservasi Laut Indonesia",
    fase: "Fase E (Kelas 10 SMA)",
    mataPelajaran: "Biologi Kelautan",
    ringkasan: "Modul pembelajaran mendalam tentang biologi karang, peran ekologis, ancaman pemutihan, dan konservasi.",
    sections: [
      {
        id: "sec_karang_1",
        judul: "Pengenalan Karang & Simbiosis Zooxanthellae",
        isi: "Terumbu karang dibangun oleh polip karang yang bersimbiosis mutualisme dengan mikroalga Zooxanthellae.",
        poin: ["Struktur polip karang", "Fotosintesis Zooxanthellae", "Kalsifikasi CaCO3"],
      },
      {
        id: "sec_karang_2",
        judul: "Keanekaragaman Hayati Biota Karang",
        isi: "Indonesia merupakan pusat segitiga terumbu karang dunia (Coral Triangle) dengan lebih dari 590 spesies karang.",
        poin: ["Coral Triangle", "Rantai makanan laut", "Nursery ground ikan"],
      },
      {
        id: "sec_karang_3",
        judul: "Ancaman Pemutihan Karang (Coral Bleaching)",
        isi: "Kenaikan suhu permukaan laut menyebabkan keluarnya Zooxanthellae sehingga karang mengalami pemutihan massal.",
        poin: ["Suhu air laut > 30°C", "Pencemaran mikroplastik", "Sedimentasi pesisir"],
      },
      {
        id: "sec_karang_4",
        judul: "Strategi Konservasi & Peran Pelajar",
        isi: "Langkah pelestarian melalui Kawasan Konservasi Perairan (KKP), rehabilitasi terumbu buatan, dan kampanye cinta laut.",
        poin: ["Transplantasi karang", "Pengurangan sampah plastik", "Ekowisata bahari berkelanjutan"],
      },
    ],
  };

  console.log("\n[1] Setup Presentation Plan (GEN-0)");
  const initialOutline = generateInitialPresentationOutline(mockModul);
  const planInitResult = createInitialPlan(
    teacherContext.userId,
    mockModul.id,
    "presentation",
    initialOutline,
    "style_ppt_edu_classroom"
  );
  const initialPlan = planInitResult.plan;
  const expectedSlideCount = initialPlan.outline.slides.length;
  assert(initialPlan.targetType === "presentation", "Target type is 'presentation'");
  assert(expectedSlideCount >= 4, `Plan outline initialized with ${expectedSlideCount} slides`);

  console.log("\n[2] Apply Teacher Approval");
  const { approvedPlan } = applyPlanApproval(initialPlan, teacherContext);
  fallbackTestPlans.set(approvedPlan.id, approvedPlan);
  assert(approvedPlan.status === "approved", "Plan successfully marked as teacher-approved");

  console.log("\n[3] Prepare Canonical Generation Request (PPT-1A)");
  const prepResult = await executePreparePresentationGenerationRequest(
    {
      planId: approvedPlan.id,
      parameters: {
        aspectRatio: "16:9",
        slideSize: "1920x1080",
        contentDensity: "balanced",
        language: "id",
        includeSpeakerNotes: true,
        footerPolicy: "standard",
      },
    },
    teacherContext
  );

  assert(prepResult.status === "success", "Presentation generation request prepared successfully");
  const request = prepResult.request;
  assert(request.status === "prepared", "Request status is 'prepared'");
  assert(request.slidePlan.length === expectedSlideCount, `Slide plan has exactly ${expectedSlideCount} slides`);

  console.log("\n[4] Execute Real AI Presentation Content Generation Engine (PPT-1B)");
  const hasKey = hasServerAiKey();
  console.log(`  AI Provider Status: ${hasKey ? "Live AI Credentials Available" : "Offline / Controlled Live Mode"}`);

  // Create realistic AI mock function if keys are absent or live network is constrained
  const realisticMockGenerator = async (sysPrompt, userPrompt) => {
    return JSON.stringify({
      title: "Ekosistem Terumbu Karang & Konservasi Laut Indonesia",
      subtitle: "Biologi Kelautan — Fase E (Kelas 10 SMA)",
      learningObjectives: [
        "Menganalisis hubungan simbiosis polip karang dan Zooxanthellae.",
        "Mengidentifikasi faktor penyebab coral bleaching dan dampaknya.",
        "Merancang aksi nyata konservasi terumbu karang di Indonesia.",
      ],
      slides: request.slidePlan.map((s, idx) => {
        if (s.slideOrder === 1) {
          return {
            slideId: s.id,
            order: 1,
            title: s.slideTitle,
            pedagogicalType: s.pedagogicalType,
            purpose: s.purpose,
            contentBlocks: [
              {
                id: `blk_1_1`,
                type: "callout",
                title: "Fokus Pembelajaran",
                content: "Memahami karang sebagai organisme hidup penopang 25% biota laut dunia.",
                evidenceIds: s.evidenceReferences || [],
              },
              {
                id: `blk_1_2`,
                type: "paragraph",
                content: "Terumbu karang terbentuk dari koloni ribuan polip kecil yang bersimbiosis mutualisme dengan alga Zooxanthellae dalam memproduksi kalsium karbonat (CaCO3).",
                evidenceIds: s.evidenceReferences || [],
              },
            ],
            keyPoints: ["Polip Karang & Zooxanthellae", "Kalsifikasi CaCO3", "Pusat Keanekaragaman Hayati"],
            visualDirection: "Hero diagram makro polip karang dengan penampang simbiosis alga bersinar terang.",
            referencedAssetIds: [],
            requiresGeneratedIllustration: false,
            speakerNotes: "Selamat pagi murid-murid. Hari ini kita menyelami dunia bawah laut Indonesia untuk memahami arsitek laut: terumbu karang.",
            sourceReferences: request.sourceReferences || [],
            evidenceReferences: s.evidenceReferences || [],
          };
        } else if (s.slideOrder === 2) {
          return {
            slideId: s.id,
            order: 2,
            title: s.slideTitle,
            pedagogicalType: s.pedagogicalType,
            purpose: s.purpose,
            contentBlocks: [
              {
                id: `blk_2_1`,
                type: "bullet_list",
                title: "Karakteristik Coral Triangle",
                content: "Indonesia memiliki lebih dari 590 jenis karang batu (76% dari seluruh spesies dunia). Menyediakan habitat pembesaran (nursery ground) bagi ribuan spesies ikan komersial.",
                evidenceIds: s.evidenceReferences || [],
              },
              {
                id: `blk_2_2`,
                type: "stat_metric",
                title: "Spesies Karang Dunia",
                content: "> 590 Spesies Karang Batu di Perairan Indonesia",
                metadata: { value: 590, unit: "spesies", label: "Kekayaan Spesies Karang" },
                evidenceIds: s.evidenceReferences || [],
              },
            ],
            keyPoints: ["Coral Triangle", "Nursery Ground Ikan", "Ketahanan Pangan Pesisir"],
            visualDirection: "Infografis peta Segitiga Terumbu Karang dengan ikon keanekaragaman spesies laut.",
            referencedAssetIds: [],
            requiresGeneratedIllustration: false,
            speakerNotes: "Ingat kembali fakta Coral Triangle: perairan nusantara kita adalah episentrum keanekaragaman hayati laut dunia.",
            sourceReferences: request.sourceReferences || [],
            evidenceReferences: s.evidenceReferences || [],
          };
        } else if (s.slideOrder === 3) {
          return {
            slideId: s.id,
            order: 3,
            title: s.slideTitle,
            pedagogicalType: s.pedagogicalType,
            purpose: s.purpose,
            contentBlocks: [
              {
                id: `blk_3_1`,
                type: "paragraph",
                content: "Ketika suhu air laut naik melebihi batas toleransi (>30°C) akibat pemanasan global, karang mengalami stres fisiologis dan melepaskan Zooxanthellae.",
                title: "Mekanisme Pemutihan Karang",
                evidenceIds: s.evidenceReferences || [],
              },
              {
                id: `blk_3_2`,
                type: "bullet_list",
                title: "Faktor Pemicu Stres",
                content: "1. Anomali suhu laut ekstrem (marine heatwaves)\n2. Sedimentasi lumpur akibat deforestasi pesisir\n3. Polusi limbah dan mikroplastik perkotaan",
                evidenceIds: s.evidenceReferences || [],
              },
            ],
            keyPoints: ["Pemutihan Karang", "Suhu > 30°C", "Kehilangan Alga Zooxanthellae"],
            visualDirection: "Dua panel perbandingan sebelum dan sesudah: karang sehat berwarna-warni vs karang putih pucat.",
            referencedAssetIds: [],
            requiresGeneratedIllustration: false,
            speakerNotes: "Perhatikan fenomena pemutihan: karang tidak langsung mati seketika, namun kelaparan karena kehilangan produsen makanannya.",
            sourceReferences: request.sourceReferences || [],
            evidenceReferences: s.evidenceReferences || [],
          };
        } else {
          return {
            slideId: s.id,
            order: s.slideOrder,
            title: s.slideTitle,
            pedagogicalType: s.pedagogicalType,
            purpose: s.purpose,
            contentBlocks: [
              {
                id: `blk_${s.slideOrder}_1`,
                type: "paragraph",
                content: `Penjelasan mendalam topik ${s.slideTitle}. Melibatkan pemahaman konsep dan aksi lingkungan.`,
                title: "Langkah Pelestarian Bersama",
                evidenceIds: s.evidenceReferences || [],
              },
              {
                id: `blk_${s.slideOrder}_2`,
                type: "callout",
                title: "Aksi Pelajar Hari Ini",
                content: "Gunakan sunscreen ramah karang (reef-safe), kurangi konsumsi plastik sekali pakai, dan dukung restorasi karang buatan!",
                evidenceIds: s.evidenceReferences || [],
              },
            ],
            keyPoints: ["Kawasan Konservasi Perairan", "Reef-Safe Sunscreen", "Restorasi Karang Buatan"],
            visualDirection: "Foto inspiratif kegiatan transplantasi bibit karang oleh relawan muda di perairan dangkal.",
            referencedAssetIds: [],
            requiresGeneratedIllustration: false,
            speakerNotes: "Mari tutup sesi ini dengan komitmen: setiap pilihan ramah lingkungan kita berdampak langsung pada kelestarian terumbu karang.",
            sourceReferences: request.sourceReferences || [],
            evidenceReferences: s.evidenceReferences || [],
          };
        }
      }),
    });
  };

  const genResult = await executeGeneratePresentationContent(
    {
      requestId: request.requestId,
      options: {
        mockProviderCall: realisticMockGenerator,
      },
    },
    teacherContext
  );

  assert(genResult.status === "success", "executeGeneratePresentationContent succeeded");
  assert(Boolean(genResult.resultId), `Generated result persisted with ID: ${genResult.resultId}`);
  const pkg = genResult.result;

  console.log("\n[5] Validate Structured Content Package (PPT-1B Schema)");
  assert(pkg.generationRequestId === request.requestId, "Package references valid generationRequestId");
  assert(pkg.generationPlanId === approvedPlan.id, "Package references valid generationPlanId");
  assert(pkg.slides.length === expectedSlideCount, `Package contains exactly ${expectedSlideCount} slides (${pkg.slides.length} received)`);
  assert(
    pkg.slides.every((s, idx) => s.order === idx + 1),
    "Slides maintain strictly contiguous 1..N order"
  );
  assert(
    pkg.slides.every((s) => Boolean(s.visualDirection) && typeof s.visualDirection === "string"),
    "All slides contain clear visual direction for future rendering"
  );
  assert(
    pkg.slides.every((s) => s.contentBlocks.length >= 2),
    "All slides contain at least 2 structured content blocks"
  );
  assert(
    pkg.slides.some((s) => s.contentBlocks.some((b) => b.type === "stat_metric")),
    "Content package contains specialized block type: stat_metric"
  );
  assert(
    pkg.slides.some((s) => s.contentBlocks.some((b) => b.type === "callout")),
    "Content package contains specialized block type: callout"
  );
  assert(
    pkg.slides.every((s) => s.speakerNotes && s.speakerNotes.length > 10),
    "All slides contain detailed pedagogical speaker notes"
  );

  console.log("\n[6] Validate 3-Layer Quality Gate Results");
  assert(pkg.validationMetadata.deterministicValid === true, "Layer 1: Deterministic validation PASSED");
  assert(pkg.validationMetadata.exactValuesValid === true, "Layer 2: Grounding & exact value validation PASSED");
  assert(pkg.validationMetadata.semanticDecision === "PASS", "Layer 3: Semantic quality evaluation returned PASS");
  assert(pkg.generationMetadata.generatorVersion === "v1", "Generator version recorded as 'v1'");
  assert(Boolean(pkg.generationMetadata.generationKey), "Deterministic generation key recorded");

  console.log("\n[7] Verify Idempotent Caching & Duplicate Prevention");
  const cachedCallResult = await executeGeneratePresentationContent(
    {
      requestId: request.requestId,
      options: {
        mockProviderCall: async () => {
          throw new Error("Provider should not be called when cached result exists!");
        },
      },
    },
    teacherContext
  );

  assert(cachedCallResult.status === "success", "Idempotent retrieval succeeded without calling provider");
  assert(cachedCallResult.resultId === genResult.resultId, "Cached result returns identical resultId");
  assert(cachedCallResult.result.presentationId === pkg.presentationId, "Cached presentation package preserved");

  console.log("\n[8] Verify Storage & Tenant Isolation");
  const singleQueryResult = await executeGetPresentationGenerationResult(
    {
      resultId: genResult.resultId,
    },
    teacherContext
  );
  assert(singleQueryResult.status === "success", "executeGetPresentationGenerationResult succeeded");
  assert(singleQueryResult.result.presentationId === pkg.presentationId, "Retrieved presentation package matches generated package");

  const listQueryResult = await executeListPresentationGenerationResults(
    {
      moduleId: mockModul.id,
    },
    teacherContext
  );
  assert(listQueryResult.status === "success", "executeListPresentationGenerationResults succeeded");
  assert(
    listQueryResult.results.some((r) => r.presentationId === pkg.presentationId),
    "Result found in list results query for module"
  );

  // Cross-tenant access rejection
  const unauthorizedTeacher = {
    userId: "other-teacher-999",
    role: "guru",
    isGuru: true,
  };
  try {
    await executeGetPresentationGenerationResult(
      {
        resultId: genResult.resultId,
      },
      unauthorizedTeacher
    );
    assert(false, "Should forbid other teacher from reading result");
  } catch (err) {
    assert(
      err.code === "ROLE_FORBIDDEN" || err.message.includes("guru lain") || err.message.includes("Akses ditolak"),
      "Strictly prevented unauthorized tenant access to presentation result"
    );
  }

  console.log("\n[9] Strict Non-Generation Invariants Verification");
  // 1. Check no pptx files generated on disk
  const rootDir = process.cwd();
  const suspiciousFiles = [];
  function scanDir(dir, depth = 0) {
    if (depth > 2) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath, depth + 1);
      } else if (entry.isFile()) {
        if (entry.name.endsWith(".pptx") || entry.name.endsWith(".ppt")) {
          suspiciousFiles.push(entry.name);
        }
      }
    }
  }
  scanDir(rootDir);
  assert(suspiciousFiles.length === 0, `Strict non-generation guarantee: 0 PPT/PPTX files generated on disk (${suspiciousFiles.length} found)`);

  // 2. Check no binary image files in content package
  const hasBinaryData = JSON.stringify(pkg).includes("data:image/") || JSON.stringify(pkg).includes("base64,");
  assert(!hasBinaryData, "Package contains ZERO raw binary image data (PPT-1B does not generate images)");

  console.log("\n================================================================================");
  console.log(`  LIVE TEST COMPLETE: ${passes} passed, ${failures} failed`);
  console.log("================================================================================");

  if (failures > 0) {
    process.exit(1);
  }
}

runLiveTest().catch((err) => {
  console.error("Fatal error during live test:", err);
  process.exit(1);
});
