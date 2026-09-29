# GEN-0 — Generation Planning Foundation Architecture & Technical Report

## 1. Overview & Objectives

**GEN-0 (Generation Planning Foundation)** establishes the shared planning, editing, style selection, versioning, provenance, approval gate, and generation specification layer in GuruPro.

It serves as the prerequisite foundation for:
1. **AI Illustration Generation** (VIS-1)
2. **AI Presentation (PPT) Generation** (PPT-1)

### Core Principle
```
Modul Ajar / Sumber Pembelajaran
  │
  ▼
[1] Ekstraksi Draf Grounded Outline (Low-cost, Zero Image/PPT API Call)
  │
  ▼
[2] Tinjau & Edit Outline oleh Guru (Multi-versioning: v1, v2, ...)
  │
  ▼
[3] Pemilihan Gaya Visual Terverifikasi (Katalog 7 Ilustrasi / 6 PPT)
  │
  ▼
[4] Gerbang Persetujuan Guru (Approval Gate: Kunci Versi & Otorisasi)
  │
  ▼
[5] Penerbitan Spesifikasi Otorisasi Generasi (Siap untuk Eksekusi VIS-1 / PPT-1)
```

### Strict Non-Goals & Invariants Enforced
- **Strict Non-Generation Policy**: GEN-0 does **NOT** generate real images (e.g. via Gemini Imagen, DALL-E, etc.) and does **NOT** generate real `.pptx` binary archives.
- **Cost-Control Invariant**: Zero external generative API costs are incurred during the planning, outlining, editing, and approval phases.
- **Existing Features Intact**: Existing quick SVG generator mockups, Word export, PDF export with illustrations, and quick PPT downloads remain completely operational.

---

## 2. Canonical Contracts & Domain Model

Defined in [`src/lib/ai/generation-planning-contract.ts`](file:///c:/novara%20project/gurupro-ai-journal-main/src/lib/ai/generation-planning-contract.ts):

### Target Types & Statuses
- `GenerationPlanTargetType`: `'illustration' | 'presentation'`
- `GenerationPlanStatus`: `'draft' | 'ready' | 'approved' | 'generating' | 'completed' | 'failed' | 'archived'`

### Illustration Outline Schema (`IllustrationOutline`)
- `title`: String (min 3 chars)
- `objective`: Educational objective (min 5 chars)
- `mainSubject`: Central visual subject (min 3 chars)
- `supportingElements`: Array of supporting visual details
- `environmentBackground`: Setting / classroom / contextual background description
- `composition`: Rule of thirds / symmetry / balance layout notes
- `perspectiveView`: Camera perspective (e.g., Isometric 3D, Eye-level, Close-up)
- `poseAction`: Subject pose / state description
- `importantVisualDetails`: Array of key visual identifiers
- `labelsTextRequirements`: Labels or diagram text markers
- `educationalFocus`: Pedagogical concept highlighted
- `thingsToAvoid`: Elements to avoid (noise, small text, scary elements)
- `sourceReferences`: Grounded source references (e.g. `modul:<id>`, `section:<id>`)
- `evidenceReferences`: Evidence chunk IDs from RAG context
- `sectionId`: Optional section identifier

### Presentation Outline Schema (`PresentationOutline`)
- `title`: Presentation title (min 3 chars)
- `objective`: Learning goal (min 5 chars)
- `targetAudience`: Target students (e.g., SMA Kelas 10)
- `intendedSlideCount`: Integer (1–50)
- `presentationStructure`: Structural flow (e.g. Intro → Concept → Practice → Summary)
- `globalVisualDirection`: Visual motif and palette guideline
- `slides`: Array of `PresentationSlide`:
  - `id`: Unique slide identifier
  - `slideOrder`: Strictly continuous index (1, 2, ... N)
  - `slideTitle`: Slide headline
  - `purpose`: Pedagogical goal of the slide
  - `keyPoints`: Array of bullet points (min 1)
  - `contentBlocks`: Detailed explanatory text
  - `visualDirection`: Specific graphic / layout directive for the slide
  - `speakerNotesDirection`: Teacher delivery notes

---

## 3. Visual Style Catalogs

### Illustration Presets (7 Presets)
1. **Flat Educational (`style_ill_flat_edu`)**: Clean 2D vector, solid harmonious colors, balanced negative space, friendly characters.
2. **3D Educational (`style_ill_3d_edu`)**: Rounded 3D clay-render style, soft diffuse studio lighting, high engagement.
3. **Modern Vector (`style_ill_modern_vector`)**: Dynamic clean line-art with subtle gradients and geometric composition.
4. **Hand Drawn (`style_ill_hand_drawn`)**: Organic hand-sketched lines, watercolor accents, storybook feel.
5. **Realistic (`style_ill_realistic`)**: Anatomically accurate, authentic lighting, botanical / physical precision.
6. **Infographic (`style_ill_infographic`)**: Information-rich layout, comparison brackets, callout markers.
7. **Technical Diagram (`style_ill_tech_diagram`)**: Isometric blueprints, dimension markers, cutaway sections.

### Presentation Presets (6 Presets)
1. **Modern Minimal (`style_ppt_modern_minimal`)**: High contrast, generous whitespace, max 4 lines per slide.
2. **Educational Classroom (`style_ppt_edu_classroom`)**: Student-friendly color cards (blue/green/gold), projector-optimized sans-serif typography.
3. **Corporate Professional (`style_ppt_corp_pro`)**: Formal navy/slate grid, structured 3-column layout.
4. **Visual Learning (`style_ppt_visual_learning`)**: 60:40 split-screen layout (large diagram : key takeaways).
5. **Technical (`style_ppt_technical`)**: Monospaced code blocks, procedural step-by-step layout.
6. **Academic (`style_ppt_academic`)**: Classic thesis/seminar structure with citation footnotes and authoritative tone.

---

## 4. State Machine & Approval Invalidation Policy

### Approval Gate Requirements
A plan can only be approved if:
1. Caller is an authenticated teacher with verified role (`role === 'guru'`).
2. Caller is the verified owner of the plan (`plan.ownerId === caller.userId`).
3. Plan is not archived.
4. Outline passes complete deterministic structural validation.
5. A visual style matching `targetType` is explicitly selected.

### Automatic Approval Invalidation Invariant
```
[Plan: Approved (v1)]
         │
         ├── Teacher modifies outline ────► Approval REVOKED (approvedVersion: null, status: 'ready', version: v2)
         │
         └── Teacher changes visual style ─► Approval REVOKED (approvedVersion: null, status: 'ready')
```
Whenever an outline or style is changed on an approved plan:
- Previous approval is **immediately invalidated**.
- `approvedVersion` is set to `null`.
- `status` returns to `'ready'`.
- A new immutable version snapshot is recorded in `generation_plan_versions`.
- Generation authorization is locked until the teacher re-approves the updated version.

---

## 5. Database Schema & Migration

File: [`supabase/migrations/20260929110000_generation_planning_foundation.sql`](file:///c:/novara%20project/gurupro-ai-journal-main/supabase/migrations/20260929110000_generation_planning_foundation.sql)

### Tables
1. **`public.generation_styles`**:
   - Stores canonical style definitions and metadata.
   - Pre-seeded with 13 presets (7 illustration + 6 presentation).
2. **`public.generation_plans`**:
   - `id`: PK
   - `module_id`: FK to `moduls.id` (CASCADE)
   - `user_id`: FK to `auth.users.id`
   - `target_type`: `'illustration' | 'presentation'`
   - `status`: `'draft' | 'ready' | 'approved' | 'generating' | 'completed' | 'failed' | 'archived'`
   - `current_version`: Integer
   - `approved_version`: Integer (nullable)
   - `selected_style_id`: Text (FK to `generation_styles.id`)
   - `outline`: JSONB
   - `provenance`: JSONB
   - Unique constraint: `(module_id, target_type, COALESCE(section_id, ''))`
   - RLS: Verified teacher ownership enforced on SELECT, INSERT, UPDATE, DELETE.
3. **`public.generation_plan_versions`**:
   - `id`: PK
   - `plan_id`: FK to `generation_plans.id` (CASCADE)
   - `version_number`: Integer
   - `outline_snapshot`: JSONB (immutable)
   - `style_snapshot`: JSONB (immutable)
   - `change_metadata`: JSONB
   - `is_approved`: Boolean
   - Unique constraint: `(plan_id, version_number)`

---

## 6. UI Integration in Modul Editor

Integrated into [`src/components/modul-editor.tsx`](file:///c:/novara%20project/gurupro-ai-journal-main/src/components/modul-editor.tsx) via [`src/components/generation-planning-panel.tsx`](file:///c:/novara%20project/gurupro-ai-journal-main/src/components/generation-planning-panel.tsx):

- **Tab 4 (`ilustrasi`)**:
  - Displays `<IllustrationPlanningPanel moduleId={modul.id} moduleTitle={modul.judul} />`.
  - 5-step interactive workflow:
    1. Draf Outline Status & Provenance
    2. Tinjau & Edit Outline (Subjek, Latar, Komposisi, Sudut Pandang, Fokus Edukasi, Hal Dihindari)
    3. Pilih Gaya Ilustrasi (7 kartu preset)
    4. Persetujuan Rencana (Approval Gate & status badge)
    5. Otorisasi Generasi (Spesifikasi AI & Tombol "Generate Gambar Nyata" bertanda dinonaktifkan / VIS-1 Segera Hadir)
  - Quick mockup generator and PDF/Word download buttons are preserved.

- **Tab 5 (`ppt`)**:
  - Displays `<PresentationPlanningPanel moduleId={modul.id} moduleTitle={modul.judul} />`.
  - 5-step interactive workflow:
    1. Metadata Global & Alur Pembelajaran
    2. Tinjau, Edit, Urutkan (Up/Down), dan Tambah/Hapus Slide
    3. Pilih Gaya Desain Slide (6 kartu preset)
    4. Persetujuan Rencana Slide (Approval Gate)
    5. Otorisasi Generasi Presentasi AI (Spesifikasi PPTX 16:9 & Tombol "Generate PPTX Nyata" bertanda dinonaktifkan / PPT-1 Segera Hadir)
  - Quick slide preview and PPT download buttons are preserved.

---

## 7. Verification & Test Suite

File: [`tests/ai/generation-planning-foundation.test.mjs`](file:///c:/novara%20project/gurupro-ai-journal-main/tests/ai/generation-planning-foundation.test.mjs)

Total Scenarios: **36 passed, 0 failed (100% pass rate)**

| Section | Scenarios Verified | Result |
| :--- | :--- | :--- |
| **Section 1: Illustration Outline Contract Validation** | Valid outline, short title rejection, empty subject rejection, short objective rejection | **PASS** |
| **Section 2: Presentation Outline & Slide Validation** | Valid outline, 0 slides rejection, non-continuous slide numbers rejection, empty key points rejection | **PASS** |
| **Section 3: Slide Manipulation Operations** | Add slide sequential ordering, remove slide re-indexing, prevent removing only slide, reorder 1..N continuous, reject invalid IDs, update slide | **PASS** |
| **Section 4: Style System & Presets Invariants** | 7 illustration presets, 6 presentation presets, getStyleById resolution and fallback | **PASS** |
| **Section 5: Grounded Initial Plan Generation** | Grounding on section/modul metadata, whole modul presentation sequence, initial plan v1 ready status, invalid outline rejection | **PASS** |
| **Section 6: Version Lifecycle & Immutable Snapshots** | Version bump v1->v2 with immutable snapshot, non-owner teacher rejection | **PASS** |
| **Section 7: Approval Gate & State Machine** | Transition to approved, style requirement check, owner teacher guard, student role rejection, approval revocation | **PASS** |
| **Section 8: Automatic Approval Invalidation Policy** | Outline edit revokes approval, style change revokes approval, target type mismatch rejection | **PASS** |
| **Section 9: Generation Authorization Specification** | Approved plan specification creation, 16:9 presentation spec, unapproved plan rejection, stale version rejection | **PASS** |
| **Section 10: Non-Generation & Cost-Control Invariant** | Strictly zero external image / PPT APIs called, zero binary rendering during planning | **PASS** |

### Build Status
- `npm test`: **36 test suites passed (100%)**
- `npx vite build`: **Clean build with 0 errors, nitro worker generated**
