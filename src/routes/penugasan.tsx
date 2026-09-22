import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowLeft,
  Award,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  Edit3,
  Eye,
  FileQuestion,
  HelpCircle,
  Loader2,
  Lock,
  MessageSquare,
  Plus,
  Save,
  School,
  Send,
  Sparkles,
  Trash2,
  Users,
  X,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-store";
import { useKelasList } from "@/lib/kelas-store";
import { useTahunAjaran } from "@/lib/tahun-ajaran-store";
import {
  createDraftSubmission,
  getMyAnswers,
  getMySubmission,
  getSoalForSiswa,
  getTeacherPaketSoal,
  getTeacherSubmissions,
  gradeSubmission,
  PenugasanJawaban,
  PenugasanPengumpulan,
  SanitizedSoal,
  saveAnswer,
  submitAssignment,
  TeacherSubmissionItem,
} from "@/lib/pengumpulan-store";
import {
  closePenugasan,
  createPenugasan,
  deletePenugasan,
  Penugasan,
  publishPenugasan,
  updatePenugasan,
  usePenugasanGuru,
  usePenugasanSiswa,
} from "@/lib/penugasan-store";
import { usePaketSoal } from "@/lib/soal-store";

export const Route = createFileRoute("/penugasan")({
  head: () => ({
    meta: [
      { title: "Penugasan — GuruPro" },
      {
        name: "description",
        content:
          "Kelola tugas siswa, hubungkan paket soal ke kelas, dan pantau instruksi penugasan.",
      },
      { property: "og:title", content: "Penugasan — GuruPro" },
      {
        property: "og:description",
        content:
          "Kelola tugas siswa, hubungkan paket soal ke kelas, dan pantau instruksi penugasan.",
      },
    ],
  }),
  component: PenugasanRoutePage,
});

function PenugasanRoutePage() {
  const { profile, ready } = useAuth();

  if (!ready) {
    return (
      <div className="grid min-h-[50vh] place-items-center text-sm text-muted-foreground">
        Memuat data penugasan…
      </div>
    );
  }

  if (profile.role === "guru") {
    return <GuruPenugasanView />;
  }

  if (profile.role === "siswa") {
    return <SiswaPenugasanView />;
  }

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Users className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">Peran Akun Belum Terdaftar</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Akun Anda belum memiliki peran aktif (Guru atau Siswa) yang terdaftar.
        </p>
        <div className="pt-2 flex justify-center">
          <Button asChild variant="default">
            <Link to="/profil">Lengkapi Profil Saya</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 1. TAMPILAN GURU: MANAJEMEN PENUGASAN & SUBMISSIONS
// ==========================================

function GuruPenugasanView() {
  const { profile, user } = useAuth();
  const currentGuruId = user?.id || profile.id;
  const { penugasanList, loading, reload } = usePenugasanGuru();
  const kelasList = useKelasList();
  const paketSoalList = usePaketSoal();
  const { selectedYear } = useTahunAjaran(currentGuruId);

  // Filter kelas guru untuk tahun ajaran yang dipilih
  const myKelasListInYear = useMemo(() => {
    return (kelasList || []).filter(
      (k) =>
        (k.guruId === currentGuruId) &&
        (!selectedYear || k.tahunAjaran === selectedYear),
    );
  }, [kelasList, currentGuruId, selectedYear]);

  const myKelasIdsInYear = useMemo(() => {
    return new Set(myKelasListInYear.map((k) => k.id));
  }, [myKelasListInYear]);

  // Penugasan yang relevan dengan tahun ajaran aktif
  const yearPenugasanList = useMemo(() => {
    if (!selectedYear) return penugasanList;
    return penugasanList.filter((p) => {
      if (p.kelasTahunAjaran) return p.kelasTahunAjaran === selectedYear;
      return myKelasIdsInYear.has(p.kelasId);
    });
  }, [penugasanList, selectedYear, myKelasIdsInYear]);

  const [filterTab, setFilterTab] = useState<"semua" | "published" | "draft" | "closed">("semua");
  const [openCreateModal, setOpenCreateModal] = useState(false);
  const [editingPenugasan, setEditingPenugasan] = useState<Penugasan | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Modal Review Pengumpulan Siswa
  const [viewingSubmissionsFor, setViewingSubmissionsFor] = useState<Penugasan | null>(null);

  // Form states (Create / Edit)
  const [selectedKelasId, setSelectedKelasId] = useState("");
  const [selectedPaketSoalId, setSelectedPaketSoalId] = useState("");
  const [judulInput, setJudulInput] = useState("");
  const [instruksiInput, setInstruksiInput] = useState("");
  const [deadlineInput, setDeadlineInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const resetForm = () => {
    setSelectedKelasId("");
    setSelectedPaketSoalId("");
    setJudulInput("");
    setInstruksiInput("");
    setDeadlineInput("");
    setFormError("");
    setEditingPenugasan(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setOpenCreateModal(true);
  };

  const openEditDialog = (item: Penugasan) => {
    setEditingPenugasan(item);
    setSelectedKelasId(item.kelasId);
    setSelectedPaketSoalId(item.paketSoalId);
    setJudulInput(item.judul);
    setInstruksiInput(item.instruksi || "");

    if (item.deadline) {
      const d = new Date(item.deadline);
      const pad = (n: number) => n.toString().padStart(2, "0");
      const localStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      setDeadlineInput(localStr);
    } else {
      setDeadlineInput("");
    }

    setFormError("");
    setOpenCreateModal(true);
  };

  const handlePaketSoalChange = (paketId: string) => {
    setSelectedPaketSoalId(paketId);
    if (!judulInput.trim()) {
      const found = paketSoalList.find((p) => p.id === paketId);
      if (found) {
        setJudulInput(`Tugas: ${found.judul}`);
      }
    }
  };

  const handleSave = async (status: "draft" | "published") => {
    if (!selectedKelasId) {
      setFormError("Silakan pilih kelas tujuan penugasan.");
      return;
    }
    if (!selectedPaketSoalId) {
      setFormError("Silakan pilih paket soal untuk penugasan ini.");
      return;
    }
    if (!judulInput.trim()) {
      setFormError("Judul penugasan wajib diisi.");
      return;
    }

    setSubmitting(true);
    setFormError("");

    try {
      if (editingPenugasan) {
        const res = await updatePenugasan(editingPenugasan.id, {
          judul: judulInput,
          instruksi: instruksiInput,
          deadline: deadlineInput || null,
          kelasId: selectedKelasId,
          paketSoalId: selectedPaketSoalId,
          status,
        });
        if (!res.ok) {
          setFormError(res.message);
          toast.error(res.message);
          return;
        }
        toast.success(
          status === "published"
            ? "Penugasan berhasil diterbitkan!"
            : "Penugasan berhasil disimpan!",
        );
      } else {
        const res = await createPenugasan({
          kelasId: selectedKelasId,
          paketSoalId: selectedPaketSoalId,
          judul: judulInput,
          instruksi: instruksiInput,
          deadline: deadlineInput || null,
          status,
        });
        if (!res.ok) {
          setFormError(res.message);
          toast.error(res.message);
          return;
        }
        toast.success(
          status === "published"
            ? "Penugasan berhasil dibuat dan langsung diterbitkan ke siswa!"
            : "Penugasan berhasil disimpan sebagai draf!",
        );
      }

      setOpenCreateModal(false);
      resetForm();
      void reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan.";
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePublishDirect = async (item: Penugasan) => {
    const res = await publishPenugasan(item.id);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success(`Tugas "${item.judul}" berhasil diterbitkan ke kelas!`);
    void reload();
  };

  const handleCloseDirect = async (item: Penugasan) => {
    const res = await closePenugasan(item.id);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.info(`Tugas "${item.judul}" telah ditutup.`);
    void reload();
  };

  const handleDeleteDirect = async () => {
    if (!deletingId) return;
    const res = await deletePenugasan(deletingId);
    if (!res.ok) {
      toast.error(res.message);
    } else {
      toast.success("Penugasan berhasil dihapus.");
    }
    setDeletingId(null);
    void reload();
  };

  const filteredItems = useMemo(() => {
    if (filterTab === "semua") return yearPenugasanList;
    return yearPenugasanList.filter((p) => p.status === filterTab);
  }, [yearPenugasanList, filterTab]);

  const countPublished = yearPenugasanList.filter((p) => p.status === "published").length;
  const countDraft = yearPenugasanList.filter((p) => p.status === "draft").length;
  const countClosed = yearPenugasanList.filter((p) => p.status === "closed").length;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Penugasan Siswa"
        subtitle={
          selectedYear
            ? `Hubungkan paket soal dengan kelas siswa untuk Tahun Ajaran ${selectedYear}, atur tenggat, dan pantau pengumpulan tugas siswa.`
            : "Hubungkan paket soal dengan kelas siswa, atur tenggat pengumpulan, dan pantau pengumpulan tugas siswa."
        }
        actions={
          <Button onClick={openCreateDialog} className="gap-2 shadow-sm font-medium">
            <Plus className="h-4 w-4" />
            Buat Penugasan
          </Button>
        }
      />

      {/* Ringkasan Status */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <div>
              <p className="font-display text-2xl font-bold text-navy">{countPublished}</p>
              <p className="text-sm font-medium">Tugas Diterbitkan</p>
              <p className="text-xs text-muted-foreground">Dapat diakses oleh siswa aktif</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/40">
              <Clock className="h-5 w-5" />
            </span>
            <div>
              <p className="font-display text-2xl font-bold text-navy">{countDraft}</p>
              <p className="text-sm font-medium">Draf Penugasan</p>
              <p className="text-xs text-muted-foreground">Tersimpan, belum terlihat oleh siswa</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
              <Lock className="h-5 w-5" />
            </span>
            <div>
              <p className="font-display text-2xl font-bold text-navy">{countClosed}</p>
              <p className="text-sm font-medium">Tugas Ditutup</p>
              <p className="text-xs text-muted-foreground">Selesai / tenggat waktu berakhir</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs & Daftar Penugasan */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="font-display text-base text-navy">Daftar Penugasan</CardTitle>
            <Tabs
              value={filterTab}
              onValueChange={(v) => setFilterTab(v as typeof filterTab)}
              className="w-auto"
            >
              <TabsList className="grid grid-cols-4 h-9">
                <TabsTrigger value="semua" className="text-xs">
                  Semua ({penugasanList.length})
                </TabsTrigger>
                <TabsTrigger value="published" className="text-xs">
                  Terbit ({countPublished})
                </TabsTrigger>
                <TabsTrigger value="draft" className="text-xs">
                  Draf ({countDraft})
                </TabsTrigger>
                <TabsTrigger value="closed" className="text-xs">
                  Tutup ({countClosed})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
              <p className="mt-2">Memuat data penugasan…</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-12 text-center">
              <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-2 font-display text-base font-semibold text-navy">
                {filterTab === "semua"
                  ? "Belum ada penugasan yang dibuat"
                  : `Tidak ada penugasan dengan status "${filterTab}"`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                Buat penugasan pertama Anda dengan memilih kelas siswa dan paket soal yang sudah
                disiapkan.
              </p>
              {filterTab === "semua" && (
                <Button onClick={openCreateDialog} size="sm" className="mt-4 gap-1.5 font-medium">
                  <Plus className="h-4 w-4" />
                  Buat Penugasan Sekarang
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-4">
              {filteredItems.map((item) => {
                const isDraft = item.status === "draft";
                const isPublished = item.status === "published";
                const isClosed = item.status === "closed";

                return (
                  <div
                    key={item.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-xs"
                  >
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display font-semibold text-base text-navy">
                          {item.judul}
                        </h3>
                        {isPublished && (
                          <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                            Diterbitkan
                          </Badge>
                        )}
                        {isDraft && (
                          <Badge variant="outline" className="border-amber-500 text-amber-600">
                            Draf
                          </Badge>
                        )}
                        {isClosed && <Badge variant="secondary">Ditutup</Badge>}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                          <School className="h-3.5 w-3.5 text-primary" />
                          {item.kelasTingkat ? `${item.kelasTingkat} ` : ""}
                          {item.kelasNama || "Kelas"}
                          {item.kelasMapel ? ` · ${item.kelasMapel}` : ""}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <FileQuestion className="h-3.5 w-3.5 text-muted-foreground" />
                          {item.paketSoalJudul || "Paket Soal"}
                          {item.totalSoal ? ` (${item.totalSoal} butir)` : ""}
                        </span>
                        {item.deadline && (
                          <span className="inline-flex items-center gap-1 text-accent">
                            <Calendar className="h-3.5 w-3.5" />
                            Tenggat: {formatDeadline(item.deadline)}
                          </span>
                        )}
                      </div>

                      {item.instruksi && (
                        <p className="text-xs text-muted-foreground line-clamp-2 pt-0.5">
                          {item.instruksi}
                        </p>
                      )}
                    </div>

                    {/* Aksi Guru */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0 pt-2 sm:pt-0">
                      {/* Tombol Tinjau Pengumpulan Siswa */}
                      <Button
                        size="sm"
                        variant="secondary"
                        className="gap-1.5 text-xs font-medium"
                        onClick={() => setViewingSubmissionsFor(item)}
                      >
                        <Users className="h-3.5 w-3.5 text-primary" />
                        Pengumpulan Siswa
                      </Button>

                      {isDraft && (
                        <Button
                          size="sm"
                          variant="default"
                          className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => handlePublishDirect(item)}
                        >
                          <Send className="h-3.5 w-3.5" />
                          Terbitkan
                        </Button>
                      )}

                      {isPublished && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => handleCloseDirect(item)}
                        >
                          <Lock className="h-3.5 w-3.5" />
                          Tutup
                        </Button>
                      )}

                      {isClosed && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                          onClick={() => handlePublishDirect(item)}
                        >
                          <Send className="h-3.5 w-3.5" />
                          Buka Kembali
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        title="Edit Penugasan"
                        onClick={() => openEditDialog(item)}
                      >
                        <Edit3 className="h-4 w-4 text-muted-foreground" />
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        title="Hapus Penugasan"
                        onClick={() => setDeletingId(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Tinjau Pengumpulan Siswa untuk Guru */}
      {viewingSubmissionsFor && (
        <GuruSubmissionsModal
          penugasan={viewingSubmissionsFor}
          onClose={() => setViewingSubmissionsFor(null)}
        />
      )}

      {/* Dialog Pembuatan / Edit Penugasan */}
      <Dialog open={openCreateModal} onOpenChange={setOpenCreateModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-navy">
              {editingPenugasan ? "Edit Penugasan" : "Buat Penugasan Baru"}
            </DialogTitle>
            <DialogDescription>
              Tugaskan paket soal yang telah dibuat ke kelas siswa Anda.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {formError && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Pilih Kelas */}
            <div className="grid gap-2">
              <Label htmlFor="pilih-kelas">
                Pilih Kelas Target <span className="text-destructive">*</span>
              </Label>
              {myKelasListInYear.length === 0 ? (
                <p className="text-xs text-amber-600">
                  {selectedYear
                    ? `Anda belum memiliki kelas untuk Tahun Ajaran ${selectedYear}. Silakan buat kelas terlebih dahulu di menu Kelas Saya.`
                    : "Anda belum memiliki kelas. Silakan buat kelas terlebih dahulu di menu Kelas Saya."}
                </p>
              ) : (
                <Select value={selectedKelasId} onValueChange={setSelectedKelasId}>
                  <SelectTrigger id="pilih-kelas">
                    <SelectValue placeholder="-- Pilih Kelas --" />
                  </SelectTrigger>
                  <SelectContent>
                    {myKelasListInYear.map((k) => (
                      <SelectItem key={k.id} value={k.id}>
                        {k.tingkat} {k.namaKelas} ({k.mapel})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Pilih Paket Soal */}
            <div className="grid gap-2">
              <Label htmlFor="pilih-paket">
                Pilih Paket Soal <span className="text-destructive">*</span>
              </Label>
              {paketSoalList.length === 0 ? (
                <p className="text-xs text-amber-600">
                  Anda belum memiliki paket soal. Silakan buat paket soal terlebih dahulu di menu
                  Soal.
                </p>
              ) : (
                <Select value={selectedPaketSoalId} onValueChange={handlePaketSoalChange}>
                  <SelectTrigger id="pilih-paket">
                    <SelectValue placeholder="-- Pilih Paket Soal --" />
                  </SelectTrigger>
                  <SelectContent>
                    {paketSoalList.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.judul} ({p.soal.length} soal)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Judul Penugasan */}
            <div className="grid gap-2">
              <Label htmlFor="judul-penugasan">
                Judul Penugasan <span className="text-destructive">*</span>
              </Label>
              <Input
                id="judul-penugasan"
                placeholder="Contoh: Kuis Harian Bab 2 Aljabar"
                value={judulInput}
                onChange={(e) => setJudulInput(e.target.value)}
              />
            </div>

            {/* Tenggat Waktu (Opsional) */}
            <div className="grid gap-2">
              <Label htmlFor="deadline-penugasan">Tenggat Waktu / Deadline (Opsional)</Label>
              <Input
                id="deadline-penugasan"
                type="datetime-local"
                value={deadlineInput}
                onChange={(e) => setDeadlineInput(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Kosongkan jika penugasan tidak memiliki batas waktu pengumpulan tertentu.
              </p>
            </div>

            {/* Instruksi Pengerjaan (Opsional) */}
            <div className="grid gap-2">
              <Label htmlFor="instruksi-penugasan">Instruksi Pengerjaan (Opsional)</Label>
              <Textarea
                id="instruksi-penugasan"
                rows={3}
                placeholder="Tuliskan petunjuk khusus, misalnya: 'Kerjakan soal pilihan ganda secara cermat dan tuliskan alasan singkat pada kolom catatan.'"
                value={instruksiInput}
                onChange={(e) => setInstruksiInput(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 flex-col sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpenCreateModal(false)}
              disabled={submitting}
            >
              Batal
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={submitting}
                onClick={() => handleSave("draft")}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Simpan Draf
              </Button>
              <Button
                type="button"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={submitting}
                onClick={() => handleSave("published")}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Terbitkan Sekarang
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Konfirmasi Hapus */}
      <AlertDialog open={Boolean(deletingId)} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Penugasan Ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini akan menghapus data penugasan dari sistem secara permanen. Siswa tidak
              akan dapat mengakses tugas ini lagi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteDirect}
            >
              Hapus Penugasan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ==========================================
// 2. MODAL TINJAUAN PENGUMPULAN SISWA (GURU)
// ==========================================

function TeacherGradingView({
  penugasan,
  submission,
  onBack,
  onGraded,
}: {
  penugasan: Penugasan;
  submission: TeacherSubmissionItem;
  onBack: () => void;
  onGraded: (updated: TeacherSubmissionItem) => void;
}) {
  const [paketSoal, setPaketSoal] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [essayScores, setEssayScores] = useState<Record<string, number>>({});
  const [essayNotes, setEssayNotes] = useState<Record<string, string>>({});
  const [catatanGuru, setCatatanGuru] = useState<string>(submission.catatanGuru || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);

    getTeacherPaketSoal(penugasan.paketSoalId)
      .then((data) => {
        if (!active) return;
        setPaketSoal(data);

        // Inisialisasi skor & catatan esai yang tersimpan
        const scoresMap: Record<string, number> = {};
        const notesMap: Record<string, string> = {};

        submission.jawabanList.forEach((j) => {
          if (j.skor !== null && j.skor !== undefined) {
            scoresMap[j.soalId] = Number(j.skor);
          }
          if (j.catatan) {
            notesMap[j.soalId] = j.catatan;
          }
        });

        setEssayScores(scoresMap);
        setEssayNotes(notesMap);
      })
      .catch((err) => console.error("Gagal memuat paket soal:", err))
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [penugasan.paketSoalId, submission]);

  const rawQuestions: any[] = paketSoal?.soal || [];
  const totalQuestions = rawQuestions.length;
  const weightPerQuestion = totalQuestions > 0 ? 100 / totalQuestions : 0;

  const pgQuestions = rawQuestions.filter((q) => q.jenis === "Pilihan Ganda");
  const essayQuestions = rawQuestions.filter((q) => q.jenis === "Esai");

  // Hitung jumlah jawaban PG yang benar
  const correctPgCount = pgQuestions.filter((q) => {
    const studentAns = submission.jawabanList.find((j) => j.soalId === q.id);
    if (studentAns?.isCorrect !== null && studentAns?.isCorrect !== undefined) {
      return studentAns.isCorrect;
    }
    if (!studentAns?.jawaban) return false;
    const ans = studentAns.jawaban.trim().toLowerCase();
    const key = String(q.kunci || "")
      .trim()
      .toLowerCase();
    if (ans === key) return true;
    if (key.length === 1 && ans.startsWith(key)) return true;
    return false;
  }).length;

  // Nilai PG terhitung
  const calculatedPgScore =
    submission.nilaiPg !== null
      ? submission.nilaiPg
      : Math.round(correctPgCount * weightPerQuestion * 100) / 100;

  // Total nilai esai saat ini
  const totalEssayScore = essayQuestions.reduce((acc, q) => {
    return acc + (Number(essayScores[q.id]) || 0);
  }, 0);

  const calculatedFinalScore = Math.min(
    100,
    Math.max(0, Math.round((calculatedPgScore + totalEssayScore) * 100) / 100),
  );

  const handleScoreChange = (soalId: string, val: string, maxScore: number) => {
    const num = parseFloat(val);
    if (isNaN(num)) {
      setEssayScores((prev) => ({ ...prev, [soalId]: 0 }));
      return;
    }
    const clamped = Math.min(maxScore, Math.max(0, num));
    setEssayScores((prev) => ({ ...prev, [soalId]: clamped }));
  };

  const handleNoteChange = (soalId: string, val: string) => {
    setEssayNotes((prev) => ({ ...prev, [soalId]: val }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const detailJawaban = essayQuestions.map((q) => ({
        soalId: q.id,
        skor: Number(essayScores[q.id]) || 0,
        catatan: essayNotes[q.id] || "",
      }));

      const res = await gradeSubmission(submission.id, {
        nilaiEssay: totalEssayScore,
        catatanGuru: catatanGuru.trim(),
        detailJawaban,
      });

      if (!res.ok) {
        toast.error(res.message);
        return;
      }

      toast.success("Penilaian berhasil disimpan!");

      onGraded({
        ...submission,
        nilaiPg: calculatedPgScore,
        nilaiEssay: totalEssayScore,
        nilaiAkhir: res.nilaiAkhir,
        statusPenilaian: "dinilai",
        catatanGuru: catatanGuru.trim(),
        gradedAt: new Date().toISOString(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal menyimpan penilaian.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
        <p className="mt-2">Memuat lembar penilaian siswa…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Info Siswa & Tombol Kembali */}
      <div className="flex items-center justify-between border-b pb-3">
        <div>
          <h4 className="font-display font-semibold text-navy flex items-center gap-2">
            Penilaian: {submission.siswaNama}
            {submission.statusPenilaian === "dinilai" && (
              <Badge className="bg-emerald-600 text-white text-xs">Sudah Dinilai</Badge>
            )}
          </h4>
          <p className="text-xs text-muted-foreground">
            NISN: {submission.siswaNisn || "—"} · Status:{" "}
            <span className="font-medium text-foreground capitalize">
              {submission.status === "submitted" ? "Terkumpul" : "Draf"}
            </span>
            {submission.submittedAt ? ` · Waktu: ${formatDeadline(submission.submittedAt)}` : ""}
          </p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Kembali ke Daftar
        </Button>
      </div>

      {/* Ringkasan Nilai Live */}
      <div className="grid grid-cols-3 gap-3 rounded-xl border bg-muted/30 p-3 text-center">
        <div className="rounded-lg bg-card p-2 border">
          <p className="text-xs text-muted-foreground">Nilai Pilihan Ganda</p>
          <p className="text-lg font-bold text-primary">{calculatedPgScore}</p>
          <p className="text-[10px] text-muted-foreground">
            ({correctPgCount}/{pgQuestions.length} benar)
          </p>
        </div>
        <div className="rounded-lg bg-card p-2 border">
          <p className="text-xs text-muted-foreground">Nilai Esai (Manual)</p>
          <p className="text-lg font-bold text-amber-600">{totalEssayScore}</p>
          <p className="text-[10px] text-muted-foreground">({essayQuestions.length} butir esai)</p>
        </div>
        <div className="rounded-lg bg-primary/10 border border-primary/30 p-2">
          <p className="text-xs font-medium text-primary">Nilai Akhir</p>
          <p className="text-2xl font-extrabold text-primary">{calculatedFinalScore}</p>
          <p className="text-[10px] text-muted-foreground">Skala 0–100</p>
        </div>
      </div>

      {/* Rincian Jawaban Soal */}
      <div className="space-y-4 pt-1">
        {rawQuestions.map((q, idx) => {
          const studentAns = submission.jawabanList.find((j) => j.soalId === q.id);
          const isEssay = q.jenis === "Esai";
          const maxPoinSoal = q.poin ? Number(q.poin) : Math.round(weightPerQuestion * 100) / 100;

          if (isEssay) {
            return (
              <div key={q.id} className="rounded-xl border p-4 bg-card space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-primary font-display">
                    Soal #{idx + 1} · Esai
                  </span>
                  <Badge variant="outline" className="text-[11px]">
                    Maks: {maxPoinSoal} poin
                  </Badge>
                </div>

                <p className="text-xs font-medium text-navy whitespace-pre-wrap">{q.pertanyaan}</p>

                {/* Panduan Kunci Guru */}
                {q.kunci && (
                  <div className="rounded bg-muted/40 p-2.5 text-[11px] text-muted-foreground border border-dashed">
                    <p className="font-semibold text-foreground mb-0.5">Panduan Rubrik Guru:</p>
                    <p className="whitespace-pre-wrap">{q.kunci}</p>
                  </div>
                )}

                {/* Jawaban Siswa */}
                <div className="rounded bg-muted/20 border p-3 text-xs space-y-1">
                  <p className="font-semibold text-foreground text-[11px]">Jawaban Siswa:</p>
                  {studentAns?.jawaban ? (
                    <p className="whitespace-pre-wrap leading-relaxed">{studentAns.jawaban}</p>
                  ) : (
                    <p className="text-muted-foreground italic">(Siswa tidak mengisi jawaban)</p>
                  )}
                </div>

                {/* Kontrol Penilaian Esai */}
                <div className="grid sm:grid-cols-2 gap-3 pt-1 border-t">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-foreground">
                      Beri Skor (0 – {maxPoinSoal}):
                    </label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        step="0.5"
                        min={0}
                        max={maxPoinSoal}
                        value={essayScores[q.id] ?? ""}
                        placeholder="0"
                        onChange={(e) => handleScoreChange(q.id, e.target.value, maxPoinSoal)}
                        className="h-8 text-xs font-semibold w-24"
                      />
                      <span className="text-xs text-muted-foreground">/ {maxPoinSoal} poin</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-foreground">
                      Catatan untuk butir ini (opsional):
                    </label>
                    <Input
                      type="text"
                      placeholder="Contoh: Jawaban cukup tepat namun kurang contoh"
                      value={essayNotes[q.id] ?? ""}
                      onChange={(e) => handleNoteChange(q.id, e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>
            );
          }

          // Pilihan Ganda (Auto-Graded)
          const isCorrect = studentAns?.isCorrect;
          return (
            <div key={q.id} className="rounded-xl border p-4 bg-muted/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-primary font-display">
                  Soal #{idx + 1} · Pilihan Ganda
                </span>
                {isCorrect ? (
                  <Badge className="bg-emerald-600 text-white text-[11px] gap-1">
                    <Check className="h-3 w-3" /> Benar (+{maxPoinSoal})
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="text-[11px] gap-1">
                    <X className="h-3 w-3" /> Salah (0)
                  </Badge>
                )}
              </div>

              <p className="text-xs font-medium text-navy whitespace-pre-wrap">{q.pertanyaan}</p>

              <div className="grid gap-1.5 text-xs">
                <div className="flex items-start gap-2 text-[11px]">
                  <span className="font-semibold text-foreground shrink-0 w-24">
                    Jawaban Siswa:
                  </span>
                  <span
                    className={
                      isCorrect
                        ? "text-emerald-700 dark:text-emerald-400 font-medium"
                        : "text-destructive font-medium"
                    }
                  >
                    {studentAns?.jawaban || "(Kosong / tidak dijawab)"}
                  </span>
                </div>
                <div className="flex items-start gap-2 text-[11px]">
                  <span className="font-semibold text-foreground shrink-0 w-24">
                    Kunci Jawaban:
                  </span>
                  <span className="text-muted-foreground font-mono bg-muted/60 px-1.5 py-0.5 rounded">
                    {q.kunci || "—"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Catatan Keseluruhan Guru */}
      <div className="space-y-1.5 pt-2 border-t">
        <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5 text-primary" />
          Umpan Balik / Catatan untuk Siswa:
        </label>
        <Textarea
          rows={3}
          placeholder="Tuliskan umpan balik motivatif atau saran perbaikan untuk siswa ini…"
          value={catatanGuru}
          onChange={(e) => setCatatanGuru(e.target.value)}
          className="text-xs leading-relaxed"
        />
      </div>

      {/* Tombol Simpan Penilaian */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t">
        <Button size="sm" variant="outline" onClick={onBack} disabled={saving}>
          Batal
        </Button>
        <Button
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Menyimpan…
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" />
              Simpan Penilaian
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function GuruSubmissionsModal({
  penugasan,
  onClose,
}: {
  penugasan: Penugasan;
  onClose: () => void;
}) {
  const [submissions, setSubmissions] = useState<TeacherSubmissionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [inspectingItem, setInspectingItem] = useState<TeacherSubmissionItem | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getTeacherSubmissions(penugasan.id)
      .then((items) => {
        if (active) setSubmissions(items);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [penugasan.id]);

  const submittedCount = submissions.filter((s) => s.status === "submitted").length;
  const gradedCount = submissions.filter((s) => s.statusPenilaian === "dinilai").length;
  const needGradingCount = submissions.filter(
    (s) => s.status === "submitted" && s.statusPenilaian !== "dinilai",
  ).length;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display text-navy flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Pengumpulan & Penilaian: {penugasan.judul}
          </DialogTitle>
          <DialogDescription>
            {penugasan.kelasTingkat} {penugasan.kelasNama} ({penugasan.kelasMapel}) · Tenggat:{" "}
            {penugasan.deadline ? formatDeadline(penugasan.deadline) : "Tidak ada"}
          </DialogDescription>
        </DialogHeader>

        {/* Ringkasan status penilaian */}
        <div className="grid grid-cols-3 gap-3 py-2">
          <div className="rounded-lg border bg-emerald-50/50 p-2.5 text-center dark:bg-emerald-950/20">
            <p className="text-xl font-bold text-emerald-600">{submittedCount}</p>
            <p className="text-xs text-muted-foreground">Telah Mengumpulkan</p>
          </div>
          <div className="rounded-lg border bg-blue-50/50 p-2.5 text-center dark:bg-blue-950/20">
            <p className="text-xl font-bold text-blue-600">{gradedCount}</p>
            <p className="text-xs text-muted-foreground">Selesai Dinilai</p>
          </div>
          <div className="rounded-lg border bg-amber-50/50 p-2.5 text-center dark:bg-amber-950/20">
            <p className="text-xl font-bold text-amber-600">{needGradingCount}</p>
            <p className="text-xs text-muted-foreground">Perlu Pemeriksaan</p>
          </div>
        </div>

        {/* Konten detail pengumpulan atau inspeksi/penilaian siswa */}
        <div className="flex-1 overflow-y-auto pr-1">
          {inspectingItem ? (
            <TeacherGradingView
              penugasan={penugasan}
              submission={inspectingItem}
              onBack={() => setInspectingItem(null)}
              onGraded={(updated) => {
                setInspectingItem(updated);
                setSubmissions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
              }}
            />
          ) : loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
              <p className="mt-2">Memuat pengumpulan siswa…</p>
            </div>
          ) : submissions.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p className="mt-2 font-display text-sm font-semibold text-navy">
                Belum ada siswa yang memulai tugas ini
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Siswa yang membuka tugas ini atau menyimpannya akan muncul secara otomatis di sini.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {submissions.map((sub) => {
                const isSubmitted = sub.status === "submitted";
                const isGraded = sub.statusPenilaian === "dinilai";
                const needsGrading = isSubmitted && sub.statusPenilaian !== "dinilai";

                return (
                  <div
                    key={sub.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-display font-semibold text-sm text-navy truncate">
                          {sub.siswaNama}
                        </p>
                        {isGraded && (
                          <Badge className="bg-emerald-600 text-white text-[11px] gap-1">
                            <Award className="h-3 w-3" /> Nilai: {sub.nilaiAkhir ?? 0}
                          </Badge>
                        )}
                        {needsGrading && (
                          <Badge
                            variant="outline"
                            className="border-amber-500 text-amber-700 bg-amber-50 dark:bg-amber-950/30 text-[11px]"
                          >
                            Perlu Dinilai
                          </Badge>
                        )}
                        {sub.statusPenilaian === "belum_dinilai" && isSubmitted && (
                          <Badge variant="secondary" className="text-[11px]">
                            Belum Dinilai
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        NISN: {sub.siswaNisn || "—"} · {sub.jawabanCount} jawaban tersimpan
                        {sub.submittedAt ? ` · ${formatDeadline(sub.submittedAt)}` : ""}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0">
                      {isSubmitted ? (
                        <Badge className="bg-emerald-600 text-white text-xs">Terkumpul</Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-amber-500 text-amber-600 text-xs"
                        >
                          Draf
                        </Badge>
                      )}
                      <Button
                        size="sm"
                        variant={isSubmitted ? "default" : "outline"}
                        className="gap-1.5 text-xs h-8"
                        onClick={() => setInspectingItem(sub)}
                      >
                        {isSubmitted ? (
                          <>
                            <Edit3 className="h-3.5 w-3.5" />
                            {isGraded ? "Tinjau Nilai" : "Beri Nilai"}
                          </>
                        ) : (
                          <>
                            <Eye className="h-3.5 w-3.5" />
                            Lihat Draf
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="pt-2 border-t">
          <Button variant="outline" onClick={onClose}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==========================================
// 3. TAMPILAN SISWA: DAFTAR TUGAS & PENGERJAAN
// ==========================================

function SiswaPenugasanView() {
  const { penugasanList, loading } = usePenugasanSiswa();
  const [activePenugasan, setActivePenugasan] = useState<Penugasan | null>(null);
  const [filterTab, setFilterTab] = useState<"aktif" | "semua" | "closed">("aktif");

  const now = new Date();

  const filteredItems = useMemo(() => {
    if (filterTab === "semua") return penugasanList;
    if (filterTab === "aktif") {
      return penugasanList.filter((p) => {
        if (p.status !== "published") return false;
        if (!p.deadline) return true;
        return new Date(p.deadline) >= now;
      });
    }
    // closed or expired
    return penugasanList.filter((p) => {
      if (p.status === "closed") return true;
      if (p.deadline && new Date(p.deadline) < now) return true;
      return false;
    });
  }, [penugasanList, filterTab]);

  // Jika siswa sedang membuka detail/pengerjaan tugas tertentu
  if (activePenugasan) {
    return (
      <SiswaPengerjaanView penugasan={activePenugasan} onBack={() => setActivePenugasan(null)} />
    );
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Daftar Tugas & Latihan"
        subtitle="Pantau dan kerjakan tugas yang diberikan oleh bapak/ibu guru untuk kelas pembelajaran Anda."
      />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="font-display text-base text-navy">Tugas Kelas Anda</CardTitle>
            <Tabs
              value={filterTab}
              onValueChange={(v) => setFilterTab(v as typeof filterTab)}
              className="w-auto"
            >
              <TabsList className="grid grid-cols-3 h-9">
                <TabsTrigger value="aktif" className="text-xs">
                  Tugas Aktif
                </TabsTrigger>
                <TabsTrigger value="closed" className="text-xs">
                  Selesai / Ditutup
                </TabsTrigger>
                <TabsTrigger value="semua" className="text-xs">
                  Semua ({penugasanList.length})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
              <p className="mt-2">Memuat daftar tugas…</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-12 text-center">
              <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="mt-2 font-display text-base font-semibold text-navy">
                {filterTab === "aktif"
                  ? "Belum ada tugas aktif untuk Anda saat ini"
                  : "Tidak ada data tugas yang ditemukan"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                Tugas dari guru pengampu kelas Anda yang telah diterbitkan akan muncul secara
                otomatis di halaman ini.
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {filteredItems.map((item) => {
                const isDeadlinePassed = item.deadline && new Date(item.deadline) < now;
                const isClosed = item.status === "closed" || isDeadlinePassed;

                return (
                  <div
                    key={item.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border bg-card p-5 transition-all hover:border-primary/40 hover:shadow-xs"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display font-bold text-base text-navy">{item.judul}</h3>
                        {isClosed ? (
                          <Badge variant="secondary">Ditutup / Lewat</Badge>
                        ) : (
                          <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                            Tersedia
                          </Badge>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground pt-0.5">
                        <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                          <School className="h-3.5 w-3.5 text-primary" />
                          {item.kelasTingkat ? `${item.kelasTingkat} ` : ""}
                          {item.kelasNama || "Kelas"}
                          {item.kelasMapel ? ` · ${item.kelasMapel}` : ""}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          Guru: {item.guruNama || "Guru Pengampu"}
                        </span>
                        {item.deadline && (
                          <span
                            className={`inline-flex items-center gap-1 font-medium ${
                              isDeadlinePassed ? "text-destructive" : "text-amber-600"
                            }`}
                          >
                            <Calendar className="h-3.5 w-3.5" />
                            Tenggat: {formatDeadline(item.deadline)}
                          </span>
                        )}
                      </div>

                      {item.instruksi && (
                        <p className="text-xs text-muted-foreground line-clamp-2 pt-0.5">
                          {item.instruksi}
                        </p>
                      )}
                    </div>

                    {/* Tombol Buka Tugas */}
                    <div className="shrink-0 pt-2 sm:pt-0">
                      <Button
                        className="gap-2 font-medium w-full sm:w-auto"
                        variant={isClosed ? "outline" : "default"}
                        onClick={() => setActivePenugasan(item)}
                      >
                        {isClosed ? (
                          <>
                            <Eye className="h-4 w-4" />
                            Lihat Tugas
                          </>
                        ) : (
                          <>
                            <Edit3 className="h-4 w-4" />
                            Kerjakan Tugas
                            <ChevronRight className="h-4 w-4 ml-1" />
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ==========================================
// 4. TAMPILAN PENGERJAAN TUGAS SISWA (SUBMISSION)
// ==========================================

function SiswaPengerjaanView({ penugasan, onBack }: { penugasan: Penugasan; onBack: () => void }) {
  const [soalList, setSoalList] = useState<SanitizedSoal[]>([]);
  const [submission, setSubmission] = useState<PenugasanPengumpulan | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingStatus, setSavingStatus] = useState<"saved" | "saving" | "error">("saved");
  const [submittingFinal, setSubmittingFinal] = useState(false);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);

  const now = new Date();
  const isDeadlinePassed = Boolean(penugasan.deadline && new Date(penugasan.deadline) < now);
  const isClosed = penugasan.status === "closed" || isDeadlinePassed;
  const isSubmitted = submission?.status === "submitted";
  const isReadOnly = isSubmitted || isClosed;

  // Inisialisasi data: Ambil soal & pengumpulan siswa
  useEffect(() => {
    let active = true;
    setLoading(true);

    Promise.all([getSoalForSiswa(penugasan.id), getMySubmission(penugasan.id)])
      .then(async ([soal, existingSub]) => {
        if (!active) return;
        setSoalList(soal);

        let currentSub = existingSub;

        // Jika belum ada pengumpulan dan tenggat belum lewat, buat draf baru
        if (!currentSub && !isClosed) {
          const createRes = await createDraftSubmission(penugasan.id);
          if (createRes.ok) {
            currentSub = createRes.submission;
          }
        }

        setSubmission(currentSub);

        // Jika ada pengumpulan, ambil jawaban tersimpan
        if (currentSub) {
          const savedAnswers = await getMyAnswers(currentSub.id);
          if (active) {
            const map: Record<string, string> = {};
            savedAnswers.forEach((a) => {
              if (a.jawaban !== null) {
                map[a.soalId] = a.jawaban;
              }
            });
            setAnswers(map);
          }
        }
      })
      .catch((err) => {
        console.error("[Pengerjaan] Gagal memuat data:", err);
        toast.error("Gagal memuat tugas.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [penugasan.id, isClosed]);

  // Handler perubahan jawaban dengan autosave
  const handleAnswerChange = async (soalId: string, val: string) => {
    if (isReadOnly || !submission) return;

    // Update state lokal secara instan
    setAnswers((prev) => ({ ...prev, [soalId]: val }));
    setSavingStatus("saving");

    try {
      const res = await saveAnswer(submission.id, soalId, val);
      if (res.ok) {
        setSavingStatus("saved");
      } else {
        setSavingStatus("error");
        toast.error(res.message);
      }
    } catch {
      setSavingStatus("error");
    }
  };

  // Simpan draf manual
  const handleSaveDraftManual = async () => {
    if (!submission || isReadOnly) return;
    setSavingStatus("saving");
    try {
      // Simpan semua jawaban yang ada
      for (const [sId, ans] of Object.entries(answers)) {
        await saveAnswer(submission.id, sId, ans);
      }
      setSavingStatus("saved");
      toast.success("Draf jawaban berhasil disimpan ke cloud.");
    } catch {
      setSavingStatus("error");
      toast.error("Gagal menyimpan draf jawaban.");
    }
  };

  // Validasi sebelum submit
  const handleOpenConfirmSubmit = () => {
    if (isReadOnly || !submission) return;

    if (isDeadlinePassed) {
      toast.error("Tenggat waktu penugasan telah berakhir. Pengumpulan tidak dapat diterima.");
      return;
    }

    setConfirmSubmitOpen(true);
  };

  // Eksekusi Submit Final
  const handleConfirmSubmit = async () => {
    if (!submission || isReadOnly) return;

    setSubmittingFinal(true);
    try {
      // Pastikan semua jawaban terbaru tersimpan terlebih dahulu
      for (const [sId, ans] of Object.entries(answers)) {
        await saveAnswer(submission.id, sId, ans);
      }

      // Panggil operasi submit (verifikasi tenggat waktu di server)
      const res = await submitAssignment(submission.id);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }

      const updatedSub = await getMySubmission(penugasan.id);
      if (updatedSub) {
        setSubmission(updatedSub);
      } else {
        setSubmission((prev) =>
          prev
            ? {
                ...prev,
                status: "submitted",
                submittedAt: res.submittedAt,
              }
            : null,
        );
      }

      setConfirmSubmitOpen(false);
      toast.success("Tugas berhasil dikumpulkan!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal mengumpulkan tugas.";
      toast.error(msg);
    } finally {
      setSubmittingFinal(false);
    }
  };

  const answeredCount = Object.values(answers).filter((v) => v && v.trim().length > 0).length;
  const unansweredCount = Math.max(0, soalList.length - answeredCount);

  return (
    <div className="grid gap-6 max-w-4xl mx-auto">
      {/* Header Navigasi */}
      <div className="flex items-center justify-between gap-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Daftar Tugas
        </Button>

        {/* Indikator Autosave (Hanya aktif jika belum submitted) */}
        {!isReadOnly && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {savingStatus === "saving" && (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                <span>Menyimpan ke cloud…</span>
              </>
            )}
            {savingStatus === "saved" && (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-emerald-600 font-medium">Tersimpan di cloud</span>
              </>
            )}
            {savingStatus === "error" && (
              <>
                <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                <span className="text-destructive font-medium">Gagal menyimpan</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Banner Status Pengumpulan & Hasil Penilaian */}
      {isSubmitted && (
        <div className="space-y-4">
          {submission?.statusPenilaian === "dinilai" ? (
            <div className="rounded-xl border border-emerald-500/40 bg-gradient-to-br from-emerald-50 via-card to-emerald-100/30 p-5 dark:from-emerald-950/40 dark:via-card dark:to-emerald-900/20 space-y-4 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Award className="h-5 w-5 text-emerald-600" />
                    <h4 className="font-display font-bold text-base text-emerald-950 dark:text-emerald-100">
                      Hasil Penilaian Tugas
                    </h4>
                    <Badge className="bg-emerald-600 text-white text-xs">Sudah Dinilai</Badge>
                  </div>
                  <p className="text-xs text-emerald-800 dark:text-emerald-300">
                    Tugas Anda telah selesai dinilai oleh guru pengampu.
                    {submission.gradedAt
                      ? ` · Dinilai pada ${formatDeadline(submission.gradedAt)}`
                      : ""}
                  </p>
                </div>

                <div className="flex items-baseline gap-1.5 rounded-xl bg-card px-4 py-2.5 border shadow-xs self-start sm:self-auto">
                  <span className="text-xs text-muted-foreground font-medium">Nilai Akhir:</span>
                  <span className="font-display font-extrabold text-2xl text-emerald-600">
                    {submission.nilaiAkhir ?? 0}
                  </span>
                  <span className="text-xs text-muted-foreground font-semibold">/ 100</span>
                </div>
              </div>

              {/* Rincian Skor */}
              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-emerald-500/20 text-xs">
                <div className="rounded-lg bg-card/70 p-2.5 border">
                  <span className="text-muted-foreground block text-[11px]">
                    Skor Pilihan Ganda (Auto)
                  </span>
                  <span className="font-bold text-foreground text-sm">
                    {submission.nilaiPg !== null ? `${submission.nilaiPg}` : "—"}
                  </span>
                </div>
                <div className="rounded-lg bg-card/70 p-2.5 border">
                  <span className="text-muted-foreground block text-[11px]">Skor Esai (Guru)</span>
                  <span className="font-bold text-foreground text-sm">
                    {submission.nilaiEssay !== null ? `${submission.nilaiEssay}` : "—"}
                  </span>
                </div>
              </div>

              {/* Catatan / Feedback Guru jika ada */}
              {submission.catatanGuru && (
                <div className="rounded-lg bg-card p-3 border space-y-1 text-xs">
                  <p className="font-semibold text-navy flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5 text-primary" />
                    Catatan & Umpan Balik Guru:
                  </p>
                  <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {submission.catatanGuru}
                  </p>
                </div>
              )}
            </div>
          ) : submission?.statusPenilaian === "perlu_penilaian_manual" ? (
            <div className="rounded-xl border border-amber-500/40 bg-gradient-to-br from-amber-50 to-amber-100/30 p-4 dark:from-amber-950/40 dark:to-amber-900/20 flex items-start gap-3">
              <Clock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-display font-bold text-sm text-amber-950 dark:text-amber-100">
                    Menunggu Penilaian Guru
                  </h4>
                  <Badge
                    variant="outline"
                    className="border-amber-500 text-amber-700 bg-amber-50 dark:bg-amber-950/30 text-xs"
                  >
                    Perlu Pemeriksaan Esai
                  </Badge>
                </div>
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  Jawaban tugas telah dikumpulkan. Butir soal pilihan ganda telah diproses oleh
                  sistem
                  {submission.nilaiPg !== null ? ` (Skor PG: ${submission.nilaiPg})` : ""}, dan
                  butir soal esai sedang dalam proses pemeriksaan manual oleh guru pengampu.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-50/70 p-4 dark:bg-emerald-950/30">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-display font-semibold text-emerald-900 dark:text-emerald-100">
                  Tugas Telah Berhasil Dikumpulkan
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-300">
                  Waktu pengumpulan:{" "}
                  <strong>
                    {submission?.submittedAt ? formatDeadline(submission.submittedAt) : "Tercatat"}
                  </strong>
                  . Jawaban Anda terkunci dan sedang dalam antrean pemeriksaan.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Banner Tenggat Lewat */}
      {!isSubmitted && isDeadlinePassed && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-display font-semibold text-destructive">
              Tenggat Waktu Pengumpulan Telah Berakhir
            </p>
            <p className="text-xs text-muted-foreground">
              Batas waktu:{" "}
              <strong>{penugasan.deadline ? formatDeadline(penugasan.deadline) : "—"}</strong>.
              Status pengerjaan: <strong>Draf — Tidak Dikumpulkan</strong>. Jawaban tidak dapat
              dikumpulkan atau diubah kembali.
            </p>
          </div>
        </div>
      )}

      {/* Informasi Detail Tugas */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="space-y-1">
              <Badge variant="outline" className="text-primary border-primary/30 mb-1">
                {penugasan.kelasTingkat} {penugasan.kelasNama} · {penugasan.kelasMapel}
              </Badge>
              <CardTitle className="font-display text-xl text-navy">{penugasan.judul}</CardTitle>
              <p className="text-xs text-muted-foreground">
                Guru Pengampu: <strong>{penugasan.guruNama || "Guru Pengampu"}</strong>
              </p>
            </div>

            {penugasan.deadline && (
              <div
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium self-start ${
                  isDeadlinePassed
                    ? "bg-destructive/10 text-destructive"
                    : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                }`}
              >
                <Clock className="h-4 w-4" />
                <span>Batas: {formatDeadline(penugasan.deadline)}</span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {penugasan.instruksi && (
            <div className="rounded-lg bg-muted/40 p-3.5 text-xs leading-relaxed text-muted-foreground border">
              <p className="font-medium text-foreground mb-1">Petunjuk dari Guru:</p>
              <p className="whitespace-pre-wrap">{penugasan.instruksi}</p>
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t">
            <span>
              Total: <strong>{soalList.length} butir soal</strong>
            </span>
            <span>
              Dijawab: <strong>{answeredCount}</strong> dari {soalList.length}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Daftar Butir Soal */}
      {loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-3">Memuat butir soal tugas…</p>
        </div>
      ) : soalList.length === 0 ? (
        <Card className="py-12 text-center">
          <CardContent>
            <HelpCircle className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="mt-2 font-display text-base font-semibold text-navy">
              Belum ada butir soal pada penugasan ini
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Silakan hubungi bapak/ibu guru untuk informasi lebih lanjut.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {soalList.map((s, index) => {
            const currentAnswer = answers[s.id] || "";
            const isFilled = currentAnswer.trim().length > 0;

            return (
              <Card
                key={s.id}
                className={`transition-all ${
                  isFilled ? "border-primary/40 shadow-xs" : "border-border"
                }`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 font-display text-sm font-bold text-primary">
                      Soal #{index + 1}
                    </span>
                    <Badge variant="secondary" className="text-[11px]">
                      {s.jenis}
                    </Badge>
                  </div>
                  <p className="font-medium text-sm text-navy pt-1 leading-relaxed whitespace-pre-wrap">
                    {s.pertanyaan}
                  </p>
                </CardHeader>
                <CardContent className="pt-2">
                  {s.jenis === "Pilihan Ganda" ? (
                    <div className="grid gap-2">
                      {s.opsi.map((opsi, oIdx) => {
                        const optionLabel =
                          opsi.match(/^[A-E]\./i) !== null
                            ? opsi
                            : `${String.fromCharCode(65 + oIdx)}. ${opsi}`;
                        const isSelected = currentAnswer === optionLabel || currentAnswer === opsi;

                        return (
                          <button
                            key={oIdx}
                            type="button"
                            disabled={isReadOnly}
                            onClick={() => handleAnswerChange(s.id, optionLabel)}
                            className={`flex items-start gap-3 rounded-lg border p-3 text-left text-xs transition-all ${
                              isSelected
                                ? "border-primary bg-primary/10 font-medium text-primary shadow-xs"
                                : "hover:border-primary/30 hover:bg-muted/40 text-foreground"
                            } ${isReadOnly ? "cursor-default opacity-80" : "cursor-pointer"}`}
                          >
                            <span
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${
                                isSelected
                                  ? "border-primary bg-primary text-primary-foreground font-bold"
                                  : "border-muted-foreground/40 text-muted-foreground"
                              }`}
                            >
                              {String.fromCharCode(65 + oIdx)}
                            </span>
                            <span className="flex-1 leading-relaxed">{opsi}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Textarea
                        rows={4}
                        disabled={isReadOnly}
                        placeholder={
                          isReadOnly
                            ? "(Jawaban telah terkunci)"
                            : "Tuliskan uraian jawaban Anda di sini…"
                        }
                        value={currentAnswer}
                        onChange={(e) => handleAnswerChange(s.id, e.target.value)}
                        className="text-xs leading-relaxed"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Tombol Aksi Pengumpulan */}
      {!isReadOnly && soalList.length > 0 && (
        <Card className="sticky bottom-4 border-primary/30 shadow-lg bg-card/95 backdrop-blur">
          <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4">
            <div className="text-xs text-muted-foreground">
              <span>Status: </span>
              <strong>{answeredCount}</strong> dari {soalList.length} soal telah dijawab.
              {unansweredCount > 0 && (
                <span className="text-amber-600 block sm:inline sm:ml-1">
                  ({unansweredCount} belum terisi)
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSaveDraftManual}
                className="gap-1.5 text-xs font-medium"
              >
                <Save className="h-3.5 w-3.5" />
                Simpan Draf
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={handleOpenConfirmSubmit}
                disabled={submittingFinal}
                className="gap-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {submittingFinal ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                Kumpulkan Tugas
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog Konfirmasi Submit */}
      <AlertDialog open={confirmSubmitOpen} onOpenChange={setConfirmSubmitOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kumpulkan Tugas Sekarang?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-xs text-muted-foreground">
                <p>
                  Setelah tugas dikumpulkan, status pengerjaan akan tercatat sebagai{" "}
                  <strong>Terkumpul (Submitted)</strong> dan Anda tidak dapat lagi mengubah jawaban.
                </p>
                {unansweredCount > 0 && (
                  <p className="text-amber-600 font-medium">
                    Perhatian: Masih terdapat {unansweredCount} butir soal yang belum Anda jawab.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submittingFinal}>Periksa Lagi</AlertDialogCancel>
            <AlertDialogAction
              disabled={submittingFinal}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={handleConfirmSubmit}
            >
              {submittingFinal ? "Mengumpulkan…" : "Ya, Kumpulkan Tugas"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function formatDeadline(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return isoString;
  }
}
