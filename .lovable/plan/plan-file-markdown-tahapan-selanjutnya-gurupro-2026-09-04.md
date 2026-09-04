# Plan: File Markdown "Tahapan Selanjutnya" GuruPro

## Tujuan
Membuat satu file markdown baru yang berisi tahapan kerja berikutnya (next steps) untuk membawa GuruPro dari prototype v2 (frontend-only, localStorage) menuju produk akhir sesuai proposal, blueprint, dan wireframe https://guruprowireframe.netlify.app.

## File yang dibuat
1. `NEXT-STEPS.md` di root project (referensi developer).
2. Salinan siap unduh: `GuruPro-Tahapan-Selanjutnya.md` di `/mnt/documents` (dilampirkan ke chat).

## Isi dokumen (berbahasa Indonesia, lengkap & berurutan)

1. **Ringkasan posisi saat ini** — apa yang sudah jadi (Dashboard, Modul Ajar, Soal/Bank Soal, Login/Logout, Profil, mock AI, localStorage) dan batasannya (belum ada database, auth sungguhan, peran siswa/admin).
2. **Tahap 1 — Fondasi Backend (Lovable Cloud)**: aktifkan database, rancang tabel (profiles, user_roles, kelas, siswa, modul_ajar, bank_soal, penugasan, jawaban, nilai, arsip), migrasi data dari localStorage.
3. **Tahap 2 — Autentikasi & Peran Nyata**: login sungguhan, 3 peran (Admin, Guru, Siswa), route guard per peran, halaman Verifikasi Akun Siswa.
4. **Tahap 3 — Tampilan Per Peran**:
   - Siswa: lihat modul, kerjakan soal/tugas, lihat nilai (read-only sesuai blueprint).
   - Guru: CRUD modul, soal, penugasan, penilaian (yang sekarang sudah ada, disambungkan ke DB).
   - Admin: kelola pengguna, kelas, mapel, monitoring sistem.
5. **Tahap 4 — Penugasan & Penilaian End-to-End**: publish soal ke kelas, pengumpulan tugas, koreksi, dashboard "Tugas Perlu Dikoreksi" memakai data nyata.
6. **Tahap 5 — AI Sungguhan**: ganti mock generator dengan Lovable AI (generate modul, ilustrasi, soal, revisi soal).
7. **Tahap 6 — Ekspor & Arsip Data**: PDF/Word/PPT dari data server, Arsip Data per semester.
8. **Tahap 7 — QA, Keamanan & Peluncuran**: uji per peran, RLS, audit keamanan, publish.
9. **Checklist per tahap** — kotak cek `[ ]` yang bisa ditandai saat pengerjaan, plus estimasi urutan prioritas dan kriteria "selesai" per tahap.

## Verifikasi
- Baca ulang file hasil untuk memastikan format markdown rapi dan lengkap.
- Lampirkan file ke chat sebagai artifact.

## Catatan teknis
- Tidak ada perubahan kode aplikasi; hanya penambahan 2 file markdown.
- Konsisten dengan isi `ROADMAP.md` yang sudah ada (Tahap 0–8), dokumen ini difokuskan sebagai panduan eksekusi langkah-berikutnya yang lebih operasional.
