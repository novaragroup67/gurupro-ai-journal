# GuruPro AI Source Grounding & Retrieval Pipeline (AI-1 Final Gate)

Dokumen ini mendokumentasikan arsitektur, implementasi, dan hasil validasi pipeline **AI-1: Real Source Ingestion & Grounded Retrieval Validation (Final Hardening Gate)** pada GuruPro. 

Tahap ini memvalidasi seluruh alur pemrosesan materi sumber dari dokumen nyata hingga evaluasi bukti retrieval di sisi server, sebelum memasuki implementasi pembuatan Modul Ajar dan Generator Soal pada tahap selanjutnya.

---

## 1. Alur Pipeline Utama (End-to-End)

```mermaid
flowchart TD
    A["Materi Sumber Nyata (PDF / DOCX / TXT / HTML URL)"] --> B["Ingestion & Otorisasi Guru (requireTeacherAiAuth)"]
    B --> C{"Format Dokumen?"}
    C -- "DOCX" --> D["Ekstraksi XML fflate (word/document.xml, Headings, Tables)"]
    C -- "PDF" --> E["Ekstraksi Text unpdf (Multi-page, Section Headers)"]
    C -- "HTML / URL" --> F["Proteksi Anti-SSRF & Pembersihan Web Chrome"]
    C -- "Teks / CP" --> G["Dekoder UTF-8 & Penataan Baris"]
    D --> H["Normalisasi Deterministik (Pembersihan Noise Tanpa Ubah Fakta)"]
    E --> H
    F --> H
    G --> H
    H --> I["Penghitungan Hash SHA-256 & Snapshot Persisten"]
    I --> J["Boundary-Aware Chunking (Heading & Paragraf)"]
    J --> K["Penyimpanan Snapshot & Provenance Metadata"]
    K --> L["Query Guru (Pencarian Topik / Pertanyaan)"]
    L --> M["Retriever Terisolasi Tenant (Multi-Tenant Isolation)"]
    M --> N["Scoring Leksikal & Heuristik (Stopwords, Frase, Sinonim Edukatif, Bobot Heading 3x)"]
    N --> P1{"Plugin Semantik Eksternal?"}
    P1 -- "Ada" --> P2["SemanticRetrieverPlugin.rerankChunks (pgvector / Embeddings)"]
    P1 -- "Tidak Ada" --> P3["Urutan Leksikal Deterministik"]
    P2 --> O
    P3 --> O
    O{"Validasi Entitas & Numerik?"}
    O -- "Ada Entitas/Angka Tak Berdasar" --> R["Status: NOT_FOUND (Klaim Ditolak)"]
    O -- "Entitas Valid & Kecocokan >= 70%" --> S["Status: SUPPORTED (Kutipan Bukti Terlampir)"]
    O -- "Entitas Valid & Kecocokan 40% - 69%" --> T["Status: INFERRED (Simpulan Konseptual)"]
    O -- "Entitas Valid & Kecocokan < 40%" --> R
```

---

## 2. Format Dokumen yang Didukung & Perilaku Ekstraksi

| Format | Library Parser | Karakteristik Ekstraksi & Struktur |
| :--- | :--- | :--- |
| **DOCX** | `fflate` (unzip bawaan) | Membaca `word/document.xml`. Mengonversi gaya `<w:pStyle>` (`Heading1`, `Heading2`, `Title`) menjadi heading Markdown (`#`, `##`), poin nomor `<w:numPr>` menjadi daftar `-`, dan elemen tabel `<w:tbl>` menjadi tabel Markdown `\| kol \| kol \|`. |
| **PDF** | `unpdf` (dari unjs) | Mengekstrak teks tiap halaman secara berurutan. Mengenali heading berdasarkan baris bab/modul/penomoran (`BAB`, `1. Pendahuluan`), mempertahankan format daftar (`-`, `*`), serta memelihara angka, formula, dan istilah teknis secara presisi. Buffer ditransformasikan ke instance `Uint8Array` murni untuk keandalan runtime Node. |
| **Plain Text / MD** | Native Node.js UTF-8 | Mendekode teks secara langsung dan mendeteksi judul utama `#` atau `Title:`. |
| **HTML / Web URL** | HTML Normalizer | Memeriksa Anti-SSRF (DNS lookup, blok range privat, loopback, cloud metadata `169.254.169.254`), mengunduh dengan batas 2MB dan timeout 10 detik, lalu membersihkan navigasi, footer, script, dan banner persetujuan. |

---

## 3. Aturan Preservasi Integritas Fakta (Source Fidelity)

Sesuai aturan ketat AI-1, proses normalisasi:
- **DILARANG** memparafrasekan atau menulis ulang pernyataan faktual pada tahap penyerapan.
- **DILARANG** mengubah angka, formula matematika, tanggal, atau definisi teknis.
- **DILARANG** menghapus istilah teknis penting (contoh: *administrative distance*, *802.1Q*, *MAF*, *TPS*, *matching principle*).
- **HANYA DIIZINKAN** membersihkan *noise* struktural web (*ads*, navigasi, banner cookie, *footer copyright*).
- Menghasilkan representasi yang 100% deterministik dan dapat ditelusuri ke sumber aslinya.

---

## 4. Mesin Retrieval Deterministik & Ekstensi Semantik (`retriever.ts`)

Mesin retrieval diimplementasikan sebagai **Deterministic Lexical & Heuristic Source Retriever (with Semantic Extension Point)**:

1. **Regex Safety**: Semua karakter khusus regex (`?`, `+`, `*`, `(`, `)`, `[`, `]`) di-escape secara aman sehingga kueri dengan formula matematika atau tanda baca tidak menimbulkan *SyntaxError*.
2. **Indonesian Educational Stopword Pruning**: Kata tugas dan partikel tanya umum bahasa Indonesia (*apa, apakah, bagaimana, jelaskan, sebutkan, yang, pada, dalam, untuk, dengan*) dipangkas dari pembobotan utama agar istilah inti kurikulum mendominasi skoring.
3. **Kamus Sinonim Edukatif (`EDUCATIONAL_SYNONYMS`)**: Mendukung pemetaan istilah kurikulum Indonesia (contoh: *perutean* $\leftrightarrow$ *routing*, *jarak administratif* $\leftrightarrow$ *administrative distance*, *biaya* $\leftrightarrow$ *beban*, *penyusutan* $\leftrightarrow$ *depresiasi*, *bensin* $\leftrightarrow$ *fuel/gasoline*).
4. **Section Title Boost (Bobot 3x)**: Istilah yang cocok pada judul bagian (`#`, `##`, `###`) mendapat skor tambahan signifikan (+6 per istilah).
5. **Exact Phrase Match Bonus**: Frase multi-kata yang cocok persis secara berurutan (contoh: *"routing statis"*, *"jurnal penyesuaian"*, *"topologi star"*) mendapatkan bonus besar (+10 hingga +15).
6. **Saturation-Weighted Body Matching**: Pencocokan kata pada badan teks dibatasi (*cap*) maksimal 5 kemunculan per kata untuk mencegah potongan teks panjang mendominasi potongan teks ringkas yang lebih presisi.
7. **Tie-Breaking Deterministik**: Jika skor potongan teks sama, diurutkan berdasarkan `chunk.index` sehingga urutan retrieval 100% konsisten pada pengujian berulang.
8. **Isolasi Kepemilikan (Multi-Tenant)**: Memeriksa `snapshot.userId === query.userId`. Akses silang guru langsung memicu error `ROLE_FORBIDDEN`.
9. **Semantic Extension Point (`SemanticRetrieverPlugin`)**: Menyediakan antarmuka plugin opsional (`embedQuery`, `rerankChunks`) sehingga reranking berbasis pgvector atau embeddings dapat diintegrasikan di masa depan tanpa mengubah alur pemanggilan retrieval.

---

## 5. Grounding Hardening: Penolakan Klaim Tak Berdasar (Anti-Halusinasi)

Sistem grounding menerapkan aturan verifikasi entitas dan numerik ketat: **Unsupported claims are rejected and classified as NOT_FOUND by the tested grounding rules.**

1. **Deteksi Entitas Spesifik & Nilai Numerik**:
   - Sistem mendeteksi entitas kapitalisasi, akronim teknis (seperti *Cisco*, *Catalyst*, *VLAN*, *Bitcoin*, *Ethereum*, *Common Rail*), dan nilai numerik spesifik (seperti *2000 bar*, *2960*).
   - Jika klaim memuat entitas atau nilai numerik yang sama sekali tidak ditemukan pada materi sumber rujukan, klaim tersebut **seketika ditolak sebagai `NOT_FOUND`**.
   - Ini mencegah celah kelolosan (*false-positive bypass*) di mana klaim yang menyisipkan entitas asing dianggap `SUPPORTED` hanya karena 70% kata penghubung di sekitarnya cocok.
2. **Evaluasi Rasio Kecocokan**:
   - Jika rasio kecocokan leksikal $< 40\%$, status diklasifikasikan sebagai **`NOT_FOUND`**.
   - Jika rasio kecocokan $\ge 70\%$ dan seluruh entitas spesifik terverifikasi, status adalah **`SUPPORTED`**.
   - Jika rasio kecocokan $40\% - 69\%$ dan entitas valid, status adalah **`INFERRED`**.
3. **Hasil Validasi Kasus Negatif Riil**:
   - Kueri pompa diesel common rail bertekanan 2000 bar pada mesin bensin EFI $\to$ **`NOT_FOUND`** (entitas tak berdasar: `2000`, `common`, `diesel`).
   - Kueri switch Cisco Catalyst 2960 pada routing statis MikroTik $\to$ **`NOT_FOUND`** (entitas tak berdasar: `2960`, `cisco`, `catalyst`).
   - Kueri 5 VLAN trunking pada routing statis MikroTik $\to$ **`NOT_FOUND`** (entitas tak berdasar: `vlan`).
   - Kueri aset kripto Bitcoin pada jurnal penyesuaian $\to$ **`NOT_FOUND`**.
   - Kueri pendingin baterai lithium EV pada mesin bensin EFI $\to$ **`NOT_FOUND`**.

---

## 6. Model Bukti & Provenansi (`GroundingEvidenceRef`)

Setiap item bukti retrieval memuat metadata terstruktur lengkap untuk auditabilitas:

```ts
export interface GroundingEvidenceRef {
  sourceId: string;        // ID unik snapshot sumber (UUID/src_hash)
  chunkId?: string;        // ID unik potongan materi asal (chunk_hash)
  sourceTitle?: string;    // Judul bab atau nama file dokumen
  snippet?: string;        // Potongan kalimat spesifik yang menjadi bukti faktual
  status: GroundingStatus; // "SUPPORTED" | "INFERRED" | "NOT_FOUND"
  relevanceScore?: number; // Skor relevansi terhitung (0.0 - 1.0)
}
```

---

## 7. Fixture Materi & Golden Retrieval Dataset

Fixture nyata tersimpan di [`tests/fixtures/`](file:///c:/novara%20project/gurupro-ai-journal-main/tests/fixtures/):

1. **`educational-network-routing.txt`**: Materi Teknik Jaringan Komputer SMK (Routing Statis, RouterOS CLI, tabel perutean, troubleshooting).
2. **`educational-web-vlan.html`**: Halaman web edukatif dengan struktur artikel VLAN 802.1Q, port access vs trunk, dan noise iklan/navigasi.
3. **`educational-accounting-journal.docx`**: Dokumen biner DOCX nyata berisi Jurnal Penyesuaian Akuntansi, asuransi dibayar di muka, metode garis lurus, dan tabel akun.
4. **`educational-automotive-injection.pdf`**: Dokumen biner PDF nyata multi-halaman berisi Pemeliharaan Sistem Bahan Bakar EFI, sensor MAF/TPS/IAT, dan scanner OBD-II DTC.

### Matriks Kategori Pengujian Golden Dataset (20 Kasus)
Definisi pengujian berada di [`tests/fixtures/golden-retrieval-dataset.json`](file:///c:/novara%20project/gurupro-ai-journal-main/tests/fixtures/golden-retrieval-dataset.json):

| Kategori | Nama Pengujian | Target Fixture | Ekspektasi Retrieval | Status Grounding |
| :--- | :--- | :--- | :--- | :--- |
| **A** | Exact factual query | `network-routing.txt` | Nilai default administrative distance = 1 | `SUPPORTED` |
| **B** | Natural-language query | `accounting-journal.docx` | Perhitungan beban asuransi Rp 3.000.000 | `SUPPORTED` |
| **B2** | Paraphrase (biaya asuransi) | `accounting-journal.docx` | Penyesuaian biaya asuransi Rp 3.000.000 | `SUPPORTED` |
| **B3** | Paraphrase (jarak administratif) | `network-routing.txt` | Jarak administratif perutean statis default = 1 | `SUPPORTED` |
| **C** | Terminology query | `automotive-injection.pdf` | Fungsi sensor MAF & TPS pada mesin EFI | `SUPPORTED` |
| **D** | Equivalent wording | `network-routing.txt` | Keunggulan perutean manual vs dinamis | `SUPPORTED` / `INFERRED` |
| **E** | Specific section query | `web-vlan.html` | Standar protokol IEEE 802.1Q & tag TPID | `SUPPORTED` |
| **F** | Distant chunk query | `network-routing.txt` | Flag status rute Active Static (AS) & Unreachable | `SUPPORTED` |
| **G** | Multiple chunks query | `web-vlan.html` | Mode Access & Trunk serta nomor VLAN ID | `SUPPORTED` |
| **H** | Nearby irrelevant query | `automotive-injection.pdf` | Interval ganti saringan bensin 40.000 km | `SUPPORTED` |
| **I** | Negative query (VLAN) | `network-routing.txt` | Aturan pembagian VLAN encapsulation 802.1Q | `NOT_FOUND` |
| **I2** | Negative query (Kripto) | `accounting-journal.docx` | Pertanyaan aset kripto Bitcoin | `NOT_FOUND` |
| **I3** | Negative query (Baterai EV) | `automotive-injection.pdf` | Pertanyaan pendingin baterai lithium EV | `NOT_FOUND` |
| **I4** | Negative query (Common Rail) | `automotive-injection.pdf` | Pompa common rail diesel 2000 bar | `NOT_FOUND` |
| **I5** | Negative query (Cisco 2960) | `network-routing.txt` | Perintah ip route pada switch Cisco Catalyst 2960 | `NOT_FOUND` |
| **I6** | Negative query (5 VLAN) | `network-routing.txt` | Pembagian 5 VLAN trunking subinterface | `NOT_FOUND` |
| **J** | Cross-user attempt | `network-routing.txt` | Akses Guru B ke sumber Guru A | Ditolak `ROLE_FORBIDDEN` |
| **K** | Empty query fallback | `network-routing.txt` | Kueri spasi kosong | Sekuensial aman (index 0) |
| **L** | Very long query | `accounting-journal.docx` | Kueri paragraf panjang (> 200 karakter) | Penyusutan Rp 10.000.000 |
| **M** | Reproducibility | `automotive-injection.pdf` | Tekanan bensin fuel rail (2.5 - 3.0 bar) | 100% identik di 10 iterasi |

---

## 8. Ringkasan Eksekusi Pengujian (20 Test Suites)

Seluruh suite pengujian dijalankan melalui `npm test`:

```
1.  tests/security/security.test.mjs                  PASSED
2.  tests/security/remediation.test.mjs               PASSED
3.  tests/ai/ai-core.test.mjs                         PASSED
4.  tests/auth/auth-role.test.mjs                     PASSED
5.  tests/kelas/kelas-membership.test.mjs             PASSED
6.  tests/kelas/mapel-kelas-sync.test.mjs             PASSED
7.  tests/kelas/tahun-ajaran-context.test.mjs         PASSED
8.  tests/penugasan/penugasan.test.mjs                PASSED
9.  tests/penugasan/kkm-remedial.test.mjs             PASSED
10. tests/submission/submission.test.mjs              PASSED
11. tests/penilaian/penilaian.test.mjs                PASSED
12. tests/dashboard/dashboard-roles.test.mjs          PASSED
13. tests/dashboard/admin-operations.test.mjs         PASSED
14. tests/rekap/rekap-nilai.test.mjs                  PASSED
15. tests/persistence/persistence-integrity.test.mjs  PASSED
16. tests/export/export-archive.test.mjs              PASSED
17. tests/core-gate/core-system-gate.test.mjs (21/21) PASSED
18. tests/ai/ai-foundation.test.mjs (42/42)           PASSED
19. tests/ai/ai-retrieval-validation.test.mjs (35/35) PASSED
20. tests/ai/ai-final-gate.test.mjs (14/14)           PASSED
================================================================================
  HASIL KESELURUHAN: 20/20 SUITE LULUS (0 FAILURES)
================================================================================
```

---

## 9. Hasil Validasi Live E2E (`scripts/verify-live-ai-hardening.mjs`)

Pengujian live end-to-end terhadap basis data canonical Supabase (`dxzzpsrgbiummjplggyo`):

- **Flow 1 (PDF)**: Penyerapan PDF sistem bahan bakar EFI $\to$ Query tekanan fuel rail $\to$ Mengembalikan potongan bukti `"2.5 hingga 3.0 bar"` dengan status `SUPPORTED` (LULUS).
- **Flow 2 (DOCX)**: Penyerapan DOCX jurnal penyesuaian $\to$ Query asuransi dibayar di muka $\to$ Mengembalikan potongan bukti `"3.000.000"` dengan status `SUPPORTED` (LULUS).
- **Flow 3 (HTML)**: Penyerapan HTML VLAN $\to$ Query IEEE 802.1Q $\to$ Mengembalikan potongan bukti `"Tag Protocol Identifier"` dengan status `SUPPORTED` (LULUS).
- **Flow 4 (Negative Grounding)**: Penegasan pompa common rail diesel 2000 bar pada mesin bensin $\to$ Ditolak seketika sebagai `NOT_FOUND` (LULUS).
- **Flow 5 (Isolasi Multi-Tenant)**: Percobaan Guru B mengakses snapshot Guru A $\to$ Diblokir seketika dengan `ROLE_FORBIDDEN` (LULUS).
- **Flow 6 (Server-Side Auth Boundary)**: Gateway Auth Supabase aktif, peran siswa diblokir dari operasi AI guru, guru status pending diblokir, guru terverifikasi diizinkan (LULUS).

---

## 10. Perintah Validasi Cepat

```bash
# Menjalankan pengujian spesifik AI-1 Ingestion & Retrieval
npx tsx tests/ai/ai-retrieval-validation.test.mjs

# Menjalankan pengujian AI-1 Final Hardening Gate
npx tsx tests/ai/ai-final-gate.test.mjs

# Menjalankan verifikasi live end-to-end terhadap Supabase
npm run verify:ai-hardening

# Menjalankan seluruh 20 test suite sistem
npm test

# Melakukan kompilasi build produksi
npm run build
```
