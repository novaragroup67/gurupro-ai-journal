import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles } from "lucide-react";

import { GuruProLogo } from "@/components/gurupro-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/landing")({
  head: () => ({
    meta: [
      { title: "GuruPro — Guru Fokus Mengajar, GuruPro Urus Adminnya" },
      {
        name: "description",
        content:
          "Platform administrasi pembelajaran cerdas untuk guru SMK. Susun modul, buat soal, dan kelola jurnal — dibantu AI.",
      },
      { property: "og:title", content: "GuruPro — Guru Fokus Mengajar, GuruPro Urus Adminnya" },
      {
        property: "og:description",
        content:
          "Platform administrasi pembelajaran cerdas untuk guru SMK. Susun modul, buat soal, dan kelola jurnal — dibantu AI.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background selection:bg-primary/20">
      {/* Navbar Publik */}
      <header className="sticky top-0 z-40 border-b bg-card/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/landing" className="flex items-center gap-2">
            <GuruProLogo />
          </Link>

          <nav className="flex items-center gap-2 sm:gap-3">
            <Button asChild variant="ghost" size="sm" className="font-medium text-navy hover:text-primary">
              <Link to="/login">Masuk</Link>
            </Button>
            <Button asChild size="sm" className="font-medium shadow-sm">
              <Link to="/daftar">Daftar</Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="relative overflow-hidden py-16 sm:py-24 lg:py-32">
          {/* Subtle background glow decorative circle */}
          <div className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[380px] w-[600px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />

          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary-soft px-3.5 py-1 text-xs font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              <span>Platform Cerdas Guru SMK</span>
            </div>

            <h1 className="mt-6 font-display text-4xl font-extrabold tracking-tight text-navy sm:text-5xl lg:text-6xl">
              Guru Fokus Mengajar, <br className="hidden sm:inline" />
              <span className="text-brand-gradient">GuruPro Urus Adminnya.</span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Platform administrasi pembelajaran cerdas untuk guru SMK. Susun modul, buat soal, dan kelola
              kelas — dibantu AI.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              <Button asChild size="lg" className="w-full font-semibold shadow-md sm:w-auto">
                <Link to="/daftar">
                  Daftar Sekarang
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="w-full border-navy/20 font-semibold text-navy hover:bg-navy/5 sm:w-auto">
                <Link to="/login">Masuk</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Fitur Section (3 Kartu) */}
        <section className="border-t bg-muted/40 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <h2 className="font-display text-2xl font-bold tracking-tight text-navy sm:text-3xl">
                Fitur Unggulan GuruPro
              </h2>
              <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                Otomatisasi kebutuhan administrasi mengajar Anda dalam hitungan detik.
              </p>
            </div>

            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {/* Kartu 1 */}
              <Card className="border border-border/80 bg-card transition-all hover:-translate-y-1 hover:shadow-lift">
                <CardContent className="p-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-2xl text-primary">
                    <span>📚</span>
                  </div>
                  <h3 className="mt-5 font-display text-lg font-bold text-navy">Modul Ajar AI</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Susun modul ajar dari CP/ATP, eBook, atau link materi secara otomatis.
                  </p>
                </CardContent>
              </Card>

              {/* Kartu 2 */}
              <Card className="border border-border/80 bg-card transition-all hover:-translate-y-1 hover:shadow-lift">
                <CardContent className="p-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-2xl text-accent">
                    <span>📝</span>
                  </div>
                  <h3 className="mt-5 font-display text-lg font-bold text-navy">Generator Soal</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Buat soal pilihan ganda dan esai dalam hitungan detik dari topik apapun.
                  </p>
                </CardContent>
              </Card>

              {/* Kartu 3 */}
              <Card className="border border-border/80 bg-card transition-all hover:-translate-y-1 hover:shadow-lift">
                <CardContent className="p-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-2xl text-primary">
                    <span>👥</span>
                  </div>
                  <h3 className="mt-5 font-display text-lg font-bold text-navy">Kelola Kelas</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Bagi kode atau link undangan kelas, dan kelola siswa yang bergabung dengan mudah.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>

      {/* Footer Simpel */}
      <footer className="border-t bg-card py-6">
        <div className="mx-auto max-w-6xl px-4 text-center sm:px-6 lg:px-8">
          <p className="text-xs text-muted-foreground sm:text-sm">
            © 2025 GuruPro. Semua hak dilindungi.
          </p>
        </div>
      </footer>
    </div>
  );
}
