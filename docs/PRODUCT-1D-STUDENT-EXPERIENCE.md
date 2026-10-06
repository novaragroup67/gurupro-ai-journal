# GuruPro Stage Documentation: PRODUCT-1D — Student Experience Optimization

## 1. Overview & Objective
**Stage**: PRODUCT-1D (Student Experience Optimization)  
**Parent Pipeline**: Foundation → Auth → Kelas → AI Modul Ajar → AI Generator Soal → Penugasan → Student Submission → Penilaian → PPT/Illustration Pipeline → QA → GO-LIVE-1 → OPS-1 → OPS-2 → PRODUCT-1A → PRODUCT-1B → PRODUCT-1C → PRODUCT-1D  
**Goal**: Streamline the student journey:
`Dashboard → Penugasan → Open Assignment → Read Instructions → Answer Questions → Save Progress → Review Answers → Submit → Submitted State → View Result`
by eliminating ambiguity in assignment statuses, making save/error states obvious, providing a question navigator palette with accessible radio options, preventing accidental data loss, and maintaining strict multi-tenant RLS isolation.

All modifications follow the core principles:
- Zero grading algorithm or database schema alterations.
- Strict preservation of server-side authorization and multi-tenant RLS isolation (student reads and writes are restricted to their own submissions).
- Strict zero-leakage invariant: questions delivered to students are stripped of answer keys (`kunci`) and explanations (`pembahasan`).
- Mobile-first, responsive layouts and WCAG-compliant keyboard and screen-reader accessibility.

---

## 2. Evidence & Prioritized Student Experience Problems

| # | Student Workflow Area | Identified Friction / Uncertainty | Root Cause | Implemented Solution |
|---|---|---|---|---|
| **1** | **Assignment Discovery & Status Clarity** | Students could not easily distinguish what to do next across multiple cards (e.g., distinguishing new, in-progress draft, awaiting grading, or graded assignments). In addition, deadlines lacked relative urgency cues. | Assignment cards used generic status badges; actions did not differentiate between initial start and continuing draft work; no quick filter for pending vs. completed work. | Added `computeDeadlineInfo()` with relative time badges (`Tenggat Waktu Berakhir`, `Sisa N hari/jam`, `Mendekati Tenggat`). Added `getStudentAssignmentState()` resolving 5 authoritative states (`belum_dikerjakan`, `sedang_dikerjakan`, `sudah_dikumpulkan`, `sudah_dinilai`, `ditutup`) with differentiated action buttons (`Mulai Mengerjakan`, `Lanjutkan Mengerjakan`, `Lihat Pengumpulan`, `Lihat Hasil`, `Lihat Tugas`). Added category tabs (`Perlu Dikerjakan`, `Selesai`, `Semua`) in `SiswaPenugasanView`, and a dedicated dashboard widget `"Tugas Belajar Perlu Dikerjakan"`. |
| **2** | **Question Navigation & Answering Accessibility** | In long assignments, students had to scroll continuously up and down to find unanswered questions or jump back to review. Standard radio inputs lacked keyboard focus rings and ARIA accessibility roles. | Questions were rendered purely linearly without an index palette or visual completion metric. Radio options relied on basic styling without ARIA radio group attributes. | Added **Question Navigator Palette** (`role="navigation"`) with numbered badges (1..N) displaying answered (solid primary) vs unanswered (outline) states and smooth 1-click jump to each card. Added visual progress bar (`role="progressbar"`) displaying percentage. Refactored multiple-choice options into accessible radio groups (`role="radiogroup"`, `role="radio"`, `aria-checked`, visible focus rings). |
| **3** | **Save Reliability, Error Recovery & Submission Safety** | Students feared losing progress during draft answering if network connectivity dipped. Submitting was confirmed with a generic dialog without identifying unanswered questions, leading to accidental incomplete submissions. | Autosave status lacked an explicit retry button upon failure. Pre-submission modal did not calculate which question numbers were missing before final confirmation. | Added red error banner with explicit `"Coba Simpan Ulang"` retry handler. Added `beforeunload` event listener and guarded back navigation while autosave is in flight. Rebuilt submission modal into an informative pre-submission review displaying answered vs. unanswered question counts, specific missing numbers (`Soal #3, #7`), a 1-click jump button (`Buka Soal #3`), and irreversible lock warnings. |

---

## 3. Detailed Implementation Reference

### 3.1 Improvement #1: Assignment Discovery, Status Badges & Action Distinction
- **Store Functions** ([`src/lib/pengumpulan-store.ts`](file:///c:/novara%20project/gurupro-ai-journal-main/src/lib/pengumpulan-store.ts)):
  - `computeDeadlineInfo(deadlineIso)`: Computes deadline date formatting, `isPassed`, `isUrgent` (<24h / <3d), and relative textual description.
  - `getStudentAssignmentState(assignment, submission)`: Maps assignments and student submissions to 5 canonical states with custom labels, badge variants, and action button text.
  - `getMySubmissionsMap()`: Fetches all student submissions in a single query indexed by `penugasanId` for $O(1)$ lookups without $N+1$ client overhead.
- **Assignment View** ([`src/routes/penugasan.tsx`](file:///c:/novara%20project/gurupro-ai-journal-main/src/routes/penugasan.tsx)):
  - Correlates each assignment with `submissionsMap[item.id]`.
  - Added filter tabs: `Perlu Dikerjakan ({count})`, `Selesai ({count})`, and `Semua`.
  - Deep-link support: Automatically activates assignment when `search.penugasanId` is present in URL.
- **Student Dashboard** ([`src/routes/index.tsx`](file:///c:/novara%20project/gurupro-ai-journal-main/src/routes/index.tsx)):
  - Displays high-priority section **"Tugas Belajar Perlu Dikerjakan"** featuring active assignments with deadline urgency and direct link to `/penugasan?penugasanId=...`.
- **Grade History Navigation** ([`src/routes/penilaian.tsx`](file:///c:/novara%20project/gurupro-ai-journal-main/src/routes/penilaian.tsx)):
  - Grade history table assignment titles link directly to `/penugasan?penugasanId=...` for 1-click review.

### 3.2 Improvement #2: Question Navigator Palette, Visual Progress & Accessibility
- **Question Navigator Palette** ([`src/routes/penugasan.tsx`](file:///c:/novara%20project/gurupro-ai-journal-main/src/routes/penugasan.tsx)):
  - Renders a sticky palette above questions with `role="navigation"` and `aria-label="Daftar nomor butir soal"`.
  - Numbered buttons `1..N` reflect filled status (`answers[s.id]` non-empty).
  - Clicking a badge triggers `scrollIntoView({ behavior: "smooth", block: "center" })` to `#soal-card-${id}`.
- **Visual Progress Bar**:
  - Accessible progress bar with `role="progressbar"`, `aria-valuenow`, and `aria-valuemax`.
  - Computes completion percentage: `Math.round((answeredCount / totalSoal) * 100)%`.
- **Radio Group Accessibility**:
  - Multiple-choice options implement `role="radiogroup"` with individual options using `role="radio"` and `aria-checked={isSelected}`.
  - Keyboard accessible with clear focus ring (`focus-visible:ring-2 focus-visible:ring-primary`).

### 3.3 Improvement #3: Save Reliability, Error Recovery & Pre-Submission Review Modal
- **Autosave Recovery & Guards** ([`src/routes/penugasan.tsx`](file:///c:/novara%20project/gurupro-ai-journal-main/src/routes/penugasan.tsx)):
  - Added `handleRetrySave` button when `savingStatus === "error"`, allowing 1-click retry.
  - Added `window.addEventListener("beforeunload", ...)` guard and protected `handleSafeBack` to prevent data loss while background saving is in progress.
- **Pre-Submission Review Modal**:
  - Calculates answered questions and unanswered question numbers (e.g. `unansweredIndices = [3, 7]`).
  - Displays amber warning banner with missing question list when incomplete.
  - Provides a 1-click shortcut button (`"Buka Soal #3"`) to jump immediately to the first missing question.
  - Enforces explicit confirmation with double-submission prevention (`disabled={submittingFinal}`).

---

## 4. Verification & Regression Coverage
- **Dedicated Test Suite**: `npm run test:product1d` (`tests/ux/product-student-experience.test.mjs`)
  - **16/16 test cases passed**:
    - Section 1: Assignment Discovery, Status Clarity & Action Distinction (4/4)
    - Section 2: Student Dashboard Pending Work Prioritization (2/2)
    - Section 3: Question Navigation Palette, Visual Progress & Accessibility (3/3)
    - Section 4: Save Reliability, Error Recovery & Unsaved Guards (2/2)
    - Section 5: Pre-Submission Review & Irreversibility Safeguards (2/2)
    - Section 6: Deadline Calculation & Authoritative Urgency (1/1)
    - Section 7: Student Grade History Navigation & Security Invariants (2/2)
- **Preceding Suites Verified**:
  - `npm run test:product1c`: 13/13 passed
  - `npm run test:golive`: 29/29 passed
  - `npm run test:ops`: 26/26 passed
  - `npm run test:ops2`: 16/16 passed
  - `npm run test:uat`: 51/51 passed
  - `npm run verify:release-parity`: 6/6 passed
  - `npm run lint`: 0 errors
  - `npm run build`: 100% clean build in 874ms
