import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Plus,
  Presentation,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  Trash2,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { exportModulAjarPdf, unduhPdf, unduhPpt, unduhWord } from "@/lib/exporters";
import { buatIlustrasi, buatSlides } from "@/lib/modul-ai";
import { formatTanggal, type Modul } from "@/lib/modul-types";
import { useServerFn } from "@tanstack/react-start";
import { editModulAi, generateModulAi, saveModulDraftServerFn } from "@/lib/ai.functions";
import { validateTeacherDraftEdit } from "@/lib/ai/modul-contract";
import { supabase } from "@/integrations/supabase/client";
import { isRecoverableAuthError, withAuthRetry } from "@/integrations/supabase/auth-token";
import { uid } from "@/lib/cloud-store";

const INSTRUKSI_MODUL = [
  "Buat bahasa lebih sederhana",
  "Tambah contoh kontekstual",
  "Perdalam materi",
  "Tambahkan kegiatan praktik",
];

export function ModulEditor({
  modul,
  onChange,
  onSaveDraft,
  onPublish,
  onBack,
}: {
  modul: Modul;
  onChange: (modul: Modul) => void;
  onSaveDraft?: (persistedModul?: Modul) => void;
  onPublish?: () => void;
  onBack: () => void;
}) {
  const [manual, setManual] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [instruksi, setInstruksi] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [ilustrasiLoading, setIlustrasiLoading] = useState(false);
  const [pptLoading, setPptLoading] = useState(false);

  // Dirty State & Unsaved Changes Management
  const [initialSnapshot, setInitialSnapshot] = useState(() => JSON.stringify(modul));
  const [saveStatus, setSaveStatus] = useState<"clean" | "dirty" | "saving" | "saved" | "error">("clean");
  const [unsavedLeaveOpen, setUnsavedLeaveOpen] = useState(false);

  const editAi = useServerFn(editModulAi);
  const generateAi = useServerFn(generateModulAi);
  const saveDraft = useServerFn(saveModulDraftServerFn);

  useEffect(() => {
    if (saveStatus === "saving") return;
    const current = JSON.stringify(modul);
    if (current !== initialSnapshot) {
      setSaveStatus("dirty");
    } else {
      setSaveStatus("clean");
    }
  }, [modul, initialSnapshot, saveStatus]);

  const punyaIlustrasi = modul.sections.some((s) => s.ilustrasi);

  // Structured Sections Handlers
  const patchSection = (id: string, patch: Partial<Modul["sections"][number]>) =>
    onChange({
      ...modul,
      sections: modul.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });

  const addSection = () => {
    const newSection = {
      id: uid(),
      judul: `Bab ${modul.sections.length + 1}. Pembahasan Baru`,
      poin: ["Poin capaian pembelajaran pokok"],
      isi: "Uraian materi pokok pembelajaran untuk bab ini mencakup konsep dan penjelasan praktis yang komprehensif.",
    };
    onChange({
      ...modul,
      sections: [...modul.sections, newSection],
    });
  };

  const removeSection = (id: string) => {
    if (modul.sections.length <= 1) {
      toast.error("Minimal satu bab materi pokok harus dipertahankan.");
      return;
    }
    onChange({
      ...modul,
      sections: modul.sections.filter((s) => s.id !== id),
    });
  };

  // Structured Objectives Handlers
  const patchTujuan = (idx: number, deskripsi: string) => {
    const currentList = modul.aiMetadata?.tujuanPembelajaran || [];
    const updated = currentList.map((item, i) => (i === idx ? { ...item, deskripsi } : item));
    onChange({
      ...modul,
      aiMetadata: {
        ...(modul.aiMetadata || ({} as any)),
        tujuanPembelajaran: updated,
      },
    });
  };

  const addTujuan = () => {
    const currentList = modul.aiMetadata?.tujuanPembelajaran || [];
    const newItem = {
      id: uid(),
      deskripsi: "",
      evidenceIds: [],
      status: "INFERRED" as const,
    };
    onChange({
      ...modul,
      aiMetadata: {
        ...(modul.aiMetadata || ({} as any)),
        tujuanPembelajaran: [...currentList, newItem],
      },
    });
  };

  const removeTujuan = (idx: number) => {
    const currentList = modul.aiMetadata?.tujuanPembelajaran || [];
    if (currentList.length <= 1) {
      toast.error("Minimal satu tujuan pembelajaran harus dipertahankan.");
      return;
    }
    onChange({
      ...modul,
      aiMetadata: {
        ...(modul.aiMetadata || ({} as any)),
        tujuanPembelajaran: currentList.filter((_, i) => i !== idx),
      },
    });
  };

  // Structured Learning Activities Handlers
  const patchKegiatanAktivitas = (
    fase: "pendahuluan" | "inti" | "penutup",
    idx: number,
    val: string,
  ) => {
    const kp = modul.aiMetadata?.kegiatanPembelajaran || {
      pendahuluan: { aktivitas: [] },
      inti: { aktivitas: [] },
      penutup: { aktivitas: [] },
    };
    const faseObj = kp[fase] || { aktivitas: [] };
    const updatedAkt = (faseObj.aktivitas || []).map((a, i) => (i === idx ? val : a));
    onChange({
      ...modul,
      aiMetadata: {
        ...(modul.aiMetadata || ({} as any)),
        kegiatanPembelajaran: {
          ...kp,
          [fase]: { ...faseObj, aktivitas: updatedAkt },
        },
      },
    });
  };

  const patchKegiatanMenit = (
    fase: "pendahuluan" | "inti" | "penutup",
    val: number,
  ) => {
    const kp = modul.aiMetadata?.kegiatanPembelajaran || {
      pendahuluan: { aktivitas: [] },
      inti: { aktivitas: [] },
      penutup: { aktivitas: [] },
    };
    const faseObj = kp[fase] || { aktivitas: [] };
    onChange({
      ...modul,
      aiMetadata: {
        ...(modul.aiMetadata || ({} as any)),
        kegiatanPembelajaran: {
          ...kp,
          [fase]: { ...faseObj, alokasiMenit: val },
        },
      },
    });
  };

  const addKegiatanAktivitas = (fase: "pendahuluan" | "inti" | "penutup") => {
    const kp = modul.aiMetadata?.kegiatanPembelajaran || {
      pendahuluan: { aktivitas: [] },
      inti: { aktivitas: [] },
      penutup: { aktivitas: [] },
    };
    const faseObj = kp[fase] || { aktivitas: [] };
    onChange({
      ...modul,
      aiMetadata: {
        ...(modul.aiMetadata || ({} as any)),
        kegiatanPembelajaran: {
          ...kp,
          [fase]: { ...faseObj, aktivitas: [...(faseObj.aktivitas || []), ""] },
        },
      },
    });
  };

  const removeKegiatanAktivitas = (
    fase: "pendahuluan" | "inti" | "penutup",
    idx: number,
  ) => {
    const kp = modul.aiMetadata?.kegiatanPembelajaran || {
      pendahuluan: { aktivitas: [] },
      inti: { aktivitas: [] },
      penutup: { aktivitas: [] },
    };
    const faseObj = kp[fase] || { aktivitas: [] };
    if ((faseObj.aktivitas || []).length <= 1) {
      toast.error(`Minimal satu butir kegiatan ${fase} harus dipertahankan.`);
      return;
    }
    onChange({
      ...modul,
      aiMetadata: {
        ...(modul.aiMetadata || ({} as any)),
        kegiatanPembelajaran: {
          ...kp,
          [fase]: {
            ...faseObj,
            aktivitas: (faseObj.aktivitas || []).filter((_, i) => i !== idx),
          },
        },
      },
    });
  };

  // Structured Assessment Handlers
  const patchAsesmenField = (field: "teknik" | "instrumen", val: string) => {
    const as = modul.aiMetadata?.asesmen || { kriteria: [], teknik: "", instrumen: "" };
    onChange({
      ...modul,
      aiMetadata: {
        ...(modul.aiMetadata || ({} as any)),
        asesmen: { ...as, [field]: val },
      },
    });
  };

  const patchKriteria = (idx: number, val: string) => {
    const as = modul.aiMetadata?.asesmen || { kriteria: [], teknik: "", instrumen: "" };
    const updated = (as.kriteria || []).map((k, i) => (i === idx ? val : k));
    onChange({
      ...modul,
      aiMetadata: {
        ...(modul.aiMetadata || ({} as any)),
        asesmen: { ...as, kriteria: updated },
      },
    });
  };

  const addKriteria = () => {
    const as = modul.aiMetadata?.asesmen || { kriteria: [], teknik: "", instrumen: "" };
    onChange({
      ...modul,
      aiMetadata: {
        ...(modul.aiMetadata || ({} as any)),
        asesmen: { ...as, kriteria: [...(as.kriteria || []), ""] },
      },
    });
  };

  const removeKriteria = (idx: number) => {
    const as = modul.aiMetadata?.asesmen || { kriteria: [], teknik: "", instrumen: "" };
    if ((as.kriteria || []).length <= 1) {
      toast.error("Minimal satu kriteria asesmen harus dipertahankan.");
      return;
    }
    onChange({
      ...modul,
      aiMetadata: {
        ...(modul.aiMetadata || ({} as any)),
        asesmen: { ...as, kriteria: (as.kriteria || []).filter((_, i) => i !== idx) },
      },
    });
  };

  // Save Draft Server-Side Action
  const handleSaveDraft = async () => {
    setSaveStatus("saving");
    try {
      const draftPayload = {
        judul: modul.judul,
        ringkasan: modul.ringkasan,
        sections: modul.sections,
        tujuanPembelajaran: modul.aiMetadata?.tujuanPembelajaran,
        kegiatanPembelajaran: modul.aiMetadata?.kegiatanPembelajaran,
        asesmen: modul.aiMetadata?.asesmen,
        catatanKeterbatasan: modul.aiMetadata?.catatanKeterbatasan,
        aiMetadata: modul.aiMetadata,
      };

      // Client-side schema pre-validation
      validateTeacherDraftEdit(draftPayload);

      // Invoke server-side persistence with auth retry
      const result = await withAuthRetry(
        () => supabase.auth.refreshSession(),
        () =>
          saveDraft({
            data: {
              modulId: modul.id,
              draftData: draftPayload,
              expectedUpdatedAt: modul.updatedAt,
            },
          }),
      );

      if (result.status === "success" && result.persistedModul) {
        setInitialSnapshot(JSON.stringify(result.persistedModul));
        setSaveStatus("saved");
        toast.success("Draft berhasil disimpan.");
        onChange(result.persistedModul);
        onSaveDraft?.(result.persistedModul);
        return true;
      }
      return false;
    } catch (err: any) {
      console.error("[handleSaveDraft] Gagal menyimpan draf:", err);
      setSaveStatus("error");
      const message = isRecoverableAuthError(err)
        ? "Sesi login tidak valid atau kedaluwarsa. Silakan masuk kembali."
        : err?.message || "Draft gagal disimpan.";
      toast.error(message);
      return false;
    }
  };

  const handleBackClick = () => {
    if (saveStatus === "dirty") {
      setUnsavedLeaveOpen(true);
    } else {
      onBack();
    }
  };

  const runAiEdit = async () => {
    if (!instruksi.trim()) {
      toast.error("Tulis dulu instruksi untuk AI.");
      return;
    }
    setAiLoading(true);
    try {
      const hasil = await editAi({
        data: {
          modul: {
            judul: modul.judul,
            ringkasan: modul.ringkasan,
            sections: modul.sections,
            sumberInput: modul.sumberInput,
            sumberTipe: modul.sumberTipe,
          },
          instruksi,
        },
      });
      const updatedSections = hasil.sections.map((s, idx) => ({
        id: modul.sections[idx]?.id || uid(),
        judul: s.judul,
        poin: s.poin,
        isi: s.isi,
        ilustrasi: modul.sections[idx]?.ilustrasi,
      }));
      onChange({
        ...modul,
        ringkasan: hasil.ringkasan || modul.ringkasan,
        sections: updatedSections,
        updatedAt: new Date().toISOString(),
      });
      setAiOpen(false);
      setInstruksi("");
      toast.success("Modul berhasil diperbarui sesuai instruksi AI.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI gagal merevisi modul.");
    } finally {
      setAiLoading(false);
    }
  };

  const runRegenerateModul = async () => {
    const rawContent = modul.sumberInput || modul.ringkasan;
    if (!rawContent || rawContent.length < 40) {
      toast.error("Materi sumber modul tidak mencukupi untuk regenerasi AI.");
      return;
    }
    setRegenerating(true);
    try {
      const hasil = await withAuthRetry(
        () => supabase.auth.refreshSession(),
        () =>
          generateAi({
            data: {
              sumberTipe: modul.sumberTipe || "Teks",
              konten: rawContent,
              topik: modul.judul.replace(/^Modul Ajar:\s*/i, ""),
              mapel: modul.mapel,
              kelas: modul.kelas,
              ...(modul.sumberJudul ? { sumberJudul: modul.sumberJudul } : {}),
              ...(modul.sumberUrl ? { sumberUrl: modul.sumberUrl } : {}),
            },
          }),
      );
      const newSections = hasil.sections.map((s) => ({
        id: uid(),
        judul: s.judul,
        poin: s.poin,
        isi: s.isi,
      }));
      if (hasil.kesimpulan) {
        newSections.push({ id: uid(), judul: "Kesimpulan", poin: [], isi: hasil.kesimpulan });
      }
      onChange({
        ...modul,
        judul: hasil.judul || modul.judul,
        ringkasan: [
          hasil.ringkasan,
          hasil.tujuan.length ? `Tujuan pembelajaran: ${hasil.tujuan.join("; ")}.` : "",
          hasil.catatanKeterbatasan ? `Catatan sumber: ${hasil.catatanKeterbatasan}` : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
        sections: newSections,
        updatedAt: new Date().toISOString(),
      });
      setRegenerateOpen(false);
      toast.success("Modul berhasil disusun ulang dengan AI.");
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Gagal meregenerasi modul.";
      const message = isRecoverableAuthError(error)
        ? "Sesi login tidak valid atau kedaluwarsa. Keluar lalu masuk kembali, kemudian coba lagi."
        : raw;
      toast.error(message);
    } finally {
      setRegenerating(false);
    }
  };

  const generateIlustrasi = () => {
    setIlustrasiLoading(true);
    setTimeout(() => {
      onChange({
        ...modul,
        sections: modul.sections.map((s) => ({ ...s, ilustrasi: buatIlustrasi(s.judul, s.poin) })),
      });
      setIlustrasiLoading(false);
      toast.success("Ilustrasi dibuat untuk setiap sub-judul modul.");
    }, 1500);
  };

  const generatePpt = () => {
    setPptLoading(true);
    setTimeout(() => {
      const withIl = {
        ...modul,
        sections: modul.sections.map((s) => ({
          ...s,
          ilustrasi: s.ilustrasi ?? buatIlustrasi(s.judul, s.poin),
        })),
      };
      onChange({ ...withIl, slides: buatSlides(withIl) });
      setPptLoading(false);
      toast.success("Slide PPT beserta ilustrasi siap ditinjau.");
    }, 1600);
  };

  return (
    <div className="grid gap-5">
      {/* Top Header & Action Bar */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" className="-ml-2 w-fit" onClick={handleBackClick}>
            <ArrowLeft className="h-4 w-4" />
            Kembali ke Daftar Modul
          </Button>
          <h1 className="mt-1 font-display text-xl font-bold text-navy sm:text-2xl">
            {modul.judul}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge
              variant="secondary"
              className={modul.status === "Terbit" ? "bg-primary-soft text-primary" : ""}
            >
              {modul.status === "Terbit" ? "Dipublikasikan" : "Draft"}
            </Badge>

            {/* Save Status Badge */}
            {saveStatus === "dirty" && (
              <Badge
                variant="outline"
                className="border-amber-500/40 text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 text-xs flex items-center gap-1.5"
              >
                <Clock className="h-3 w-3" /> Perubahan belum disimpan
              </Badge>
            )}
            {saveStatus === "saving" && (
              <Badge
                variant="outline"
                className="border-blue-500/40 text-blue-700 bg-blue-50 dark:bg-blue-950/30 dark:text-blue-400 text-xs flex items-center gap-1.5"
              >
                <Loader2 className="h-3 w-3 animate-spin" /> Menyimpan perubahan…
              </Badge>
            )}
            {(saveStatus === "clean" || saveStatus === "saved") && (
              <Badge
                variant="outline"
                className="border-emerald-500/40 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400 text-xs flex items-center gap-1.5"
              >
                <CheckCircle2 className="h-3 w-3" /> Perubahan tersimpan
              </Badge>
            )}
            {saveStatus === "error" && (
              <Badge
                variant="outline"
                className="border-destructive/40 text-destructive bg-destructive/10 text-xs flex items-center gap-1.5"
              >
                <AlertTriangle className="h-3 w-3" /> Draft gagal disimpan
              </Badge>
            )}

            <span>
              {[modul.mapel, modul.kelas].filter(Boolean).join(" · ") || "Belum ada kelas"}
            </span>
            <span>· Sumber: {modul.sumberTipe}</span>
            {modul.sumberJudul && (
              <span className="truncate max-w-xs text-xs">({modul.sumberJudul})</span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <Button
            variant={manual ? "secondary" : "outline"}
            size="sm"
            onClick={() => setManual((v) => !v)}
          >
            {manual ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
            {manual ? "Selesai Edit" : "Edit Terstruktur"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAiOpen(true)}>
            <Sparkles className="h-4 w-4" />
            Edit dengan AI
          </Button>
          <Button variant="outline" size="sm" onClick={() => setRegenerateOpen(true)}>
            <RefreshCw className="h-4 w-4" />
            Regenerasi
          </Button>
          <Button
            size="sm"
            onClick={handleSaveDraft}
            disabled={saveStatus === "saving"}
            className="bg-navy hover:bg-navy/90 text-white font-medium"
          >
            {saveStatus === "saving" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saveStatus === "saving" ? "Menyimpan…" : "Simpan Draft"}
          </Button>
          {onPublish ? (
            <Button size="sm" variant="secondary" onClick={onPublish}>
              <Send className="h-4 w-4" />
              Publikasikan
            </Button>
          ) : null}
        </div>
      </div>

      {/* Provenance & AI Grounding Overview Card */}
      {modul.aiMetadata && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 text-xs sm:text-sm text-foreground/90 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-semibold text-navy">
                <Sparkles className="h-4 w-4 text-primary" />
                <span>Rekam Jejak & Mutu Modul (AI-2D Provenance)</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  Status: {modul.status}
                </Badge>
                {modul.aiMetadata.teacherEdited ? (
                  <Badge
                    variant="outline"
                    className="border-blue-500/40 text-blue-700 bg-blue-50 dark:bg-blue-950/30 dark:text-blue-400 text-xs"
                  >
                    Ditinjau Guru: Ya
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-muted text-muted-foreground text-xs">
                    Ditinjau Guru: Belum
                  </Badge>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 border-t text-xs">
              <div>
                <span className="text-muted-foreground block">Sumber Rujukan</span>
                <span className="font-medium truncate block">{modul.sumberJudul || modul.sumberTipe}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Dibuat oleh AI</span>
                <span className="font-medium block">{modul.aiMetadata ? "Ya (Tervalidasi)" : "Tidak"}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Mutu AI Asli</span>
                <span className="font-medium block">
                  {modul.aiMetadata.originalQualityValidation?.decision ||
                    modul.aiMetadata.qualityValidation?.decision ||
                    "PASS"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block">Terakhir Disimpan</span>
                <span className="font-medium block">{formatTanggal(modul.updatedAt)}</span>
              </div>
            </div>

            {modul.aiMetadata.catatanKeterbatasan && (
              <p className="text-muted-foreground text-xs pt-1 border-t">
                <strong className="text-foreground">Catatan Keterbatasan:</strong>{" "}
                {modul.aiMetadata.catatanKeterbatasan}
              </p>
            )}
            {(modul.aiMetadata.originalQualityValidation?.decision === "REVISE" ||
              modul.aiMetadata.qualityValidation?.decision === "REVISE") && (
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400 pt-1">
                Catatan Mutu: Modul ini awalnya ditandai perbaikan (REVISE). Guru disarankan memeriksa kembali butir pembelajaran dan asesmen sebelum publikasi.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Editor Tabs */}
      <Tabs defaultValue="isi">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="isi">Materi Pokok & Ringkasan</TabsTrigger>
          <TabsTrigger value="pedagogis">Tujuan & Alur Pembelajaran</TabsTrigger>
          <TabsTrigger value="asesmen">Asesmen Pembelajaran</TabsTrigger>
          <TabsTrigger value="ilustrasi">Ilustrasi AI</TabsTrigger>
          <TabsTrigger value="ppt">PPT Otomatis</TabsTrigger>
        </TabsList>

        {/* TAB 1: MATERI POKOK & RINGKASAN */}
        <TabsContent value="isi" className="mt-4 grid gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-base text-navy">Informasi Umum Modul</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 pt-0">
              {manual ? (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="judul">Judul Modul</Label>
                    <Input
                      id="judul"
                      value={modul.judul}
                      onChange={(e) => onChange({ ...modul, judul: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="ringkasan">Ringkasan Modul</Label>
                    <Textarea
                      id="ringkasan"
                      rows={3}
                      value={modul.ringkasan}
                      onChange={(e) => onChange({ ...modul, ringkasan: e.target.value })}
                    />
                  </div>
                  {modul.aiMetadata && (
                    <div className="grid gap-2">
                      <Label htmlFor="catatanKeterbatasan">Catatan Keterbatasan Sumber</Label>
                      <Textarea
                        id="catatanKeterbatasan"
                        rows={2}
                        value={modul.aiMetadata.catatanKeterbatasan || ""}
                        onChange={(e) =>
                          onChange({
                            ...modul,
                            aiMetadata: {
                              ...modul.aiMetadata,
                              catatanKeterbatasan: e.target.value,
                            },
                          })
                        }
                        placeholder="Catatan mengenai materi yang belum tercakup di rujukan…"
                      />
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-2">
                  <h3 className="font-display text-base font-semibold text-navy">{modul.judul}</h3>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                    {modul.ringkasan}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Bab Materi Pokok */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Bab Materi Pokok ({modul.sections.length})
              </h2>
              {manual && (
                <Button size="sm" variant="outline" onClick={addSection} className="gap-1 text-xs">
                  <Plus className="h-3.5 w-3.5" /> Tambah Bab
                </Button>
              )}
            </div>

            {modul.sections.map((s, i) => (
              <Card key={s.id}>
                <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
                  {manual ? (
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground mb-1 block">Judul Bab {i + 1}</Label>
                      <Input
                        value={s.judul}
                        onChange={(e) => patchSection(s.id, { judul: e.target.value })}
                      />
                    </div>
                  ) : (
                    <CardTitle className="font-display text-base text-navy">
                      Bab {i + 1}. {s.judul}
                    </CardTitle>
                  )}
                  {manual && (
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={modul.sections.length <= 1}
                      onClick={() => removeSection(s.id)}
                      className="text-destructive hover:bg-destructive/10 shrink-0"
                      title="Hapus Bab"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="grid gap-3 pt-0">
                  {manual ? (
                    <>
                      <div className="grid gap-2">
                        <Label>Poin-poin Capaian (satu per baris)</Label>
                        <Textarea
                          rows={3}
                          value={s.poin.join("\n")}
                          onChange={(e) =>
                            patchSection(s.id, {
                              poin: e.target.value.split("\n").filter((p) => p.trim() !== ""),
                            })
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Uraian Materi Bab</Label>
                        <Textarea
                          rows={5}
                          value={s.isi}
                          onChange={(e) => patchSection(s.id, { isi: e.target.value })}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <ul className="grid gap-1.5 text-sm">
                        {s.poin.map((p) => (
                          <li key={p} className="flex gap-2">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                        {s.isi}
                      </p>
                    </>
                  )}
                  {s.ilustrasi ? (
                    <img
                      src={s.ilustrasi}
                      alt={`Ilustrasi ${s.judul}`}
                      className="w-full max-w-sm rounded-xl border mt-2"
                    />
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  toast.info("Menyiapkan dokumen PDF Modul Ajar…");
                  await exportModulAjarPdf(modul, { withIlustrasi: false });
                  toast.success("Dokumen PDF berhasil diunduh.");
                } catch {
                  toast.error("Gagal membuat file PDF.");
                }
              }}
            >
              <FileText className="h-4 w-4" />
              Unduh PDF
            </Button>
            <Button variant="outline" onClick={() => unduhWord(modul)}>
              <Download className="h-4 w-4" />
              Unduh Word
            </Button>
          </div>
        </TabsContent>

        {/* TAB 2: TUJUAN & ALUR PEMBELAJARAN */}
        <TabsContent value="pedagogis" className="mt-4 grid gap-5">
          {/* Tujuan Pembelajaran */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="font-display text-base text-navy">
                  Tujuan Pembelajaran Kurikulum Merdeka
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Capaian kompetensi operasional yang ditargetkan pada peserta didik.
                </p>
              </div>
              {manual && (
                <Button size="sm" variant="outline" onClick={addTujuan} className="gap-1 text-xs">
                  <Plus className="h-3.5 w-3.5" /> Tambah Tujuan
                </Button>
              )}
            </CardHeader>
            <CardContent className="grid gap-3 pt-0">
              {(modul.aiMetadata?.tujuanPembelajaran || []).length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  Belum ada tujuan pembelajaran terstruktur pada modul ini.
                </p>
              ) : (
                (modul.aiMetadata?.tujuanPembelajaran || []).map((tp, idx) => (
                  <div
                    key={tp.id || idx}
                    className="flex items-start gap-3 rounded-lg border p-3 bg-card"
                  >
                    <span className="font-display text-xs font-bold text-primary mt-2">
                      TP {idx + 1}
                    </span>
                    <div className="flex-1">
                      {manual ? (
                        <Textarea
                          rows={2}
                          value={tp.deskripsi}
                          onChange={(e) => patchTujuan(idx, e.target.value)}
                          placeholder="Deskripsi tujuan pembelajaran (minimal 5 karakter)…"
                          className="text-sm"
                        />
                      ) : (
                        <p className="text-sm text-foreground">{tp.deskripsi}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5">
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          Status: {tp.status || "SUPPORTED"}
                        </Badge>
                      </div>
                    </div>
                    {manual && (
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={(modul.aiMetadata?.tujuanPembelajaran || []).length <= 1}
                        onClick={() => removeTujuan(idx)}
                        className="text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Kegiatan Pembelajaran 3 Fase */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-base text-navy">
                Kegiatan Pembelajaran (3 Fase)
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Alur tahapan instruksional: Pendahuluan, Inti, dan Penutup.
              </p>
            </CardHeader>
            <CardContent className="grid gap-5 pt-0">
              {(["pendahuluan", "inti", "penutup"] as const).map((fase) => {
                const kp = modul.aiMetadata?.kegiatanPembelajaran?.[fase] || {
                  alokasiMenit: fase === "inti" ? 60 : 15,
                  aktivitas: [],
                };
                const faseTitle =
                  fase === "pendahuluan"
                    ? "1. Kegiatan Pendahuluan"
                    : fase === "inti"
                      ? "2. Kegiatan Inti"
                      : "3. Kegiatan Penutup";

                return (
                  <div key={fase} className="rounded-xl border p-4 bg-muted/20 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                      <span className="font-semibold text-sm text-navy">{faseTitle}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Alokasi:</span>
                        {manual ? (
                          <Input
                            type="number"
                            value={kp.alokasiMenit || (fase === "inti" ? 60 : 15)}
                            onChange={(e) =>
                              patchKegiatanMenit(fase, parseInt(e.target.value) || 15)
                            }
                            className="h-7 w-20 text-xs"
                          />
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            {kp.alokasiMenit || (fase === "inti" ? 60 : 15)} Menit
                          </Badge>
                        )}
                        {manual && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => addKegiatanAktivitas(fase)}
                            className="h-7 gap-1 text-xs"
                          >
                            <Plus className="h-3 w-3" /> Tambah Poin
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      {(kp.aktivitas || []).map((akt, aktIdx) => (
                        <div key={aktIdx} className="flex items-start gap-2">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          <div className="flex-1">
                            {manual ? (
                              <Input
                                value={akt}
                                onChange={(e) =>
                                  patchKegiatanAktivitas(fase, aktIdx, e.target.value)
                                }
                                placeholder={`Aktivitas ${fase}…`}
                                className="text-sm"
                              />
                            ) : (
                              <p className="text-sm text-foreground">{akt}</p>
                            )}
                          </div>
                          {manual && (
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={(kp.aktivitas || []).length <= 1}
                              onClick={() => removeKegiatanAktivitas(fase, aktIdx)}
                              className="h-8 w-8 text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: ASESMEN PEMBELAJARAN */}
        <TabsContent value="asesmen" className="mt-4 grid gap-5">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="font-display text-base text-navy">
                  Kriteria Ketuntasan Tujuan Pembelajaran
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Rubrik dan parameter ketercapaian pemahaman peserta didik.
                </p>
              </div>
              {manual && (
                <Button size="sm" variant="outline" onClick={addKriteria} className="gap-1 text-xs">
                  <Plus className="h-3.5 w-3.5" /> Tambah Kriteria
                </Button>
              )}
            </CardHeader>
            <CardContent className="grid gap-3 pt-0">
              {((modul.aiMetadata?.asesmen?.kriteria as string[]) || []).map((krit, kIdx) => (
                <div key={kIdx} className="flex items-center gap-2">
                  <span className="font-display text-xs font-semibold text-primary">
                    {kIdx + 1}.
                  </span>
                  <div className="flex-1">
                    {manual ? (
                      <Input
                        value={krit}
                        onChange={(e) => patchKriteria(kIdx, e.target.value)}
                        placeholder="Kriteria ketuntasan peserta didik…"
                        className="text-sm"
                      />
                    ) : (
                      <p className="text-sm text-foreground">{krit}</p>
                    )}
                  </div>
                  {manual && (
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={((modul.aiMetadata?.asesmen?.kriteria as string[]) || []).length <= 1}
                      onClick={() => removeKriteria(kIdx)}
                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-base text-navy">
                Metode & Instrumen Asesmen
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 pt-0 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="teknikAsesmen">Teknik Asesmen</Label>
                {manual ? (
                  <Input
                    id="teknikAsesmen"
                    value={modul.aiMetadata?.asesmen?.teknik || ""}
                    onChange={(e) => patchAsesmenField("teknik", e.target.value)}
                    placeholder="Misal: Tes Kinerja Praktik, Observasi, Portofolio"
                  />
                ) : (
                  <p className="text-sm font-medium text-foreground bg-muted/30 p-2.5 rounded-lg border">
                    {modul.aiMetadata?.asesmen?.teknik || "Belum ditentukan"}
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="instrumenAsesmen">Instrumen Asesmen</Label>
                {manual ? (
                  <Input
                    id="instrumenAsesmen"
                    value={modul.aiMetadata?.asesmen?.instrumen || ""}
                    onChange={(e) => patchAsesmenField("instrumen", e.target.value)}
                    placeholder="Misal: Rubrik Penilaian Konfigurasi, Lembar Observasi"
                  />
                ) : (
                  <p className="text-sm font-medium text-foreground bg-muted/30 p-2.5 rounded-lg border">
                    {modul.aiMetadata?.asesmen?.instrumen || "Belum ditentukan"}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 4: ILUSTRASI AI */}
        <TabsContent value="ilustrasi" className="mt-4 grid gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-base text-navy">
                Ilustrasi Modul dengan AI
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 pt-0">
              <p className="text-sm text-muted-foreground">
                AI membaca setiap sub-judul modul lalu membuat ilustrasi yang sesuai konteksnya.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={generateIlustrasi} disabled={ilustrasiLoading}>
                  {ilustrasiLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ImageIcon className="h-4 w-4" />
                  )}
                  {ilustrasiLoading ? "AI sedang menggambar…" : "Generate Ilustrasi dengan AI"}
                </Button>
                <Button
                  variant="outline"
                  disabled={!punyaIlustrasi}
                  onClick={async () => {
                    try {
                      toast.info("Menyiapkan dokumen PDF dengan ilustrasi…");
                      await exportModulAjarPdf(modul, { withIlustrasi: true });
                      toast.success("Dokumen PDF berilustrasi berhasil diunduh.");
                    } catch {
                      toast.error("Gagal membuat file PDF.");
                    }
                  }}
                >
                  <FileText className="h-4 w-4" />
                  Unduh PDF dengan Ilustrasi
                </Button>
                <Button
                  variant="outline"
                  disabled={!punyaIlustrasi}
                  onClick={() => unduhWord(modul, true)}
                >
                  <Download className="h-4 w-4" />
                  Unduh Word dengan Ilustrasi
                </Button>
              </div>

              {punyaIlustrasi ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {modul.sections.map((s) =>
                    s.ilustrasi ? (
                      <div key={s.id} className="grid gap-2 rounded-xl border p-3">
                        <img
                          src={s.ilustrasi}
                          alt={`Ilustrasi ${s.judul}`}
                          className="w-full rounded-lg border"
                        />
                        <p className="truncate text-sm font-medium">{s.judul}</p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              patchSection(s.id, {
                                ilustrasi: buatIlustrasi(s.judul, s.poin, Date.now()),
                              });
                              toast.success("Ilustrasi diganti.");
                            }}
                          >
                            <RefreshCw className="h-4 w-4" />
                            Ganti
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => {
                              patchSection(s.id, { ilustrasi: undefined });
                              toast.success("Ilustrasi dihapus.");
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                            Hapus
                          </Button>
                        </div>
                      </div>
                    ) : null,
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                  Belum ada ilustrasi. Jalankan generator untuk membuat ilustrasi tiap sub-judul.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 5: PPT OTOMATIS */}
        <TabsContent value="ppt" className="mt-4 grid gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-base text-navy">Buat PPT Otomatis</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 pt-0">
              <p className="text-sm text-muted-foreground">
                Modul → AI membaca struktur → AI menyusun slide → AI menambahkan ilustrasi →
                pratinjau → unduh PPT.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={generatePpt} disabled={pptLoading}>
                  {pptLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Presentation className="h-4 w-4" />
                  )}
                  {pptLoading ? "AI sedang menyusun slide…" : "Generate PPT dengan Ilustrasi"}
                </Button>
                <Button
                  variant="outline"
                  disabled={modul.slides.length === 0}
                  onClick={() => unduhPpt(modul)}
                >
                  <Download className="h-4 w-4" />
                  Unduh PPT
                </Button>
              </div>

              {modul.slides.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {modul.slides.map((slide, i) => (
                    <div
                      key={slide.id}
                      className="grid gap-2 rounded-xl border bg-card p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-display text-sm font-semibold text-navy">
                          {slide.judul}
                        </p>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          Slide {i + 1}
                        </span>
                      </div>
                      {slide.ilustrasi ? (
                        <img
                          src={slide.ilustrasi}
                          alt=""
                          className="h-28 w-full rounded-lg border object-cover"
                        />
                      ) : null}
                      <ul className="grid gap-1 text-xs text-muted-foreground">
                        {slide.bullets.map((b) => (
                          <li key={b} className="flex gap-2">
                            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                  Belum ada slide. Jalankan generator untuk membuat pratinjau slide.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit dengan AI Dialog */}
      <Dialog open={aiOpen} onOpenChange={aiLoading ? () => undefined : setAiOpen}>
        <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] sm:max-w-md overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <DialogHeader className="min-w-0">
            <DialogTitle className="font-display text-navy break-words">
              Edit Modul dengan AI
            </DialogTitle>
            <DialogDescription className="break-words">
              Tulis instruksi revisi terfokus. AI hanya akan menyempurnakan bagian yang relevan.
            </DialogDescription>
          </DialogHeader>
          {aiLoading ? (
            <div className="grid place-items-center gap-3 py-10 text-center min-w-0 px-2">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground break-words">
                GuruPro AI sedang merevisi modul…
              </p>
            </div>
          ) : (
            <div className="grid gap-3 min-w-0">
              <div className="flex flex-wrap gap-2 min-w-0">
                {INSTRUKSI_MODUL.map((i) => (
                  <Button key={i} size="sm" variant="outline" onClick={() => setInstruksi(i)}>
                    {i}
                  </Button>
                ))}
              </div>
              <Textarea
                rows={3}
                value={instruksi}
                onChange={(e) => setInstruksi(e.target.value)}
                placeholder="Misal: tambah contoh kontekstual industri untuk siswa SMK"
                className="min-w-0 max-w-full break-words"
              />
            </div>
          )}
          {!aiLoading ? (
            <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 w-full pt-2">
              <Button variant="ghost" onClick={() => setAiOpen(false)} className="w-full sm:w-auto">
                Batal
              </Button>
              <Button onClick={runAiEdit} className="w-full sm:w-auto">
                <Sparkles className="h-4 w-4" />
                Terapkan Revisi AI
              </Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Regenerasi Modul Dialog */}
      <Dialog
        open={regenerateOpen}
        onOpenChange={regenerating ? () => undefined : setRegenerateOpen}
      >
        <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] sm:max-w-md overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <DialogHeader className="min-w-0">
            <DialogTitle className="font-display text-navy break-words">
              Regenerasi Modul dengan AI
            </DialogTitle>
            <DialogDescription className="break-words">
              Menyusun ulang seluruh bab modul dengan AI berakar pada materi rujukan asli yang
              tersimpan.
            </DialogDescription>
          </DialogHeader>
          {regenerating ? (
            <div className="grid place-items-center gap-3 py-10 text-center min-w-0 px-2">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <p className="text-sm font-semibold text-navy break-words">
                GuruPro AI sedang menyusun ulang modul…
              </p>
              <p className="text-xs text-muted-foreground break-words">
                Membaca kembali materi rujukan dan merumuskan ulang bab modul.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 text-sm text-muted-foreground min-w-0">
              <p className="break-words">
                Seluruh bab materi dan poin kunci saat ini akan disusun ulang dari sumber materi
                asli (<span className="font-semibold text-foreground">{modul.sumberTipe}</span>
                {modul.sumberJudul ? `: ${modul.sumberJudul}` : ""}).
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 break-words">
                Catatan: Modul akan dibuat ulang berdasarkan sumber rujukan awal.
              </p>
            </div>
          )}
          {!regenerating ? (
            <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 w-full pt-2">
              <Button
                variant="ghost"
                onClick={() => setRegenerateOpen(false)}
                className="w-full sm:w-auto"
              >
                Batal
              </Button>
              <Button onClick={runRegenerateModul} className="w-full sm:w-auto">
                <RefreshCw className="h-4 w-4" />
                Mulai Regenerasi
              </Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Dialog Konfirmasi Perubahan Belum Disimpan */}
      <AlertDialog open={unsavedLeaveOpen} onOpenChange={setUnsavedLeaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-navy">
              Perubahan Belum Disimpan
            </AlertDialogTitle>
            <AlertDialogDescription>
              Ada beberapa suntingan draf modul ajar yang belum Anda simpan ke server. Apakah Anda
              ingin menyimpannya sekarang sebelum kembali ke daftar modul?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <AlertDialogCancel onClick={() => setUnsavedLeaveOpen(false)}>
              Batal
            </AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                setUnsavedLeaveOpen(false);
                onBack();
              }}
            >
              Kembali Tanpa Menyimpan
            </Button>
            <AlertDialogAction
              onClick={async () => {
                const ok = await handleSaveDraft();
                if (ok) {
                  setUnsavedLeaveOpen(false);
                  onBack();
                }
              }}
              className="bg-navy hover:bg-navy/90 text-white"
            >
              Simpan & Kembali
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
