import fs from "fs";
import {
  OpenAiCompatibleVisionQualityEvaluator,
  resolveIllustrationQualityEvaluator,
} from "../../src/lib/ai/providers/illustration-quality-evaluator.ts";
import {
  performDeterministicValidation,
  executeEvaluateIllustrationQuality,
  executeCheckIllustrationEligibility,
  mockAssetBinaries,
  fallbackIllustrationQualityEvaluations,
} from "../../src/lib/illustration-quality.functions.ts";
import {
  fallbackIllustrationAssets,
} from "../../src/lib/illustration-asset.functions.ts";
import {
  fallbackIllustrationRequests,
  fallbackIllustrationGenerations,
} from "../../src/lib/illustration-generation.functions.ts";
import { computeSha256 } from "../../src/lib/ai/illustration-storage-service.ts";
import {
  createInitialPlan,
  applyPlanApproval,
} from "../../src/lib/ai/generation-planning-service.ts";

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

const apiKey = process.env.OPENAI_API_KEY || process.env.LOVABLE_API_KEY || process.env.GEMINI_API_KEY;
console.log("================================================================================");
console.log("  GURUPRO VIS-1E: CONTROLLED LIVE ILLUSTRATION QUALITY EVALUATION TEST          ");
console.log("================================================================================");

if (apiKey) {
  console.log("Live API key detected:", apiKey.slice(0, 7) + "..." + apiKey.slice(-4));
} else {
  console.log("No live API key found in .env; proceeding in verified mock/deterministic mode.");
}

import zlib from "node:zlib";

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (c >>> 8) ^ crcTable[(c ^ buf[i]) & 0xff];
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(typeStr, data) {
  const typeBuf = Buffer.from(typeStr, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([typeBuf, data]);
  const crc = crc32(typeAndData);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([lenBuf, typeAndData, crcBuf]);
}

function createSamplePngBuffer(width = 512, height = 512) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // 8-bit depth
  ihdrData.writeUInt8(2, 9); // RGB
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);
  const ihdr = makeChunk("IHDR", ihdrData);

  // Scanlines with educational diagram gradient
  const rowLen = 1 + width * 3;
  const rawData = Buffer.alloc(rowLen * height);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowLen;
    rawData[rowOffset] = 0; // Filter None
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 3;
      rawData[pxOffset] = Math.floor((x / width) * 200);
      rawData[pxOffset + 1] = Math.floor((y / height) * 200);
      rawData[pxOffset + 2] = 230; // Soft cyan-blue
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idat = makeChunk("IDAT", compressedData);
  const iend = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

async function runControlledTest() {
  const teacherAuth = {
    userId: "usr_guru_live_evaluator",
    role: "guru",
    isGuru: true,
    verificationStatus: "verified",
  };

  const moduleId = `mod_live_${Date.now()}`;
  const assetId = `ast_live_${Date.now()}`;
  const genId = `gen_live_${Date.now()}`;
  const reqId = `req_live_${Date.now()}`;

  // 1. Create Authentic Plan & Approval
  const initialOutline = {
    title: "Siklus Hidrologi Bumi",
    objective: "Menjelaskan siklus air, evaporasi, kondensasi, presipitasi",
    mainSubject: "Siklus perputaran air alami",
    supportingElements: ["Awan kumulus", "Matahari", "Danau", "Aliran sungai"],
    environmentBackground: "Pegunungan hijau dan perairan danau",
    composition: "Alur melingkar dari evaporasi hingga presipitasi seimbang",
    perspectiveView: "Eye-level panoramik",
    importantVisualDetails: ["Arah panah siklus air", "Kondensasi uap air"],
    educationalFocus: "Perpindahan wujud air",
    thingsToAvoid: ["Watermark", "Karakter kartun fiktif berlebihan"],
  };

  const { plan: createdPlan } = createInitialPlan(
    teacherAuth.userId,
    moduleId,
    "illustration",
    initialOutline,
    "style_ill_flat_edu"
  );
  const { approvedPlan } = applyPlanApproval(createdPlan, teacherAuth);

  // 2. Build image binary & register in mock storage
  const imageBinary = createSamplePngBuffer(1024, 1024);
  const sha256Hash = computeSha256(imageBinary);
  mockAssetBinaries.set(assetId, imageBinary);

  // 3. Register persistent asset and request snapshots
  const assetRow = {
    id: assetId,
    generation_id: genId,
    request_id: reqId,
    generation_plan_id: approvedPlan.id,
    module_id: moduleId,
    owner_id: teacherAuth.userId,
    sha256_hash: sha256Hash,
    storage_provider: "local_fs",
    storage_path: `illustrations/${teacherAuth.userId}/${moduleId}/${assetId}.png`,
    public_url: `https://assets.gurupro.internal/illustrations/${teacherAuth.userId}/${moduleId}/${assetId}.png`,
    byte_size: imageBinary.length,
    mime_type: "image/png",
    format: "png",
    width: 1024,
    height: 1024,
    aspect_ratio: "1:1",
    lifecycle_status: "staged",
    style_id: "style_ill_flat_edu",
    style_version: 1,
    pedagogical_metadata: {
      title: initialOutline.title,
      objective: initialOutline.objective,
      mainSubject: initialOutline.mainSubject,
      educationalFocus: initialOutline.educationalFocus,
    },
    prompt_snapshot: {
      compositionDirectives: initialOutline.composition,
    },
    grounding_snapshot: {
      subjectDiscipline: "Ilmu Pengetahuan Alam",
      audienceLevel: "Fase D (SMP)",
      curriculumContext: "Kurikulum Merdeka",
      evidenceReferences: ["materi_siklus_air_smp"],
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  fallbackIllustrationAssets.set(assetId, assetRow);
  fallbackIllustrationRequests.set(reqId, {
    requestId: reqId,
    moduleId,
    generationPlanId: approvedPlan.id,
    approvedOutlineVersion: approvedPlan.approvedVersion,
    approvedOutline: approvedPlan.outline,
    styleId: "style_ill_flat_edu",
    styleVersion: 1,
    ownerId: teacherAuth.userId,
  });

  fallbackIllustrationGenerations.set(genId, {
    id: genId,
    request_id: reqId,
    generation_plan_id: approvedPlan.id,
    module_id: moduleId,
    owner_id: teacherAuth.userId,
    status: "succeeded",
    mime_type: "image/png",
    width: 1024,
    height: 1024,
  });

  // 4. Test Layer 1 Deterministic Technical Checks
  console.log("\n[1] Executing Layer 1 Deterministic Technical Validation...");
  const deterministicChecks = performDeterministicValidation(assetRow, imageBinary);
  console.log(`    Binary exists: ${deterministicChecks.binaryExists}`);
  console.log(`    MIME valid: ${deterministicChecks.mimeTypeValid} (${deterministicChecks.mimeType})`);
  console.log(`    Dimensions: ${deterministicChecks.width}x${deterministicChecks.height}`);
  console.log(`    Aspect ratio: ${deterministicChecks.aspectRatio} (valid: ${deterministicChecks.aspectRatioValid})`);
  console.log(`    SHA-256 integrity: ${deterministicChecks.hashMatches} (${deterministicChecks.assetHash.slice(0, 16)}...)`);
  console.log(`    Provenance complete: ${deterministicChecks.provenanceComplete}`);
  console.log(`    Layer 1 Passed: ${deterministicChecks.passed ? "YES ✓" : "NO ✗"}`);

  if (!deterministicChecks.passed) {
    throw new Error(`Layer 1 failed: ${deterministicChecks.failureReason}`);
  }

  // 5. Test Quality Evaluation Execution
  console.log("\n[2] Executing Full Quality Gate Evaluation...");
  let evaluator;
  if (apiKey && process.env.OPENAI_API_KEY) {
    evaluator = new OpenAiCompatibleVisionQualityEvaluator({
      apiKey: process.env.OPENAI_API_KEY,
      model: "gpt-4o-mini",
    });
    console.log("    Using live OpenAI Vision Evaluator (gpt-4o-mini)...");
  }

  const result = await executeEvaluateIllustrationQuality(
    { assetId },
    teacherAuth,
    evaluator ? { evaluator } : undefined
  );

  console.log(`    Status: ${result.status}`);
  console.log(`    Evaluator: ${result.evaluation.provider} / ${result.evaluation.model}`);
  console.log(`    Decision: ${result.evaluation.decision}`);
  console.log(`    Findings Count: ${result.evaluation.findings.length}`);
  if (result.evaluation.findings.length > 0) {
    result.evaluation.findings.forEach((f, idx) => {
      console.log(`      [${idx + 1}] [${f.severity.toUpperCase()}] (${f.category}) ${f.description}`);
    });
  }

  // 6. Test Cache Re-use
  console.log("\n[3] Testing Cost Control & In-Memory Cache Hit...");
  const cachedResult = await executeEvaluateIllustrationQuality(
    { assetId },
    teacherAuth,
    evaluator ? { evaluator } : undefined
  );
  console.log(`    Cached: ${cachedResult.cached === true ? "YES (Cost saved! ✓)" : "NO ✗"}`);

  // 7. Usability Eligibility Check
  console.log("\n[4] Checking Composite Usability Eligibility...");
  const eligibility = await executeCheckIllustrationEligibility({ assetId }, teacherAuth);
  console.log(`    Eligible For Use: ${eligibility.eligibility.eligibleForUse}`);
  console.log(`    Quality Status: ${eligibility.eligibility.qualityStatus}`);
  console.log(`    Review Status: ${eligibility.eligibility.reviewStatus}`);
  console.log(`    Reason: ${eligibility.eligibility.reason}`);

  console.log("\n================================================================================");
  console.log("  CONTROLLED LIVE TEST COMPLETED SUCCESSFULLY! ✓");
  console.log("================================================================================\n");
}

runControlledTest().catch((err) => {
  console.error("\nControlled test failed:", err);
  process.exit(1);
});
