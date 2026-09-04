import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  FileQuestion,
  Link2,
  Presentation,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { GuruProLogo } from "@/components/gurupro-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GuruPro — Guru Fokus Mengajar, GuruPro Urus Adminnya" },
      {
        name: "description",
        content:
          "GuruPro membantu guru SMK menyusun modul ajar dan bank soal berbantuan AI dari link, dokumen, atau CP/ATP. Daftar gratis dan mulai hari ini.",
      },
      { property: "og:title", content: "GuruPro — Guru Fokus Mengajar, GuruPro Urus Adminnya" },
      {
        property: "og:description",
        content:
          "Susun modul ajar dan soal berbantuan AI dari sumber materi Anda sendiri. Cepat, rapi, dan siap dipakai di kelas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

const FITUR = [
  {
    icon: Link2,
    judul: "Modul dari Link Materi",
    isi: "Tempel link sumber, GuruPro membaca isi halamannya, lalu menyusun modul berdasar isi tersebut — bukan karangan.",
  },
  {
    icon: BookOpen,
    judul: "Modul Ajar Terstruktur",
    isi: "Ringkasan, tujuan pembelajaran, bab, poin kunci, penjelasan, dan kesimpulan yang bisa Anda edit bebas.",
  },
  {
    icon: FileQuestion,
    judul: "Bank Soal Berbantuan AI",
    isi: "Buat soal pilihan ganda atau esai dari modul Anda, revisi dengan instruksi singkat, lalu simpan ke bank soal.",
  },
  {
    icon: Presentation,
    judul: "Ilustrasi & PPT Otomatis",
    isi: "Lengkapi modul dengan ilustrasi dan slide presentasi, lalu unduh sebagai PDF, Word, atau PPT.",
  },
];

const LANGKAH = [
  "Daftar akun guru GuruPro secara gratis.",
  "Masukkan sumber materi: link, dokumen, teks, atau CP/ATP.",
  "Periksa pratinjau sumber, lalu susun modul dengan AI.",
  "Buat soal dari modul dan simpan ke bank soal Anda.",
];

function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-card/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          <GuruProLogo />
          <nav className="ml-auto flex items-center gap-2">
            <Button asChild variant="ghost">
              <Link to="/auth" search={{ mode: "login" }}>
                Login
              </Link>
            </Button>
            <Button asChild>
              <Link to="/auth" search={{ mode: "daftar" }}>
                Daftar Sekarang
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-20">
          <div className="grid gap-5">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Untuk guru SMK
            </span>
            <h1 className="font-display text-4xl font-bold leading-tight text-navy sm:text-5xl">
              Guru fokus mengajar,{" "}
              <span className="text-primary">GuruPro urus adminnya.</span>
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
              GuruPro menyusun modul ajar dan soal dari sumber materi Anda sendiri dengan bantuan AI.
              Hemat waktu administrasi, tetap akurat karena selalu berdasar isi sumber.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/auth" search={{ mode: "daftar" }}>
                  Daftar Sekarang
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/auth" search={{ mode: "login" }}>
                  Login
                </Link>
              </Button>
            </div>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Data modul dan soal Anda tersimpan aman di akun Anda sendiri.
            </p>
          </div>

          <Card className="overflow-hidden">
            <div className="bg-navy px-6 py-5 text-navy-foreground">
              <p className="font-display text-sm font-semibold">Alur kerja GuruPro</p>
              <p className="mt-1 text-xs text-navy-foreground/70">
                Dari sumber materi sampai modul dan soal siap pakai.
              </p>
            </div>
            <CardContent className="grid gap-4 p-6">
              {LANGKAH.map((langkah, i) => (
                <div key={langkah} className="flex gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-bold text-primary">
                    {i + 1}
                  </span>
                  <p className="text-sm leading-relaxed text-muted-foreground">{langkah}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <section className="border-y bg-muted/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
            <h2 className="font-display text-2xl font-bold text-navy sm:text-3xl">
              Yang bisa Anda kerjakan sekarang
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Fokus rilis ini: modul ajar berbantuan AI dan bank soal. Fitur penugasan dan penilaian
              menyusul.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {FITUR.map((f) => (
                <Card key={f.judul}>
                  <CardContent className="grid gap-2 p-5">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
                      <f.icon className="h-5 w-5" />
                    </span>
                    <h3 className="font-display text-base font-semibold text-navy">{f.judul}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">{f.isi}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
          <Card className="overflow-hidden bg-navy text-navy-foreground">
            <CardContent className="grid gap-4 p-8 sm:p-10">
              <h2 className="font-display text-2xl font-bold sm:text-3xl">
                Siap mengurangi beban administrasi?
              </h2>
              <p className="max-w-xl text-sm text-navy-foreground/75">
                Buat akun guru GuruPro, susun modul pertama Anda dari link materi, dan lanjutkan ke
                pembuatan soal dalam beberapa menit.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link to="/auth" search={{ mode: "daftar" }}>
                    Daftar Sekarang
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="border-navy-foreground/30 bg-transparent text-navy-foreground hover:bg-navy-foreground/10"
                >
                  <Link to="/auth" search={{ mode: "login" }}>
                    Sudah punya akun? Login
                  </Link>
                </Button>
              </div>
              <ul className="mt-2 grid gap-2 text-sm text-navy-foreground/80">
                {["Gratis untuk dicoba", "Tanpa instalasi", "Bisa dipakai di ponsel"].map((i) => (
                  <li key={i} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" />
                    {i}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:px-6">
          <p>© {new Date().getFullYear()} GuruPro. Guru fokus mengajar, GuruPro urus adminnya.</p>
          <Link to="/auth" search={{ mode: "login" }} className="sm:ml-auto hover:text-primary">
            Masuk ke akun guru
          </Link>
        </div>
      </footer>
    </div>
  );
}
