import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileQuestion,
  GraduationCap,
  Loader2,
  Plus,
  School,
  Sparkles,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/lib/auth-store";
import { ajukanGabung, getKelasBySiswa } from "@/lib/kelas-store";
import { useModuls } from "@/lib/modul-store";
import { NOTIFIKASI } from "@/lib/notifications";
import { usePaketSoal } from "@/lib/soal-store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — GuruPro" },
      {
        name: "description",
        content: "Platform pembelajaran dan administrasi GuruPro.",
      },
    ],
  }),
  component: DashboardSwitcher,
});

function DashboardSwitcher() {
  const { profile } = useAuth();

  if (profile.role === "siswa") {
    return <StudentDashboard />;
  }

  return <TeacherDashboard />;
}

// ==================== DASHBOARD SISWA ====================

interface StudentKelasItem {
  anggotaId: string;
  kelasId: string;
  namaKelas: string;
  tingkat: string;
  mapel: string;
  tahunAjaran: string;
  status: "menunggu" | "aktif" | "ditolak";
  diajukan: string;
}

function StudentDashboard() {
  const { profile, user } = useAuth();
  const [kelasList, setKelasList] = useState<StudentKelasItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog Gabung Kelas State
  const [openModal, setOpenModal] = useState(false);
  const [kodeKelasInput, setKodeKelasInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadClasses = async () => {
    const siswaId = user?.id || profile.id;
    if (!siswaId) return;
    setLoading(true);
    try {
      const items = await getKelasBySiswa(siswaId);
      setKelasList(items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadClasses();
  }, [user?.id, profile.id]);

  const handleGabungSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKode = kodeKelasInput.trim();
    if (!cleanKode) {
      setErrorMessage("Kode kelas wajib diisi.");
      return;
    }

    const siswaId = user?.id || profile.id;
    if (!siswaId) {
      toast.error("Sesi tidak valid. Silakan masuk kembali.");
      return;
    }

    setSubmitting(true);
    setErrorMessage("");

    try {
      const result = await ajukanGabung({
        kodeKelas: cleanKode,
        siswaId,
        siswaEmail: profile.email,
        siswaNama: profile.nama,
        siswaNisn: profile.nip,
        jenis: "tambah-kelas",
      });

      if (!result.ok) {
        setErrorMessage(result.message);
        toast.error(result.message);
        return;
      }

      toast.success(
        `Permintaan bergabung ke kelas ${result.kelas.tingkat} ${result.kelas.namaKelas} (${result.kelas.mapel}) berhasil diajukan!`,
      );
      setKodeKelasInput("");
      setOpenModal(false);
      await loadClasses();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal bergabung ke kelas.";
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const activeCount = kelasList.filter((k) => k.status === "aktif").length;
  const pendingCount = kelasList.filter((k) => k.status === "menunggu").length;

  return (
    <div className="grid gap-6">
      <PageHeader
        title={`Halo, ${profile.nama || "Siswa"} 🎓`}
        subtitle="Selamat datang di ruang pembelajaran GuruPro. Pantau kelas dan tugas belajarmu di sini."
        actions={
          <Dialog open={openModal} onOpenChange={setOpenModal}>
            <DialogTrigger asChild>
              <Button className="gap-2 shadow-sm">
                <Plus className="h-4 w-4" />
                Gabung Kelas
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <form onSubmit={handleGabungSubmit}>
                <DialogHeader>
                  <DialogTitle className="font-display text-navy">Gabung ke Kelas</DialogTitle>
                  <DialogDescription>
                    Masukkan kode kelas unik (misal: <code>XI-MTK-8F3K</code>) yang kamu dapatkan
                    dari bapak/ibu guru.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="kodeKelas">Masukkan Kode Kelas</Label>
                    <Input
                      id="kodeKelas"
                      placeholder="Contoh: XI-MTK-8F3K"
                      value={kodeKelasInput}
                      onChange={(e) => {
                        setKodeKelasInput(e.target.value.toUpperCase());
                        setErrorMessage("");
                      }}
                      className="font-mono uppercase tracking-wider"
                      autoFocus
                    />
                    {errorMessage ? (
                      <p className="text-xs text-destructive">{errorMessage}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Kode kelas tidak peka huruf besar/kecil.
                      </p>
                    )}
                  </div>
                </div>
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOpenModal(false)}
                    disabled={submitting}
                  >
                    Batal
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {submitting ? "Memeriksa Kode…" : "Gabung Kelas"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Stats Cards untuk Siswa */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="transition-shadow hover:shadow-lift">
          <CardContent className="flex items-start gap-3 p-5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
              <BookOpen className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="font-display text-2xl font-bold leading-tight text-navy">
                {activeCount}
              </p>
              <p className="text-sm font-medium">Kelas Aktif</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">Kelas terdaftar</p>
            </div>
          </CardContent>
        </Card>

        <Card className="transition-shadow hover:shadow-lift">
          <CardContent className="flex items-start gap-3 p-5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
              <Clock className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="font-display text-2xl font-bold leading-tight text-navy">
                {pendingCount}
              </p>
              <p className="text-sm font-medium">Menunggu Verifikasi</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">Permohonan diajukan</p>
            </div>
          </CardContent>
        </Card>

        <Card className="transition-shadow hover:shadow-lift">
          <CardContent className="flex items-start gap-3 p-5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
              <School className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="font-display text-lg font-bold leading-tight text-navy truncate">
                {profile.sekolah || "Sekolah"}
              </p>
              <p className="text-sm font-medium">Jenjang: {profile.kelas || "XI"}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                NISN: {profile.nip || "—"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabel Kelas Siswa */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-3">
          <div>
            <CardTitle className="font-display text-base text-navy">Daftar Kelas Pembelajaran</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Kelas yang kamu ikuti atau sedang dalam proses verifikasi guru pengampu.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setOpenModal(true)} className="gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" />
            Masukkan Kode
          </Button>
        </CardHeader>
        <CardContent className="px-0 pb-2 sm:px-6 sm:pb-6">
          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
              <p className="mt-2">Memuat daftar kelas…</p>
            </div>
          ) : kelasList.length === 0 ? (
            <div className="py-12 text-center">
              <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p className="mt-2 font-display text-base font-semibold text-navy">
                Kamu belum bergabung ke kelas mana pun
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Minta kode kelas kepada bapak/ibu gurumu, lalu klik tombol di bawah untuk bergabung.
              </p>
              <Button
                size="sm"
                className="mt-4 gap-1.5 font-medium"
                onClick={() => setOpenModal(true)}
              >
                <Plus className="h-4 w-4" />
                Gabung Kelas Sekarang
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama Kelas</TableHead>
                    <TableHead>Tingkat</TableHead>
                    <TableHead>Mata Pelajaran</TableHead>
                    <TableHead>Tahun Ajaran</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {kelasList.map((k) => (
                    <TableRow key={k.anggotaId}>
                      <TableCell className="font-semibold text-navy">
                        {k.namaKelas}
                      </TableCell>
                      <TableCell>{k.tingkat}</TableCell>
                      <TableCell>{k.mapel}</TableCell>
                      <TableCell>{k.tahunAjaran}</TableCell>
                      <TableCell className="text-right">
                        {k.status === "aktif" ? (
                          <Badge className="bg-emerald-600 hover:bg-emerald-700">
                            Aktif
                          </Badge>
                        ) : k.status === "menunggu" ? (
                          <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                            Menunggu Verifikasi
                          </Badge>
                        ) : (
                          <Badge variant="destructive">Ditolak</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== DASHBOARD GURU (EXISTING) ====================

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

function TeacherDashboard() {
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
