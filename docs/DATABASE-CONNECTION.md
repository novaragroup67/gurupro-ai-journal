# GuruPro — Canonical Database Connection & Persistence Architecture

> **Document Classification**: Developer & QA Technical Reference  
> **Status**: Verified Active  
> **Canonical Cloud Project**: `dxzzpsrgbiummjplggyo`

---

## 1. Executive Summary & Canonical Source of Truth

GuruPro utilizes a single, cloud-hosted PostgreSQL database powered by Supabase as its canonical source of truth. All persistent entities—including user profiles, classes, membership, teaching modules, question packages, assignments, student submissions, and grading records—are stored exclusively in:

- **Supabase Project Reference**: `dxzzpsrgbiummjplggyo`
- **Canonical API Base URL**: `https://dxzzpsrgbiummjplggyo.supabase.co`

### Architecture Rules
1. **Single Source of Truth**: All production CRUD operations read from and write directly to Supabase Cloud PostgreSQL.
2. **Zero Fake Fallback**: If network or database connectivity is disrupted, the application displays a clear error state. It does **not** silently generate dummy records or fall back to mock data.
3. **No Dual Persistence**: Local storage (`localStorage`) is used strictly for holding the authenticated session token (`sb-access-token`) in the browser. Business entities are never cached as an offline source of truth.
4. **Developer Independence**: A developer laptop or build runner going offline has zero effect on stored cloud records.

---

## 2. Core Primary Tables

| Table Name | Description | Key Security & Constraints |
| :--- | :--- | :--- |
| `profiles` | User accounts (Guru, Siswa, Admin). Synchronized with `auth.users` via trigger `handle_new_user()`. | RLS enabled. Self-read/update, role-based isolation, student-teacher visibility. |
| `kelas` | Classes created by teachers. Contains class codes (`kode_kelas`) for student enrollment. | RLS enabled. Guru has full CRUD on own classes; students can view enrolled classes. |
| `kelas_anggota` | Student enrollment and membership status (`menunggu`, `aktif`, `ditolak`). | RLS enabled. Students can insert membership requests; teachers approve/reject. |
| `moduls` | Teaching modules (`Modul Ajar`) authored by teachers. | RLS enabled. Teachers have full CRUD on own modules; students read published modules. |
| `paket_soal` | Question packages containing multiple-choice and essay questions. | RLS enabled. Teachers manage own packages; students read assigned questions. |
| `penugasan` | Assignments created by teachers linked to classes and question packages. | RLS enabled. Teachers manage own assignments; students view published assignments. |
| `penugasan_pengumpulan` | Student assignment submissions (`draft`, `submitted`) and teacher grading scores. | RLS enabled. Strict deadline enforcement; server-side immutability once submitted. |
| `penugasan_jawaban` | Individual answers submitted by students per question. | RLS enabled. Answer keys (`kunci_jawaban`) strictly stripped from student view. |
| `system_logs` | Operational and security audit log entries. | RLS enabled. Protected by `log_system_event` RPC; sensitive fields redacted. |

---

## 3. Stored Procedures & RPC Functions

| Function Name | Parameters | Description |
| :--- | :--- | :--- |
| `cari_kelas_by_kode` | `_kode text` | Secure class code lookup. Obfuscates teacher credentials and internal IDs from anonymous users. |
| `get_penugasan_soal_for_siswa` | `_penugasan_id uuid` | Delivers sanitized questions to enrolled students, stripping answer keys and explanations. |
| `submit_penugasan` | `_pengumpulan_id uuid` | Server-side assignment finalizer. Enforces deadline validity and locks answers permanently. |
| `simpan_penilaian_guru` | `_pengumpulan_id uuid`, `_nilai_essay numeric`, `_catatan_guru text` | Atomic grading operation for essay questions and final score recalculation. |
| `get_admin_dashboard_stats` | *(none)* | Aggregates system metrics (total teachers, students, assignments) with admin authorization. |
| `admin_update_teacher_verification` | `_teacher_id uuid`, `_status text` | Admin verification workflow for teacher registrations. |
| `log_system_event` | `_level text`, `_event_type text`, `_message text`, `_context jsonb` | Redacts sensitive information (tokens, passwords) and logs system events. |

---

## 4. Environment Configuration (Local vs. Vercel)

Both Local development and Vercel production deployments **must** connect to the identical Supabase project (`dxzzpsrgbiummjplggyo`).

### Required Environment Variables

```ini
# Client / Browser Environment (Vite prefixed)
VITE_SUPABASE_PROJECT_ID="dxzzpsrgbiummjplggyo"
VITE_SUPABASE_URL="https://dxzzpsrgbiummjplggyo.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_T_KM74qD7YgJYa4Om9jnww_HTzRSjs-"

# Server / SSR Runtime Environment
SUPABASE_PROJECT_ID="dxzzpsrgbiummjplggyo"
SUPABASE_URL="https://dxzzpsrgbiummjplggyo.supabase.co"
SUPABASE_PUBLISHABLE_KEY="sb_publishable_T_KM74qD7YgJYa4Om9jnww_HTzRSjs-"
```

### Local Setup
1. Copy `.env.example` to `.env`.
2. Confirm `VITE_SUPABASE_URL` and `SUPABASE_URL` both point to `https://dxzzpsrgbiummjplggyo.supabase.co`.
3. Run `node scripts/verify-supabase.mjs` to confirm connectivity.

### Vercel Production Setup
1. In the Vercel Dashboard, navigate to **Project Settings → Environment Variables**.
2. Set `VITE_SUPABASE_URL` and `SUPABASE_URL` to `https://dxzzpsrgbiummjplggyo.supabase.co`.
3. Set `VITE_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_PUBLISHABLE_KEY` to the corresponding production publishable key.
4. Ensure no secret/service-role keys are exposed with a `VITE_` prefix.

---

## 5. Verification & Inspection Guide

### How to Access the Supabase Table Editor
1. Log in to your Supabase Management Console: [https://supabase.com/dashboard](https://supabase.com/dashboard).
2. Select the project: **`dxzzpsrgbiummjplggyo`**.
3. In the left navigation menu, click **Table Editor** (or press `g` then `t`).
4. Select any table (e.g., `profiles`, `kelas`, `penugasan`) to view live records.

### How to Confirm a Newly Created Record Reached the Database

#### 1. Registration (`auth.users` & `profiles`)
- Register a new user at `/daftar`.
- In Supabase Table Editor:
  - Check **Authentication → Users**: the email should appear with `confirmed_at` populated.
  - Check **Table Editor → profiles**: a matching row with the same `id` (UUID), `role` (`guru` or `siswa`), and `nama` will exist immediately.

#### 2. Class Creation (`kelas`)
- In Guru Dashboard, click **Buat Kelas Baru** and submit.
- In Supabase Table Editor:
  - Open table `kelas`.
  - Filter or sort by `created_at DESC`.
  - The newly created class name, tingkat, and generated `kode_kelas` will be present.

#### 3. Assignment & Submission Flow (`penugasan`, `penugasan_pengumpulan`)
- Publish an assignment from `/penugasan`.
- Row appears in `penugasan` with `status = 'published'`.
- Siswa logs in, opens the assignment, and starts drafting:
  - Row appears in `penugasan_pengumpulan` with `status = 'draft'`.
- Siswa clicks **Kumpulkan**:
  - Row updates in `penugasan_pengumpulan` with `status = 'submitted'`, `submitted_at = NOW()`.
  - Multiple choice questions are auto-graded (`nilai_pg`).

### Automated Diagnostic Tool
Run the built-in diagnostic at any time from the terminal:
```bash
node scripts/verify-supabase.mjs
# or via npm script:
npm run verify:db
```
The script performs live health checks across the REST API, Auth gateway, 9 canonical tables, and 7 RPC functions without leaking secret keys.
