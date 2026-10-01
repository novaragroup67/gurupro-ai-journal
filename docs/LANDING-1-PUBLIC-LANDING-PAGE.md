# LANDING-1 — Public Landing Page & Entry Flow

## Ringkasan Eksekutif
Dokumen ini merangkum arsitektur dan implementasi teknis untuk tahap **LANDING-1 (Public Landing Page & Entry Flow)** pada aplikasi GuruPro. Tujuan dari tahap ini adalah menyediakan gerbang publik terpadu dan profesional sehingga pengunjung (*unauthenticated visitor*) yang mengakses alamat utama (`/`) dapat langsung memahami identitas GuruPro, nilai inti produk, modul pembelajaran, kapabilitas AI yang terverifikasi, dan alur kerja kurikulum sebelum memutuskan mendaftar atau masuk.

---

## 1. Arsitektur Alur Masuk (Public Entry Flow)

Alur masuk publik GuruPro mengikuti diagram berikut:

```text
Pengunjung (Visitor)
   ↓
Landing Page GuruPro (/)
   ├── Daftar Sekarang → Register (/daftar)
   └── Masuk → Login (/login)
                  ↓
       Pengguna Terautentikasi
                  ↓
   Dashboard Berdasarkan Peran:
   ├── Guru   → TeacherDashboard
   ├── Siswa  → StudentDashboard
   └── Admin  → AdminDashboard
```

---

## 2. Pemisahan Rute Publik & Terproteksi (Public / Private Separation)

1. **Rute Root (`/`)**:
   - Dikelola oleh `IndexRouteComponent` di [`src/routes/index.tsx`](file:///c:/novara%20project/gurupro-ai-journal-main/src/routes/index.tsx).
   - Memeriksa sesi melalui `useAuth()`:
     - Jika sesi belum siap (`!ready`), menampilkan status pemuatan ringan.
     - Jika pengunjung belum login (`!signedIn`), merender `<LandingPage />` langsung tanpa bingkai dashboard `AppShell`.
     - Jika pengguna sudah login (`signedIn`), merender `<DashboardSwitcher />` di dalam `AppShell`.
2. **Katalog Jalur Publik (`AUTH_PUBLIC_PATHS`)**:
   - Didefinisikan di [`src/lib/auth-store.ts`](file:///c:/novara%20project/gurupro-ai-journal-main/src/lib/auth-store.ts):
     - `/login` (Form masuk)
     - `/daftar` (Form registrasi Guru / Siswa)
     - `/lupa-kata-sandi` (Pemulihan kata sandi)
     - `/landing` (Halaman landing page independen)
     - `/gabung` & `/gabung/:kodeKelas` (Tautan undangan siswa bergabung ke rombel)
3. **Gerbang Keamanan (`AuthGate` di `src/routes/__root.tsx`)**:
   - Evaluasi keamanan: `publicAuth = isAuthPublicPath(pathname) || (isRoot && !signedIn)`.
   - Untuk rute terproteksi (`/dashboard`, `/modul-ajar`, `/soal`, `/penugasan`, `/penilaian`, `/arsip`, `/profil`), jika pengguna belum login (`!signedIn`), sistem secara ketat dan otomatis mengalihkannya ke `/login` tanpa membocorkan data privat atau tampilan aplikasi internal.
   - Tidak ada *authentication bypass*.

---

## 3. Seksi-Seksi Landing Page GuruPro

Komponen `LandingPage` pada [`src/routes/landing.tsx`](file:///c:/novara%20project/gurupro-ai-journal-main/src/routes/landing.tsx) disusun atas seksi-seksi berikut:

### A. Public Navigation Bar
- **Logo GuruPro**: Menautkan ke `/`.
- **Navigasi Publik**:
  - `Beranda` (`#`)
  - `Fitur` (`#fitur`)
  - `Fitur AI` (`#ai-fitur`)
  - `Cara Kerja` (`#cara-kerja`)
  - `Sasaran` (`#sasaran`)
- **Aksi Cepat Autentikasi**:
  - `Masuk` (variant outline/ghost $\rightarrow$ `/login`)
  - `Daftar Sekarang` (primary CTA dominan $\rightarrow$ `/daftar`)
- **Navigasi Mobile**: Tombol menu hamburger yang membuka navigasi responsif pada layar ponsel/tablet.

### B. Hero Section
- **Badge Pengenal**: `Platform Pembelajaran & Administrasi Guru SMA/SMK`.
- **Tagline Resmi**:
  > **Guru Fokus Mengajar, GuruPro Urus Adminnya.**
- **Penjelasan Nilai Inti**:
  > *GuruPro membantu guru membuat, mengelola, dan menjalankan kebutuhan pembelajaran dan administrasi pembelajaran dalam satu sistem.*
- **Aksi CTA**:
  - Primary CTA: **Daftar Sekarang** (tombol dominan dengan panah $\rightarrow$ `/daftar`).
  - Secondary CTA: **Masuk** (tombol outline $\rightarrow$ `/login`).
  - Auxiliary CTA: **Pelajari Fitur** (scroll halus ke `#fitur`).

### C. Product Overview (`#fitur`)
Menjelaskan 5 modul utama yang telah beroperasi di GuruPro:
1. **Modul Ajar**: Penyusunan modul ajar Kurikulum Merdeka terstruktur dengan fase, elemen, tujuan pembelajaran, dan langkah kegiatan.
2. **Generator Soal**: Rancang paket asesmen pilihan ganda dan esai berdasarkan materi pembelajaran dengan kunci jawaban.
3. **Penugasan Kelas**: Distribusikan tugas latihan atau asesmen langsung ke rombel kelas dengan tenggat waktu.
4. **Pengumpulan Tugas**: Siswa mengunggah jawaban secara daring dan guru memantau status submisi secara terpusat.
5. **Penilaian & Rekap Nilai**: Penilaian berbasis KKM, remedial, serta rekapitulasi nilai per kelas dan tahun ajaran.

### D. AI Features Section (`#ai-fitur`)
Menampilkan kapabilitas kecerdasan buatan berbasis *grounding* yang nyata dan terverifikasi di basis kode:
1. **AI Modul Ajar**: Generasi draf modul ajar terstruktur dari sumber rujukan nyata (CP/ATP, teks, dokumen, atau web) dengan penjaminan mutu faktual 2D (anti-halusinasi) dan status aman draf.
2. **AI Generator Soal**: Pembuatan bank soal pilihan ganda dan esai kontekstual secara instan dengan pembahasan dan rubrik.
3. **AI Illustration Pipeline**: Integrasi aset visual edukatif terverifikasi untuk memperkaya modul ajar guru secara kontekstual.
*(Catatan Invarian: Tidak mengklaim generator presentasi PPT sebagai fitur selesai karena statusnya masih jeda pada PPT-1B)*.

### E. Simple Product Flow (`#cara-kerja`)
Menyajikan alur kerja edukasi 6 tahapan yang berkesinambungan:
```text
1. Materi Sumber      → Persiapan bahan rujukan, CP/ATP, atau buku ajar.
2. Modul Ajar         → Penyusunan draf modul ajar terstandarisasi.
3. Paket Soal         → Pembuatan instrumen evaluasi formatif/sumatif.
4. Penugasan          → Pembagian tugas ke rombongan belajar target.
5. Siswa Mengerjakan  → Akses portal penugasan dan pengumpulan tugas.
6. Penilaian & Rekap  → Koreksi, evaluasi KKM, remedial, dan ekspor rekap.
```

### F. Target User Section (`#sasaran`)
- Sasaran utama: **Guru SMA / SMK**.
- Menguraikan empat fokus manfaat langsung:
  - Penyiapan materi ajar Kurikulum Merdeka (Fase E & F).
  - Perancangan asesmen mandiri dan bank soal.
  - Manajemen tugas rombel tanpa berkas fisik tercecer.
  - Peninjauan submisi dan rekapitulasi nilai yang rapi.

### G. Bottom Call-to-Action & Footer
- Banner penutup dengan tombol **Daftar Sekarang** dan **Masuk ke Akun**.
- Footer informatif dengan identitas GuruPro, tautan navigasi, tautan autentikasi (`/login`, `/daftar`, `/lupa-kata-sandi`), serta hak cipta tahun 2026.
- Bebas dari kontak fiktif, ulasan buatan, atau statistik palsu.

---

## 4. Perilaku Redireksi Berbasis Peran (Role-Aware Redirect)

Ketika pengguna terautentikasi mengunjungi root (`/`) atau `/landing`:
- Pengguna **tidak di-logout**.
- Sesi aktif dipertahankan sepenuhnya.
- `DashboardSwitcher` pada [`src/routes/index.tsx`](file:///c:/novara%20project/gurupro-ai-journal-main/src/routes/index.tsx) secara otomatis merender tampilan yang sesuai:
  - `profile.role === "guru"` $\rightarrow$ `<TeacherDashboard />`
  - `profile.role === "siswa"` $\rightarrow$ `<StudentDashboard />`
  - `profile.role === "admin"` $\rightarrow$ `<AdminDashboard />`
- Jika peran akun belum terdaftar, sistem menampilkan pemberitahuan ramah peran tanpa membocorkan fungsi guru atau siswa.

---

## 5. Aksesibilitas & Responsivitas (Accessibility & Responsiveness)

1. **Struktur Semantik**:
   - Penggunaan elemen standar: `<header>`, `<nav>`, `<main>`, `<section>`, `<footer>`, `<h1>`, `<h2>`, `<h3>`.
2. **Kontras & Tipografi**:
   - Menggunakan token desain GuruPro (`text-navy`, `text-primary`, `bg-background`, `border-border`).
3. **Fokus & Keyboard Navigation**:
   - Semua tombol dan link menyertakan `focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none`.
4. **Dukungan Layar Penuh**:
   - Diuji pada layout mobile (sm < 640px), tablet (md/lg 768px-1024px), dan desktop (xl > 1280px).
   - Zero horizontal overflow.

---

## 6. Verifikasi & Pengujian

### A. Test Suite Khusus: `tests/ui/landing-page.test.mjs`
Menjalankan 18 pengujian terfokus:
- [PASS 1] Public paths catalog includes all legitimate public entry routes.
- [PASS 2] Protected application routes strictly rejected by isAuthPublicPath.
- [PASS 3] Unauthenticated access to '/' allowed through AuthGate into public landing.
- [PASS 4] Unauthenticated access to any protected route redirects to /login (no bypass).
- [PASS 5] Unauthenticated visitor on '/' renders LandingPage without dashboard or redirect flash.
- [PASS 6] Authenticated Guru on '/' dispatches to TeacherDashboard.
- [PASS 7] Authenticated Siswa on '/' dispatches to StudentDashboard.
- [PASS 8] Authenticated Admin on '/' dispatches to AdminDashboard.
- [PASS 9] Primary CTA links to '/daftar' and secondary CTA links to '/login'.
- [PASS 10] All section anchors (#fitur, #ai-fitur, #cara-kerja, #sasaran) correspond to valid section elements.
- [PASS 11] Product branding, tagline, and core value strictly match specification.
- [PASS 12] Target audience explicitly specifies Guru SMA / SMK.
- [PASS 13] Core workflow modules (Modul Ajar, Soal, Penugasan, Pengumpulan, Penilaian) described concisely.
- [PASS 14] AI features strictly highlight verified capabilities without unsupported claims.
- [PASS 15] Simple 6-step product flow reflects the canonical educational lifecycle.
- [PASS 16] Integrity check: Zero fabricated statistics, reviews, or fake school logos.
- [PASS 17] Accessibility and responsive elements present.
- [PASS 18] Public landing page is lightweight and executes zero private database queries or AI calls.

### B. Hasil Regresi & Build
- `npm run test:landing`: **18/18 PASS**
- `node tests/auth/auth-role.test.mjs`: **25/25 PASS**
- `node tests/dashboard/dashboard-roles.test.mjs`: **14/14 PASS**
- `npm test`: **44 Test Suites PASS (100%)**
- `npm run build`: **Vite + Nitro build sukses dalam 822 ms (0 galat)**

---

## 7. Batasan yang Diketahui (Known Limitations)
1. **Fitur PPT**: Presentasi visual dihentikan sementara pada milestone PPT-1B (konten terstruktur) dan tidak ditampilkan sebagai modul yang sudah selesai di landing page publik.
2. **Koneksi Jaringan**: Karena landing page beroperasi dengan rute statis publik di sisi client/SSR, halaman ini tidak memerlukan kuota API eksternal atau koneksi basis data Supabase aktif untuk dirender ke pengunjung.
