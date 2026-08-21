import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowUpRight,
  BookOpenCheck,
  ClipboardList,
  GraduationCap,
  NotebookPen,
  Plus,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useJournals } from "@/lib/journal-store";
import { formatTanggal } from "@/lib/journal-types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard Guru — GuruPro" },
      {
        name: "description",
        content:
          "Pantau jurnal mengajar, jumlah siswa, tugas aktif, dan rata-rata nilai dalam satu dashboard GuruPro.",
      },
      { property: "og:title", content: "Dashboard Guru — GuruPro" },
      {
        property: "og:description",
        content: "Kelola administrasi pembelajaran dengan lebih mudah bersama GuruPro.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function isThisWeek(iso: string) {
  const date = new Date(iso + "T00:00:00");
  const now = new Date();
  const monday = new Date(now);
  const day = (now.getDay() + 6) % 7;
  monday.setDate(now.getDate() - day);
  monday.setHours(0, 0, 0, 0);
  return date >= monday;
}

function Dashboard() {
  const journals = useJournals();
  const weekly = journals.filter((j) => isThisWeek(j.tanggal)).length;

  const stats: Array<{
    label: string;
    value: string;
    hint: string;
    icon: LucideIcon;
    tone: string;
  }> = [
    {
      label: "Jurnal Minggu Ini",
      value: String(weekly),
      hint: `${journals.length} jurnal tersimpan`,
      icon: NotebookPen,
      tone: "bg-primary-soft text-primary",
    },
    {
      label: "Total Siswa",
      value: "128",
      hint: "4 kelas aktif",
      icon: Users,
      tone: "bg-accent-soft text-accent-foreground",
    },
    {
      label: "Tugas Aktif",
      value: "6",
      hint: "2 menunggu penilaian",
      icon: ClipboardList,
      tone: "bg-secondary text-navy",
    },
    {
      label: "Rata-rata Nilai",
      value: "85,4",
      hint: "+2,1 dari bulan lalu",
      icon: TrendingUp,
      tone: "bg-success/12 text-success",
    },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Selamat datang kembali 👋"
        subtitle="Kelola administrasi pembelajaran dengan lebih mudah bersama GuruPro."
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="shadow-card">
            <CardContent className="p-5">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-muted-foreground">{stat.label}</p>
                  <p className="mt-2 font-display text-3xl font-bold text-navy">{stat.value}</p>
                </div>
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${stat.tone}`}>
                  <stat.icon className="h-5 w-5" />
                </span>
              </div>
              <p className="mt-3 truncate text-xs text-muted-foreground">{stat.hint}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden border-0 bg-brand-gradient lg:col-span-2">
          <CardContent className="grid gap-5 p-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0">
              <Badge className="mb-3 gap-1 bg-accent text-accent-foreground hover:bg-accent">
                <Sparkles className="h-3 w-3" />
                GuruPro AI
              </Badge>
              <h2 className="font-display text-xl font-bold text-navy-foreground sm:text-2xl">
                Guru fokus mengajar, GuruPro urus adminnya.
              </h2>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-navy-foreground/80">
                Susun jurnal mengajar lengkap — kegiatan, penilaian, refleksi, hingga tindak lanjut —
                hanya dari materi yang Anda ajarkan hari ini.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 sm:flex-col">
              <Button asChild size="lg" className="bg-card text-navy hover:bg-card/90">
                <Link to="/jurnal/ai">
                  <Sparkles className="h-4 w-4" />
                  Generate Jurnal dengan AI
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-navy-foreground/30 bg-transparent text-navy-foreground hover:bg-navy-foreground/10 hover:text-navy-foreground"
              >
                <Link to="/jurnal/create">
                  <Plus className="h-4 w-4" />
                  Buat Jurnal
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aksi Cepat</CardTitle>
            <CardDescription>Pintasan yang paling sering Anda gunakan.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <QuickLink to="/jurnal" icon={NotebookPen} label="Lihat Jurnal Mengajar" />
            <QuickLink to="/modul-ajar" icon={BookOpenCheck} label="Modul Ajar" />
            <QuickLink to="/penilaian" icon={GraduationCap} label="Penilaian Siswa" />
            <QuickLink to="/penugasan" icon={ClipboardList} label="Penugasan" />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold text-navy">Jurnal Terbaru</h2>
            <p className="text-sm text-muted-foreground">Klik jurnal untuk melihat detail lengkap.</p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/jurnal">
              Semua jurnal
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {journals.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <NotebookPen className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Belum ada jurnal. Mulai dengan membuat jurnal pertama Anda.
              </p>
              <Button asChild>
                <Link to="/jurnal/create">
                  <Plus className="h-4 w-4" />
                  Buat Jurnal
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {journals.slice(0, 4).map((journal) => (
              <Link
                key={journal.id}
                to="/jurnal/$id"
                params={{ id: journal.id }}
                className="block rounded-xl border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-card"
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-display font-semibold text-navy">{journal.materi}</p>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {journal.mataPelajaran} · {journal.kelas} · {formatTanggal(journal.tanggal)}
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className={
                      journal.source === "AI"
                        ? "gap-1 bg-accent-soft text-accent-foreground"
                        : "bg-secondary text-secondary-foreground"
                    }
                  >
                    {journal.source === "AI" ? <Sparkles className="h-3 w-3" /> : null}
                    {journal.source}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function QuickLink({
  to,
  icon: Icon,
  label,
}: {
  to: "/jurnal" | "/modul-ajar" | "/penilaian" | "/penugasan";
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-lg border border-transparent bg-muted/60 px-3 py-2.5 text-sm font-medium transition-colors hover:border-primary/30 hover:bg-primary-soft"
    >
      <Icon className="h-4 w-4 shrink-0 text-primary" />
      <span className="min-w-0 truncate">{label}</span>
      <ArrowUpRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
