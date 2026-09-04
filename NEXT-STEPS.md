# GuruPro — Tahapan Selanjutnya (Next Steps)

Dokumen ini adalah panduan eksekusi langkah-berikutnya untuk membawa **GuruPro** dari prototype v2 (frontend-only, localStorage) menuju produk akhir sesuai proposal, blueprint, dan wireframe (https://guruprowireframe.netlify.app).

> Dokumen pendamping: `ROADMAP.md` (audit kesesuaian ±20% & roadmap Tahap 0–8).
> Dokumen ini fokus pada **apa yang dikerjakan setelah ini**, berurutan, dengan checklist yang bisa ditandai.

---

## 0. Posisi Saat Ini (Baseline)

### Sudah selesai (Prototype v2 — frontend-only)
- Login / Logout / Proteksi halaman (mock, localStorage), akun demo `guru@gurupro.id`.
- Profil guru: lihat & edit data diri, tersimpan di localStorage.
- Dashboard guru: statistik (Modul Aktif, Tugas Masuk, % Dinilai, Kelas Diampu), tabel "Tugas Perlu Dikoreksi", dropdown notifikasi.
- Modul Ajar: pembuatan berbantuan AI (mock) dari CP/ATP, eBook, teks, atau tautan; editor manual/AI; ilustrasi AI kontekstual (SVG); generate slide PPT; ekspor PDF/Word/PPT.
- Soal / Bank Soal: buat manual atau AI (mock), revisi AI ("ganti angka", "buat lebih sulit"), simpan ke bank, lalu publish ke kelas.
- Navigasi: Dashboard, Modul Ajar, Soal, Penugasan, Penilaian, Verifikasi Akun Siswa, Arsip Data, Profil, Log Out.
- Design system sesuai brand (navy #0D1B3D, biru #2563EB, sky #60A5FA, oranye #FF8A00).

### Batasan saat ini (harus diselesaikan di tahap berikutnya)
- Tidak ada database — semua data hilang jika localStorage dibersihkan, tidak bisa dibagikan antar perangkat/pengguna.
- Autentikasi masih mock — belum ada akun sungguhan, reset password, atau keamanan sesi.
- Belum ada peran **Siswa** dan **Admin** — tampilan saat ini hanya sisi Guru.
- AI masih mock berbasis template — belum memakai model AI sungguhan.
- Halaman Penugasan, Penilaian, Verifikasi Akun Siswa, dan Arsip Data masih placeholder/terbatas.

---

## Tahap 1 — Fondasi Backend (Lovable Cloud)

**Tujuan:** semua data tersimpan permanen di database dan bisa diakses lintas perangkat.

- [ ] Aktifkan Lovable Cloud (database, auth, storage, server functions) dari Lovable.
- [ ] Rancang & buat tabel (dengan RLS + GRANT di setiap migrasi):
  - [ ] `profiles` (nama, NIP/NISN, sekolah, mapel, telepon, bio, avatar)
  - [ ] `user_roles` (enum `app_role`: `admin`, `guru`, `siswa`) + fungsi `has_role()` (security definer)
  - [ ] `kelas` (nama kelas, wali/guru pengampu, tahun ajaran)
  - [ ] `kelas_siswa` (relasi siswa ↔ kelas)
  - [ ] `modul_ajar` (judul, mapel, kelas, sections JSON, ilustrasi, slides, status, guru_id)
  - [ ] `bank_soal` (tipe pg/essay, pertanyaan, opsi, kunci, tingkat kesulitan, mapel, guru_id)
  - [ ] `penugasan` (soal/modul yang di-publish ke kelas, deadline, status)
  - [ ] `jawaban` (jawaban siswa per soal/tugas)
  - [ ] `nilai` (skor, status koreksi, catatan guru)
  - [ ] `arsip_data` (rekap per semester/tahun ajaran)
- [ ] Tulis kebijakan RLS: guru hanya data miliknya & kelasnya; siswa hanya data kelasnya; admin semua.
- [ ] Migrasikan bentuk data dari store localStorage (`modul-types.ts`, `soal-types.ts`) ke skema tabel.
- [ ] Sediakan data contoh (seed) lewat migrasi agar layar pertama tidak kosong.

**Kriteria selesai:** aplikasi membaca/menulis modul & soal dari database, bukan localStorage.

---

## Tahap 2 — Autentikasi & Peran Nyata

**Tujuan:** login sungguhan dengan 3 peran yang hak aksesnya berbeda.

- [ ] Ganti `auth-store.ts` (mock) dengan autentikasi Lovable Cloud (email + password).
- [ ] Halaman login tersambung ke auth nyata; tambahkan alur lupa/reset password.
- [ ] Terapkan `user_roles`: satu peran per pengguna (Admin / Guru / Siswa).
- [ ] Route guard per peran: siswa tidak bisa membuka rute guru/admin, dan sebaliknya.
- [ ] Halaman **Verifikasi Akun Siswa**: akun siswa baru berstatus "menunggu" sampai diverifikasi guru/admin.
- [ ] Pendaftaran siswa (oleh admin/guru atau mandiri + verifikasi).

**Kriteria selesai:** tiga akun uji (admin, guru, siswa) bisa login dan diarahkan ke tampilan masing-masing.

---

## Tahap 3 — Tampilan Per Peran

### 3a. Tampilan Siswa (baru)
- [ ] Dashboard siswa: tugas aktif, deadline terdekat, nilai terbaru.
- [ ] Lihat modul ajar yang di-publish gurunya (read-only).
- [ ] Halaman mengerjakan soal/tugas (pilihan ganda + essay) dengan batas waktu.
- [ ] Halaman nilai & riwayat pengerjaan (read-only, sesuai blueprint: siswa hanya melihat).

### 3b. Tampilan Guru (sambungkan yang sudah ada)
- [ ] Dashboard, Modul Ajar, Soal/Bank Soal membaca & menulis ke database.
- [ ] Penugasan: publish bank soal ke kelas dengan deadline.
- [ ] Penilaian: koreksi jawaban siswa, beri nilai & catatan.
- [ ] Verifikasi Akun Siswa: setujui/tolak akun siswa di kelasnya.

### 3c. Tampilan Admin (baru)
- [ ] Dashboard admin: jumlah pengguna, guru, siswa, kelas, aktivitas.
- [ ] Kelola pengguna (buat/nonaktifkan akun, atur peran).
- [ ] Kelola kelas & mata pelajaran.
- [ ] Monitoring kesehatan sistem (log/error dasar) agar website berjalan tanpa kendala.

**Kriteria selesai:** setiap peran hanya melihat menu & data sesuai matriks hak akses di `ROADMAP.md`.

---

## Tahap 4 — Penugasan & Penilaian End-to-End

**Tujuan:** alur lengkap guru → siswa → guru berjalan dengan data nyata.

- [ ] Guru mem-publish soal dari Bank Soal ke kelas (judul, deadline, instruksi).
- [ ] Siswa menerima tugas di dashboard, mengerjakan, dan mengumpulkan.
- [ ] Jawaban pilihan ganda dinilai otomatis; essay masuk antrean koreksi.
- [ ] Tabel "Tugas Perlu Dikoreksi" di dashboard guru menampilkan data nyata.
- [ ] Guru memberi nilai + catatan; siswa melihat nilai akhir.
- [ ] Notifikasi (lonceng header) diisi dari kejadian nyata: tugas masuk, deadline, nilai keluar.

**Kriteria selesai:** satu siklus penuh (buat soal → publish → dikerjakan → dinilai → terlihat nilainya) berhasil diuji ujung-ke-ujung.

---

## Tahap 5 — AI Sungguhan

**Tujuan:** mengganti generator mock dengan Lovable AI.

- [ ] Generate Modul Ajar dari CP/ATP, teks, eBook (unggahan), atau tautan.
- [ ] Ilustrasi kontekstual memakai image generation (ganti SVG mock).
- [ ] Generate slide PPT otomatis dari isi modul.
- [ ] Generate soal (PG & essay) dari topik/materi + tingkat kesulitan.
- [ ] Revisi soal dengan instruksi bebas ("ganti angka", "buat lebih sulit", dst.).
- [ ] Simpan prompt & parameter agar hasil konsisten dengan mapel/kelas.

**Kriteria selesai:** semua tombol "Generate dengan AI" memanggil AI sungguhan dan hasilnya kontekstual terhadap input.

---

## Tahap 6 — Ekspor & Arsip Data

- [ ] Ekspor Modul Ajar ke PDF / Word / PPT dari data server (rapi, siap cetak).
- [ ] Ekspor rekap nilai per kelas (PDF/CSV).
- [ ] **Arsip Data**: pengarsipan modul, soal, tugas, dan nilai per semester/tahun ajaran; arsip read-only dan bisa dipulihkan.

**Kriteria selesai:** dokumen hasil ekspor sesuai format rancangan dan arsip bisa ditelusuri per periode.

---

## Tahap 7 — QA, Keamanan & Peluncuran

- [ ] Uji regresi semua alur untuk ketiga peran (desktop & mobile).
- [ ] Audit RLS: pastikan tidak ada kebocoran data lintas peran.
- [ ] Jalankan pemindaian keamanan & dependensi; tutup temuan kritis.
- [ ] Uji beban dasar (kelas 30–40 siswa mengerjakan bersamaan).
- [ ] Lengkapi SEO/metadata halaman publik (jika ada landing page).
- [ ] Publish ke URL produksi; siapkan panduan pengguna singkat (guru & siswa).

**Kriteria selesai:** GuruPro 100% sesuai proposal/blueprint/wireframe dan siap dipakai sekolah.

---

## Urutan Prioritas (Ringkas)

```text
Tahap 1 Database ──► Tahap 2 Auth & Peran ──► Tahap 3 Tampilan per Peran
        │                                           │
        └────────────► Tahap 4 Penugasan ◄──────────┘
                              │
              Tahap 5 AI ──► Tahap 6 Ekspor/Arsip ──► Tahap 7 QA & Launch
```

**Dependensi penting:**
- Tahap 2–7 bergantung pada Tahap 1 (tidak ada yang bisa permanen tanpa database).
- Tampilan siswa/admin (Tahap 3) bergantung pada Tahap 2 (peran harus ada dulu).
- Penilaian (Tahap 4) bergantung pada Tahap 3a (siswa harus bisa mengerjakan dulu).

---

## Cara Memakai Dokumen Ini
1. Kerjakan tahap berurutan; jangan melompat sebelum dependensinya selesai.
2. Tandai `[x]` setiap item yang selesai.
3. Setelah tiap tahap, perbarui persen kesesuaian di `ROADMAP.md`.
