# PPT-1B — Real AI Presentation Content Generation Engine

## 1. Overview & Objectives

**PPT-1B (Real AI Presentation Content Generation Engine)** is the core intelligence engine that generates authentic, curriculum-grounded, and pedagogically sound structured presentation content for GuruPro.

While **PPT-1A** established the contract and slide plan blueprint, **PPT-1B** invokes the AI model to write the actual educational substance for each slide, subject to a stringent 3-layer quality validation pipeline.

```
Approved Request (PPT-1A) + Grounded Context
                    │
                    ▼
          [PPT-1B Core Engine]
   (In-flight lock + Idempotency cache)
                    │
                    ▼
          AI Provider Invocation
 (Grounded System & User Prompts with Outline Authority)
                    │
                    ▼
          [Layer 1: Deterministic Validator]
  (Slide count, contiguous 1..N, slide IDs, 24 block types)
                    │
                    ▼
          [Layer 2: Grounding & Exact-Value Validator]
  (Curriculum fidelity, exact numbers/formulas, evidence IDs)
                    │
                    ▼
          [Layer 3: Semantic Quality Evaluator]
  (Pedagogical coherence, density rules, max 1 targeted retry)
                    │
                    ▼
     Validated Content Package (`PresentationContentPackage`)
                    │
                    ▼
       Persistence (`presentation_generation_results`)
                    │
                    ▼
          [PPT-1C Downstream Renderer]
         (REAL PPTX / OpenXML generation)
```

---

### Strict Non-Goals & Invariants Enforced in PPT-1B

1. **The Output is NOT a `.pptx` File**: PPT-1B generates a validated, structured JSON content package (`PresentationContentPackage`). Rendering binary `.pptx` files is strictly reserved for **PPT-1C**.
2. **Zero PPTX Rendering Libraries**: No `pptxgenjs`, no OpenXML / OOXML manipulation, and no zip file manipulation.
3. **Zero Fake PPTX Renaming**: No HTML, Markdown, or plain text is renamed as `.pptx`.
4. **Zero Image Generation**: PPT-1B does **NOT** call the VIS-1B image generation engine or create image binaries. Visual directions are emitted strictly as text specifications and layout recommendations.
5. **Strict Outline Authority**: The engine must never invent, drop, reorder, or alter approved slide IDs, slide counts, or slide titles.
6. **Strict Stop Condition**: Development stops immediately upon completing and verifying PPT-1B.

---

## 2. Structured Content Package Schema

Defined in [`src/lib/ai/presentation-generation-contract.ts`](file:///c:/novara%20project/gurupro-ai-journal-main/src/lib/ai/presentation-generation-contract.ts):

### Top-Level Package (`PresentationContentPackage`)

| Field | Type | Description |
| :--- | :--- | :--- |
| `presentationId` | `string` | Unique identifier of the generated presentation (`pres_{planId}_{timestamp}`) |
| `generationRequestId` | `string` | Foreign key referencing `presentation_generation_requests.id` |
| `generationPlanId` | `string` | Foreign key referencing `generation_plans.id` |
| `moduleId` | `string` | Curriculum module ID |
| `title` | `string` | Presentation title (grounded in approved outline) |
| `subtitle` | `string?` | Optional target audience or thematic subtitle |
| `learningObjectives` | `string[]` | Specific learning objectives addressed in the presentation |
| `targetAudience` | `string` | Target student demographic / educational phase (e.g., Fase E Kelas 10) |
| `styleId` | `string` | Approved presentation style identifier |
| `styleVersion` | `number` | Version of the selected presentation style |
| `parameters` | `PresentationGenerationParameters` | Aspect ratio, density, language, slide dimensions |
| `slides` | `PresentationSlideContent[]` | Array of fully structured slides following contiguous 1..N order |
| `provenance` | `object` | Source module references and evidence mappings |
| `generationMetadata` | `object` | Provider, model, latency, generator version, generation key |
| `validationMetadata` | `object` | 3-layer validation results and semantic evaluator findings |
| `createdAt` | `string` | ISO timestamp of generation completion |

---

### Slide Content Structure (`PresentationSlideContent`)

Each slide in `slides` contains:
- `slideId`: Matches the approved slide ID from PPT-1A blueprint.
- `order`: 1-based sequential integer ($1 \le order \le N$).
- `title`: Slide heading derived from outline.
- `pedagogicalType`: One of 12 pedagogical classifications.
- `purpose`: Educational rationale for the slide.
- `contentBlocks`: Array of structured blocks (minimum 1, typically 2–4).
- `keyPoints`: 1–5 key takeaways for quick student retention.
- `visualDirection`: Text instruction describing optimal layout, focal points, and diagrams for the downstream renderer.
- `referencedAssetIds`: Array of approved illustration asset IDs (from VIS-1C) if already generated.
- `requiresGeneratedIllustration`: Boolean indicating whether VIS-1B illustration is requested.
- `speakerNotes`: Detailed instructional narrative for the teacher.
- `sourceReferences`: Curriculum sources backing this slide.
- `evidenceReferences`: Specific learning objective or paragraph evidence keys.

---

### 24 Canonical Content Block Types

```ts
export const PresentationContentBlockTypeSchema = z.enum([
  "text", "paragraph", "key_value", "bullet_list", "numbered_list",
  "quote", "definition", "example", "process", "comparison",
  "comparison_column", "table", "diagram", "diagram_placeholder",
  "code_snippet", "stat_metric", "timeline_step", "formula_block",
  "reflection_prompt", "activity_instruction", "callout", "image",
  "summary", "key_stat",
]);
```

---

### 12 Slide Pedagogical Types

```ts
export const SlidePedagogicalTypeSchema = z.enum([
  "introduction", "learning_objective", "concept_explanation",
  "example", "process", "application", "case_study",
  "comparison", "activity", "exercise", "reflection", "summary",
]);
```

---

## 3. The 3-Layer Quality Gate

To prevent hallucination, structural drift, or substandard educational output, every candidate generation must pass through three sequential validation gates before persistence:

```
Candidate AI Output
         │
         ▼
[Layer 1: Deterministic Validation]
  ├── Slide count === request.slidePlan.length
  ├── Strict contiguous 1..N order
  ├── Slide IDs match approved blueprint exactly
  ├── All block types belong to 24 canonical schemas
  ├── Non-empty block content & non-empty visual direction
  └── Passes validatePresentationContentPackage (Zod)
         │ (Fail -> Rejection or Targeted Retry)
         ▼
[Layer 2: Grounding & Exact-Value Validation]
  ├── Source module citations preserved
  ├── Evidence references do not contain hallucinated IDs
  └── Preserves critical numerical and scientific facts
         │ (Fail -> Rejection)
         ▼
[Layer 3: Semantic Quality Gate]
  ├── Evaluates alignment with pedagogical objectives
  ├── Checks content density constraints (minimal / balanced / detailed)
  ├── Decision: PASS | REVISE | REJECT
  └── If REVISE: Triggers bounded revision (Max 1 targeted retry)
         │
         ▼
Validated Content Package Persisted
```

### Bounded Semantic Revision Loop

When Layer 3 detects non-critical quality defects (such as excessive word count for minimal density, or unclear teacher notes), the engine triggers an automatic, targeted correction prompt:
1. Feeds the evaluator findings back to the AI model.
2. Injects explicit corrective instructions.
3. Limits revision attempts strictly to **1 retry** (`maxRevisions = 1`).
4. Re-evaluates the revised candidate through Layers 1, 2, and 3.
5. If the revised package still fails, it throws `AI_ERROR_CODES.PRESENTATION_REVISION_FAILED` to guarantee invalid content is never persisted.

---

## 4. Concurrency, In-Flight Lock & Idempotent Caching

### In-Flight Concurrency Lock
To avoid duplicate paid AI calls when double-clicking or receiving parallel requests, `presentation-generator.ts` maintains an in-memory lock `activePresentationGenerations = new Set<string>()` keyed by `request.requestId`. Duplicate concurrent attempts fail immediately with `AI_ERROR_CODES.AI_RATE_LIMIT`.

### Deterministic Generation Key
Every request produces a deterministic hash key:
```
ppt1b:${planId}:v${approvedVersion}:s${styleVersion}:${generatorVersion}:${serializedParams}
```

If a valid presentation package with an identical `generation_key` already exists in `presentation_generation_results`, the engine serves the cached package immediately without calling the AI provider.

---

## 5. Persistence & Multi-Tenant Security

### Database Schema (`public.presentation_generation_results`)

```sql
CREATE TABLE public.presentation_generation_results (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES public.presentation_generation_requests(id) ON DELETE CASCADE,
  generation_plan_id TEXT NOT NULL REFERENCES public.generation_plans(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL REFERENCES public.modul_ajar(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  approved_version INTEGER NOT NULL,
  style_id TEXT NOT NULL,
  style_version INTEGER NOT NULL,
  generator_version TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  content_package JSONB NOT NULL,
  validation_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  semantic_decision TEXT NOT NULL CHECK (semantic_decision IN ('PASS', 'REVISE', 'REJECT', 'ERROR')),
  grounding_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('generating', 'validating', 'revising', 'ready', 'failed')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  generation_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Row Level Security (RLS)
- Teachers can only SELECT and INSERT rows where `owner_id = auth.uid()`.
- Multi-tenant cross-reading is strictly rejected with `AI_ERROR_CODES.ROLE_FORBIDDEN`.

---

## 6. Server Functions & Client Store Integration

### Server Functions (`src/lib/presentation-generation.functions.ts`)
- `preparePresentationGenerationRequestServerFn`: Prepares the canonical request (PPT-1A).
- `generatePresentationContentServerFn`: Executes the PPT-1B engine with 3-layer validation.
- `getPresentationGenerationResultServerFn`: Fetches a single result by ID.
- `listPresentationGenerationResultsServerFn`: Queries results for a module or generation plan.

### Planning Store (`src/lib/generation-planning-store.ts`)
- `generatedPresentationContent`: Holds the current `PresentationContentPackage`.
- `generatingPresentationContent`: Boolean loading state for UI spinners.
- `presentationGenerationError`: Error messages displayed in red alert callouts.
- `generatePresentationContent(requestId)`: Dispatches the generation action.

### Teacher UI (`src/components/generation-planning-panel.tsx`)
In Step 5 of the generation planning panel:
- Renders "Generate Konten Presentasi (PPT-1B)" button.
- Displays animated spinner during multi-layer generation and validation.
- Presents a complete interactive content preview:
  - Header with title, target audience, and learning objectives.
  - Horizontal slide selector pills.
  - Slide cards detailing pedagogical type, purpose, and visual direction.
  - Rendered content blocks with specialized badges (`callout`, `stat_metric`, `table`, etc.).
  - Expandable teacher speaker notes.
  - Evidence and curriculum provenance badges.
- Displays a disabled export button: "Unduh File PPTX Nyata (PPT-1C Segera Hadir)".

---

## 7. Verification & Automated Test Coverage

The engine is verified through two comprehensive test suites:

1. **Unit & Integration Suite** (`tests/ai/presentation-content-generation.test.mjs`):
   - **55 tests** across 8 suites.
   - Verifies schema validation, precondition guards, grounding serialization, Layer 1 deterministic rules, Layer 3 semantic evaluations, concurrency locks, caching, database persistence, and non-generation invariants.
   - Run command: `npm run test:ppt1b`.

2. **Controlled Live Integration Test** (`tests/ai/live-presentation-content-test.mjs`):
   - **32 tests** executing end-to-end against a 6-slide marine biology curriculum module.
   - Tests request preparation $\rightarrow$ engine execution $\rightarrow$ 3-layer validation $\rightarrow$ idempotent cache retrieval $\rightarrow$ multi-tenant isolation $\rightarrow$ zero `.pptx` files on disk.
   - Run command: `npx tsx tests/ai/live-presentation-content-test.mjs`.
