# Dokumen Analisis Kesesuaian + Roadmap GuruPro

Membuat satu berkas markdown di root project: `ROADMAP.md` (plus `docs/analisis-kesesuaian.md` bila perlu dipisah) yang berisi audit kondisi project saat ini terhadap Proposal Produk, Product Blueprint v4.2, dan wireframe (guruprowireframe.netlify.app), lengkap dengan persentase kesesuaian dan tahapan lanjutan sampai produk final (database + 3 peran: Guru, Siswa, Admin).

## Isi dokumen

1. **Ringkasan Eksekutif** — status prototipe, skor kesesuaian keseluruhan, 3 gap terbesar.
2. **Sumber Rancangan** — ringkasan Proposal (masalah, pain score 55/60, 17 fitur MVP per peran) dan Blueprint (aktor Guru/Siswa/Admin, business flow 10 langkah, user flow, BPMN Guru/Siswa/Admin).
3. **Kondisi Project Saat Ini** — hasil audit kode:
   - Sudah ada: layout dashboard + sidebar responsif, Dashboard guru (statistik, tabel tugas perlu dikoreksi, notifikasi), Modul Ajar (generator AI mock 4 sumber, editor, ilustrasi, PPT, ekspor), Soal (bank soal, AI generate + revisi), Login/Logout/Profil demo (`localStorage`), design system sesuai logo.
   - Belum ada: database, peran Siswa & Admin, Penugasan, Penilaian/Rekap Nilai, Verifikasi Akun Siswa, Arsip Data (masih halaman "Coming Soon"), pendaftaran + lupa kata sandi, kode/undangan kelas, remedial & KKM, AI nyata.
4. **Tabel Kesesuaian per Fitur (17 fitur MVP)** — kolom: Fitur, Peran, Status (Selesai / Sebagian / Belum), % kesesuaian, catatan gap. Ditutup dengan rata-rata berbobot per peran:
   - Kesesuaian Guru, Kesesuaian Siswa, Kesesuaian Admin, dan Total keseluruhan (angka final dihitung dari tabel, bukan dikira-kira).
5. **Kesesuaian per Alur (BPMN)** — checklist langkah BPMN Guru / Siswa / Admin dengan tanda sudah/belum terimplementasi, sehingga terlihat presisi bagian mana yang bolong.
6. **Kesesuaian Wireframe & UI** — struktur navigasi, layout halaman, komponen (kartu, tabel, dialog, empty/loading state) versus wireframe; catatan halaman wireframe yang belum punya padanan route.
7. **Rencana Data & Arsitektur Target** — daftar tabel yang dibutuhkan (profiles, user_roles, sekolah/kelas, kelas_anggota + pengajuan, modul, modul_section, slide, soal & paket_soal, penugasan, pengumpulan, nilai, remedial, arsip, notifikasi, log_aktivitas), aturan role terpisah di tabel `user_roles`, prinsip akses per peran, dan catatan bahwa AI dijalankan lewat fungsi server.
8. **Matriks Hak Akses per Peran** — Guru / Siswa / Admin x menu (lihat, buat, edit, hapus, nilai, verifikasi).
9. **Roadmap Bertahap (Tahap 0–8)** — setiap tahap berisi tujuan, ruang lingkup, kriteria selesai (definition of done), dan estimasi dampak ke persentase kesesuaian:
   - Tahap 0: Finalisasi prototipe frontend (lengkapi Penugasan, Penilaian, Verifikasi, Arsip dengan data lokal).
   - Tahap 1: Aktifkan backend/database + autentikasi nyata (daftar, login, lupa kata sandi, status menunggu verifikasi).
   - Tahap 2: Sistem peran & routing per peran (dashboard Guru / Siswa / Admin terpisah).
   - Tahap 3: Kelas & keanggotaan (kode kelas, undangan, pengajuan gabung, verifikasi siswa oleh guru).
   - Tahap 4: Migrasi Modul Ajar & Bank Soal ke database + publikasi ke kelas.
   - Tahap 5: Penugasan & pengerjaan siswa (kerjakan, unggah, batas waktu).
   - Tahap 6: Penilaian, KKM, remedial, rekap & ekspor nilai.
   - Tahap 7: Panel Admin (verifikasi akun guru, manajemen akun, reset sandi, log aktivitas).
   - Tahap 8: AI nyata (modul, soal, revisi, bantuan koreksi), arsip, laporan, polish & QA.
10. **Urutan Eksekusi yang Disarankan + Checklist** — daftar centang ringkas yang bisa dipakai lanjut per sesi.
11. **Risiko & Catatan Keamanan** — pemisahan role di tabel sendiri, akses data per pemilik, guru hanya melihat kelas sendiri, siswa read-only pada materi/nilai.

## Catatan teknis

- Persentase dihitung dari tabel fitur: bobot sama per fitur MVP, nilai 100% (selesai), 40–60% (sebagian, sesuai kelengkapan), 0% (belum) — rumus dicantumkan di dokumen agar bisa diperbarui.
- Dokumen ditulis dalam Bahasa Indonesia, memakai tabel markdown dan diagram alur berformat ```text.
- Hanya menambah berkas dokumentasi pada langkah ini; tidak ada perubahan kode aplikasi.
