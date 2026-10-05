# PPT-1E — Teacher Review & Approval Workflow

## 1. Overview & Architectural Role

Stage **PPT-1E** implements the human review and approval gate for AI-generated presentations within GuruPro.

Prior to this stage:
- **PPT-1A through PPT-1C** converted approved pedagogical plans into structured multi-slide content and rendered real OpenXML `.pptx` presentations.
- **PPT-1D** integrated approved illustrations from **VIS-1A through VIS-1E** directly into PPTX rendering.

In PPT-1E:
- Generated presentations enter a formal teacher review lifecycle:
  $$\text{Generated Presentation} \longrightarrow \text{Teacher Preview} \longrightarrow \text{Review / Edit Feedback} \longrightarrow \text{Approve or Reject} \longrightarrow \text{Approved Presentation}$$
- Teacher approval is the **definitive human authority** before the presentation can advance to the technical quality gate (**PPT-1F**).
- Automated AI self-approval is strictly forbidden.
- Modifying presentation content or outlines invalidates earlier approvals, transitioning them to `superseded`.

---

## 2. Invariants & Security Principles

### Strict Human Authority (Zero Automated Approval)
- Presentation approvals can **only** be executed by an authenticated teacher (`guru` role).
- No background task, AI model, or automated heuristic can set `review_status = "approved"`.
- Requests by unauthenticated users or students (`siswa`) fail closed with `ROLE_FORBIDDEN` / `UNAUTHORIZED`.

### State Machine Lifecycle
The review workflow is governed by 5 explicit states:
1. `generated` — Initial state immediately following successful PPT-1C / PPT-1D presentation generation.
2. `in_review` — The teacher has inspected the presentation slides and begun review.
3. `approved` — The teacher has verified content, pedagogical quality, and illustrations, authorizing presentation use.
4. `rejected` — The teacher has rejected the presentation, recording actionable feedback notes.
5. `superseded` — A previously approved review superseded when a newer presentation version is approved.

#### Transition Matrix
| From State | Allowed Target States | Description / Invariant |
| :--- | :--- | :--- |
| `generated` | `in_review`, `approved`, `rejected` | Review start or direct decision from preview |
| `in_review` | `approved`, `rejected` | Terminal decision by teacher |
| `approved` | `superseded`, `in_review` | Superseded by newer version or re-opened for edits |
| `rejected` | `in_review` | Re-opened for review after plan adjustments |
| `superseded` | *(None — Terminal)* | Cannot revert or reuse a superseded version |

Any unauthorized or illegal state transition triggers typed error `PRESENTATION_REVIEW_INVALID_TRANSITION`.

### Version Integrity & Cryptographic Binding
- Approvals are strictly bound to `content_result_id`, `approved_version`, and `generation_plan_id`.
- Modifying content, slide counts, or pedagogical plans creates a new version.
- Stale approvals cannot authorize newer presentations (`PRESENTATION_REVIEW_VERSION_MISMATCH`).
- When a newer version (e.g. v2) is approved, any previous approvals for that plan are automatically updated to `superseded` (`PRESENTATION_APPROVAL_SUPERSEDED`).

### Illustration Approval Gatekeeper
- If a presentation references illustrations (via PPT-1D), the review engine audits each asset against VIS-1D / VIS-1E records (`auditPresentationIllustrations`).
- **Rule**: Every referenced illustration must have `review_status === "approved_for_use"`.
- If any illustration is missing, pending, rejected, or revoked, presentation approval is blocked immediately with `PRESENTATION_APPROVAL_BLOCKED`.

### Non-Destructive Rejection
- Rejection preserves all generated files and metadata without deletion.
- A descriptive feedback note from the teacher (`teacher_notes`) is mandatory.
- Rejection does **not** trigger automatic AI generation or infinite regeneration loops. Teachers retain full control over whether and when to re-generate.

### Multi-Tenant Isolation & RBAC
- Teacher reviews are isolated by teacher ID (`reviewed_by`).
- Teacher A cannot access, approve, or reject presentations owned by Teacher B (`ROLE_FORBIDDEN`).
- Enforced at both the server function layer and Supabase Row Level Security (RLS).

---

## 3. Database Schema

Migration: `supabase/migrations/20261002090000_presentation_reviews.sql`

```sql
CREATE TABLE IF NOT EXISTS public.presentation_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  presentation_id TEXT NOT NULL,
  content_result_id TEXT NOT NULL,
  generation_plan_id UUID NOT NULL REFERENCES public.generation_plans(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES public.modul_ajar(id) ON DELETE CASCADE,
  approved_version INTEGER NOT NULL DEFAULT 1,
  review_status TEXT NOT NULL DEFAULT 'generated' CHECK (
    review_status IN ('generated', 'in_review', 'approved', 'rejected', 'superseded')
  ),
  teacher_notes TEXT,
  validation_summary JSONB DEFAULT '{}'::jsonb,
  reviewed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
```

### Row Level Security (RLS) Policies
1. `presentation_reviews_select_teacher`: Teachers can select reviews where `reviewed_by = auth.uid()` or where they own the underlying module.
2. `presentation_reviews_insert_teacher`: Teachers can only insert reviews for their own user ID (`reviewed_by = auth.uid()`).
3. `presentation_reviews_update_teacher`: Teachers can only update their own review records.
4. `presentation_reviews_delete_teacher`: Teachers can only delete their own review records.

---

## 4. Error Taxonomy

Added to `src/lib/ai/error-taxonomy.ts`:
- `PRESENTATION_REVIEW_NOT_FOUND` (404): Review record not found for the requested presentation.
- `PRESENTATION_REVIEW_INVALID_TRANSITION` (409): State transition violates the review state machine.
- `PRESENTATION_REVIEW_VERSION_MISMATCH` (409): Attempting to approve a presentation version different from the active content result.
- `PRESENTATION_APPROVAL_BLOCKED` (422): Approval blocked due to unapproved illustrations or critical validation failures.
- `PRESENTATION_APPROVAL_SUPERSEDED` (409): Attempting to use or modify an approval that was superseded by a newer version.

---

## 5. Server Functions & Store Integration

### Server Functions (`src/lib/presentation-review.functions.ts`)
- `executeGetPresentationReview`: Retrieves current review status and audit details.
- `executeStartPresentationReview`: Transitions status from `generated` to `in_review`.
- `executeApprovePresentation`: Validates illustration approvals, checks version match, transitions to `approved`, and marks prior versions as `superseded`.
- `executeRejectPresentation`: Enforces mandatory `teacher_notes` and transitions status to `rejected`.
- `executeUpdatePresentationReviewNotes`: Updates teacher feedback notes during review.
- `executeListPresentationReviews`: Lists review history for a generation plan.

All endpoints are wrapped with TanStack Start `createServerFn` and secured with `requireTeacherAiAuth`.

### Reactive Zustand Store (`src/lib/generation-planning-store.ts`)
- State: `presentationReview`, `reviewingPresentation`, `presentationReviewError`.
- Actions: `loadPresentationReview`, `startPresentationReview`, `approvePresentation`, `rejectPresentation`, `updatePresentationReviewNotes`, `resetPresentationReview`.

### User Interface (`src/components/generation-planning-panel.tsx`)
- Teacher review panel displays review status badges (`Disetujui`, `Ditolak`, `Sedang Direview`, `Tergantikan`).
- Per-slide visual indicators show illustration approval status (`✓ Ilustrasi Disetujui Guru` vs `⚠ Belum Disetujui Guru`).
- Responsive controls for `Setujui Presentasi`, `Tolak & Beri Catatan`, and `Buka Kembali Review`.
- Approval blocks with clear user-facing error messages if unapproved illustrations are present.

---

## 6. Verification & Test Results

### Automated Test Suite (`npm run test:ppt1e`)
- **Total Tests**: 48
- **Passed**: 48 (100%)
- **Failed**: 0

Test coverage breakdown:
1. Review status schemas & state transition rules (Tests 1–6)
2. Illustration audit & approval gatekeeper (Tests 7–12)
3. Lifecycle flow & state transitions (Tests 13–18)
4. Version integrity & superseded handling (Tests 19–22)
5. Multi-tenant isolation & teacher-only RBAC (Tests 23–26)
6. Non-destructive rejection semantics (Tests 27–30)
7. Non-generation invariant (Zero AI generation calls) (Tests 31–33)
8. End-to-end integration with PPT-1D & OpenXML package (Tests 34–38)
9. Edge cases & error handling (Tests 39–44)
10. Server functions & idempotency (Tests 45–48)

### Live Step-by-Step Test (`tests/ai/live-presentation-teacher-review-test.mjs`)
- Step 1: Initialize review (`generated`) — PASS
- Step 2: Transition to `in_review` — PASS
- Step 3: Block approval with unapproved illustration — PASS (`PRESENTATION_APPROVAL_BLOCKED`)
- Step 4: Approve after illustration approved — PASS (`approved`)
- Step 5: Verify OpenXML package embedding — PASS
- Step 6: Create v2, approve v2, and verify v1 marked `superseded` — PASS
- Step 7: Rejection with feedback notes — PASS (`rejected`, notes recorded)
- Step 8: Multi-tenant & RBAC security — PASS (Tenant B & student rejected)
