import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  FileQuestion,
  FileText,
  GraduationCap,
  ImageIcon,
  Layers,
  Menu,
  Send,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import { GuruProLogo } from "@/components/gurupro-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-store";

export const Route = createFileRoute("/landing")({
  head: () => ({
    meta: [
      { title: "GuruPro — Guru Fokus Mengajar, GuruPro Urus Adminnya." },
      {
        name: "description",
        content:
          "GuruPro membantu guru SMA/SMK membuat, mengelola, dan menjalankan kebutuhan pembelajaran dan administrasi pembelajaran dalam satu sistem terpadu.",
      },
      {
        property: "og:title",
        content: "GuruPro — Guru Fokus Mengajar, GuruPro Urus Adminnya.",
      },
      {
        property: "og:description",
        content:
          "Platform pembelajaran dan administrasi terpadu untuk guru SMA/SMK. Susun modul ajar, buat soal, kelola penugasan, dan rekap penilaian.",
      },
    ],
  }),
  component: LandingPage,
});

export function LandingPage() {
  const { signedIn, ready } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Jika pengguna sudah terautentikasi dan sesi siap, arahkan ke rute utama/dashboard
  useEffect(() => {
    if (ready && signedIn) {
      void navigate({ to: "/", replace: true });
    }
  }, [ready, signedIn, navigate]);

  return (
    <div className="flex min-h-screen flex-col bg-background selection:bg-primary/20 text-foreground">
      {/* 1. Public Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md p-1">
            <GuruProLogo />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden items-center gap-8 md:flex" aria-label="Navigasi Utama">
            <a
              href="#"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-navy dark:hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-1"
            >
              Beranda
            </a>
            <a
              href="#fitur"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-navy dark:hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-1"
            >
              Fitur
            </a>
            <a
              href="#ai-fitur"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-navy dark:hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-1"
            >
              Fitur AI
            </a>
            <a
              href="#cara-kerja"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-navy dark:hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-1"
            >
              Cara Kerja
            </a>
            <a
              href="#sasaran"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-navy dark:hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-1"
            >
              Sasaran
            </a>
          </nav>

          {/* Desktop Auth Actions */}
          <div className="hidden items-center gap-3 md:flex">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="font-medium text-navy hover:text-primary dark:text-foreground"
            >
              <Link to="/login">Masuk</Link>
            </Button>
            <Button asChild size="sm" className="font-semibold shadow-sm">
              <Link to="/daftar">Daftar Sekarang</Link>
            </Button>
          </div>

          {/* Mobile Menu Toggle Button */}
          <div className="flex items-center md:hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="inline-flex items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={mobileMenuOpen ? "Tutup menu navigasi" : "Buka menu navigasi"}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Dropdown */}
        {mobileMenuOpen && (
          <div className="border-b border-border bg-card px-4 pb-6 pt-2 md:hidden animate-in fade-in slide-in-from-top-2">
            <nav className="flex flex-col gap-3 py-2" aria-label="Navigasi Mobile">
              <a
                href="#"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
              >
                Beranda
              </a>
              <a
                href="#fitur"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
              >
                Fitur
              </a>
              <a
                href="#ai-fitur"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
              >
                Fitur AI
              </a>
              <a
                href="#cara-kerja"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
              >
                Cara Kerja
              </a>
              <a
                href="#sasaran"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
              >
                Sasaran
              </a>
            </nav>
            <div className="mt-4 flex flex-col gap-2 pt-2 border-t border-border">
              <Button asChild variant="outline" className="w-full justify-center">
                <Link to="/login" onClick={() => setMobileMenuOpen(false)}>
                  Masuk
                </Link>
              </Button>
              <Button asChild className="w-full justify-center font-semibold">
                <Link to="/daftar" onClick={() => setMobileMenuOpen(false)}>
                  Daftar Sekarang
                </Link>
              </Button>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">
        {/* 2. Hero Section */}
        <section className="relative overflow-hidden py-16 sm:py-24 lg:py-32">
          {/* Subtle background glow effect */}
          <div className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[420px] w-[680px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />

          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary-soft px-3.5 py-1 text-xs font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              <span>Platform Pembelajaran & Administrasi Guru SMA/SMK</span>
            </div>

            <h1 className="mt-6 font-display text-4xl font-extrabold tracking-tight text-navy sm:text-5xl lg:text-6xl dark:text-foreground">
              Guru Fokus Mengajar, <br className="hidden sm:inline" />
              <span className="text-brand-gradient">GuruPro Urus Adminnya.</span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              GuruPro membantu guru membuat, mengelola, dan menjalankan kebutuhan pembelajaran dan administrasi pembelajaran dalam satu sistem.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              <Button asChild size="lg" className="w-full font-semibold shadow-md sm:w-auto h-12 px-7">
                <Link to="/daftar">
                  Daftar Sekarang
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="w-full border-border font-semibold text-navy hover:bg-navy/5 sm:w-auto h-12 px-7 dark:text-foreground"
              >
                <Link to="/login">Masuk</Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                size="lg"
                className="w-full text-muted-foreground hover:text-foreground sm:w-auto h-12 px-4"
              >
                <a href="#fitur">
                  Pelajari Fitur
                  <ArrowDown className="ml-1.5 h-3.5 w-3.5" />
                </a>
              </Button>
            </div>
          </div>
        </section>

        {/* 3. Product Overview Section */}
        <section id="fitur" className="border-t border-border/80 bg-muted/30 py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto">
              <h2 className="font-display text-2xl font-bold tracking-tight text-navy sm:text-3xl dark:text-foreground">
                Fitur Lengkap Pembelajaran & Administrasi
              </h2>
              <p className="mt-3 text-sm text-muted-foreground sm:text-base leading-relaxed">
                Kelola seluruh kebutuhan mengajar dari perencanaan kurikulum, instrumen evaluasi, hingga pelaporan nilai dalam satu antarmuka terintegrasi.
              </p>
            </div>

            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {/* Fitur 1: Modul Ajar */}
              <Card className="border border-border/80 bg-card transition-all hover:-translate-y-1 hover:shadow-lift">
                <CardContent className="p-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                    <BookOpen className="h-6 w-6" />
                  </div>
                  <h3 className="mt-5 font-display text-lg font-bold text-navy dark:text-foreground">
                    Modul Ajar
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Penyusunan modul ajar Kurikulum Merdeka terstruktur dengan fase, elemen, tujuan pembelajaran, dan langkah kegiatan yang jelas.
                  </p>
                </CardContent>
              </Card>

              {/* Fitur 2: Generator Soal */}
              <Card className="border border-border/80 bg-card transition-all hover:-translate-y-1 hover:shadow-lift">
                <CardContent className="p-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                    <FileQuestion className="h-6 w-6" />
                  </div>
                  <h3 className="mt-5 font-display text-lg font-bold text-navy dark:text-foreground">
                    Generator Soal
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Rancang paket asesmen pilihan ganda dan esai secara otomatis berdasarkan materi pembelajaran dengan kunci jawaban dan pembahasan.
                  </p>
                </CardContent>
              </Card>

              {/* Fitur 3: Penugasan */}
              <Card className="border border-border/80 bg-card transition-all hover:-translate-y-1 hover:shadow-lift">
                <CardContent className="p-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                    <Send className="h-6 w-6" />
                  </div>
                  <h3 className="mt-5 font-display text-lg font-bold text-navy dark:text-foreground">
                    Penugasan Kelas
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Distribusikan tugas latihan atau asesmen langsung ke kelas yang diampu dengan instruksi kerja dan batas waktu pengumpulan terjadwal.
                  </p>
                </CardContent>
              </Card>

              {/* Fitur 4: Pengumpulan */}
              <Card className="border border-border/80 bg-card transition-all hover:-translate-y-1 hover:shadow-lift">
                <CardContent className="p-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <h3 className="mt-5 font-display text-lg font-bold text-navy dark:text-foreground">
                    Pengumpulan Tugas
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Siswa mengumpulkan tugas langsung melalui portal mereka, dan guru memantau status submisi secara transparan tanpa berkas tercecer.
                  </p>
                </CardContent>
              </Card>

              {/* Fitur 5: Penilaian & Rekap */}
              <Card className="border border-border/80 bg-card transition-all hover:-translate-y-1 hover:shadow-lift sm:col-span-2 lg:col-span-2">
                <CardContent className="p-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                    <BarChart3 className="h-6 w-6" />
                  </div>
                  <h3 className="mt-5 font-display text-lg font-bold text-navy dark:text-foreground">
                    Penilaian & Rekap Nilai
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Evaluasi pekerjaan siswa dengan kriteria KKM, fasilitasi ujian remedial, dan cetak atau ekspor rekapitulasi nilai per kelas dan tahun ajaran dengan cepat.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* 4. AI Features Section */}
        <section id="ai-fitur" className="border-t border-border/80 bg-background py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary-soft px-3.5 py-1 text-xs font-semibold text-primary">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                <span>Teknologi AI Grounded</span>
              </div>
              <h2 className="mt-4 font-display text-2xl font-bold tracking-tight text-navy sm:text-3xl dark:text-foreground">
                Asisten AI Edukasi Berakar Materi Nyata
              </h2>
              <p className="mt-3 text-sm text-muted-foreground sm:text-base leading-relaxed">
                GuruPro menerapkan arsitektur AI berbasis materi sumber rujukan yang ketat untuk menjamin konten bebas halusinasi dan sesuai standar kurikulum.
              </p>
            </div>

            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {/* AI Modul Ajar */}
              <div className="rounded-2xl border border-border/90 bg-card p-6 shadow-sm">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <FileText className="h-6 w-6" />
                </div>
                <h3 className="mt-5 font-display text-lg font-bold text-navy dark:text-foreground">
                  AI Modul Ajar
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                  Susun draf modul ajar terstruktur dari bahan rujukan nyata (CP/ATP, teks materi, dokumen, atau tautan daring). Dilengkapi validasi grounding faktual sebelum disimpan.
                </p>
                <ul className="mt-4 space-y-2 text-xs text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>Draf berstatus aman (Draft mode, tidak otomatis terbit)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>Verifikasi bukti rujukan faktual per bagian</span>
                  </li>
                </ul>
              </div>

              {/* AI Generator Soal */}
              <div className="rounded-2xl border border-border/90 bg-card p-6 shadow-sm">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15 text-accent">
                  <FileQuestion className="h-6 w-6" />
                </div>
                <h3 className="mt-5 font-display text-lg font-bold text-navy dark:text-foreground">
                  AI Generator Soal
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                  Hasilkan paket soal pilihan ganda dan esai yang relevan dengan topik pembelajaran secara instan, lengkap dengan kunci jawaban dan rubrik penilaian terstandarisasi.
                </p>
                <ul className="mt-4 space-y-2 text-xs text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-accent shrink-0" />
                    <span>Distribusi paket soal langsung ke kelas target</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-accent shrink-0" />
                    <span>Opsi telaah dan edit sebelum publikasi</span>
                  </li>
                </ul>
              </div>

              {/* AI Illustration Pipeline */}
              <div className="rounded-2xl border border-border/90 bg-card p-6 shadow-sm sm:col-span-2 lg:col-span-1">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky/20 text-navy dark:text-sky">
                  <ImageIcon className="h-6 w-6" />
                </div>
                <h3 className="mt-5 font-display text-lg font-bold text-navy dark:text-foreground">
                  AI Illustration Pipeline
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                  Integrasi generasi aset ilustrasi edukatif terverifikasi untuk memperkaya media ajar secara kontekstual sesuai materi modul yang diajarkan guru.
                </p>
                <ul className="mt-4 space-y-2 text-xs text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-sky shrink-0" />
                    <span>Quality gate evaluasi visual otomatis</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-sky shrink-0" />
                    <span>Manajemen aset ilustrasi per modul guru</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* 5. Simple Product Flow Section */}
        <section id="cara-kerja" className="border-t border-border/80 bg-muted/30 py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto">
              <h2 className="font-display text-2xl font-bold tracking-tight text-navy sm:text-3xl dark:text-foreground">
                Alur Kerja Terpadu GuruPro
              </h2>
              <p className="mt-3 text-sm text-muted-foreground sm:text-base leading-relaxed">
                Dari persiapan bahan ajar hingga pelaporan hasil belajar siswa dalam satu alur yang berkesinambungan.
              </p>
            </div>

            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {/* Langkah 1 */}
              <div className="relative rounded-2xl border border-border/80 bg-card p-6 transition-all hover:shadow-card">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    1
                  </div>
                  <h3 className="font-display text-base font-bold text-navy dark:text-foreground">
                    Materi Sumber
                  </h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Guru menyiapkan bahan ajar, capaian pembelajaran (CP/ATP), dokumen, atau referensi materi yang akan diajarkan.
                </p>
              </div>

              {/* Langkah 2 */}
              <div className="relative rounded-2xl border border-border/80 bg-card p-6 transition-all hover:shadow-card">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    2
                  </div>
                  <h3 className="font-display text-base font-bold text-navy dark:text-foreground">
                    Modul Ajar
                  </h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Susun draf modul ajar terstruktur dan telaah setiap bagian pembelajaran sebelum diterbitkan ke siswa.
                </p>
              </div>

              {/* Langkah 3 */}
              <div className="relative rounded-2xl border border-border/80 bg-card p-6 transition-all hover:shadow-card">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    3
                  </div>
                  <h3 className="font-display text-base font-bold text-navy dark:text-foreground">
                    Paket Soal
                  </h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Rancang instrumen evaluasi pembelajaran berupa paket soal latihan, kuis, atau asesmen sumatif.
                </p>
              </div>

              {/* Langkah 4 */}
              <div className="relative rounded-2xl border border-border/80 bg-card p-6 transition-all hover:shadow-card">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
                    4
                  </div>
                  <h3 className="font-display text-base font-bold text-navy dark:text-foreground">
                    Penugasan
                  </h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Distribusikan tugas langsung ke kelas tujuan dengan instruksi pengerjaan dan batas waktu yang jelas.
                </p>
              </div>

              {/* Langkah 5 */}
              <div className="relative rounded-2xl border border-border/80 bg-card p-6 transition-all hover:shadow-card">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
                    5
                  </div>
                  <h3 className="font-display text-base font-bold text-navy dark:text-foreground">
                    Siswa Mengerjakan
                  </h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Siswa mengakses portal penugasan, menyelesaikan latihan, dan mengunggah submisi tugas tepat waktu.
                </p>
              </div>

              {/* Langkah 6 */}
              <div className="relative rounded-2xl border border-border/80 bg-card p-6 transition-all hover:shadow-card">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
                    6
                  </div>
                  <h3 className="font-display text-base font-bold text-navy dark:text-foreground">
                    Penilaian & Rekap
                  </h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Guru memeriksa jawaban, memberikan nilai, membuka sesi remedial bila diperlukan, dan mengekspor rekapitulasi nilai.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 6. Target User Section */}
        <section id="sasaran" className="border-t border-border/80 bg-background py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary-soft px-3.5 py-1 text-xs font-semibold text-primary">
                  <GraduationCap className="h-3.5 w-3.5 text-accent" />
                  <span>Sasaran Pengguna</span>
                </div>
                <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-navy sm:text-4xl dark:text-foreground">
                  Didedikasikan Khusus untuk Guru SMA / SMK
                </h2>
                <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                  GuruPro membebaskan guru dari beban administrasi manual yang memakan waktu, sehingga guru dapat memusatkan energi sepenuhnya pada interaksi mendidik di kelas.
                </p>

                <div className="mt-8 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Check className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        Menyiapkan Materi Pembelajaran
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Penyusunan modul terstandarisasi fase E dan F Kurikulum Merdeka.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Check className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        Merancang Asesmen & Bank Soal
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Pembuatan paket soal latihan dan ujian dengan format rapi.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Check className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        Mengelola Tugas & Rombel Kelas
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Pengaturan kelas yang diampu dengan kode bergabung yang praktis.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Check className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        Meninjau Submisi & Evaluasi Siswa
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Pemberian umpan balik dan rekapitulasi nilai yang rapi dan siap unduh.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card visual preview */}
              <div className="rounded-2xl border border-border/80 bg-card p-8 shadow-card">
                <div className="flex items-center justify-between border-b border-border/60 pb-4">
                  <div className="flex items-center gap-2">
                    <Layers className="h-5 w-5 text-primary" />
                    <span className="font-display text-sm font-bold text-navy dark:text-foreground">
                      Ringkasan Administrasi Guru
                    </span>
                  </div>
                  <span className="rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-semibold text-success">
                    Aktif
                  </span>
                </div>
                <div className="mt-6 space-y-4">
                  <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">Modul Ajar Pembelajaran</span>
                      <span className="text-xs text-primary font-medium">Kurikulum Merdeka</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Tersusun lengkap dengan rincian materi, tujuan, dan alokasi waktu.
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">Asesmen & Bank Soal</span>
                      <span className="text-xs text-accent font-medium">Pilihan Ganda & Esai</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Siap didistribusikan ke rombongan belajar yang diampu guru.
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">Rekapitulasi Nilai & Remedial</span>
                      <span className="text-xs text-muted-foreground font-medium">Otomatisasi</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Pencatatan nilai terpadu per kelas dan semester berjalan.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 7. Bottom CTA Section */}
        <section className="border-t border-border/80 bg-navy text-navy-foreground py-16 sm:py-20">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Mulai Mengajar Lebih Efektif dengan GuruPro
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-navy-foreground/80 sm:text-base">
              Daftar sekarang untuk mengelola kelas dan kebutuhan administrasi mengajar Anda dalam satu sistem terpadu.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              <Button asChild size="lg" className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-lg sm:w-auto h-12 px-8">
                <Link to="/daftar">
                  Daftar Sekarang
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="w-full border-white/20 bg-transparent text-white hover:bg-white/10 sm:w-auto h-12 px-7"
              >
                <Link to="/login">Masuk ke Akun</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* 8. Footer */}
      <footer className="border-t border-border bg-card py-12 text-card-foreground">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <Link to="/" className="inline-block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded p-1">
                <GuruProLogo />
              </Link>
              <p className="mt-4 max-w-sm text-xs leading-relaxed text-muted-foreground sm:text-sm">
                Platform pembelajaran dan administrasi terpadu untuk guru SMA/SMK. Membantu guru fokus mengajar selagi kebutuhan administrasi terkelola rapi.
              </p>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                Navigasi
              </h3>
              <ul className="mt-3 space-y-2 text-xs sm:text-sm text-muted-foreground">
                <li>
                  <a href="#" className="hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded">
                    Beranda
                  </a>
                </li>
                <li>
                  <a href="#fitur" className="hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded">
                    Fitur Unggulan
                  </a>
                </li>
                <li>
                  <a href="#ai-fitur" className="hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded">
                    Fitur AI
                  </a>
                </li>
                <li>
                  <a href="#cara-kerja" className="hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded">
                    Cara Kerja
                  </a>
                </li>
                <li>
                  <a href="#sasaran" className="hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded">
                    Sasaran Guru
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                Autentikasi
              </h3>
              <ul className="mt-3 space-y-2 text-xs sm:text-sm text-muted-foreground">
                <li>
                  <Link to="/login" className="hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded">
                    Masuk ke Akun
                  </Link>
                </li>
                <li>
                  <Link to="/daftar" className="hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded">
                    Daftar Sekarang
                  </Link>
                </li>
                <li>
                  <Link to="/lupa-kata-sandi" className="hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded">
                    Lupa Kata Sandi
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 border-t border-border/80 pt-6 text-center">
            <p className="text-xs text-muted-foreground">
              © 2026 GuruPro. Semua hak dilindungi.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
