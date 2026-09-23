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
  Bug,
  Edit3,
  KeyRound,
  MessageSquare,
  Search,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  adminDeleteTeacher,
  adminUpdateTeacherProfile,
  getAdminStats,
  getSystemLogs,
  getTeacherClasses,
  getTeachersList,
  sendTeacherPasswordReset,
  updateTeacherVerification,
  type AdminStats,
  type SystemLogItem,
  type TeacherAdminItem,
  type TeacherClassItem,
} from "@/lib/admin-store";
import {
  getAllBugReports,
  updateBugReportStatus,
  type BugPriority,
  type BugReportItem,
  type BugStatus,
} from "@/lib/bug-report-store";
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
import { useTahunAjaran } from "@/lib/tahun-ajaran-store";

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
  const { profile, profileStatus, profileError, ready, refreshProfile } = useAuth();
  const [retrying, setRetrying] = useState(false);

  if (!ready || profileStatus === "loading") {
    return (
      <div className="grid min-h-[50vh] place-items-center text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span>Memuat dashboard…</span>
        </div>
      </div>
    );
  }

  if (profileStatus === "error") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-4 rounded-xl border border-destructive/30 bg-card p-6 shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Gagal Memuat Profil Akun</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Terjadi kendala saat mengambil data profil akun Anda dari server:
          </p>
          <p className="rounded-md bg-muted/60 p-2.5 font-mono text-xs text-destructive">
            {profileError || "Kesalahan koneksi basis data."}
          </p>
          <div className="pt-2 flex justify-center gap-3">
            <Button
              variant="default"
              disabled={retrying}
              onClick={async () => {
                setRetrying(true);
                await refreshProfile();
                setRetrying(false);
              }}
            >
              {retrying ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Coba Muat Ulang
            </Button>
          </div>
        </div>
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
          Akun Anda belum memiliki peran aktif (Guru atau Siswa) yang valid di sistem. Untuk menjaga keamanan
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
  const { selectedYear } = useTahunAjaran(teacherId);

  useEffect(() => {
    void refreshPenugasanGuru();
    getTeacherSubmissionsSummary().then((res) => {
      setSubmissionSummary(res);
      setLoadingSummary(false);
    });
  }, [teacherId]);

  // Real data calculations filtered by selectedYear
  const myClasses = useMemo(() => {
    const list = Array.isArray(kelasList) ? kelasList.filter((k) => k.guruId === teacherId) : [];
    if (!selectedYear) return list;
    return list.filter((k) => k.tahunAjaran === selectedYear);
  }, [kelasList, teacherId, selectedYear]);

  const myClassIds = useMemo(() => new Set(myClasses.map((c) => c.id)), [myClasses]);
  const myClassNames = useMemo(
    () => new Set(myClasses.map((c) => `${c.tingkat} ${c.namaKelas}`.trim().toLowerCase())),
    [myClasses],
  );

  const modulAktif = useMemo(() => {
    if (!Array.isArray(moduls)) return 0;
    return moduls.filter((m) => {
      if (m.status !== "Terbit") return false;
      if (!selectedYear) return true;
      if (m.kelasId) return myClassIds.has(m.kelasId);
      if (m.kelas) return myClassNames.has(m.kelas.trim().toLowerCase());
      return false;
    }).length;
  }, [moduls, selectedYear, myClassIds, myClassNames]);

  const soalTerbit = useMemo(() => {
    if (!Array.isArray(pakets)) return 0;
    return pakets.filter((p) => p.status === "Terbit").length;
  }, [pakets]);

  const assignmentList = useMemo(() => {
    const list = Array.isArray(assignments) ? assignments : [];
    if (!selectedYear) return list;
    return list.filter((a) =>
      a.kelasTahunAjaran ? a.kelasTahunAjaran === selectedYear : myClassIds.has(a.kelasId),
    );
  }, [assignments, selectedYear, myClassIds]);

  const yearTotalSubmitted = useMemo(() => {
    return assignmentList.reduce((acc, a) => {
      const stats = submissionSummary.submissionsPerPenugasan[a.id];
      return acc + (stats?.submitted ?? 0);
    }, 0);
  }, [assignmentList, submissionSummary]);

  const yearPerluDinilai = useMemo(() => {
    return assignmentList.reduce((acc, a) => {
      const stats = submissionSummary.submissionsPerPenugasan[a.id];
      return acc + (stats?.perluDinilai ?? 0);
    }, 0);
  }, [assignmentList, submissionSummary]);

  const yearSudahDinilai = useMemo(() => {
    return assignmentList.reduce((acc, a) => {
      const stats = submissionSummary.submissionsPerPenugasan[a.id];
      return acc + (stats?.dinilai ?? 0);
    }, 0);
  }, [assignmentList, submissionSummary]);

  const gradingProgress =
    yearTotalSubmitted > 0
      ? Math.round((yearSudahDinilai / yearTotalSubmitted) * 100)
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
    if (yearPerluDinilai > 0) {
      notifs.push({
        id: "notif-need-grading",
        judul: `${yearPerluDinilai} tugas siswa menunggu penilaian`,
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
  }, [myClassIds, anggotaList, yearPerluDinilai, modulAktif]);

  const stats = [
    {
      label: "Modul Aktif",
      value: String(modulAktif),
      icon: BookOpen,
      hint: `${modulAktif} modul terbit (${selectedYear || "Semua"})`,
      to: "/modul-ajar" as const,
    },
    {
      label: "Tugas Masuk",
      value: String(yearTotalSubmitted),
      icon: ClipboardList,
      hint: `${assignmentList.length} penugasan (${selectedYear || "Semua"})`,
      to: "/penugasan" as const,
    },
    {
      label: "Perlu Dinilai",
      value: String(yearPerluDinilai),
      icon: CheckCircle2,
      hint: `${yearSudahDinilai} tugas selesai (${gradingProgress}%)`,
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
        subtitle={
          selectedYear
            ? `Kelola administrasi pembelajaran, modul ajar, dan tugas siswa untuk Tahun Ajaran ${selectedYear}.`
            : "Kelola administrasi pembelajaran, modul ajar, dan tugas siswa dengan data riil GuruPro."
        }
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

// ==================== DASHBOARD ADMIN (OPERATIONAL CONTROL CENTER) ====================

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
  const [bugReports, setBugReports] = useState<BugReportItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter Guru
  const [teacherFilter, setTeacherFilter] = useState<"semua" | "menunggu" | "terverifikasi" | "ditolak">("semua");
  const [teacherSearch, setTeacherSearch] = useState("");
  const [updatingTeacherId, setUpdatingTeacherId] = useState<string | null>(null);

  // Filter Bug Reports
  const [bugStatusFilter, setBugStatusFilter] = useState<BugStatus | "semua">("semua");
  const [bugRoleFilter, setBugRoleFilter] = useState<"semua" | "guru" | "siswa">("semua");

  // Filter Log
  const [logLevelFilter, setLogLevelFilter] = useState<"semua" | "error" | "auth_failure" | "warn" | "info">("semua");
  const [logSearch, setLogSearch] = useState("");

  // Dialog Kelola Guru
  const [selectedTeacher, setSelectedTeacher] = useState<TeacherAdminItem | null>(null);
  const [teacherClasses, setTeacherClasses] = useState<TeacherClassItem[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [editForm, setEditForm] = useState({
    nama: "",
    nip: "",
    sekolah: "",
    mapel: "",
    telepon: "",
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [teacherToDelete, setTeacherToDelete] = useState<TeacherAdminItem | null>(null);
  const [deletingTeacher, setDeletingTeacher] = useState(false);

  // Dialog Tindak Lanjut Bug Report
  const [selectedBug, setSelectedBug] = useState<BugReportItem | null>(null);
  const [bugNewStatus, setBugNewStatus] = useState<BugStatus>("baru");
  const [bugAdminNotes, setBugAdminNotes] = useState("");
  const [updatingBug, setUpdatingBug] = useState(false);

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const [sData, tData, lData, bData] = await Promise.all([
        getAdminStats(),
        getTeachersList(),
        getSystemLogs(40),
        getAllBugReports(),
      ]);
      setStats(sData);
      setTeachers(tData);
      setLogs(lData);
      setBugReports(bData);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAdminData();
  }, []);

  const handleVerify = async (teacherId: string, status: "terverifikasi" | "ditolak" | "menunggu") => {
    setUpdatingTeacherId(teacherId);
    try {
      const res = await updateTeacherVerification(teacherId, status);
      if (res.ok) {
        toast.success(res.message);
        await loadAdminData();
      } else {
        toast.error(res.message);
      }
    } finally {
      setUpdatingTeacherId(null);
    }
  };

  const openTeacherModal = async (teacher: TeacherAdminItem) => {
    setSelectedTeacher(teacher);
    setEditForm({
      nama: teacher.nama !== "-" ? teacher.nama : "",
      nip: teacher.nip !== "-" ? teacher.nip : "",
      sekolah: teacher.sekolah !== "-" ? teacher.sekolah : "",
      mapel: teacher.mapel !== "-" ? teacher.mapel : "",
      telepon: teacher.telepon !== "-" ? teacher.telepon : "",
    });
    setLoadingClasses(true);
    try {
      const classes = await getTeacherClasses(teacher.id);
      setTeacherClasses(classes);
    } finally {
      setLoadingClasses(false);
    }
  };

  const handleSaveTeacherProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeacher) return;
    if (!editForm.nama.trim()) {
      toast.error("Nama guru tidak boleh kosong.");
      return;
    }
    setSavingProfile(true);
    try {
      const res = await adminUpdateTeacherProfile(selectedTeacher.id, editForm);
      if (res.ok) {
        toast.success(res.message);
        setSelectedTeacher(null);
        await loadAdminData();
      } else {
        toast.error(res.message);
      }
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSendPasswordReset = async () => {
    if (!selectedTeacher || !selectedTeacher.email || selectedTeacher.email === "-") {
      toast.error("Email guru tidak valid.");
      return;
    }
    setSendingReset(true);
    try {
      const res = await sendTeacherPasswordReset(selectedTeacher.email);
      if (res.ok) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } finally {
      setSendingReset(false);
    }
  };

  const handleConfirmDeleteTeacher = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!teacherToDelete) return;

    setDeletingTeacher(true);
    try {
      const res = await adminDeleteTeacher(teacherToDelete.id);
      if (res.ok) {
        toast.success(res.message);
        if (selectedTeacher?.id === teacherToDelete.id) {
          setSelectedTeacher(null);
        }
        setTeacherToDelete(null);
        await loadAdminData();
      } else {
        toast.error(res.message);
      }
    } finally {
      setDeletingTeacher(false);
    }
  };

  const openBugModal = (bug: BugReportItem) => {
    setSelectedBug(bug);
    setBugNewStatus(bug.status);
    setBugAdminNotes(bug.adminNotes || "");
  };

  const handleUpdateBugReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBug) return;
    setUpdatingBug(true);
    try {
      const res = await updateBugReportStatus(selectedBug.id, bugNewStatus, bugAdminNotes);
      if (res.ok) {
        toast.success(res.message);
        setSelectedBug(null);
        await loadAdminData();
      } else {
        toast.error(res.message);
      }
    } finally {
      setUpdatingBug(false);
    }
  };

  const filteredTeachers = useMemo(() => {
    return teachers.filter((t) => {
      if (teacherFilter !== "semua" && t.statusVerifikasi !== teacherFilter) {
        return false;
      }
      if (teacherSearch.trim()) {
        const q = teacherSearch.toLowerCase();
        const matchName = t.nama.toLowerCase().includes(q);
        const matchEmail = t.email.toLowerCase().includes(q);
        const matchNip = t.nip.toLowerCase().includes(q);
        const matchSekolah = t.sekolah.toLowerCase().includes(q);
        const matchMapel = t.mapel.toLowerCase().includes(q);
        if (!matchName && !matchEmail && !matchNip && !matchSekolah && !matchMapel) {
          return false;
        }
      }
      return true;
    });
  }, [teachers, teacherFilter, teacherSearch]);

  const filteredBugs = useMemo(() => {
    return bugReports.filter((b) => {
      if (bugStatusFilter !== "semua" && b.status !== bugStatusFilter) return false;
      if (bugRoleFilter !== "semua" && b.reporterRole !== bugRoleFilter) return false;
      return true;
    });
  }, [bugReports, bugStatusFilter, bugRoleFilter]);

  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      if (logLevelFilter !== "semua" && l.level !== logLevelFilter) return false;
      if (logSearch.trim()) {
        const q = logSearch.toLowerCase();
        const matchMsg = l.message.toLowerCase().includes(q);
        const matchEvent = l.eventType.toLowerCase().includes(q);
        if (!matchMsg && !matchEvent) return false;
      }
      return true;
    });
  }, [logs, logLevelFilter, logSearch]);

  const bugCounters = useMemo(() => {
    const baru = bugReports.filter((b) => b.status === "baru").length;
    const diproses = bugReports.filter((b) => b.status === "diproses").length;
    const selesai = bugReports.filter((b) => b.status === "selesai").length;
    return { baru, diproses, selesai, total: bugReports.length };
  }, [bugReports]);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Dashboard Administrator 🛡️"
        subtitle="Pusat kendali operasional GuruPro: monitoring sistem, verifikasi pendidik, manajemen akun, dan penanganan laporan kendala."
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
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
                {stats.totalAssignments} tugas
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
                {stats.pendingTeachers > 0 ? "Perlu tindakan" : "Tuntas"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className={bugCounters.baru > 0 ? "border-red-300 bg-red-50/40" : ""}>
          <CardContent className="flex items-start gap-3 p-5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-red-100 text-red-700">
              <Bug className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="font-display text-2xl font-bold leading-tight text-navy">
                {bugCounters.baru}
              </p>
              <p className="text-sm font-medium">Laporan Baru</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {bugCounters.diproses} diproses · {bugCounters.selesai} selesai
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tab Konten Admin */}
      <Tabs defaultValue="guru" className="space-y-4">
        <TabsList className="grid grid-cols-3 w-full max-w-xl">
          <TabsTrigger value="guru" className="gap-2 text-xs">
            <UserCheck className="h-4 w-4" />
            Manajemen Guru
          </TabsTrigger>
          <TabsTrigger value="laporan" className="gap-2 text-xs">
            <Bug className="h-4 w-4 text-amber-600" />
            Laporan Masalah ({bugCounters.baru})
          </TabsTrigger>
          <TabsTrigger value="monitoring" className="gap-2 text-xs">
            <ShieldAlert className="h-4 w-4" />
            Monitoring Log
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: MANAJEMEN & VERIFIKASI GURU */}
        <TabsContent value="guru" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 space-y-0 pb-4">
              <div>
                <CardTitle className="font-display text-base text-navy">
                  Daftar & Otorisasi Akun Guru
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Verifikasi status pengajar, tinjau kelas yang diampu, perbarui profil, dan kelola keamanan akun.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-48">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Cari guru, NIP, sekolah…"
                    value={teacherSearch}
                    onChange={(e) => setTeacherSearch(e.target.value)}
                    className="h-8.5 pl-8 text-xs"
                  />
                </div>

                <div className="flex gap-1 bg-muted p-1 rounded-lg text-xs">
                  {(["semua", "menunggu", "terverifikasi", "ditolak"] as const).map((filterKey) => (
                    <button
                      key={filterKey}
                      onClick={() => setTeacherFilter(filterKey)}
                      className={`px-2.5 py-1 rounded-md capitalize font-medium transition-colors text-xs ${
                        teacherFilter === filterKey
                          ? "bg-background text-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {filterKey}
                    </button>
                  ))}
                </div>
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
                  Tidak ada akun guru yang cocok dengan pencarian atau filter &quot;{teacherFilter}&quot;.
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
                            <div className="font-medium text-xs text-navy">{t.sekolah}</div>
                            <div className="text-xs text-muted-foreground">{t.mapel}</div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {t.telepon || "—"}
                          </TableCell>
                          <TableCell>
                            {t.statusVerifikasi === "terverifikasi" ? (
                              <Badge className="bg-emerald-600 hover:bg-emerald-700 gap-1 text-[11px]">
                                <Check className="h-3 w-3" />
                                Terverifikasi
                              </Badge>
                            ) : t.statusVerifikasi === "menunggu" ? (
                              <Badge variant="secondary" className="bg-amber-100 text-amber-800 gap-1 text-[11px]">
                                <Clock className="h-3 w-3" />
                                Menunggu
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="gap-1 text-[11px]">
                                <X className="h-3 w-3" />
                                Ditolak
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end items-center gap-1.5">
                              {t.statusVerifikasi !== "terverifikasi" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50 px-2"
                                  onClick={() => handleVerify(t.id, "terverifikasi")}
                                  disabled={updatingTeacherId === t.id}
                                >
                                  {updatingTeacherId === t.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    "Setujui"
                                  )}
                                </Button>
                              )}

                              {t.statusVerifikasi !== "ditolak" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 px-2"
                                  onClick={() => handleVerify(t.id, "ditolak")}
                                  disabled={updatingTeacherId === t.id}
                                >
                                  Tolak
                                </Button>
                              )}

                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-7 text-xs gap-1 px-2.5"
                                onClick={() => void openTeacherModal(t)}
                              >
                                <Edit3 className="h-3 w-3" />
                                Kelola
                              </Button>

                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                title="Hapus Akun Guru"
                                onClick={() => setTeacherToDelete(t)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
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

        {/* TAB 2: LAPORAN KENDALA / BUG REPORTS */}
        <TabsContent value="laporan" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 space-y-0 pb-4">
              <div>
                <CardTitle className="font-display text-base text-navy flex items-center gap-2">
                  <Bug className="h-4 w-4 text-amber-600" />
                  Laporan Masalah & Masukan Pengguna
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Tinjau kendala teknis atau saran yang dilaporkan oleh guru dan siswa, ubah status, dan tambahkan catatan perbaikan.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Filter Peran */}
                <Select
                  value={bugRoleFilter}
                  onValueChange={(val) => setBugRoleFilter(val as any)}
                >
                  <SelectTrigger className="h-8.5 w-32 text-xs">
                    <SelectValue placeholder="Peran" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="semua" className="text-xs">Semua Peran</SelectItem>
                    <SelectItem value="guru" className="text-xs">Guru</SelectItem>
                    <SelectItem value="siswa" className="text-xs">Siswa</SelectItem>
                  </SelectContent>
                </Select>

                {/* Filter Status */}
                <div className="flex gap-1 bg-muted p-1 rounded-lg text-xs">
                  {(["semua", "baru", "diproses", "selesai"] as const).map((st) => (
                    <button
                      key={st}
                      onClick={() => setBugStatusFilter(st)}
                      className={`px-2.5 py-1 rounded-md capitalize font-medium transition-colors text-xs ${
                        bugStatusFilter === st
                          ? "bg-background text-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>

            <CardContent className="px-0 pb-2 sm:px-6 sm:pb-6">
              {loading ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
                  <p className="mt-2">Memuat laporan kendala…</p>
                </div>
              ) : filteredBugs.length === 0 ? (
                <div className="py-12 text-center">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500/60" />
                  <p className="mt-2 font-display text-sm font-semibold text-navy">
                    Tidak Ada Laporan Kendala
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground max-w-sm mx-auto">
                    Tidak ada laporan masalah yang sesuai dengan filter &quot;{bugStatusFilter}&quot;.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pelapor</TableHead>
                        <TableHead>Judul Masalah</TableHead>
                        <TableHead>Halaman / Rute</TableHead>
                        <TableHead>Urgensi</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Tanggal</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBugs.map((b) => (
                        <TableRow key={b.id}>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-navy text-xs">{b.reporterName}</span>
                              <Badge variant="outline" className="text-[10px] uppercase font-bold px-1 py-0">
                                {b.reporterRole}
                              </Badge>
                            </div>
                            <div className="text-[11px] text-muted-foreground">{b.reporterEmail}</div>
                          </TableCell>

                          <TableCell className="max-w-[16rem]">
                            <div className="font-medium text-xs line-clamp-1">{b.title}</div>
                            <div className="text-[11px] text-muted-foreground line-clamp-1">{b.description}</div>
                          </TableCell>

                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {b.route || "—"}
                          </TableCell>

                          <TableCell>
                            {b.priority === "kritis" ? (
                              <Badge className="bg-red-600 text-white text-[10px]">Kritis</Badge>
                            ) : b.priority === "tinggi" ? (
                              <Badge className="bg-amber-600 text-white text-[10px]">Tinggi</Badge>
                            ) : b.priority === "sedang" ? (
                              <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 text-[10px]">Sedang</Badge>
                            ) : (
                              <Badge variant="outline" className="text-emerald-700 border-emerald-300 text-[10px]">Rendah</Badge>
                            )}
                          </TableCell>

                          <TableCell>
                            {b.status === "baru" ? (
                              <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-[10px] font-semibold">
                                Baru
                              </Badge>
                            ) : b.status === "diproses" ? (
                              <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-[10px] font-semibold">
                                Diproses
                              </Badge>
                            ) : (
                              <Badge className="bg-emerald-600 text-white text-[10px] font-semibold">
                                Selesai
                              </Badge>
                            )}
                          </TableCell>

                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatTanggal(b.createdAt)}
                          </TableCell>

                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1"
                              onClick={() => openBugModal(b)}
                            >
                              <MessageSquare className="h-3 w-3" />
                              Tindak Lanjuti
                            </Button>
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

        {/* TAB 3: MONITORING LOG & SYSTEM HEALTH */}
        <TabsContent value="monitoring" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 space-y-0 pb-4">
              <div>
                <CardTitle className="font-display text-base text-navy">
                  Log Aktivitas & Error Sistem Riil
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Catatan otomatis kegagalan otentikasi, error database/API, dan event penting. Data sensitif disanitasi.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-48">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Cari pesan / event…"
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    className="h-8.5 pl-8 text-xs"
                  />
                </div>

                <Select
                  value={logLevelFilter}
                  onValueChange={(val) => setLogLevelFilter(val as any)}
                >
                  <SelectTrigger className="h-8.5 w-32 text-xs">
                    <SelectValue placeholder="Level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="semua" className="text-xs">Semua Level</SelectItem>
                    <SelectItem value="error" className="text-xs">Error</SelectItem>
                    <SelectItem value="auth_failure" className="text-xs">Auth Failure</SelectItem>
                    <SelectItem value="warn" className="text-xs">Warning</SelectItem>
                    <SelectItem value="info" className="text-xs">Info</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void loadAdminData()}
                  className="gap-1.5 text-xs h-8.5"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-2 sm:px-6 sm:pb-6">
              {loading ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
                  <p className="mt-2">Memuat log sistem…</p>
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="py-12 text-center">
                  <ShieldCheck className="mx-auto h-10 w-10 text-emerald-500/60" />
                  <p className="mt-2 font-display text-sm font-semibold text-navy">
                    Sistem Berjalan Normal
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground max-w-sm mx-auto">
                    Belum ada insiden error atau event yang sesuai dengan filter saat ini.
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
                      {filteredLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell>
                            {log.level === "error" ? (
                              <Badge variant="destructive" className="gap-1 text-[11px]">
                                <AlertTriangle className="h-3 w-3" />
                                Error
                              </Badge>
                            ) : log.level === "auth_failure" ? (
                              <Badge variant="secondary" className="bg-amber-100 text-amber-800 gap-1 text-[11px]">
                                <Clock className="h-3 w-3" />
                                Auth Failure
                              </Badge>
                            ) : log.level === "warn" ? (
                              <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 text-[11px]">
                                Warning
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-blue-600 border-blue-200 text-[11px]">
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

      {/* DIALOG 1: KELOLA GURU (PROFIL, KELAS READ-ONLY, KEAMANAN) */}
      <Dialog open={Boolean(selectedTeacher)} onOpenChange={(open) => !open && setSelectedTeacher(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedTeacher && (
            <div className="space-y-5">
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                    <UserCheck className="h-5 w-5" />
                  </span>
                  <div>
                    <DialogTitle className="font-display text-navy">
                      Kelola Akun Guru: {selectedTeacher.nama}
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                      {selectedTeacher.email} · Terdaftar {formatTanggal(selectedTeacher.createdAt)}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <Tabs defaultValue="profil" className="space-y-4">
                <TabsList className="grid grid-cols-3 w-full">
                  <TabsTrigger value="profil" className="text-xs">Edit Profil</TabsTrigger>
                  <TabsTrigger value="kelas" className="text-xs">Kelas Diampu ({teacherClasses.length})</TabsTrigger>
                  <TabsTrigger value="keamanan" className="text-xs">Keamanan Akun</TabsTrigger>
                </TabsList>

                {/* Sub-tab 1: Form Edit Profil */}
                <TabsContent value="profil">
                  <form onSubmit={handleSaveTeacherProfile} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="grid gap-1">
                        <Label htmlFor="t-nama">Nama Lengkap</Label>
                        <Input
                          id="t-nama"
                          value={editForm.nama}
                          onChange={(e) => setEditForm({ ...editForm, nama: e.target.value })}
                          required
                          className="h-8.5 text-xs"
                        />
                      </div>
                      <div className="grid gap-1">
                        <Label htmlFor="t-nip">NIP</Label>
                        <Input
                          id="t-nip"
                          value={editForm.nip}
                          onChange={(e) => setEditForm({ ...editForm, nip: e.target.value })}
                          className="h-8.5 text-xs font-mono"
                        />
                      </div>
                      <div className="grid gap-1">
                        <Label htmlFor="t-sekolah">Sekolah / Instansi</Label>
                        <Input
                          id="t-sekolah"
                          value={editForm.sekolah}
                          onChange={(e) => setEditForm({ ...editForm, sekolah: e.target.value })}
                          className="h-8.5 text-xs"
                        />
                      </div>
                      <div className="grid gap-1">
                        <Label htmlFor="t-mapel">Mata Pelajaran Utama</Label>
                        <Input
                          id="t-mapel"
                          value={editForm.mapel}
                          onChange={(e) => setEditForm({ ...editForm, mapel: e.target.value })}
                          className="h-8.5 text-xs"
                        />
                      </div>
                      <div className="grid gap-1 sm:col-span-2">
                        <Label htmlFor="t-telepon">Nomor Telepon / WhatsApp</Label>
                        <Input
                          id="t-telepon"
                          value={editForm.telepon}
                          onChange={(e) => setEditForm({ ...editForm, telepon: e.target.value })}
                          className="h-8.5 text-xs"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end pt-2">
                      <Button type="submit" size="sm" disabled={savingProfile} className="gap-1.5 text-xs">
                        {savingProfile && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Simpan Perubahan Profil
                      </Button>
                    </div>
                  </form>
                </TabsContent>

                {/* Sub-tab 2: Daftar Kelas Diampu (Read-Only) */}
                <TabsContent value="kelas">
                  {loadingClasses ? (
                    <div className="py-8 text-center text-xs text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
                      <p className="mt-2">Mengambil data kelas guru…</p>
                    </div>
                  ) : teacherClasses.length === 0 ? (
                    <div className="py-8 text-center text-xs text-muted-foreground">
                      <School className="mx-auto h-6 w-6 text-muted-foreground/40 mb-1" />
                      Guru ini belum membuat kelas pembelajaran.
                    </div>
                  ) : (
                    <div className="rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Kelas</TableHead>
                            <TableHead className="text-xs">Tingkat & Mapel</TableHead>
                            <TableHead className="text-xs">Tahun Ajaran</TableHead>
                            <TableHead className="text-xs">Kode</TableHead>
                            <TableHead className="text-right text-xs">Siswa Aktif</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {teacherClasses.map((c) => (
                            <TableRow key={c.id}>
                              <TableCell className="font-semibold text-xs text-navy">{c.namaKelas}</TableCell>
                              <TableCell className="text-xs">{c.tingkat} · {c.mapel}</TableCell>
                              <TableCell className="text-xs">{c.tahunAjaran}</TableCell>
                              <TableCell className="font-mono text-xs font-semibold">{c.kodeKelas}</TableCell>
                              <TableCell className="text-right text-xs">
                                <Badge variant="secondary" className="text-[10px]">
                                  {c.jumlahSiswa} siswa
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>

                {/* Sub-tab 3: Keamanan & Status Akun */}
                <TabsContent value="keamanan" className="space-y-4">
                  <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-navy">Status Verifikasi Akun</p>
                        <p className="text-[11px] text-muted-foreground">
                          Status saat ini: <span className="font-semibold capitalize">{selectedTeacher.statusVerifikasi}</span>
                        </p>
                      </div>
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant={selectedTeacher.statusVerifikasi === "terverifikasi" ? "default" : "outline"}
                          className="h-7 text-xs"
                          onClick={async () => {
                            await handleVerify(selectedTeacher.id, "terverifikasi");
                            setSelectedTeacher({ ...selectedTeacher, statusVerifikasi: "terverifikasi" });
                          }}
                        >
                          Verifikasi
                        </Button>
                        <Button
                          size="sm"
                          variant={selectedTeacher.statusVerifikasi === "ditolak" ? "destructive" : "outline"}
                          className="h-7 text-xs"
                          onClick={async () => {
                            await handleVerify(selectedTeacher.id, "ditolak");
                            setSelectedTeacher({ ...selectedTeacher, statusVerifikasi: "ditolak" });
                          }}
                        >
                          Nonaktifkan / Tolak
                        </Button>
                      </div>
                    </div>

                    <div className="border-t pt-3 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-navy">Reset Kata Sandi</p>
                        <p className="text-[11px] text-muted-foreground">
                          Kirim tautan resmi reset kata sandi ke email: <b>{selectedTeacher.email}</b>
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1.5"
                        onClick={handleSendPasswordReset}
                        disabled={sendingReset}
                      >
                        {sendingReset ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <KeyRound className="h-3 w-3" />
                        )}
                        Kirim Reset Email
                      </Button>
                    </div>

                    <div className="border-t pt-3 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-destructive flex items-center gap-1.5">
                            <Trash2 className="h-3.5 w-3.5" /> Hapus Akun Guru Permanen
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Hapus akun ini dari database. Seluruh modul, penugasan, dan kelas terkait akan dibersihkan untuk menghemat ruang penyimpanan.
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 text-xs gap-1.5 shrink-0"
                          onClick={() => setTeacherToDelete(selectedTeacher)}
                        >
                          <Trash2 className="h-3 w-3" /> Hapus Akun
                        </Button>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setSelectedTeacher(null)}>
                  Tutup
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* DIALOG 2: TINDAK LANJUT BUG REPORT */}
      <Dialog open={Boolean(selectedBug)} onOpenChange={(open) => !open && setSelectedBug(null)}>
        <DialogContent className="sm:max-w-lg">
          {selectedBug && (
            <form onSubmit={handleUpdateBugReport}>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-100 text-amber-800">
                    <Bug className="h-4 w-4" />
                  </span>
                  <div>
                    <DialogTitle className="font-display text-navy">Tindak Lanjut Laporan Masalah</DialogTitle>
                    <DialogDescription className="text-xs">
                      Pelapor: {selectedBug.reporterName} ({selectedBug.reporterRole}) · {formatTanggal(selectedBug.createdAt)}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="grid gap-3 py-4 text-xs">
                <div className="rounded-lg border bg-muted/40 p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-navy">{selectedBug.title}</span>
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {selectedBug.priority}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {selectedBug.description}
                  </p>
                  {selectedBug.route && (
                    <p className="text-[11px] font-mono text-muted-foreground pt-1 border-t">
                      Rute: {selectedBug.route}
                    </p>
                  )}
                </div>

                <div className="grid gap-1">
                  <Label htmlFor="bug-status" className="font-semibold">Ubah Status</Label>
                  <Select
                    value={bugNewStatus}
                    onValueChange={(val) => setBugNewStatus(val as BugStatus)}
                  >
                    <SelectTrigger id="bug-status" className="h-8.5 text-xs">
                      <SelectValue placeholder="Status laporan" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="baru" className="text-xs">🔵 Baru (Belum ditangani)</SelectItem>
                      <SelectItem value="diproses" className="text-xs">🟡 Sedang Diproses (Investigasi / Perbaikan)</SelectItem>
                      <SelectItem value="selesai" className="text-xs">🟢 Selesai (Masalah terselesaikan)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-1">
                  <Label htmlFor="bug-notes" className="font-semibold">Catatan Tindak Lanjut Admin</Label>
                  <Textarea
                    id="bug-notes"
                    rows={3}
                    placeholder="Tuliskan catatan perbaikan atau informasi untuk pelapor/tim admin..."
                    value={bugAdminNotes}
                    onChange={(e) => setBugAdminNotes(e.target.value)}
                    className="text-xs resize-none"
                  />
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedBug(null)}
                >
                  Batal
                </Button>
                <Button type="submit" size="sm" disabled={updatingBug} className="gap-1.5">
                  {updatingBug && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Simpan Perubahan
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ALERT DIALOG: KONFIRMASI HAPUS AKUN GURU */}
      <AlertDialog
        open={Boolean(teacherToDelete)}
        onOpenChange={(open) => !open && !deletingTeacher && setTeacherToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" /> Hapus Akun Guru Permanen?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-xs">
              <p>
                Anda akan menghapus akun guru <strong>{teacherToDelete?.nama}</strong> (
                {teacherToDelete?.email}) secara permanen dari sistem.
              </p>
              <div className="rounded-md bg-destructive/10 border border-destructive/20 p-2.5 text-[11px] text-destructive leading-relaxed">
                ⚠️ <strong>Peringatan:</strong> Seluruh modul ajar, paket soal, kelas pembelajaran, dan penugasan yang dibuat oleh guru ini akan dibersihkan dari penyimpanan database untuk menghemat kapasitas. Tindakan ini tidak dapat dibatalkan.
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingTeacher}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteTeacher}
              disabled={deletingTeacher}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground gap-1.5"
            >
              {deletingTeacher ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Menghapus...
                </>
              ) : (
                <>
                  <Trash2 className="h-3.5 w-3.5" /> Ya, Hapus Akun
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
