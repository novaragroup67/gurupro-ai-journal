# Dokumentasi Alur Publikasi Modul Ajar oleh Guru (AI-3C)

## 1. Ringkasan Eksekutif

Tahap **AI-3C: Modul Ajar Publish Workflow** mewujudkan alur publikasi resmi Modul Ajar Kurikulum Merdeka yang sepenuhnya berada di bawah kendali otoritatif guru terverifikasi (*explicit teacher-controlled publish workflow*).

Alur ini menghubungkan fase peninjauan dan penyempurnaan draf guru (AI-3B) menuju status publikasi resmi (`Terbit`). Modul yang berstatus `Terbit` secara otomatis dapat diakses secara *read-only* oleh siswa di kelas terdaftar melalui kebijakan Row-Level Security (RLS) Supabase yang ketat, tanpa pernah membuka akses secara luas ke publik tanpa izin.

Invarian utama yang ditegakkan secara absolut adalah: **Mesin AI dilarang keras mempublikasikan modul secara otomatis (*AI never auto-publishes*)**. Publikasi mutlak merupakan tindakan sadar, eksplisit, dan bertanggung jawab dari seorang pendidik.

---

## 2. Arsitektur Alur Kerja End-to-End

```mermaid
flowchart TD
    A[Guru Terverifikasi Membuka Editor / Daftar Modul] --> B[Modul Berstatus 'Draft']
    B --> C[Klik Tombol 'Publikasikan']
    
    C --> D{Apakah Terdapat Suntingan Belum Disimpan?}
    D -->|Ya: dirty state| E[Simpan Draf Otomatis via saveModulDraftServerFn]
    D -->|Tidak: clean state| F[Tampilkan AlertDialog Konfirmasi Publikasi]
    E --> F
    
    F --> G{Konfirmasi Guru}
    G -->|Batal| H[Tutup Dialog, Status Tetap Draft]
    G -->|Ya, Publikasikan Modul| I[Panggil Server Function: publishModulServerFn]
    
    I --> J{Validasi Otorisasi & Kepemilikan}
    J -->|Bukan Guru / Unverified / Role Siswa / Tamu| K1[Tolak: 403 ROLE_FORBIDDEN]
    J -->|Bukan Pemilik Modul: existing.user_id != auth.uid| K2[Tolak: 403 ROLE_FORBIDDEN]
    J -->|Status Saat Ini Bukan 'Draft' / Sudah 'Terbit'| K3[Tolak: 400 INVALID_REQUEST]
    J -->|Modul Diarsipkan: is_archived = true| K4[Tolak: 400 INVALID_REQUEST]
    J -->|Konflik Konkurensi: expectedUpdatedAt < existing.updated_at| K5[Tolak: 400 Stale Data Conflict]
    
    J -->|Lolos Otorisasi & Guard| L[Evaluasi Kelayakan Publikasi: validateModulPublishEligibility]
    L -->|Cacat Skema / Kardinalitas Minimal Gagal / Dangling Evidence| K6[Tolak: 400 / 422 Validasi Gagal]
    
    L -->|Eligible: Lolos Seluruh Syarat| M[Preservasi Rekam Jejak Provenance & Rekam publishedAt / publishedBy]
    M --> N[Supabase UPDATE moduls SET status='Terbit', updated_at=now()]
    N --> O[Kembalikan Hasil Publikasi Otoritatif ke Klien]
    
    O --> P[State UI: Status Berubah Menjadi 'Terbit' / 'Dipublikasikan']
    P --> Q[Kunci Penyuntingan Draf: Read-Only Mode Diaktifkan]
    P --> R[Daftar Modul & Tampilan Siswa Segera Tersinkronisasi]
```

---

## 3. Aturan Transisi Status (*Status Transition Rules*)

Sistem menegakkan model status dua tahap kanonikal tanpa memperkenalkan status perantara yang membingungkan:

| Status Awal | Aksi / Pemicu | Status Tujuan | Keterangan & Validasi |
| :---: | :---: | :---: | :--- |
| `Draft` | Klik "Publikasikan" + Konfirmasi Guru | `Terbit` | **Diizinkan**. Divalidasi kelayakannya oleh `publishModulServerFn`. |
| `Terbit` | Klik "Publikasikan" Ulang | *(Ditolak)* | **Dilarang**. Server menolak modul yang sudah `Terbit` demi mencegah duplikasi audit dan korupsi status. |
| `Terbit` | Pengembalian ke `Draft` (*Unpublish*) | *(Dilarang)* | **Dilarang**. Tidak ada transisi `Terbit → Draft` pada kontrak arsitektur GuruPro saat ini guna menjaga integritas riwayat belajar dan penugasan siswa. |
| Non-`Draft` | Publikasi | *(Ditolak)* | **Dilarang**. Modul dengan status tidak dikenal ditolak seketika. |
| `is_archived: true` | Publikasi | *(Ditolak)* | **Dilarang**. Modul yang berada di Pusat Arsip tidak dapat dipublikasikan. |

---

## 4. Evaluasi Kelayakan Publikasi (*Publish Eligibility*)

Sebelum modul diubah dari `Draft` menjadi `Terbit`, fungsi [`validateModulPublishEligibility`](file:///c:/novara%20project/gurupro-ai-journal-main/src/lib/ai/modul-contract.ts#L525-L620) mengevaluasi 5 kriteria kelayakan di sisi server:

1. **Invarian Status Draf**: Memastikan `status === 'Draft'`. Jika sudah `Terbit`, dilempar galat spesifik `Modul ajar ini sudah berstatus Terbit`.
2. **Invarian Non-Arsip**: Memastikan `is_archived !== true`. Modul terarsip tidak boleh diterbitkan sebelum dipulihkan secara sah.
3. **Kepatuhan Skema Kanonikal & Kardinalitas Minimal**:
   - Judul minimal 3 karakter, ringkasan materi minimal 10 karakter.
   - Minimal 1 bab materi pokok ($\ge 1$), di mana tiap bab wajib memiliki judul minimal 3 karakter, minimal 1 butir poin capaian, dan uraian materi minimal 20 karakter.
   - Minimal 1 tujuan pembelajaran Kurikulum Merdeka ($\ge 1$).
   - Kegiatan pembelajaran 3 fase (Pendahuluan, Inti, Penutup) wajib terdefinisi lengkap dengan alokasi menit positif dan butir kegiatan konkret.
   - Asesmen pembelajaran wajib mencakup kriteria ketuntasan ($\ge 1$), teknik asesmen, dan instrumen asesmen.
4. **Integritas Referensi Bukti (*Evidence Reference Integrity*)**:
   - Jika metadata memiliki `evidenceRefs`, sistem memeriksa seluruh `evidenceIds` yang tertera pada tujuan pembelajaran dan bab materi pokok.
   - Setiap ID bukti rujukan wajib terdaftar secara sah pada `evidenceRefs` (*anti-dangling evidence references*).
5. **Ketiadaan Syarat Skor AI Subjektif**:
   - Sistem **tidak** memberlakukan ambang batas skor AI sewenang-wenang.
   - Modul dengan hasil evaluasi AI awal `PASS` maupun `REVISE`, atau modul yang telah disunting secara mandiri oleh guru, berhak diterbitkan selama seluruh validasi struktural dan integritas terpenuhi.

---

## 5. Otorisasi & Keamanan Multi-Tenant

Fungsi server [`publishModulServerFn`](file:///c:/novara%20project/gurupro-ai-journal-main/src/lib/ai.functions.ts#L1478-L1625) dipagari dengan proteksi berlapis:

- **Autentikasi Sesi Guru Terverifikasi**:
  Menggunakan middleware `requireTeacherAiAuth`. Permintaan dari siswa, pengguna tanpa autentikasi, ataupun akun guru dengan status verifikasi `menunggu` langsung ditolak dengan kode `403 ROLE_FORBIDDEN`.
- **Isolasi Kepemilikan Guru (*Teacher Ownership Guard*)**:
  Memastikan `existing.user_id === userId`. Guru dilarang keras mempublikasikan modul ajar milik rekan guru lain meskipun berada di sekolah/tenant yang sama.
- **Anti-Client-Spoofing**:
  Identitas guru dan hak akses sepenuhnya diambil dari sesi server Supabase (`context.userId`). Payload klien yang mencoba menyuntikkan ID atau peran palsu diabaikan total.

---

## 6. Preservasi Rekam Jejak (*Provenance*) & Anti-Fake-Validation

Invarian rekam jejak pada AI-3C menjaga transparansi asal-usul materi secara jujur dan akuntabel:

1. **Mempertahankan Validasi Asli AI**:
   - Objek `originalQualityValidation` dari AI awal tetap dipertahankan utuh dalam kolom `ai_metadata`.
   - Jika modul telah disunting oleh guru, flag `teacherEdited: true`, `editedAt`, dan `lastEditedBy` tetap terpelihara.
2. **Prinsip Anti-Fake-Validation**:
   - Saat publikasi dilakukan, sistem **dilarang memalsukan** bahwa AI telah melakukan validasi ulang otomatis atas materi suntingan guru.
   - Status ditampilkan secara terpisah:
     - Dibuat oleh AI: Ya / Tidak
     - Mutu AI Asli: PASS / REVISE
     - Ditinjau & Diedit Guru: Ya / Belum
     - Dipublikasikan oleh Guru: Ya
3. **Audit Jejak Publikasi**:
   - Ditambahkan properti `publishedAt` (ISO timestamp) dan `publishedBy` (ID guru yang mengeksekusi publikasi) di dalam `ai_metadata`.
   - Kolom `updated_at` pada tabel `moduls` Supabase diperbarui secara atomik.

---

## 7. Penanganan Konkurensi & Idempotensi

- **Proteksi Data Usang (*Stale Data Protection*)**:
  Klien mengirimkan timestamp `expectedUpdatedAt`. Jika basis data mendeteksi bahwa rekaman telah diubah oleh sesi lain lebih baru daripada snapshot klien, server menolak publikasi dengan galat `400 INVALID_REQUEST` dan mengarahkan pengguna untuk memuat ulang data terbaru.
- **Pencegahan Klik Ganda (*Double Submission*)**:
  Pada sisi UI, tombol publikasi dinonaktifkan (`disabled`) dan menampilkan status spinner `isPublishing`. Di sisi server, jika rekaman sudah berstatus `Terbit`, permintaan ditolak dengan aman tanpa merusak data.

---

## 8. Hak Akses Baca Siswa (*Published Read Access*)

Kebijakan RLS basis data Supabase (`siswa_select_class_moduls`) telah diaudit dan bekerja secara aman:
```sql
CREATE POLICY "siswa_select_class_moduls" ON public.moduls
  FOR SELECT TO authenticated
  USING (
    status = 'Terbit' 
    AND public.is_siswa_eligible_for_modul(user_id, kelas_id, kelas)
  );
```
- **Kerahasiaan Draf**: Selama modul berstatus `Draft`, modul **100% tidak terlihat dan tidak dapat di-query oleh siswa manapun**.
- **Keterikatan Kelas**: Setelah berstatus `Terbit`, modul **hanya** dapat dibaca oleh siswa yang aktif terdaftar pada kelas yang diampu oleh guru pemilik modul tersebut.
- Siswa tidak memiliki izin untuk menambah, menyunting, mempublikasikan, mengarsipkan, atau menghapus modul ajar (*read-only enforcement*).

---

## 9. Penguncian Penyuntingan Pasca-Terbit (*Post-Publish Read-Only Mode*)

Setelah modul diterbitkan (`status: 'Terbit'`):
1. **Antarmuka Editor**:
   - Menampilkan badge resmi: `Modul Terbit (Read-Only)`.
   - Menampilkan banner informatif bahwa materi telah resmi dipublikasikan untuk siswa.
   - Tombol "Edit Terstruktur", "Edit dengan AI", "Regenerasi", dan "Simpan Draft" dinonaktifkan/disembunyikan.
2. **Keamanan Sisi Server**:
   - Fungsi `saveModulDraftServerFn` (AI-3B) tetap memegang invarian `existing.status === 'Draft'` dan menolak mutasi draf pada modul yang telah `Terbit`.

---

## 10. Strategi Pengujian & Verifikasi

Pengujian komprehensif diimplementasikan pada file [`tests/ai/modul-publish-workflow.test.mjs`](file:///c:/novara%20project/gurupro-ai-journal-main/tests/ai/modul-publish-workflow.test.mjs) mencakup 20 skenario:

1. **Publish Eligibility**: Draf yang valid lolos evaluasi kelayakan.
2. **Publish Eligibility Guard**: Judul pendek (< 3 karakter) ditolak.
3. **Publish Eligibility Guard**: Bab materi kosong (`sections: []`) ditolak.
4. **Publish Eligibility Guard**: Bab tanpa butir poin capaian ditolak.
5. **Publish Eligibility Guard**: Referensi bukti rujukan fiktif (*dangling evidence ID*) ditolak.
6. **Publish Eligibility**: Modul berstatus AI `REVISE` tetap berhak dipublikasikan (bebas hambatan skor subjektif).
7. **Status Transition**: Guru pemilik terverifikasi sukses mempublikasikan `Draft` menjadi `Terbit`.
8. **Persistence & Reload**: Query ulang basis data mengembalikan status `Terbit`.
9. **Provenance Preservation**: `originalQualityValidation`, `teacherEdited`, `publishedAt`, dan `publishedBy` tersimpan utuh.
10. **Anti-Fake-Validation Invariant**: Publikasi tidak memalsukan status validasi AI baru.
11. **Status Transition Guard**: Modul yang sudah `Terbit` tidak dapat dipublikasikan ulang.
12. **Status Transition Guard**: Modul dengan status non-`Draft` ditolak.
13. **Archive Guard**: Modul yang diarsipkan (`is_archived: true`) ditolak dari publikasi.
14. **Authorization Guard**: Guru bukan pemilik ditolak (`ROLE_FORBIDDEN`).
15. **Authorization Guard**: Guru belum terverifikasi ditolak (`ROLE_FORBIDDEN`).
16. **Authorization Guard**: Akun siswa ditolak (`ROLE_FORBIDDEN`).
17. **Authorization Guard**: Pengguna tanpa autentikasi ditolak (`AUTH_ERROR`).
18. **Concurrency Protection**: Timestamp klien yang usang (*stale*) ditolak dengan aman.
19. **Post-Publish Read Access**: Siswa hanya dapat membaca modul `Terbit` dan draf tetap tersembunyi.
20. **Post-Publish Edit Lock**: Modul `Terbit` tidak dapat diubah melalui fungsi penyimpan draf.

Hasil pengujian: **20 passed, 0 failed (100% kelulusan)**.
Rangkaian regresi penuh: **27 passed, 0 failed (100% kelulusan)**.
Kompilasi produksi: **Lolos tanpa galat (build code 0)**.
