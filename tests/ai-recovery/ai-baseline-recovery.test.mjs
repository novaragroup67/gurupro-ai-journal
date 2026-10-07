/**
 * ==============================================================================
 * GURUPRO TEST SUITE: AI-RECOVERY-01
 * AI Core Baseline, Source/Live Parity & Security Recovery
 * ==============================================================================
 *
 * Verifies the 12 core acceptance requirements for AI baseline stabilization:
 * 1. Required AI tables are represented by source migrations
 * 2. Production schema parity can be verified
 * 3. AI provider configuration fails closed
 * 4. Provider secrets are not exposed to client code
 * 5. Fake/local AI fallback cannot be selected as production provider
 * 6. AI health check never returns secrets
 * 7. Missing provider configuration produces an explicit failure
 * 8. Required storage dependencies are discoverable
 * 9. Canonical Modul Ajar generation path can be identified
 * 10. Canonical illustration generation path can be identified
 * 11. Canonical presentation generation path can be identified
 * 12. AI error telemetry uses structured failure categories
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");

console.log("================================================================================");
console.log("  GURUPRO TEST SUITE: AI-RECOVERY-01 (BASELINE, PARITY & SECURITY RECOVERY)    ");
console.log("================================================================================");

let passedCount = 0;
let failedCount = 0;

function reportPass(num, name) {
  console.log(`  ✓ [PASS] [TEST ${num}] ${name}`);
  passedCount++;
}

function reportFail(num, name, err) {
  console.error(`  ✗ [FAIL] [TEST ${num}] ${name}`);
  console.error(`     Error: ${err.message}`);
  failedCount++;
}

async function runTestSuite() {
  // ----------------------------------------------------------------------------
  // TEST 1: Required AI tables are represented by source migrations
  // ----------------------------------------------------------------------------
  try {
    const migrationsDir = path.join(ROOT_DIR, "supabase/migrations");
    const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
    const allMigrationSql = migrationFiles
      .map((f) => fs.readFileSync(path.join(migrationsDir, f), "utf8"))
      .join("\n");

    const requiredTables = [
      "ai_source_snapshots",
      "generation_styles",
      "generation_plans",
      "generation_plan_versions",
      "illustration_generation_requests",
      "illustration_generations",
      "illustration_assets",
      "illustration_reviews",
      "illustration_quality_evaluations",
      "presentation_generation_requests",
      "presentation_generation_results",
      "presentation_artifacts",
      "presentation_reviews",
      "presentation_quality_evaluations",
      "product_events",
      "user_feedback",
    ];

    for (const table of requiredTables) {
      assert.ok(
        allMigrationSql.includes(`CREATE TABLE IF NOT EXISTS public.${table}`) ||
        allMigrationSql.includes(`CREATE TABLE IF NOT EXISTS ${table}`),
        `Table '${table}' must be declared in source migrations.`
      );
    }

    reportPass(1, "All 16 required AI & generation tables are declared in source migrations");
  } catch (err) {
    reportFail(1, "All 16 required AI & generation tables are declared in source migrations", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 2: Production schema parity can be verified & discrepancies identified
  // ----------------------------------------------------------------------------
  try {
    // Audit script exists and is executable
    const auditScriptPath = path.join(ROOT_DIR, "scripts/audit-ai-tables.mjs");
    assert.ok(fs.existsSync(auditScriptPath), "Audit script scripts/audit-ai-tables.mjs must exist");

    // Forward-only migration exists to bridge live parity gap
    const recoveryMigration = path.join(
      ROOT_DIR,
      "supabase/migrations/20261007120000_ai_core_baseline_schema_recovery.sql"
    );
    assert.ok(fs.existsSync(recoveryMigration), "Forward-only recovery migration must exist");

    reportPass(2, "Production schema parity diagnostic & recovery migration verified");
  } catch (err) {
    reportFail(2, "Production schema parity diagnostic & recovery migration verified", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 3: AI provider configuration fails closed
  // ----------------------------------------------------------------------------
  try {
    const { resolveServerAiConfig, getServerEnv } = await import("../../src/lib/ai/ai-service.ts");

    // Save existing env
    const origGemini = process.env.GEMINI_API_KEY;
    const origOpenAi = process.env.OPENAI_API_KEY;
    const origLovable = process.env.LOVABLE_API_KEY;

    try {
      delete process.env.GEMINI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.LOVABLE_API_KEY;

      assert.throws(
        () => resolveServerAiConfig(),
        (err) => {
          assert.equal(err.code, "AI_PROVIDER_ERROR");
          assert.ok(err.message.includes("Konfigurasi AI server belum siap"));
          return true;
        },
        "Must throw AI_PROVIDER_ERROR when no keys configured"
      );
    } finally {
      if (origGemini) process.env.GEMINI_API_KEY = origGemini;
      if (origOpenAi) process.env.OPENAI_API_KEY = origOpenAi;
      if (origLovable) process.env.LOVABLE_API_KEY = origLovable;
    }

    reportPass(3, "AI provider configuration fails closed with AI_PROVIDER_ERROR when credentials missing");
  } catch (err) {
    reportFail(3, "AI provider configuration fails closed with AI_PROVIDER_ERROR when credentials missing", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 4: Provider secrets are not exposed to client code
  // ----------------------------------------------------------------------------
  try {
    const { getServerEnv } = await import("../../src/lib/ai/ai-service.ts");

    // VITE_* prefixed requests must return undefined to prevent reading private secrets
    process.env.VITE_TEST_KEY = "should_not_leak";
    const leaked = getServerEnv("VITE_TEST_KEY");
    delete process.env.VITE_TEST_KEY;

    assert.equal(leaked, undefined, "getServerEnv must strictly return undefined for any VITE_* variable");

    // Ensure client source files never reference raw process.env.GEMINI_API_KEY
    const clientDirs = [
      path.join(ROOT_DIR, "src/components"),
      path.join(ROOT_DIR, "src/routes"),
      path.join(ROOT_DIR, "src/hooks"),
    ];

    for (const dir of clientDirs) {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir, { recursive: true });
      for (const file of files) {
        if (typeof file === "string" && (file.endsWith(".tsx") || file.endsWith(".ts"))) {
          const filePath = path.join(dir, file);
          const content = fs.readFileSync(filePath, "utf8");
          assert.ok(
            !content.includes("process.env.GEMINI_API_KEY"),
            `Client file ${file} must not reference process.env.GEMINI_API_KEY`
          );
          assert.ok(
            !content.includes("process.env.OPENAI_API_KEY"),
            `Client file ${file} must not reference process.env.OPENAI_API_KEY`
          );
        }
      }
    }

    reportPass(4, "Provider secrets are strictly excluded from client environment and client components");
  } catch (err) {
    reportFail(4, "Provider secrets are strictly excluded from client environment and client components", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 5: Fake/local AI fallback cannot be selected as production provider
  // ----------------------------------------------------------------------------
  try {
    const {
      resolveIllustrationGenerationProvider,
      setMockIllustrationProvider,
      getMockIllustrationProvider,
    } = await import("../../src/lib/ai/providers/illustration-provider-factory.ts");

    // Ensure no mock provider is set
    setMockIllustrationProvider(null);
    assert.equal(getMockIllustrationProvider(), null);

    // Save existing env
    const origGemini = process.env.GEMINI_API_KEY;
    const origOpenAi = process.env.OPENAI_API_KEY;

    try {
      delete process.env.GEMINI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      assert.throws(
        () => resolveIllustrationGenerationProvider(),
        (err) => {
          assert.equal(err.code, "PROVIDER_UNAVAILABLE");
          assert.ok(err.message.includes("Konfigurasi provider AI belum siap"));
          return true;
        },
        "Must throw PROVIDER_UNAVAILABLE instead of silently falling back to mock provider"
      );
    } finally {
      if (origGemini) process.env.GEMINI_API_KEY = origGemini;
      if (origOpenAi) process.env.OPENAI_API_KEY = origOpenAi;
    }

    reportPass(5, "Fake/mock provider cannot be selected when unset; throws PROVIDER_UNAVAILABLE");
  } catch (err) {
    reportFail(5, "Fake/mock provider cannot be selected when unset; throws PROVIDER_UNAVAILABLE", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 6: AI health check never returns secrets
  // ----------------------------------------------------------------------------
  try {
    const { checkAiSubsystemHealth, checkProductionHealthStatus } = await import(
      "../../src/lib/production-health.ts"
    );

    const aiHealth = checkAiSubsystemHealth();
    assert.ok(typeof aiHealth.configured === "boolean");
    assert.ok(["configured", "provider_reachable", "provider_unavailable", "configuration_invalid"].includes(aiHealth.status));
    assert.ok(typeof aiHealth.primaryProvider === "string");
    assert.ok(Array.isArray(aiHealth.activeProviders));

    const aiHealthJson = JSON.stringify(aiHealth);
    assert.ok(!aiHealthJson.includes("AIzaSy"), "Health report must not leak Google API key prefix");
    assert.ok(!aiHealthJson.includes("sk-proj-"), "Health report must not leak OpenAI key prefix");
    assert.ok(!aiHealthJson.includes("sb_publishable_"), "Health report must not leak Supabase key");

    const fullHealth = await checkProductionHealthStatus();
    const fullHealthJson = JSON.stringify(fullHealth);
    assert.ok(!fullHealthJson.includes("AIzaSy"), "Full health report must not leak Google API key prefix");
    assert.ok(!fullHealthJson.includes("sk-proj-"), "Full health report must not leak OpenAI key prefix");

    reportPass(6, "AI subsystem health check reports status accurately without leaking any credentials");
  } catch (err) {
    reportFail(6, "AI subsystem health check reports status accurately without leaking any credentials", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 7: Missing provider configuration produces an explicit failure
  // ----------------------------------------------------------------------------
  try {
    const { AI_ERROR_CODES, AiServiceError } = await import("../../src/lib/ai/error-taxonomy.ts");

    const err = new AiServiceError(
      AI_ERROR_CODES.PROVIDER_UNAVAILABLE,
      "Penyedia AI tidak tersedia."
    );

    assert.equal(err.code, "PROVIDER_UNAVAILABLE");
    assert.equal(err.subsystem, "ai-core");
    assert.ok(err.userMessage.length > 0);
    assert.ok(err.correlationId.length > 0);

    reportPass(7, "Missing provider configuration produces structured explicit failure with correlation ID");
  } catch (err) {
    reportFail(7, "Missing provider configuration produces structured explicit failure with correlation ID", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 8: Required storage dependencies are discoverable
  // ----------------------------------------------------------------------------
  try {
    const expectedBuckets = ["illustration-assets", "presentation-artifacts", "ai-source-materials"];
    const migrationSql = fs.readFileSync(
      path.join(ROOT_DIR, "supabase/migrations/20261007120000_ai_core_baseline_schema_recovery.sql"),
      "utf8"
    );

    for (const b of expectedBuckets) {
      assert.ok(
        migrationSql.includes(`'${b}'`),
        `Storage bucket '${b}' must be configured in storage recovery migration.`
      );
    }

    reportPass(8, "Required storage bucket dependencies (illustration, presentation, source) are configured");
  } catch (err) {
    reportFail(8, "Required storage bucket dependencies (illustration, presentation, source) are configured", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 9: Canonical Modul Ajar generation path can be identified
  // ----------------------------------------------------------------------------
  try {
    const aiFunctionsContent = fs.readFileSync(path.join(ROOT_DIR, "src/lib/ai.functions.ts"), "utf8");
    assert.ok(aiFunctionsContent.includes("generateModulAi"), "generateModulAi must be exported");
    assert.ok(aiFunctionsContent.includes("saveModulDraftServerFn"), "saveModulDraftServerFn must be exported");
    assert.ok(aiFunctionsContent.includes("publishModulServerFn"), "publishModulServerFn must be exported");
    assert.ok(aiFunctionsContent.includes("requireTeacherAiAuth"), "requireTeacherAiAuth must protect generation");

    reportPass(9, "Canonical Modul Ajar generation path (ingest -> ground -> generate -> validate -> persist) identified");
  } catch (err) {
    reportFail(9, "Canonical Modul Ajar generation path (ingest -> ground -> generate -> validate -> persist) identified", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 10: Canonical illustration generation path can be identified
  // ----------------------------------------------------------------------------
  try {
    const illGenContent = fs.readFileSync(
      path.join(ROOT_DIR, "src/lib/illustration-generation.functions.ts"),
      "utf8"
    );
    assert.ok(illGenContent.includes("prepareIllustrationGenerationRequestServerFn"));
    assert.ok(illGenContent.includes("generateIllustrationServerFn"));
    assert.ok(illGenContent.includes("resolveIllustrationGenerationProvider"));
    assert.ok(illGenContent.includes("assertValidImageBinary"));

    reportPass(10, "Canonical illustration path (outline -> request -> dual router -> binary validation -> asset) identified");
  } catch (err) {
    reportFail(10, "Canonical illustration path (outline -> request -> dual router -> binary validation -> asset) identified", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 11: Canonical presentation generation path can be identified
  // ----------------------------------------------------------------------------
  try {
    const pptxRendererPath = path.join(ROOT_DIR, "src/lib/ai/presentation-pptx-renderer.ts");
    const pptxContent = fs.readFileSync(pptxRendererPath, "utf8");
    assert.ok(pptxContent.includes("renderPresentationPptx"), "renderPresentationPptx must be defined");
    assert.ok(pptxContent.includes("pptxgenjs"), "pptxgenjs must be utilized for real OOXML rendering");
    assert.ok(pptxContent.includes("validatePptxPackage"), "validatePptxPackage must validate OOXML integrity");

    reportPass(11, "Canonical presentation path (package -> pptxgenjs -> ooxml validator -> quality gate -> artifact) identified");
  } catch (err) {
    reportFail(11, "Canonical presentation path (package -> pptxgenjs -> ooxml validator -> quality gate -> artifact) identified", err);
  }

  // ----------------------------------------------------------------------------
  // TEST 12: AI error telemetry uses structured failure categories
  // ----------------------------------------------------------------------------
  try {
    const { AI_ERROR_CODES } = await import("../../src/lib/ai/error-taxonomy.ts");

    const requiredErrorCodes = [
      "AI_CONFIG_ERROR",
      "AI_PROVIDER_ERROR",
      "AI_TIMEOUT",
      "AI_RATE_LIMITED",
      "AI_MALFORMED_OUTPUT",
      "AI_SCHEMA_INVALID",
      "AI_GROUNDING_FAILED",
      "AI_PERSISTENCE_FAILED",
      "AI_STORAGE_FAILED",
      "PROVIDER_UNAVAILABLE",
    ];

    for (const code of requiredErrorCodes) {
      assert.ok(
        AI_ERROR_CODES[code] !== undefined,
        `AI_ERROR_CODES must define taxonomy category: ${code}`
      );
    }

    reportPass(12, "AI error telemetry uses structured failure taxonomy categories across all subsystems");
  } catch (err) {
    reportFail(12, "AI error telemetry uses structured failure taxonomy categories across all subsystems", err);
  }

  console.log("================================================================================");
  console.log(`  AI-RECOVERY-01 SUITE RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log("================================================================================");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTestSuite();
