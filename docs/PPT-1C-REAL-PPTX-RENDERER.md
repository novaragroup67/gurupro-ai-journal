# PPT-1C — Real PPTX Renderer & Presentation Artifact Engine

## 1. Overview & Objectives

**PPT-1C (Real PPTX Renderer & Presentation Artifact Engine)** is the deterministic document generation subsystem for GuruPro presentations. It transforms the validated structured presentation content (`PresentationContentPackage`) produced by **PPT-1B** into a REAL, production-grade Microsoft PowerPoint (`.pptx`) document conforming strictly to OpenXML / OOXML standards.

```
Validated Content Package (PPT-1B)
               │
               ▼
   [PPT-1C Artifact Engine]
 (In-Flight Concurrency Lock)
               │
               ▼
    Presentation Style Resolver
   (6 Distinct Presentation Themes)
               │
               ▼
    Deterministic Layout Engine
   (16:9 Widescreen & 4:3 Standard)
               │
               ▼
      Block Renderers Pipeline
  (All 24 Canonical Educational Blocks)
               │
               ▼
     OOXML Document Assembler
         (PptxGenJS v4)
               │
               ▼
    Strict OOXML Package Auditor
    (JSZip: PK\x03\x04, XML parts, slide count)
               │
               ▼
  Deterministic SHA-256 & Storage
 (Supabase Storage / In-Memory Driver)
               │
               ▼
 Real Presentation Artifact (`.pptx`)
```

---

## 2. Strict Invariants & Anti-Fake Guarantee

1. **Genuine OpenXML / OOXML Package**:
   - The generated binary is a true compressed ZIP archive with the `PK\x03\x04` magic signature.
   - Contains all mandatory OOXML relationships: `[Content_Types].xml`, `_rels/.rels`, `ppt/presentation.xml`, `ppt/slides/slide*.xml`, and `ppt/notesSlides/notesSlide*.xml`.
   - Native MIME type: `application/vnd.openxmlformats-officedocument.presentationml.presentation`.
2. **Zero Fake PPTX Files**:
   - Zero HTML, Markdown, SVG, or plain text masquerading as `.pptx`.
   - The validator actively rejects non-OOXML files, empty files, and renamed web documents.
3. **Zero AI Content Generation / Mutation**:
   - PPT-1C is a purely deterministic rendering engine.
   - Zero AI provider calls, prompt tokens, or text rewriting.
   - Exactly preserves all titles, descriptions, numerical data (e.g. `553`, `75%`), formulas, and teacher speaker notes.
4. **Illustration Boundary & Non-Invocation Guarantee**:
   - PPT-1C does **NOT** call the VIS-1B image generation engine.
   - When a slide specifies `requiresGeneratedIllustration: true`, a clean placeholder shape with pedagogical directions is rendered into the slide canvas.
   - Asset embedding with real generated illustrations is strictly deferred to **PPT-1D**.
5. **Exact Slide Count & Contiguous Order**:
   - Slides are rendered in 1..N order with exact 1:1 mapping from the validated package.
   - The validator verifies that the number of internal `slide*.xml` files precisely matches `package.slides.length`.

---

## 3. Presentation Themes & Style Resolver

The style resolver ([`src/lib/ai/presentation-style-resolver.ts`](file:///c:/novara%20project/gurupro-ai-journal-main/src/lib/ai/presentation-style-resolver.ts)) maps the 6 verified presentation catalog styles into typography, color palettes, spacing, and card decoration tokens:

| Style ID | Name | Dominant Colors | Typography | Pedagogical Use Case |
|---|---|---|---|---|
| `style_ppt_modern_minimal` | Modern Minimalis | Deep Slate (`0F172A`), Teal (`0D9488`), White (`FFFFFF`) | Inter / Arial | Clean, distraction-free presentations |
| `style_ppt_edu_classroom` | Edu Classroom Interaktif | Indigo Navy (`1E1B4B`), Amber (`D97706`), Off-White (`F8FAFC`) | Nunito / Calibri | Primary & secondary school interactive teaching |
| `style_ppt_corp_pro` | Corporate & Professional | Navy Blue (`0A2540`), Gold (`B45309`), Ice Blue (`F0F4F8`) | Aptos / Calibri | Formal seminars, institutional briefings |
| `style_ppt_visual_learning` | Visual Learning Dinamis | Deep Violet (`3B0764`), Emerald (`059669`), Soft Purple (`FAF5FF`) | Poppins / Arial | Science, geography, and visually driven topics |
| `style_ppt_technical` | Technical & Structured | Charcoal (`18181B`), Cyan (`0891B2`), Dark Slate (`09090B`) | JetBrains Mono / Consolas | Computer science, mathematics, engineering |
| `style_ppt_academic` | Academic & Research | Classic Navy (`1E293B`), Crimson (`991B1B`), Warm Ivory (`FEFCE8`) | Georgia / Garamond | Higher education, research dissemination |

---

## 4. Deterministic Layout Engine

The layout engine ([`src/lib/ai/presentation-layout-engine.ts`](file:///c:/novara%20project/gurupro-ai-journal-main/src/lib/ai/presentation-layout-engine.ts)) establishes a strict coordinate space in inches:

- **16:9 Widescreen**: $13.333 \times 7.500$ inches
- **4:3 Standard**: $10.000 \times 7.500$ inches

### Slide Regions & Safe Area Grid

```
┌─────────────────────────────────────────────────────────────┐
│ Slide Header: Title & Purpose Subtitle                      │
│ (y: 0.50", h: 1.10", full margin width)                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Safe Content Area (y: 1.70", h: 5.15")                      │
│                                                             │
│ [Single Column: full width]                                 │
│ [Two Columns: col1 (w: 5.86"), col2 (w: 5.86"), gap: 0.4"] │
│ [Three Columns: 3 equal columns, gap: 0.3"]                 │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Slide Footer: Module Title & Slide Number (y: 6.95", 0.35") │
└─────────────────────────────────────────────────────────────┘
```

The layout engine rigorously asserts boundary constraints (`assertWithinSlideBounds`), preventing visual overflow and overlapping text cards.

---

## 5. Support for All 24 Canonical Block Types

The block renderer ([`src/lib/ai/presentation-block-renderers.ts`](file:///c:/novara%20project/gurupro-ai-journal-main/src/lib/ai/presentation-block-renderers.ts)) natively supports all 24 pedagogical block types:

1. **Text & Concept**: `paragraph`, `text`, `definition`, `example`
2. **Lists & Bullet Points**: `bullet_list`, `numbered_list`
3. **Accents & Quotes**: `quote`, `callout`
4. **Code & Formulas**: `code_snippet` (syntax-highlighted terminal box), `formula_block` (centered mathematical card)
5. **Data & Comparisons**: `table` (styled OOXML table with header row and title), `comparison_column` (side-by-side contrast container)
6. **Metrics & Processes**: `stat_metric` (jumbo callout number + label), `diagram_placeholder` (dashed workflow container), `timeline_step` (ordered phase step)
7. **Pedagogical Prompts**: `reflection_prompt`, `activity_instruction`
8. **Specialized Block Fallbacks**: `key_point`, `takeaway`, `header`, `image_placeholder`, `summary`, `question`

Unsupported block types strictly **fail closed** with typed `PPTX_INVALID_CONTENT` errors.

---

## 6. Speaker Notes & Footer Policy Integration

- **Native Speaker Notes**: When `includeSpeakerNotes` is enabled (default), notes are embedded into OpenXML `ppt/notesSlides/notesSlide*.xml` parts using PptxGenJS `slide.addNotes()`. Teachers can read speaker notes directly in PowerPoint presenter view.
- **Footer Policies**: Supports `default`, `minimal`, and `none`.
- **Slide Numbering**: Configurable via `includePageNumbering`.

---

## 7. Package Validation & Integrity Audit

The package validator ([`src/lib/ai/presentation-pptx-validator.ts`](file:///c:/novara%20project/gurupro-ai-journal-main/src/lib/ai/presentation-pptx-validator.ts)) audits the generated binary using `JSZip`:

1. Checks `PK\x03\x04` magic header bytes.
2. Checks mandatory parts: `[Content_Types].xml`, `_rels/.rels`, `ppt/presentation.xml`.
3. Verifies that the number of `ppt/slides/slide*.xml` files exactly matches the planned slide count.
4. Verifies `ppt/notesSlides/notesSlide*.xml` presence when speaker notes are included.

---

## 8. Artifact Schema, Storage & Multi-Tenant Security

### Database Migration
Implemented in [`supabase/migrations/20261001150000_presentation_artifacts.sql`](file:///c:/novara%20project/gurupro-ai-journal-main/supabase/migrations/20261001150000_presentation_artifacts.sql):
- Table `presentation_artifacts`
- Foreign keys to `presentation_generation_results` and `modul_ajar`
- Columns: `storage_path`, `file_hash` (SHA-256), `file_size_bytes`, `mime_type`, `slide_count`, `aspect_ratio`, `style_id`, `status`
- Row-Level Security (RLS) policies isolating artifacts to the owning teacher.

### Storage Paths & SHA-256
- Canonical Storage Path: `tenant/{tenantId}/modules/{moduleId}/presentations/{artifactId}.pptx`
- Deterministic SHA-256 hashing computed via `crypto.createHash('sha256')`.

### Server Functions
Defined in [`src/lib/presentation-artifact.functions.ts`](file:///c:/novara%20project/gurupro-ai-journal-main/src/lib/presentation-artifact.functions.ts):
- `executeRenderPresentationPptx`: Renders, validates, stores, and registers the artifact. Features in-flight concurrency locking and idempotency caching.
- `executeGetPresentationArtifact`: Retrieves artifact metadata and download URL with teacher RBAC enforcement.
- `executeListPresentationArtifacts`: Lists artifacts for a specific module, isolated by teacher owner.

---

## 9. UI Integration in Generation Planning Panel

Tab 5 of the Planning Panel ([`src/components/generation-planning-panel.tsx`](file:///c:/novara%20project/gurupro-ai-journal-main/src/components/generation-planning-panel.tsx)):
- **Status Badges**: Shows rendering status, slide count, style badge, and aspect ratio.
- **Action Buttons**:
  - `Buat Dokumen PPTX (PPT-1C)`: Triggers real OOXML generation.
  - `Unduh File PPTX Nyata`: Downloads the genuine `.pptx` file directly to the teacher's device.
  - `Render Ulang`: Allows refreshing the rendered document.
- **Artifact Metadata Card**: Displays filename, file size (KB), SHA-256 fingerprint, and OOXML verification status.

---

## 10. Verification & Quality Gates

| Verification Suite | Commands | Results | Status |
|---|---|---|---|
| PPT-1C Unit & Integration Suite | `npm run test:ppt1c` | 58 / 58 PASS (100%) | Verified |
| Controlled Live OOXML Audit | `npx tsx tests/ai/live-presentation-pptx-test.mjs` | 6 / 6 Steps PASS | Verified |
| PPT-1B Content Engine Suite | `npm run test:ppt1b` | 55 / 55 PASS | Verified |
| PPT-1A Contract Suite | `npm run test:ppt1a` | 35 / 35 PASS | Verified |
| VIS-1A..VIS-1E Illustration Suites | `npm test` aggregator | All Suites PASS | Verified |
| Production Build | `npm run build` | Client + Nitro SSR PASS | Verified |
