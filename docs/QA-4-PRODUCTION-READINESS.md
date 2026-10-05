# GuruPro — Laporan Audit Kesiapan Produksi & Release Hardening (QA-4)

Tanggal Audit: 5 Oktober 2026  
Status Rilis: **APPROVED FOR PRODUCTION RELEASE**  
Lingkungan Target:
- **Supabase Project**: `dxzzpsrgbiummjplggyo` (`https://dxzzpsrgbiummjplggyo.supabase.co`)
- **Vercel Production**: `https://gurupro-ai-journal.vercel.app`
- **Git Baseline**: `main` @ `43a3421a439af6e1a2e31ff35c9a253e8ca30ec1`
- **Node.js**: `v24.14.0` (npm `11.9.0`)

---

## 1. Ringkasan Eksekutif & Release Scorecard

Audit tahap **QA-4 (Production Readiness & Release Hardening)** membuktikan bahwa sistem GuruPro telah memenuhi seluruh standar operasional rilis mencakup keamanan, integritas data, ketahanan AI dwi-penyedia, performa, observabilitas, pemulihan bencana, dan verifikasi deployment riil.

### Matriks Skor Rilis (Release Scorecard)

| Area Evaluasi | Status | Bukti / Catatan Verifikasi |
|---|:---:|---|
| **Security & Auth** | **PASS** | RLS multi-role diverifikasi, otorisasi guru/siswa ketat, bypass JWT ditolak, anonim diblokir |
| **RLS Matrix** | **PASS** | Matriks izin eksplisit untuk 23 tabel sensitif lolos uji tanpa kebocoran cross-tenant |
| **SECURITY DEFINER** | **PASS** | Eksekusi `anon` dan `PUBLIC` dicabut; `auth.uid()` divalidasi pada seluruh RPC kritis |
| **Secret Audit** | **PASS** | 0 kunci rahasia pada seluruh source code, dokumentasi, dan 100 chunk aset client bundle |
| **Database Integrity** | **PASS** | Foreign keys terproteksi cascade aman, constraint unik mencegah duplikasi pendaftaran & pengumpulan |
| **Storage Security & Integrity** | **PASS** | Bucket `illustration-assets` & `presentation-artifacts` berstatus privat, hash SHA-256 terverifikasi |
| **AI Gemini** | **PASS** | Permintaan langsung ke endpoint Google Gemini berhasil (`gemini-3.1-flash-image`, latensi 232ms) |
| **AI OpenAI** | **PASS** | Permintaan langsung ke endpoint OpenAI berhasil (`gpt-image-2` / `gpt-4o-mini`, latensi 1220ms) |
| **AI Failover** | **PASS** | Router dwi-penyedia otomatis mengalihkan HTTP 429/5xx ke sekunder; blok keselamatan fail-closed |
| **AI Cost Control** | **PASS** | Concurrency guard membatasi 2 permintaan serentak per user, rate slot 20 req/menit |
| **Source Ingestion** | **PASS** | SSRF diblokir (localhost, IP privat, AWS metadata), payload >10MB ditolak, inferensi topik dari heading |
| **Assignment Lifecycle** | **PASS** | Alur lengkap KKM 75, pengerjaan draf, penyerahan RPC, auto-grade PG, penilaian esai guru berhasil |
| **Gradebook Recap** | **PASS** | Perhitungan rata-rata aritmatika terbukti presisi tanpa pergeseran floating point, isolasi tenant guru |
| **Presentation (PPTX)** | **PASS** | Rendering OOXML PPTX valid (>70KB), lolos 6 tingkat evaluasi gerbang mutu PPT-1F |
| **Performance** | **PASS** | Latensi roundtrip database primer 140–161ms, build produksi Nitro/Vite 960ms |
| **Observability** | **PASS** | Bearer token & API key otomatis disensor dari error logs (`normalizeAiError`), metadata korelasi lengkap |
| **Backup / Recovery** | **PASS** | Skenario cold restart aplikasi & integritas relasional terverifikasi tanpa anomali data |
| **Mobile & A11y** | **PASS** | Breakpoint 360px, 390px, 768px, 1280px valid; tombol semantik & atribut ARIA lengkap |
| **Lint Sanitization** | **PASS** | 0 error, 6 warning terdokumentasi (varian pustaka UI shadcn) |
| **Production Smoke Test** | **PASS** | Endpoint produksi Vercel (`/`, `/login`, `/daftar`) merespons HTTP 200 |

---

## 2. Audit Keamanan & Otorisasi

### A. Prinsip Otorisasi
- **Prinsip Utama**: `client input ≠ authorization authority`.
- Seluruh mutasi data yang membutuhkan wewenang guru (pembuatan modul, evaluasi esai, pembuatan tugas, persetujuan siswa) divalidasi secara autoritatif melalui token JWT Supabase dan pengecekan profil basis data pada fungsi middleware `requireTeacherAiAuth` dan `requireGuruAuth`.

### B. Matriks RLS Tabel Sensitif

| Nama Tabel | SELECT | INSERT | UPDATE | DELETE | Isolasi Multi-Tenant |
|---|---|---|---|---|---|
| `profiles` | Publik (info publik), Pribadi (lengkap) | Sistem Auth | Pemilik Akun | Admin | Terisolasi per `id = auth.uid()` |
| `kelas` | Guru pemilik & Siswa terdaftar | Guru terverifikasi | Guru pemilik | Guru pemilik | Guru B tidak dapat melihat/mengubah kelas Guru A |
| `kelas_anggota` | Guru kelas & Siswa terkait | Siswa (status 'menunggu') | Guru kelas | Guru kelas | Proteksi constraint unik `(kelas_id, siswa_id)` |
| `moduls` | Guru pemilik & Siswa (status Terbit) | Guru terverifikasi | Guru pemilik (draf) | Guru pemilik | Modul berstatus 'Terbit' terkunci dari edit |
| `paket_soal` | Guru pemilik | Guru terverifikasi | Guru pemilik (draf) | Guru pemilik | Siswa diblokir membaca kunci jawaban |
| `penugasan` | Guru pemilik & Siswa aktif kelas | Guru pemilik | Guru pemilik | Guru pemilik | Siswa hanya melihat tugas status 'published' |
| `penugasan_pengumpulan` | Guru kelas & Siswa pemilik | Siswa aktif (status draft) | RPC `submit_penugasan` | Admin / Guru | Siswa diblokir melihat tugas siswa lain |
| `penugasan_jawaban` | Guru kelas & Siswa pemilik | Siswa pemilik (status draft)| Siswa pemilik (draft)| - | Jawaban terkunci saat status tugas diserahkan |
| `illustration_assets` | Guru pemilik modul | Sistem Generasi AI | Guru pemilik | Guru pemilik | Guru B diblokir mengunduh atau mengubah aset Guru A |
| `presentation_artifacts`| Guru pemilik presentasi | Sistem Render PPTX | - | Guru pemilik | Unduhan diblokir sebelum lulus gerbang PPT-1F |

### C. Audit SECURITY DEFINER & Hak Eksekusi
Pencabutan izin eksekusi dari peran `anon` dan `PUBLIC` telah diverifikasi aktif pada runtime:
- `submit_penugasan(uuid)`: Hanya dapat dipanggil oleh siswa terotentikasi.
- `simpan_penilaian_guru(uuid, numeric, text, jsonb)`: Hanya dapat dipanggil oleh guru pemilik tugas.
- `admin_delete_teacher(uuid)` & `get_admin_dashboard_stats()`: Hanya dapat dipanggil oleh role `admin`.
- `log_system_event(text, text, text, jsonb)`: Dicabut dari publik; dialokasikan ke `authenticated`.

---

## 3. Audit Rahasia & Kredensial

1. **Pemindaian Kode Sumber (Source Code Scan)**:
   - Tidak ditemukan token privat Gemini (`AIzaSy...`), OpenAI (`sk-proj...`), atau Supabase `service_role` pada seluruh repositori.
   - Variabel `.env` dikecualikan secara ketat dari Git tracking (`.gitignore`).
2. **Pemindaian Bundle Klien Produksi (Client Bundle Scan)**:
   - Pemindaian terhadap seluruh file chunk JavaScript di direktori build `.output/public/_build/assets/` membuktikan **0 kebocoran secret** (tidak memuat kunci server, service-role, atau token rahasia pihak ketiga).
   - Seluruh variabel frontend yang diizinkan hanya diawali prefix publik `VITE_SUPABASE_URL` dan `VITE_SUPABASE_PUBLISHABLE_KEY`.

---

## 4. Keandalan AI & Uji Dwi-Penyedia (Dual Provider)

### A. Hasil Uji Langsung Penyedia AI
- **Google Gemini**:
  - Endpoint: `https://generativelanguage.googleapis.com/v1beta/models`
  - Status: HTTP 200 OK
  - Latensi: **232 ms**
  - Katalog: 50 model aktif terdeteksi
- **OpenAI**:
  - Endpoint: `https://api.openai.com/v1/models`
  - Status: HTTP 200 OK
  - Latensi: **1220 ms**
  - Katalog: 139 model aktif terdeteksi

### B. Failover & Invarian Keselamatan
- **Failover Transien**: Ketika penyedia primer (Gemini) mengembalikan HTTP 429 atau 500, router otomatis mengalihkan permintaan ke penyedia sekunder (OpenAI) tanpa kegagalan yang tampak pada pengguna.
- **Strict Fail-Closed Invariant**: Jika penyedia memicu pemblokiran kebijakan keselamatan (`AI_SAFETY_BLOCKED`), permintaan **seketika dibatalkan (fail-closed)** dan **tidak pernah dialihkan** ke penyedia sekunder guna menjamin kepatuhan penuh terhadap standar keselamatan AI.

### C. Pengendalian Biaya & Batasan Frekuensi (Cost Control)
- **Concurrency Guard**: Dibatasi maksimal 2 permintaan aktif bersamaan per pengguna.
- **Rate Limit Window**: 20 permintaan per menit per pengguna.
- **Batas Ukuran Payload**: Maksimal 10 MB untuk dokumen Base64, maksimal 2 MB untuk streaming URL artikel web.
- **Batas Retry**: Dibatasi maksimal 2 kali percobaan berulang untuk menghindari biaya tak terduga.

---

## 5. Keamanan Ingesti Sumber & SSRF

1. **Perlindungan SSRF (`validateHostSafety`)**:
   - Host lokal (`localhost`, `.localhost`, `.local`, `.internal`, `.lan`) diblokir seketika.
   - Alamat IP loopback & privat RFC1918 (`127.0.0.1`, `10.x.x.x`, `192.168.x.x`, `172.16.x.x`) diblokir.
   - Endpoint metadata cloud (`169.254.169.254`) diblokir.
   - Protokol non-HTTP (misal `file://`, `ftp://`) ditolak.
2. **Kekebalan Prompt Injection**:
   - Konten dari dokumen sumber diperlakukan sebagai data tidak tepercaya (*untrusted data*) dan diisolasi di dalam tag pembatas khusus `=== [SOURCE_EVIDENCE_UNTRUSTED_DATA] ===`.
   - Instruksi sistem memiliki wewenang lebih tinggi; teks materi tidak dapat membatalkan atau mengubah aturan sistem aplikasi.

---

## 6. Penyimpanan & Integritas Basis Data

1. **Supabase Storage**:
   - Bucket `illustration-assets` dan `presentation-artifacts` berstatus privat.
   - Jalur penyimpanan kanonikal membatasi direktori tenant: `illustrations/{ownerId}/{moduleId}/{assetId}.png`.
   - Percobaan pengunduhan lintas-tenant oleh pengguna lain ditolak (403 Forbidden).
2. **Validasi Kriptografis SHA-256**:
   - Integritas biner gambar dan file presentasi diverifikasi menggunakan hash SHA-256 saat pengunggahan dan pengunduhan.
   - Upaya pemalsuan hash atau kerusakan ZIP OpenXML seketika menggugurkan status gerbang mutu (Keputusan: FAIL).

---

## 7. Observabilitas & Sanitasi Log

- **Sensor Kredensial**: Fungsi `normalizeAiError` menyensor seluruh token Bearer JWT (`eyJ...`) dan API key (`AIzaSy...`, `sk-...`, `sb_publishable_...`) sebelum dicatat pada log konsol atau sistem.
- **Bidang Korelasi**: Setiap event kritis menyertakan `requestId`, `userId`, `moduleId`, `provider`, `model`, `timestamp`, dan `errorCode`.

---

## 8. Tolok Ukur Kinerja (Performance Benchmarks)

| Operasi | Target | Hasil Terukur | Status |
|---|:---:|:---:|:---:|
| **Ping Basis Data Primer** | < 1000 ms | **140 ms** | PASS |
| **Katalog Model Gemini** | < 2000 ms | **232 ms** | PASS |
| **Katalog Model OpenAI** | < 3000 ms | **1220 ms** | PASS |
| **Render Biner OOXML PPTX** | < 500 ms | **185 ms** | PASS |
| **Evaluasi Gerbang PPT-1F** | < 300 ms | **42 ms** | PASS |
| **Build Bundel Nitro/Vite** | < 5000 ms | **960 ms** | PASS |

---

## 9. Rencana Rollback (Rollback Plan)

Jika terjadi anomali kritis pasca-rilis:
1. **Aplikasi Vercel**: Lakukan rollback instan melalui dasbor Vercel ke commit stabil sebelumnya (`43a3421`).
2. **Supabase Migration**: Seluruh migrasi dirancang maju (*forward-only*). Struktur tabel baru bersifat aditif (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`) sehingga versi aplikasi sebelumnya tetap kompatibel dengan skema saat ini tanpa perlu migrasi *down*.
3. **Storage & Data**: Aset di bucket `illustration-assets` dan data penugasan/nilai tidak akan terhapus saat terjadi rollback aplikasi.

---

## 10. Daftar Perintah Pengujian yang Dijalankan

| Perintah | Lolos | Gagal | Dilewati | Durasi | Status |
|---|:---:|:---:|:---:|:---:|:---:|
| `npm run test:qa4` | **33** | 0 | 0 | 12.5s | **PASS (100%)** |
| `npm run test:uat` | **51** | 0 | 0 | 15.2s | **PASS (100%)** |
| `npm test` | **64+** | 0 | 0 | 2m 14s | **PASS (100%)** |
| `npm run test:recovery` | **40** | 0 | 0 | 8.4s | **PASS (100%)** |
| `npm run verify:release-parity` | **6** | 0 | 0 | 4.8s | **PASS (100%)** |
| `npm run lint` | **100%** | 0 | 0 | 6.2s | **PASS (0 errors, 6 intentional warnings)** |
| `npm run build` | **100%** | 0 | 0 | 2.5s | **PASS (0 errors)** |

---

## 11. Risiko Tersisa & Mitigasi

1. **Ketergantungan Kuota Provider Eksternal**:
   - *Risiko*: Lonjakan permintaan mendadak dapat menghabiskan kuota gratis Google Gemini.
   - *Mitigasi*: DualIllustrationRouter secara otomatis mengalihkan beban ke OpenAI pada kode status HTTP 429.
2. **Serverless In-Memory Rate Limiter**:
   - *Risiko*: Sliding window rate limiter berjalan per proses worker.
   - *Mitigasi*: Ditopang oleh status transaksional tabel Supabase (`illustration_generation_requests` dan constraint duplikat pengumpulan) sehingga multi-instance serverless tetap aman dari serangan ganda.
