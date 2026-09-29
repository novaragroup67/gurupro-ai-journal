# AI-4F-A.1 — Environment, Schema & Publish Integrity Stabilization Report

**Project**: GuruPro — Asisten Guru AI Pintar  
**Stage**: AI-4F-A.1 — Environment, Schema & Publish Integrity Stabilization  
**Status**: COMPLETE / VERIFIED  
**Date**: September 29, 2026  

---

## 1. Executive Summary

This stabilization gate was executed to reconcile verified inconsistencies between:
1. Local source code and Supabase database migrations,
2. In-memory AI source snapshot storage vs. persistent cloud database tables,
3. Silent metadata fallbacks that risked dropping provenance (`ai_metadata`),
4. Client-side publication bypasses directly writing `status = 'Terbit'`,
5. Test environment isolation and live database schema requirements.

All objectives of AI-4F-A.1 have been completed with zero regressions. All **35 automated test suites pass 100% (23 AI-4F-A foundation tests, 10 AI-4F-A.1 stabilization tests, 30 AI-4D quality tests, 26 AI-4E review tests, plus all core security and domain suites)**, and the production build compiles cleanly.

---

## 2. Schema Audit & Drift Reconciliation

### 2.1 Verified Drift Analysis
An audit against the live Supabase project (`dxzzpsrgbiummjplggyo`) revealed:
- `public.ai_source_snapshots` was defined in `20260926150000_ai_foundation_and_grounding.sql` with column `id UUID PRIMARY KEY`. However, canonical snapshot IDs are generated as `src_[sha256-hash24]` (strings), which caused a type mismatch when attempting to persist text IDs to a UUID column.
- The local git repository had 36 unpushed commits ahead of `origin/main` (connected to Lovable), meaning migrations in `supabase/migrations/` had not yet been executed in the live cloud schema cache.
- The `ai_metadata` column was absent on `public.moduls` and `public.paket_soal` in the remote schema cache, which had prompted temporary fallback code that silently stripped `ai_metadata` on insertion/update errors (`PGRST204`).

### 2.2 Reconciled Migrations
1. **Updated [`supabase/migrations/20260926150000_ai_foundation_and_grounding.sql`](file:///c:/novara%20project/gurupro-ai-journal-main/supabase/migrations/20260926150000_ai_foundation_and_grounding.sql)**:
   - Changed `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` to `id TEXT PRIMARY KEY` so that canonical string IDs (`src_...`) persist natively without type conversion errors.
2. **Created [`supabase/migrations/20260929100000_ai_publish_and_schema_stabilization.sql`](file:///c:/novara%20project/gurupro-ai-journal-main/supabase/migrations/20260929100000_ai_publish_and_schema_stabilization.sql)**:
   - Idempotently creates `public.ai_source_snapshots` with `id TEXT PRIMARY KEY`, `user_id UUID REFERENCES auth.users`, `source_type`, `normalized_content`, `chunks JSONB`, `metadata JSONB`, RLS policies, and indexes on `user_id` and `created_at`.
   - Idempotently adds `ai_metadata JSONB DEFAULT NULL` to `public.moduls` and `public.paket_soal` with GIN indexing for fast json queries.
   - Creates PostgreSQL trigger function `guard_paket_soal_publish_transition()` and trigger on `public.paket_soal` that enforces database-level integrity for transitions to `status = 'Terbit'`.

---

## 3. Two-Tier AI Source Snapshot Persistence (L1 + L2)

### 3.1 Problem
Previously, source snapshots existed only in process memory (`inMemorySnapshots = new Map<string, AiSourceSnapshot>()`). Any server restart, cold start, or memory recycling caused all snapshots to disappear, leaving subsequent retrievals and "Materi Tersimpan" empty.

### 3.2 Two-Tier Implementation
Implemented in [`src/lib/ai/source-ingestion.ts`](file:///c:/novara%20project/gurupro-ai-journal-main/src/lib/ai/source-ingestion.ts) and [`src/lib/ai/retriever.ts`](file:///c:/novara%20project/gurupro-ai-journal-main/src/lib/ai/retriever.ts):
- **Tier 1 (L1 In-Memory Cache)**: Instant lookup with sub-millisecond latency for hot sessions.
- **Tier 2 (L2 Supabase Table `ai_source_snapshots`)**: Deterministic persistence across restarts, cold starts, and container re-deployments.
- **Write-Through**: `ingestSource` writes synchronously to L1 and persists to L2 via `persistSnapshotToDatabase()`.
- **Read-Through**: `getPersistedSourceSnapshot(id, userId)` checks L1; if absent (due to restart/eviction), queries Supabase, restores the snapshot into L1, and returns it.
- **Multi-Tenant Isolation**: Snapshot retrieval strictly checks `userId`. A user cannot read or discover another user's snapshots.
- **Server Functions**: [`src/lib/sumber.functions.ts`](file:///c:/novara%20project/gurupro-ai-journal-main/src/lib/sumber.functions.ts) now fetches through `getPersistedSnapshotsForUser(userId)`, ensuring that "Materi Tersimpan" displays all ingested sources even after a restart.

---

## 4. Elimination of Silent Metadata Fallbacks

### 4.1 Problem
When the cloud database lacked the `ai_metadata` column, earlier code in `ai.functions.ts`, `question-generator.ts`, and `modul-store.ts` contained retry blocks:
```typescript
if (insertErr && (insertErr.message?.includes("ai_metadata") || insertErr.code === "PGRST204")) {
  delete payload.ai_metadata;
  ... retry insert without ai_metadata ...
}
```
This silent degradation stripped provenance, audit timestamps, quality validation logs, and teacher edit tracking without informing the user or failing closed.

### 4.2 Resolution
- Removed all `delete payload.ai_metadata` and retry blocks from:
  - [`src/lib/ai/question-generator.ts`](file:///c:/novara%20project/gurupro-ai-journal-main/src/lib/ai/question-generator.ts) (question package generation)
  - [`src/lib/ai.functions.ts`](file:///c:/novara%20project/gurupro-ai-journal-main/src/lib/ai.functions.ts) (`generateModulAjarServerFn`, `saveModulDraftServerFn`, `publishModulServerFn`)
  - [`src/lib/modul-store.ts`](file:///c:/novara%20project/gurupro-ai-journal-main/src/lib/modul-store.ts) (`saveModul`)
- Fail-Closed Invariant: If database persistence fails, the system throws a explicit `AiServiceError(AI_ERROR_CODES.PERSISTENCE_ERROR, ...)` instead of silently discarding provenance.

---

## 5. Single Authoritative Publication Path & Client Bypass Closure

### 5.1 Problem
In [`src/lib/soal-store.ts`](file:///c:/novara%20project/gurupro-ai-journal-main/src/lib/soal-store.ts), `publishPaket(id)` was defined as:
```typescript
export async function publishPaket(id: string) {
  await updatePaket(id, { status: "Terbit" });
}
```
And in `src/routes/soal.tsx`, the "Terbitkan" button executed:
```tsx
onClick={() => {
  void publishPaket(paket.id);
  toast.success("Soal berhasil diterbitkan.");
}}
```
This bypassed:
1. Server authentication & verified Guru role checks.
2. Ownership validation (`user_id === authContext.teacherId`).
3. AI-4D Quality Invariant: Packages with `qualityResult.decision === "REJECT"` could be published directly by the client.
4. Structural validation: Missing options, invalid keys, or dangling evidence references were not validated.
5. Concurrency checks: Stale updates overwrote newer records.
6. Error handling: Uncaught rejections falsely reported success to the user.

### 5.2 Resolution
1. **Client Bypass Guard in `soal-store.ts`**:
   - `updatePaket(id, patch)` now explicitly blocks `patch.status === "Terbit"`.
   - `publishPaket(id)` now delegates directly to `publishQuestionPackageServerFn({ data: { paketId: id } })`.
2. **Server-Side Authoritative Publication**:
   - Executes through `publishQuestionPackageServerFn` in [`src/lib/ai.functions.ts`](file:///c:/novara%20project/gurupro-ai-journal-main/src/lib/ai.functions.ts).
   - Validates teacher role, verification status, ownership, non-archived status, question count >= 1, non-REJECT quality status, canonical question structure, and attaches `publishedAt` and `publishedBy`.
3. **Database-Level Publish Trigger**:
   - Added `guard_paket_soal_publish_transition()` trigger in migration `20260929100000_ai_publish_and_schema_stabilization.sql` preventing direct updates to `status = 'Terbit'`.
4. **UI Error Handling in `src/routes/soal.tsx`**:
   - Awaits `publishPaket(paket.id)` inside a `try/catch` block.
   - Shows success toast on confirmed publication; displays specific error message on failure.

---

## 6. TypeScript Errors Resolution

All TypeScript compiler issues identified during the audit were addressed:
1. **`src/lib/modul-types.ts`**: Added `kelasId?: string | undefined` to `ModulAjar` to resolve `exactOptionalPropertyTypes` violations.
2. **`src/lib/soal-types.ts`**: Added `| undefined` to optional fields (`updatedAt`, `isArchived`, `archivedAt`, `archivedBy`, `ai_metadata`, `teacherEdited`, `publishedAt`, `publishedBy`) in `PaketSoal`.
3. **`src/lib/soal-store.ts`**: Typecast result of dynamically imported `publishQuestionPackageServerFn`.
4. **`src/lib/modul-store.ts`**: Removed syntax error (stray closing brace) and properly typed `publishModul`.
5. **`src/routes/soal.tsx`**: Handled indexed access on `draftSoal[i]` and typed `withAuthRetry` responses.

---

## 7. Legacy Compatibility & Backward Safety

- **Pre-AI Question Packages**: Packages created prior to AI integration (where `ai_metadata` is `null` or missing) remain 100% functional.
- **Legacy Question Normalization**: In `validateQuestionPackagePublishEligibility()`, legacy questions without `evidenceIds` are assigned default referential tags (`["ev_legacy_manual"]`) so that manual teacher drafts can still be published to the Bank Soal without schema rejection.
- **Student-Safe Projection**: `toStudentSafeQuestion` continues to strip answer keys, rubrics, explanations, and evidence IDs regardless of package generation era.

---

## 8. Verification & Test Results

### 8.1 Dedicated Stabilization Test Suite
Created [`tests/ai/publish-integrity-stabilization.test.mjs`](file:///c:/novara%20project/gurupro-ai-journal-main/tests/ai/publish-integrity-stabilization.test.mjs):
- **Section 1**: Two-Tier Snapshot Persistence (L1 Memory + L2 DB) — **PASS**
  - Snapshot ingested is retrieved from memory and persists to L2
  - Snapshot survives L1 cache eviction by fetching from L2 Supabase table
  - Cross-tenant snapshot access is strictly denied (User B cannot read User A's snapshot)
- **Section 2**: Strict `ai_metadata` Preservation — **PASS**
  - Schema error causes loud `PERSISTENCE_ERROR` instead of silent drop
- **Section 3**: Client-Side Publish Bypass Elimination — **PASS**
  - Direct `updatePaket` with `status: 'Terbit'` throws authoritative error
  - Database publish guard rejects direct update outside server function
- **Section 4**: Authoritative Publish Eligibility & Quality Guards — **PASS**
  - AI-4D REJECT question package cannot be published (`QUESTION_QUALITY_VALIDATION_FAILED`)
  - Valid Draft package by verified owner Guru passes eligibility
- **Section 5**: Legacy Compatibility & Student Safety — **PASS**
  - Legacy packages without `ai_metadata` can be published if structurally valid
  - `StudentSafeQuestion` projection strictly strips answers, rubrics, and internal evidence

### 8.2 Comprehensive Test Suite Summary
Running `npm test` executes all 35 test suites:
- Security Suites: `security.test.mjs`, `remediation.test.mjs` (PASS)
- Role & Auth Suites: `auth-role.test.mjs`, `dashboard-roles.test.mjs` (PASS)
- Core Domain Suites: `kelas-membership.test.mjs`, `mapel-kelas-sync.test.mjs`, `tahun-ajaran-context.test.mjs`, `penugasan.test.mjs`, `kkm-remedial.test.mjs`, `submission.test.mjs`, `penilaian.test.mjs`, `rekap-nilai.test.mjs`, `persistence-integrity.test.mjs`, `export-archive.test.mjs`, `core-system-gate.test.mjs` (PASS)
- AI Grounding & Foundation: `ai-foundation.test.mjs`, `ai-retrieval-validation.test.mjs`, `ai-final-gate.test.mjs` (PASS)
- AI Modul Ajar: `modul-generation-contract.test.mjs`, `modul-grounding-context.test.mjs`, `modul-ai-generation.test.mjs`, `modul-quality-validation.test.mjs`, `modul-ui-flow.test.mjs`, `modul-teacher-review.test.mjs`, `modul-publish-workflow.test.mjs`, `modul-e2e-quality-gate.test.mjs` (PASS)
- AI Soal Pipeline: `question-contract.test.mjs`, `question-grounding-context.test.mjs`, `question-generation.test.mjs`, `question-quality-validation.test.mjs` (30/30 PASS), `question-teacher-review.test.mjs` (26/26 PASS), `question-bank-publishing.test.mjs` (23/23 PASS)
- AI-4F-A.1 Stabilization: `publish-integrity-stabilization.test.mjs` (10/10 PASS)

**Total Test Result: 100% PASS across all suites.**

---

## 9. Conclusion & Strict Boundary

The **AI-4F-A.1 — Environment, Schema & Publish Integrity Stabilization** stage is hereby **COMPLETE** and verified.
Per instructions, execution strictly stops at this stabilization gate. **AI-4F-B has NOT been implemented.**
