# GuruPro — Buku Petunjuk Penanganan Insiden Produksi (PRODUCTION-INCIDENT-RUNBOOK)

Status: **AKTIF & OPERASIONAL**  
Versi: `1.0.0` (GO-LIVE-1)  
Cakupan: GuruPro Platform (`https://gurupro-ai-journal.vercel.app`)

---

## 1. Klasifikasi Tingkat Keparahan Insiden (Severity Matrix)

| Tingkat | Kriteria & Dampak Bisnis | Contoh Kasus | Target Waktu Tanggap (MTTR) |
|:---:|---|---|:---:|
| **P0** | **Kritis / Pemadaman Total**: Kebocoran keamanan, kerusakan integritas basis data, atau seluruh aplikasi tidak dapat diakses sama sekali oleh semua pengguna. | Kegagalan otentikasi global, kebocoran kunci rahasia, PostgREST crash, RLS jebol. | **< 15 menit** |
| **P1** | **Tinggi / Fitur Inti Macet**: Salah satu fitur utama (Modul Ajar AI, Penyerahan Tugas Siswa, Penilaian Guru, atau Ekspor PPTX) gagal beroperasi untuk seluruh pengguna tanpa alternatif. | AI provider gagal total tanpa failover, RPC submit penugasan gagal, rendering PPTX gagal permanen. | **< 45 menit** |
| **P2** | **Sedang / Degradasi Parsial**: Fitur mengalami penurunan performa atau fitur sekunder tidak berfungsi, namun alur belajar-mengajar utama masih dapat berjalan. | Kuota Gemini habis memicu failover lambat ke OpenAI (>2s), format lampiran tertentu gagal parsing, styling minor rusak. | **< 4 jam** |
| **P3** | **Rendah / Isu Kosmetik & Minor**: Kesalahan pengetikan, peringatan linter non-kritis, visual layout minor pada resolusi tertentu, atau permintaan fitur kecil. | Typo teks panduan, label tombol kurang pas di layar 320px, minor warning di konsol dev. | **Rilis Terjadwal** |

---

## 2. Alur Kerja Penanganan Insiden (Incident Response Flow)

```text
1. DETEKSI (Monitoring alert, bug report pengguna, lonjakan error log)
      ↓
2. REPRODUKSI (Verifikasi di lingkungan QA / script pengujian)
      ↓
3. KLASIFIKASI (Tentukan tingkat keparahan P0 / P1 / P2 / P3)
      ↓
4. PEMBATASAN / CONTAINMENT (Aktifkan fallback, batasi fitur bermasalah, atau isolasi rute)
      ↓
5. PERBAIKAN AKAR MASALAH (Root Cause Resolution pada modul yang tepat)
      ↓
6. PENGUJIAN REGRESI (Jalankan suite uji regresi lokal: npm test, npm run test:qa4)
      ↓
7. DEPLOYMENT TERKONTROL (Fast-forward push ke main atau rollback Vercel)
      ↓
8. VERIFIKASI PRODUKSI (Smoke test rute live dan verifikasi akun riil)
      ↓
9. DOKUMENTASI & POST-MORTEM (Catat akar masalah, perbaikan, dan aksi mitigasi di docs/)
```

---

## 3. Diagnosis Cepat Berdasarkan Taksonomi Error (Quick Diagnostic Guides)

### A. `AUTH_ERROR` / Error 401 atau PGRST301
- **Gejala**: Pengguna melihat *"Forbidden: Gagal memuat profil basis data (Invalid API key)"* atau gagal masuk.
- **Penyebab Utama**: Kontaminasi variabel lingkungan lama atau token sesi kadaluarsa.
- **Langkah Penanganan**:
  1. Periksa `auth-middleware.ts` untuk memastikan `CANONICAL_SUPABASE_URL` dan `CANONICAL_SUPABASE_PUBLISHABLE_KEY` aktif.
  2. Jalankan `npm run verify:auth` untuk memeriksa gateway Supabase Auth live.
  3. Minta pengguna menghapus session storage/cookies lalu login ulang jika sesi lama kadaluarsa.

### B. `AI_PROVIDER_ERROR` / Error 429 atau 503
- **Gejala**: Generasi modul atau ilustrasi gagal atau memakan waktu lebih lama dari biasanya.
- **Penyebab Utama**: Batas kuota (rate limit) Google Gemini terlampaui.
- **Langkah Penanganan**:
  1. Periksa log konsol untuk pesan `[DualIllustrationRouter] Primary provider (gemini) failed with retryable error (429)`.
  2. Pastikan failover otomatis ke OpenAI (`gpt-image-2` / `gpt-4o-mini`) terjadi tanpa intervensi manual.
  3. Jika kedua penyedia mengalami gangguan eksternal, tampilkan pesan ramah sistem yang merekomendasikan pengguna mencoba kembali dalam 2 menit.

### C. `GROUNDING_ERROR` / Validasi Anti-Halusinasi Gagal
- **Gejala**: Guru menerima peringatan *"Topik tidak ditemukan atau tidak didukung secara memadai oleh materi sumber"*.
- **Penyebab Utama**: Penolakan yang disengaja oleh sistem anti-halusinasi (*fail-closed*) karena materi sumber tidak memuat topik yang diminta guru, atau judul dokumen mengandung ekstensi boilerplate.
- **Langkah Penanganan**:
  1. **Bukan Bug**: Ini adalah perilaku keselamatan yang diharapkan agar modul tidak berhalusinasi.
  2. Pandu guru untuk menggunakan tombol *"Saran dari sumber: ... (Gunakan)"* atau menempelkan teks materi yang relevan pada tab Teks.

### D. `PPTX_ERROR` / Kegagalan Pembuatan Presentasi
- **Gejala**: Guru gagal mengunduh file presentasi PPTX atau gerbang mutu PPT-1F memberikan keputusan `FAIL`.
- **Penyebab Utama**: Struktur slide tidak memenuhi syarat kelulusan (kontras warna rendah, teks kosong, atau kerusakan ZIP OpenXML).
- **Langkah Penanganan**:
  1. Jalankan `npm run test:ppt1f` untuk menguji generator secara terisolasi.
  2. Periksa apakah `renderPresentationPptx` menghasilkan biner OOXML yang valid ($\ge 50$ KB).

---

## 4. Prosedur Eskalasi & Kontak Tanggap Darurat

1. **Koordinator Operasional / Tech Lead**:
   - Memutuskan status keparahan insiden (P0/P1).
   - Menyetujui penerapan *hotfix* ke cabang `main` atau inisiasi *rollback*.
2. **Kanal Pelaporan Pengguna**:
   - Fitur bawaan pelaporan bug: Tombol *"Laporkan Masalah"* di dalam aplikasi yang langsung menulis ke tabel Supabase `bug_reports`.
   - Admin dapat meninjau seluruh laporan secara langsung di `/dashboard` tab *Laporan Masalah*.
