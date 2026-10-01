# Flowchart Alur Autentikasi: Login & Daftar Akun (GuruPro)

Dokumen ini memuat diagram alur (*flowchart*) dan spesifikasi teknis lengkap untuk proses **Pendaftaran Akun (Register)**, **Masuk Akun (Login)**, dan **Verifikasi Peran & Otorisasi Sesi (Auth Middleware)** pada platform **GuruPro**.

Arsitektur ini merujuk langsung pada implementasi produksi di:
* `src/routes/login.tsx`
* `src/routes/daftar.tsx`
* `src/lib/auth-store.ts`
* `src/integrations/supabase/auth-middleware.ts`
* Database Trigger `handle_new_user()` pada Supabase (`public.profiles`)

---

## 1. Flowchart Pendaftaran Akun (Daftar Akun Guru & Siswa)

```mermaid
flowchart TD
    %% Styling
    classDef startEnd fill:#0f766e,stroke:#115e59,stroke-width:2px,color:#ffffff,rx:15,ry:15;
    classDef process fill:#f8fafc,stroke:#3b82f6,stroke-width:1.5px,color:#0f172a,rx:8,ry:8;
    classDef processPurple fill:#fbfbfe,stroke:#8b5cf6,stroke-width:1.5px,color:#0f172a,rx:8,ry:8;
    classDef processGreen fill:#f0fdf4,stroke:#10b981,stroke-width:1.5px,color:#0f172a,rx:8,ry:8;
    classDef decision fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#78350f;
    classDef errorNode fill:#fee2e2,stroke:#ef4444,stroke-width:2px,color:#991b1b,rx:8,ry:8;
    classDef infoNode fill:#e0f2fe,stroke:#0284c7,stroke-width:1.5px,color:#0369a1,rx:8,ry:8;

    subgraph RegisterUI ["1. Antarmuka Pendaftaran (/daftar)"]
        R_Start(["<b>Mulai</b><br/>Pengguna membuka halaman /daftar"]):::startEnd
        R_ChooseRole{"<b>Pilih Peran?</b>"}:::decision
        R_FormGuru["<b>Formulir Guru</b><br/>• Nama Lengkap<br/>• Email<br/>• Nomor HP<br/>• Asal Sekolah<br/>• Mata Pelajaran<br/>• NIP / NUPTK<br/>• Kata Sandi & Konfirmasi"]:::process
        R_FormSiswa["<b>Formulir Siswa</b><br/>• Nama Lengkap<br/>• Email<br/>• Nomor HP (opsional)<br/>• Asal Sekolah<br/>• NISN<br/>• Jenjang / Angkatan<br/>• Kata Sandi & Konfirmasi"]:::process
        R_Submit["<b>Klik Tombol Daftar</b>"]:::process

        R_Start --> R_ChooseRole
        R_ChooseRole -- "Peran: Guru" --> R_FormGuru
        R_ChooseRole -- "Peran: Siswa" --> R_FormSiswa
        R_FormGuru --> R_Submit
        R_FormSiswa --> R_Submit
    end

    subgraph ClientValidation ["2. Validasi Sisi Klien"]
        R_ValCheck{"<b>Form Valid?</b><br/>• Email format valid?<br/>• Field wajib terisi?<br/>• Sandi min 8 karakter?<br/>• Konfirmasi cocok?"}:::decision
        R_ClientError["<b>Tampilkan Pesan Error</b><br/>di bawah field formulir"]:::errorNode

        R_Submit --> R_ValCheck
        R_ValCheck -- "Tidak" --> R_ClientError
        R_ClientError -.-> R_Submit
    end

    subgraph SupabaseAuth ["3. Proses Backend & Database (Supabase)"]
        R_CallApi["<b>Panggil supabase.auth.signUp()</b><br/>Kirim email, password, & user_metadata"]:::processPurple
        R_CheckDupl{"<b>Email Sudah Terdaftar?</b><br/>(Anti-enumeration check:<br/>identities.length === 0)"}:::decision
        R_DuplError["<b>Tolak Pendaftaran</b><br/>'Email ini sudah terdaftar'"]:::errorNode
        
        R_Trigger["<b>Trigger PostgreSQL Otomatis</b><br/><code>handle_new_user()</code> membuat baris di <code>public.profiles</code>"]:::processPurple
        R_RoleInit{"<b>Peran Akun?</b>"}:::decision
        R_InitGuru["<b>Profil Guru Dibuat</b><br/>Status Verifikasi = <code>'menunggu'</code><br/>(Menunggu tinjauan admin)"]:::processPurple
        R_InitSiswa["<b>Profil Siswa Dibuat</b><br/>Status Verifikasi = <code>'terverifikasi'</code><br/>(Langsung aktif)"]:::processGreen

        R_ValCheck -- "Ya" --> R_CallApi
        R_CallApi --> R_CheckDupl
        R_CheckDupl -- "Ya (Duplikat)" --> R_DuplError
        R_CheckDupl -- "Tidak (Baru)" --> R_Trigger
        R_Trigger --> R_RoleInit
        R_RoleInit -- "Guru" --> R_InitGuru
        R_RoleInit -- "Siswa" --> R_InitSiswa
    end

    subgraph RegisterFinish ["4. Hasil & Notifikasi"]
        R_EmailNotif["<b>Notifikasi Verifikasi Email</b><br/>Jika konfirmasi email aktif: cek inbox"]:::infoNode
        R_Redirect["<b>Arahkan ke /login</b>"]:::processGreen
        R_End(["<b>Selesai Pendaftaran</b>"]):::startEnd

        R_InitGuru --> R_EmailNotif
        R_InitSiswa --> R_EmailNotif
        R_EmailNotif --> R_Redirect
        R_Redirect --> R_End
    end
```

---

## 2. Flowchart Masuk Akun (Login) & Sesi

```mermaid
flowchart TD
    %% Styling
    classDef startEnd fill:#0f766e,stroke:#115e59,stroke-width:2px,color:#ffffff,rx:15,ry:15;
    classDef process fill:#f8fafc,stroke:#3b82f6,stroke-width:1.5px,color:#0f172a,rx:8,ry:8;
    classDef processPurple fill:#fbfbfe,stroke:#8b5cf6,stroke-width:1.5px,color:#0f172a,rx:8,ry:8;
    classDef processGreen fill:#f0fdf4,stroke:#10b981,stroke-width:1.5px,color:#0f172a,rx:8,ry:8;
    classDef decision fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#78350f;
    classDef errorNode fill:#fee2e2,stroke:#ef4444,stroke-width:2px,color:#991b1b,rx:8,ry:8;
    classDef warningNode fill:#fffbeb,stroke:#f59e0b,stroke-width:2px,color:#b45309,rx:8,ry:8;

    subgraph LoginUI ["1. Antarmuka Masuk (/login)"]
        L_Start(["<b>Mulai</b><br/>Pengguna membuka halaman /login"]):::startEnd
        L_Input["<b>Masukkan Kredensial</b><br/>• Email<br/>• Kata Sandi<br/>• Centang 'Ingat Saya'"]:::process
        L_Submit["<b>Klik Tombol 'Masuk'</b>"]:::process

        L_Start --> L_Input
        L_Input --> L_Submit
    end

    subgraph AuthVerification ["2. Autentikasi Kredensial"]
        L_ValBasic{"<b>Input Lengkap & Valid?</b>"}:::decision
        L_BasicError["<b>Pesan Validasi</b><br/>'Email atau sandi wajib diisi'"]:::errorNode
        L_AuthApi["<b>Panggil supabase.auth.signInWithPassword()</b>"]:::processPurple
        L_AuthCheck{"<b>Kredensial Cocok?</b>"}:::decision
        L_AuthError["<b>Gagal Masuk</b><br/>'Email atau kata sandi salah'"]:::errorNode

        L_Submit --> L_ValBasic
        L_ValBasic -- "Tidak" --> L_BasicError
        L_ValBasic -- "Ya" --> L_AuthApi
        L_AuthApi --> L_AuthCheck
        L_AuthCheck -- "Tidak Cocok" --> L_AuthError
    end

    subgraph ProfileValidation ["3. Validasi Profil & Otoritas Peran Database"]
        L_FetchProfile["<b>Query Profil dari Database</b><br/>SELECT role, status_verifikasi<br/>FROM public.profiles WHERE id = user.id"]:::processPurple
        L_CheckProfileFound{"<b>Profil Ada?</b>"}:::decision
        L_MissingProfile["<b>Error Profil</b><br/>'Data profil tidak ditemukan. Hubungi admin'"]:::errorNode
        L_RoleCheck{"<b>Evaluasi Peran (Role)</b>"}:::decision

        L_AuthCheck -- "Cocok" --> L_FetchProfile
        L_FetchProfile --> L_CheckProfileFound
        L_CheckProfileFound -- "Tidak Ada" --> L_MissingProfile
        L_CheckProfileFound -- "Ditemukan" --> L_RoleCheck
    end

    subgraph AccessRouting ["4. Routing Berdasarkan Peran & Status"]
        L_AdminPass["<b>Akses Penuh Admin</b><br/>Dashboard Administrator GuruPro"]:::processGreen
        L_SiswaPass["<b>Akses Dashboard Siswa</b><br/>Ruang Belajar, Tugas, & Kelas Siswa"]:::processGreen
        
        L_GuruStatus{"<b>Cek Status Verifikasi Guru</b>"}:::decision
        L_GuruMenunggu["<b>Status 'menunggu'</b><br/>Peringatan: Akun dalam antrean verifikasi.<br/>Akses fitur kurikulum terbatas."]:::warningNode
        L_GuruDitolak["<b>Status 'ditolak' / 'nonaktif'</b><br/>Akses diblokir: Hubungi admin sekolah"]:::errorNode
        L_GuruAktif["<b>Status 'terverifikasi'</b><br/>Akses Penuh Guru:<br/>• Jurnal Mengajar<br/>• Generator Modul Ajar AI<br/>• Bank Soal AI<br/>• Penilaian & Rekap"]:::processGreen

        L_Success(["<b>Selesai</b><br/>Sesi aktif tersimpan"]):::startEnd

        L_RoleCheck -- "Peran: Admin" --> L_AdminPass
        L_RoleCheck -- "Peran: Siswa" --> L_SiswaPass
        L_RoleCheck -- "Peran: Guru" --> L_GuruStatus

        L_GuruStatus -- "menunggu" --> L_GuruMenunggu
        L_GuruStatus -- "ditolak / nonaktif" --> L_GuruDitolak
        L_GuruStatus -- "terverifikasi" --> L_GuruAktif

        L_AdminPass --> L_Success
        L_SiswaPass --> L_Success
        L_GuruAktif --> L_Success
    end
```

---

## 3. Matriks Hak Akses & Status Akun (Single Source of Truth)

Sistem otorisasi GuruPro menegakkan prinsip **Single Source of Truth (SSOT)** langsung dari tabel basis data `public.profiles`, bukan dari klaim token yang dikirimkan oleh klien:

| Peran (*Role*) | Status Verifikasi | Akses Dashboard | Akses Generate Modul & Soal AI | Akses Penilaian & Nilai |
| :--- | :--- | :--- | :--- | :--- |
| **Admin** | `terverifikasi` | Penuh (Semua Modul & Pengaturan) | Ya (Penuh) | Penuh (Semua Kelas) |
| **Guru** | `terverifikasi` | Penuh (Dashboard Guru) | Ya (Penuh dengan Otoritas AI Guard) | Ya (Kelas yang Diampu) |
| **Guru** | `menunggu` | Terbatas (Menunggu Verifikasi) | Ditolak (`requireGuruAuth` guard) | Ditolak |
| **Guru** | `ditolak` / `nonaktif` | Diblokir | Ditolak | Ditolak |
| **Siswa** | `terverifikasi` | Ruang Siswa (Tugas, Materi, Nilai) | Ditolak (Khusus Guru/Admin) | Hanya melihat nilai sendiri |

---

## 4. Keamanan & Proteksi Khusus

1. **Anti-Enumerasi Email**:
   * Jika pengguna mencoba mendaftar dengan email yang telah terdaftar, sistem mendeteksi array `identities` kosong dari Supabase Auth dan menampilkan pesan standar yang aman tanpa membocorkan data sensitif.
2. **Strict Server-Side Role Enforcement**:
   * API server TanStack Start / Nitro menggunakan middleware `requireGuruAuth` dan `requireTeacherAiAuth` yang selalu memverifikasi baris pengguna di tabel `public.profiles`. Upaya mengubah metadata role pada sisi klien secara otomatis ditolak (*Fail Closed*).
3. **Pemisahan Jalur Guru vs Siswa**:
   * Siswa dapat langsung aktif untuk pengerjaan tugas (`status_verifikasi = 'terverifikasi'`).
   * Guru memerlukan verifikasi status (`status_verifikasi = 'menunggu'` saat awal daftar) demi menjamin keamanan data administratif sekolah dan integritas materi ajar.
