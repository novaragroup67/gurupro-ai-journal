# PPT-1F — Final PPTX Quality, Security & End-to-End Gate

## 1. Overview & Architectural Role

Stage **PPT-1F** establishes the authoritative, deterministic final quality gate for AI-generated PowerPoint (`.pptx`) presentations within the GuruPro platform. It serves as the definitive barrier between presentation authoring and final distribution:

$$\text{Generation Request} \rightarrow \text{Slide Plan} \rightarrow \text{AI Content} \rightarrow \text{Illustration Integration} \rightarrow \text{PPTX Rendering} \rightarrow \text{Teacher Review} \rightarrow \mathbf{Approval} \rightarrow \mathbf{PPT-1F\ Final\ Quality\ Gate} \rightarrow \mathbf{Secure\ Download}$$

### Sovereign Human Authority & Strict Gatekeeper
- Under no circumstance can a presentation bypass teacher approval.
- An unapproved (`generated`), pending (`in_review`), or rejected presentation strictly **fails closed** with `PRESENTATION_QUALITY_GATE_BLOCKED` and `PRESENTATION_NOT_APPROVED`.
- AI evaluation (Tier 6) is strictly **advisory** — it provides pedagogical consistency metrics (coherence, completeness, readability) but never overrides human teacher decision.
- Only presentations whose evaluation has `status = "passed"` and `decision = "PASS"` can be downloaded via `downloadPresentationPptxServerFn`.
- Any attempt by students (`siswa`) or other teachers (cross-tenant) to download is blocked with `ROLE_FORBIDDEN` (403).

---

## 2. Six-Tier Deterministic Quality Verification

The quality gate evaluates 6 distinct tiers in sequential order:

| Tier | Name | Target Checks | Failure Code | Severity |
|---|---|---|---|---|
| **Tier 1** | Preconditions & Sovereignty | Teacher review status must be `'approved'`, versions must match exactly, SHA-256 binary hash matches stored hash. | `PRESENTATION_NOT_APPROVED`, `VERSION_MISMATCH`, `ARTIFACT_HASH_MISMATCH` | Critical |
| **Tier 2** | OpenXML Package Structure | ZIP magic signature (`PK\x03\x04`), presence of `[Content_Types].xml`, `_rels/.rels`, `ppt/presentation.xml`, `ppt/_rels/presentation.xml.rels`, exact slide parts count (`ppt/slides/slideN.xml`), broken internal relationship target detection. | `INVALID_ZIP_MAGIC`, `CORRUPTED_ZIP_ARCHIVE`, `MISSING_REQUIRED_XML_PARTS`, `SLIDE_COUNT_MISMATCH`, `BROKEN_RELATIONSHIP` | Critical |
| **Tier 3** | Content Integrity | Cross-checks XML text in each slide part against approved `PresentationContentPackage`. Verifies slide titles, pedagogical key points, and bullet points. | `MISSING_SLIDE_PART`, `MISSING_SLIDE_TITLE`, `MISSING_CONTENT_BLOCKS` | Critical / Warning |
| **Tier 4** | Illustration Integrity | Validates that every referenced illustration is `reviewStatus = 'approved_for_use'`, `lifecycleStatus != 'archived'`, embedded in `ppt/media/`, and registered in `slideN.xml.rels`. | `UNAPPROVED_ILLUSTRATION`, `REVOKED_ILLUSTRATION`, `MISSING_ILLUSTRATION_ASSET`, `MISSING_MEDIA_RELATIONSHIP` | Critical |
| **Tier 5** | Visual Layout & Bounds | Validates canvas boundaries (16:9 widescreen: 13.333" $\times$ 7.5"), verifies non-overlapping coordinates for side-by-side placements, and detects blank slides. | `VISUAL_OVERFLOW`, `BLANK_SLIDE_DETECTED` | Critical |
| **Tier 6** | Advisory AI Consistency | Evaluates pedagogical coherence, completeness, and educational readability without mutating content or overriding teacher authority. | Advisory findings | Info / Advisory |

---

## 3. Database Schema & Multi-Tenant RLS

Table `public.presentation_quality_evaluations`:
- `id` (UUID PK)
- `artifact_id` (UUID FK -> `presentation_artifacts.id`)
- `content_result_id` (UUID FK -> `presentation_content_results.id`)
- `generation_plan_id` (UUID FK -> `generation_plans.id`)
- `module_id` (UUID FK -> `modul_ajar.id`)
- `artifact_hash` (TEXT, 64-char SHA-256)
- `presentation_version` (INTEGER)
- `approved_version` (INTEGER)
- `evaluator_version` (TEXT)
- `status` (TEXT: `pending`, `passed`, `failed`, `superseded`)
- `decision` (TEXT: `PASS`, `FAIL`, `ERROR`)
- `structural_checks`, `content_checks`, `illustration_checks`, `visual_checks`, `ai_evaluation` (JSONB)
- `findings` (JSONB array of `PresentationQualityFinding`)
- `evaluated_by` (UUID FK -> `auth.users.id`)
- `evaluated_at`, `created_at`, `updated_at` (TIMESTAMPTZ)

Row-Level Security (RLS) ensures teachers can only read, evaluate, and update records for generation plans they own (`generation_plans.user_id = auth.uid()`).

---

## 4. Server Functions & Client Integration

### Server Functions (`src/lib/presentation-quality.functions.ts`)
1. `evaluatePresentationQualityServerFn`: Runs the 6-tier evaluation, supersedes previous evaluations if version bumped, caches result idempotently.
2. `getPresentationQualityEvaluationServerFn`: Retrieves evaluation by artifact ID or evaluation ID.
3. `listPresentationQualityEvaluationsServerFn`: Lists evaluation history for a generation plan.
4. `downloadPresentationPptxServerFn`: Strict gatekeeper download endpoint returning binary buffer only when `status = 'passed'` and `decision = 'PASS'`.

### Store & UI (`src/lib/generation-planning-store.ts` & `src/components/generation-planning-panel.tsx`)
- State: `presentationQualityEvaluation`, `evaluatingPresentationQuality`, `presentationQualityError`.
- Actions: `loadPresentationQualityEvaluation()`, `evaluatePresentationQuality()`, `downloadApprovedPresentationPptx()`.
- UI Card: **Gerbang Mutu PPTX (PPT-1F)** displays decision badge (`PASS` / `FAIL`), individual tier statuses (Struktur, Konten, Ilustrasi, Tata Letak, Versi, AI), and a secure Download button that unlocks only upon passing the quality gate.

---

## 5. Verification & Test Coverage

- **Unit Suite (`tests/ai/presentation-quality-gate.test.mjs`)**: 64 tests across 10 suites covering contracts, preconditions, OpenXML structure, content integrity, illustrations, versions, visual boundaries, AI sovereignty, idempotency, and RBAC downloads. All 64 passed.
- **Live E2E Suite (`tests/ai/live-presentation-quality-gate-test.mjs`)**: 15-step complete lifecycle chain from generation plan to secure download, including negative scenarios (corrupted ZIP, version mismatch, revoked illustration). All 15 passed.
- **Regression Suite (`npm test`)**: Aggregates all 47 project test suites including PPT-1A through PPT-1F.
- **Typecheck & Production Build (`npm run build`)**: 0 errors.
