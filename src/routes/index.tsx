import { Link, createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  Award,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  Eye,
  FileQuestion,
  GraduationCap,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  School,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getAdminStats,
  getSystemLogs,
  getTeachersList,
  updateTeacherVerification,
  type AdminStats,
  type SystemLogItem,
  type TeacherAdminItem,
} from "@/lib/admin-store";
import { useAuth } from "@/lib/auth-store";
import { ajukanGabung, getKelasBySiswa, useKelas } from "@/lib/kelas-store";
import { getPublishedModulsForSiswa, useModuls } from "@/lib/modul-store";
import { formatTanggal, type Modul } from "@/lib/modul-types";
import {
  getMyGradedSubmissions,
  getTeacherSubmissionsSummary,
} from "@/lib/pengumpulan-store";
import {
  refreshPenugasanGuru,
  refreshPenugasanSiswa,
  usePenugasanGuru,
  type Penugasan,
} from "@/lib/penugasan-store";
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
  const { profile, ready } = useAuth();

  if (!ready) {
    return (
      <div className="grid min-h-[50vh] place-items-center text-sm text-muted-foreground">
        Memuat dashboard…
      </div>
    );
  }

  if (profile.role === "admin") {
    return <AdminDashboard />;
  }

  if (profile.role === "siswa") {
    return <StudentDashboard />;
  }

  if (profile.role === "guru") {
    return <TeacherDashboard />;
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Users className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">Peran Akun Belum Terdaftar</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Akun Anda belum memiliki peran aktif (Guru atau Siswa) yang valid. Untuk menjaga keamanan
          sistem, akses fitur Guru tidak diberikan secara otomatis.
        </p>
        <div className="pt-2 flex justify-center gap-3">
          <Button asChild variant="default">
            <Link to="/profil">Lengkapi Profil Saya</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

// ==================== DASHBOARD SISWA (REAL DATA) ====================

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

interface GradedSubmissionItem {
  penugasanId: string;
  nilaiAkhir: number | null;
  nilaiPg: number | null;
  nilaiEssay: number | null;
  catatanGuru: string | null;
  gradedAt: string | null;
}

function StudentDashboard() {
  const { profile, user } = useAuth();
  const [kelasList, setKelasList] = useState<StudentKelasItem[]>([]);
  const [assignments, setAssignments] = useState<Penugasan[]>([]);
  const [gradedList, setGradedList] = useState<GradedSubmissionItem[]>([]);
  const [availableModuls, setAvailableModuls] = useState<Modul[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog Gabung Kelas State
  const [openModal, setOpenModal] = useState(false);
  const [kodeKelasInput, setKodeKelasInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadData = async () => {
    const siswaId = user?.id || profile.id;
    if (!siswaId) return;
    setLoading(true);
    try {
      const [kList, aList, gList, mList] = await Promise.all([
        getKelasBySiswa(siswaId),
        refreshPenugasanSiswa(),
        getMyGradedSubmissions(),
        getPublishedModulsForSiswa(),
      ]);
      setKelasList(kList);
      setAssignments(aList);
      setGradedList(gList);
      setAvailableModuls(mList);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
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
        siswaNisn: profile.nisn || profile.nip,
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
      await loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal bergabung ke kelas.";
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const activeClasses = kelasList.filter((k) => k.status === "aktif");
  const pendingClasses = kelasList.filter((k) => k.status === "menunggu");
  const activeAssignments = assignments.filter((a) => a.status === "published");

  // Cari tenggat terdekat yang belum lewat
  const nearestDeadlineAssignment = useMemo(() => {
    const now = new Date().getTime();
    const withFutureDeadline = activeAssignments
      .filter((a) => a.deadline && new Date(a.deadline).getTime() > now)
      .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime());
    return withFutureDeadline[0] || null;
  }, [activeAssignments]);

  const nearestRemainingDays = useMemo(() => {
    if (!nearestDeadlineAssignment?.deadline) return null;
    const diffMs = new Date(nearestDeadlineAssignment.deadline).getTime() - new Date().getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return diffDays;
  }, [nearestDeadlineAssignment]);

  return (
    <div className="grid gap-6">
      <PageHeader
        title={`Halo, ${profile.nama || "Siswa"} 🎓`}
        subtitle="Selamat datang di ruang pembelajaran GuruPro. Pantau kelas, modul materi, dan tugas belajarmu di sini."
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

      {/* Banner Tenggat Tugas Terdekat jika ada */}
      {nearestDeadlineAssignment && (
        <Card className="border-amber-500/30 bg-amber-500/10 shadow-xs">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-xs">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-amber-100 text-amber-900 border-amber-300">
                    Tenggat Terdekat
                  </Badge>
                  {nearestRemainingDays !== null && (
                    <span className="text-xs font-semibold text-amber-800">
                      {nearestRemainingDays <= 1
                        ? "Hari ini / Besok!"
                        : `${nearestRemainingDays} hari lagi`}
                    </span>
                  )}
                </div>
                <p className="mt-1 font-display font-semibold text-navy">
                  {nearestDeadlineAssignment.judul}
                </p>
                <p className="text-xs text-muted-foreground">
                  {nearestDeadlineAssignment.kelasNama} · Batas:{" "}
                  {formatTanggal(nearestDeadlineAssignment.deadline!)}
                </p>
              </div>
            </div>
            <Button asChild size="sm" className="gap-1.5 shrink-0 font-medium">
              <Link to="/penugasan">
                Kerjakan Tugas
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards untuk Siswa (100% Real Supabase Data) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="transition-shadow hover:shadow-lift">
          <CardContent className="flex items-start gap-3 p-5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
              <School className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="font-display text-2xl font-bold leading-tight text-navy">
                {activeClasses.length}
              </p>
              <p className="text-sm font-medium">Kelas Diikuti</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {pendingClasses.length > 0
                  ? `${pendingClasses.length} menunggu persetujuan`
                  : "Status aktif"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="transition-shadow hover:shadow-lift">
          <Link to="/penugasan" className="block">
            <CardContent className="flex items-start gap-3 p-5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                <ClipboardList className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="font-display text-2xl font-bold leading-tight text-navy">
                  {activeAssignments.length}
                </p>
                <p className="text-sm font-medium">Tugas Aktif</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {activeAssignments.length > 0 ? "Tersedia dikerjakan" : "Tidak ada tugas baru"}
                </p>
              </div>
            </CardContent>
          </Link>
        </Card>

        <Card className="transition-shadow hover:shadow-lift">
          <Link to="/penilaian" className="block">
            <CardContent className="flex items-start gap-3 p-5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                <Award className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="font-display text-2xl font-bold leading-tight text-navy">
                  {gradedList.length}
                </p>
                <p className="text-sm font-medium">Tugas Dinilai</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {gradedList.length > 0 ? "Nilai telah dirilis guru" : "Belum ada nilai"}
                </p>
              </div>
            </CardContent>
          </Link>
        </Card>

        <Card className="transition-shadow hover:shadow-lift">
          <Link to="/modul-ajar" className="block">
            <CardContent className="flex items-start gap-3 p-5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                <BookOpen className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="font-display text-2xl font-bold leading-tight text-navy">
                  {availableModuls.length}
                </p>
                <p className="text-sm font-medium">Modul Belajar</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {availableModuls.length > 0 ? "Modul siap dipelajari" : "Belum ada modul terbit"}
                </p>
              </div>
            </CardContent>
          </Link>
        </Card>
      </div>

      {/* Bagian Modul Ajar Tersedia untuk Siswa (Read-Only) */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-3">
          <div>
            <CardTitle className="font-display text-base text-navy">
              Modul Pembelajaran Tersedia
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Materi pembelajaran yang telah diterbitkan oleh guru pengampu untuk kelasmu.
            </p>
          </div>
          <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
            <Link to="/modul-ajar">
              Lihat Semua Modul
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {availableModuls.length === 0 ? (
            <div className="py-8 text-center">
              <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/30" />
              <p className="mt-2 text-sm font-medium text-navy">
                Belum Ada Modul Ajar yang Diterbitkan
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Bapak/ibu guru di kelasmu belum menerbitkan modul. Modul baru akan muncul otomatis
                di sini saat dirilis.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {availableModuls.slice(0, 3).map((m) => (
                <div
                  key={m.id}
                  className="rounded-xl border p-4 transition-all hover:border-primary/40 hover:shadow-xs flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <Badge variant="outline" className="font-semibold text-primary">
                        {m.mapel}
                      </Badge>
                      <span className="text-muted-foreground text-[11px]">{m.kelas}</span>
                    </div>
                    <h4 className="font-display font-semibold text-navy line-clamp-2">{m.judul}</h4>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {m.ringkasan || "Rangkuman materi siap dipelajari."}
                    </p>
                  </div>
                  <div className="pt-3 mt-2 border-t flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{formatTanggal(m.updatedAt)}</span>
                    <Button asChild size="sm" variant="outline" className="h-7 text-xs gap-1">
                      <Link to="/modul-ajar">
                        <Eye className="h-3.5 w-3.5" />
                        Buka
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabel Kelas Siswa */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-3">
          <div>
            <CardTitle className="font-display text-base text-navy">
              Daftar Kelas Pembelajaran
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Kelas yang kamu ikuti atau sedang dalam proses verifikasi guru pengampu.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpenModal(true)}
            className="gap-1.5 text-xs"
          >
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
              <School className="mx-auto h-8 w-8 text-muted-foreground/40" />
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
                      <TableCell className="font-semibold text-navy">{k.namaKelas}</TableCell>
                      <TableCell>{k.tingkat}</TableCell>
                      <TableCell>{k.mapel}</TableCell>
                      <TableCell>{k.tahunAjaran}</TableCell>
                      <TableCell className="text-right">
                        {k.status === "aktif" ? (
                          <Badge className="bg-emerald-600 hover:bg-emerald-700">Aktif</Badge>
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

// ==================== DASHBOARD GURU (100% REAL SUPABASE DATA) ====================

function TeacherDashboard() {
  const { user, profile } = useAuth();
  const moduls = useModuls();
  const pakets = usePaketSoal();
  const { kelasList, anggotaList } = useKelas();
  const { penugasanList: assignments } = usePenugasanGuru();

  const [loadingSummary, setLoadingSummary] = useState(true);
  const [submissionSummary, setSubmissionSummary] = useState<{
    totalSubmitted: number;
    perluDinilai: number;
    sudahDinilai: number;
    submissionsPerPenugasan: Record<
      string,
      { submitted: number; perluDinilai: number; dinilai: number }
    >;
  }>({
    totalSubmitted: 0,
    perluDinilai: 0,
    sudahDinilai: 0,
    submissionsPerPenugasan: {},
  });

  const teacherId = user?.id || profile.id;

  useEffect(() => {
    void refreshPenugasanGuru();
    getTeacherSubmissionsSummary().then((res) => {
      setSubmissionSummary(res);
      setLoadingSummary(false);
    });
  }, [teacherId]);

  // Real data calculations
  const myClasses = Array.isArray(kelasList) ? kelasList.filter((k) => k.guruId === teacherId) : [];
  const modulAktif = Array.isArray(moduls) ? moduls.filter((m) => m.status === "Terbit").length : 0;
  const soalTerbit = Array.isArray(pakets) ? pakets.filter((p) => p.status === "Terbit").length : 0;
  const assignmentList = Array.isArray(assignments) ? assignments : [];

  const gradingProgress =
    submissionSummary.totalSubmitted > 0
      ? Math.round((submissionSummary.sudahDinilai / submissionSummary.totalSubmitted) * 100)
      : 0;

  // Tugas yang membutuhkan penilaian manual
  const needGradingAssignments = useMemo(() => {
    return assignmentList.filter((a) => {
      const stats = submissionSummary.submissionsPerPenugasan[a.id];
      return (stats?.perluDinilai ?? 0) > 0;
    });
  }, [assignmentList, submissionSummary]);

  // Notifikasi riil berbasis event nyata
  const realNotifications = useMemo(() => {
    const notifs: Array<{ id: string; judul: string; detail: string; tipe: string }> = [];

    // 1. Siswa menunggu verifikasi masuk kelas
    const myClassIds = new Set(myClasses.map((c) => c.id));
    const pendingMembers = Array.isArray(anggotaList)
      ? anggotaList.filter((a) => myClassIds.has(a.kelasId) && a.status === "menunggu")
      : [];
    if (pendingMembers.length > 0) {
      notifs.push({
        id: "notif-pending-member",
        judul: `${pendingMembers.length} siswa menunggu verifikasi kelas`,
        detail: `${pendingMembers.slice(0, 2).map((m) => m.siswaNama || "Siswa").join(", ")}${pendingMembers.length > 2 ? " dan lainnya" : ""}`,
        tipe: "verifikasi",
      });
    }

    // 2. Tugas perlu dinilai
    if (submissionSummary.perluDinilai > 0) {
      notifs.push({
        id: "notif-need-grading",
        judul: `${submissionSummary.perluDinilai} tugas siswa menunggu penilaian`,
        detail: "Pilihan ganda telah diauto-grade, periksa jawaban esai siswa.",
        tipe: "tugas",
      });
    }

    // 3. Modul terbit aktif
    if (modulAktif > 0) {
      notifs.push({
        id: "notif-active-moduls",
        judul: `${modulAktif} modul aktif dipublikasikan`,
        detail: "Siswa di kelasmu dapat mengakses dan mempelajari modul ini.",
        tipe: "modul",
      });
    }

    return notifs;
  }, [myClasses, anggotaList, submissionSummary, modulAktif]);

  const stats = [
    {
      label: "Modul Aktif",
      value: String(modulAktif),
      icon: BookOpen,
      hint: `${moduls?.length ?? 0} modul tersimpan`,
      to: "/modul-ajar" as const,
    },
    {
      label: "Tugas Masuk",
      value: String(submissionSummary.totalSubmitted),
      icon: ClipboardList,
      hint: `${assignmentList.length} penugasan dibuat`,
      to: "/penugasan" as const,
    },
    {
      label: "Perlu Dinilai",
      value: String(submissionSummary.perluDinilai),
      icon: CheckCircle2,
      hint: `${submissionSummary.sudahDinilai} tugas selesai (${gradingProgress}%)`,
      to: "/penilaian" as const,
    },
    {
      label: "Kelas Diampu",
      value: String(myClasses.length),
      icon: Users,
      hint:
        myClasses.length > 0
          ? myClasses.map((k) => `${k.tingkat} ${k.namaKelas}`).slice(0, 2).join(", ") +
            (myClasses.length > 2 ? "…" : "")
          : "Belum ada kelas",
      to: "/kelas" as const,
    },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Selamat datang kembali 👋"
        subtitle="Kelola administrasi pembelajaran, modul ajar, dan tugas siswa dengan data riil GuruPro."
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
                  <p className="font-display text-2xl font-bold leading-tight text-navy">
                    {s.value}
                  </p>
                  <p className="text-sm font-medium">{s.label}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{s.hint}</p>
                </div>
              </CardContent>
            </Link>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* Tugas Perlu Dikoreksi (Real Data) */}
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
            <div>
              <CardTitle className="font-display text-base text-navy">
                Tugas Perlu Dikoreksi
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Tugas siswa yang mengumpulkan dan membutuhkan penilaian esai Anda.
              </p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/penilaian">
                Lihat semua
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="px-0 pb-2 sm:px-6 sm:pb-6">
            {loadingSummary ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
                <p className="mt-2">Memeriksa pengumpulan tugas…</p>
              </div>
            ) : needGradingAssignments.length === 0 ? (
              <div className="py-10 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500/60" />
                <p className="mt-2 font-display text-sm font-semibold text-navy">
                  Tidak Ada Tugas Menunggu Koreksi
                </p>
                <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                  Semua pengumpulan tugas siswa telah dinilai atau belum ada pengumpulan baru yang
                  memerlukan koreksi manual.
                </p>
                <Button asChild variant="outline" size="sm" className="mt-4 text-xs">
                  <Link to="/penugasan">Buka Menu Penugasan</Link>
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kelas</TableHead>
                      <TableHead>Tugas</TableHead>
                      <TableHead>Perlu Nilai</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {needGradingAssignments.map((t) => {
                      const stats = submissionSummary.submissionsPerPenugasan[t.id];
                      return (
                        <TableRow key={t.id}>
                          <TableCell className="font-medium">{t.kelasNama || "Kelas"}</TableCell>
                          <TableCell className="max-w-[14rem] truncate">{t.judul}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                              {stats?.perluDinilai ?? 0} siswa
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                              <Link to="/penugasan">Beri Nilai</Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notifikasi & AI Promo Card */}
        <div className="grid gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-base text-navy">Notifikasi Riil</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 pt-0">
              {realNotifications.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  <Info className="mx-auto h-6 w-6 text-muted-foreground/40 mb-1" />
                  Belum ada notifikasi baru saat ini.
                </div>
              ) : (
                realNotifications.map((n) => (
                  <div key={n.id} className="rounded-xl border p-3">
                    <p className="text-sm font-semibold text-navy">{n.judul}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{n.detail}</p>
                  </div>
                ))
              )}
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
                {soalTerbit} paket soal siap diterbitkan sebagai penugasan kelas.
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

// ==================== DASHBOARD ADMIN (OPERATIONAL & MONITORING) ====================

function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats>({
    totalUsers: 0,
    totalTeachers: 0,
    totalStudents: 0,
    totalAdmins: 0,
    totalClasses: 0,
    totalModules: 0,
    totalAssignments: 0,
    pendingTeachers: 0,
  });
  const [teachers, setTeachers] = useState<TeacherAdminItem[]>([]);
  const [logs, setLogs] = useState<SystemLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [teacherFilter, setTeacherFilter] = useState<"semua" | "menunggu" | "terverifikasi" | "ditolak">("semua");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const [sData, tData, lData] = await Promise.all([
        getAdminStats(),
        getTeachersList(),
        getSystemLogs(25),
      ]);
      setStats(sData);
      setTeachers(tData);
      setLogs(lData);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAdminData();
  }, []);

  const handleVerify = async (teacherId: string, status: "terverifikasi" | "ditolak") => {
    setUpdatingId(teacherId);
    try {
      const res = await updateTeacherVerification(teacherId, status);
      if (res.ok) {
        toast.success(res.message);
        await loadAdminData();
      } else {
        toast.error(res.message);
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredTeachers = useMemo(() => {
    if (teacherFilter === "semua") return teachers;
    return teachers.filter((t) => t.statusVerifikasi === teacherFilter);
  }, [teachers, teacherFilter]);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Dashboard Administrator 🛡️"
        subtitle="Monitoring operasional sistem, verifikasi akun guru, dan kesehatan aplikasi GuruPro."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadAdminData()}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Segarkan Data
          </Button>
        }
      />

      {/* Kartu Statistik Operasional Riil */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardContent className="flex items-start gap-3 p-5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
              <Users className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="font-display text-2xl font-bold leading-tight text-navy">
                {stats.totalUsers}
              </p>
              <p className="text-sm font-medium">Total Akun</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">Pengguna terdaftar</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-start gap-3 p-5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
              <GraduationCap className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="font-display text-2xl font-bold leading-tight text-navy">
                {stats.totalTeachers}
              </p>
              <p className="text-sm font-medium">Guru Terdaftar</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">Pendidik SMK</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-start gap-3 p-5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
              <School className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="font-display text-2xl font-bold leading-tight text-navy">
                {stats.totalStudents}
              </p>
              <p className="text-sm font-medium">Siswa Terdaftar</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">Siswa aktif</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-start gap-3 p-5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-purple-50 text-purple-600">
              <ClipboardList className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="font-display text-2xl font-bold leading-tight text-navy">
                {stats.totalClasses}
              </p>
              <p className="text-sm font-medium">Kelas Aktif</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {stats.totalAssignments} tugas dibuat
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className={stats.pendingTeachers > 0 ? "border-amber-400 bg-amber-50/40" : ""}>
          <CardContent className="flex items-start gap-3 p-5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800">
              <UserCheck className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="font-display text-2xl font-bold leading-tight text-navy">
                {stats.pendingTeachers}
              </p>
              <p className="text-sm font-medium">Verifikasi Guru</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {stats.pendingTeachers > 0 ? "Memerlukan tindakan" : "Semua diverifikasi"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tab Konten Admin */}
      <Tabs defaultValue="guru" className="space-y-4">
        <TabsList>
          <TabsTrigger value="guru" className="gap-2">
            <UserCheck className="h-4 w-4" />
            Verifikasi & Manajemen Guru
          </TabsTrigger>
          <TabsTrigger value="monitoring" className="gap-2">
            <ShieldAlert className="h-4 w-4" />
            Monitoring Kesehatan & Error
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: MANAJEMEN GURU */}
        <TabsContent value="guru" className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-4 space-y-0 pb-4">
              <div>
                <CardTitle className="font-display text-base text-navy">
                  Daftar Akun Guru
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Verifikasi dan atur otorisasi pengajar di platform GuruPro.
                </p>
              </div>
              <div className="flex gap-1 bg-muted p-1 rounded-lg text-xs">
                {(["semua", "menunggu", "terverifikasi", "ditolak"] as const).map((filterKey) => (
                  <button
                    key={filterKey}
                    onClick={() => setTeacherFilter(filterKey)}
                    className={`px-3 py-1 rounded-md capitalize font-medium transition-colors ${
                      teacherFilter === filterKey
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {filterKey}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-2 sm:px-6 sm:pb-6">
              {loading ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
                  <p className="mt-2">Memuat akun guru…</p>
                </div>
              ) : filteredTeachers.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  Tidak ada data guru untuk filter &quot;{teacherFilter}&quot;.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nama Pengajar</TableHead>
                        <TableHead>NIP</TableHead>
                        <TableHead>Sekolah & Mapel</TableHead>
                        <TableHead>Kontak</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Tindakan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTeachers.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell>
                            <div className="font-semibold text-navy">{t.nama}</div>
                            <div className="text-xs text-muted-foreground">{t.email}</div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{t.nip || "—"}</TableCell>
                          <TableCell>
                            <div>{t.sekolah}</div>
                            <div className="text-xs text-muted-foreground">{t.mapel}</div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {t.telepon || "—"}
                          </TableCell>
                          <TableCell>
                            {t.statusVerifikasi === "terverifikasi" ? (
                              <Badge className="bg-emerald-600 hover:bg-emerald-700 gap-1">
                                <Check className="h-3 w-3" />
                                Terverifikasi
                              </Badge>
                            ) : t.statusVerifikasi === "menunggu" ? (
                              <Badge variant="secondary" className="bg-amber-100 text-amber-800 gap-1">
                                <Clock className="h-3 w-3" />
                                Menunggu
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="gap-1">
                                <X className="h-3 w-3" />
                                Ditolak
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1.5">
                              {t.statusVerifikasi !== "terverifikasi" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                                  onClick={() => handleVerify(t.id, "terverifikasi")}
                                  disabled={updatingId === t.id}
                                >
                                  {updatingId === t.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    "Setujui"
                                  )}
                                </Button>
                              )}
                              {t.statusVerifikasi !== "ditolak" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                                  onClick={() => handleVerify(t.id, "ditolak")}
                                  disabled={updatingId === t.id}
                                >
                                  Tolak
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: SYSTEM HEALTH & ERROR MONITORING */}
        <TabsContent value="monitoring" className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-4 space-y-0 pb-4">
              <div>
                <CardTitle className="font-display text-base text-navy">
                  Log Aktivitas & Error Sistem Riil
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Catatan otomatis kegagalan otentikasi, error database/API, dan event penting. Data
                  sensitif disanitasi.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadAdminData()}
                className="gap-1.5 text-xs"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh Log
              </Button>
            </CardHeader>
            <CardContent className="px-0 pb-2 sm:px-6 sm:pb-6">
              {loading ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
                  <p className="mt-2">Memuat log sistem…</p>
                </div>
              ) : logs.length === 0 ? (
                <div className="py-12 text-center">
                  <ShieldCheck className="mx-auto h-10 w-10 text-emerald-500/60" />
                  <p className="mt-2 font-display text-sm font-semibold text-navy">
                    Sistem Berjalan Normal
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground max-w-sm mx-auto">
                    Belum ada insiden error atau kegagalan otentikasi yang tercatat dalam log sistem.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Level</TableHead>
                        <TableHead>Event Type</TableHead>
                        <TableHead>Pesan Kejadian</TableHead>
                        <TableHead>Konteks (Sanitasi)</TableHead>
                        <TableHead className="text-right">Waktu</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell>
                            {log.level === "error" ? (
                              <Badge variant="destructive" className="gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                Error
                              </Badge>
                            ) : log.level === "auth_failure" ? (
                              <Badge variant="secondary" className="bg-amber-100 text-amber-800 gap-1">
                                <Clock className="h-3 w-3" />
                                Auth Failure
                              </Badge>
                            ) : log.level === "warn" ? (
                              <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                                Warning
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-blue-600 border-blue-200">
                                Info
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs font-semibold">
                            {log.eventType}
                          </TableCell>
                          <TableCell className="text-xs max-w-[20rem]">{log.message}</TableCell>
                          <TableCell className="text-[11px] font-mono text-muted-foreground max-w-[15rem] truncate">
                            {JSON.stringify(log.context)}
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                            {formatTanggal(log.createdAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
