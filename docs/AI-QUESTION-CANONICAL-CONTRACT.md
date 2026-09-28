# AI-4A: Canonical Question Contract & Grounding Foundation

Dokumentasi teknis ini menetapkan fondasi kontrak kanonikal (*Canonical Question Contract*), isolasi keamanan kunci jawaban, dan integrasi penelusuran bukti sumber (*source grounding*) untuk modul pembuatan bank soal berbasis AI di platform **GuruPro**.

---

## 1. Arsitektur Soal Saat Ini yang Ditemukan (Real Schema Audit)

Berdasarkan audit mendalam pada skema basis data PostgreSQL/Supabase, skrip migrasi, dan lapisan penyimpanan:
- **Tidak ada tabel SQL terpisah bernama `soal`**.
- Butir-butir soal disimpan secara terpusat sebagai array JSONB di dalam kolom `soal` pada tabel `public.paket_soal`.
- Kolom tabel `public.paket_soal`:
  - `id`: UUID (Primary Key, default `gen_random_uuid()`)
  - `user_id`: UUID (Foreign Key ke `auth.users`, pemilik akun guru)
  - `judul`: TEXT (Judul paket soal / bank soal)
  - `topik`: TEXT (Topik atau materi bahasan)
  - `modul_id`: UUID (Foreign Key opsional ke `public.moduls`)
  - `status`: TEXT (`'Draft'` | `'Terbit'`)
  - `kelas`: TEXT[] (Array label kelas sasaran)
  - `soal`: JSONB (Array objek butir soal, default `'[]'::jsonb`)
  - `created_at` & `updated_at`: TIMESTAMPTZ
  - `is_archived`, `archived_at`, `archived_by`: Kolom pengarsipan
  - `ai_metadata`: JSONB (Metadata generasi AI & audit rekam jejak)

---

## 2. Relasi `paket_soal` -> `penugasan` -> `siswa` -> `jawaban` -> `penilaian`

Alur aliran data soal hingga evaluasi nilai berjalan sebagai berikut:
1. **Penyusunan Paket Soal (`public.paket_soal`)**:
   Guru menyusun paket soal (secara manual atau melalui AI). Tiap butir memiliki ID unik, jenis, teks pertanyaan, opsi jawaban, dan kunci jawaban internal.
2. **Penerbitan Tugas (`public.penugasan`)**:
   Guru mengaitkan `paket_soal_id` ke sebuah kelas aktif (`kelas_id`). Tugas memiliki tenggat waktu (`deadline`) dan status (`'draft'`, `'published'`, `'closed'`).
3. **Pengambilan Soal oleh Siswa (`public.get_penugasan_soal_for_siswa`)**:
   Siswa yang terdaftar aktif memanggil RPC aman `get_penugasan_soal_for_siswa`. RPC mengekstrak butir soal dan **membuang kolom `kunci` serta rahasia penilaian** sebelum dikirimkan ke peramban siswa.
4. **Pengerjaan & Pengumpulan Jawaban (`public.penugasan_pengumpulan` & `public.penugasan_jawaban`)**:
   Jawaban siswa per `soal_id` disimpan di tabel `penugasan_jawaban`. Saat siswa mengumpulkan tugas via RPC `submit_penugasan`, sistem memvalidasi batas waktu server.
5. **Evaluasi Otomatis & Penilaian Manual (`submit_penugasan` & `simpan_penilaian_guru`)**:
   - Butir Pilihan Ganda dievaluasi otomatis (*auto-graded*).
   - Butir Esai diberi status `'perlu_penilaian_manual'` untuk dinilai oleh guru secara manual.

---

## 3. Jenis Soal yang Didukung (Supported Question Types)

Sistem saat ini **HANYA** mendukung 2 jenis soal:
1. **`Pilihan Ganda` (Multiple Choice)**
2. **`Esai` (Essay)**

> [!CAUTION]
> Jenis soal lain seperti Menjodohkan (*Matching*), Isian Singkat (*Fill-in-the-blank*), atau Benar/Salah **TIDAK DIDUKUNG** oleh skema basis data, RPC sanitasi siswa, maupun mesin penilaian yang ada. Kontrak kanonikal AI-4A melarang keras penambahan tipe soal baru di luar kedua tipe ini.

---

## 4. Kontrak Kanonikal AI Soal (`CanonicalQuestionContract`)

Implementasi TypeScript + Zod berlokasi pada:
[`src/lib/ai/question-contract.ts`](file:///c:/novara%20project/gurupro-ai-journal-main/src/lib/ai/question-contract.ts)

Kontrak menetapkan versi skema:
- `CANONICAL_QUESTION_SCHEMA_VERSION = "1.0.0"`
- `CANONICAL_QUESTION_PROMPT_VERSION = "question_generator_grounded_v1"`

---

## 5. Kontrak Soal Pilihan Ganda (`CanonicalMultipleChoiceQuestion`)

Invarian struktural dan pedagogis:
1. `pertanyaan`: String minimal 5 karakter.
2. `opsi`: Tepat 4 opsi teks (`A`, `B`, `C`, `D`), tidak boleh kosong, dan wajib unik (tidak ada opsi kembar secara *case-insensitive*).
3. `kunci`: Huruf kapital tunggal `"A" | "B" | "C" | "D"` yang menunjuk pada indeks opsi 0, 1, 2, atau 3.
4. `penjelasan`: String opsional (minimal 5 karakter) memuat alasan atau pembahasan kunci jawaban.
5. `tingkat`: Enums `"Mudah" | "Sedang" | "Sulit"` (default `"Sedang"`).
6. `evidenceIds`: Array minimal satu ID bukti sumber (`GroundingEvidenceItem`).
7. `status`: Enums `"SUPPORTED" | "INFERRED" | "NOT_FOUND"`.

---

## 6. Kontrak Soal Esai (`CanonicalEssayQuestion`)

Invarian struktural dan pedagogis:
1. `pertanyaan`: String minimal 5 karakter.
2. `opsi`: Array kosong `[]` (dilarang memiliki opsi pilihan ganda).
3. `kunci`: String minimal 10 karakter memuat rubrik jawaban ideal dan kriteria ketercapaian.
4. `penjelasan`: String opsional memuat panduan pembobotan nilai bagi guru.
5. `tingkat`: Enums `"Mudah" | "Sedang" | "Sulit"` (default `"Sedang"`).
6. `evidenceIds`: Array minimal satu ID bukti sumber pendukung.
7. `status`: Enums `"SUPPORTED" | "INFERRED" | "NOT_FOUND"`.

---

## 7. Invarian Keamanan Kunci Jawaban (Answer-Key Confidentiality)

```
Internal AI / Teacher Representation (Trusted Server)
  ├── id, pertanyaan, jenis, opsi
  ├── kunci (Kunci Jawaban / Rubrik Esai)  <-- HANYA DI SERVER
  ├── penjelasan (Pembahasan Kunci)       <-- HANYA DI SERVER
  ├── evidenceIds & aiMetadata            <-- HANYA DI SERVER
  └── status (Grounding Status)           <-- HANYA DI SERVER
          │
          │  toStudentSafeQuestion() / RPC get_penugasan_soal_for_siswa
          ▼
Student-Safe Payload (Untrusted Client)
  ├── id
  ├── pertanyaan
  ├── jenis
  └── opsi
```

**Aturan Mutlak Kerahasiaan**:
- Kunci jawaban (`kunci`) dan pembahasan (`penjelasan`) HANYA tersimpan di sisi server/database internal.
- Fungsi utilitas `toStudentSafeQuestion()` memproyeksikan payload yang aman bagi siswa tanpa kebocoran kunci, pembahasan, bukti sumber, atau metadata internal.
- Selaras 100% dengan RPC PostgreSQL `public.get_penugasan_soal_for_siswa`.

---

## 8. Kontrak Bukti & Penelusuran Grounding (Evidence Binding)

Setiap butir soal wajib terikat pada bukti materi sumber:
1. **Keterikatan Bukti (*Evidence Binding*)**:
   Field `evidenceIds` menunjuk pada `evidenceId` sah di dalam snapshot materi sumber yang diserap (AI-0 / AI-1).
2. **Pencegahan Referensi Menggantung (*Anti-Dangling Guard*)**:
   Jika butir soal merujuk pada `evidenceId` yang tidak terdaftar dalam set bukti yang diizinkan (*allowedEvidenceIds*), validasi melempar galat `QUESTION_GROUNDING_FAILED`.
3. **Prinsip Anti-Promosi (*Anti-Promotion Invariant*)**:
   Potongan bukti yang berstatus `NOT_FOUND` pada konteks rujukan **DILARANG KERAS** diklaim sebagai `SUPPORTED` pada butir soal.

---

## 9. Rekam Jejak AI & Persiapan Suntingan Guru (Provenance)

Objek `QuestionAiMetadata` mencatat:
- `promptVersion`: Versi template instruksi generasi AI.
- `sourceSnapshotIds`: Daftar ID snapshot materi sumber rujukan.
- `schemaVersion`: `"1.0.0"`.
- `generatedAt`: Waktu generasi ISO 8601.
- `validationStatus`: `"valid" | "invalid"`.
- `evidenceRefs`: Rincian cuplikan dan skor relevansi bukti.
- `teacherEdited`: Penanda boolean jika guru telah memodifikasi butir soal di masa mendatang (AI-4E).
- `lastEditedBy` & `editedAt`: Audit jejak penyuntingan guru.

---

## 10. Kompatibilitas dengan Penilaian Otomatis (Auto-Grading Parity)

Fungsi konversi kanonikal:
- `toExistingSoal(canonical)`: Menghasilkan objek `Soal` yang kompatibel penuh dengan kolom JSONB `paket_soal.soal`.
- `fromExistingSoal(soal)`: Melakukan parsing objek `Soal` lama ke dalam kontrak kanonikal.
- Evaluasi auto-grading pada `submit_penugasan`:
  - Kunci huruf `"A"`–`"D"` cocok dengan respon siswa `"A"`, `"a"`, `"A. <teks>"`, atau teks opsi lengkap.
  - Esai otomatis dialihkan ke antrean penilaian manual guru.

---

## 11. Perubahan Basis Data

Migrasi baru ditambahkan pada:
[`supabase/migrations/20260928100000_ai_question_metadata.sql`](file:///c:/novara%20project/gurupro-ai-journal-main/supabase/migrations/20260928100000_ai_question_metadata.sql)
- Menambahkan kolom `ai_metadata JSONB DEFAULT NULL` pada tabel `public.paket_soal`.
- Menambahkan indeks GIN `idx_paket_soal_ai_metadata`.
- Tidak ada tabel baru yang dibuat, menjaga kesederhanaan dan performa kueri.

---

## 12. Taksonomi Galat Khusus Soal

Ditambahkan ke [`src/lib/ai/error-taxonomy.ts`](file:///c:/novara%20project/gurupro-ai-journal-main/src/lib/ai/error-taxonomy.ts):
- `QUESTION_SCHEMA_INVALID` (422): Skema butir soal tidak valid atau tidak memenuhi kontrak kanonikal.
- `QUESTION_TYPE_UNSUPPORTED` (422): Jenis soal tidak didukung oleh sistem.
- `ANSWER_KEY_INVALID` (422): Kunci jawaban soal tidak valid atau tidak merujuk pada opsi yang tersedia.
- `QUESTION_GROUNDING_FAILED` (422): Butir soal atau kunci jawaban merujuk pada bukti yang tidak valid atau di luar materi sumber.

---

## 13. Strategi & Hasil Pengujian

Suite pengujian terdedikasi pada [`tests/ai/question-contract.test.mjs`](file:///c:/novara%20project/gurupro-ai-journal-main/tests/ai/question-contract.test.mjs):
- **24 dari 24 cek lulus 100%**.
- Terintegrasi dalam `package.json` di bawah skrip `"test"` (total 29 test suites).

---

## 14. Keterbatasan & Hal yang Akan Dikonsumsi oleh AI-4B dan AI-4C

- **AI-4B (Question Grounded Context Builder)**:
  Akan mengonsumsi `QuestionGenerationInputSchema`, mengambil chunk dari `sourceSnapshotIds`, dan menyusun konteks grounding pertanyaan dengan alokasi anggaran token.
- **AI-4C (AI Question Generation Engine)**:
  Akan memanggil provider AI eksternal, memvalidasi keluaran terhadap `CanonicalQuestionPackageSchema`, dan menegakkan aturan anti-halusinasi serta kerahasiaan kunci jawaban.
