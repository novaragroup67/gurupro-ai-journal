import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowRight,
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Loader2,
  MessageSquare,
  School,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { exportRekapNilaiCsv, exportRekapNilaiPdf } from "@/lib/exporters";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { useAuth } from "@/lib/auth-store";
import { useKelas } from "@/lib/kelas-store";
import { useTahunAjaran } from "@/lib/tahun-ajaran-store";
import {
  formatNilai,
  getKelasRekapData,
  getSiswaRiwayatNilai,
  type KelasRekapData,
  type SiswaRiwayatNilaiItem,
} from "@/lib/rekap-store";

export const Route = createFileRoute("/penilaian")({
  head: () => ({
    meta: [
      { title: "Rekap Nilai — GuruPro" },
      {
        name: "description",
        content: "Rekapitulasi capaian nilai siswa dan riwayat penilaian tugas terpadu.",
      },
      { property: "og:title", content: "Rekap Nilai — GuruPro" },
      {
        property: "og:description",
        content: "Rekapitulasi capaian nilai siswa dan riwayat penilaian tugas terpadu.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  const { profile, user } = useAuth();
  const isStudent = profile.role === "siswa";

  if (isStudent) {
    return <SiswaRiwayatNilaiView />;
  }

  return <GuruRekapNilaiView />;
}

// ============================================================================
// 1. GURU REKAP NILAI VIEW
// ============================================================================
function GuruRekapNilaiView() {
  const { profile, user } = useAuth();
  const { kelasList, loading: loadingClasses } = useKelas();
  const currentUserId = user?.id || profile?.id;
  const { selectedYear } = useTahunAjaran(currentUserId);

  // Filter hanya kelas milik guru yang login pada tahun ajaran yang dipilih
  const allTeacherClasses = useMemo(() => {
    const list = Array.isArray(kelasList) ? kelasList : [];
    return list.filter((k) => k && k.guruId === currentUserId);
  }, [kelasList, currentUserId]);

  const teacherClasses = useMemo(() => {
    return allTeacherClasses.filter((k) => !selectedYear || k.tahunAjaran === selectedYear);
  }, [allTeacherClasses, selectedYear]);

  const [selectedKelasId, setSelectedKelasId] = useState<string>("");
  const [rekapData, setRekapData] = useState<KelasRekapData | null>(null);
  const [loadingRekap, setLoadingRekap] = useState(false);
  const [rekapError, setRekapError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const handleExportCsv = () => {
    if (!rekapData) {
      toast.error("Data rekapitulasi belum dimuat.");
      return;
    }
    if (rekapData.siswaRows.length === 0) {
      toast.warning("Tidak ada data siswa pada kelas ini untuk diekspor.");
      return;
    }
    try {
      setExportingCsv(true);
      const res = exportRekapNilaiCsv(rekapData);
      toast.success(`Berhasil mengekspor ${res.rowCount} baris data ke "${res.filename}".`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengekspor CSV.");
    } finally {
      setExportingCsv(false);
    }
  };

  const handleExportPdf = async () => {
    if (!rekapData) {
      toast.error("Data rekapitulasi belum dimuat.");
      return;
    }
    if (rekapData.siswaRows.length === 0) {
      toast.warning("Tidak ada data siswa pada kelas ini untuk diekspor.");
      return;
    }
    try {
      setExportingPdf(true);
      const res = await exportRekapNilaiPdf(rekapData, {
        guruNama: profile.nama || user?.email || "Guru Pengampu",
        sekolahNama: profile.sekolah || undefined,
      });
      toast.success(`Laporan PDF "${res.filename}" berhasil dibuat dan diunduh.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membuat laporan PDF.");
    } finally {
      setExportingPdf(false);
    }
  };

  // Responsif terhadap perubahan daftar kelas / tahun ajaran
  useEffect(() => {
    if (teacherClasses.length > 0) {
      if (!teacherClasses.some((k) => k.id === selectedKelasId)) {
        setSelectedKelasId(teacherClasses[0]?.id || "");
      }
    } else {
      setSelectedKelasId("");
      setRekapData(null);
    }
  }, [teacherClasses, selectedKelasId]);

  // Muat data rekapitulasi saat kelas berubah
  useEffect(() => {
    let isCancelled = false;
    if (!selectedKelasId) {
      setRekapData(null);
      setRekapError(null);
      return;
    }

    async function loadRekap() {
      setLoadingRekap(true);
      setRekapError(null);
      try {
        const data = await getKelasRekapData(selectedKelasId);
        if (!isCancelled) {
          setRekapData(data);
        }
      } catch (err) {
        if (!isCancelled) {
          const msg = err instanceof Error ? err.message : "Gagal memuat rekap nilai kelas.";
          setRekapError(msg);
          console.error("Gagal memuat rekap nilai kelas:", err);
        }
      } finally {
        if (!isCancelled) {
          setLoadingRekap(false);
        }
      }
    }

    void loadRekap();
    return () => {
      isCancelled = true;
    };
  }, [selectedKelasId]);

  // Filter siswa berdasarkan input pencarian
  const filteredSiswaRows = useMemo(() => {
    if (!rekapData || !Array.isArray(rekapData.siswaRows)) return [];
    const query = searchQuery.toLowerCase().trim();
    if (!query) return rekapData.siswaRows;
    return rekapData.siswaRows.filter(
      (s) =>
        s &&
        ((s.siswaNama && s.siswaNama.toLowerCase().includes(query)) ||
          (s.siswaNisn && s.siswaNisn.toLowerCase().includes(query))),
    );
  }, [rekapData, searchQuery]);

  const daftarPenugasanSafe = useMemo(() => {
    return Array.isArray(rekapData?.daftarPenugasan) ? rekapData.daftarPenugasan : [];
  }, [rekapData]);

  if (loadingClasses) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-3 text-sm text-muted-foreground">Memuat daftar kelas guru…</p>
      </div>
    );
  }

  if (teacherClasses.length === 0) {
    return (
      <div className="grid gap-6">
        <PageHeader
          title="Rekapitulasi Nilai Siswa"
          subtitle={
            selectedYear
              ? `Pantau nilai tugas, kuis, dan rata-rata capaian belajar murid untuk Tahun Ajaran ${selectedYear}.`
              : "Pantau nilai tugas, kuis, dan rata-rata capaian belajar murid per kelas secara terintegrasi."
          }
        />
        <Card className="border-dashed py-12 text-center">
          <CardContent className="space-y-4">
            <School className="mx-auto h-12 w-12 text-muted-foreground/30" />
            <h3 className="font-display text-lg font-bold text-navy">
              {allTeacherClasses.length > 0
                ? `Belum Ada Kelas di Tahun Ajaran ${selectedYear || "Ini"}`
                : "Belum Ada Kelas Dibuat"}
            </h3>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              {allTeacherClasses.length > 0
                ? `Anda memiliki kelas di tahun ajaran lain. Pilih tahun ajaran yang sesuai melalui selector di header atau tambahkan kelas baru di menu Kelas Saya.`
                : "Anda belum memiliki kelas aktif. Buat kelas terlebih dahulu dan publikasikan penugasan untuk mulai merekap capaian nilai siswa."}
            </p>
            <Button asChild className="gap-2">
              <Link to="/kelas">
                Buka Menu Kelas Saya
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {/* Top Header & Class Selector */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Rekapitulasi Nilai Siswa"
          subtitle="Pantau nilai tugas, kuis, dan rata-rata capaian belajar murid per kelas secara terintegrasi."
        />

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground shrink-0">Pilih Kelas:</span>
            <Select value={selectedKelasId} onValueChange={setSelectedKelasId}>
              <SelectTrigger className="w-[200px] bg-card font-medium shadow-xs">
                <SelectValue placeholder="Pilih Kelas" />
              </SelectTrigger>
              <SelectContent>
                {teacherClasses.map((k) => (
                  <SelectItem key={k.id} value={k.id}>
                    {k.tingkat} {k.namaKelas} ({k.mapel})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={loadingRekap || !rekapData || rekapData.siswaRows.length === 0 || exportingCsv}
              className="gap-1.5 text-xs font-medium"
              title="Ekspor rekapitulasi nilai kelas ini ke format CSV (Excel)"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              {exportingCsv ? "Mengekspor…" : "Ekspor CSV"}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPdf}
              disabled={loadingRekap || !rekapData || rekapData.siswaRows.length === 0 || exportingPdf}
              className="gap-1.5 text-xs font-medium"
              title="Unduh laporan resmi rekapitulasi nilai format PDF"
            >
              <FileText className="h-4 w-4 text-blue-600" />
              {exportingPdf ? "Membuat PDF…" : "Unduh PDF"}
            </Button>
          </div>
        </div>
      </div>

      {loadingRekap ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="mt-3 text-sm text-muted-foreground">Menghitung rekapitulasi nilai kelas…</p>
        </div>
      ) : rekapError ? (
        <Card className="py-10 text-center border-destructive/20 bg-destructive/5">
          <CardContent className="space-y-3">
            <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
            <p className="font-semibold text-foreground">Gagal Memuat Rekapitulasi Nilai</p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              {rekapError}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                const cur = selectedKelasId;
                setSelectedKelasId("");
                setTimeout(() => setSelectedKelasId(cur), 50);
              }}
            >
              Coba Lagi
            </Button>
          </CardContent>
        </Card>
      ) : !rekapData ? (
        <Card className="py-10 text-center">
          <CardContent>
            <AlertCircle className="mx-auto h-10 w-10 text-destructive/50" />
            <p className="mt-3 font-semibold text-navy">Data Kelas Tidak Tersedia</p>
            <p className="text-xs text-muted-foreground">
              Pastikan Anda memiliki hak akses untuk mengelola kelas ini.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Class Summary Metrics (100% Real Database Calculations) */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="transition-shadow hover:shadow-lift">
              <CardContent className="flex items-start gap-3 p-5">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                  <Users className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-display text-2xl font-bold leading-tight text-navy">
                    {rekapData.totalSiswa}
                  </p>
                  <p className="text-sm font-medium">Siswa Aktif</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    Terverifikasi di kelas
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="transition-shadow hover:shadow-lift">
              <CardContent className="flex items-start gap-3 p-5">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                  <ClipboardList className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-display text-2xl font-bold leading-tight text-navy">
                    {daftarPenugasanSafe.length}
                  </p>
                  <p className="text-sm font-medium">Tugas Terbit</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    Penugasan aktif/selesai
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="transition-shadow hover:shadow-lift">
              <CardContent className="flex items-start gap-3 p-5">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-display text-2xl font-bold leading-tight text-navy">
                    {rekapData.totalSubmissionsDinilai}
                  </p>
                  <p className="text-sm font-medium">Pengumpulan Dinilai</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    Telah tuntas dikoreksi
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="transition-shadow hover:shadow-lift">
              <CardContent className="flex items-start gap-3 p-5">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600">
                  <Award className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-display text-2xl font-bold leading-tight text-navy">
                    {formatNilai(rekapData.rataRataKelas)}
                  </p>
                  <p className="text-sm font-medium">Rata-Rata Kelas</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {rekapData.rataRataKelas !== null ? "Rata-rata kumulatif" : "Belum ada nilai"}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Rekap Table Card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="font-display text-base text-navy">
                    Matriks Nilai Siswa — {rekapData.namaKelas}
                  </CardTitle>
                  <CardDescription>
                    {rekapData.tingkat} · {rekapData.mapel} · Tahun Ajaran {rekapData.tahunAjaran}
                  </CardDescription>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cari nama atau NISN siswa…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 text-xs shadow-xs"
                  />
                </div>
              </div>
            </CardHeader>

            <CardContent className="px-0 sm:px-6">
              {rekapData.totalSiswa === 0 ? (
                <div className="py-12 text-center">
                  <Users className="mx-auto h-10 w-10 text-muted-foreground/30" />
                  <p className="mt-3 font-display text-base font-semibold text-navy">
                    Belum Ada Siswa Aktif
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Verifikasi siswa yang mendaftar pada tab Anggota di menu Kelas Saya.
                  </p>
                </div>
              ) : daftarPenugasanSafe.length === 0 ? (
                <div className="py-12 text-center">
                  <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground/30" />
                  <p className="mt-3 font-display text-base font-semibold text-navy">
                    Belum Ada Penugasan Terbit
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Buat dan terbitkan penugasan untuk kelas ini di menu Penugasan agar nilai dapat
                    direkap.
                  </p>
                </div>
              ) : filteredSiswaRows.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  Tidak ditemukan siswa yang sesuai dengan kata kunci pencarian.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12 text-center">No</TableHead>
                        <TableHead className="min-w-[180px]">Nama Siswa</TableHead>
                        <TableHead className="w-28">NISN</TableHead>

                        {/* Assignment Columns */}
                        {/* Assignment Columns */}
                        {daftarPenugasanSafe.map((tugas) => (
                          <TableHead
                            key={tugas.id}
                            className="text-center min-w-[130px] max-w-[170px]"
                            title={tugas.judul}
                          >
                            <span className="block truncate font-semibold">{tugas.judul}</span>
                            <span className="block text-[10px] text-muted-foreground font-normal">
                              KKM: {tugas.kkm ?? 75}
                              {tugas.remedialEnabled ? " · Remedial" : ""}
                            </span>
                          </TableHead>
                        ))}

                        <TableHead className="w-28 text-center font-bold text-navy">
                          Rata-Rata
                        </TableHead>
                        <TableHead className="w-28 text-center">Kelengkapan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSiswaRows.map((siswa, idx) => {
                        const totalTugas = daftarPenugasanSafe.length;
                        const isLengkap =
                          totalTugas > 0 && siswa.totalTugasDinilai === totalTugas;
                        const isSebagian =
                          siswa.totalTugasDinilai > 0 && siswa.totalTugasDinilai < totalTugas;

                        return (
                          <TableRow key={siswa.siswaId}>
                            <TableCell className="text-center font-mono text-xs text-muted-foreground">
                              {idx + 1}
                            </TableCell>
                            <TableCell className="font-semibold text-navy">
                              {siswa.siswaNama}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {siswa.siswaNisn || "—"}
                            </TableCell>

                            {/* Nilai Per Tugas */}
                            {daftarPenugasanSafe.map((tugas) => {
                              const nilaiItem = siswa?.nilaiPerTugas?.[tugas.id];

                              if (!nilaiItem || nilaiItem.statusPengumpulan === "belum_mengumpulkan") {
                                return (
                                  <TableCell
                                    key={tugas.id}
                                    className="text-center text-xs text-muted-foreground"
                                  >
                                    <span title="Belum Mengumpulkan">—</span>
                                  </TableCell>
                                );
                              }

                              if (nilaiItem.statusPenilaian === "dinilai" && nilaiItem.nilaiAkhir !== null) {
                                const kkm = tugas.kkm ?? 75;
                                const hasRem = nilaiItem.nilaiRemedial !== null;
                                const effectiveScore = nilaiItem.nilaiAktif ?? nilaiItem.nilaiAkhir;
                                const isTuntas = effectiveScore >= kkm;

                                return (
                                  <TableCell
                                    key={tugas.id}
                                    className="text-center font-mono text-xs"
                                  >
                                    <div className="inline-flex flex-col items-center gap-0.5">
                                      <span
                                        className={`rounded-md px-2 py-0.5 font-bold border ${
                                          isTuntas
                                            ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                                            : "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800"
                                        }`}
                                        title={isTuntas ? "Tuntas" : "Belum Tuntas"}
                                      >
                                        {formatNilai(effectiveScore)}
                                      </span>
                                      {hasRem && (
                                        <span
                                          className="text-[10px] text-purple-700 dark:text-purple-400 font-sans"
                                          title={`Nilai Murni: ${formatNilai(nilaiItem.nilaiMurni)} | Remedial: ${formatNilai(nilaiItem.nilaiRemedial)}`}
                                        >
                                          M:{formatNilai(nilaiItem.nilaiMurni)} R:{formatNilai(nilaiItem.nilaiRemedial)}
                                        </span>
                                      )}
                                    </div>
                                  </TableCell>
                                );
                              }

                              if (nilaiItem.statusPenilaian === "perlu_penilaian_manual") {
                                return (
                                  <TableCell key={tugas.id} className="text-center">
                                    <Badge
                                      variant="outline"
                                      className="border-amber-300 bg-amber-50 text-[11px] font-medium text-amber-800"
                                      title="Perlu Koreksi Manual Guru"
                                    >
                                      Perlu Koreksi
                                    </Badge>
                                  </TableCell>
                                );
                              }

                              if (nilaiItem.statusPengumpulan === "submitted") {
                                return (
                                  <TableCell key={tugas.id} className="text-center">
                                    <Badge
                                      variant="outline"
                                      className="border-blue-300 bg-blue-50 text-[11px] font-medium text-blue-800"
                                      title="Tugas Terkumpul, Belum Dinilai"
                                    >
                                      Terkumpul
                                    </Badge>
                                  </TableCell>
                                );
                              }

                              return (
                                <TableCell key={tugas.id} className="text-center">
                                  <Badge
                                    variant="secondary"
                                    className="text-[11px] text-muted-foreground"
                                    title="Pengerjaan Draf"
                                  >
                                    Draf
                                  </Badge>
                                </TableCell>
                              );
                            })}

                            {/* Rata-rata Nilai Siswa */}
                            <TableCell className="text-center font-mono text-sm font-bold text-navy">
                              {siswa.rataRata !== null ? (
                                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-primary">
                                  {formatNilai(siswa.rataRata)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>

                            {/* Kelengkapan Penilaian */}
                            <TableCell className="text-center">
                              {isLengkap ? (
                                <Badge className="bg-emerald-600 hover:bg-emerald-700 text-[11px]">
                                  Lengkap
                                </Badge>
                              ) : isSebagian ? (
                                <Badge variant="outline" className="border-blue-300 text-blue-700 text-[11px]">
                                  {siswa.totalTugasDinilai}/{totalTugas} Dinilai
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[11px] text-muted-foreground">
                                  Belum Dinilai
                                </Badge>
                              )}
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
        </>
      )}
    </div>
  );
}

// ============================================================================
// 2. SISWA RIWAYAT NILAI VIEW
// ============================================================================
function SiswaRiwayatNilaiView() {
  const { profile, user } = useAuth();
  const currentUserId = user?.id || profile?.id;

  const [riwayatList, setRiwayatList] = useState<SiswaRiwayatNilaiItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [riwayatError, setRiwayatError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let isCancelled = false;
    async function loadData() {
      if (!currentUserId) return;
      setLoading(true);
      setRiwayatError(null);
      try {
        const items = await getSiswaRiwayatNilai(currentUserId);
        if (!isCancelled) {
          setRiwayatList(Array.isArray(items) ? items : []);
        }
      } catch (err) {
        console.error("Gagal memuat riwayat nilai siswa:", err);
        if (!isCancelled) {
          const msg = err instanceof Error ? err.message : "Gagal memuat riwayat nilai siswa.";
          setRiwayatError(msg);
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    void loadData();
    return () => {
      isCancelled = true;
    };
  }, [currentUserId, retryKey]);

  const safeRiwayatList = useMemo(() => {
    return Array.isArray(riwayatList) ? riwayatList : [];
  }, [riwayatList]);

  const gradedList = useMemo(() => {
    return safeRiwayatList.filter((r) => r && r.statusPenilaian === "dinilai" && r.nilaiAkhir !== null);
  }, [safeRiwayatList]);

  const studentAverage = useMemo(() => {
    if (gradedList.length === 0) return null;
    const sum = gradedList.reduce((acc, curr) => acc + (curr.nilaiAkhir || 0), 0);
    return Math.round((sum / gradedList.length) * 10) / 10;
  }, [gradedList]);

  const submittedCount = useMemo(() => {
    return safeRiwayatList.filter((r) => r && r.statusPengumpulan === "submitted").length;
  }, [safeRiwayatList]);

  if (loading) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-3 text-sm text-muted-foreground">Memuat riwayat nilai tugas Anda…</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Riwayat Nilai Siswa"
        subtitle="Lihat hasil evaluasi, perolehan nilai tugas, dan catatan umpan balik dari guru Anda."
      />

      {riwayatError ? (
        <Card className="py-10 text-center border-destructive/20 bg-destructive/5">
          <CardContent className="space-y-3">
            <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
            <p className="font-semibold text-foreground">Gagal Memuat Riwayat Nilai</p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              {riwayatError}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => setRetryKey((k) => k + 1)}
            >
              Coba Lagi
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="transition-shadow hover:shadow-lift">
              <CardContent className="flex items-start gap-3 p-5">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                  <Award className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-display text-2xl font-bold leading-tight text-navy">
                    {gradedList.length}
                  </p>
                  <p className="text-sm font-medium">Tugas Selesai Dinilai</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    Hasil evaluasi tersedia
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="transition-shadow hover:shadow-lift">
              <CardContent className="flex items-start gap-3 p-5">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                  <Sparkles className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-display text-2xl font-bold leading-tight text-navy">
                    {formatNilai(studentAverage)}
                  </p>
                  <p className="text-sm font-medium">Rata-Rata Nilai</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {studentAverage !== null ? "Akumulasi tugas dinilai" : "Belum ada nilai"}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="transition-shadow hover:shadow-lift">
              <CardContent className="flex items-start gap-3 p-5">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                  <ClipboardList className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-display text-2xl font-bold leading-tight text-navy">
                    {submittedCount}
                  </p>
                  <p className="text-sm font-medium">Total Tugas Terkumpul</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    Terkumpul di sistem
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* History Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-base text-navy">
                Daftar Nilai & Evaluasi Tugas
              </CardTitle>
              <CardDescription>
                Rekap nilai resmi dari penugasan yang telah Anda kerjakan dan kumpulkan.
              </CardDescription>
            </CardHeader>

            <CardContent className="px-0 sm:px-6">
              {safeRiwayatList.length === 0 ? (
                <div className="py-12 text-center">
                  <GraduationCap className="mx-auto h-12 w-12 text-muted-foreground/30" />
                  <p className="mt-3 font-display text-base font-semibold text-navy">
                    Belum Ada Riwayat Nilai
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
                    Nilai akan muncul di sini secara otomatis setelah tugas yang Anda kumpulkan selesai
                    diperiksa dan dinilai oleh bapak/ibu guru.
                  </p>
                  <Button asChild className="mt-6 gap-2" variant="outline">
                    <Link to="/penugasan">
                      Lihat Tugas Tersedia
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12 text-center">No</TableHead>
                        <TableHead>Judul Tugas</TableHead>
                        <TableHead>Kelas & Mapel</TableHead>
                        <TableHead className="text-center w-20">KKM</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                        <TableHead className="text-center">Nilai Akhir</TableHead>
                        <TableHead>Catatan / Umpan Balik Guru</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {safeRiwayatList.map((item, idx) => {
                        const isGraded =
                          item.statusPenilaian === "dinilai" && item.nilaiAkhir !== null;
                        const isReview = item.statusPenilaian === "perlu_penilaian_manual";
                        const kkm = item.kkm ?? 75;
                        const effectiveScore = item.nilaiAktif ?? item.nilaiAkhir;
                        const hasRemedial = item.nilaiRemedial !== null;
                        const isTuntas = effectiveScore !== null && effectiveScore >= kkm;

                        return (
                          <TableRow key={item.pengumpulanId}>
                            <TableCell className="text-center font-mono text-xs text-muted-foreground">
                              {idx + 1}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <p className="font-semibold text-navy">{item.penugasanJudul}</p>
                                {item.remedialEnabled && (
                                  <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200 text-[10px]">
                                    Remedial
                                  </Badge>
                                )}
                              </div>
                              {item.submittedAt && (
                                <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                  <Calendar className="h-3 w-3" />
                                  Disubmit: {new Date(item.submittedAt).toLocaleDateString("id-ID")}
                                </p>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {item.kelasNama} · {item.kelasMapel}
                            </TableCell>
                            <TableCell className="text-center font-mono text-xs font-semibold text-muted-foreground">
                              {kkm}
                            </TableCell>
                            <TableCell className="text-center">
                              {isGraded ? (
                                <Badge
                                  className={`text-[11px] ${
                                    isTuntas
                                      ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                                      : "bg-rose-600 hover:bg-rose-700 text-white"
                                  }`}
                                >
                                  {isTuntas ? "Tuntas" : "Belum Tuntas"}
                                </Badge>
                              ) : isReview ? (
                                <Badge
                                  variant="outline"
                                  className="border-amber-300 bg-amber-50 text-[11px] text-amber-800"
                                >
                                  Sedang Dikoreksi
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[11px]">
                                  Menunggu Penilaian
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {isGraded ? (
                                <div className="inline-flex flex-col items-center">
                                  <span className="font-mono text-base font-bold text-navy">
                                    {formatNilai(effectiveScore)}
                                  </span>
                                  {hasRemedial ? (
                                    <span className="text-[10px] text-purple-700 dark:text-purple-400 font-mono">
                                      Murni: {formatNilai(item.nilaiMurni)} | Remedial: {formatNilai(item.nilaiRemedial)}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground font-mono">
                                      Nilai Murni: {formatNilai(item.nilaiMurni ?? item.nilaiAkhir)}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="font-mono text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {item.catatanGuru ? (
                                <div className="flex items-start gap-1.5 text-xs text-navy bg-muted/40 p-2 rounded-lg border border-border/60 max-w-sm">
                                  <MessageSquare className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                                  <span className="italic">{item.catatanGuru}</span>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground italic">
                                  Tidak ada catatan khusus
                                </span>
                              )}
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
        </>
      )}
    </div>
  );
}
