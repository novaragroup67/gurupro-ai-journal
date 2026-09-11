import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  FileQuestion,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  School,
  Share2,
  Sparkles,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { initials, useAuth } from "@/lib/auth-store";
import {
  getKelasById,
  setujuiAnggota,
  tolakAnggota,
  useKelas,
  type AnggotaKelas,
  type Kelas,
} from "@/lib/kelas-store";
import { useModuls } from "@/lib/modul-store";
import { usePaketSoal } from "@/lib/soal-store";

export const Route = createFileRoute("/kelas/$kelasId")({
  head: () => ({
    meta: [
      { title: "Monitoring Hub Kelas — GuruPro" },
      {
        name: "description",
        content:
          "Pusat monitoring aktivitas kelas, anggota, modul ajar, tugas aktif, dan rekap nilai.",
      },
    ],
  }),
  component: DetailKelasMonitoringPage,
});

function formatTanggal(isoDate: string) {
  try {
    const d = new Date(isoDate);
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return isoDate;
  }
}

function DetailKelasMonitoringPage() {
  const { kelasId } = Route.useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { kelasList, anggotaList, refresh } = useKelas();

  // Local state for direct reload / fallback fetching
  const [kelasDetail, setKelasDetail] = useState<Kelas | null>(null);
  const [loadingKelas, setLoadingKelas] = useState(true);
  const [targetTolak, setTargetTolak] = useState<AnggotaKelas | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedKode, setCopiedKode] = useState(false);

  // Store data untuk tab modul dan tugas
  const allModuls = useModuls();
  const allPakets = usePaketSoal();

  // Ambil kelas dari cache atau Supabase
  useEffect(() => {
    let active = true;
    const fromCache = kelasList.find((k) => k.id === kelasId);
    if (fromCache) {
      setKelasDetail(fromCache);
      setLoadingKelas(false);
      return;
    }

    setLoadingKelas(true);
    getKelasById(kelasId)
      .then((k) => {
        if (active) setKelasDetail(k);
      })
      .finally(() => {
        if (active) setLoadingKelas(false);
      });

    return () => {
      active = false;
    };
  }, [kelasId, kelasList]);

  // Siswa anggota kelas
  const anggotaKelas = anggotaList.filter((a) => a.kelasId === kelasId);
  const menungguList = anggotaKelas.filter((a) => a.status === "menunggu");
  const aktifList = anggotaKelas.filter((a) => a.status === "aktif");

  const getLinkUndangan = (kode: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://gurupro.app";
    return `${origin}/gabung/${kode}`;
  };

  const handleSalinKode = (kode: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(kode);
      setCopiedKode(true);
      setTimeout(() => setCopiedKode(false), 2000);
      toast.success(`Kode kelas ${kode} berhasil disalin!`);
    }
  };

  const handleSalinLink = (kode: string) => {
    const link = getLinkUndangan(kode);
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      toast.success("Tautan undangan kelas berhasil disalin!");
    }
  };

  // Aksi persetujuan siswa
  const handleSetujui = async (item: AnggotaKelas) => {
    const ok = await setujuiAnggota(item.id);
    if (ok) {
      toast.success(`Siswa ${item.siswaNama} berhasil disetujui bergabung!`);
      await refresh();
    } else {
      toast.error("Gagal menyetujui siswa.");
    }
  };

  const handleKonfirmasiTolak = async () => {
    if (!targetTolak) return;
    const ok = await tolakAnggota(targetTolak.id);
    if (ok) {
      toast.success(`Permintaan bergabung dari ${targetTolak.siswaNama} telah ditolak.`);
      await refresh();
    } else {
      toast.error("Gagal menolak siswa.");
    }
    setTargetTolak(null);
  };

  // Filter modul ajar untuk kelas ini
  const modulKelas = allModuls.filter((m) => {
    if (!kelasDetail) return true;
    const normModulKelas = m.kelas.toLowerCase();
    const normTargetKelas = kelasDetail.namaKelas.toLowerCase();
    const normTingkat = kelasDetail.tingkat.toLowerCase();
    const normMapel = kelasDetail.mapel.toLowerCase();

    return (
      normModulKelas.includes(normTargetKelas) ||
      normModulKelas.includes(normTingkat) ||
      m.mapel.toLowerCase().includes(normMapel)
    );
  });

  // Filter tugas/soal untuk kelas ini
  const tugasKelas = allPakets.filter((p) => {
    if (!kelasDetail) return true;
    if (p.kelas && p.kelas.length > 0) {
      return p.kelas.some(
        (k) =>
          k.toLowerCase().includes(kelasDetail.namaKelas.toLowerCase()) ||
          k.toLowerCase().includes(kelasDetail.tingkat.toLowerCase()),
      );
    }
    return true;
  });

  // Dummy helper nilai siswa aktif untuk tab rekap nilai
  const getNilaiSiswa = (index: number) => {
    const seedNilai = [
      { tugas: 88, kuis: 92, uts: 85, akhir: 88, predikat: "A" },
      { tugas: 82, kuis: 80, uts: 86, akhir: 83, predikat: "B+" },
      { tugas: 90, kuis: 95, uts: 92, akhir: 92, predikat: "A" },
      { tugas: 78, kuis: 75, uts: 80, akhir: 78, predikat: "B" },
      { tugas: 85, kuis: 88, uts: 84, akhir: 86, predikat: "A" },
      { tugas: 92, kuis: 90, uts: 95, akhir: 93, predikat: "A" },
      { tugas: 76, kuis: 82, uts: 78, akhir: 79, predikat: "B" },
    ];
    return seedNilai[index % seedNilai.length]!;
  };

  const handleEksporNilaiPDF = () => {
    if (!kelasDetail) return;
    toast.success(
      `Rekap nilai kelas ${kelasDetail.tingkat} ${kelasDetail.namaKelas} (PDF) berhasil dipersiapkan untuk diunduh.`,
    );
  };

  if (loadingKelas) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-3 text-sm text-muted-foreground">Memuat data kelas dan monitoring…</p>
      </div>
    );
  }

  if (!kelasDetail) {
    return (
      <div className="grid gap-6">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/kelas">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Kembali ke Kelas Saya
            </Link>
          </Button>
        </div>
        <Card className="border-destructive/30 py-12 text-center">
          <CardContent>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <AlertCircle className="h-7 w-7" />
            </div>
            <h2 className="mt-4 font-display text-xl font-bold text-navy">Kelas Tidak Ditemukan</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Kelas yang Anda cari mungkin sudah dihapus atau ID tidak sesuai.
            </p>
            <Button asChild className="mt-6" variant="outline">
              <Link to="/kelas">Lihat Semua Kelas</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {/* Top Bar / Navigation Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="h-9 gap-1.5 font-medium">
            <Link to="/kelas">
              <ArrowLeft className="h-4 w-4" />
              Kembali ke Kelas Saya
            </Link>
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 shadow-xs">
            <span className="text-xs text-muted-foreground">Kode Kelas:</span>
            <code className="font-mono text-sm font-bold text-primary">
              {kelasDetail.kodeKelas}
            </code>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-primary"
              onClick={() => handleSalinKode(kelasDetail.kodeKelas)}
              title="Salin Kode"
            >
              {copiedKode ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>

          <Button
            size="sm"
            variant="default"
            onClick={() => handleSalinLink(kelasDetail.kodeKelas)}
            className="h-9 gap-1.5 font-medium shadow-xs"
          >
            {copiedLink ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
            Salin Link Undangan
          </Button>
        </div>
      </div>

      {/* Info Banner Kelas */}
      <Card className="border-primary/20 bg-linear-to-r from-primary-soft/40 via-card to-card shadow-xs">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-primary hover:bg-primary/90">
                {kelasDetail.tingkat} · {kelasDetail.mapel}
              </Badge>
              <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">
                Tahun Ajaran {kelasDetail.tahunAjaran}
              </Badge>
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-navy sm:text-3xl">
              {kelasDetail.namaKelas}
            </h1>
            <p className="text-sm text-muted-foreground">
              Monitoring Hub: Pantau anggota, penugasan, modul ajar, dan capaian belajar siswa
              secara terpusat.
            </p>
          </div>

          <div className="flex items-center gap-6 rounded-xl border bg-card/80 px-4 py-3 shadow-xs">
            <div className="text-center">
              <p className="font-display text-2xl font-bold text-navy">{aktifList.length}</p>
              <p className="text-xs text-muted-foreground">Murid Aktif</p>
            </div>
            <div className="h-8 w-px bg-border" />
            <div className="text-center">
              <p
                className={`font-display text-2xl font-bold ${menungguList.length > 0 ? "text-amber-600" : "text-muted-foreground"}`}
              >
                {menungguList.length}
              </p>
              <p className="text-xs text-muted-foreground">Menunggu Verifikasi</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4 Tabs Monitoring */}
      <Tabs defaultValue="anggota" className="grid gap-6">
        <TabsList className="grid w-full grid-cols-2 md:w-auto md:inline-flex md:grid-cols-4">
          <TabsTrigger value="anggota" className="gap-2">
            <Users className="h-4 w-4" />
            <span>Anggota & Verifikasi</span>
            {menungguList.length > 0 ? (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[11px] font-bold text-white">
                {menungguList.length}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="modul" className="gap-2">
            <BookOpen className="h-4 w-4" />
            <span>Modul Ajar</span>
          </TabsTrigger>
          <TabsTrigger value="tugas" className="gap-2">
            <FileQuestion className="h-4 w-4" />
            <span>Tugas Aktif</span>
          </TabsTrigger>
          <TabsTrigger value="nilai" className="gap-2">
            <GraduationCap className="h-4 w-4" />
            <span>Rekap Nilai</span>
          </TabsTrigger>
        </TabsList>

        {/* ================= TAB 1: ANGGOTA & VERIFIKASI ================= */}
        <TabsContent value="anggota" className="space-y-6">
          {/* Section 1: Permintaan Bergabung */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="font-display text-base text-navy">
                    Permintaan Bergabung (Menunggu Persetujuan)
                  </CardTitle>
                  <CardDescription>
                    Calon murid yang telah mendaftar menggunakan kode kelas Anda dan memerlukan
                    verifikasi.
                  </CardDescription>
                </div>
                {menungguList.length > 0 ? (
                  <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-700">
                    {menungguList.length} Permintaan
                  </Badge>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              {menungguList.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  <UserCheck className="mx-auto h-8 w-8 text-muted-foreground/40" />
                  <p className="mt-2 font-medium">Tidak ada siswa yang menunggu persetujuan.</p>
                  <p className="text-xs">
                    Semua permintaan bergabung ke kelas ini telah selesai diproses.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nama Siswa</TableHead>
                        <TableHead>NISN</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Tanggal Diajukan</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {menungguList.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-semibold text-navy">
                            <div className="flex items-center gap-2.5">
                              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-xs font-bold text-primary">
                                {initials(item.siswaNama)}
                              </span>
                              <span>{item.siswaNama}</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {item.siswaNisn || "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {item.siswaEmail}
                          </TableCell>
                          <TableCell className="text-xs">{formatTanggal(item.diajukan)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="default"
                                className="h-8 gap-1 bg-emerald-600 px-2.5 text-xs text-white hover:bg-emerald-700"
                                onClick={() => handleSetujui(item)}
                              >
                                <Check className="h-3.5 w-3.5" />
                                Setujui
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 gap-1 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => setTargetTolak(item)}
                              >
                                <X className="h-3.5 w-3.5" />
                                Tolak
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

          {/* Section 2: Daftar Siswa Aktif */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="font-display text-base text-navy">
                    Daftar Siswa Aktif
                  </CardTitle>
                  <CardDescription>
                    Siswa terdaftar yang telah diverifikasi dan memiliki akses penuh ke materi serta
                    tugas kelas ini.
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="gap-1">
                  <Users className="h-3 w-3" />
                  Total {aktifList.length} Murid
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              {aktifList.length === 0 ? (
                <div className="py-12 text-center">
                  <School className="mx-auto h-10 w-10 text-muted-foreground/30" />
                  <p className="mt-3 font-display text-base font-semibold text-navy">
                    Belum Ada Siswa Aktif di Kelas Ini
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Bagikan kode kelas <strong>{kelasDetail.kodeKelas}</strong> atau tautan
                    pendaftaran kepada siswa untuk mulai belajar bersama.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 gap-1.5"
                    onClick={() => handleSalinLink(kelasDetail.kodeKelas)}
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    Salin Link Undangan
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12 text-center">No</TableHead>
                        <TableHead>Nama Lengkap</TableHead>
                        <TableHead>NISN</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead className="text-right">Tanggal Bergabung</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {aktifList.map((siswa, idx) => (
                        <TableRow key={siswa.id}>
                          <TableCell className="text-center font-mono text-xs text-muted-foreground">
                            {idx + 1}
                          </TableCell>
                          <TableCell className="font-semibold text-navy">
                            <div className="flex items-center gap-2.5">
                              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary text-xs font-bold text-secondary-foreground">
                                {initials(siswa.siswaNama)}
                              </span>
                              <span>{siswa.siswaNama}</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {siswa.siswaNisn || "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {siswa.siswaEmail}
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {formatTanggal(siswa.diajukan)}
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

        {/* ================= TAB 2: MODUL AJAR (MONITORING) ================= */}
        <TabsContent value="modul" className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="font-display text-base text-navy">
                    Modul Ajar Aktif ({kelasDetail.namaKelas})
                  </CardTitle>
                  <CardDescription>
                    Perangkat ajar dan materi kurikulum yang telah disusun untuk kelas{" "}
                    {kelasDetail.tingkat} {kelasDetail.namaKelas}.
                  </CardDescription>
                </div>
                <Button asChild size="sm" className="gap-1.5 shadow-xs font-medium">
                  <Link to="/modul-ajar">
                    <Plus className="h-3.5 w-3.5" />
                    Susun Modul Baru
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              {modulKelas.length === 0 ? (
                <div className="py-12 text-center">
                  <BookOpen className="mx-auto h-10 w-10 text-muted-foreground/30" />
                  <p className="mt-3 font-display text-base font-semibold text-navy">
                    Belum Ada Modul Khusus untuk Kelas Ini
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Susun modul ajar dengan bantuan GuruPro AI secara cepat untuk mata pelajaran{" "}
                    {kelasDetail.mapel}.
                  </p>
                  <Button asChild className="mt-4 gap-2">
                    <Link to="/modul-ajar">
                      <Sparkles className="h-4 w-4" />
                      Buat Modul Ajar Baru
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Judul Modul</TableHead>
                        <TableHead>Jumlah Bab / Bagian</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Terakhir Diperbarui</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {modulKelas.map((modul) => (
                        <TableRow key={modul.id}>
                          <TableCell className="font-semibold text-navy">
                            <div>
                              <p>{modul.judul}</p>
                              <p className="text-xs font-normal text-muted-foreground">
                                {modul.mapel} · {modul.sumberTipe}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-mono text-xs">
                              {modul.sections.length} Bab
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {modul.status === "Terbit" ? (
                              <Badge className="bg-emerald-600 hover:bg-emerald-700">Terbit</Badge>
                            ) : (
                              <Badge variant="secondary">Draft</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatTanggal(modul.updatedAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button asChild variant="ghost" size="sm" className="h-8 gap-1 text-xs">
                              <Link to="/modul-ajar">
                                Buka Modul
                                <ArrowRight className="h-3 w-3" />
                              </Link>
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

        {/* ================= TAB 3: TUGAS AKTIF (MONITORING) ================= */}
        <TabsContent value="tugas" className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="font-display text-base text-navy">
                    Tugas & Penugasan Berjalan
                  </CardTitle>
                  <CardDescription>
                    Status paket tugas, batas waktu pengerjaan, dan rasio pengumpulan siswa di kelas{" "}
                    {kelasDetail.namaKelas}.
                  </CardDescription>
                </div>
                <Button asChild size="sm" className="gap-1.5 shadow-xs font-medium">
                  <Link to="/soal">
                    <Plus className="h-3.5 w-3.5" />
                    Terbitkan Tugas Baru
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              {tugasKelas.length === 0 ? (
                <div className="py-12 text-center">
                  <FileQuestion className="mx-auto h-10 w-10 text-muted-foreground/30" />
                  <p className="mt-3 font-display text-base font-semibold text-navy">
                    Belum Ada Tugas Aktif
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Buat paket soal baru dan terbitkan sebagai tugas untuk dikerjakan murid kelas{" "}
                    {kelasDetail.namaKelas}.
                  </p>
                  <Button asChild className="mt-4 gap-2">
                    <Link to="/soal">
                      <FileQuestion className="h-4 w-4" />
                      Susun Tugas dari Bank Soal
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nama Tugas / Soal</TableHead>
                        <TableHead>Topik Materi</TableHead>
                        <TableHead>Jumlah Soal</TableHead>
                        <TableHead>Progres Pengumpulan</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tugasKelas.map((tugas, idx) => {
                        const totalSiswa = aktifList.length || 30;
                        const terkumpul = Math.min(
                          totalSiswa,
                          Math.max(1, Math.round(totalSiswa * (0.75 + (idx % 3) * 0.08))),
                        );

                        return (
                          <TableRow key={tugas.id}>
                            <TableCell className="font-semibold text-navy">{tugas.judul}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {tugas.topik}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="font-mono text-xs">
                                {tugas.soal.length} Butir
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
                                  <div
                                    className="h-full bg-primary"
                                    style={{
                                      width: `${(terkumpul / totalSiswa) * 100}%`,
                                    }}
                                  />
                                </div>
                                <span className="font-mono text-xs font-semibold">
                                  {terkumpul}/{totalSiswa} Siswa
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {tugas.status === "Terbit" ? (
                                <Badge className="bg-emerald-600 hover:bg-emerald-700">
                                  Berjalan
                                </Badge>
                              ) : (
                                <Badge variant="secondary">Draft</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                asChild
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1 text-xs"
                              >
                                <Link to="/soal">
                                  Detail Soal
                                  <ArrowRight className="h-3 w-3" />
                                </Link>
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
        </TabsContent>

        {/* ================= TAB 4: REKAP NILAI (MONITORING) ================= */}
        <TabsContent value="nilai" className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="font-display text-base text-navy">
                    Rekapitulasi Nilai Siswa
                  </CardTitle>
                  <CardDescription>
                    Ringkasan capaian nilai tugas, kuis, dan ujian seluruh murid aktif di kelas{" "}
                    {kelasDetail.namaKelas}.
                  </CardDescription>
                </div>
                <Button
                  onClick={handleEksporNilaiPDF}
                  size="sm"
                  variant="outline"
                  className="gap-1.5 shadow-xs font-medium"
                >
                  <Download className="h-3.5 w-3.5" />
                  Ekspor Rekap Nilai (PDF)
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              {aktifList.length === 0 ? (
                <div className="py-12 text-center">
                  <GraduationCap className="mx-auto h-10 w-10 text-muted-foreground/30" />
                  <p className="mt-3 font-display text-base font-semibold text-navy">
                    Belum Ada Data Siswa Aktif
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Verifikasi siswa yang mendaftar terlebih dahulu pada tab Anggota untuk mulai
                    merekap nilai mereka.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12 text-center">No</TableHead>
                        <TableHead>Nama Siswa</TableHead>
                        <TableHead>NISN</TableHead>
                        <TableHead className="text-center">Nilai Tugas</TableHead>
                        <TableHead className="text-center">Nilai Kuis</TableHead>
                        <TableHead className="text-center">UTS / PTS</TableHead>
                        <TableHead className="text-center">Nilai Akhir</TableHead>
                        <TableHead className="text-center">Predikat</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {aktifList.map((siswa, idx) => {
                        const nilai = getNilaiSiswa(idx);
                        return (
                          <TableRow key={siswa.id}>
                            <TableCell className="text-center font-mono text-xs text-muted-foreground">
                              {idx + 1}
                            </TableCell>
                            <TableCell className="font-semibold text-navy">
                              {siswa.siswaNama}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {siswa.siswaNisn || "—"}
                            </TableCell>
                            <TableCell className="text-center font-mono text-xs">
                              {nilai.tugas}
                            </TableCell>
                            <TableCell className="text-center font-mono text-xs">
                              {nilai.kuis}
                            </TableCell>
                            <TableCell className="text-center font-mono text-xs">
                              {nilai.uts}
                            </TableCell>
                            <TableCell className="text-center font-mono text-sm font-bold text-navy">
                              {nilai.akhir}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge
                                variant="secondary"
                                className={
                                  nilai.predikat === "A"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-blue-100 text-blue-800"
                                }
                              >
                                {nilai.predikat}
                              </Badge>
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
        </TabsContent>
      </Tabs>

      {/* Dialog Konfirmasi Tolak Siswa */}
      <AlertDialog open={!!targetTolak} onOpenChange={(open) => !open && setTargetTolak(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tolak Permintaan Bergabung?</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menolak permohonan siswa{" "}
              <strong>{targetTolak?.siswaNama}</strong>? Siswa ini tidak akan masuk ke dalam daftar
              murid kelas {kelasDetail.namaKelas}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleKonfirmasiTolak}
            >
              Ya, Tolak Permintaan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
