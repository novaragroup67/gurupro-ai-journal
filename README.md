# GuruPro: Admin Cerdas

Build a frontend-only prototype web app called GuruPro.

Product

GuruPro is a web application that helps teachers reduce administrative work, especially creating teaching journals.

Vision

"Guru fokus mengajar, GuruPro urus adminnya."

Target User

Main user: SMK teachers.

Technology

Use:

React

TypeScript

Tailwind CSS

shadcn/ui

Lucide icons

Do NOT create a database, backend, Supabase, authentication service, or external AI API yet.

Use mock data and local state only.

GOAL

Create a polished and responsive GuruPro frontend prototype with these main pages:

Dashboard

Jurnal

Create Jurnal

AI Journal Generator

The most important feature is the AI Journal Generator prototype.

The application must feel functional, not like a static design.

All buttons, forms, navigation, dropdowns, modals, and actions should work using local state.

LAYOUT

Create a modern teacher dashboard.

Desktop:

Left sidebar

Top header

Main content

Mobile:

Responsive sidebar/mobile menu

Responsive cards and forms

Sidebar menu:

Dashboard

Jurnal

Modul Ajar

Soal

Penugasan

Penilaian

Arsip

Profil

For this step, only Dashboard and Jurnal need complete functionality.

Other menu items can open a simple "Coming Soon" page.

DASHBOARD

Create a dashboard with:

Header

"Selamat datang kembali 👋"

Subtitle:
"Kelola administrasi pembelajaran dengan lebih mudah bersama GuruPro."

Statistics

Show 4 cards:

Jurnal Minggu Ini

Total Siswa

Tugas Aktif

Rata-rata Nilai

Use mock data.

Quick Actions

Buttons:

Buat Jurnal

Generate Jurnal dengan AI

These buttons must navigate to the correct page.

Recent Journals

Show several mock journals.

Each item can be clicked to open journal detail.

JURNAL PAGE

Create /jurnal.

Header:

Jurnal Mengajar

Buttons:

Buat Jurnal

✨ Generate dengan AI

Add:

Search input

Filter dropdown

Journal list

Each journal card should show:

tanggal

mata pelajaran

kelas

materi

badge "AI" or "Manual"

Actions:

Lihat

Edit

Hapus

All actions must work using local state.

For delete:
show a confirmation dialog.

For edit:
open the journal in editable form.

CREATE JOURNAL

Create /jurnal/create.

Form:

Mata Pelajaran

Kelas

Tanggal

Jam

Materi / Topik

Tujuan Pembelajaran

Metode Pembelajaran

Aktivitas Pembelajaran

Kondisi Kelas

Catatan Guru

Buttons:

Simpan Jurnal

✨ Generate dengan AI

Validate required fields:

Mata Pelajaran

Kelas

Tanggal

Materi

Tujuan Pembelajaran

Show inline validation when missing.

AI JOURNAL GENERATOR

This is the main prototype feature.

Do NOT connect to a real AI API yet.

Create a mock AI generator using local logic.

When user clicks:

✨ Generate dengan AI

show loading state:

"GuruPro AI sedang menyusun jurnal..."

After loading, generate a complete journal based on the user's input.

The generated result should contain:

Identitas Pembelajaran

Materi

Tujuan Pembelajaran

Kegiatan Pembelajaran

Partisipasi Siswa

Kondisi Kelas

Penilaian

Refleksi Guru

Tindak Lanjut

Catatan Guru

The generated content must relate to the user's input.

For example:

If the topic is:
"Konsep Database"

the generated journal should talk about database, not unrelated topics.

Use simple rule-based logic/templates to make the result contextual.

AI RESULT

After generation, show a journal preview page/card.

Add buttons:

Edit

Regenerate

Simpan Jurnal

Kembali

Edit

Allow the generated journal to become editable.

Regenerate

Generate the journal again using the same input.

Simpan Jurnal

Save the journal to local state/localStorage.

After saving:

show toast:

"Jurnal berhasil disimpan."

The saved journal must appear on the Jurnal page.

LOCAL STORAGE

Use localStorage for journals so that:

created journals remain after refresh

deleted journals disappear

edited journals are updated

No database.

INTERACTION REQUIREMENT

Important:

Do NOT create fake buttons.

Every visible interactive element should work.

Examples:

Sidebar navigation works

Buttons work

Search filters journals

Filter works

Edit works

Delete works

Confirmation modal works

Form validation works

Generate AI works

Loading state works

Save works

Toast works

Mobile menu works

DESIGN

Use a modern SaaS dashboard style.

Make it:

clean

professional

friendly

simple

suitable for Indonesian teachers

Use consistent:

spacing

typography

cards

buttons

icons

borders

empty states

loading states

Avoid overly complicated UI.

IMPORTANT SCOPE

For this step ONLY build:

Dashboard + Jurnal + Create Jurnal + AI Journal Generator

Do NOT implement:

database

backend

Supabase

real AI API

payment

real authentication

external integrations

Keep everything frontend-only.

Make the code modular so we can expand GuruPro step-by-step later.

The final result should be a working and responsive GuruPro Prototype v1 where the main workflow is:

Dashboard → Create Jurnal → Generate with AI → Review → Edit → Save → Jurnal List.

note: build aplikasi sesuai dengan perintah diatas dan sesuaikkan pewarnaan dan tema aplikasi agar sesuai dengan logo yang aku kirim, kamu atur semua element yang ada buat semuanya rapi dan terlihat aestetic pastikan tidak ada element yang saling menumpuk satu sama lain dan kamu usahakan untuk element button dll kamu bikin udan responsif dan interktif walaupun masih dummy

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://gurupro-ai-journal.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b9829a66-0134-4aa3-9f8b-d14c45a4a10b).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
