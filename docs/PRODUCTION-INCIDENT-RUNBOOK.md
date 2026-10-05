# GuruPro — Buku Petunjuk Penanganan Insiden Produksi (PRODUCTION-INCIDENT-RUNBOOK)

Status: **AKTIF, TERSTABILISASI & TERPANTAU PENUH**  
Versi: `1.0.0` (Tahap OPS-1)  
Cakupan: GuruPro Platform (`https://gurupro-ai-journal.vercel.app`)  
Endpoint Kesehatan: `https://gurupro-ai-journal.vercel.app/api/health`

---

## 1. Klasifikasi Tingkat Keparahan Insiden (Severity Matrix)

| Tingkat | Kriteria & Dampak Bisnis | Contoh Kasus | Target Waktu Tanggap (MTTR) | Tindakan Segera |
|:---:|---|---|:---:|---|
| **P0** | **Kritis / Pemadaman Total**: Seluruh sistem mati atau kebocoran data keamanan fatal. | Basis data Postgres mati, GoTrue auth gateway gagal total, RLS tertembus. | **< 15 menit** | Lakukan investigasi infrastruktur Supabase, isolasi jaringan, periksa status endpoint `/api/health`. |
| **P1** | **Tinggi / Fitur Inti Macet**: Fitur utama tidak dapat digunakan tanpa alternatif yang bekerja. | Kedua penyedia AI (Gemini & OpenAI) gagal serentak, RPC penyerahan tugas error, unduhan PPTX rusak. | **< 45 menit** | Periksa kuota API AI, cek pooler PostgREST, periksa apakah terjadi error struktural pada generator PPTX. |
| **P2** | **Sedang / Degradasi Parsial**: Salah satu penyedia AI mengalami limit atau latensi tinggi, namun fallback aktif normal. | Gemini 429 beralih otomatis ke OpenAI fallback, latensi generasi naik dari 1s ke 4s. | **< 4 jam** | Pantau grafik `/api/health` untuk sub-sistem `ai: degraded`, pertimbangkan penyesuaian kuota API. |
| **P3** | **Rendah / Isu Minor Non-Kritis**: Masalah kosmetik, label teks minor, atau anomali UI pada layar non-standar. | Typo teks panduan modul, padding tombol tidak sejajar pada perangkat 320px. | **Rilis Terjadwal** | Buat tiket perbaikan terencana, lakukan deploy rutin tanpa hotfix darurat. |

---

## 2. Alur Triage Cepat Berdasarkan Correlation ID

Setiap kali pengguna melaporkan error atau konsol mencatat insiden, sistem menyertakan kode referensi unik (`correlationId`, misal: `079b070b-0753-478a-b011-181c6f312d62`).

### Langkah Penelusuran Berbasis Correlation ID:
1. **Dapatkan ID Referensi**: Salin kode dari laporan bug guru atau dari string error `(Referensi: <id>)`.
2. **Pencarian Log Terstruktur**:
   - Buka Vercel Deployment Logs atau konsol server.
   - Filter pencarian dengan ID tersebut: `correlationId == "<id>"`.
3. **Analisis Konteks Error**:
   - Periksa field `subsystem` (contoh: `ai-core`, `pptx-renderer`, `auth`, `storage`).
   - Periksa field `code` (contoh: `AI_RATE_LIMIT`, `SOURCE_TOO_LARGE`, `AI_SAFETY_BLOCKED`).
   - Periksa apakah kredensial telah disanitasi secara aman (memastikan tidak ada kebocoran kunci).

---

## 3. Playbook Penanganan Berdasarkan Sub-sistem

### A. Sub-sistem Otentikasi (`AUTH_ERROR` / 401 / 403)
- **Indikasi**: `/api/health` melaporkan `subsystems.auth.status: "unavailable"` atau `"degraded"`.
- **Penyebab**: Sesi token JWT kedaluwarsa, atau variabel Supabase anon key tertimpa.
- **Prosedur Pemulihan**:
  1. Jalankan verifikasi live: `node scripts/verify-live-auth.mjs`.
  2. Pastikan Vercel Production Environment Variables menggunakan project ID kanonikal `dxzzpsrgbiummjplggyo`.
  3. Instruksikan pengguna untuk melakukan login ulang jika refresh token gagal.

### B. Sub-sistem AI Dual-Router (`AI_RATE_LIMIT` / `PROVIDER_UNAVAILABLE`)
- **Indikasi**: `/api/health` melaporkan `subsystems.ai.status: "degraded"` (salah satu provider down) atau `"unavailable"`.
- **Penyebab**: Batas kuota RPM (20 req/min) terlampaui atau terjadi upstream outage pada Google Gemini.
- **Prosedur Pemulihan**:
  1. Verifikasi router failover otomatis: pastikan OpenAI cadangan mengambil alih permintaan visual secara mulus.
  2. Jika status berubah menjadi `AI_SAFETY_BLOCKED`, **JANGAN** lakukan intervensi paksa: ini adalah penghentian yang disengaja (*fail-closed*) karena prompt memuat konten yang melanggar kebijakan pedagogis/keamanan.
  3. Jika kedua provider kehabisan kuota, sistem mengembalikan kode aman 503 dengan panduan agar pengguna menunggu 2 menit.

### C. Sub-sistem Penyimpanan & PPTX (`PPTX_ERROR` / `HASH_MISMATCH`)
- **Indikasi**: Pengguna gagal mengunduh berkas presentasi atau menerima `PRESENTATION_ARTIFACT_HASH_MISMATCH`.
- **Penyebab**: Terjadi kegagalan koneksi saat transmisi biner OpenXML atau biner lokal tidak cocok dengan hash SHA-256 yang tercatat di basis data.
- **Prosedur Pemulihan**:
  1. Jalankan suite uji PPTX: `npx tsx tests/ops/ops-production-monitoring.test.mjs`.
  2. Pastikan bucket `presentation-artifacts` di Supabase Storage memiliki hak akses RLS yang sah untuk guru pemilik modul.
  3. Jika file rusak di storage, lakukan *regenerate* terkontrol melalui antarmuka modul presentasi dengan persetujuan guru yang sah (*teacher sovereign approval*).

### D. Sub-sistem Analitik & Umpan Balik Pengguna (OPS-2)
- **Indikasi**: Drop-off ekstrem pada funnel konversi (misal: tingkat kelulusan penilaian anjlok), atau lonjakan laporan masukan berprioritas `kritis` / `tinggi`.
- **Penyebab**: Hambatan fungsional atau usability pada salah satu tahap workflow guru/siswa.
- **Prosedur Penanganan**:
  1. Masuk ke Dashboard Admin → Tab **Analitik Produk**.
  2. Filter rentang waktu `Hari Ini` atau `7 Hari Terakhir`.
  3. Periksa rincian masukan pengguna dengan status `new` dan kategori `bug` atau `ai_output`.
  4. Lacak Correlation ID terkait pada log serverless untuk merekonstruksi urutan peristiwa.
  5. Ubah status masukan menjadi `triaged` atau `in_progress` dengan catatan admin yang relevan.
  6. Jalankan suite verifikasi analitik produk: `npm run test:ops2`.

---

## 4. Prosedur Rollback Darurat (Emergency Rollback)

Jika sebuah pembaruan kode menyebabkan status P0/P1 yang tidak dapat diselesaikan dalam 15 menit:
1. **Rollback Vercel Instant**:
   - Masuk ke Vercel Dashboard → *Deployments*.
   - Pilih deployment stabil terakhir (misal commit `5c8b982` dari rilis GO-LIVE-1).
   - Klik menu titik tiga (...) → *Instant Rollback*.
   - Waktu propagasi: < 30 detik secara global.
2. **Verifikasi Pasca-Rollback**:
   - Akses `https://gurupro-ai-journal.vercel.app/api/health` dan pastikan status kembali `healthy`.
   - Jalankan `npm run test:ops` untuk memastikan integritas kembali 100%.
