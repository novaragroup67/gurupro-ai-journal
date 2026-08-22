import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  FileQuestion,
  GraduationCap,
  Sparkles,
  Users,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NOTIFIKASI } from "@/lib/notifications";
import { useModuls } from "@/lib/modul-store";
import { usePaketSoal } from "@/lib/soal-store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard Guru — GuruPro" },
      {
        name: "description",
        content:
          "Pantau modul aktif, tugas masuk, progres penilaian, dan kelas yang Anda ampu dari satu dashboard GuruPro.",
      },
      { property: "og:title", content: "Dashboard Guru — GuruPro" },
      {
        property: "og:description",
        content: "Pantau modul aktif, tugas masuk, dan progres penilaian dari satu dashboard.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const TUGAS_KOREKSI = [
  { kelas: "XI IPA 1", tugas: "Sistem Persamaan Linear", terkumpul: "28/30", status: "Perlu Dikoreksi" },
  { kelas: "X IPA 3", tugas: "Trigonometri — Latihan 2", terkumpul: "30/32", status: "Sebagian Dinilai" },
  { kelas: "XI IPA 2", tugas: "Turunan Fungsi", terkumpul: "25/29", status: "Perlu Dikoreksi" },
  { kelas: "X IPA 3", tugas: "Kuis Perbandingan Sudut", terkumpul: "32/32", status: "Selesai Dinilai" },
];

const statusStyle = (status: string) =>
  status === "Selesai Dinilai"
    ? "bg-primary-soft text-primary"
    : status === "Sebagian Dinilai"
      ? "bg-secondary text-secondary-foreground"
      : "bg-accent-soft text-accent-foreground";

function Dashboard() {
  const moduls = useModuls();
  const pakets = usePaketSoal();

  const modulAktif = moduls.filter((m) => m.status === "Terbit").length || 2;
  const soalTerbit = pakets.filter((p) => p.status === "Terbit").length;

  const stats = [
    { label: "Modul Aktif", value: String(modulAktif), icon: BookOpen, hint: `${moduls.length} modul tersimpan`, to: "/modul-ajar" as const },
    { label: "Tugas Masuk", value: "27", icon: ClipboardList, hint: "Dari 3 kelas minggu ini", to: "/penugasan" as const },
    { label: "Sudah Dinilai", value: "92%", icon: CheckCircle2, hint: "Progres penilaian", to: "/penilaian" as const },
    { label: "Kelas Diampu", value: "3", icon: Users, hint: "X IPA 3, XI IPA 1, XI IPA 2", to: "/penilaian" as const },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Selamat datang kembali 👋"
        subtitle="Kelola administrasi pembelajaran dengan lebih mudah bersama GuruPro."
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/soal">
                <FileQuestion className="h-4 w-4" />
                Buat Soal
              </Link>
            </Button>
            <Button asChild>
              <Link to="/modul-ajar">
                <Sparkles className="h-4 w-4" />
                Susun Modul dengan AI
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="transition-shadow hover:shadow-lift">
            <Link to={s.to} className="block">
              <CardContent className="flex items-start gap-3 p-5">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                  <s.icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-display text-2xl font-bold leading-tight text-navy">{s.value}</p>
                  <p className="text-sm font-medium">{s.label}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{s.hint}</p>
                </div>
              </CardContent>
            </Link>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="font-display text-base text-navy">Tugas Perlu Dikoreksi</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/penilaian">
                Lihat semua
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="px-0 pb-2 sm:px-6 sm:pb-6">
            {/* Mobile: cards; Desktop: table */}
            <div className="grid gap-3 px-4 sm:hidden">
              {TUGAS_KOREKSI.map((t) => (
                <div key={t.kelas + t.tugas} className="rounded-xl border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{t.kelas}</span>
                    <Badge variant="secondary" className={statusStyle(t.status)}>
                      {t.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{t.tugas}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Terkumpul {t.terkumpul}</p>
                </div>
              ))}
            </div>
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kelas</TableHead>
                    <TableHead>Tugas</TableHead>
                    <TableHead>Terkumpul</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {TUGAS_KOREKSI.map((t) => (
                    <TableRow key={t.kelas + t.tugas}>
                      <TableCell className="font-medium">{t.kelas}</TableCell>
                      <TableCell className="max-w-[16rem] truncate">{t.tugas}</TableCell>
                      <TableCell>{t.terkumpul}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary" className={statusStyle(t.status)}>
                          {t.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-base text-navy">Notifikasi</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 pt-0">
              {NOTIFIKASI.map((n) => (
                <div key={n.id} className="rounded-xl border p-3">
                  <p className="text-sm font-semibold">{n.judul}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{n.detail}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground/80">{n.waktu}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-navy text-navy-foreground">
            <CardContent className="grid gap-3 p-5">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                GuruPro AI
              </span>
              <p className="font-display text-lg font-semibold">
                Susun modul dibantu AI dari berbagai sumber, edit, lalu publikasikan.
              </p>
              <p className="text-sm text-navy-foreground/75">
                {soalTerbit} paket soal siap diterbitkan sebagai tugas.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="secondary">
                  <Link to="/modul-ajar">
                    <BookOpen className="h-4 w-4" />
                    Modul Ajar
                  </Link>
                </Button>
                <Button asChild size="sm" variant="secondary">
                  <Link to="/soal">
                    <GraduationCap className="h-4 w-4" />
                    Bank Soal
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
