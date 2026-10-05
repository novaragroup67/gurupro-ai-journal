# GuruPro — Panduan Operasional & Pemeliharaan Produksi (PRODUCTION-OPERATIONS)

Status: **AKTIF, TERSTABILISASI & TERPANTAU PENUH**  
Versi: `1.0.0` (Tahap OPS-1)  
Cakupan: GuruPro Platform (`https://gurupro-ai-journal.vercel.app`)  
Endpoint Kesehatan: `https://gurupro-ai-journal.vercel.app/api/health`

---

## 1. Arsitektur Operasional Sistem

```text
[ Browser Klien Guru / Siswa ]
       │
       ▼ HTTPS / WSS
[ Vercel Edge & Nitro SSR (sin1) ] ── (Serverless Functions / SSR)
       │                                      │
       │                                      ▼ Intercept /api/health
       │                              [ Production Health Service ]
       │                                      │
       ▼ REST & GoTrue Auth                   ▼ REST AI Payloads
[ Supabase Managed Backend ]           [ Dual AI Router ]
  ├── PostgreSQL Database (RLS)          ├── Google Gemini (Primary: gemini-3.1-flash-image)
  ├── PostgREST Engine                   └── OpenAI (Fallback: gpt-image-2)
  └── Supabase Storage (Private)
```

---

## 2. Layanan Pemantauan Kesehatan Produksi (/api/health)

Sistem mengimplementasikan modul pemantauan real-time berbasis serverless di [`src/lib/production-health.ts`](file:///c:/novara%20project/gurupro-ai-journal-main/src/lib/production-health.ts) dan dicegat langsung di tingkat SSR handler [`src/server.ts`](file:///c:/novara%20project/gurupro-ai-journal-main/src/server.ts).

### A. Format Respon JSON & Taksonomi Status
Setiap pemanggilan GET ke `/api/health` menghasilkan laporan terstruktur tanpa kebocoran kredensial rahasia:

```json
{
  "status": "healthy",
  "timestamp": "2026-10-05T06:45:18.123Z",
  "version": "1.0.0",
  "environment": "production",
  "correlationId": "079b070b-0753-478a-b011-181c6f312d62",
  "uptimeSeconds": 1420,
  "subsystems": {
    "application": { "status": "healthy", "version": "1.0.0", "framework": "TanStack Start + Nitro SSR" },
    "database": { "status": "healthy", "latencyMs": 135, "targetProject": "dxzzpsrgbiummjplggyo" },
    "auth": { "status": "healthy", "latencyMs": 0, "provider": "Supabase GoTrue" },
    "storage": { "status": "healthy", "buckets": ["illustration-assets", "presentation-artifacts"], "visibility": "private" },
    "ai": {
      "status": "healthy",
      "primaryProvider": "Google Gemini (gemini-3.1-flash-image)",
      "fallbackProvider": "OpenAI (gpt-image-2 / gpt-4o-mini)",
      "dualRouterActive": true,
      "rateLimitWindow": "20 req/minute",
      "concurrencyLimit": 2
    },
    "presentation": { "status": "healthy", "renderer": "pptxgenjs (OOXML PPTX)", "qualityGateLevel": "PPT-1F Canonical Gate" },
    "routes": { "status": "healthy", "verifiedCount": 9, "sample": ["/", "/login", "/daftar", "/dashboard", "/modul-ajar", "/soal", "/penugasan", "/penilaian", "/rekap"] }
  }
}
```

### B. Matriks Klasifikasi Kesehatan Sub-sistem
1. **healthy**: Seluruh sub-sistem utama (Database, Auth, Storage) dan opsional (AI Primary, AI Fallback) berfungsi normal.
2. **degraded**: Sub-sistem utama tetap berjalan, namun terjadi penurunan pada sub-sistem opsional (misal: kuota Gemini habis sehingga router berpindah ke OpenAI fallback). **Platform tidak dilaporkan mati / unavailable**.
3. **unavailable**: Sub-sistem esensial mengalami pemutusan kritis (Database unreachable atau Auth gateway gagal total). Endpoint mengembalikan HTTP status 503.

---

## 3. Observabilitas Error, Korelasi Request & Sanitasi Kredensial

### A. Request Correlation ID (Traceability)
- Setiap kesalahan yang terjadi pada level server atau AI secara otomatis diberikan pengidentifikasi unik (`correlationId`, contoh: `d1d0f706-0b6e-472a-aa34-8409cd670e7c` atau format fallback `req_...`).
- Pesan kesalahan yang ditampilkan kepada pengguna dibungkus menggunakan `formatSafeUserErrorMessage(err)` yang memuat kode referensi ramah pengguna tanpa membuka detail internal:
  `"Layanan penyedia AI sedang mengalami kendala. Silakan coba kembali sesaat lagi. (Referensi: d1d0f706-0b6e-472a-aa34-8409cd670e7c)"`

### B. Zero-Leak Sanitization Policy
Semua pesan kesalahan yang masuk ke log konsol atau dikirimkan ke klien wajib melalui fungsi `redactSensitiveInfo()` di [`src/lib/ai/error-taxonomy.ts`](file:///c:/novara%20project/gurupro-ai-journal-main/src/lib/ai/error-taxonomy.ts):
- **Bearer JWT**: Diganti dengan `[REDACTED_JWT]`
- **Google Gemini Keys**: Pola `AIzaSy...` diganti dengan `[REDACTED_GEMINI_KEY]`
- **OpenAI Keys**: Pola `sk-...` diganti dengan `[REDACTED_OPENAI_KEY]`
- **Database Password**: Pola `password=...` diganti dengan `password=[REDACTED]`
- **Postgres Table Internals**: Kueri gagal atau constraint error (contoh: `users_email_key`) tidak dibocorkan ke klien.

---

## 4. Stabilisasi Runtime AI & Aturan Failover Dual-Router

Router visual [`DualIllustrationRouter`](file:///c:/novara%20project/gurupro-ai-journal-main/src/lib/ai/providers/dual-illustration-router.ts) beroperasi dengan aturan berikut:
1. **Primary Provider**: Google Gemini (`gemini-3.1-flash-image`).
2. **Fallback Provider**: OpenAI (`gpt-image-2`).
3. **Bounded Automatic Failover**:
   - Hanya dipicu oleh kesalahan transient/jaringan: HTTP 429 (Rate Limit), 500, 502, 503 (Provider Unavailable), dan 504 (Timeout).
4. **Safety Fail-Closed Invariant**:
   - Jika permintaan AI diblokir oleh moderasi keselamatan (`AI_SAFETY_BLOCKED`), router **DILARANG KERAS** melakukan failover ke provider sekunder untuk menghindari pengabaian filter moderasi. Status langsung dihentikan dengan status 400.
5. **Batas Biaya & Kapasitas**:
   - Maksimal 2 proses generasi visual konkuren per node.
   - Jendela rate limit: 20 permintaan per menit.
   - Batas maksimal payload sumber materi: 2MB (`SOURCE_TOO_LARGE` / HTTP 413).
6. **Graceful Degradation**:
   - Jika kedua penyedia mengalami kegagalan, sistem mengembalikan kesalahan terstruktur `PROVIDER_UNAVAILABLE` (HTTP 503). Sistem tidak pernah membuat "status sukses palsu" (*no fake success*).

---

## 5. Stabilitas Rendering PPTX & Gerbang Kualitas (Quality Gate)

1. **Struktur Berkas PPTX**: Menggunakan generator OpenXML murni (`pptxgenjs`), diverifikasi dengan magic bytes ZIP (`PK\x03\x04`).
2. **PPT-1F Quality Gate**: Setiap dek slide yang dirender diuji melalui `evaluatePresentationQuality()`.
3. **Sovereign Teacher Authority**: Dokumen yang belum disetujui guru ditahan (`status: failed` / `APPROVAL_BLOCKED`). Dokumen dengan persetujuan guru yang sah diverifikasi sebagai `status: passed` dan `decision: PASS`.
4. **Penolakan Artefak Korup**: Artefak rusak atau manipulasi hash SHA-256 (`ARTIFACT_HASH_MISMATCH`) ditolak secara instan di gerbang unduhan.
5. **Fallback Ilustrasi**: Jika aset ilustrasi tidak dapat dimuat, sistem merender tata letak fallback tanpa menggagalkan perakitan seluruh dokumen presentasi.

---

## 6. Prosedur Rilis & Deployment Terkontrol

### Alur Kerja Perubahan Kode (Change Management Flow)
1. **Identifikasi Masalah**: Catat tiket isu / bug report dengan bukti correlation ID.
2. **Analisis Akar Masalah**: Perbaiki akar masalah pada file relevan.
3. **Verifikasi Suite Lengkap**:
   ```bash
   npm run test:ops
   npm test
   npm run lint
   npm run build
   npm run verify:release-parity
   npm run test:golive
   ```
4. **Git Commit & Fast-Forward Push**:
   - Commit semantik (contoh: `ops(monitor): ...`).
   - Push ke cabang `main` (`git push origin main`).
   - **PERINGATAN LOVABLE**: Jangan pernah melakukan *force push* (`--force`) atau *rebase* pada commit yang sudah didorong.
5. **Verifikasi Auto-Deploy Vercel & Smoke Test**:
   - Pantau status build Vercel.
   - Jalankan smoke test pada 8 rute utama (`/`, `/login`, `/daftar`, `/dashboard`, `/modul-ajar`, `/soal`, `/penugasan`, `/penilaian`).

---

## 7. Strategi Pemulihan Bencana & Rollback (Disaster Recovery)

### A. Rollback Aplikasi (Frontend & Serverless)
- Jika ditemukan *bug* fatal pasca-deploy (P1), operator dapat melakukan *Instant Rollback* melalui Vercel Dashboard ke deployment terverifikasi sebelumnya dalam waktu < 30 detik.
- Kompatibilitas mundur terjamin karena seluruh perubahan skema basis data bersifat maju (*forward-only* / aditif).

### B. Pemulihan Basis Data (Database Recovery)
- Supabase secara otomatis menjalankan snapshot point-in-time recovery (PITR) dan backup harian.
- Skema migrasi yang tersimpan di `supabase/migrations/` dapat diaplikasikan ulang secara deterministik kapan pun diperlukan.

### C. Pemulihan Aset Storage
- File citra ilustrasi dan presentasi PPTX yang disimpan di bucket Supabase Storage bersifat terisolasi dan persisten, tidak terpengaruh oleh restart serverless atau deployment aplikasi baru.
