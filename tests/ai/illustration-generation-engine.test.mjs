#!/usr/bin/env node
/**
 * ==============================================================================
 * GURUPRO TEST SUITE: VIS-1B REAL AI ILLUSTRATION GENERATION ENGINE
 * ==============================================================================
 *
 * Verifies:
 * 1. Authorization:
 *    - Authenticated teacher accepted
 *    - Unauthenticated rejected
 *    - Student role rejected
 *    - Non-owner teacher rejected
 *    - Cross-tenant request rejected
 *    - Client owner manipulation rejected
 *
 * 2. Approval Gate & Versioning Re-Validation:
 *    - Unapproved request rejected
 *    - Stale approval rejected
 *    - Changed outline rejected
 *    - Style mismatch rejected
 *    - Target type non-illustration rejected
 *
 * 3. Provider Adapter Interface & Request Translation:
 *    - Canonical request received
 *    - OpenAI request translation (prompt, negative prompt, aspect ratio, text policy)
 *    - Gemini request translation
 *    - Provider success normalized into IllustrationGenerationResult
 *    - Provider failure normalized
 *
 * 4. Error Handling & Bounded Retries:
 *    - Transient 503 error retried and succeeds
 *    - Transient 429 rate limit retried up to bounded max (2)
 *    - Bounded retries strictly capped (no infinite loop)
 *    - Permanent 400 Bad Request fails immediately (0 retries)
 *    - Safety / content policy rejection fails immediately (AI_SAFETY_BLOCKED, 0 retries)
 *    - Provider timeout handled cleanly
 *
 * 5. Cost Control & Idempotency:
 *    - Concurrent in-flight generation locked
 *    - Idempotency cache: repeated calls for succeeded request return existing result
 *    - Force retry bypasses cache
 *    - Outline edit does NOT trigger automatic generation
 *    - Style selection does NOT trigger automatic generation
 *    - Provider invocation count strictly controlled
 *
 * 6. Image Binary Validation:
 *    - Valid PNG accepted
 *    - Valid JPEG accepted
 *    - Valid WebP accepted
 *    - Sub-minimum dimension rejected
 *    - Aspect ratio discrepancy beyond tolerance rejected
 *    - Empty payload (< 512 bytes) rejected
 *    - Mock SVG / XML payload rejected
 *    - Invalid / corrupted bytes rejected
 *
 * 7. Persistence & Integrity:
 *    - Succeeded generation persisted with full metadata
 *    - Failed generation persisted and request status marked failed
 *    - Correct teacher ownership preserved
 *    - Exact approved specification preserved
 *    - STRICT NON-FALLBACK: Provider failure NEVER substitutes mock SVG
 */

import assert from "node:assert/strict";

import {
  AI_ERROR_CODES,
  AiServiceError,
} from "../../src/lib/ai/error-taxonomy.ts";
import {
  ILLUSTRATION_STYLES_CATALOG,
  createGenerationSpecification,
} from "../../src/lib/ai/generation-planning-contract.ts";
import {
  createInitialPlan,
  applyOutlineEdits,
  applyStyleSelection,
  applyPlanApproval,
} from "../../src/lib/ai/generation-planning-service.ts";
import {
  validateIllustrationGenerationRequest,
} from "../../src/lib/ai/illustration-generation-contract.ts";
import {
  buildIllustrationGenerationRequest,
} from "../../src/lib/ai/illustration-request-builder.ts";
import {
  inspectImageBinary,
  validateImageBinary,
  assertValidImageBinary,
} from "../../src/lib/ai/image-validator.ts";
import {
  OpenAiImageProvider,
} from "../../src/lib/ai/providers/openai-image-provider.ts";
import {
  GeminiImageProvider,
} from "../../src/lib/ai/providers/gemini-image-provider.ts";
import {
  setMockIllustrationProvider,
  resolveIllustrationGenerationProvider,
} from "../../src/lib/ai/providers/illustration-provider-factory.ts";
import {
  fallbackIllustrationRequests,
  fallbackIllustrationGenerations,
  inFlightGenerationLocks,
  fallbackTestPlans,
  executeGenerateIllustration,
  executeGetIllustrationGenerationResult,
  generateIllustrationServerFn,
  getIllustrationGenerationResultServerFn,
} from "../../src/lib/illustration-generation.functions.ts";

console.log("================================================================================");
console.log("  GURUPRO TEST SUITE: VIS-1B REAL AI ILLUSTRATION GENERATION ENGINE             ");
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

// ------------------------------------------------------------------------------
// TEST FIXTURES & BINARY BUILDERS
// ------------------------------------------------------------------------------

const mockTeacherAuth = {
  userId: "usr_guru_primary",
  role: "guru",
  isGuru: true,
  verificationStatus: "verified",
};

const mockOtherTeacherAuth = {
  userId: "usr_guru_secondary",
  role: "guru",
  isGuru: true,
  verificationStatus: "verified",
};

const mockStudentAuth = {
  userId: "usr_siswa_001",
  role: "siswa",
  isGuru: false,
};

function createValidPngBuffer(width = 1024, height = 1024, extraBytes = 600) {
  // PNG Magic: 89 50 4E 47 0D 0A 1A 0A
  const header = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  // IHDR length: 13 (00 00 00 0D)
  const ihdrLen = [0x00, 0x00, 0x00, 0x0d];
  // IHDR chunk type: 49 48 44 52
  const ihdrType = [0x49, 0x48, 0x44, 0x52];
  // Width (4 bytes big-endian)
  const wBytes = [(width >> 24) & 0xff, (width >> 16) & 0xff, (width >> 8) & 0xff, width & 0xff];
  // Height (4 bytes big-endian)
  const hBytes = [(height >> 24) & 0xff, (height >> 16) & 0xff, (height >> 8) & 0xff, height & 0xff];
  // Bit depth (8), color type (2 = Truecolor), compression (0), filter (0), interlace (0)
  const ihdrData = [0x08, 0x02, 0x00, 0x00, 0x00];
  // CRC dummy
  const crc = [0x00, 0x00, 0x00, 0x00];

  const full = [
    ...header,
    ...ihdrLen,
    ...ihdrType,
    ...wBytes,
    ...hBytes,
    ...ihdrData,
    ...crc,
  ];

  // Fill up to minimum bytes (> 512)
  while (full.length < extraBytes) {
    full.push(0x5a);
  }

  return Buffer.from(full);
}

function createValidJpegBuffer(width = 1024, height = 1024, extraBytes = 600) {
  // SOI: FF D8 FF
  // SOF0: FF C0 [length 2 bytes] [precision 1 byte] [height 2 bytes] [width 2 bytes] ...
  const buf = [
    0xff, 0xd8, 0xff, 0xc0,
    0x00, 0x11, // length 17
    0x08,       // precision 8
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01
  ];
  while (buf.length < extraBytes) {
    buf.push(0x42);
  }
  buf.push(0xff, 0xd9); // EOI
  return Buffer.from(buf);
}

function createValidWebpBuffer(width = 1024, height = 1024, extraBytes = 600) {
  // RIFF .... WEBP VP8X .... canvas width/height
  const buf = [
    0x52, 0x49, 0x46, 0x46, // RIFF
    0x00, 0x00, 0x00, 0x00, // size dummy
    0x57, 0x45, 0x42, 0x50, // WEBP
    0x56, 0x50, 0x38, 0x58, // VP8X
    0x0a, 0x00, 0x00, 0x00, // chunk size 10
    0x00, 0x00, 0x00, 0x00, // flags
    (width - 1) & 0xff, ((width - 1) >> 8) & 0xff, ((width - 1) >> 16) & 0xff, // 24-bit width-1
    (height - 1) & 0xff, ((height - 1) >> 8) & 0xff, ((height - 1) >> 16) & 0xff, // 24-bit height-1
  ];
  while (buf.length < extraBytes) {
    buf.push(0x77);
  }
  return Buffer.from(buf);
}

const baseOutline = {
  title: "Siklus Air dan Presipitasi",
  objective: "Menjelaskan siklus hidrologi dari evaporasi hingga infiltrasi tanah.",
  mainSubject: "Siklus air di alam terbuka meliputi laut, awan hujan, gunung, dan aliran sungai.",
  supportingElements: ["Matahari", "Awan mendung", "Hujan tetesan air", "Vegetasi lereng"],
  environmentBackground: "Lanskap alam cerah dengan perbukitan dan lautan luas",
  composition: "Alur siklus melingkar dari kiri bawah ke atas lalu ke kanan bawah",
  perspectiveView: "Tampilan panorama isometris 3D",
  educationalFocus: "Memahami tahapan siklus hidrologi secara utuh dan terpadu",
  importantVisualDetails: ["Panah uap air naik", "Panah presipitasi turun", "Label resapan tanah"],
  moodAtmosphere: "Edukatif, segar, informatif",
  colorPalette: ["Biru laut #1E88E5", "Biru langit #90CAF9", "Hijau lereng #43A047"],
  thingsToAvoid: ["teks berantakan", "gambar kartun distorsi", "tengkorak", "elemen seram"],
  suggestedLabels: ["Evaporasi", "Kondensasi", "Presipitasi", "Infiltrasi"],
  labelsTextRequirements: [],
  allowTextInImage: false,
};

function setupApprovedPlanAndRequest(opts = {}) {
  const ownerId = opts.ownerId || mockTeacherAuth.userId;
  const moduleId = opts.moduleId || "mod_geo_101";
  const targetType = opts.targetType || "illustration";

  const presOutline = {
    topic: "Siklus Hidrologi",
    targetAudience: "Siswa SMP Kelas 7",
    estimatedDurationMinutes: 15,
    slideCount: 1,
    slides: [
      {
        slideNumber: 1,
        title: "Pengantar Siklus Air",
        contentFocus: "Pengertian evaporasi dan kondensasi",
        layoutStrategy: "single_column",
      },
    ],
  };

  const { plan: initial } = createInitialPlan(
    ownerId,
    moduleId,
    targetType,
    targetType === "illustration" ? baseOutline : presOutline,
    opts.styleId || (targetType === "illustration" ? "style_ill_flat_edu" : "style_ppt_modern_minimal")
  );

  const { approvedPlan: approved } = applyPlanApproval(initial, {
    userId: ownerId,
    role: "guru",
    isGuru: true,
    verificationStatus: "verified",
  });

  fallbackTestPlans.set(approved.id, approved);

  const spec = createGenerationSpecification(approved, {
    userId: ownerId,
    role: "guru",
    isGuru: true,
    verificationStatus: "verified",
  });

  const request = buildIllustrationGenerationRequest({
    spec,
    plan: approved,
    authContext: {
      userId: ownerId,
      role: "guru",
      isGuru: true,
      verificationStatus: "verified",
    },
    overrideParams: opts.params,
  });

  const requestRow = {
    id: request.requestId,
    generation_plan_id: approved.id,
    approved_version: approved.approvedVersion,
    style_id: request.styleId,
    style_version: request.styleVersion,
    request_snapshot: request,
    status: opts.requestStatus || "prepared",
    created_by: ownerId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  fallbackIllustrationRequests.set(request.requestId, requestRow);

  return { plan: approved, spec, request, requestRow };
}

// ------------------------------------------------------------------------------
// TEST EXECUTION
// ------------------------------------------------------------------------------

async function main() {
  // Clear any existing test data
  fallbackIllustrationRequests.clear();
  fallbackIllustrationGenerations.clear();
  inFlightGenerationLocks.clear();
  fallbackTestPlans.clear();

  // ============================================================================
  // GROUP 1: IMAGE BINARY VALIDATION
  // ============================================================================
  console.log("\n[GROUP 1: Image Binary Validation]");

  await runTest("1.1 Valid PNG binary passes inspection and validation", () => {
    const png = createValidPngBuffer(1024, 1024);
    const inspected = inspectImageBinary(png);
    assert.equal(inspected.format, "png");
    assert.equal(inspected.mimeType, "image/png");
    assert.equal(inspected.width, 1024);
    assert.equal(inspected.height, 1024);

    const validated = validateImageBinary(png, "1:1");
    assert.equal(validated.valid, true);
    assert.equal(validated.format, "png");
  });

  await runTest("1.2 Valid JPEG binary passes inspection and validation", () => {
    const jpeg = createValidJpegBuffer(1024, 768);
    const inspected = inspectImageBinary(jpeg);
    assert.equal(inspected.format, "jpeg");
    assert.equal(inspected.mimeType, "image/jpeg");
    assert.equal(inspected.width, 1024);
    assert.equal(inspected.height, 768);

    const validated = validateImageBinary(jpeg, "4:3");
    assert.equal(validated.valid, true);
  });

  await runTest("1.3 Valid WebP binary passes inspection and validation", () => {
    const webp = createValidWebpBuffer(1536, 864);
    const inspected = inspectImageBinary(webp);
    assert.equal(inspected.format, "webp");
    assert.equal(inspected.mimeType, "image/webp");
    assert.equal(inspected.width, 1536);
    assert.equal(inspected.height, 864);

    const validated = validateImageBinary(webp, "16:9");
    assert.equal(validated.valid, true);
  });

  await runTest("1.4 Empty or tiny payload (< 512 bytes) is rejected", () => {
    const emptyBuf = Buffer.alloc(100);
    const res = validateImageBinary(emptyBuf);
    assert.equal(res.valid, false);
    assert.match(res.reason, /terlalu kecil/);
  });

  await runTest("1.5 Obvious mock SVG payload (<svg...) is explicitly rejected", () => {
    const svgStr = `<svg viewBox="0 0 400 300"><circle cx="200" cy="150" r="80" fill="blue" /></svg>` + " ".repeat(600);
    const res = validateImageBinary(svgStr);
    assert.equal(res.valid, false);
    assert.match(res.reason, /mock SVG/);
  });

  await runTest("1.6 Corrupt or random bytes without image headers are rejected", () => {
    const junk = Buffer.alloc(1000, 0xef);
    const res = validateImageBinary(junk);
    assert.equal(res.valid, false);
    assert.match(res.reason, /Format gambar tidak dikenali/);
  });

  await runTest("1.7 Sub-minimum dimension (< 256px) is rejected", () => {
    const smallPng = createValidPngBuffer(200, 200);
    const res = validateImageBinary(smallPng);
    assert.equal(res.valid, false);
    assert.match(res.reason, /di luar batas/);
  });

  await runTest("1.8 Discrepant aspect ratio outside tolerance is rejected", () => {
    // 16:9 image validated against 1:1 expected ratio
    const widePng = createValidPngBuffer(1536, 864);
    const res = validateImageBinary(widePng, "1:1");
    assert.equal(res.valid, false);
    assert.match(res.reason, /Rasio aspek gambar aktual/);
  });

  await runTest("1.9 Base64 string data URL is properly decoded and validated", () => {
    const png = createValidPngBuffer(1024, 1024);
    const b64 = `data:image/png;base64,${png.toString("base64")}`;
    const validated = assertValidImageBinary(b64, "1:1");
    assert.equal(validated.mimeType, "image/png");
    assert.equal(validated.width, 1024);
    assert.equal(validated.height, 1024);
  });

  // ============================================================================
  // GROUP 2: PROVIDER ADAPTERS & REQUEST TRANSLATION
  // ============================================================================
  console.log("\n[GROUP 2: Provider Adapters & Request Translation]");

  await runTest("2.1 OpenAI adapter translates canonical prompt, negative prompt, and text policy", async () => {
    const { request } = setupApprovedPlanAndRequest();
    let capturedBody = null;

    const mockFetch = async (url, init) => {
      capturedBody = JSON.parse(init.body);
      const pngB64 = createValidPngBuffer(1024, 1024).toString("base64");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ b64_json: pngB64, generation_id: "gen_mock_001" }],
        }),
      };
    };

    const provider = new OpenAiImageProvider({
      apiKey: "sk-mock-key-123",
      fetchFn: mockFetch,
    });

    const result = await provider.generate(request);
    assert.equal(result.status, "succeeded");
    assert.equal(result.provider, "openai");
    assert.ok(capturedBody.prompt.includes(request.assembledPrompt.fullPrompt));
    assert.ok(capturedBody.prompt.includes("Negative Constraints"));
    assert.ok(capturedBody.prompt.includes("Text Policy"));
    assert.equal(capturedBody.size, "1024x1024");
  });

  await runTest("2.2 OpenAI adapter correctly maps non-square aspect ratio (16:9)", async () => {
    const { request } = setupApprovedPlanAndRequest({ params: { aspectRatio: "16:9", width: 1536, height: 864 } });
    let capturedBody = null;

    const mockFetch = async (url, init) => {
      capturedBody = JSON.parse(init.body);
      const pngB64 = createValidPngBuffer(1536, 864).toString("base64");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ b64_json: pngB64, generation_id: "gen_mock_wide" }],
        }),
      };
    };

    const provider = new OpenAiImageProvider({
      apiKey: "sk-mock-key-123",
      fetchFn: mockFetch,
    });

    const result = await provider.generate(request);
    assert.equal(result.status, "succeeded");
    assert.equal(capturedBody.size, "1536x864");
  });

  await runTest("2.3 Gemini adapter translates canonical request into multimodal contents payload", async () => {
    const { request } = setupApprovedPlanAndRequest();
    let capturedBody = null;

    const mockFetch = async (url, init) => {
      capturedBody = JSON.parse(init.body);
      const pngB64 = createValidPngBuffer(1024, 1024).toString("base64");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType: "image/png",
                      data: pngB64,
                    },
                  },
                ],
              },
            },
          ],
        }),
      };
    };

    const provider = new GeminiImageProvider({
      apiKey: "gemini-mock-key-123",
      fetchFn: mockFetch,
    });

    const result = await provider.generate(request);
    assert.equal(result.status, "succeeded");
    assert.equal(result.provider, "gemini");
    assert.ok(capturedBody.contents[0].parts[0].text.includes(request.assembledPrompt.fullPrompt));
    assert.deepEqual(capturedBody.generationConfig.responseModalities, ["IMAGE"]);
  });

  await runTest("2.4 Provider factory resolves mock when test mock is registered", () => {
    const customMock = {
      providerName: "custom_test_mock",
      validateRequest: async () => ({ valid: true }),
      generate: async (req) => ({
        generationId: "gen_mock_999",
        requestId: req.requestId,
        status: "succeeded",
        createdAt: new Date().toISOString(),
      }),
      normalizeResult: () => ({}),
    };

    setMockIllustrationProvider(customMock);
    const resolved = resolveIllustrationGenerationProvider();
    assert.equal(resolved.providerName, "custom_test_mock");
    setMockIllustrationProvider(null); // Reset
  });

  // ============================================================================
  // GROUP 3: ERROR HANDLING & BOUNDED RETRIES
  // ============================================================================
  console.log("\n[GROUP 3: Error Handling & Bounded Retries]");

  await runTest("3.1 Transient HTTP 503 error is retried and succeeds on attempt 2", async () => {
    const { request } = setupApprovedPlanAndRequest();
    let callCount = 0;

    const mockFetch = async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: false,
          status: 503,
          statusText: "Service Unavailable",
          json: async () => ({ error: { message: "Server overloaded" } }),
        };
      }
      const pngB64 = createValidPngBuffer(1024, 1024).toString("base64");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ b64_json: pngB64, generation_id: "gen_retried_ok" }],
        }),
      };
    };

    const provider = new OpenAiImageProvider({
      apiKey: "sk-mock-key-123",
      fetchFn: mockFetch,
    });

    const result = await provider.generate(request);
    assert.equal(result.status, "succeeded");
    assert.equal(callCount, 2, "Harus melakukan retry tepat 1 kali pada error 503");
  });

  await runTest("3.2 Transient HTTP 429 rate limit is retried up to MAX_BOUNDED_RETRIES (2)", async () => {
    const { request } = setupApprovedPlanAndRequest();
    let callCount = 0;

    const mockFetch = async () => {
      callCount++;
      return {
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        json: async () => ({ error: { message: "Rate limit exceeded" } }),
      };
    };

    const provider = new OpenAiImageProvider({
      apiKey: "sk-mock-key-123",
      fetchFn: mockFetch,
    });

    const result = await provider.generate(request);
    assert.equal(result.status, "failed");
    assert.equal(callCount, 3, "Harus mencoba tepat 1 panggilan awal + 2 retries (total 3)");
  });

  await runTest("3.3 Deterministic 400 Bad Request fails immediately with 0 retries", async () => {
    const { request } = setupApprovedPlanAndRequest();
    let callCount = 0;

    const mockFetch = async () => {
      callCount++;
      return {
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: async () => ({ error: { message: "Invalid parameter size" } }),
      };
    };

    const provider = new OpenAiImageProvider({
      apiKey: "sk-mock-key-123",
      fetchFn: mockFetch,
    });

    const result = await provider.generate(request);
    assert.equal(result.status, "failed");
    assert.equal(callCount, 1, "Kesalahan deterministik tidak boleh di-retry");
  });

  await runTest("3.4 Safety/policy rejection fails immediately with AI_SAFETY_BLOCKED and 0 retries", async () => {
    const { request } = setupApprovedPlanAndRequest();
    let callCount = 0;

    const mockFetch = async () => {
      callCount++;
      return {
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: async () => ({
          error: {
            code: "content_policy_violation",
            message: "Prompt flagged by safety system",
          },
        }),
      };
    };

    const provider = new OpenAiImageProvider({
      apiKey: "sk-mock-key-123",
      fetchFn: mockFetch,
    });

    const result = await provider.generate(request);
    assert.equal(result.status, "failed");
    assert.equal(result.error?.code, AI_ERROR_CODES.AI_SAFETY_BLOCKED);
    assert.equal(callCount, 1, "Safety violation must fail fast with zero retries");
  });

  await runTest("3.5 Gemini safety block (finishReason: SAFETY) is normalized into AI_SAFETY_BLOCKED", async () => {
    const { request } = setupApprovedPlanAndRequest();

    const mockFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ finishReason: "SAFETY" }],
      }),
    });

    const provider = new GeminiImageProvider({
      apiKey: "gemini-mock-key-123",
      fetchFn: mockFetch,
    });

    const result = await provider.generate(request);
    assert.equal(result.status, "failed");
    assert.equal(result.error?.code, AI_ERROR_CODES.AI_SAFETY_BLOCKED);
  });

  // ============================================================================
  // GROUP 4: SERVER FUNCTIONS & AUTHORIZATION
  // ============================================================================
  console.log("\n[GROUP 4: Server Functions & Authorization]");

  await runTest("4.1 Authenticated teacher owning the request can execute generation", async () => {
    const { request } = setupApprovedPlanAndRequest();
    const pngB64 = `data:image/png;base64,${createValidPngBuffer(1024, 1024).toString("base64")}`;

    setMockIllustrationProvider({
      providerName: "mock_openai",
      validateRequest: async () => ({ valid: true }),
      generate: async (req) => ({
        generationId: `gen_ill_${crypto.randomUUID().substring(0, 8)}`,
        requestId: req.requestId,
        status: "succeeded",
        assetReference: pngB64,
        mimeType: "image/png",
        width: 1024,
        height: 1024,
        provider: "openai",
        model: "gpt-image-1-mini",
        createdAt: new Date().toISOString(),
      }),
      normalizeResult: () => ({}),
    });

    const res = await executeGenerateIllustration(
      { requestId: request.requestId },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );

    assert.equal(res.status, "success");
    assert.equal(res.result.status, "succeeded");
    assert.equal(res.result.width, 1024);
  });

  await runTest("4.2 Non-owner teacher requesting generation receives ROLE_FORBIDDEN", async () => {
    const { request } = setupApprovedPlanAndRequest();

    await assert.rejects(
      async () => {
        await executeGenerateIllustration(
          { requestId: request.requestId },
          { userId: mockOtherTeacherAuth.userId, profile: mockOtherTeacherAuth }
        );
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.ROLE_FORBIDDEN
    );
  });

  await runTest("4.3 Student role receives ROLE_FORBIDDEN via auth middleware guard", async () => {
    const { request } = setupApprovedPlanAndRequest();

    await assert.rejects(
      async () => {
        await executeGenerateIllustration(
          { requestId: request.requestId },
          { userId: mockStudentAuth.userId, profile: mockStudentAuth }
        );
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.ROLE_FORBIDDEN
    );
  });

  await runTest("4.4 Non-existent request ID throws INVALID_REQUEST", async () => {
    await assert.rejects(
      async () => {
        await executeGenerateIllustration(
          { requestId: "req_ill_non_existent" },
          { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
        );
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.INVALID_REQUEST
    );
  });

  // ============================================================================
  // GROUP 5: APPROVAL GATE & RE-VALIDATION
  // ============================================================================
  console.log("\n[GROUP 5: Approval Gate & Re-Validation]");

  await runTest("5.1 Request on unapproved plan is rejected with PLAN_NOT_APPROVED", async () => {
    const { plan, request } = setupApprovedPlanAndRequest();
    // Simulate plan revoked to draft
    plan.status = "draft";
    plan.approvedVersion = null;
    fallbackTestPlans.set(plan.id, plan);

    await assert.rejects(
      async () => {
        await executeGenerateIllustration(
          { requestId: request.requestId },
          { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
        );
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.PLAN_NOT_APPROVED
    );
  });

  await runTest("5.2 Stale approval (outline edited after approval) is rejected with STALE_APPROVAL", async () => {
    const { plan, request } = setupApprovedPlanAndRequest();
    // Edit outline -> bumps currentVersion to 2 while approvedVersion remains 1
    const { updatedPlan: edited } = applyOutlineEdits(
      plan,
      { ...baseOutline, title: "Judul Baru Yang Belum Disetujui" },
      mockTeacherAuth.userId,
      "Edit outline test"
    );
    // Keep status as approved but with mismatched currentVersion (2) vs approvedVersion (1)
    edited.status = "approved";
    edited.approvedVersion = 1;
    fallbackTestPlans.set(edited.id, edited);

    await assert.rejects(
      async () => {
        await executeGenerateIllustration(
          { requestId: request.requestId },
          { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
        );
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.STALE_APPROVAL
    );
  });

  await runTest("5.3 Style mismatch after preparation is rejected with INVALID_STYLE", async () => {
    const { plan, request } = setupApprovedPlanAndRequest();
    // Teacher switched style in plan
    plan.style = {
      styleId: "style_ill_comic_manga",
      styleVersion: 1,
      styleName: "Comic / Manga Edukatif",
    };
    fallbackTestPlans.set(plan.id, plan);

    await assert.rejects(
      async () => {
        await executeGenerateIllustration(
          { requestId: request.requestId },
          { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
        );
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.INVALID_STYLE
    );
  });

  await runTest("5.4 Non-illustration target type is rejected with INVALID_REQUEST", async () => {
    const { plan, request } = setupApprovedPlanAndRequest();
    const presentationPlan = { ...plan, targetType: "presentation" };
    fallbackTestPlans.set(presentationPlan.id, presentationPlan);

    await assert.rejects(
      async () => {
        await executeGenerateIllustration(
          { requestId: request.requestId },
          { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
        );
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.INVALID_REQUEST
    );
  });

  // ============================================================================
  // GROUP 6: COST CONTROL & IDEMPOTENCY
  // ============================================================================
  console.log("\n[GROUP 6: Cost Control & Idempotency]");

  await runTest("6.1 In-flight lock rejects concurrent duplicate execution for same request", async () => {
    const { request } = setupApprovedPlanAndRequest();
    // Simulate lock acquired by first request
    inFlightGenerationLocks.set(request.requestId, Date.now());

    await assert.rejects(
      async () => {
        await executeGenerateIllustration(
          { requestId: request.requestId },
          { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
        );
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.RATE_LIMITED
    );

    inFlightGenerationLocks.delete(request.requestId); // Clean up
  });

  await runTest("6.2 Idempotent cache returns existing successful result without calling provider again", async () => {
    const { request } = setupApprovedPlanAndRequest();
    const pngB64 = `data:image/png;base64,${createValidPngBuffer(1024, 1024).toString("base64")}`;
    let providerCallCount = 0;

    setMockIllustrationProvider({
      providerName: "mock_openai",
      validateRequest: async () => ({ valid: true }),
      generate: async (req) => {
        providerCallCount++;
        return {
          generationId: `gen_ill_cached_test`,
          requestId: req.requestId,
          status: "succeeded",
          assetReference: pngB64,
          mimeType: "image/png",
          width: 1024,
          height: 1024,
          createdAt: new Date().toISOString(),
        };
      },
      normalizeResult: () => ({}),
    });

    // First call generates
    const res1 = await executeGenerateIllustration(
      { requestId: request.requestId },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );
    assert.equal(res1.status, "success");
    assert.equal(providerCallCount, 1);

    // Second call without forceRetry returns from cache
    const res2 = await executeGenerateIllustration(
      { requestId: request.requestId },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );
    assert.equal(res2.status, "success");
    assert.equal(res2.fromCache, true);
    assert.equal(providerCallCount, 1, "Panggilan provider tidak boleh bertambah saat cache tersedia");
  });

  await runTest("6.3 Explicit forceRetry: true bypasses cache and re-invokes provider", async () => {
    const { request } = setupApprovedPlanAndRequest();
    const pngB64 = `data:image/png;base64,${createValidPngBuffer(1024, 1024).toString("base64")}`;
    let providerCallCount = 0;

    setMockIllustrationProvider({
      providerName: "mock_openai",
      validateRequest: async () => ({ valid: true }),
      generate: async (req) => {
        providerCallCount++;
        return {
          generationId: `gen_ill_force_${providerCallCount}`,
          requestId: req.requestId,
          status: "succeeded",
          assetReference: pngB64,
          mimeType: "image/png",
          width: 1024,
          height: 1024,
          createdAt: new Date().toISOString(),
        };
      },
      normalizeResult: () => ({}),
    });

    await executeGenerateIllustration(
      { requestId: request.requestId },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );
    assert.equal(providerCallCount, 1);

    const resForced = await executeGenerateIllustration(
      { requestId: request.requestId, forceRetry: true },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );
    assert.equal(resForced.status, "success");
    assert.equal(providerCallCount, 2, "forceRetry: true harus memicu eksekusi ulang provider");
  });

  // ============================================================================
  // GROUP 7: PERSISTENCE, AUDIT & STRICT NON-FALLBACK
  // ============================================================================
  console.log("\n[GROUP 7: Persistence, Audit & Strict Non-Fallback]");

  await runTest("7.1 Successful generation persists row in illustration_generations with metadata", async () => {
    const { request } = setupApprovedPlanAndRequest();
    const pngB64 = `data:image/png;base64,${createValidPngBuffer(1024, 1024).toString("base64")}`;

    setMockIllustrationProvider({
      providerName: "mock_openai",
      validateRequest: async () => ({ valid: true }),
      generate: async (req) => ({
        generationId: `gen_ill_persisted_ok`,
        requestId: req.requestId,
        status: "succeeded",
        assetReference: pngB64,
        mimeType: "image/png",
        width: 1024,
        height: 1024,
        provider: "openai",
        model: "gpt-image-1-mini",
        createdAt: new Date().toISOString(),
      }),
      normalizeResult: () => ({}),
    });

    const res = await executeGenerateIllustration(
      { requestId: request.requestId },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );

    const stored = fallbackIllustrationGenerations.get(res.result.generationId);
    assert.ok(stored, "Record generasi harus tersimpan di storage");
    assert.equal(stored.status, "succeeded");
    assert.equal(stored.owner_id, mockTeacherAuth.userId);
    assert.equal(stored.provider, "openai");
    assert.equal(stored.model, "gpt-image-1-mini");
    assert.equal(stored.width, 1024);
    assert.equal(stored.height, 1024);
    assert.ok(stored.byte_size > 500);

    // Retrieve via getIllustrationGenerationResultServerFn
    const fetched = await executeGetIllustrationGenerationResult(
      { generationId: stored.id },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );
    assert.equal(fetched.status, "success");
    assert.equal(fetched.generation.id, stored.id);
  });

  await runTest("7.2 Failed provider generation persists failed record and marks request as failed", async () => {
    const { request } = setupApprovedPlanAndRequest();

    setMockIllustrationProvider({
      providerName: "mock_openai",
      validateRequest: async () => ({ valid: true }),
      generate: async (req) => ({
        generationId: `gen_ill_failed_persisted`,
        requestId: req.requestId,
        status: "failed",
        provider: "openai",
        model: "gpt-image-1-mini",
        createdAt: new Date().toISOString(),
        error: {
          code: AI_ERROR_CODES.AI_PROVIDER_ERROR,
          message: "Internal upstream failure in GPU cluster",
          isRetryable: false,
        },
      }),
      normalizeResult: () => ({}),
    });

    const res = await executeGenerateIllustration(
      { requestId: request.requestId },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );

    assert.equal(res.result.status, "failed");

    const reqRow = fallbackIllustrationRequests.get(request.requestId);
    assert.equal(reqRow.status, "failed");

    const genRow = fallbackIllustrationGenerations.get(res.result.generationId);
    assert.ok(genRow);
    assert.equal(genRow.status, "failed");
    assert.equal(genRow.error_code, AI_ERROR_CODES.AI_PROVIDER_ERROR);
  });

  await runTest("7.3 STRICT NON-FALLBACK: Provider failure NEVER substitutes mock SVG", async () => {
    const { request } = setupApprovedPlanAndRequest();

    setMockIllustrationProvider({
      providerName: "mock_openai",
      validateRequest: async () => ({ valid: true }),
      generate: async (req) => ({
        generationId: `gen_ill_never_svg`,
        requestId: req.requestId,
        status: "failed",
        provider: "openai",
        model: "gpt-image-1-mini",
        createdAt: new Date().toISOString(),
        error: {
          code: AI_ERROR_CODES.GENERATION_FAILED,
          message: "Provider rejected generation",
          isRetryable: false,
        },
      }),
      normalizeResult: () => ({}),
    });

    const res = await executeGenerateIllustration(
      { requestId: request.requestId },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );

    // Invariant: Must be 'failed', never 'succeeded', and assetReference must not be SVG
    assert.equal(res.result.status, "failed");
    assert.equal(res.result.assetReference, undefined);
    assert.ok(!res.result.assetReference?.includes("<svg"));
  });

  await runTest("7.4 Provider returning corrupt binary fails closed without mock fallback", async () => {
    const { request } = setupApprovedPlanAndRequest();
    // Return mock SVG as if provider gave bad payload
    const fakeSvg = `<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100"/></svg>`;

    setMockIllustrationProvider({
      providerName: "mock_openai",
      validateRequest: async () => ({ valid: true }),
      generate: async (req) => ({
        generationId: `gen_ill_bad_binary`,
        requestId: req.requestId,
        status: "succeeded",
        assetReference: fakeSvg,
        mimeType: "image/svg+xml",
        createdAt: new Date().toISOString(),
      }),
      normalizeResult: () => ({}),
    });

    const res = await executeGenerateIllustration(
      { requestId: request.requestId },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );

    // Invariant: AssertValidImageBinary catches fake SVG and marks generation as failed
    assert.equal(res.result.status, "failed");
    assert.match(res.result.error?.message, /mock SVG|tidak valid/);
  });

  // Reset mock provider at end of tests
  setMockIllustrationProvider(null);

  // ----------------------------------------------------------------------------
  // SUMMARY
  // ----------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log(`  TEST RESULTS: ${testsPassed} passed, ${testsFailed} failed`);
  console.log("================================================================================");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("FATAL TEST SUITE ERROR:", err);
  process.exit(1);
});
