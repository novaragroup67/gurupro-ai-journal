# GuruPro — Production Baseline & Configuration Record (GO-LIVE-1)

Tanggal Baseline: 5 Oktober 2026  
Status Tahap: **GO-LIVE-1 (Production Launch & Post-Launch Operations)**  
Referensi Gerbang QA: `QA-4 PRODUCTION READINESS COMPLETE — RELEASE APPROVED`

---

## 1. Identitas Repositori & Versi Rilis

| Parameter Baseline | Nilai Terverifikasi |
|---|---|
| **Git Branch** | `main` |
| **Git Commit SHA (Baseline)** | `43a3421a439af6e1a2e31ff35c9a253e8ca30ec1` |
| **Package Manager** | npm `11.9.0` |
| **Node.js Runtime** | `v24.14.0` |
| **Package Version** | `1.0.0` (`tanstack_start_ts`) |
| **Lockfile (`package-lock.json`) SHA-256** | `6939f4a81bbc6b1ad7392ea2ee66e0b564c6bc8775c6c5669b73aff56cc9d236` |

---

## 2. Infrastruktur Produksi

### A. Supabase Platform (Backend & Database)
- **Supabase Project ID**: `dxzzpsrgbiummjplggyo`
- **Supabase Canonical URL**: `https://dxzzpsrgbiummjplggyo.supabase.co`
- **Supabase Region**: Southeast Asia (Singapore / sin1)
- **Auth Provider**: Supabase GoTrue Auth (Email & Password, Auto-confirm enabled)
- **PostgREST Status**: HTTP 200 / Active
- **Versi Migrasi Basis Data Terbaru**: `20261003000000_release_candidate_schema_parity.sql`
- **Jumlah Total Migrasi Terdaftar**: 39 file SQL konsisten

### B. Vercel Hosting (Frontend & Serverless SSR)
- **Domain Produksi Utama**: `https://gurupro-ai-journal.vercel.app`
- **Deployment Platform**: Vercel Serverless (Nitro v3.0.260603-beta + TanStack Start SSR)
- **Vercel Deployment Region**: `sin1` (Singapore, latency optimized)
- **Vercel Edge ID**: `sin1::iad1::6lh6s-1791178460726-0d99d67d83d0`
- **Status Rute Utama**: HTTP 200 OK (`/`, `/login`, `/daftar`, `/dashboard`)

---

## 3. Konfigurasi Penyimpanan (Supabase Storage)

| Bucket Name | Visibilitas | Kebijakan Akses (RLS) | Format / Jalur Kanonikal |
|---|:---:|---|---|
| **`illustration-assets`** | Private | Hanya guru pemilik modul yang dapat mengunggah dan membaca | `illustrations/{guruId}/{moduleId}/{assetId}.png` |
| **`presentation-artifacts`** | Private | Hanya guru pemilik presentasi yang dapat mengunggah dan membaca | `presentations/{guruId}/{moduleId}/{presentationId}.pptx` |

*Catatan Keamanan*: Integritas seluruh objek penyimpanan divalidasi menggunakan hash kriptografis SHA-256 pada saat pengunggahan dan pengunduhan.

---

## 4. Konfigurasi AI Dual-Provider

Sistem menerapkan arsitektur *dual-provider router* yang tangguh ([`dual-illustration-router.ts`](file:///c:/novara%20project/gurupro-ai-journal-main/src/lib/ai/providers/dual-illustration-router.ts)):

| Komponen | Penyedia Primer (Primary) | Penyedia Sekunder (Fallback) |
|---|---|---|
| **Provider** | **Google Gemini** | **OpenAI** |
| **Model Teks & Modul** | `gemini-1.5-flash` / `gemini-1.5-pro` | `gpt-4o-mini` |
| **Model Citra (Visual)** | `gemini-3.1-flash-image` | `gpt-image-2` |
| **Latensi Tipikal** | ~214 ms – 350 ms | ~1000 ms – 1400 ms |
| **Kebijakan Failover** | Otomatis mengalihkan pada HTTP 429 & 5xx | - |
| **Kebijakan Keselamatan** | **Fail-Closed**: Blokir keamanan langsung membatalkan proses | **Fail-Closed**: Tanpa *bypass* keselamatan |

---

## 5. Inventaris Variabel Lingkungan Produksi

Semua kredensial rahasia disimpan secara aman pada panel environment Vercel dan Supabase, tanpa komitmen ke Git:

| Nama Variabel | Konteks | Klasifikasi | Status |
|---|---|---|:---:|
| `VITE_SUPABASE_URL` | Client & Server | Publik | Terkonfigurasi (`dxzzpsrgbiummjplggyo`) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Client & Server | Publik | Terkonfigurasi (`sb_publishable_...`) |
| `SUPABASE_URL` | Server SSR | Privat / Internal | Terkonfigurasi |
| `SUPABASE_PUBLISHABLE_KEY` | Server SSR | Privat / Internal | Terkonfigurasi |
| `GEMINI_API_KEY` | Server AI Engine | Rahasia (Secret) | Terkonfigurasi (Valid) |
| `OPENAI_API_KEY` | Server AI Engine | Rahasia (Secret) | Terkonfigurasi (Valid) |
| `LOVABLE_API_KEY` | Server Deployment | Rahasia (Secret) | Terkonfigurasi (Valid) |

---

## 6. Batasan Operasional & Safeguard Biaya

- **Batas Konkurensi**: Maksimal 2 proses generasi AI serentak per identitas pengguna.
- **Batas Frekuensi (Rate Limit)**: 20 permintaan per menit per pengguna.
- **Batas Ukuran Payload Dokumen**: 10 MB untuk dokumen Base64, 2 MB untuk streaming URL eksternal.
- **Maksimal Retry**: 2 kali percobaan berulang terisolasi sebelum failover atau kegagalan tertutup.
- **Proteksi SSRF**: Host privat RFC1918, localhost, dan metadata cloud diblokir secara mutlak.
