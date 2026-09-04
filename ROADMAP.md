# GuruPro — Analisis Kesesuaian & Roadmap Menuju Produk Final

Dokumen ini membandingkan kondisi project GuruPro saat ini dengan tiga sumber rancangan resmi, lalu menetapkan tahapan lanjutan sampai produk final (terhubung database, dengan tiga peran: Guru, Siswa, Admin).

| Item | Keterangan |
| --- | --- |
| Versi dokumen | 1.0 |
| Tanggal | 4 September 2026 |
| Sumber rancangan | `Proposal_Produk_1_2.pptx`, `GuruPro_Product_Blueprint_v4_2.pptx`, wireframe `https://guruprowireframe.netlify.app` |
| Status project | Prototipe frontend-only (React + TypeScript + Tailwind + shadcn/ui, data di `localStorage`) |

---

## 1. Ringkasan Eksekutif

GuruPro saat ini adalah **prototipe frontend peran Guru**. Alur inti Guru untuk Modul Ajar dan Soal sudah terasa fungsional (AI mock, editor, ekspor, bank soal, revisi AI), design system sudah sesuai logo, dan navigasi sudah sesuai wireframe. Namun keseluruhan sistem masih jauh dari rancangan karena dua dari tiga aktor belum ada dan tidak ada penyimpanan terpusat.

### Skor Kesesuaian

| Cakupan | Kesesuaian |
| --- | --- |
| Fitur Guru | **± 39 %** |
| Fitur Siswa | **0 %** |
| Fitur Admin | **0 %** |
| **Total MVP (17 fitur)** | **± 20 %** |
| Struktur UI & navigasi vs wireframe | ± 55 % |
| Alur BPMN (Guru + Siswa + Admin) | ± 15 % |

### Tiga Gap Terbesar

1. **Tidak ada database & autentikasi nyata.** Semua data tersimpan di `localStorage` browser, login memakai akun demo hardcode. Blueprint mensyaratkan penyimpanan data (materi, tugas, nilai, pengajuan kelas, log aktivitas) di database.
2. **Peran Siswa dan Admin belum dibangun sama sekali.** Blueprint punya BPMN penuh untuk keduanya (materi, tugas, nilai, remedial, gabung kelas, verifikasi akun guru, manajemen guru).
3. **Rantai nilai belum tersambung.** Penugasan → pengumpulan → koreksi → nilai → KKM/remedial → rekap → ekspor belum ada; halaman Penugasan, Penilaian, Verifikasi, dan Arsip masih "Coming Soon".

---

## 2. Ringkasan Sumber Rancangan

### 2.1 Proposal Produk

- **Masalah utama:** jurnal mengajar, absensi, rekap nilai, dan analisis rapor masih manual — lama dan rawan salah catat.
- **Bukti lapangan:** wawancara 4 guru (SMKN 1 Rembang, SMKN 2 Purbalingga). Modul ajar manual bisa ± 1 minggu; rekap nilai dipadukan manual dengan absensi dan jurnal.
- **Skor prioritas masalah:** **55 / 60** (pain 5, frekuensi 5, jumlah pengguna 5).
- **Estimasi pasar:** ± 23 guru/sekolah, ± 630 guru/kabupaten, ± 9.580 guru/provinsi, ± 325.747 guru SMK nasional.
- **Willingness to pay:** Rp50.000 – >Rp100.000 per guru (validasi awal).
- **Ruang lingkup MVP: 17 fitur per peran** (menjadi dasar tabel penilaian di Bagian 4).

### 2.2 Product Blueprint v4.2

- **Aktor:** Guru (menyiapkan & mengelola pembelajaran), Siswa (mengikuti & mengerjakan), Admin (verifikasi & manajemen akun guru).
- **Business flow Guru (10 langkah):** susun modul → jurnal mengajar → absensi → buat tugas (AI) → beri tugas → terima tugas → koreksi → nilai (manual/AI) → rekap nilai → laporan rapor.
- **User flow:** Guru (Modul Ajar / Soal / Rekap Nilai), Siswa (materi → tugas → upload → nilai → KKM? → remedial), Admin (verifikasi → valid? → aktifkan/tolak).
- **BPMN:** mencakup pendaftaran guru (form + upload KTP + status menunggu verifikasi admin), lupa kata sandi, modul, soal, tugas, penilaian, verifikasi akun siswa, arsip, profil, logout; siswa punya gabung kelas via kode/tautan + status pengajuan; admin punya verifikasi akun guru + manajemen guru (edit, aktif/nonaktif, reset sandi) + log aktivitas.
- **Catatan penting:** akun **Siswa diverifikasi oleh Guru pemilik kode kelas**, bukan Admin. Admin tidak bisa menambah akun guru manual. Nilai akhir dihitung sistem dari kombinasi nilai AI dan nilai manual guru.

### 2.3 Wireframe

Wireframe menjadi *source of truth* struktur UI: layout sidebar + header + konten, dashboard statistik + tabel tugas perlu dikoreksi, dan urutan menu Guru (Dashboard, Modul Ajar, Soal, Penugasan, Penilaian, Verifikasi Akun Siswa, Arsip Data, Profil, Log Out).

---

## 3. Kondisi Project Saat Ini (Hasil Audit Kode)

### 3.1 Sudah Ada

| Area | Bukti di kode | Catatan |
| --- | --- | --- |
| Shell aplikasi | `src/routes/__root.tsx`, `src/components/app-sidebar.tsx` | Sidebar collapsible + header sticky + avatar menu, responsif mobile |
| Design system | `src/styles.css` | Token navy / biru / sky / oranye sesuai logo |
| Dashboard Guru | `src/routes/index.tsx` (224 baris) | 4 statistik, tabel "Tugas Perlu Dikoreksi", akses cepat |
| Notifikasi | `src/lib/notifications.ts`, `src/components/notification-menu.tsx` | Dropdown lonceng berfungsi (data mock) |
| Modul Ajar | `src/routes/modul-ajar.tsx`, `modul-editor.tsx`, `modul-generator-dialog.tsx`, `src/lib/modul-ai.ts` | 4 sumber (CP/ATP, eBook, Teks, Link), editor per bagian, ilustrasi, slide PPT |
| Ekspor | `src/lib/exporters.ts` | PDF (print), Word (.doc), PPT (.ppt) |
| Soal | `src/routes/soal.tsx` (882 baris), `src/lib/soal-ai.ts`, `soal-store.ts` | Bank soal, generate AI mock, revisi instruksi AI, publikasi ke kelas |
| Login / Logout | `src/routes/login.tsx`, `src/lib/auth-store.ts` | Akun demo `guru@gurupro.id` / `gurupro123`, gate redirect ke `/login` |
| Profil | `src/routes/profil.tsx` | Edit data guru, persist `localStorage` |
| Persistensi | `src/lib/local-store.ts` | Store `localStorage` SSR-safe |

### 3.2 Belum Ada

- Database / backend / autentikasi nyata (masih flag `signedIn` di `localStorage`).
- Peran **Siswa** dan **Admin** (route, dashboard, hak akses, seluruh alurnya).
- **Penugasan** (`src/routes/penugasan.tsx` → `ComingSoon`).
- **Penilaian / Rekap Nilai** (`src/routes/penilaian.tsx` → `ComingSoon`).
- **Verifikasi Akun Siswa** (`src/routes/verifikasi.tsx` → `ComingSoon`).
- **Arsip Data** (`src/routes/arsip.tsx` → `ComingSoon`).
- Pendaftaran guru (form + upload KTP + status menunggu verifikasi), lupa kata sandi & reset.
- Kelas: kode kelas, tautan undangan, pengajuan gabung, daftar kelas diikuti.
- Jurnal mengajar & absensi (ada di business flow Blueprint, belum ada di aplikasi).
- KKM, remedial, nilai akhir gabungan AI + manual, sinkron ke data rapor.
- AI nyata (saat ini seluruhnya template rule-based lokal).
- Log aktivitas, notifikasi berbasis kejadian nyata.

---

## 4. Tabel Kesesuaian per Fitur MVP (17 Fitur)

Rumus penilaian: setiap fitur berbobot sama. **100 %** = selesai sesuai rancangan; **5–75 %** = sebagian (proporsional terhadap kelengkapan peran & alur); **0 %** = belum ada. Nilai di kolom "%" adalah kesesuaian fitur mencakup **semua peran** yang disebut Proposal.

| # | Fitur | Peran | Status | % | Gap utama |
| --- | --- | --- | --- | --- | --- |
| 1 | Daftar (registrasi) | Guru, Siswa | Belum | 0 | Tidak ada form pendaftaran, upload KTP, status menunggu verifikasi |
| 2 | Login | Guru, Siswa, Admin | Sebagian | 30 | Hanya guru, akun demo hardcode, tanpa autentikasi server |
| 3 | Lupa kata sandi | Guru, Siswa | Belum | 0 | Tidak ada kirim tautan reset & buat sandi baru |
| 4 | Dashboard | Guru, Siswa, Admin | Sebagian | 30 | Dashboard Guru bagus (mock); Siswa & Admin belum ada |
| 5 | Modul Ajar | Guru | Sebagian | 75 | UI & AI mock lengkap, belum tersimpan di database, belum publikasi ke kelas nyata |
| 6 | Soal | Guru | Sebagian | 70 | Bank soal & revisi AI ada; belum terhubung kelas/penugasan nyata |
| 7 | Penugasan | Guru | Sebagian | 10 | Hanya tabel mock di dashboard; halaman masih Coming Soon |
| 8 | Penilaian | Guru | Sebagian | 5 | Belum ada koreksi, nilai AI + manual, nilai akhir, rekap, ekspor |
| 9 | Verifikasi Akun Siswa | Guru | Sebagian | 5 | Coming Soon; belum ada kode kelas & daftar pengajuan |
| 10 | Arsip Data | Guru | Sebagian | 5 | Coming Soon; belum ada arsip per semester |
| 11 | Profil | Guru, Siswa | Sebagian | 45 | Profil Guru berfungsi; profil Siswa (kelas, status pengajuan) belum ada |
| 12 | Materi Siswa | Siswa | Belum | 0 | Belum ada halaman materi & penanda dilihat |
| 13 | Tugas Siswa | Siswa | Belum | 0 | Belum ada kerjakan, unggah, batas waktu |
| 14 | Nilai Siswa | Siswa | Belum | 0 | Belum ada lihat nilai, KKM, remedial |
| 15 | Verifikasi Akun Guru | Admin | Belum | 0 | Belum ada panel admin |
| 16 | Manajemen Guru | Admin | Belum | 0 | Belum ada daftar akun, edit, aktif/nonaktif, reset sandi |
| 17 | Log Out | Guru, Siswa, Admin | Sebagian | 60 | Berfungsi untuk Guru saja |

**Perhitungan total:** (0+30+0+30+75+70+10+5+5+5+45+0+0+0+0+0+60) ÷ 17 = 335 ÷ 17 = **19,7 % ≈ 20 %**

**Kesesuaian per peran** (hanya fitur milik peran tersebut, dinilai dari sudut peran itu):

| Peran | Fitur dinilai | Kesesuaian |
| --- | --- | --- |
| Guru | 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 17 | **± 39 %** |
| Siswa | 1, 2, 3, 4, 11, 12, 13, 14, 17 | **0 %** |
| Admin | 2, 4, 15, 16, 17 | **0 %** |

---

## 5. Kesesuaian per Alur (BPMN)

Legenda: `[x]` sudah ada · `[~]` sebagian / masih mock · `[ ]` belum ada

### 5.1 BPMN Guru

```text
[x] Buka aplikasi
[ ] Sudah punya akun? → Isi form pendaftaran (nama, email, no HP, sekolah, mapel, NIP/NUPTK)
[ ] Upload KTP → Kirim pendaftaran → Status menunggu verifikasi admin
[~] Login guru (akun demo, tanpa autentikasi server)
[ ] Lupa kata sandi → input email → tautan reset → buat sandi baru
[~] Sistem autentikasi & penanganan login gagal (validasi lokal saja)
[~] Dashboard guru (data mock)
[~] A. Modul Ajar: susun / AI / edit / simpan / publikasi (belum tersimpan di database)
[~] B. Soal: buat manual & AI, atur parameter, revisi AI, simpan, publikasi (lokal)
[ ] C. Penugasan: buat tugas, pilih kelas, batas waktu, terima pengumpulan
[ ] D. Penilaian: koreksi jawaban, nilai AI, nilai manual, nilai akhir, rekap, ekspor
[ ] E. Verifikasi akun siswa: kode kelas, daftar pengajuan, setujui/tolak
[ ] F. Arsip data: arsip modul/soal/nilai per semester
[~] G. Profil: lihat & edit data guru (belum ganti sandi, belum kode & tautan kelas)
[x] H. Logout
[ ] Simpan seluruh data & log aktivitas ke database
```

### 5.2 BPMN Siswa

```text
[ ] Buka aplikasi → login siswa → autentikasi → dashboard siswa
[ ] Lupa kata sandi
[ ] A. Materi: lihat daftar & detail materi, tandai dilihat
[ ] B. Tugas: lihat tugas, kerjakan, unggah, kumpulkan, lihat status
[ ] C. Nilai: lihat nilai, cek KKM, remedial, unggah ulang
[ ] D. Profil: gabung kelas (kode / tautan), daftar kelas diikuti, keluar kelas, status pengajuan
[ ] E. Logout
```

### 5.3 BPMN Admin

```text
[ ] Login admin → dashboard admin → pilih menu
[ ] A. Verifikasi akun guru: lihat permintaan, verifikasi, setujui / tolak, simpan status
[ ] B. Manajemen guru: daftar akun, kelas diampu (read-only), edit data, aktif/nonaktif, reset sandi
[ ] C. Logout + log aktivitas
```

Rekap: dari ± 60 langkah kunci pada tiga BPMN, sekitar 9 langkah sudah/sebagian terpenuhi → **± 15 %**.

---

## 6. Kesesuaian Wireframe & UI

| Elemen wireframe | Status | Catatan |
| --- | --- | --- |
| Layout sidebar + header + konten | Sesuai | Sidebar collapsible, header sticky, tidak ada elemen bertumpuk |
| Urutan menu Guru | Sesuai | Dashboard, Modul Ajar, Soal, Penugasan, Penilaian, Verifikasi Akun Siswa, Arsip Data, Profil, Log Out |
| Responsif mobile | Sesuai | Sheet sidebar, kartu & tabel bertumpuk rapi |
| Dashboard: 4 statistik | Sesuai | 2 Modul Aktif, 27 Tugas Masuk, 92 % Sudah Dinilai, 3 Kelas Diampu |
| Dashboard: tabel tugas perlu dikoreksi | Sesuai | Responsif, aksi mengarah ke halaman terkait |
| Dropdown notifikasi | Sesuai | 3 notifikasi mock |
| Halaman Modul Ajar + editor + PPT | Sesuai | Tab isi / ilustrasi / slide |
| Halaman Soal + review + revisi AI | Sesuai | Bank soal → publikasi |
| Halaman Penugasan | Belum | Masih Coming Soon |
| Halaman Penilaian / Rekap Nilai | Belum | Masih Coming Soon |
| Halaman Verifikasi Akun Siswa | Belum | Masih Coming Soon |
| Halaman Arsip Data | Belum | Masih Coming Soon |
| Halaman Daftar / Lupa Sandi | Belum | Belum ada route |
| Seluruh halaman Siswa | Belum | Belum ada route |
| Seluruh halaman Admin | Belum | Belum ada route |

Kesesuaian UI/navigasi: **± 55 %** (kerangka & halaman Guru inti sesuai; halaman Siswa, Admin, dan 4 menu Guru masih kosong).

---

## 7. Rencana Data & Arsitektur Target

Backend akan memakai Lovable Cloud (database Postgres + autentikasi + storage + fungsi server). Semua logika AI dan operasi sensitif dijalankan di fungsi server, bukan di browser.

### 7.1 Tabel yang Dibutuhkan

| Tabel | Isi utama |
| --- | --- |
| `profiles` | id (→ akun), nama, email, no HP, sekolah, mapel, NIP/NUPTK, foto, status akun (menunggu/aktif/ditolak) |
| `user_roles` | user_id, role (`guru` / `siswa` / `admin`) — **role wajib di tabel terpisah** |
| `dokumen_verifikasi` | user_id, jenis (KTP), path file di storage, status |
| `kelas` | id, guru_id, nama kelas, mapel, tahun ajar, kode kelas, KKM |
| `kelas_anggota` | kelas_id, siswa_id, status (menunggu/aktif/keluar) |
| `pengajuan_kelas` | siswa_id, kelas_id, sumber (kode/tautan), status, waktu, catatan |
| `modul` | id, guru_id, kelas_id, judul, mapel, sumber tipe/input, ringkasan, status |
| `modul_section` | modul_id, urutan, judul, poin, isi, ilustrasi |
| `modul_slide` | modul_id, urutan, judul, bullets, ilustrasi |
| `paket_soal` | id, guru_id, judul, topik, modul_id, status |
| `soal` | paket_id, pertanyaan, jenis, opsi, kunci, tingkat kesulitan, skor |
| `penugasan` | id, guru_id, kelas_id, paket_id/modul_id, judul, instruksi, dibuka, tenggat, status |
| `pengumpulan` | penugasan_id, siswa_id, jawaban, file, waktu kumpul, status (belum/terkumpul/terlambat) |
| `nilai` | pengumpulan_id, siswa_id, penugasan_id, nilai_ai, nilai_manual, nilai_akhir, catatan, final |
| `remedial` | nilai_id, siswa_id, percobaan, nilai_remedial, status |
| `arsip` | guru_id, jenis entitas, ref_id, semester, tahun ajar, waktu arsip |
| `notifikasi` | user_id, jenis, judul, pesan, dibaca |
| `log_aktivitas` | user_id, aksi, entitas, ref_id, waktu, metadata |

### 7.2 Prinsip Akses Data

- Row Level Security aktif di semua tabel; role dibaca lewat fungsi `has_role` (security definer) agar tidak rekursif.
- Guru hanya melihat/mengubah data pada kelas yang ia ampu.
- Siswa hanya melihat materi, tugas, dan nilai pada kelas yang ia ikuti (read-only kecuali pengumpulan tugas & pengajuan kelas).
- Admin mengelola akun guru & status verifikasi; tidak mengelola akun siswa (sesuai catatan Blueprint).
- Verifikasi akun siswa dilakukan guru pemilik kode kelas.

---

## 8. Matriks Hak Akses per Peran

| Menu / Aksi | Guru | Siswa | Admin |
| --- | --- | --- | --- |
| Dashboard | Milik sendiri | Milik sendiri | Ringkasan sistem |
| Modul Ajar | Buat, edit, hapus, publikasi | — | — |
| Materi | Sumber = modul terbit | Lihat saja | — |
| Soal / Bank Soal | Buat, edit, hapus, revisi AI, publikasi | — | — |
| Penugasan | Buat, atur tenggat, tutup | Lihat & kerjakan | — |
| Pengumpulan | Lihat & koreksi | Unggah / unggah ulang | — |
| Penilaian & Rekap | Nilai, finalisasi, ekspor | Lihat nilai sendiri | — |
| Remedial | Buka remedial | Ikuti remedial | — |
| Kelas & Kode Kelas | Kelola kelas sendiri | Ajukan gabung / keluar | Lihat (read-only) |
| Verifikasi Akun Siswa | Setujui / tolak | — | — |
| Verifikasi Akun Guru | — | — | Setujui / tolak |
| Manajemen Akun Guru | — | — | Edit, aktif/nonaktif, reset sandi |
| Arsip Data | Arsip milik sendiri | — | Lihat |
| Profil | Edit sendiri | Edit sendiri | Edit sendiri |
| Log Aktivitas | — | — | Lihat |
| Log Out | Ya | Ya | Ya |

---

## 9. Roadmap Bertahap

Estimasi kesesuaian di kolom terakhir bersifat kumulatif terhadap total MVP 17 fitur.

### Tahap 0 — Lengkapi Prototipe Frontend Guru (frontend-only)

- **Tujuan:** hilangkan seluruh halaman "Coming Soon" agar alur Guru utuh sebelum masuk database.
- **Lingkup:** halaman Penugasan (buat tugas dari paket soal/modul, pilih kelas, tenggat, daftar pengumpulan mock), Penilaian (koreksi, nilai AI + manual, nilai akhir, rekap per kelas, ekspor), Verifikasi Akun Siswa (kode kelas + daftar pengajuan setujui/tolak), Arsip Data (arsip per semester + pencarian), plus halaman Daftar & Lupa Sandi (UI).
- **Selesai bila:** semua menu sidebar punya halaman fungsional dengan `localStorage`; tidak ada tombol mati; validasi, dialog konfirmasi, empty state, loading state, dan toast tersedia.
- **Target kesesuaian:** ± 20 % → **± 45 %**

### Tahap 1 — Aktifkan Backend, Database & Autentikasi Nyata

- **Lingkup:** aktifkan Lovable Cloud; buat tabel `profiles`, `user_roles`, `dokumen_verifikasi`; pendaftaran guru (form lengkap + upload KTP ke storage + status "menunggu verifikasi"); login/logout nyata; lupa kata sandi + halaman reset; profil dari database.
- **Selesai bila:** akun baru bisa dibuat, tertahan sampai diverifikasi, login/logout dan reset sandi berjalan, profil persist di database.
- **Target:** **± 55 %**

### Tahap 2 — Sistem Peran & Routing per Peran

- **Lingkup:** fungsi `has_role`, RLS dasar, dashboard terpisah Guru / Siswa / Admin, sidebar dinamis per peran, gate route per peran, halaman "akses ditolak".
- **Selesai bila:** satu akun hanya melihat menu dan data sesuai perannya; percobaan akses langsung ke route lain ditolak.
- **Target:** **± 60 %**

### Tahap 3 — Kelas & Keanggotaan

- **Lingkup:** `kelas`, `kelas_anggota`, `pengajuan_kelas`; guru membuat kelas + kode + tautan undangan (regenerasi kode); siswa gabung via kode/tautan, lihat daftar kelas diikuti, keluar kelas, lihat status pengajuan; guru verifikasi akun siswa (setujui/tolak).
- **Selesai bila:** siswa hanya melihat kelas yang disetujui; verifikasi siswa dilakukan guru pemilik kode.
- **Target:** **± 68 %**

### Tahap 4 — Migrasi Modul Ajar & Bank Soal ke Database

- **Lingkup:** `modul`, `modul_section`, `modul_slide`, `paket_soal`, `soal`; publikasi modul & paket soal ke kelas; ekspor PDF/Word/PPT dari data database.
- **Selesai bila:** modul & soal tersimpan per guru, terbit ke kelas terpilih, dan tampil sebagai materi bagi siswa kelas tersebut.
- **Target:** **± 76 %**

### Tahap 5 — Penugasan & Pengerjaan Siswa

- **Lingkup:** `penugasan`, `pengumpulan`; guru memberi tugas (dari paket soal) dengan tenggat; siswa mengerjakan, mengunggah lampiran, mengumpulkan; status belum/terkumpul/terlambat; notifikasi kejadian nyata.
- **Selesai bila:** siklus beri tugas → kerjakan → kumpulkan → muncul di daftar koreksi guru berjalan penuh.
- **Target:** **± 84 %**

### Tahap 6 — Penilaian, KKM, Remedial & Rekap

- **Lingkup:** `nilai`, `remedial`; koreksi otomatis pilihan ganda, penilaian manual esai, nilai akhir = gabungan nilai AI + manual, KKM per kelas, remedial + unggah ulang, rekap nilai per kelas, ekspor PDF, sinkron data rapor.
- **Selesai bila:** siswa melihat nilai & status KKM-nya; guru memfinalisasi dan mengekspor rekap.
- **Target:** **± 90 %**

### Tahap 7 — Panel Admin

- **Lingkup:** dashboard admin, verifikasi akun guru (setujui/tolak + simpan status), manajemen guru (daftar akun, kelas diampu read-only, edit data, aktif/nonaktif, reset sandi), `log_aktivitas`.
- **Selesai bila:** guru baru hanya bisa masuk setelah disetujui admin; semua aksi admin tercatat di log.
- **Target:** **± 96 %**

### Tahap 8 — AI Nyata, Arsip, Laporan & QA Final

- **Lingkup:** ganti AI mock dengan AI nyata lewat fungsi server (susun modul, buat soal, revisi soal, bantu koreksi esai) dengan guru tetap sebagai pengambil keputusan akhir; `arsip` per semester; laporan/rapor; audit responsif & aksesibilitas; uji end-to-end tiga peran; SEO & metadata halaman publik.
- **Selesai bila:** seluruh 17 fitur MVP berjalan di database, tiga BPMN terpenuhi, tidak ada elemen dummy.
- **Target:** **± 100 %**

---

## 10. Urutan Eksekusi & Checklist

```text
Tahap 0  [ ] Penugasan  [ ] Penilaian  [ ] Verifikasi Siswa  [ ] Arsip  [ ] Daftar & Lupa Sandi (UI)
Tahap 1  [ ] Aktifkan Cloud  [ ] profiles/user_roles  [ ] Registrasi + KTP  [ ] Login nyata  [ ] Reset sandi
Tahap 2  [ ] has_role + RLS  [ ] Dashboard 3 peran  [ ] Sidebar dinamis  [ ] Gate route
Tahap 3  [ ] Kelas + kode  [ ] Gabung kelas  [ ] Status pengajuan  [ ] Verifikasi siswa
Tahap 4  [ ] Modul ke DB  [ ] Soal ke DB  [ ] Publikasi ke kelas  [ ] Ekspor dari DB
Tahap 5  [ ] Buat penugasan  [ ] Kerjakan & unggah  [ ] Status pengumpulan  [ ] Notifikasi
Tahap 6  [ ] Koreksi otomatis  [ ] Nilai manual  [ ] Nilai akhir  [ ] KKM & remedial  [ ] Rekap & ekspor
Tahap 7  [ ] Dashboard admin  [ ] Verifikasi guru  [ ] Manajemen guru  [ ] Log aktivitas
Tahap 8  [ ] AI nyata  [ ] Arsip  [ ] Laporan  [ ] QA 3 peran  [ ] Polish akhir
```

Saran ritme kerja: satu tahap = satu sesi pengerjaan, selalu ditutup dengan uji alur end-to-end pada peran yang terdampak sebelum lanjut ke tahap berikutnya.

---

## 11. Risiko & Catatan Keamanan

1. **Role wajib di tabel `user_roles`**, bukan di `profiles`. Menyimpan role di profil membuka celah eskalasi hak akses.
2. **Jangan pernah menentukan peran dari data browser** (`localStorage`/`sessionStorage`). Validasi peran selalu di server.
3. **RLS untuk setiap tabel** dengan kebijakan berbasis pemilik: guru → kelas yang diampu, siswa → kelas yang diikuti.
4. **Siswa read-only** pada materi & nilai; hanya boleh menulis pada pengumpulan tugas dan pengajuan kelas.
5. **File KTP bersifat sensitif** — simpan di bucket privat, akses hanya lewat URL bertanda tangan untuk admin.
6. **Nilai akhir dihitung di server**, tidak boleh dihitung/dikirim dari klien.
7. **Kunci API AI hanya di server** (fungsi server), jangan pernah dikirim ke browser.
8. **Log aktivitas** untuk setiap aksi verifikasi, perubahan akun, dan finalisasi nilai — dibutuhkan untuk audit sesuai Blueprint.
9. **Migrasi data lokal:** data `localStorage` yang sudah ada tidak otomatis pindah ke database; siapkan mekanisme reset/impor pada Tahap 4.
