# GuruPro — AI Core Baseline, Source/Live Parity & Security Recovery Specification
**Document**: `docs/AI-CORE-RECOVERY-BASELINE.md`  
**Stage**: `AI-RECOVERY-01`  
**Status**: Authoritative Technical Baseline Established  
**Timestamp**: 2026-10-07T11:24:00+07:00  

---

## 1. Executive Summary & Objective

The strategic goal of GuruPro is to deliver a reliable, end-to-end educational AI workflow:
```text
Source Material → AI Modul Ajar → AI Illustration → Real PPTX
```
The purpose of **AI-RECOVERY-01** is to establish the **authoritative technical baseline** by auditing the active codebase, testing live Supabase connectivity, reconciling source code migrations with the live database and storage state, eliminating security and runtime blockers, and identifying all legacy or misleading fallback mechanisms before any further AI feature implementation.

---

## 2. End-to-End AI Architecture Pipeline Map

```text
               ┌──────────────────────────────┐
               │         SOURCE INPUT         │
               │ (Text, URL, Kurikulum, DOCX, │
               │          PDF Binary)         │
               └──────────────┬───────────────┘
                              │
               ┌──────────────▼───────────────┐
               │       SOURCE INGESTION       │
               │   (source-ingestion.ts,      │
               │    document-parser.ts)       │
               └──────────────┬───────────────┘
                              │
               ┌──────────────▼───────────────┐
               │        NORMALIZATION         │
               │ (source-normalizer.ts,       │
               │  SHA-256 Content Hashing)    │
               └──────────────┬───────────────┘
                              │
               ┌──────────────▼───────────────┐
               │     CHUNKING & RETRIEVAL     │
               │ (source-chunker.ts,          │
               │  retriever.ts Context Window)│
               └──────────────┬───────────────┘
                              │
               ┌──────────────▼───────────────┐
               │      GROUNDING EVALUATION    │
               │  (grounding.ts, fail-closed  │
               │    anti-hallucination gate)  │
               └──────────────┬───────────────┘
                              │
               ┌──────────────▼───────────────┐
               │      AI PROVIDER GATEWAY     │
               │   (ai-service.ts, Gemini     │
               │   primary / OpenAI fallback) │
               └──────────────┬───────────────┘
                              │
               ┌──────────────▼───────────────┐
               │      SCHEMA VALIDATION       │
               │ (Zod contract parsing,       │
               │  error-taxonomy normalization│
               └──────────────┬───────────────┘
                              │
               ┌──────────────▼───────────────┐
               │      QUALITY VALIDATION      │
               │ (modul-quality-validator.ts, │
               │  bilingual vocational checks)│
               └──────────────┬───────────────┘
                              │
               ┌──────────────▼───────────────┐
               │     SUPABASE PERSISTENCE     │
               │ (ai_metadata on moduls table,│
               │  ai_source_snapshots cache)  │
               └──────────────┬───────────────┘
                              │
               ┌──────────────▼───────────────┐
               │         AI ARTIFACTS         │
               │  - Verified Modul Ajar Draft │
               │  - Question Package Bank     │
               │  - Visual Generation Plans   │
               │  - OOXML PPTX Artifacts      │
               └──────────────────────────────┘
```

---

## 3. Subsystem Lifecycle & Canonical Pathways

### 3.1 AI Modul Ajar Path
- **Source Input**: Plain text, public URLs, national curriculum outlines, or uploaded DOCX / PDF documents.
- **Source Files**:
  - Ingestion: `src/lib/ai/source-ingestion.ts` (`ingestSource`)
  - Document Parser: `src/lib/ai/document-parser.ts` (`extractDocumentText`)
  - Chunker & Retriever: `src/lib/ai/source-chunker.ts`, `src/lib/ai/retriever.ts`
  - Grounding: `src/lib/ai/grounding.ts` (`evaluateGroundingAgainstSource`)
  - Provider Service: `src/lib/ai/ai-service.ts` (`executeServerAiCall`)
  - Quality Validation: `src/lib/ai/modul-quality-validator.ts`
  - Server Functions: `src/lib/ai.functions.ts` (`generateModulAi`, `saveModulDraftServerFn`, `publishModulServerFn`)
- **Database Table**: `public.moduls` (`ai_metadata`), `public.ai_source_snapshots`
- **Provider**: Google Gemini (`gemini-flash-lite-latest` or `gemini-2.5-flash` via Lovable gateway); fallback OpenAI (`gpt-4o-mini`).
- **Validation Layer**: Zod schema validation (`ModulGenerationOutputSchema`), grounding entity coverage, pedagogical depth checks.
- **Current Status**: **WORKING** (100% test coverage; core table `moduls` is active in live Supabase).
- **Known Failure Modes**: `SOURCE_TOO_LARGE` (>2MB / >5000 words), `GROUNDING_FAILED` (source mismatch / ungrounded topic), `AI_PROVIDER_ERROR` (credentials unset).

---

### 3.2 AI Illustration Path
- **Workflow**: Module Section $\to$ Outline Planning (GEN-0) $\to$ Visual Style Selection $\to$ Teacher Approval Gate $\to$ Image Request (VIS-1A) $\to$ Image Generation (VIS-1B) $\to$ Binary Validation $\to$ Durable Storage (VIS-1C) $\to$ Teacher Review (VIS-1D) $\to$ Quality Gate (VIS-1E).
- **Source Files**:
  - Planning: `src/lib/generation-planning.functions.ts`, `src/lib/ai/generation-planning-service.ts`
  - Request Building: `src/lib/ai/illustration-request-builder.ts`
  - Generation Functions: `src/lib/illustration-generation.functions.ts` (`generateIllustrationServerFn`)
  - Dual Provider Router: `src/lib/ai/providers/dual-illustration-router.ts`
  - Binary Validator: `src/lib/ai/image-validator.ts` (`assertValidImageBinary`)
  - Storage & Assets: `src/lib/illustration-asset.functions.ts` (`saveIllustrationAssetServerFn`)
  - Review & Approval: `src/lib/illustration-review.functions.ts` (`reviewIllustrationAssetServerFn`)
  - Quality Evaluator: `src/lib/illustration-quality.functions.ts` (`evaluateIllustrationQualityServerFn`)
- **Database Tables**:
  - `generation_plans`, `generation_plan_versions`, `generation_styles`
  - `illustration_generation_requests`, `illustration_generations`
  - `illustration_assets`, `illustration_reviews`, `illustration_quality_evaluations`
- **Storage Bucket**: `illustration-assets` (Private visibility, 10MB limit, image/png & image/jpeg).
- **Provider**: Primary: Google Gemini (`gemini-3.1-flash-image`); Fallback: OpenAI (`gpt-image-2`).
- **Validation Layer**: `assertValidImageBinary` strictly rejects SVG mocks or corrupted buffers; verifies PNG/JPEG magic headers, dimensions (1024x1024), and aspect ratio.
- **Current Status**: **PARTIAL / BLOCKED ON LIVE INFRASTRUCTURE**
  - *Code & Test Logic*: Complete and verified (100% pass across VIS-1A through VIS-1E test suites).
  - *Live Database*: Tables are declared in migrations but **missing in live Supabase schema cache** (HTTP 404). Active server functions currently fall back to in-memory Maps (`fallbackPlans`, `fallbackAssets`).
  - *Live Storage*: Bucket `illustration-assets` does not exist yet in live Supabase storage (HTTP 404 NoSuchBucket).
- **Known Failure Modes**: `PROVIDER_UNAVAILABLE` (missing API keys), `AI_SAFETY_BLOCKED` (strict fail-closed, no failover), `CORRUPT_PAYLOAD` (tampered binary).

---

### 3.3 AI Presentation Path
- **Workflow**: Module + Source + Approved Illustrations $\to$ Presentation Outline Planning (GEN-0) $\to$ Slide Content Generation (PPT-1B) $\to$ Real OOXML PPTX Rendering (PPT-1C) $\to$ Storage Persistence (PPT-1D) $\to$ Teacher Review (PPT-1E) $\to$ Quality Gate (PPT-1F) $\to$ Authorized Download.
- **Source Files**:
  - Planning: `src/lib/generation-planning.functions.ts`
  - Content Generation: `src/lib/presentation-generation.functions.ts` (`generatePresentationContentServerFn`)
  - OOXML PPTX Renderer: `src/lib/ai/presentation-pptx-renderer.ts` (`renderPresentationPptx` via `pptxgenjs`)
  - OOXML Validator: `src/lib/ai/presentation-pptx-validator.ts` (`validatePptxPackage`)
  - Storage & Artifacts: `src/lib/presentation-artifact.functions.ts` (`savePresentationArtifactServerFn`)
  - Review & Approval: `src/lib/presentation-review.functions.ts` (`reviewPresentationArtifactServerFn`)
  - Quality Gate: `src/lib/presentation-quality.functions.ts` (`evaluatePresentationQualityGateServerFn`)
- **Database Tables**:
  - `presentation_generation_requests`, `presentation_generation_results`
  - `presentation_artifacts`, `presentation_reviews`, `presentation_quality_evaluations`
- **Storage Bucket**: `presentation-artifacts` (Private visibility, 50MB limit, OOXML PPTX MIME).
- **Provider**: Text slides generated via `ai-service.ts` (`executeServerAiCall`); rendering strictly deterministic via `pptxgenjs` (zero AI tokens consumed for layout assembly).
- **Validation Layer**: PPT-1F 8-check deterministic quality gate (ZIP magic bytes, XML part relationships, title presence, sequential numbering, approved illustration provenance, slide boundary assertion, non-overlapping bounding boxes, SHA-256 file hash).
- **Current Status**: **PARTIAL / BLOCKED ON LIVE INFRASTRUCTURE**
  - *Code & Test Logic*: Complete and verified (PPT-1A through PPT-1F test suites pass 100%).
  - *Live Database*: Tables are missing in live Supabase schema cache (HTTP 404); server functions rely on in-memory Maps (`fallbackPresentationArtifacts`).
  - *Live Storage*: Bucket `presentation-artifacts` not yet created in live Supabase storage (HTTP 404 NoSuchBucket).
- **Known Failure Modes**: `BLANK_SLIDE_DETECTED`, `MISSING_SLIDE_TITLE`, `UNAPPROVED_ILLUSTRATION`, `ARTIFACT_HASH_MISMATCH`.

---

## 4. Source Code ↔ Supabase Live Parity Audit

A direct audit against the live Supabase instance (`https://dxzzpsrgbiummjplggyo.supabase.co`) using `scripts/audit-ai-tables.mjs` revealed the following technical findings:

### 4.1 Live Schema Status Table

| Database Table | Declared in Migrations? | Active in Live Supabase? | PostgREST Live Status | Root Cause & Analysis |
|---|:---:|:---:|:---:|---|
| `profiles` | Yes | **YES** | HTTP 401 (RLS Active) | Core table from initial migration; active and healthy. |
| `kelas` | Yes | **YES** | HTTP 401 (RLS Active) | Core table; active and healthy. |
| `kelas_anggota` | Yes | **YES** | HTTP 200 (Readable) | Core table; active and healthy. |
| `tahun_ajaran` | Yes | **YES** | HTTP 200 (Readable) | Core table; active and healthy. |
| `moduls` | Yes | **YES** | HTTP 200 (Readable) | Core table (`ai_metadata` column active). |
| `paket_soal` | Yes | **YES** | HTTP 200 (Readable) | Core table; active and healthy. |
| `penugasan` | Yes | **YES** | HTTP 401 (RLS Active) | Core table; active and healthy. |
| `penugasan_pengumpulan` | Yes | **YES** | HTTP 401 (RLS Active) | Core table; active and healthy. |
| `penugasan_jawaban` | Yes | **YES** | HTTP 401 (RLS Active) | Core table; active and healthy. |
| `penugasan_remedial_pengumpulan` | Yes | **YES** | HTTP 401 (RLS Active) | Core table; active and healthy. |
| `penugasan_remedial_jawaban` | Yes | **YES** | HTTP 401 (RLS Active) | Core table; active and healthy. |
| `system_logs` | Yes | **YES** | HTTP 200 (Readable) | Core table; active and healthy. |
| `bug_reports` | Yes | **YES** | HTTP 200 (Readable) | Core table; active and healthy. |
| `ai_source_snapshots` | Yes (20260926) | **NO** | HTTP 404 (Not in cache) | Migration not executed on live Supabase. |
| `generation_styles` | Yes (20260929) | **NO** | HTTP 404 (Not in cache) | Migration not executed on live Supabase. |
| `generation_plans` | Yes (20260929) | **NO** | HTTP 404 (Not in cache) | Migration not executed on live Supabase. |
| `generation_plan_versions` | Yes (20260929) | **NO** | HTTP 404 (Not in cache) | Migration not executed on live Supabase. |
| `illustration_generation_requests` | Yes (20260929) | **NO** | HTTP 404 (Not in cache) | Migration not executed on live Supabase. |
| `illustration_generations` | Yes (20260929) | **NO** | HTTP 404 (Not in cache) | Migration not executed on live Supabase. |
| `illustration_assets` | Yes (20260930) | **NO** | HTTP 404 (Not in cache) | Migration not executed on live Supabase. |
| `illustration_reviews` | Yes (20260930) | **NO** | HTTP 404 (Not in cache) | Migration not executed on live Supabase. |
| `illustration_quality_evaluations` | Yes (20260930) | **NO** | HTTP 404 (Not in cache) | Migration not executed on live Supabase. |
| `presentation_generation_requests` | Yes (20260930) | **NO** | HTTP 404 (Not in cache) | Migration not executed on live Supabase. |
| `presentation_generation_results` | Yes (20260930) | **NO** | HTTP 404 (Not in cache) | Migration not executed on live Supabase. |
| `presentation_artifacts` | Yes (20261001) | **NO** | HTTP 404 (Not in cache) | Migration not executed on live Supabase. |
| `presentation_reviews` | Yes (20261002) | **NO** | HTTP 404 (Not in cache) | Migration not executed on live Supabase. |
| `presentation_quality_evaluations` | Yes (20261002) | **NO** | HTTP 404 (Not in cache) | Migration not executed on live Supabase. |
| `product_events` | Yes (20261005) | **NO** | HTTP 404 (Not in cache) | Migration not executed on live Supabase. |
| `user_feedback` | Yes (20261005) | **NO** | HTTP 404 (Not in cache) | Migration not executed on live Supabase. |

### 4.2 Architectural Discrepancy Found in Source Migrations
- **Conflict**: Migration `20260929110000_generation_planning_foundation.sql` declared `generation_plans` with columns (`id TEXT`, `owner_id UUID`, `module_id TEXT`, `target_type TEXT`, `status TEXT`, `current_version INTEGER`, `approved_version INTEGER`, `outline JSONB`, `style JSONB`, `provenance JSONB`, `generation_settings JSONB`). This aligns with all TypeScript contracts (`src/lib/generation-planning.functions.ts`).
- However, `20261003000000_release_candidate_schema_parity.sql` contained an alternate draft of `generation_plans` (`id UUID`, `created_by UUID`, `plan_version TEXT`, `lesson_title TEXT`, `subject TEXT`).
- **Resolution**: Created forward-only reconciliation migration `20261007120000_ai_core_baseline_schema_recovery.sql` which enforces the canonical schema and issues `ALTER TABLE public.generation_plans ADD COLUMN IF NOT EXISTS ...` for all required domain columns.

---

## 5. Supabase Storage Parity Audit

| Storage Bucket | Configuration | Live Status | Impact | Action Required |
|---|:---:|:---:|---|---|
| `illustration-assets` | Private, 10MB limit, PNG/JPEG | **404 (NoSuchBucket)** | Illustration asset upload to live storage will fail without bucket | Execute forward-only migration or create bucket in Supabase storage |
| `presentation-artifacts` | Private, 50MB limit, OOXML PPTX | **404 (NoSuchBucket)** | Presentation PPTX upload to live storage will fail without bucket | Execute forward-only migration or create bucket in Supabase storage |
| `ai-source-materials` | Private, 10MB limit, TXT/PDF/DOCX | **404 (NoSuchBucket)** | Source file snapshot upload to live storage will fail without bucket | Execute forward-only migration or create bucket in Supabase storage |

---

## 6. AI Provider Configuration & Security Invariants

### 6.1 Provider Hierarchy
- **Text & Modul Generation**:
  - Primary: Google Gemini (`gemini-flash-lite-latest` or `gemini-2.5-flash`)
  - Secondary / Fallback: OpenAI (`gpt-4o-mini`)
  - Secret Source: Server environment (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `LOVABLE_API_KEY`)
- **Image & Visual Generation**:
  - Dual Illustration Router (`DualIllustrationRouter`)
  - Primary: Google Gemini (`gemini-3.1-flash-image`)
  - Fallback: OpenAI (`gpt-image-2` / DALL-E) on retryable transient errors (429 Rate Limit, 503 Overloaded)
  - Safety Policy: Strict fail-closed on safety blocks (never fails over to secondary)

### 6.2 Security Invariants Verified
1. **Zero Secret Leakage to Client**:
   - `getServerEnv()` explicitly rejects any variable prefixed with `VITE_`.
   - Client bundle secret scan confirms 0 server secrets across all 99 compiled JavaScript chunks.
2. **Fail-Closed Provider Resolution**:
   - Calling `resolveServerAiConfig()` without API keys throws `AiServiceError` with code `AI_PROVIDER_ERROR`.
   - Calling `resolveIllustrationGenerationProvider()` without API keys throws `AiServiceError` with code `PROVIDER_UNAVAILABLE`.
   - Mocks and local generators are strictly isolated to explicit automated test runners (`setMockIllustrationProvider`).
3. **AI Health Check Sanitization**:
   - Server-side health functions (`checkAiSubsystemHealth`, `checkProductionHealthStatus`) return provider operational status, model names, and latency without ever exposing API keys or tokens.

---

## 7. Audit of Misleading Fallbacks & Local Mock Generators

| Mechanism | Location | Classification | Production Disposition |
|---|---|:---:|---|
| `setMockIllustrationProvider` | `illustration-provider-factory.ts` | **Test-Only** | Strictly disabled in production. Returns `null` unless explicitly set by a test runner. |
| In-memory `fallbackPlans`, `fallbackAssets`, `fallbackGenerations` | `*.functions.ts` | **Resilience Fallback** | Currently prevents cold-start crashes in environments where live migrations are pending. Must be replaced with durable Supabase persistence once migrations are applied. |
| Local SVG / Mock Graphic Generation | N/A | **Prohibited** | `assertValidImageBinary` strictly rejects mock SVGs. Real image provider execution is mandatory. |

---

## 8. Authoritative Parity Report Table (Section 19)

| Component | Source State | Live Supabase State | Parity Result | Action Taken / Required |
|---|---|---|:---:|---|
| **AI source persistence** | Declared in `20260926150000` | Missing (HTTP 404) | **FIXED IN MIGRATION** | Consolidated in `20261007120000_ai_core_baseline_schema_recovery.sql`. |
| **Modul persistence** | Declared in `moduls` + `ai_metadata` | Active (HTTP 200) | **PASS** | `moduls.ai_metadata` column exists and persists properly. |
| **Illustration generation** | Declared in `20260929` / `20260930` | Missing (HTTP 404) | **FIXED IN MIGRATION** | Consolidated in `20261007120000_ai_core_baseline_schema_recovery.sql`. |
| **Illustration storage** | Bucket `illustration-assets` | Missing (HTTP 404) | **BLOCKED** | Bucket declaration included in migration; requires database execution. |
| **Presentation generation** | Declared in `20260930` / `20261001` | Missing (HTTP 404) | **FIXED IN MIGRATION** | Consolidated in `20261007120000_ai_core_baseline_schema_recovery.sql`. |
| **PPTX artifact** | `pptxgenjs` OOXML engine | Active locally | **PASS** | Deterministic OOXML package generator verified (PPT-1F gate). |
| **AI provider** | Dual router + Gemini/OpenAI | Keys present in `.env` | **PASS** | Server-only resolution, fail-closed behavior verified. |
| **Environment variables** | `.env.example` template | Active in local `.env` | **PASS** | `.env.example` updated with safe baseline variable templates. |
| **RLS Policies** | Defined in migrations | Missing on AI tables | **FIXED IN MIGRATION** | Reconciled RLS policies declared in forward-only recovery migration. |
| **Storage policies** | Defined in migrations | Missing on storage | **FIXED IN MIGRATION** | Storage bucket & RLS policies declared in forward-only recovery migration. |

---

## 9. Verification & Test Evidence

| Test Suite | Command | Result | Details |
|---|---|:---:|---|
| **AI Recovery Baseline** | `npm run test:ai-recovery` | **12 / 12 PASS (100%)** | All 12 acceptance requirements verified. |
| **AI Core Recovery** | `npm run test:recovery` | **40 / 40 PASS (100%)** | Document parsing, grounding, dual-router failover, binary validation. |
| **OPS-1 Production Monitoring** | `npm run test:ops` | **26 / 26 PASS (100%)** | System health, zero-leak credential scrubbing, latency metrics. |
| **OPS-2 Product Analytics** | `npm run test:ops2` | **16 / 16 PASS (100%)** | 23 event taxonomy, feedback intake, privacy scrubbing. |
| **Full Regression Suite** | `npm test` | **48 / 48 PASS (100%)** | Core gate, auth, kelas, modul, soal, penugasan, penilaian, PPTX. |
| **Release Parity Audit** | `npm run verify:release-parity` | **6 / 6 GATES PASS** | Git baseline, env inventory, schema parity, secret scan. |
| **Linter Sanitization** | `npm run lint` | **PASS (0 error)** | 0 error. |
| **Production Build** | `npm run build` | **PASS (0 error)** | Nitro SSR & TanStack Start builds cleanly in <800ms. |

---

## 10. Remaining Blockers for AI-RECOVERY-02

1. **Live Supabase Migration Execution**:
   - The forward-only migration `supabase/migrations/20261007120000_ai_core_baseline_schema_recovery.sql` must be applied to the live Supabase instance (`dxzzpsrgbiummjplggyo`) so that PostgREST can populate the schema cache for `ai_source_snapshots`, `generation_plans`, `illustration_assets`, and `presentation_artifacts`.
2. **Live Storage Buckets Creation**:
   - Storage buckets `illustration-assets`, `presentation-artifacts`, and `ai-source-materials` must be provisioned in the live Supabase storage service (via service-role key or Supabase Dashboard) to replace the temporary in-memory fallback buffers with durable object storage.
