# GuruPro — OPS-2: Product Analytics & Real-User Feedback Operational Guide

## 1. Executive Summary & Objective

The **OPS-2** stage implements lightweight, privacy-safe telemetry and user feedback intake across the GuruPro platform. Its purpose is to deliver data-informed operational observability into real-user engagement, workflow funnel friction, AI reliability, and user feedback—all **without compromising user data privacy or breaking core business operations**.

```text
Real User Activity
       │
       ▼
Non-Blocking Event Telemetry ──► Privacy-Safe Sanitization (Zero-Leak)
       │                                     │
       ├─────────────────────────────────────┤
       ▼                                     ▼
In-Memory Fallback Ledger            PostgREST Database Store (RLS)
       │                                     │
       └──────────────────┬──────────────────┘
                          ▼
              Metrics Aggregation Engine
        (Adoption, Funnels, AI Health, Feedback)
                          │
                          ▼
            Admin Analytics & Triage Dashboard
                          │
                          ▼
         Prioritized Continuous Improvement
```

---

## 2. Fundamental Architectural Invariants

1. **Non-Blocking Execution Priority**: Primary application workflows (creating assignments, student submission, grading, AI generation, PPTX export, authentication) **strictly take precedence over telemetry**. A telemetry failure (e.g. database latency, network drop, PostgREST schema cache delay) is silently handled and caught, never throwing errors or halting user workflows.
2. **Zero-Leak Data Privacy**: Analytics metadata **strictly forbids** passwords, authorization headers, bearer JWT tokens, OpenAI/Gemini API keys, and raw student essay answers. Redaction replaces secrets with `[REDACTED]` and aggregates student submissions into coarse length and count metrics.
3. **Dual Storage Resilience**: Every event is instantly recorded to a bounded in-memory buffer (`fallbackProductEvents`), followed by an asynchronous persist attempt to `public.product_events`. If database queries fail, metrics computations gracefully fall back to in-memory records.
4. **Strict RLS Isolation**: Event logs and user feedback are protected by Supabase Row-Level Security. Anonymous clients cannot view any telemetry or feedback. Students and teachers can only inspect their own feedback, and only administrators have triage and status alteration authority.

---

## 3. Canonical Event Taxonomy

All events are strictly enumerated in `src/lib/analytics/product-events.ts`:

| Event Key | Feature Domain | Trigger Point | Payload / Metadata |
| :--- | :--- | :--- | :--- |
| `USER_LOGIN` | `auth` | Successful authentication | `userId`, `role` |
| `USER_LOGOUT` | `auth` | User signs out | `userId` |
| `USER_REGISTER` | `auth` | New user registered | `userId`, `role` |
| `MODUL_OPENED` | `modul` | Teacher accesses Modul Ajar workspace | `moduleId`, `durationMs` |
| `MODUL_DRAFT_SAVED` | `modul` | Modul Ajar draft saved | `moduleId`, `sectionCount` |
| `MODUL_PUBLISHED` | `modul` | Modul Ajar published | `moduleId`, `title` |
| `QUESTION_GENERATOR_OPENED` | `soal` | Teacher enters Generator Soal view | `userId`, `role` |
| `QUESTION_PACKAGE_PUBLISHED` | `soal` | Question package published to Bank or Task | `paketId`, `questionCount`, `target` |
| `ASSIGNMENT_CREATED` | `penugasan` | Teacher creates assignment | `assignmentId`, `kelasId`, `totalSoal` |
| `ASSIGNMENT_PUBLISHED` | `penugasan` | Assignment status set to published | `assignmentId` |
| `SUBMISSION_STARTED` | `submission` | Student starts an assignment attempt | `penugasanId`, `studentId` |
| `ANSWER_SAVED` | `submission` | Student auto-saves draft responses | `pengumpulanId`, `answerCount` |
| `SUBMISSION_SUBMITTED` | `submission` | Student finalizes submission via RPC | `pengumpulanId` |
| `GRADING_OPENED` | `penilaian` | Teacher opens grading / rekap view | `kelasId`, `role` |
| `GRADING_COMPLETED` | `penilaian` | Teacher submits essay grade & feedback | `pengumpulanId`, `nilaiAkhir` |
| `AI_GENERATION_SUCCESS` | `ai` | AI provider completes generation | `provider`, `durationMs`, `model` |
| `AI_GENERATION_FAILURE` | `ai` | AI generation fails (with retryable check) | `provider`, `error_code`, `status` |
| `AI_PROVIDER_FAILOVER` | `ai` | Primary Gemini 429 fails over to OpenAI | `fromProvider`, `toProvider`, `reason` |
| `AI_PROVIDER_UNAVAILABLE` | `ai` | All AI providers exhausted | `status: 503`, `reason` |
| `AI_SAFETY_BLOCKED` | `ai` | AI provider triggers safety refusal | `reason`, `failClosed: true` |
| `PRESENTATION_QUALITY_PASSED`| `presentation` | Document passes PPT-1F quality gate | `artifactId`, `overallScore` |
| `PRESENTATION_DOWNLOADED` | `presentation` | Teacher securely downloads PPTX file | `artifactId`, `byteSize` |
| `FEEDBACK_SUBMITTED` | `feedback` | User submits structured feedback | `feedbackId`, `category`, `priority` |

---

## 4. Privacy & Metadata Sanitization Specifications

The `sanitizeEventMetadata()` engine scrubs incoming metadata payloads before persistence:

```typescript
// Forbidden keys scrubbed to [REDACTED]:
/(password|token|jwt|apikey|api_key|openai|gemini|_key$|key$|secret|bearer|authorization|cookie|session_id)/i

// Student content keys converted to length/count:
/(raw_answer|student_answer|jawaban_lengkap|raw_prompt|full_prompt|raw_response)/i
```

### Transformation Example

* **Raw Metadata Before**:
  ```json
  {
    "user_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "openAiKey": "sk-proj-abc123456789...",
    "student_answer_text": "Fotosintesis adalah proses...",
    "raw_answers": [{"id": 1, "text": "A"}, {"id": 2, "text": "B"}]
  }
  ```
* **Sanitized Metadata After**:
  ```json
  {
    "user_token": "[REDACTED]",
    "openAiKey": "[REDACTED]",
    "student_answer_text": { "length": 29 },
    "student_answer_text_length": 29,
    "raw_answers": { "count": 2 },
    "raw_answers_count": 2
  }
  ```

---

## 5. User Feedback Lifecycle

The user feedback engine accepts submissions across **5 canonical categories**:
1. `bug`: Functional errors, rendering glitches, or unexpected behavior.
2. `usability`: Confusing UI, responsive layout issues, or ergonomic friction.
3. `ai_output`: Quality or pedagogical relevance of generated text/questions.
4. `performance`: Latency, slow database loads, or generation timeouts.
5. `suggestion`: Enhancements and feature requests.

### Lifecycle Status Progression

```text
[new] ──► [triaged] ──► [in_progress] ──► [resolved] ──► [closed]
              │               │               │
              └───────────────┴───────────────┘ (Reopen allowed)
```

- Status transitions are guarded by `isValidFeedbackStatusTransition()`.
- Only users with role `admin` can update status or append administrative triage notes.
- Reaching `resolved` automatically sets the `resolved_at` timestamp.

---

## 6. Conversion Funnels & Insights

GuruPro aggregates 4 key workflow funnels across 3 configurable time windows (`today`, `last_7_days`, `last_30_days`):

### 1. Modul Ajar Funnel
`Buka Modul Ajar` ──► `Generasi Selesai` ──► `Draf Disimpan` ──► `Modul Diterbitkan`
- **Metric**: Drop-off rate at draft review vs. final publishing.

### 2. Generator Soal Funnel
`Buka Generator Soal` ──► `Generasi Selesai` ──► `Draf Disimpan` ──► `Paket Diterbitkan`
- **Metric**: Percentage of generated questions saved to Bank Soal.

### 3. Penugasan & Penilaian Funnel
`Penugasan Dibuat` ──► `Penugasan Terbit` ──► `Siswa Mulai` ──► `Siswa Kumpul` ──► `Guru Menilai`
- **Metric**: Student completion rate and teacher grading turnaround time.

### 4. Presentasi Pembelajaran Funnel
`Generasi Selesai` ──► `Guru Meninjau` ──► `Lolos Uji Mutu (PPT-1F)` ──► `Unduh PPTX`
- **Metric**: Percentage of generated slides approved and downloaded as `.pptx`.

---

## 7. Database Migration & RLS Security

Migration: `supabase/migrations/20261005140000_ops2_analytics_and_feedback.sql`

```sql
-- product_events: Insert open to all authenticated/anon callers, SELECT restricted to admins
CREATE POLICY "Admins can view product events"
  ON public.product_events FOR SELECT
  USING (public.is_admin());

-- user_feedback: Insert open to users, SELECT own or admin, UPDATE admin only
CREATE POLICY "Users can view own feedback"
  ON public.user_feedback FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "Admins can update feedback status"
  ON public.user_feedback FOR UPDATE
  USING (public.is_admin());
```

---

## 8. Operational Triage Runbook

When investigating customer reports:
1. Navigate to `/` -> Login as Administrator -> Select tab **Analitik Produk**.
2. Filter the time window (`Hari Ini`, `7 Hari Terakhir`, `30 Hari Terakhir`).
3. Check the **AI Reliability** card:
   - High failover count (>15%): Gemini quota exceeded, investigate rate limit exhaustion.
   - High safety block count (>5%): Review teacher prompt guidelines and safety filter thresholds.
4. Review **Daftar Masukan & Umpan Balik Pengguna**:
   - Filter by status `new`.
   - Review problem description, priority, and correlation ID.
   - Update status to `triaged` or `in_progress` and attach administrative notes.
   - Once fixed, update status to `resolved`.
