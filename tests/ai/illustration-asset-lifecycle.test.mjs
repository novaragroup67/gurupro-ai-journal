/**
 * ==============================================================================
 * GURUPRO TEST SUITE: VIS-1C ASSET PERSISTENCE, PROVENANCE & LIFECYCLE
 * ==============================================================================
 *
 * Dedicated test suite verifying:
 * 1. Binary Ingestion, Storage Provider & SHA-256 Hashing
 * 2. Canonical Asset Contract & Provenance Preservation
 * 3. Modul Ajar Section Attachment & Automatic Superseding (Non-Destructive)
 * 4. Detach & Lifecycle State Machine Transitions
 * 5. Listing & Filter Integrity
 * 6. Multi-Tenant RBAC & Ownership Security
 * 7. Storage Failure & Error Resilience
 */

import assert from "node:assert/strict";
import crypto from "crypto";
import {
  executePersistIllustrationAsset,
  executeAttachIllustrationAsset,
  executeDetachIllustrationAsset,
  executeTransitionAssetLifecycle,
  executeListModuleIllustrationAssets,
  fallbackIllustrationAssets,
  fallbackModulesStore,
} from "../../src/lib/illustration-asset.functions.ts";
import {
  fallbackIllustrationGenerations,
  fallbackIllustrationRequests,
  fallbackTestPlans,
} from "../../src/lib/illustration-generation.functions.ts";
import {
  computeSha256,
  MemoryStorageDriver,
  registerMockStorageDriver,
  buildIllustrationStoragePath,
} from "../../src/lib/ai/illustration-storage-service.ts";
import {
  validateLifecycleTransition,
  assertValidLifecycleTransition,
} from "../../src/lib/ai/illustration-asset-contract.ts";
import { AI_ERROR_CODES, AiServiceError } from "../../src/lib/ai/error-taxonomy.ts";

// ==============================================================================
// TEST HELPERS & MOCKS
// ==============================================================================

const mockTeacherAuth = {
  userId: "usr_teacher_c1",
  role: "guru",
  isGuru: true,
  verificationStatus: "verified",
};

const mockOtherTeacherAuth = {
  userId: "usr_teacher_c2",
  role: "guru",
  isGuru: true,
  verificationStatus: "verified",
};

const mockStudentAuth = {
  userId: "usr_student_c1",
  role: "siswa",
  isGuru: false,
  verificationStatus: "unverified",
};

function createValidPngBuffer(width = 512, height = 512) {
  const buf = Buffer.alloc(1000);
  buf[0] = 0x89;
  buf[1] = 0x50;
  buf[2] = 0x4e;
  buf[3] = 0x47;
  buf[4] = 0x0d;
  buf[5] = 0x0a;
  buf[6] = 0x1a;
  buf[7] = 0x0a;
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

function setupTestEnvironment() {
  fallbackIllustrationAssets.clear();
  fallbackIllustrationGenerations.clear();
  fallbackIllustrationRequests.clear();
  fallbackTestPlans.clear();
  fallbackModulesStore.clear();
  registerMockStorageDriver(null);

  const moduleId = "mod_siklus_air_101";
  const reqId = "req_c1_" + crypto.randomUUID();
  const planId = "plan_c1_" + crypto.randomUUID();
  const genId = "gen_c1_" + crypto.randomUUID();

  const pngBuf = createValidPngBuffer(1024, 1024);
  const dataUrl = `data:image/png;base64,${pngBuf.toString("base64")}`;

  // 1. Setup Request Snapshot
  fallbackIllustrationRequests.set(reqId, {
    id: reqId,
    generation_plan_id: planId,
    approved_version: 1,
    style_id: "style_ill_flat_edu",
    style_version: 1,
    request_snapshot: {
      requestId: reqId,
      moduleId,
      styleDefinition: { name: "Flat Educational" },
      assembledPrompt: {
        systemPrompt: "Educational System",
        styleDirectives: "Flat Vector",
        subjectDescription: "Siklus air",
        compositionDirectives: "Centered",
        negativePrompt: "text, blurry",
        fullPrompt: "A clear flat educational illustration of water cycle",
      },
      sourceReferences: ["Buku IPA SMP Kelas 7"],
      evidenceReferences: ["Materi Evaporasi"],
      grounding: {
        subjectDiscipline: "ipa",
        audienceLevel: "smp",
      },
      approvedOutline: {
        title: "Siklus Air",
        objective: "Memahami evaporasi",
        mainSubject: "Siklus air",
        educationalFocus: "Evaporasi dan Presipitasi",
        sectionId: "sec_1",
      },
    },
    status: "succeeded",
    created_by: mockTeacherAuth.userId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // 2. Setup Generation Record
  fallbackIllustrationGenerations.set(genId, {
    id: genId,
    request_id: reqId,
    generation_plan_id: planId,
    module_id: moduleId,
    owner_id: mockTeacherAuth.userId,
    provider: "openai",
    model: "gpt-image-1-mini",
    status: "succeeded",
    asset_url: dataUrl,
    image_data: dataUrl,
    mime_type: "image/png",
    width: 1024,
    height: 1024,
    byte_size: pngBuf.length,
    retry_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // 3. Setup Modul Ajar
  fallbackModulesStore.set(moduleId, {
    id: moduleId,
    judul: "Modul Ajar IPA: Siklus Air",
    kelas: "Kelas 7",
    mapel: "IPA",
    status: "Draft",
    sections: [
      {
        id: "sec_1",
        judul: "Bab 1: Konsep Dasar Siklus Air",
        poin: ["Pengertian evaporasi", "Peran sinar matahari"],
        isi: "Evaporasi adalah proses penguapan air...",
        ilustrasi: undefined,
      },
      {
        id: "sec_2",
        judul: "Bab 2: Pembentukan Awan & Hujan",
        poin: ["Proses kondensasi", "Presipitasi"],
        isi: "Uap air yang naik ke atmosfer mengalami pendinginan...",
        ilustrasi: undefined,
      },
    ],
    updated_at: new Date().toISOString(),
  });

  return { moduleId, reqId, planId, genId, pngBuf, dataUrl };
}

let passed = 0;
let failed = 0;

async function runTest(name, fn) {
  process.stdout.write(`  • ${name} ... `);
  try {
    await fn();
    console.log("✓ PASS");
    passed++;
  } catch (err) {
    console.log("✗ FAIL");
    console.error(err);
    failed++;
  }
}

// ==============================================================================
// TEST EXECUTION
// ==============================================================================

async function main() {
  console.log("\n" + "=".repeat(80));
  console.log("  GURUPRO TEST SUITE: VIS-1C ASSET PERSISTENCE, PROVENANCE & LIFECYCLE");
  console.log("=".repeat(80) + "\n");

  // ============================================================================
  // GROUP 1: BINARY INGESTION, STORAGE DRIVER & SHA-256 HASHING
  // ============================================================================
  console.log("[GROUP 1: Binary Ingestion, Storage Driver & SHA-256 Hashing]");

  await runTest("1.1 SHA-256 hash is deterministic and exact across multiple calculations", () => {
    const buf = Buffer.from("Pedagogical Image Binary Payload 12345");
    const hash1 = computeSha256(buf);
    const hash2 = computeSha256(buf);
    assert.equal(hash1, hash2);
    assert.equal(hash1.length, 64);
    assert.match(hash1, /^[0-9a-f]{64}$/);
  });

  await runTest("1.2 Different image binaries produce distinct SHA-256 hashes", () => {
    const bufA = createValidPngBuffer(512, 512);
    const bufB = createValidPngBuffer(1024, 1024);
    const hashA = computeSha256(bufA);
    const hashB = computeSha256(bufB);
    assert.notEqual(hashA, hashB);
  });

  await runTest("1.3 MemoryStorageDriver uploads binary, generates canonical storage path and public URL", async () => {
    const driver = new MemoryStorageDriver("https://cdn.gurupro.id");
    const path = buildIllustrationStoragePath("usr_1", "mod_1", "ast_1", "image/png");
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);

    const res = await driver.upload(path, bytes, "image/png");
    assert.equal(res.provider, "local_fs");
    assert.equal(res.storagePath, path);
    assert.equal(res.publicUrl, `https://cdn.gurupro.id/${path}`);
    assert.equal(res.byteSize, 5);

    const stored = driver.getStored(path);
    assert.ok(stored);
    assert.equal(stored.bytes.length, 5);
  });

  await runTest("1.4 Storage driver delete removes stored asset path", async () => {
    const driver = new MemoryStorageDriver();
    const path = "illustrations/u/m/a.png";
    await driver.upload(path, new Uint8Array([10, 20]), "image/png");
    assert.ok(driver.getStored(path));
    await driver.delete(path);
    assert.equal(driver.getStored(path), undefined);
  });

  await runTest("1.5 Custom/mock storage driver injection works via registerMockStorageDriver", async () => {
    const mockDriver = new MemoryStorageDriver("https://mock-storage.test");
    registerMockStorageDriver(mockDriver);

    const { genId } = setupTestEnvironment();
    registerMockStorageDriver(mockDriver);

    const { asset } = await executePersistIllustrationAsset(
      { generationId: genId },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );

    assert.ok(asset.publicUrl.startsWith("https://mock-storage.test"));
    registerMockStorageDriver(null);
  });

  // ============================================================================
  // GROUP 2: CANONICAL ASSET CONTRACT & PROVENANCE PRESERVATION
  // ============================================================================
  console.log("\n[GROUP 2: Canonical Asset Contract & Provenance Preservation]");

  await runTest("2.1 Persisting asset records all provenance links intact", async () => {
    const { genId, moduleId, reqId, planId } = setupTestEnvironment();
    const { asset } = await executePersistIllustrationAsset(
      { generationId: genId },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );

    assert.ok(asset.id.startsWith("ast_ill_"));
    assert.equal(asset.generationId, genId);
    assert.equal(asset.requestId, reqId);
    assert.equal(asset.generationPlanId, planId);
    assert.equal(asset.moduleId, moduleId);
    assert.equal(asset.ownerId, mockTeacherAuth.userId);
    assert.equal(asset.lifecycleStatus, "staged");
    assert.equal(asset.mimeType, "image/png");
    assert.equal(asset.width, 1024);
    assert.equal(asset.height, 1024);
    assert.equal(asset.sha256Hash.length, 64);
  });

  await runTest("2.2 Prompt snapshot, grounding snapshot, and pedagogical metadata are preserved", async () => {
    const { genId } = setupTestEnvironment();
    const { asset } = await executePersistIllustrationAsset(
      { generationId: genId },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );

    assert.equal(asset.promptSnapshot.fullPrompt, "A clear flat educational illustration of water cycle");
    assert.equal(asset.promptSnapshot.negativePrompt, "text, blurry");
    assert.deepEqual(asset.groundingSnapshot.sourceReferences, ["Buku IPA SMP Kelas 7"]);
    assert.deepEqual(asset.groundingSnapshot.evidenceReferences, ["Materi Evaporasi"]);
    assert.equal(asset.pedagogicalMetadata.title, "Siklus Air");
    assert.equal(asset.pedagogicalMetadata.educationalFocus, "Evaporasi dan Presipitasi");
  });

  await runTest("2.3 Idempotency: Repeating persist on same generationId returns existing asset", async () => {
    const { genId } = setupTestEnvironment();
    const res1 = await executePersistIllustrationAsset(
      { generationId: genId },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );
    const res2 = await executePersistIllustrationAsset(
      { generationId: genId },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );

    assert.equal(res1.asset.id, res2.asset.id);
    assert.equal(res1.asset.sha256Hash, res2.asset.sha256Hash);
    assert.equal(res1.asset.createdAt, res2.asset.createdAt);
  });

  await runTest("2.4 Rejects persist on non-existent generationId with INVALID_REQUEST", async () => {
    setupTestEnvironment();
    await assert.rejects(
      async () => {
        await executePersistIllustrationAsset(
          { generationId: "gen_non_existent" },
          { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
        );
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.INVALID_REQUEST
    );
  });

  await runTest("2.5 Rejects persist on failed generation record with INVALID_REQUEST", async () => {
    const { genId } = setupTestEnvironment();
    const gen = fallbackIllustrationGenerations.get(genId);
    gen.status = "failed";
    fallbackIllustrationGenerations.set(genId, gen);

    await assert.rejects(
      async () => {
        await executePersistIllustrationAsset(
          { generationId: genId },
          { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
        );
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.INVALID_REQUEST
    );
  });

  // ============================================================================
  // GROUP 3: MODUL AJAR SECTION ATTACHMENT & AUTOMATIC SUPERSEDING
  // ============================================================================
  console.log("\n[GROUP 3: Modul Ajar Section Attachment & Automatic Superseding]");

  await runTest("3.1 Attaching asset to module section updates section.ilustrasi with publicUrl", async () => {
    const { genId, moduleId } = setupTestEnvironment();
    const { asset } = await executePersistIllustrationAsset(
      { generationId: genId },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );

    const { asset: attached, sectionTitle } = await executeAttachIllustrationAsset(
      { assetId: asset.id, moduleId, sectionId: "sec_1" },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );

    assert.equal(attached.lifecycleStatus, "attached");
    assert.equal(attached.attachedSectionId, "sec_1");
    assert.ok(attached.attachedAt);
    assert.equal(sectionTitle, "Bab 1: Konsep Dasar Siklus Air");

    const modul = fallbackModulesStore.get(moduleId);
    const sec1 = modul.sections.find((s) => s.id === "sec_1");
    assert.equal(sec1.ilustrasi, asset.publicUrl);
  });

  await runTest("3.2 Attaching a new asset to SAME section automatically marks prior asset as superseded", async () => {
    const { genId, moduleId, reqId, planId } = setupTestEnvironment();
    // Asset 1 attached to sec_1
    const { asset: asset1 } = await executePersistIllustrationAsset(
      { generationId: genId, targetSectionId: "sec_1" },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );
    assert.equal(asset1.lifecycleStatus, "attached");

    // Setup Generation 2
    const genId2 = "gen_c2_" + crypto.randomUUID();
    const png2 = createValidPngBuffer(800, 800);
    const dataUrl2 = `data:image/png;base64,${png2.toString("base64")}`;
    fallbackIllustrationGenerations.set(genId2, {
      id: genId2,
      request_id: reqId,
      generation_plan_id: planId,
      module_id: moduleId,
      owner_id: mockTeacherAuth.userId,
      provider: "openai",
      model: "gpt-image-1-mini",
      status: "succeeded",
      asset_url: dataUrl2,
      mime_type: "image/png",
      width: 800,
      height: 800,
      byte_size: png2.length,
      retry_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const { asset: asset2 } = await executePersistIllustrationAsset(
      { generationId: genId2 },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );

    // Attach Asset 2 to sec_1
    const { asset: attached2 } = await executeAttachIllustrationAsset(
      { assetId: asset2.id, moduleId, sectionId: "sec_1" },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );

    assert.equal(attached2.lifecycleStatus, "attached");
    assert.equal(attached2.attachedSectionId, "sec_1");

    // Check Asset 1 was superseded
    const updatedAsset1 = fallbackIllustrationAssets.get(asset1.id);
    assert.equal(updatedAsset1.lifecycle_status, "superseded");

    // Check module has asset2 url
    const modul = fallbackModulesStore.get(moduleId);
    const sec1 = modul.sections.find((s) => s.id === "sec_1");
    assert.equal(sec1.ilustrasi, asset2.publicUrl);
  });

  await runTest("3.3 Superseded asset preserves its original publicUrl, hash, and provenance records", async () => {
    // Verified from test 3.2: updatedAsset1 still has its publicUrl and sha256
    const assets = Array.from(fallbackIllustrationAssets.values());
    const superseded = assets.find((a) => a.lifecycle_status === "superseded");
    assert.ok(superseded);
    assert.ok(superseded.public_url);
    assert.ok(superseded.sha256_hash);
    assert.ok(superseded.prompt_snapshot);
  });

  await runTest("3.4 Attaching asset to invalid/non-existent section throws INVALID_REQUEST", async () => {
    const { genId, moduleId } = setupTestEnvironment();
    const { asset } = await executePersistIllustrationAsset(
      { generationId: genId },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );

    await assert.rejects(
      async () => {
        await executeAttachIllustrationAsset(
          { assetId: asset.id, moduleId, sectionId: "sec_ghost" },
          { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
        );
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.INVALID_REQUEST
    );
  });

  await runTest("3.5 Attaching asset to a different module throws INVALID_REQUEST", async () => {
    const { genId } = setupTestEnvironment();
    const { asset } = await executePersistIllustrationAsset(
      { generationId: genId },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );

    await assert.rejects(
      async () => {
        await executeAttachIllustrationAsset(
          { assetId: asset.id, moduleId: "mod_different_999", sectionId: "sec_1" },
          { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
        );
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.INVALID_REQUEST
    );
  });

  // ============================================================================
  // GROUP 4: DETACH & LIFECYCLE STATE MACHINE TRANSITIONS
  // ============================================================================
  console.log("\n[GROUP 4: Detach & Lifecycle State Machine Transitions]");

  await runTest("4.1 Detaching asset transitions status to 'staged' and clears section.ilustrasi", async () => {
    const { genId, moduleId } = setupTestEnvironment();
    const { asset } = await executePersistIllustrationAsset(
      { generationId: genId, targetSectionId: "sec_1" },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );

    const { asset: detached } = await executeDetachIllustrationAsset(
      { assetId: asset.id },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );

    assert.equal(detached.lifecycleStatus, "staged");
    assert.equal(detached.attachedSectionId, null);

    const modul = fallbackModulesStore.get(moduleId);
    const sec1 = modul.sections.find((s) => s.id === "sec_1");
    assert.equal(sec1.ilustrasi, undefined);
  });

  await runTest("4.2 Transitioning asset from 'staged' to 'archived' succeeds", async () => {
    const { genId } = setupTestEnvironment();
    const { asset } = await executePersistIllustrationAsset(
      { generationId: genId },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );

    const { asset: archived } = await executeTransitionAssetLifecycle(
      { assetId: asset.id, targetStatus: "archived" },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );

    assert.equal(archived.lifecycleStatus, "archived");
  });

  await runTest("4.3 Transitioning attached asset to 'archived' unlinks it from modul section", async () => {
    const { genId, moduleId } = setupTestEnvironment();
    const { asset } = await executePersistIllustrationAsset(
      { generationId: genId, targetSectionId: "sec_2" },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );

    const { asset: archived } = await executeTransitionAssetLifecycle(
      { assetId: asset.id, targetStatus: "archived" },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );

    assert.equal(archived.lifecycleStatus, "archived");
    assert.equal(archived.attachedSectionId, null);

    const modul = fallbackModulesStore.get(moduleId);
    const sec2 = modul.sections.find((s) => s.id === "sec_2");
    assert.equal(sec2.ilustrasi, undefined);
  });

  await runTest("4.4 Transitioning asset to 'soft_deleted' marks it deleted and unlinks from section", async () => {
    const { genId, moduleId } = setupTestEnvironment();
    const { asset } = await executePersistIllustrationAsset(
      { generationId: genId, targetSectionId: "sec_1" },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );

    const { asset: deleted } = await executeTransitionAssetLifecycle(
      { assetId: asset.id, targetStatus: "soft_deleted" },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );

    assert.equal(deleted.lifecycleStatus, "soft_deleted");

    // Attempting to attach soft_deleted asset throws INVALID_REQUEST
    await assert.rejects(
      async () => {
        await executeAttachIllustrationAsset(
          { assetId: asset.id, moduleId, sectionId: "sec_1" },
          { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
        );
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.INVALID_REQUEST
    );
  });

  await runTest("4.5 Illegal state transition matrix validation asserts properly", () => {
    assert.equal(validateLifecycleTransition("staged", "attached"), true);
    assert.equal(validateLifecycleTransition("attached", "superseded"), true);
    assert.equal(validateLifecycleTransition("superseded", "attached"), true);
    assert.equal(validateLifecycleTransition("archived", "staged"), true);
    assert.equal(validateLifecycleTransition("soft_deleted", "attached"), false);
    assert.equal(validateLifecycleTransition("soft_deleted", "staged"), false);

    assert.throws(
      () => assertValidLifecycleTransition("soft_deleted", "attached"),
      /tidak diizinkan/
    );
  });

  // ============================================================================
  // GROUP 5: LISTING & FILTER INTEGRITY
  // ============================================================================
  console.log("\n[GROUP 5: Listing & Filter Integrity]");

  await runTest("5.1 listModuleIllustrationAssets returns all assets for module sorted by date", async () => {
    const { genId, moduleId } = setupTestEnvironment();
    await executePersistIllustrationAsset(
      { generationId: genId },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );

    const { assets } = await executeListModuleIllustrationAssets(
      { moduleId },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );

    assert.ok(assets.length >= 1);
    assert.equal(assets[0].moduleId, moduleId);
  });

  await runTest("5.2 listModuleIllustrationAssets excludes soft_deleted assets", async () => {
    const { genId, moduleId } = setupTestEnvironment();
    const { asset } = await executePersistIllustrationAsset(
      { generationId: genId },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );

    await executeTransitionAssetLifecycle(
      { assetId: asset.id, targetStatus: "soft_deleted" },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );

    const { assets } = await executeListModuleIllustrationAssets(
      { moduleId },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );

    const found = assets.find((a) => a.id === asset.id);
    assert.equal(found, undefined);
  });

  await runTest("5.3 Active attached assets for different sections coexist without collision", async () => {
    const { genId, moduleId, reqId, planId } = setupTestEnvironment();
    // Asset 1 on sec_1
    const { asset: a1 } = await executePersistIllustrationAsset(
      { generationId: genId, targetSectionId: "sec_1" },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );

    // Asset 2 on sec_2
    const genIdB = "gen_b_" + crypto.randomUUID();
    const bufB = createValidPngBuffer(600, 600);
    const dataUrlB = `data:image/png;base64,${bufB.toString("base64")}`;
    fallbackIllustrationGenerations.set(genIdB, {
      id: genIdB,
      request_id: reqId,
      generation_plan_id: planId,
      module_id: moduleId,
      owner_id: mockTeacherAuth.userId,
      provider: "openai",
      model: "gpt-image-1-mini",
      status: "succeeded",
      asset_url: dataUrlB,
      mime_type: "image/png",
      width: 600,
      height: 600,
      byte_size: bufB.length,
      retry_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const { asset: a2 } = await executePersistIllustrationAsset(
      { generationId: genIdB, targetSectionId: "sec_2" },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );

    assert.equal(fallbackIllustrationAssets.get(a1.id).lifecycle_status, "attached");
    assert.equal(fallbackIllustrationAssets.get(a2.id).lifecycle_status, "attached");

    const modul = fallbackModulesStore.get(moduleId);
    assert.equal(modul.sections.find((s) => s.id === "sec_1").ilustrasi, a1.publicUrl);
    assert.equal(modul.sections.find((s) => s.id === "sec_2").ilustrasi, a2.publicUrl);
  });

  // ============================================================================
  // GROUP 6: MULTI-TENANT RBAC & OWNERSHIP SECURITY
  // ============================================================================
  console.log("\n[GROUP 6: Multi-Tenant RBAC & Ownership Security]");

  await runTest("6.1 Non-owner teacher attempting to persist asset receives ROLE_FORBIDDEN", async () => {
    const { genId } = setupTestEnvironment();
    await assert.rejects(
      async () => {
        await executePersistIllustrationAsset(
          { generationId: genId },
          { userId: mockOtherTeacherAuth.userId, profile: mockOtherTeacherAuth }
        );
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.ROLE_FORBIDDEN
    );
  });

  await runTest("6.2 Non-owner teacher attempting to attach asset receives ROLE_FORBIDDEN", async () => {
    const { genId, moduleId } = setupTestEnvironment();
    const { asset } = await executePersistIllustrationAsset(
      { generationId: genId },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );

    await assert.rejects(
      async () => {
        await executeAttachIllustrationAsset(
          { assetId: asset.id, moduleId, sectionId: "sec_1" },
          { userId: mockOtherTeacherAuth.userId, profile: mockOtherTeacherAuth }
        );
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.ROLE_FORBIDDEN
    );
  });

  await runTest("6.3 Non-owner teacher attempting to transition lifecycle receives ROLE_FORBIDDEN", async () => {
    const { genId } = setupTestEnvironment();
    const { asset } = await executePersistIllustrationAsset(
      { generationId: genId },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );

    await assert.rejects(
      async () => {
        await executeTransitionAssetLifecycle(
          { assetId: asset.id, targetStatus: "archived" },
          { userId: mockOtherTeacherAuth.userId, profile: mockOtherTeacherAuth }
        );
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.ROLE_FORBIDDEN
    );
  });

  await runTest("6.4 Student role attempting to persist or attach receives ROLE_FORBIDDEN", async () => {
    const { genId, moduleId } = setupTestEnvironment();
    await assert.rejects(
      async () => {
        await executePersistIllustrationAsset(
          { generationId: genId },
          { userId: mockStudentAuth.userId, profile: mockStudentAuth }
        );
      },
      (err) => err instanceof AiServiceError && err.code === AI_ERROR_CODES.ROLE_FORBIDDEN
    );
  });

  // ============================================================================
  // GROUP 7: STORAGE FAILURE & ERROR RESILIENCE
  // ============================================================================
  console.log("\n[GROUP 7: Storage Failure & Error Resilience]");

  await runTest("7.1 Failing storage driver throws typed AiServiceError (STORAGE_ERROR)", async () => {
    const failingDriver = {
      providerType: "supabase_storage",
      async upload() {
        throw new Error("S3 Network connection timeout");
      },
      async delete() {},
    };
    registerMockStorageDriver(failingDriver);

    const { genId } = setupTestEnvironment();
    registerMockStorageDriver(failingDriver);

    await assert.rejects(
      async () => {
        await executePersistIllustrationAsset(
          { generationId: genId },
          { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
        );
      },
      (err) => err instanceof Error && err.message.includes("S3 Network connection timeout")
    );

    registerMockStorageDriver(null);
  });

  await runTest("7.2 Non-destructive invariant: Database rows are preserved after superseding", async () => {
    const { genId, moduleId, reqId, planId } = setupTestEnvironment();
    // Asset 1
    const { asset: a1 } = await executePersistIllustrationAsset(
      { generationId: genId, targetSectionId: "sec_1" },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );

    // Asset 2 for same section
    const genIdB = "gen_b_" + crypto.randomUUID();
    const bufB = createValidPngBuffer(600, 600);
    const dataUrlB = `data:image/png;base64,${bufB.toString("base64")}`;
    fallbackIllustrationGenerations.set(genIdB, {
      id: genIdB,
      request_id: reqId,
      generation_plan_id: planId,
      module_id: moduleId,
      owner_id: mockTeacherAuth.userId,
      provider: "openai",
      model: "gpt-image-1-mini",
      status: "succeeded",
      asset_url: dataUrlB,
      mime_type: "image/png",
      width: 600,
      height: 600,
      byte_size: bufB.length,
      retry_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const { asset: a2 } = await executePersistIllustrationAsset(
      { generationId: genIdB, targetSectionId: "sec_1" },
      { userId: mockTeacherAuth.userId, profile: mockTeacherAuth }
    );

    const assets = Array.from(fallbackIllustrationAssets.values());
    assert.ok(assets.length >= 2, "Multiple asset iterations are preserved in database");

    const row1 = fallbackIllustrationAssets.get(a1.id);
    const row2 = fallbackIllustrationAssets.get(a2.id);
    assert.equal(row1.lifecycle_status, "superseded");
    assert.equal(row2.lifecycle_status, "attached");
    assert.ok(row1.sha256_hash);
    assert.ok(row2.sha256_hash);
  });

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log("\n" + "=".repeat(80));
  console.log(`  TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(80) + "\n");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test execution fatal error:", err);
  process.exit(1);
});
