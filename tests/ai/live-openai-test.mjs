import fs from "fs";
import { OpenAiImageProvider } from "../../src/lib/ai/providers/openai-image-provider.ts";
import { validateImageBinary } from "../../src/lib/ai/image-validator.ts";
import {
  createInitialPlan,
  applyPlanApproval,
} from "../../src/lib/ai/generation-planning-service.ts";
import { createGenerationSpecification } from "../../src/lib/ai/generation-planning-contract.ts";
import { buildIllustrationGenerationRequest } from "../../src/lib/ai/illustration-request-builder.ts";

try {
  process.loadEnvFile(".env");
} catch (e) {
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

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("OPENAI_API_KEY not found in environment.");
  process.exit(1);
}

console.log("Found OPENAI_API_KEY:", apiKey.slice(0, 7) + "..." + apiKey.slice(-4));

async function runLiveTest() {
  const provider = new OpenAiImageProvider({ apiKey });
  console.log(`Initialized provider: ${provider.providerName}`);

  // 1. Build an authentic pedagogical illustration plan
  const teacherAuth = {
    userId: "usr_guru_live_test",
    role: "guru",
    isGuru: true,
    verificationStatus: "verified",
  };

  const outline = {
    title: "Siklus Air Edukatif",
    objective: "Menjelaskan siklus air dan kondensasi awan",
    mainSubject: "Siklus air alami dengan penguapan dan hujan",
    supportingElements: ["matahari cerah", "awan kumulus", "danau biru"],
    environmentBackground: "pegunungan hijau dan lembah danau",
    composition: "subjek di tengah dengan alur siklus melingkar seimbang",
    perspectiveView: "eye level terpusat",
    educationalFocus: "proses evaporasi dan presipitasi",
    importantVisualDetails: ["titik-titik air hujan jelas"],
    thingsToAvoid: ["teks bahasa asing", "karakter menyeramkan"],
    sourceReferences: ["Buku IPA SMP Kelas 7"],
    evidenceReferences: ["Materi Siklus Air"],
    labelsTextRequirements: [],
  };

  const { plan: initialPlan } = createInitialPlan(
    teacherAuth.userId,
    "mod_live_test_101",
    "illustration",
    outline,
    "style_ill_flat_edu"
  );

  const { approvedPlan } = applyPlanApproval(initialPlan, teacherAuth);

  const spec = createGenerationSpecification(approvedPlan, teacherAuth);

  // 2. Build canonical request via VIS-1A Request Builder
  const canonicalRequest = buildIllustrationGenerationRequest({
    spec,
    plan: approvedPlan,
    authContext: teacherAuth,
    overrideParams: {
      aspectRatio: "1:1",
      detailLevel: "standard",
    },
  });

  console.log("Canonical request generated:", canonicalRequest.requestId);
  console.log("Full assembled prompt:", canonicalRequest.assembledPrompt.fullPrompt.slice(0, 100) + "...");

  // 3. Send single live generation request to OpenAI
  console.log("\nSending live generation request to OpenAI (gpt-image-1-mini)...");
  const startTime = Date.now();
  const result = await provider.generate(canonicalRequest);
  const duration = Date.now() - startTime;

  console.log(`\n✓ Live generation succeeded in ${duration}ms!`);
  console.log(`- Status: ${result.status}`);
  console.log(`- Provider: ${result.provider}`);
  console.log(`- Model: ${result.model}`);
  console.log(`- MIME type: ${result.mimeType}`);
  console.log(`- Dimensions: ${result.width}x${result.height}`);
  console.log(`- Asset reference length: ${result.assetReference?.length || 0} chars`);
  console.log(`- Asset reference starts with: ${result.assetReference ? result.assetReference.slice(0, 35) : "none"}...`);

  // 4. Assert binary validation on real image payload
  const validation = validateImageBinary(result.assetReference, "1:1");
  console.log("\nImage binary validation check:");
  console.log(`- Valid: ${validation.valid}`);
  console.log(`- Format: ${validation.format}`);
  console.log(`- Calculated dimensions: ${validation.width}x${validation.height}`);
  console.log(`- Byte size: ${validation.byteSize} bytes`);

  if (!validation.valid) {
    throw new Error("Binary validation failed: " + validation.reason);
  }

  console.log("\n✓ ALL LIVE VERIFICATION CHECKS PASSED!");
}

runLiveTest().catch((err) => {
  console.error("\n✗ Live verification failed:", err);
  process.exit(1);
});
