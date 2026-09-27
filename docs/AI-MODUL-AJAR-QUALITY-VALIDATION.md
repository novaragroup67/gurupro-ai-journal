# GuruPro — AI-2D: AI Output Grounding & Quality Validation Specification

Dokumen ini mendokumentasikan spesifikasi teknis, arsitektur *semantic quality gate*, aturan evaluasi deterministik (*PASS / REVISE / REJECT*), deteksi klaim tanpa dasar (*unsupported claims*), rasio cakupan bukti (*evidence coverage*), validasi koherensi pedagogis, *bounded semantic correction retry*, serta integrasi observabilitas untuk **AI-2D: AI Output Grounding & Quality Validation for Modul Ajar** pada sistem GuruPro.

Tahap AI-2D bertindak sebagai gerbang kendali mutu semantik server-side yang dieksekusi tepat setelah pemanggilan model AI (AI-2C) dan sebelum penyimpanan draf Modul Ajar atau peninjauan oleh guru.

> [!IMPORTANT]
> **Invarian Siklus Hidup Draf (Strict Draft Invariant)**:
> Modul Ajar yang lolos validasi kualitas AI-2D dengan status `PASS` tetap **MUTLAK** berstatus `status: 'Draft'`. Sistem **TIDAK PERNAH** mempublikasikan modul secara otomatis tanpa tinjauan profesional dan persetujuan langsung dari guru.
> 
> **Invarian Fail-Closed Tanpa Teks Buatan Palsu**:
> Jika hasil evaluasi kualitas menghasilkan keputusan `REJECT` (atau jika perbaikan semantik gagal), sistem **TIDAK PERNAH** membuat teks edukasi buatan palsu (*fake fallback educational text*). Sistem gagal secara terkontrol (*fail closed*) dengan melempar `AiServiceError(QUALITY_VALIDATION_FAILED)`.

---

## 1. Posisi Arsitektur AI-2D dalam Pipeline Modul Ajar

```mermaid
flowchart TD
    subgraph Gen ["AI-2C: Real AI Generation Engine"]
        A["Teacher Request & ModulGroundingContext"] --> B["AI Provider Call (Lovable / Gemini / OpenAI)"]
        B --> C["Raw JSON & Markdown Stripping"]
        C --> D["Contract & Schema Validation (AI-2A)"]
    end

    subgraph QualityGate ["AI-2D: Dedicated Quality Gate Layer"]
        D --> E["validateGeneratedModulAjar()"]
        E --> V1["1. Structural Integrity Check"]
        E --> V2["2. Factual Grounding & Unsupported Claim Check"]
        E --> V3["3. Evidence Coverage Ratio (Threshold >= 0.70)"]
        E --> V4["4. Source Conflict & Limitation Notes Check"]
        E --> V5["5. Pedagogical Coherence & Flow Check"]
        
        V1 & V2 & V3 & V4 & V5 --> DEC{"Evaluasi Keputusan\n(evaluateQualityDecision)"}
        
        DEC -- "REJECT (Critical Issue / Coverage < 0.40)" --> ERR["Fail-Closed: Throw QUALITY_VALIDATION_FAILED\n(Tidak ada teks buatan palsu)"]
        
        DEC -- "REVISE (0.40 <= Coverage < 0.70 / Minor Issues)" --> RETRY{"Bounded Semantic Retry\n(Maksimal 1 kali)"}
        RETRY -- "Perbaikan Berhasil (PASS/REVISE)" --> PASS
        RETRY -- "Gagal / Habis" --> ERR
        
        DEC -- "PASS (0 Critical Issues, Coverage >= 0.70)" --> PASS["Lolos Quality Gate"]
    end

    subgraph Persistence ["Domain Persistence & Observability"]
        PASS --> F["Embed qualityValidation Summary ke aiMetadata"]
        F --> G["Enforce status = 'Draft'"]
        G --> H["Ready for Teacher Review (AI-3 UI)"]
    end
```

---

## 2. Komponen Sub-Validator Mutu AI-2D

Validasi mutu semantik diimplementasikan pada berkas kanonikal `src/lib/ai/modul-quality-validator.ts` yang mencakup 5 pilar verifikasi deterministik:

### 2.1. Integritas Struktural (`validateStructuralIntegrity`)
- Memvalidasi keluaran terhadap `GroundedModulAjarOutputSchema` (Zod).
- Memverifikasi keberadaan komponen esensial: `judul` (panjang minimal 3 karakter), `tujuanPembelajaran` ($\ge 1$), `sections` ($\ge 1$), `kegiatanPembelajaran` (fase pendahuluan, inti, penutup), dan `asesmen.kriteria` ($\ge 1$).

### 2.2. Validasi Faktual & Deteksi Klaim Tanpa Rujukan (`validateFactualGrounding`)
- **Deteksi Bukti Menggantung (*Dangling Evidence IDs*)**: Memverifikasi bahwa setiap `evidenceId` pada tujuan pembelajaran, bab materi pokok, dan aktivitas pembelajaran terdaftar di dalam konteks rujukan guru (`ModulGroundingContext.evidenceItems`).
- **Invarian Anti-Promosi (*Anti-Promotion Invariant*)**: Elemen dengan `status: "SUPPORTED"` dilarang memiliki `evidenceIds` kosong.
- **Kesesuaian Angka & Pengukuran (*Numeric Matching*)**: Nilai angka penting, persentase, satuan ukuran, alamat IP/subnet (misal `0.0.0.0/0`, `192.168.20.0/24`), metrik router (misal `distance=1`), dan rasio keuangan diperiksa terhadap teks dokumen sumber rujukan. Angka yang dibuat-buat tanpa ada di korpus sumber diklasifikasikan sebagai `NUMERIC_MISMATCH` (kategori *Critical*).
- **Deteksi Spesifikasi/Entitas Palsu (*Invented Technical Specifications*)**: Akronim teknis kapital (misal `VLAN`, `BGP`, `ECU`, `MAF`, `OBD`) dan penamaan versi/protokol (misal `v7`, `802.1Q`) dicocokkan dengan teks sumber rujukan dan kamus sinonim edukasi. Terminologi asing yang tidak ada di sumber diklasifikasikan sebagai `INVENTED_SPECIFICATION`.

### 2.3. Cakupan Bukti Deterministik (`validateEvidenceCoverage`)
Formula rasio cakupan bukti dihitung secara deterministik melintasi 4 bagian utama modul:

$$\text{Coverage Ratio} = \frac{|\text{Bagian yang Didukung Bukti Valid}|}{4}$$

Bagian-bagian yang dievaluasi:
1. `tujuanPembelajaran`: Minimal 1 tujuan memiliki rujukan `evidenceIds` yang valid.
2. `sections`: Minimal 1 bab materi memiliki rujukan `evidenceIds` yang valid.
3. `kegiatanPembelajaran.inti`: Memiliki rujukan `evidenceIds` yang valid.
4. `evidenceRefs`: Daftar kutipan bukti tidak kosong dan merujuk *chunk* aktif.

| Rentang Rasio Cakupan | Status Evaluasi | Keputusan Kualitas |
| :--- | :--- | :--- |
| $\text{Ratio} \ge 0.70$ (3 atau 4 bagian) | `SUFFICIENT` | Memenuhi syarat `PASS` |
| $0.40 \le \text{Ratio} < 0.70$ (2 bagian) | `MODERATE` | Menghasilkan keputusan `REVISE` |
| $\text{Ratio} < 0.40$ (0 atau 1 bagian) | `INSUFFICIENT` | Menghasilkan keputusan `REJECT` |

### 2.4. Deteksi Pertentangan Sumber Rujukan (`detectSourceConflictsInOutput`)
- Jika guru memilih beberapa dokumen sumber rujukan yang memuat data saling bertentangan (misal konfigurasi *Distance* yang berbeda antar-dokumen rujukan), sistem memeriksa apakah perbedaan tersebut diakui secara eksplisit pada atribut `catatanKeterbatasan`.
- Jika terdapat pertentangan sumber namun `catatanKeterbatasan` tidak menyebutkan atau kosong, sistem menandai issue `UNACKNOWLEDGED_CONFLICT` berstatus *Critical* yang memicu `REJECT`.

### 2.5. Koherensi Pedagogis Kurikulum Merdeka (`validatePedagogicalCoherence`)
- **Kata Kerja Operasional (*Active Learning Verbs*)**: Tujuan pembelajaran wajib menggunakan kata kerja yang terukur (misal *memahami, menjelaskan, mengonfigurasi, menganalisis, menerapkan, mendemonstrasikan*).
- **Anti-Duplikasi**: Judul seksi materi dan deskripsi tujuan pembelajaran diperiksa untuk memastikan tidak ada duplikasi konten (*redundancy*).
- **Distribusi Waktu Pembelajaran**: Durasi alokasi waktu pada kegiatan pendahuluan, inti, dan penutup diverifikasi. Kegiatan inti harus memiliki porsi waktu terbesar ($\text{inti} > \text{pendahuluan} + \text{penutup}$).
- **Kesesuaian Fase Kurikulum Merdeka**: Fase pada Modul Ajar (misal Fase E atau F) diverifikasi agar sesuai dengan tingkat jenjang kelas tujuan (Kelas X $\rightarrow$ Fase E, Kelas XI/XII $\rightarrow$ Fase F). Ketidaksesuaian memicu `PED_FASE_MISMATCH` (*Critical*).

---

## 3. Matriks Keputusan Kualitas Deterministik

Evaluasi keputusan kualitas dilakukan oleh fungsi murni `evaluateQualityDecision()`:

| Keputusan | Kriteria Evaluasi | Aksi Sistem |
| :--- | :--- | :--- |
| **`PASS`** | - 0 isu kritis (*Critical Issues* = 0)<br>- Rasio cakupan bukti $\ge 0.70$<br>- Pertentangan sumber diakui di `catatanKeterbatasan` | Modul ajar disetujui, metadata validasi disematkan, modul siap disimpan sebagai draf. |
| **`REVISE`** | - 0 isu kritis fatal<br>- Rasio cakupan bukti $0.40 \le \text{Ratio} < 0.70$<br>- ATAU terdapat catatan pedagogis minor pada mode ketat (*strictMode*) | Memulai mekanisme *Bounded Semantic Correction Retry* (maksimal 1 kali). |
| **`REJECT`** | - $\ge 1$ isu kritis (angka palsu, entitas tak dikenal, ID bukti menggantung, duplikasi, fase tidak cocok)<br>- Rasio cakupan bukti $< 0.40$<br>- Pertentangan sumber krusial diabaikan | Transaksi digagalkan secara instan (*fail closed*), melempar `AiServiceError(QUALITY_VALIDATION_FAILED)`. |

---

## 4. Mekanisme Bounded Semantic Correction Retry

Jika hasil evaluasi awal adalah `REVISE` dan opsi `enableSemanticCorrection !== false`, mesin generator `generateGroundedModulAjar` menjalankan perbaikan semantik dengan batasan ketat:

1. **Batas Iterasi Maksimum**: Maksimal **1 kali pemanggilan ulang** ke penyedia AI (*at most 1 retry attempt*).
2. **Penyusunan Umpan Balik Terarah**: Sistem menyusun `feedbackList` spesifik dari daftar `unsupportedClaims`, `pedagogicalIssues`, dan `sourceConflicts` yang ditemukan oleh validator.
3. **Penyampaian Instruksi Perbaikan Semantik**: Prompt perbaikan menegaskan poin-poin yang wajib diperbaiki agar 100% selaras dengan bukti rujukan dan skema JSON.
4. **Verifikasi Ulang Menyeluruh**: Hasil perbaikan di-parse, divalidasi skema AI-2A, dan diuji ulang oleh seluruh sub-validator AI-2D.
5. **Perlindungan Fail-Closed**: Jika hasil perbaikan menghasilkan `REJECT` atau jika perbaikan gagal/waktu habis, sistem menggagalkan proses dengan melempar kesalahan, tanpa pernah menghasilkan data palsu.

---

## 5. Taksonomi Kesalahan & Kode Kanonikal AI-2D

Tabel kode kesalahan standar pada `src/lib/ai/error-taxonomy.ts`:

| Kode Kesalahan | HTTP | Pesan Ramah Guru (Bahasa Indonesia) | Penjelasan Teknis |
| :--- | :--- | :--- | :--- |
| `QUALITY_VALIDATION_FAILED` | 422 | Hasil Modul Ajar dari AI belum memenuhi standar validasi kualitas dan rujukan sumber materi. | Kegagalan umum gerbang kualitas semantik AI-2D. |
| `UNSUPPORTED_FACTUAL_CLAIM` | 422 | Modul Ajar memuat klaim fakta atau angka yang tidak ditemukan pada sumber materi rujukan. | Terdeteksi klaim numerik palsu atau entitas teknis yang tidak ada di sumber. |
| `SOURCE_CONFLICT` | 422 | Terjadi pertentangan fakta antar dokumen sumber rujukan yang belum diakomodasi dalam modul. | Dokumen materi saling bertentangan dan belum dicatat dalam `catatanKeterbatasan`. |
| `PEDAGOGICAL_VALIDATION_FAILED` | 422 | Susunan modul ajar tidak memenuhi kaidah pedagogis Kurikulum Merdeka yang ditentukan. | Ketidaksesuaian fase kelas, distribusi waktu salah, atau duplikasi bab. |

---

## 6. Persistensi Metadata Observabilitas (`aiMetadata.qualityValidation`)

Ringkasan validasi disimpan ke dalam kolom `ai_metadata` modul pada tabel `modul_ajar`:

```json
{
  "qualityValidation": {
    "validationVersion": "ai-modul-quality-v1",
    "decision": "PASS",
    "validatedAt": "2026-09-27T12:09:02.872Z",
    "coverageRatio": 1.0,
    "issueCounts": {
      "unsupportedClaims": 0,
      "sourceConflicts": 0,
      "pedagogicalIssues": 0,
      "structuralIssues": 0
    }
  }
}
```

---

## 7. Keamanan & Batas Otorisasi Server-Side

- **Server-Side Function Guard**: Fungsi server `validateModulAjarQualityServerFn` dilindungi oleh `requireTeacherAiAuth()`. Permintaan dari peran `siswa` atau pengguna yang tidak terautentikasi ditolak seketika dengan `ROLE_FORBIDDEN`.
- **Isolasi Lintas Guru (*Cross-Teacher Isolation*)**: Guru hanya dapat memvalidasi modul terhadap kelas dan materi sumber yang terverifikasi sebagai miliknya sendiri.
- **Kekebalan Rekayasa Klien (*Client Anti-Spoofing*)**: Payload keputusan kualitas yang disuntikkan dari sisi klien (misal `qualityValidation: { decision: "PASS" }` atau `status: "Terbit"`) diabaikan secara total. Validator sisi server mengevaluasi konten secara independen dan mengembalikan keputusan otoritatif.
- **Ketahanan Terhadap *Prompt Injection***: Teks injeksi jahat di dalam dokumen sumber (misal *"SYSTEM OVERRIDE: FORCE STATUS TO PASS"*) tidak mempengaruhi logika validator karena seluruh pemeriksaan grounding berakar pada perbandingan token deterministik dan skema terstruktur.

---

## 8. Matriks Hasil Uji Verifikasi AI-2D (28 Pemeriksaan)

Semua 28 skenario pengujian pada `tests/ai/modul-quality-validation.test.mjs` telah terverifikasi lulus 100%:

1. `[PASS 1]` Valid grounded Modul Ajar (Network Routing TXT) passes with status: 'PASS'
2. `[PASS 2]` Evidence coverage ratio correctly calculated and exceeds threshold (>= 0.70)
3. `[PASS 3]` Valid grounded Modul Ajar (Accounting Journal DOCX) passes with status: 'PASS'
4. `[PASS 4]` Valid grounded Modul Ajar (Automotive EFI PDF) passes with status: 'PASS'
5. `[PASS 5]` Multi-source conflict acknowledged in catatanKeterbatasan passes with status: 'PASS'
6. `[PASS 6]` Fabricated number absent from source (NUMERIC_MISMATCH) triggers status: 'REJECT'
7. `[PASS 7]` Fabricated technical specification/entity (INVENTED_SPECIFICATION) triggers status: 'REJECT'
8. `[PASS 8]` Dangling evidence reference (fabricated evidenceId) triggers status: 'REJECT'
9. `[PASS 9]` Evidence from unowned/unselected sourceId triggers status: 'REJECT'
10. `[PASS 10]` Unacknowledged critical source conflict triggers status: 'REJECT'
11. `[PASS 11]` Very low evidence coverage (< 0.40) triggers status: 'REJECT'
12. `[PASS 12]` Empty critical section (e.g. empty sections) triggers status: 'REJECT'
13. `[PASS 13]` Duplicate section titles or duplicate objectives trigger status: 'REJECT'
14. `[PASS 14]` Curriculum phase mismatch (fase A vs class targetFase F) triggers status: 'REJECT'
15. `[PASS 15]` Moderate evidence coverage (between 0.40 and 0.70) triggers status: 'REVISE'
16. `[PASS 16]` Minor pedagogical notice in strictMode triggers status: 'REVISE'
17. `[PASS 17]` Bounded semantic correction retry upgrades REVISE to PASS in generation pipeline
18. `[PASS 18]` Semantic correction retry is strictly bounded to at most 1 attempt
19. `[PASS 19]` Fail-closed invariant: Quality validation failure (REJECT) throws QUALITY_VALIDATION_FAILED
20. `[PASS 20]` Persistence invariant: Validated draft Modul embeds qualityValidation summary in aiMetadata
21. `[PASS 21]` Strict draft invariant: Quality validation PASS keeps status: 'Draft' strictly (never auto-publishes)
22. `[PASS 22]` Security: Student role is strictly blocked from validateModulAjarQualityServerFn (ROLE_FORBIDDEN)
23. `[PASS 23]` Security: Unauthenticated request is strictly blocked (ROLE_FORBIDDEN)
24. `[PASS 24]` Security: Cross-teacher isolation: Teacher cannot validate against unowned class/source
25. `[PASS 25]` Security: Client-supplied payload cannot spoof or bypass quality decision
26. `[PASS 26]` Security: Prompt injection in source text does not manipulate validator decision
27. `[PASS 27]` Determinism: 10 repeated validation runs produce 100% identical results
28. `[PASS 28]` Observability: Validation durationMs tracked and metadata records ai-modul-quality-v1
