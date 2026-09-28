# GuruPro AI Foundation (AI-4B) — Question Grounded Context Builder

## 1. Ringkasan Eksekutif & Tujuan AI-4B

Komponen **AI-4B: Question Grounded Context Builder** bertindak sebagai jembatan deterministik sisi server (*server-side deterministic bridge*) antara materi sumber terverifikasi (*Source Snapshots*) dan mesin pembuat butir asesmen (*Question Generation Engine* pada AI-4C mendatang).

Tujuan fundamental AI-4B adalah:
1. **Menghilangkan Halusinasi Asesmen**: Menjamin bahwa setiap butir soal, pilihan pengecoh (*distractors*), kunci jawaban, dan rubrik asesmen hanya diturunkan dari bukti tekstual otentik.
2. **Preservasi Nilai Eksak (*Exact-Value Preservation*)**: Mempertahankan parameter teknis kritis (angka, formula matematika/fisika, alamat IP, subnet mask, port layanan, dan singkatan teknis) tanpa penyederhanaan atau distorsi.
3. **Konstruksi Query Spesifik Asesmen**: Menghasilkan query terarah untuk inti faktual (*factual core*), konteks pengecoh (*distractor context*), serta tahapan prosedural/diagnosis (*procedural steps*).
4. **Isolasi Multi-Penyewa (*Tenant Isolation*)**: Menolak akses lintas guru, akun belum terverifikasi, atau kelas di luar pengampuan.
5. **Evaluasi Ketercukupan Bukti (*Sufficiency Evaluation*) & Fail-Closed**: Mengevaluasi apakah bukti berstatus `SUFFICIENT`, `INSUFFICIENT`, atau `CONFLICTED`. Jika materi tidak memadai, sistem menolak eksekusi tanpa memanggil model AI eksternal.
6. **Invarian Tanpa LLM**: AI-4B strictly 100% deterministik dan tidak memanggil Gemini, OpenAI, Lovable Gateway, atau LLM apa pun.

---

## 2. Diagram Alur Pipeline AI-4B

$$\text{Source Snapshot(s)} \longrightarrow \begin{matrix} \text{Autentikasi Guru} \\ \& \text{ Isolasi Tenant} \end{matrix} \longrightarrow \begin{matrix} \text{Pembangunan} \\ \text{Query Asesmen} \end{matrix} \longrightarrow \begin{matrix} \text{Multi-Source} \\ \text{Retrieval} \end{matrix} \longrightarrow \begin{matrix} \text{Preservasi Nilai} \\ \text{Eksak \& Ranking} \end{matrix} \longrightarrow \begin{matrix} \text{Budgeting \&} \\ \text{Deduplikasi} \end{matrix} \longrightarrow \begin{matrix} \text{Deteksi Konflik} \\ \& \text{ Sufficiency} \end{matrix} \longrightarrow \begin{matrix} \text{Grounded Question} \\ \text{Context (XML Safe)} \end{matrix}$$

---

## 3. Kontrak Data Kanonikal & Skema Zod

Implementasi terletak di [`src/lib/ai/question-context-builder.ts`](file:///c:/novara%20project/gurupro-ai-journal-main/src/lib/ai/question-context-builder.ts).

### 3.1. Skema Input Klien (`QuestionGroundingInputSchema`)

```typescript
export const QuestionGroundingInputSchema = z.object({
  sourceSnapshotIds: z
    .array(z.string().min(1, "ID snapshot sumber tidak boleh kosong."))
    .min(1, "Minimal satu materi sumber wajib dipilih."),
  modulId: z.string().uuid().optional(),
  kelasId: z.string().uuid().optional(),
  topik: z.string().trim().min(3).max(150),
  mapel: z.string().trim().min(2).optional(),
  jenis: z.enum(["Pilihan Ganda", "Esai", "Campuran"]).default("Pilihan Ganda"),
  tingkat: z.enum(["Mudah", "Sedang", "Sulit"]).default("Sedang"),
  jumlah: z.number().int().min(1).max(50).default(5),
  targetTujuanPembelajaranIds: z.array(z.string().min(1)).optional(),
  targetTujuanPembelajaranDeskripsi: z.array(z.string().min(1)).optional(),
  customInstructions: z.string().max(500).optional(),
});
```

### 3.2. Skema Output Konteks (`GroundedQuestionContextSchema`)

```typescript
export const GroundedQuestionContextSchema = z.object({
  contextVersion: z.literal("1.0.0").default("1.0.0"),
  groundingTarget: z.object({
    topik: z.string().min(1),
    mapel: z.string().optional(),
    jenis: z.enum(["Pilihan Ganda", "Esai", "Campuran"]),
    tingkat: z.enum(["Mudah", "Sedang", "Sulit"]),
    jumlah: z.number().int().positive(),
    modulId: z.string().optional(),
    kelasId: z.string().optional(),
    targetTujuanPembelajaranIds: z.array(z.string()).optional(),
  }),
  academicContext: z.object({
    teacherId: z.string().min(1),
    teacherName: z.string().optional(),
    kelasId: z.string().optional(),
    kelasLabel: z.string().optional(),
    mapel: z.string().optional(),
    tahunAjaran: z.string().optional(),
  }),
  sourceMetadata: z.array(
    z.object({
      sourceId: z.string(),
      sourceTitle: z.string(),
      sourceType: z.string(),
      contentHash: z.string(),
      totalChunks: z.number().int().min(0),
      order: z.number().int().min(0),
    }),
  ),
  evidenceItems: z.array(GroundingEvidenceItemSchema),
  evidenceSufficiency: z.enum(["SUFFICIENT", "INSUFFICIENT", "CONFLICTED"]),
  sourceConflicts: z.array(SourceConflictItemSchema).default([]),
  contextBudgetSummary: z.object({
    totalSourcesCount: z.number().int().min(0),
    retrievedChunksCount: z.number().int().min(0),
    deduplicatedChunksCount: z.number().int().min(0),
    totalWordCount: z.number().int().min(0),
    isTruncated: z.boolean().default(false),
  }),
  hasUsableEvidence: z.boolean(),
  serializedContext: z.string(),
});
```

---

## 4. Strategi Konstruksi Query Khusus Asesmen

Fungsi `buildQuestionDeterministicQueries` memecah kebutuhan pembuatan soal ke dalam aliran query yang terarah:

1. **Factual Core Query**: Mengekstrak definisi, rumus matematika, spesifikasi, dan prinsip operasi inti.
   - Contoh: `"Konfigurasi Routing Statis Administrasi Infrastruktur Jaringan definisi fungsi prinsip spesifikasi parameter konsep utama cara kerja nilai"`
2. **Distractor Context Query**: Mengekstrak klasifikasi, perbedaan, kelebihan, dan kelemahan untuk membentuk alternatif jawaban pengecoh yang masuk akal (*plausible distractors*).
   - Contoh: `"Konfigurasi Routing Statis perbedaan klasifikasi jenis tipe kategori karakteristik kelebihan kelemahan perbandingan"`
3. **Procedural Query**: Mengekstrak tahapan kerja, urutan pemeriksaan, langkah konfigurasi, serta instruksi diagnosis/troubleshooting.
   - Contoh: `"Konfigurasi Routing Statis langkah tahapan prosedur diagnosis perbaikan perhitungan rumus pemeriksaan pengujian"`
4. **Target Objective Query**: Mengikatkan capaian pembelajaran khusus (TP) dari Modul Ajar jika disediakan.
5. **Teacher Custom Query**: Mengakomodasi instruksi khusus guru secara aman dan terbatas (maksimal 150 karakter).

---

## 5. Preservasi Nilai Eksak (*Exact-Value Preservation*)

Soal evaluasi akademik kejuruan (SMK) dan sains menuntut ketepatan nilai teknis. Pemotongan atau normalisasi yang salah dapat merusak kunci jawaban. AI-4B secara ketat menjaga keutuhan:
- **Alamat IP & Subnetting**: `192.168.20.0/24`, `0.0.0.0/0`, `10.10.10.2`.
- **Perintah CLI**: `/ip route add dst-address=192.168.20.0/24 gateway=10.10.10.2 distance=1`.
- **Standar Protokol & Bit Width**: `IEEE 802.1Q`, `tag 4-byte`, `TPID 0x8100`, `VID 12 bit`.
- **Flag & Status**: `Active Static (AS)`, `Unreachable (U)`.
- **Nilai Akuntansi & Otomotif**: Angka nominal debit/kredit, tarif penyusutan, tekanan injeksi fuel rail.

---

## 6. Deduplikasi & Pengurutan Deterministik

1. **Deduplikasi Potongan (*Deduplication*)**: Potongan yang terpanggil berulang kali oleh query faktual, distractor, atau prosedural digabungkan ke dalam satu entri unik berdasarkan `chunkId`. Skor relevansi tertinggi (*bestRelevance*) dipertahankan.
2. **Aturan Pengurutan Stabil**:
   $$\text{Rank Invariant} = \text{bestRelevance DESC} \longrightarrow \text{sourceOrder ASC} \longrightarrow \text{chunk.index ASC}$$
   Menjamin bahwa potongan dengan relevansi tertinggi selalu berada di urutan teratas, prioritas urutan dokumen sumber dihormati, dan alur pedagogis dokumen asli tetap terjaga.
3. **Batas Anggaran Konteks (*Context Budget*)**:
   - `maxTotalChunks`: Default 8 potongan (optimal untuk densitas butir asesmen).
   - `maxTotalWords`: Default 2500 kata.
   - Jika melebihi batas, potongan berperingkat lebih rendah dipangkas dan flag `isTruncated: true` disematkan.

---

## 7. Deteksi Konflik & Evaluasi Ketercukupan Bukti

### 7.1. Deteksi Konflik Lintas Sumber (`Source Conflicts`)
Menggunakan pemindai regex terkalibrasi (`detectSourceConflicts`) untuk mendeteksi kontradiksi numerik/faktual antar-dokumen sumber (misalnya perbedaan *administrative distance*, *port default*, *tekanan fuel rail*, *tarif penyusutan*).
- Jika konflik ditemukan: Disematkan ke dalam array `sourceConflicts` dengan tipe `NUMERIC_MISMATCH` atau `CONTRADICTION`.
- Status ketercukupan ditandai sebagai `CONFLICTED`, memperingatkan generator soal agar tidak membuat butir pertanyaan dengan kunci ambigu pada istilah tersebut.

### 7.2. Evaluasi Ketercukupan (*Evidence Sufficiency*)
- **`SUFFICIENT`**: Topik materi ditemukan pada potongan dengan skor relevansi $\ge 0.35$ dan tidak terdapat konflik nilai.
- **`INSUFFICIENT`**: Topik tidak ditemukan (`NOT_FOUND`), materi tidak relevan, atau tidak ada bukti yang dapat digunakan (`hasUsableEvidence === false`).
- **`CONFLICTED`**: Terdeteksi ketidakcocokan numerik/faktual antar dokumen sumber.

### 7.3. Invarian Anti-Promosi (*Anti-Promotion Invariant*)
Potongan yang berstatus `NOT_FOUND` (skor relevansi $< 0.30$) dilarang dipromosikan menjadi `SUPPORTED`. Sistem gagal aman (*fail-closed*) tanpa memanggil AI generasi.

---

## 8. Keamanan & Isolasi Multi-Tenant

1. **Autentikasi Server-Side**: Menggunakan middleware `requireTeacherAiAuth`.
2. **Pemeriksaan Peran Guru**: Menolak akun dengan peran selain Guru (`ROLE_FORBIDDEN`).
3. **Pemeriksaan Verifikasi**: Menolak akun berstatus `pending` atau `ditolak` (`ROLE_FORBIDDEN`).
4. **Kepemilikan Kelas**: Menolak pembuatan konteks untuk kelas milik guru lain (`ROLE_FORBIDDEN`).
5. **Kepemilikan Sumber**: Menolak snapshot materi yang diunggah oleh guru lain (`ROLE_FORBIDDEN`).
6. **Penolakan Spoofing Klien**: Menolak masukan dari klien yang mencoba menyisipkan `userId`, `teacherId`, `role`, atau `ownerId` (`INVALID_REQUEST`).

---

## 9. Serialisasi Aman dari Injeksi Prompt (*Prompt-Injection Safe*)

Seluruh teks bukti materi diperlakukan sebagai **DATA TIDAK TERPERCAYA (*Untrusted Data*)**:
- Dibungkus dalam tag `<SOURCE_CHUNK evidenceId="..." sourceId="..." chunkId="..." score="..." status="...">`.
- Upaya penutupan tag secara ilegal di dalam teks sumber (misal `</SOURCE_CHUNK>`) disanitasi menjadi `&lt;/SOURCE_CHUNK&gt;`.
- Header peringatan instruksi disematkan agar model LLM pada AI-4C tidak mengeksekusi perintah jahat yang mungkin disusupkan dalam dokumen sumber.

---

## 10. Fungsi Server TanStack Start (`ai.functions.ts`)

Diekspor sebagai `buildQuestionGroundingContextServerFn` di [`src/lib/ai.functions.ts`](file:///c:/novara%20project/gurupro-ai-journal-main/src/lib/ai.functions.ts):
- Dilindungi oleh `.middleware([requireTeacherAiAuth])`.
- Memuat daftar kelas pengampuan guru dari basis data Supabase.
- Memuat rekaman snapshot dari tabel `ai_source_snapshots` ke memori server jika belum tersedia di *cache*.
- Mengembalikan objek kanonikal `GroundedQuestionContext` yang tervalidasi skema Zod.

---

## 11. Bukti Pengujian & Verifikasi

Test suite didedikasikan pada [`tests/ai/question-grounding-context.test.mjs`](file:///c:/novara%20project/gurupro-ai-journal-main/tests/ai/question-grounding-context.test.mjs):
- **28 / 28 Pengujian Lulus (100%)** mencakup 12 seksi pengujian lengkap:
  - *Seksi A*: Basic context & deterministic ordering.
  - *Seksi B*: Assessment query construction.
  - *Seksi C*: Evidence selection & anti-promotion.
  - *Seksi D*: Multi-source resolution & provenance.
  - *Seksi E*: Deterministic deduplication.
  - *Seksi F*: Conflict detection across sources.
  - *Seksi G*: Evidence sufficiency & fail-closed.
  - *Seksi H*: Context budget enforcement.
  - *Seksi I*: Exact-value preservation.
  - *Seksi J*: Security & multi-tenant boundaries.
  - *Seksi K*: Prompt injection protection.
  - *Seksi L*: Canonical question contract (AI-4A) compatibility.
