# PPT-1A — Presentation Generation Contract & Outline-to-Slide Planning

## 1. Overview & Objectives

**PPT-1A (Presentation Generation Contract & Outline-to-Slide Planning)** establishes the canonical, provider-agnostic contract and preparation layer for the GuruPro AI Presentation pipeline.

Building directly upon **GEN-0 (Generation Planning Foundation)**, this stage converts a teacher-approved presentation plan into a deterministic, injection-safe, and structured `PresentationGenerationRequest` with a complete `PresentationContentBlueprint`.

```
Modul Ajar / Sumber Belajar
  │
  ▼
Grounded Context & Outline (GEN-0)
  │
  ▼
Teacher Outline Editing & Manipulation (GEN-0 / PPT-1A)
  (Add, Remove, Reorder, Update, Duplicate Slide — Contiguous 1..N Order)
  │
  ▼
Presentation Style Selection & Approval Gate (GEN-0)
  (6 Verified Presentation Styles)
  │
  ▼
Approved GenerationPlan (targetType = 'presentation')
  │
  ▼
[PPT-1A] Teacher Auth & Ownership Re-Validation
  │
  ▼
[PPT-1A] Pedagogical Section Inference (9 Pedagogical Types)
  │
  ▼
[PPT-1A] Structured Content Block Mapping (15 Content Block Types)
  │
  ▼
[PPT-1A] Visual Asset Requirement Evaluation (Existing vs New Illustration Flags)
  │
  ▼
[PPT-1A] Content Blueprint Assembler & Request Builder
  │
  ▼
[PPT-1A] Persistence (public.presentation_generation_requests, status: 'prepared')
  │
  ▼
[PPT-1B — FUTURE STAGE] Presentation Content Generation Engine
```

### Strict Non-Goals & Invariants Enforced in PPT-1A

1. **Strict Non-Generation Invariant**: PPT-1A does **NOT** call external PowerPoint or slide rendering APIs.
2. **Zero File-Renaming / Zero Fake PPTX**: PPT-1A does **NOT** generate HTML, Markdown, or raw text and rename it with a `.pptx` extension.
3. **No Premature PPTX Rendering**: PPT-1A does **NOT** use `pptxgenjs` or OOXML rendering libraries; rendering belongs to PPT-1C/PPT-1D downstream.
4. **Target Guard**: Strictly rejects illustration plans attempting to enter the presentation pipeline (`targetType === "presentation"` strictly required).
5. **Fresh Approval Required**: Strictly rejects unapproved plans (`status !== "approved"`) and stale plans where the outline was modified after approval (`approvedVersion !== currentVersion`).
6. **Separation from Legacy Quick Export**: The existing client-side `unduhPpt` utility in `modul-editor.tsx` remains completely preserved and untouched as an instant fallback.

---

## 2. Presentation Generation Parameters

Defined in [`src/lib/ai/presentation-generation-contract.ts`](file:///c:/novara%20project/gurupro-ai-journal-main/src/lib/ai/presentation-generation-contract.ts):

### Parameter Specification (`PresentationGenerationParameters`)

| Parameter | Type | Default | Allowed Values / Constraints |
| :--- | :--- | :--- | :--- |
| `aspectRatio` | `PresentationAspectRatio` | `"16:9"` | `"16:9"`, `"4:3"` |
| `slideSize` | `PresentationSlideSize` | `"standard"` | `"standard"`, `"1920x1080"`, `"1440x1080"`, `"1024x768"`, `{ width, height }` (min 640x360, max 3840x2160) |
| `contentDensity` | `PresentationContentDensity` | `"balanced"` | `"minimal"` (emphasis on single visual/idea), `"balanced"` (standard), `"detailed"` (comprehensive notes/points) |
| `language` | `PresentationLanguage` | `"id"` | `"id"` (Bahasa Indonesia), `"en"` (English) |
| `includeSpeakerNotes` | `boolean` | `true` | When true, prompts blueprint to prepare instructional teacher notes |
| `includePageNumbering` | `boolean` | `true` | Slide number indicators |
| `footerPolicy` | `PresentationFooterPolicy` | `"standard"` | `"none"`, `"title_only"`, `"standard"`, `"minimal"`, `"full"` |
| `slideVisualOverrides` | `Record<string, any>` | `undefined` | Per-slide visual requirement overrides |
| `providerExtension` | `Record<string, any>` | `{}` | Extensible map for downstream generation engines |

---

## 3. Structured Slide Contract & Pedagogical Mapping

### Contiguous 1..N Slide Ordering Invariant

Every presentation plan must satisfy strict contiguous 1..N slide ordering:
- Slide orders start at `1` and increment consecutively by `1` without gaps or duplicates.
- Validated via `validateContinuousSlideOrdering(slides)`.
- Enforced across all manipulation operations:
  - `addSlideToPresentationOutline(outline, newSlide)`: Appends slide and re-indexes contiguous orders.
  - `removeSlideFromPresentationOutline(outline, slideId)`: Removes slide, re-indexes remaining, protects minimum 1 slide invariant.
  - `duplicateSlideInPresentationOutline(outline, slideId)`: Inserts a cloned slide immediately adjacent and re-indexes contiguous orders.
  - `reorderSlidesInPresentationOutline(outline, orderedSlideIds)`: Re-indexes according to user-specified order array.
  - `updateSlideInPresentationOutline(outline, slideId, updates)`: Updates slide metadata and validates.

### 15 Canonical Content Block Types

A slide contains structured content blocks for flexible rendering:
1. `text` — Standard paragraph body text.
2. `key_value` — Label and value pairs (e.g. "Definisi: ...").
3. `bullet_list` — Unordered pedagogical bullet points.
4. `numbered_list` — Sequential steps or ordered items.
5. `quote` — Educational quotation with author citation.
6. `callout` — Emphasized note, tip, or warning card.
7. `code_snippet` — Formatted code block with language identifier.
8. `table` — Structured matrix data with columns and rows.
9. `comparison_column` — Side-by-side comparative concepts.
10. `stat_metric` — Large metric highlight (e.g. "78%").
11. `diagram_placeholder` — Structured placeholder for visual schema.
12. `timeline_step` — Chronological sequence item.
13. `formula_block` — Mathematical or chemical equation with KaTeX notation.
14. `reflection_prompt` — Discussion prompt for student active learning.
15. `activity_instruction` — Task instructions for classroom group work.

### 9 Pedagogical Section Types

Each slide is deterministically classified by pedagogical intent:
1. `introduction` — Title, context setting, ice-breaker.
2. `learning_objective` — Explicit learning targets (Tujuan Pembelajaran / Capaian Pembelajaran).
3. `concept_explanation` — Core knowledge and theoretical foundation.
4. `process` — Sequential mechanism, biological cycle, algorithmic flow.
5. `case_study` — Real-world application, context scenario, problem statement.
6. `comparison` — Contrast between two or more concepts, theories, or methods.
7. `activity` — Hands-on classroom exercise, group work, inquiry lab.
8. `reflection` — Metacognitive check, formative discussion question.
9. `summary` — Synthesis, key takeaways, closing remarks.

### Slide Visual Requirement Schema

Each slide specifies its visual needs:
- `type`: `"none" | "diagram" | "existing_illustration" | "generate_new_illustration"`
- `description`: Textual visual guidance.
- `referencedAssetId`: ID of a persisted GuruPro illustration asset (from VIS-1C). Validated server-side against teacher ownership and module identity (`ROLE_FORBIDDEN` if mismatched).
- `requiresGeneratedIllustration`: Boolean flag declaring intent to request an illustration in VIS-1B.
- `placement`: `"left" | "right" | "top" | "bottom" | "background" | "full"`

---

## 4. Deterministic Request Builder & Blueprint Assembly

Implemented in [`src/lib/ai/presentation-request-builder.ts`](file:///c:/novara%20project/gurupro-ai-journal-main/src/lib/ai/presentation-request-builder.ts):

### Functions

- `inferSlidePedagogicalType(slide, totalSlides, index)`:
  Deterministically classifies slide pedagogical type based on title keywords, slide position (e.g. first slide -> introduction, second slide -> learning_objective, last slide -> summary/reflection), and purpose.
- `assemblePresentationContentBlueprint(outline, styleDef, parameters)`:
  Assembles the injection-safe system prompt, educational objectives, target audience, style rules, grounding references, and slides outline.
- `buildPresentationGenerationRequest(plan, context, overrides, options)`:
  Validates authentication, teacher role, plan ownership, target type, approval freshness, style compatibility, slide ordering, and referenced illustration assets. Returns a canonical `PresentationGenerationRequest` with `status: "prepared"`.

---

## 5. Persistence Schema (`public.presentation_generation_requests`)

Defined in [`supabase/migrations/20260930130000_presentation_generation_requests.sql`](file:///c:/novara%20project/gurupro-ai-journal-main/supabase/migrations/20260930130000_presentation_generation_requests.sql):

```sql
CREATE TABLE IF NOT EXISTS public.presentation_generation_requests (
    id TEXT PRIMARY KEY,
    generation_plan_id TEXT NOT NULL REFERENCES public.generation_plans(id) ON DELETE CASCADE,
    module_id TEXT NOT NULL REFERENCES public.modul_ajar(id) ON DELETE CASCADE,
    approved_version INTEGER NOT NULL,
    style_id TEXT NOT NULL,
    style_version INTEGER NOT NULL DEFAULT 1,
    request_snapshot JSONB NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('prepared', 'ready_for_generation', 'cancelled')),
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS multi-tenant policies
ALTER TABLE public.presentation_generation_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY presentation_generation_requests_owner_all ON public.presentation_generation_requests
    FOR ALL USING (auth.uid()::text = created_by);
```

---

## 6. Verification & Test Evidence

### Test Suites

1. **Unit & Contract Suite** ([`tests/ai/presentation-generation-contract.test.mjs`](file:///c:/novara%20project/gurupro-ai-journal-main/tests/ai/presentation-generation-contract.test.mjs)):
   - **35 tests passed, 0 failed**.
   - Covers: Parameter defaults and validations, approval gates, stale approval rejections, slide manipulations (add/remove/reorder/duplicate), style catalog integrity, target type guard, slide-level grounding, visual requirement resolution, pedagogical inference, blueprint assembly, RBAC security, and non-generation file invariants.

2. **Controlled Live Contract Test** ([`tests/ai/live-presentation-contract-test.mjs`](file:///c:/novara%20project/gurupro-ai-journal-main/tests/ai/live-presentation-contract-test.mjs)):
   - **32 tests passed, 0 failed**.
   - Verifies end-to-end lifecycle from plan initialization to duplication, pre-approval rejection, teacher approval, request preparation, blueprint inspection, style snapshot preservation, storage/retrieval, and confirmed 0 `.pptx`/`.ppt` files generated on disk.

3. **Full Regression Test**:
   - `npm run test:ppt1a` passes.
   - `npm run test:gen0` passes.
   - `npm run test:vis1a` through `npm run test:vis1e` pass.

---

## 7. Roadmap to PPT-1B

PPT-1A completes the planning and canonical contract boundary. The downstream roadmap:
- **PPT-1B**: Presentation Content Generation Engine (calling LLM provider with the canonical blueprint to generate rich, pedagogical slide text, notes, and block layouts).
- **PPT-1C**: Visual & Asset Composition (integrating VIS-1C illustration assets and layout placement).
- **PPT-1D**: Real PPTX Binary Rendering (generating real `.pptx` presentations with styling and typography).
