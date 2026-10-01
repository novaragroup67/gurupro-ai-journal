import fs from "fs";
import path from "path";

const srcRoot = "c:/novara project/gurupro-ai-journal-main";
const dstRoot = "C:/Users/LENOVO/Projects/gurupro-ai-journal-main";

const files = [
  "supabase/migrations/20260929130000_illustration_generations.sql",
  "src/lib/ai/image-validator.ts",
  "src/lib/ai/providers/openai-image-provider.ts",
  "src/lib/ai/providers/gemini-image-provider.ts",
  "src/lib/ai/providers/illustration-provider-factory.ts",
  "tests/ai/illustration-generation-engine.test.mjs",
  "tests/ai/live-openai-test.mjs",
  "docs/VIS-1B-REAL-ILLUSTRATION-GENERATION.md",
  "src/lib/ai/ai-service.ts",
  "src/lib/illustration-generation.functions.ts",
  "src/lib/generation-planning-store.ts",
  "src/components/generation-planning-panel.tsx",
  "package.json",
  "docs/WALKTHROUGH.md",
  "supabase/migrations/20260930100000_illustration_assets.sql",
  "src/lib/ai/illustration-asset-contract.ts",
  "src/lib/ai/illustration-storage-service.ts",
  "src/lib/illustration-asset.functions.ts",
  "src/lib/illustration-asset-store.ts",
  "src/components/modul-editor.tsx",
  "tests/ai/illustration-asset-lifecycle.test.mjs",
  "docs/VIS-1C-ASSET-PERSISTENCE-LIFECYCLE.md",
  "supabase/migrations/20260930110000_illustration_reviews.sql",
  "src/lib/ai/illustration-review-contract.ts",
  "src/lib/illustration-review.functions.ts",
  "tests/ai/illustration-teacher-review.test.mjs",
  "docs/VIS-1D-ILLUSTRATION-TEACHER-REVIEW.md",
  "supabase/migrations/20260930120000_illustration_quality_evaluations.sql",
  "src/lib/ai/illustration-quality-contract.ts",
  "src/lib/ai/prompts-registry.ts",
  "src/lib/ai/providers/illustration-quality-evaluator.ts",
  "src/lib/illustration-quality.functions.ts",
  "tests/ai/illustration-quality-gate.test.mjs",
  "tests/ai/live-illustration-quality-test.mjs",
  "docs/VIS-1E-ILLUSTRATION-QUALITY-GATE-E2E.md",
  "supabase/migrations/20260930130000_presentation_generation_requests.sql",
  "src/lib/ai/presentation-generation-contract.ts",
  "src/lib/ai/presentation-request-builder.ts",
  "src/lib/presentation-generation.functions.ts",
  "src/lib/ai/generation-planning-service.ts",
  "tests/ai/presentation-generation-contract.test.mjs",
  "tests/ai/live-presentation-contract-test.mjs",
  "docs/PPT-1A-PRESENTATION-GENERATION-CONTRACT.md",
  "supabase/migrations/20260930140000_presentation_generation_results.sql",
  "src/lib/ai/error-taxonomy.ts",
  "src/lib/ai/presentation-generator.ts",
  "tests/ai/presentation-content-generation.test.mjs",
  "tests/ai/live-presentation-content-test.mjs",
  "docs/PPT-1B-REAL-AI-PRESENTATION-CONTENT-GENERATION.md",
  "src/integrations/supabase/auth-middleware.ts",
  "src/integrations/supabase/client.ts",
  "src/integrations/supabase/client.server.ts",
  "src/server.ts",
  "tests/auth/auth-role.test.mjs"
];

for (const file of files) {
  const src = path.join(srcRoot, file);
  const dst = path.join(dstRoot, file);
  const dstDir = path.dirname(dst);
  if (!fs.existsSync(dstDir)) {
    fs.mkdirSync(dstDir, { recursive: true });
  }
  fs.copyFileSync(src, dst);
  console.log("Synced:", file);
}
console.log("All files synced successfully!");
