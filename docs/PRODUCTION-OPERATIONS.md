# GuruPro — Panduan Operasional & Pemeliharaan Produksi (PRODUCTION-OPERATIONS)

Status: **AKTIF & OPERASIONAL**  
Versi: `1.0.0` (GO-LIVE-1)  
Cakupan: GuruPro Platform (`https://gurupro-ai-journal.vercel.app`)

---

## 1. Arsitektur Operasional Sistem

```text
[ Browser Klien Guru / Siswa ]
       │
       ▼ HTTPS / WSS
[ Vercel Edge & Nitro SSR (sin1) ] ── (Serverless Functions)
       │                                      │
       ▼ REST & GoTrue Auth                   ▼ REST AI Payloads
[ Supabase Managed Backend ]           [ Dual AI Router ]
  ├── PostgreSQL Database (RLS)          ├── Google Gemini (Primary)
  ├── PostgREST Engine                   └── OpenAI (Fallback)
  └── Supabase Storage (Private)
```

---

## 2. Prosedur Rilis & Deployment Terkontrol

### A. Alur Kerja Perubahan Kode (Change Management Flow)
Setiap perubahan kode pasca-peluncuran (**post-launch**) wajib mengikuti protokol 8 langkah:
1. **Identifikasi Masalah**: Catat tiket isu / bug report dengan bukti log terverifikasi.
2. **Analisis Akar Masalah**: Temukan akar masalah teknis, hindari perbaikan permukaan (*patching* UI semata).
3. **Perbaikan Minimalis**: Lakukan perubahan kode yang fokus, terukur, dan tidak mengubah antarmuka/skema yang tidak terkait.
4. **Uji Regresi Lokal**:
   ```bash
   npm test
   npm run lint
   npm run build
   npm run verify:release-parity
   ```
5. **Uji Kesiapan & Mutu**:
   ```bash
   npm run test:qa4
   npm run test:uat
   npm run test:recovery
   ```
6. **Git Commit & Push**:
   - Terapkan commit semantik (contoh: `fix(auth): ...`).
   - Lakukan dorongan fast-forward ke cabang `main` (`git push origin main`).
   - **PERINGATAN LOVABLE**: Jangan pernah melakukan *force push* (`--force`) atau *rebase* pada commit yang sudah didorong.
7. **Verifikasi Auto-Deploy Vercel**:
   - Pantau proses build Vercel hingga berstatus *Ready*.
   - Ambil ID deployment dan pastikan commit SHA yang terpasang sama dengan commit lokal.
8. **Smoke Test Rilis Produksi**:
   - Uji rute `/`, `/login`, `/dashboard`, `/modul-ajar`.

---

## 3. Pemantauan & Observabilitas Berkelanjutan

### A. Titik Pantau Utama (Key Monitoring Indicators)
1. **Kesehatan Otentikasi**:
   - Memantau laju kegagalan HTTP 401/403.
   - Memastikan tidak ada token kadaluarsa yang lolos tanpa penyegaran (*refresh*).
2. **Kesehatan Penyedia AI**:
   - Memantau rasio keberhasilan Gemini vs. frekuensi failover ke OpenAI.
   - Memastikan latensi generasi rata-rata berada pada rentang aman (< 2 detik untuk teks, < 15 detik untuk citra visual).
3. **Integritas Penyimpanan Storage**:
   - Memantau ketersediaan bucket `illustration-assets` dan `presentation-artifacts`.
   - Memastikan hash SHA-256 selalu cocok antara upload dan download.
4. **Kinerja Basis Data**:
   - Memastikan waktu respons PostgREST < 300 ms.
   - Memantau penggunaan koneksi pooler Supabase.

### B. Sanitasi & Privasi Log (Zero Secret Policy)
- Semua log aplikasi serverless diproses melalui `normalizeAiError` ([`error-taxonomy.ts`](file:///c:/novara%20project/gurupro-ai-journal-main/src/lib/ai/error-taxonomy.ts)).
- String yang cocok dengan pola Bearer JWT, Google API Key (`AIzaSy...`), OpenAI Key (`sk-...`), atau Supabase Secret Key disensor secara otomatis sebelum dicetak ke konsol Vercel.

---

## 4. Strategi Pemulihan Bencana & Rollback (Disaster Recovery)

### A. Rollback Aplikasi (Frontend & Serverless)
- Jika ditemukan *bug* fatal pasca-deploy (P0/P1), operator dapat melakukan *Instant Rollback* melalui Vercel Dashboard ke deployment terverifikasi sebelumnya dalam waktu < 30 detik.
- Kompatibilitas mundur terjamin karena seluruh perubahan skema basis data bersifat maju (*forward-only* / aditif).

### B. Pemulihan Basis Data (Database Recovery)
- Supabase secara otomatis menjalankan snapshot point-in-time recovery (PITR) dan backup harian.
- Skema migrasi yang tersimpan di `supabase/migrations/` dapat diaplikasikan ulang secara deterministik kapan pun diperlukan.

### C. Pemulihan Aset Storage
- File citra ilustrasi dan presentasi PPTX yang disimpan di bucket Supabase Storage bersifat terisolasi dan persisten, tidak terpengaruh oleh restart serverless atau deployment aplikasi baru.
