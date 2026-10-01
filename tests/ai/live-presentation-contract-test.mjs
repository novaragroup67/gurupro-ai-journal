import fs from "fs";
import path from "path";
import {
  executePreparePresentationGenerationRequest,
  executeGetPresentationGenerationRequest,
  executeListPresentationGenerationRequests,
  fallbackPresentationRequests,
} from "../../src/lib/presentation-generation.functions.ts";
import {
  fallbackTestPlans,
} from "../../src/lib/illustration-generation.functions.ts";
import {
  createInitialPlan,
  applyPlanApproval,
  duplicateSlideInPresentationOutline,
  generateInitialPresentationOutline,
} from "../../src/lib/ai/generation-planning-service.ts";
import {
  PRESENTATION_STYLES_CATALOG,
} from "../../src/lib/ai/generation-planning-contract.ts";

console.log("================================================================================");
console.log("  GURUPRO PPT-1A: CONTROLLED LIVE PRESENTATION GENERATION CONTRACT TEST        ");
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
    userId: "teacher-live-ppt-001",
    email: "guru.biologi@sekolah.sch.id",
    role: "guru",
    isGuru: true,
  };

  const mockModul = {
    id: "module-bio-fotosintesis-live-101",
    judul: "Mekanisme Fotosintesis & Konversi Energi pada Tumbuhan",
    fase: "Fase E (Kelas 10 SMA)",
    mataPelajaran: "Biologi",
    ringkasan: "Modul pembelajaran tentang konversi energi matahari menjadi energi kimia dalam kloroplas.",
    sections: [
      {
        id: "sec_1",
        judul: "Pengenalan Fotosintesis",
        isi: "Definisi fotosintesis sebagai proses biokimia pembentukan glukosa.",
        poin: ["Reaksi umum", "Organel kloroplas"],
      },
      {
        id: "sec_2",
        judul: "Tahapan Reaksi Terang",
        isi: "Fotolisis air dan sintesis ATP serta NADPH di membran tilakoid.",
        poin: ["Klorofil a & b", "Transpor elektron"],
      },
      {
        id: "sec_3",
        judul: "Tahapan Reaksi Gelap (Siklus Calvin)",
        isi: "Fiksasi karbondioksida di stroma menghasilkan glukosa.",
        poin: ["Enzim RuBisCO", "Fase regenerasi"],
      },
      {
        id: "sec_4",
        judul: "Kesimpulan & Evaluasi Pemahaman",
        isi: "Rangkuman proses fotosintesis dan pertanyaan reflektif.",
        poin: ["Faktor pembatas fotosintesis", "Pertanyaan diskusi"],
      },
    ],
  };

  console.log("\n[1] Setup Educational Presentation Plan (GEN-0)");
  const initialOutline = generateInitialPresentationOutline(mockModul);
  const planInitResult = createInitialPlan(
    teacherContext.userId,
    mockModul.id,
    "presentation",
    initialOutline,
    "style_ppt_edu_classroom"
  );
  const initialPlan = planInitResult.plan;

  // Verify initial plan presentation target
  assert(initialPlan.targetType === "presentation", "Initial plan correctly initialized with targetType='presentation'");
  assert(Array.isArray(initialPlan.outline.slides), "Plan outline contains slides array");
  assert(initialPlan.outline.slides.length >= 3, `Initial outline has ${initialPlan.outline.slides.length} slides`);

  console.log("\n[2] Teacher Slide Manipulation & Duplication");
  const slideToDuplicate = initialPlan.outline.slides[1].id;
  const manipulatedOutline = duplicateSlideInPresentationOutline(initialPlan.outline, slideToDuplicate);
  assert(manipulatedOutline.slides.length === initialPlan.outline.slides.length + 1, "Slide duplicated successfully");
  assert(
    manipulatedOutline.slides.every((s, idx) => s.slideOrder === idx + 1),
    "Continuous 1..N order strictly maintained after duplication"
  );

  const planWithDuplication = {
    ...initialPlan,
    outline: manipulatedOutline,
    currentVersion: initialPlan.currentVersion + 1,
  };

  console.log("\n[3] Pre-Approval Request Building Guard");
  try {
    fallbackTestPlans.set(planWithDuplication.id, planWithDuplication);
    await executePreparePresentationGenerationRequest(
      {
        planId: planWithDuplication.id,
        parameters: {
          aspectRatio: "16:9",
          contentDensity: "balanced",
        },
      },
      teacherContext
    );
    assert(false, "Should reject unapproved plan");
  } catch (err) {
    assert(
      err.code === "PLAN_NOT_APPROVED" || err.message.includes("disetujui") || err.message.includes("APPROVED"),
      "Strictly rejected request preparation on unapproved plan"
    );
  }

  console.log("\n[4] Teacher Approval Execution");
  const { approvedPlan } = applyPlanApproval(planWithDuplication, teacherContext);
  fallbackTestPlans.set(approvedPlan.id, approvedPlan);
  assert(approvedPlan.status === "approved", "Plan successfully marked as teacher-approved");
  assert(approvedPlan.approvedVersion === approvedPlan.currentVersion, "Approved version aligns with current version");

  console.log("\n[5] Canonical Presentation Generation Request Preparation (PPT-1A)");
  const preparationResult = await executePreparePresentationGenerationRequest(
    {
      planId: approvedPlan.id,
      parameters: {
        aspectRatio: "16:9",
        slideSize: "1920x1080",
        contentDensity: "detailed",
        language: "id",
        includeSpeakerNotes: true,
        footerPolicy: "standard",
      },
    },
    teacherContext
  );

  assert(preparationResult.status === "success", "Presentation generation request prepared successfully");
  const request = preparationResult.request;
  assert(request.status === "prepared", "Request status is strictly 'prepared'");
  assert(request.targetType === "presentation", "Request targetType is 'presentation'");
  assert(request.parameters.aspectRatio === "16:9", "Parameters contain 16:9 aspect ratio");
  assert(
    (request.parameters.slideSize.width === 1920 && request.parameters.slideSize.height === 1080) ||
      (request.parameters.slideDimensions?.width === 1920 && request.parameters.slideDimensions?.height === 1080),
    "Slide dimensions resolve to 1920x1080"
  );
  assert(request.parameters.contentDensity === "detailed", "Content density is 'detailed'");
  assert(request.parameters.includeSpeakerNotes === true, "Speaker notes inclusion flag is preserved");
  assert(request.parameters.footerPolicy === "standard", "Footer policy is 'standard'");

  console.log("\n[6] Blueprint Inspection & Pedagogical Structure");
  const blueprint = request.contentBlueprint || request.blueprint;
  assert(blueprint.slidesOutline.length === approvedPlan.outline.slides.length, `Blueprint slides count (${blueprint.slidesOutline.length}) matches outline`);
  assert(
    blueprint.slidesOutline.every((s, idx) => s.order === idx + 1),
    "Blueprint slides follow contiguous 1..N order"
  );
  assert(
    blueprint.slidesOutline.every((s) => s.pedagogicalType && typeof s.pedagogicalType === "string"),
    "All blueprint slides have deterministic pedagogical types assigned"
  );
  assert(
    request.slidePlan.length === approvedPlan.outline.slides.length,
    "Structured slidePlan length matches outline"
  );
  assert(
    request.slidePlan.every((s, idx) => s.slideOrder === idx + 1),
    "Structured slidePlan follows contiguous 1..N order"
  );
  assert(
    request.slidePlan.every((s) => s.contentBlocks && Array.isArray(s.contentBlocks)),
    "All slide plan items contain structured content blocks"
  );
  assert(
    request.slidePlan.some((s) => s.visualRequirements.type !== "none"),
    "At least one slide includes visual asset requirement or illustration flag"
  );

  console.log("\n[7] Style Snapshot Preservation");
  assert(request.styleSnapshot.id === "style_ppt_edu_classroom", "Style snapshot matches approved style 'style_ppt_edu_classroom'");
  assert(request.styleSnapshot.type === "presentation", "Style snapshot type is verified as 'presentation'");
  assert(request.styleSnapshot.layoutRules !== undefined, "Style snapshot preserves layout rules");
  assert(request.styleSnapshot.typographyRules !== undefined, "Style snapshot preserves typography rules");

  console.log("\n[8] Storage & Retrieval Invariants");
  const retrievedResult = await executeGetPresentationGenerationRequest(
    {
      requestId: request.requestId,
    },
    teacherContext
  );
  assert(retrievedResult.status === "success", "Successfully retrieved request by ID");
  assert(retrievedResult.request.requestId === request.requestId, "Retrieved request matches requested ID");

  const moduleListResult = await executeListPresentationGenerationRequests(
    {
      moduleId: mockModul.id,
    },
    teacherContext
  );
  assert(moduleListResult.status === "success", "Successfully queried presentation requests for module");
  assert(moduleListResult.requests.some((r) => r.requestId === request.requestId), "Request found in module list query");

  console.log("\n[9] Strict Non-Generation Invariant Confirmation");
  // Inspect local filesystem for any unauthorized PPTX/PPT files created
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
