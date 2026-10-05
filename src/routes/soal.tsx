import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth-store";
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  FileQuestion,
  History,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { archiveAcademicItem } from "@/lib/archive-store";
import { trackProductEvent } from "@/lib/analytics/product-events";

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
import { Checkbox } from "@/components/ui/checkbox";
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
import { useModuls } from "@/lib/modul-store";
import { useKelas } from "@/lib/kelas-store";
import { useTahunAjaran } from "@/lib/tahun-ajaran-store";
import { uid } from "@/lib/cloud-store";

import { INSTRUKSI_AI } from "@/lib/soal-ai";
import { generateSoalAi, reviseSoalAi, saveQuestionDraftServerFn } from "@/lib/ai.functions";
import type { QuestionAiMetadata } from "@/lib/ai/question-contract";
import { supabase } from "@/integrations/supabase/client";
import { isRecoverableAuthError, withAuthRetry } from "@/integrations/supabase/auth-token";
import {
  addPaket,
  deletePaket,
  duplicatePaket,
  publishPaket,
  reloadPaketSoal,
  terbitkanSebagaiTugas,
  updatePaket,
  usePaketSoal,
} from "@/lib/soal-store";
import {
  JENIS_SOAL,
  TINGKAT,
  type JenisSoal,
  type PaketSoal,
  type Soal,
  type Tingkat,
} from "@/lib/soal-types";

export const Route = createFileRoute("/soal")({
  head: () => ({
    meta: [
      { title: "Bank Soal — GuruPro" },
      {
        name: "description",
        content:
          "Buat soal manual atau dibantu AI dari modul ajar, simpan ke bank soal, lalu terbitkan sebagai tugas untuk kelas Anda.",
      },
      { property: "og:title", content: "Bank Soal — GuruPro" },
      {
        property: "og:description",
        content:
          "Buat soal manual atau dibantu AI, simpan ke bank soal, lalu terbitkan sebagai tugas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SoalPage,
});

type Mode = "bank" | "buat" | "review";

function SoalPage() {
  const { profile, user, ready } = useAuth();
  const currentGuruId = user?.id || profile.id;
  const { kelasList } = useKelas();
  const { selectedYear } = useTahunAjaran(currentGuruId);

  useEffect(() => {
    trackProductEvent("QUESTION_GENERATOR_OPENED", "soal", {
      userId: currentGuruId,
      role: profile.role,
    });
  }, [currentGuruId, profile.role]);

  // Kelas milik guru pada tahun ajaran aktif
  const myKelas = useMemo(() => {
    return kelasList.filter(
      (k) =>
        (k.guruId === currentGuruId) &&
        (!selectedYear || k.tahunAjaran === selectedYear),
    );
  }, [kelasList, currentGuruId, selectedYear]);

  // Semua kelas milik guru untuk pemetaan lintas tahun
  const allTeacherKelas = useMemo(() => {
    return kelasList.filter((k) => k.guruId === currentGuruId);
  }, [kelasList, currentGuruId]);

  const teacherClassNamesInYear = useMemo(() => {
    return new Set(myKelas.map((k) => `${k.tingkat} ${k.namaKelas}`.trim().toLowerCase()));
  }, [myKelas]);

  const otherYearClassNames = useMemo(() => {
    if (!selectedYear) return new Set<string>();
    return new Set(
      allTeacherKelas
        .filter((k) => k.tahunAjaran && k.tahunAjaran !== selectedYear)
        .map((k) => `${k.tingkat} ${k.namaKelas}`.trim().toLowerCase()),
    );
  }, [allTeacherKelas, selectedYear]);

  const moduls = useModuls();
  // Modul yang relevan dengan tahun terpilih
  const myClassIdsInYear = useMemo(() => new Set(myKelas.map((k) => k.id)), [myKelas]);
  const availableModulsInYear = useMemo(() => {
    if (!selectedYear) return moduls;
    return moduls.filter((m) => {
      if (m.kelasId) return myClassIdsInYear.has(m.kelasId);
      if (m.kelas) return teacherClassNamesInYear.has(m.kelas.trim().toLowerCase());
      return true;
    });
  }, [moduls, selectedYear, myClassIdsInYear, teacherClassNamesInYear]);

  // ID modul di tahun lain
  const modulIdsInOtherYears = useMemo(() => {
    if (!selectedYear) return new Set<string>();
    const otherClassIds = new Set(
      allTeacherKelas.filter((k) => k.tahunAjaran && k.tahunAjaran !== selectedYear).map((k) => k.id),
    );
    return new Set(
      moduls
        .filter((m) => {
          if (m.kelasId && otherClassIds.has(m.kelasId)) return true;
          if (m.kelas && otherYearClassNames.has(m.kelas.trim().toLowerCase())) return true;
          return false;
        })
        .map((m) => m.id),
    );
  }, [allTeacherKelas, selectedYear, moduls, otherYearClassNames]);

  const generateAi = useServerFn(generateSoalAi);
  const reviseAi = useServerFn(reviseSoalAi);
  const saveQuestionDraft = useServerFn(saveQuestionDraftServerFn);
  const pakets = usePaketSoal();

  const [mode, setMode] = useState<Mode>("bank");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"semua" | "Draft" | "Terbit">("semua");

  // draft review state (AI-4E)
  const [judul, setJudul] = useState("");
  const [topik, setTopik] = useState("");
  const [modulId, setModulId] = useState("");
  const [draftSoal, setDraftSoal] = useState<Soal[]>([]);
  const [paketId, setPaketId] = useState<string | null>(null);
  const [activePaket, setActivePaket] = useState<PaketSoal | null>(null);
  const [aiMetadata, setAiMetadata] = useState<QuestionAiMetadata | null>(null);
  const [initialSnapshot, setInitialSnapshot] = useState<{
    judul: string;
    topik: string;
    soal: Soal[];
  } | null>(null);
  const [saveState, setSaveState] = useState<"clean" | "dirty" | "saving" | "saved" | "error">("clean");
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [pendingMode, setPendingMode] = useState<Mode | null>(null);

  // AI form
  const [jumlah, setJumlah] = useState("5");
  const [tingkat, setTingkat] = useState<Tingkat>("Sedang");
  const [jenis, setJenis] = useState<JenisSoal>("Pilihan Ganda");
  const [loading, setLoading] = useState(false);

  // manual form
  const [mPertanyaan, setMPertanyaan] = useState("");
  const [mJenis, setMJenis] = useState<JenisSoal>("Pilihan Ganda");
  const [mKunci, setMKunci] = useState("");

  // review helpers
  const [editId, setEditId] = useState<string | null>(null);
  const [aiTarget, setAiTarget] = useState<Soal | null>(null);
  const [instruksi, setInstruksi] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  // bank actions
  const [terbitTarget, setTerbitTarget] = useState<PaketSoal | null>(null);
  const [kelasPilihan, setKelasPilihan] = useState<string[]>([]);
  const [hapus, setHapus] = useState<PaketSoal | null>(null);
  const [arsipTarget, setArsipTarget] = useState<PaketSoal | null>(null);
  const [arsipLoading, setArsipLoading] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pakets.filter((p) => {
      // Filter tahun ajaran melalui relasi kelas / modul
      if (selectedYear) {
        if (p.kelas && p.kelas.length > 0) {
          const hasCurrentYearClass = p.kelas.some((label) =>
            teacherClassNamesInYear.has(label.trim().toLowerCase()),
          );
          const hasOnlyOtherYearClasses = p.kelas.every((label) =>
            otherYearClassNames.has(label.trim().toLowerCase()),
          );
          if (hasOnlyOtherYearClasses && !hasCurrentYearClass) {
            return false;
          }
        }
        if (p.modulId && modulIdsInOtherYears.has(p.modulId)) {
          return false;
        }
      }

      return (
        (statusFilter === "semua" || p.status === statusFilter) &&
        (!q || p.judul.toLowerCase().includes(q) || p.topik.toLowerCase().includes(q))
      );
    });
  }, [
    pakets,
    query,
    statusFilter,
    selectedYear,
    teacherClassNamesInYear,
    otherYearClassNames,
    modulIdsInOtherYears,
  ]);

  const isDirty = useMemo(() => {
    if (!initialSnapshot) return false;
    if (judul.trim() !== initialSnapshot.judul.trim()) return true;
    if (topik.trim() !== initialSnapshot.topik.trim()) return true;
    if (draftSoal.length !== initialSnapshot.soal.length) return true;
    return JSON.stringify(draftSoal) !== JSON.stringify(initialSnapshot.soal);
  }, [initialSnapshot, judul, topik, draftSoal]);

  if (ready && profile.role !== "guru") {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Akses Khusus Guru</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Halaman Bank Soal hanya dapat diakses oleh akun Guru terdaftar.
          </p>
          <div className="pt-2 flex justify-center">
            <Button asChild variant="outline">
              <Link to="/">Kembali ke Dashboard</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const resetDraft = () => {
    setJudul("");
    setTopik("");
    setModulId("");
    setDraftSoal([]);
    setPaketId(null);
    setActivePaket(null);
    setAiMetadata(null);
    setInitialSnapshot(null);
    setSaveState("clean");
    setSaveErrorMessage(null);
    setMPertanyaan("");
    setMKunci("");
  };

  const handleOpenReview = (p: PaketSoal) => {
    setJudul(p.judul);
    setTopik(p.topik);
    setModulId(p.modulId ?? "");
    setDraftSoal(JSON.parse(JSON.stringify(p.soal)));
    setPaketId(p.id);
    setActivePaket(p);
    setAiMetadata((p.ai_metadata as any) || null);
    setInitialSnapshot({
      judul: p.judul,
      topik: p.topik,
      soal: JSON.parse(JSON.stringify(p.soal)),
    });
    setEditId(null);
    setSaveState("clean");
    setSaveErrorMessage(null);
    setMode("review");
  };

  const handleAttemptLeaveReview = (targetMode: Mode) => {
    if (isDirty) {
      setPendingMode(targetMode);
      setShowLeaveDialog(true);
    } else {
      setMode(targetMode);
    }
  };

  const handleConfirmDiscard = () => {
    setShowLeaveDialog(false);
    if (initialSnapshot) {
      setJudul(initialSnapshot.judul);
      setTopik(initialSnapshot.topik);
      setDraftSoal(JSON.parse(JSON.stringify(initialSnapshot.soal)));
    }
    setSaveState("clean");
    if (pendingMode) {
      setMode(pendingMode);
      setPendingMode(null);
    }
  };

  const materiModul = (id: string) => {
    const m = moduls.find((x) => x.id === id);
    if (!m) return "";
    return [
      m.judul,
      m.ringkasan,
      ...m.sections.map(
        (sec) => `${sec.judul}\n${sec.poin.map((p) => `- ${p}`).join("\n")}\n${sec.isi}`,
      ),
    ]
      .filter(Boolean)
      .join("\n\n");
  };

  const runGenerate = async () => {
    const modul = moduls.find((m) => m.id === modulId);
    const t = topik.trim() || modul?.judul.replace(/^Modul Ajar:\s*/, "") || "";
    if (!t) {
      toast.error("Pilih modul sumber atau tulis topik/materi terlebih dahulu.");
      return;
    }
    setLoading(true);
    try {
      const hasil = await withAuthRetry(
        () => supabase.auth.refreshSession(),
        () =>
          generateAi({
            data: {
              topik: t,
              jumlah: Number(jumlah) || 5,
              tingkat,
              jenis,
              materi: modul ? materiModul(modul.id) : "",
            },
          }),
      );
      const unik: Soal[] = [];
      for (const h of hasil) {
        const key = h.pertanyaan.trim().toLowerCase();
        if (!key || unik.some((u) => u.pertanyaan.trim().toLowerCase() === key)) continue;
        unik.push({
          id: uid(),
          pertanyaan: h.pertanyaan,
          jenis: h.jenis,
          opsi: h.opsi,
          kunci: h.kunci,
        });
      }
      if (unik.length === 0) {
        toast.error("AI belum menghasilkan soal yang valid. Coba lagi.");
        return;
      }
      setTopik(t);
      const finalTitle = judul.trim() || t;
      setJudul(finalTitle);
      setDraftSoal(unik);
      setActivePaket(null);
      setAiMetadata(null);
      setInitialSnapshot({
        judul: finalTitle,
        topik: t,
        soal: JSON.parse(JSON.stringify(unik)),
      });
      setSaveState("clean");
      setMode("review");
      toast.success(`${unik.length} soal berhasil dibuat GuruPro AI.`);
    } catch (error) {
      const raw = error instanceof Error ? error.message : "AI gagal membuat soal.";
      const message = isRecoverableAuthError(error)
        ? "Sesi login tidak valid atau kedaluwarsa. Keluar lalu masuk kembali, kemudian coba lagi."
        : raw;
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const addManual = () => {
    if (!mPertanyaan.trim() || !mKunci.trim()) {
      toast.error("Pertanyaan dan kunci jawaban wajib diisi.");
      return;
    }
    const soal: Soal = {
      id: uid(),
      pertanyaan: mPertanyaan.trim(),
      jenis: mJenis,
      opsi: mJenis === "Pilihan Ganda" ? ["Opsi A", "Opsi B", "Opsi C", "Opsi D"] : [],
      kunci: mKunci.trim(),
      teacherEdited: true,
    };
    setDraftSoal((prev) => [...prev, soal]);
    setMPertanyaan("");
    setMKunci("");
    toast.success("Soal ditambahkan ke draf.");
  };

  const handleSaveDraft = async () => {
    if (draftSoal.length === 0) {
      toast.error("Belum ada soal pada draf ini.");
      return;
    }
    const judulFinal = judul.trim() || topik.trim() || "Paket Soal Baru";
    const topikFinal = topik.trim() || judulFinal;

    if (judulFinal.length < 3) {
      toast.error("Judul paket soal minimal 3 karakter.");
      return;
    }
    if (topikFinal.length < 3) {
      toast.error("Topik paket soal minimal 3 karakter.");
      return;
    }

    // Client-side canonical checks before saving
    for (let i = 0; i < draftSoal.length; i++) {
      const q = draftSoal[i];
      if (!q) continue;
      if (!q.pertanyaan || q.pertanyaan.trim().length < 5) {
        toast.error(`Soal #${i + 1}: Teks pertanyaan minimal 5 karakter.`);
        return;
      }
      if (q.jenis === "Pilihan Ganda") {
        if (!Array.isArray(q.opsi) || q.opsi.length !== 4) {
          toast.error(`Soal #${i + 1}: Pilihan Ganda wajib memiliki tepat 4 opsi.`);
          return;
        }
        if (q.opsi.some((o) => !o || !o.trim())) {
          toast.error(`Soal #${i + 1}: Semua 4 opsi jawaban harus terisi.`);
          return;
        }
        const uniqueOpts = new Set(q.opsi.map((o) => o.trim().toLowerCase()));
        if (uniqueOpts.size !== 4) {
          toast.error(`Soal #${i + 1}: Terdapat opsi jawaban yang kembar/duplikat.`);
          return;
        }
        if (!["A", "B", "C", "D"].includes(q.kunci)) {
          toast.error(`Soal #${i + 1}: Kunci jawaban harus salah satu dari A, B, C, atau D.`);
          return;
        }
      } else {
        if (!q.kunci || q.kunci.trim().length < 10) {
          toast.error(`Soal #${i + 1}: Rubrik / kriteria jawaban esai minimal 10 karakter.`);
          return;
        }
      }
    }

    setSaveState("saving");
    setSaveErrorMessage(null);

    try {
      if (paketId) {
        const canonicalQuestions = draftSoal.map((s) => ({
          id: s.id,
          jenis: s.jenis,
          pertanyaan: s.pertanyaan.trim(),
          opsi: s.jenis === "Pilihan Ganda" ? s.opsi.map((o) => o.trim()) : [],
          kunci: s.kunci.trim(),
          penjelasan: s.penjelasan?.trim() || undefined,
          tingkat: s.tingkat || tingkat,
          tujuanPembelajaranId: s.tujuanPembelajaranId || undefined,
          evidenceIds: s.evidenceIds && s.evidenceIds.length > 0 ? s.evidenceIds : ["ev_generic"],
          status: "SUPPORTED" as const,
          teacherEdited: s.teacherEdited,
        }));

        const res: any = await withAuthRetry(
          () => supabase.auth.refreshSession(),
          () =>
            saveQuestionDraft({
              data: {
                paketId,
                judul: judulFinal,
                topik: topikFinal,
                modulId: modulId || undefined,
                questions: canonicalQuestions as any,
                expectedUpdatedAt: activePaket?.updatedAt,
              },
            }),
        );

        setActivePaket(res.persistedPackage);
        setAiMetadata(res.metadata as any);
        setDraftSoal(res.persistedPackage.soal);
        setInitialSnapshot({
          judul: res.persistedPackage.judul,
          topik: res.persistedPackage.topik,
          soal: JSON.parse(JSON.stringify(res.persistedPackage.soal)),
        });
        setSaveState("saved");
        toast.success("Draf paket soal berhasil disimpan.");
        void reloadPaketSoal();
        setTimeout(() => setSaveState("clean"), 2500);
      } else {
        const created = await addPaket({
          judul: judulFinal,
          topik: topikFinal,
          modulId: modulId || undefined,
          status: "Draft",
          kelas: [],
          soal: draftSoal,
        });
        setPaketId(created.id);
        setActivePaket(created);
        setInitialSnapshot({
          judul: created.judul,
          topik: created.topik,
          soal: JSON.parse(JSON.stringify(created.soal)),
        });
        setSaveState("saved");
        toast.success("Paket soal disimpan sebagai Draf.");
        void reloadPaketSoal();
        setTimeout(() => setSaveState("clean"), 2500);
      }
    } catch (error) {
      setSaveState("error");
      const raw = error instanceof Error ? error.message : "Gagal menyimpan draf.";
      setSaveErrorMessage(raw);
      const message = isRecoverableAuthError(error)
        ? "Sesi login kedaluwarsa. Silakan masuk kembali."
        : raw;
      toast.error(message);
    }
  };

  const applyAiRevisi = async () => {
    if (!aiTarget || !instruksi.trim()) {
      toast.error("Pilih instruksi revisi terlebih dahulu.");
      return;
    }
    const target = aiTarget;
    setAiLoading(true);
    try {
      const revised: any = await withAuthRetry(
        () => supabase.auth.refreshSession(),
        () =>
          reviseAi({
            data: {
              soal: {
                pertanyaan: target.pertanyaan,
                jenis: target.jenis,
                opsi: target.opsi,
                kunci: target.kunci,
              },
              instruksi,
              materi: modulId ? materiModul(modulId) : "",
            },
          }),
      );
      setDraftSoal((prev) => prev.map((s2) => (s2.id === target.id ? { ...s2, ...revised } : s2)));
      setAiTarget(null);
      setInstruksi("");
      toast.success("Soal direvisi AI.");
    } catch (error) {
      const raw = error instanceof Error ? error.message : "AI gagal merevisi soal.";
      const message = isRecoverableAuthError(error)
        ? "Sesi login tidak valid atau kedaluwarsa. Keluar lalu masuk kembali, kemudian coba lagi."
        : raw;
      toast.error(message);
    } finally {
      setAiLoading(false);
    }
  };

  if (mode === "buat") {
    return (
      <div className="grid gap-6">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 w-fit"
          onClick={() => {
            resetDraft();
            setMode("bank");
          }}
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Bank Soal
        </Button>

        <PageHeader
          title="Buat Soal"
          subtitle="Soal disimpan dulu sebagai konten umum di Bank Soal. Kelas dipilih nanti saat Terbitkan sebagai Tugas."
        />

        <div className="grid gap-2">
          <Label htmlFor="judul-paket">Judul / Topik Paket Soal</Label>
          <Input
            id="judul-paket"
            value={judul}
            onChange={(e) => setJudul(e.target.value)}
            placeholder="Misal: Sistem Persamaan Linear"
          />
        </div>

        <Tabs defaultValue="ai">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="ai">Dibantu AI</TabsTrigger>
            <TabsTrigger value="manual">Manual</TabsTrigger>
          </TabsList>

          <TabsContent value="ai" className="mt-4">
            <Card>
              <CardContent className="grid gap-4 p-5">
                {loading ? (
                  <div className="grid place-items-center gap-3 py-12 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="font-display font-semibold text-navy">
                      GuruPro AI sedang menyusun soal…
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="grid gap-2">
                        <Label>Pilih Modul Sumber (opsional)</Label>
                        <Select value={modulId} onValueChange={setModulId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Tanpa modul sumber" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableModulsInYear.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.judul}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="topik">Topik / Materi</Label>
                        <Input
                          id="topik"
                          value={topik}
                          onChange={(e) => setTopik(e.target.value)}
                          placeholder="Misal: Turunan Fungsi Aljabar"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="jumlah">Jumlah Soal</Label>
                        <Input
                          id="jumlah"
                          type="number"
                          min={1}
                          max={20}
                          value={jumlah}
                          onChange={(e) => setJumlah(e.target.value)}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Tingkat Kesulitan</Label>
                        <Select value={tingkat} onValueChange={(v) => setTingkat(v as Tingkat)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TINGKAT.map((t) => (
                              <SelectItem key={t} value={t}>
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label>Jenis Soal</Label>
                        <Select value={jenis} onValueChange={(v) => setJenis(v as JenisSoal)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {JENIS_SOAL.map((j) => (
                              <SelectItem key={j} value={j}>
                                {j}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                      <Button onClick={runGenerate}>
                        <Sparkles className="h-4 w-4" />
                        Buatkan Soal dengan AI
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="manual" className="mt-4 grid gap-4">
            <Card>
              <CardContent className="grid gap-4 p-5">
                <div className="grid gap-2">
                  <Label htmlFor="pertanyaan">Pertanyaan</Label>
                  <Textarea
                    id="pertanyaan"
                    rows={3}
                    value={mPertanyaan}
                    onChange={(e) => setMPertanyaan(e.target.value)}
                    placeholder="Tulis pertanyaan…"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>Jenis Soal</Label>
                    <Select value={mJenis} onValueChange={(v) => setMJenis(v as JenisSoal)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {JENIS_SOAL.map((j) => (
                          <SelectItem key={j} value={j}>
                            {j}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="kunci">Kunci Jawaban</Label>
                    <Input
                      id="kunci"
                      value={mKunci}
                      onChange={(e) => setMKunci(e.target.value)}
                      placeholder={mJenis === "Pilihan Ganda" ? "Misal: A" : "Poin jawaban ideal"}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                  <Button variant="outline" onClick={addManual}>
                    <Plus className="h-4 w-4" />
                    Tambah ke Draf
                  </Button>
                  <Button disabled={draftSoal.length === 0} onClick={() => setMode("review")}>
                    Tinjau Draf ({draftSoal.length})
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  if (mode === "review") {
    return (
      <div className="grid gap-5">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 w-fit"
          onClick={() => handleAttemptLeaveReview(paketId ? "bank" : "buat")}
        >
          <ArrowLeft className="h-4 w-4" />
          {paketId ? "Kembali ke Bank Soal" : "Kembali ke Form Soal"}
        </Button>

        <PageHeader
          title={paketId ? `Tinjau Draf: ${judul || "Paket Soal"}` : "Hasil Draf Soal"}
          subtitle={`${draftSoal.length} butir soal · Status: Draft · ${topik || "Tanpa Topik"}`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {saveState === "dirty" || isDirty ? (
                <Badge
                  variant="outline"
                  className="border-amber-300 bg-amber-50 text-amber-800 animate-pulse dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                >
                  <AlertCircle className="mr-1 h-3 w-3" />
                  Perubahan Belum Disimpan
                </Badge>
              ) : saveState === "saved" ? (
                <Badge
                  variant="outline"
                  className="border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                >
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Tersimpan
                </Badge>
              ) : null}

              {!paketId ? (
                <Button variant="outline" onClick={runGenerate}>
                  <RefreshCw className="h-4 w-4" />
                  Regenerasi AI
                </Button>
              ) : null}

              <Button
                disabled={saveState === "saving" || (!isDirty && saveState !== "error")}
                variant={isDirty ? "default" : "secondary"}
                onClick={handleSaveDraft}
              >
                {saveState === "saving" ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-1.5 h-4 w-4" />
                )}
                {saveState === "saving" ? "Menyimpan Draf..." : "Simpan Draf"}
              </Button>
            </div>
          }
        />

        {/* Provenance, Quality Status, and Package Summary Card */}
        <Card className="bg-muted/40 border-muted-foreground/20">
          <CardContent className="grid gap-3 p-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <span className="text-muted-foreground">Status Paket:</span>
              <div className="mt-1 flex items-center gap-1.5">
                <Badge variant="secondary">Draft</Badge>
                <span className="text-[11px] text-muted-foreground">(Hanya draf)</span>
              </div>
            </div>

            <div>
              <span className="text-muted-foreground">Asal Pembuatan:</span>
              <div className="mt-1 flex items-center gap-1.5 font-medium">
                {aiMetadata ? (
                  <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
                    <Sparkles className="mr-1 h-3 w-3" />
                    GuruPro AI Generated
                  </Badge>
                ) : (
                  <Badge variant="outline">Manual / Draf Lokal</Badge>
                )}
              </div>
            </div>

            <div>
              <span className="text-muted-foreground">Evaluasi Mutu AI Asli:</span>
              <div className="mt-1 flex items-center gap-1.5 font-medium">
                {aiMetadata?.originalQualityValidation?.status === "PASS" ? (
                  <Badge className="bg-emerald-600 text-white hover:bg-emerald-700">
                    <ShieldCheck className="mr-1 h-3 w-3" />
                    Lolos (PASS)
                  </Badge>
                ) : aiMetadata?.originalQualityValidation?.status === "REVISE" ? (
                  <Badge className="bg-amber-500 text-white hover:bg-amber-600">
                    <AlertTriangle className="mr-1 h-3 w-3" />
                    Perlu Revisi
                  </Badge>
                ) : aiMetadata?.originalQualityValidation?.status === "REJECT" ? (
                  <Badge className="bg-rose-600 text-white hover:bg-rose-700">
                    <AlertCircle className="mr-1 h-3 w-3" />
                    Ditolak (REJECT)
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">— Belum dievaluasi —</span>
                )}
              </div>
            </div>

            <div>
              <span className="text-muted-foreground">Status Guru:</span>
              <div className="mt-1 flex items-center gap-1.5 font-medium">
                {aiMetadata?.teacherEdited || isDirty ? (
                  <Badge
                    variant="outline"
                    className="border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
                  >
                    <History className="mr-1 h-3 w-3" />
                    Telah Diedit Guru
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">Belum ada editan</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Editable Title & Topic Card */}
        <Card>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="rev-judul">Judul Paket Soal</Label>
              <Input
                id="rev-judul"
                value={judul}
                onChange={(e) => setJudul(e.target.value)}
                placeholder="Judul paket..."
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rev-topik">Topik / Materi</Label>
              <Input
                id="rev-topik"
                value={topik}
                onChange={(e) => setTopik(e.target.value)}
                placeholder="Topik materi..."
              />
            </div>
          </CardContent>
        </Card>

        {/* Question Items */}
        {draftSoal.map((s, i) => {
          const originalFindings = (
            (aiMetadata?.originalQualityFindings as any[]) ||
            (aiMetadata?.originalQualityValidation as any)?.factualFindings ||
            []
          ) as any[];
          const itemFindings =
            (aiMetadata?.originalQualityValidation as any)?.itemResults?.[i]?.findings || [];
          const allQFindings = [
            ...itemFindings,
            ...originalFindings.filter(
              (f: any) => f.questionIndex === i || f.questionId === s.id,
            ),
          ];

          const isEditing = editId === s.id;

          const lowerOpts = (s.opsi || []).map((o) => o.trim().toLowerCase()).filter(Boolean);
          const hasDuplicateOpts =
            s.jenis === "Pilihan Ganda" && new Set(lowerOpts).size !== lowerOpts.length;
          const hasEmptyOpts =
            s.jenis === "Pilihan Ganda" && (s.opsi || []).some((o) => !o || !o.trim());

          return (
            <Card key={s.id} className={s.teacherEdited ? "border-blue-200 dark:border-blue-900" : ""}>
              <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="font-display text-base text-navy">
                    Soal {i + 1}
                  </CardTitle>
                  <Badge variant="secondary">{s.jenis}</Badge>
                  {s.tingkat ? <Badge variant="outline">{s.tingkat}</Badge> : null}
                  {s.teacherEdited ? (
                    <Badge
                      variant="outline"
                      className="border-blue-300 bg-blue-50 text-blue-700 text-xs dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
                    >
                      Diedit Guru
                    </Badge>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={isEditing ? "secondary" : "outline"}
                    onClick={() => setEditId(isEditing ? null : s.id)}
                  >
                    {isEditing ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                    {isEditing ? "Selesai Edit" : "Edit Manual"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setAiTarget(s)}>
                    <Sparkles className="h-4 w-4" />
                    Edit dengan AI
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setDraftSoal((prev) => prev.filter((x) => x.id !== s.id))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 pt-0">
                {/* AI Quality Findings Notification if any */}
                {allQFindings.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                      <span>Catatan Evaluasi Mutu AI:</span>
                    </div>
                    <ul className="mt-1 list-disc pl-4 space-y-0.5">
                      {allQFindings.map((f, fi) => (
                        <li key={fi}>
                          <span className="font-medium">[{f.severity || "INFO"}]</span>{" "}
                          {f.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {isEditing ? (
                  <div className="grid gap-4 rounded-lg border border-muted p-4 bg-muted/20">
                    {/* Question text */}
                    <div className="grid gap-1.5">
                      <Label className="text-xs font-semibold">Teks Pertanyaan</Label>
                      <Textarea
                        rows={3}
                        value={s.pertanyaan}
                        onChange={(e) =>
                          setDraftSoal((prev) =>
                            prev.map((x) =>
                              x.id === s.id
                                ? { ...x, pertanyaan: e.target.value, teacherEdited: true }
                                : x,
                            ),
                          )
                        }
                        placeholder="Tulis butir pertanyaan..."
                      />
                    </div>

                    {/* Multiple Choice Structured Options */}
                    {s.jenis === "Pilihan Ganda" ? (
                      <div className="grid gap-3">
                        <Label className="text-xs font-semibold">
                          Opsi Pilihan Ganda & Kunci Jawaban (Pilih salah satu sebagai kunci):
                        </Label>
                        {hasDuplicateOpts ? (
                          <p className="text-xs text-destructive font-medium">
                            Peringatan: Terdapat opsi jawaban yang kembar/duplikat. Semua opsi harus unik.
                          </p>
                        ) : null}
                        {hasEmptyOpts ? (
                          <p className="text-xs text-amber-600 font-medium">
                            Peringatan: Semua 4 opsi jawaban (A, B, C, D) harus terisi.
                          </p>
                        ) : null}

                        <div className="grid gap-2">
                          {(s.opsi || []).map((o, oi) => {
                            const letter = String.fromCharCode(65 + oi);
                            const isKey = s.kunci === letter;
                            return (
                              <div key={oi} className="flex items-center gap-2">
                                <span className="font-bold text-sm w-6 text-center">{letter}.</span>
                                <Input
                                  value={o}
                                  onChange={(e) =>
                                    setDraftSoal((prev) =>
                                      prev.map((x) =>
                                        x.id === s.id
                                          ? {
                                              ...x,
                                              opsi: x.opsi.map((v, vi) =>
                                                vi === oi ? e.target.value : v,
                                              ),
                                              teacherEdited: true,
                                            }
                                          : x,
                                      ),
                                    )
                                  }
                                  placeholder={`Opsi ${letter}...`}
                                  className="flex-1"
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={isKey ? "default" : "outline"}
                                  className={
                                    isKey
                                      ? "bg-emerald-600 hover:bg-emerald-700 text-white min-w-28"
                                      : "min-w-28"
                                  }
                                  onClick={() =>
                                    setDraftSoal((prev) =>
                                      prev.map((x) =>
                                        x.id === s.id
                                          ? { ...x, kunci: letter, teacherEdited: true }
                                          : x,
                                      ),
                                    )
                                  }
                                >
                                  {isKey ? `✓ Kunci (${letter})` : `Pilih Kunci (${letter})`}
                                </Button>
                              </div>
                            );
                          })}
                        </div>

                        {/* Explanation for MC */}
                        <div className="grid gap-1.5 mt-1">
                          <Label className="text-xs font-semibold">Penjelasan / Rasional Kunci</Label>
                          <Textarea
                            rows={2}
                            value={s.penjelasan || ""}
                            onChange={(e) =>
                              setDraftSoal((prev) =>
                                prev.map((x) =>
                                  x.id === s.id
                                    ? { ...x, penjelasan: e.target.value, teacherEdited: true }
                                    : x,
                                ),
                              )
                            }
                            placeholder="Alasan mengapa opsi kunci tersebut benar..."
                          />
                        </div>
                      </div>
                    ) : (
                      /* Essay Structured Editor */
                      <div className="grid gap-3">
                        <div className="grid gap-1.5">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-semibold">
                              Rubrik / Kriteria Jawaban Ideal
                            </Label>
                            <span
                              className={`text-[11px] ${
                                (s.kunci || "").length >= 10
                                  ? "text-muted-foreground"
                                  : "text-amber-600 font-semibold"
                              }`}
                            >
                              {(s.kunci || "").length}/10 karakter minimal
                            </span>
                          </div>
                          <Textarea
                            rows={3}
                            value={s.kunci}
                            onChange={(e) =>
                              setDraftSoal((prev) =>
                                prev.map((x) =>
                                  x.id === s.id
                                    ? { ...x, kunci: e.target.value, teacherEdited: true }
                                    : x,
                                ),
                              )
                            }
                            placeholder="Rincian poin jawaban ideal yang diharapkan dari siswa..."
                          />
                          {(s.kunci || "").length < 10 && (
                            <p className="text-xs text-amber-600">
                              Rubrik jawaban ideal esai minimal 10 karakter.
                            </p>
                          )}
                        </div>

                        <div className="grid gap-1.5">
                          <Label className="text-xs font-semibold">Panduan Penskoran (Opsional)</Label>
                          <Textarea
                            rows={2}
                            value={s.penjelasan || ""}
                            onChange={(e) =>
                              setDraftSoal((prev) =>
                                prev.map((x) =>
                                  x.id === s.id
                                    ? { ...x, penjelasan: e.target.value, teacherEdited: true }
                                    : x,
                                ),
                              )
                            }
                            placeholder="Panduan bagi guru untuk memberikan skor parsial atau penuh..."
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Read-Only Review Display */
                  <>
                    <p className="text-sm font-medium">{s.pertanyaan}</p>
                    {s.jenis === "Pilihan Ganda" && s.opsi?.length > 0 ? (
                      <ol className="grid gap-1.5 text-sm text-muted-foreground">
                        {s.opsi.map((o, oi) => {
                          const letter = String.fromCharCode(65 + oi);
                          const isKey = s.kunci === letter;
                          return (
                            <li
                              key={oi}
                              className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 ${
                                isKey
                                  ? "bg-emerald-50 font-semibold text-emerald-900 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800"
                                  : "bg-muted/30"
                              }`}
                            >
                              <span className="font-bold">{letter}.</span>
                              <span className="flex-1">{o}</span>
                              {isKey && (
                                <Badge className="bg-emerald-600 text-white text-[10px] px-1.5 py-0 h-5">
                                  Kunci Jawaban
                                </Badge>
                              )}
                            </li>
                          );
                        })}
                      </ol>
                    ) : (
                      <div className="rounded-lg bg-primary-soft/40 p-3 text-xs text-primary border border-primary/20">
                        <span className="font-semibold block mb-0.5">Rubrik Jawaban Ideal:</span>
                        <p className="whitespace-pre-wrap">{s.kunci}</p>
                      </div>
                    )}

                    {s.penjelasan ? (
                      <div className="rounded-lg bg-muted/40 p-2.5 text-xs text-muted-foreground">
                        <span className="font-semibold block mb-0.5">Penjelasan:</span>
                        <p>{s.penjelasan}</p>
                      </div>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}

        {/* Leave Confirmation Dialog */}
        <AlertDialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Perubahan belum disimpan</AlertDialogTitle>
              <AlertDialogDescription>
                Anda memiliki perubahan yang belum disimpan pada draf paket soal ini. Yakin ingin keluar dan membuang perubahan?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setShowLeaveDialog(false)}>Batal</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmDiscard}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Buang Perubahan
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog
          open={aiTarget !== null}
          onOpenChange={(o) => !o && !aiLoading && setAiTarget(null)}
        >
          <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] sm:max-w-md overflow-y-auto overflow-x-hidden p-4 sm:p-6">
            <DialogHeader className="min-w-0">
              <DialogTitle className="font-display text-navy break-words">
                Edit Soal dengan AI
              </DialogTitle>
              <DialogDescription className="break-words">
                Pilih atau tulis instruksi revisi untuk soal ini.
              </DialogDescription>
            </DialogHeader>
            {aiLoading ? (
              <div className="grid place-items-center gap-3 py-10 text-center min-w-0 px-2">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground break-words">
                  GuruPro AI sedang merevisi soal…
                </p>
              </div>
            ) : (
              <div className="grid gap-3 min-w-0">
                <div className="flex flex-wrap gap-2 min-w-0">
                  {INSTRUKSI_AI.map((i) => (
                    <Button
                      key={i}
                      size="sm"
                      variant={instruksi === i ? "secondary" : "outline"}
                      onClick={() => setInstruksi(i)}
                    >
                      {i}
                    </Button>
                  ))}
                </div>
                <Textarea
                  rows={2}
                  value={instruksi}
                  onChange={(e) => setInstruksi(e.target.value)}
                  placeholder="Misal: buat lebih sulit"
                  className="min-w-0 max-w-full break-words"
                />
              </div>
            )}
            {!aiLoading ? (
              <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 w-full pt-2">
                <Button
                  variant="ghost"
                  onClick={() => setAiTarget(null)}
                  className="w-full sm:w-auto"
                >
                  Batal
                </Button>
                <Button onClick={applyAiRevisi} className="w-full sm:w-auto">
                  <Sparkles className="h-4 w-4" />
                  Terapkan Revisi
                </Button>
              </DialogFooter>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Bank Soal"
        subtitle="Soal disimpan sebagai konten umum. Kelas dipilih saat Anda menerbitkannya sebagai tugas."
        actions={
          <Button
            onClick={() => {
              resetDraft();
              setMode("buat");
            }}
          >
            <Plus className="h-4 w-4" />
            Buat Soal
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="relative sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari judul atau topik soal…"
            className="pl-9"
            aria-label="Cari soal"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
        >
          <SelectTrigger className="sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="semua">Semua status</SelectItem>
            <SelectItem value="Draft">Draft</SelectItem>
            <SelectItem value="Terbit">Terbit</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft text-primary">
              <FileQuestion className="h-7 w-7" />
            </span>
            <p className="font-display font-semibold text-navy">Bank soal masih kosong</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Buat soal manual atau minta GuruPro AI menyusun soal dari modul ajar Anda.
            </p>
            <Button
              onClick={() => {
                resetDraft();
                setMode("buat");
              }}
            >
              <Sparkles className="h-4 w-4" />
              Buat Soal
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="grid gap-3 md:hidden">
            {filtered.map((p) => (
              <Card key={p.id}>
                <CardContent className="grid gap-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-display font-semibold text-navy">{p.judul}</p>
                      <p className="truncate text-xs text-muted-foreground">{p.topik}</p>
                    </div>
                    <Badge
                      variant="secondary"
                      className={p.status === "Terbit" ? "bg-primary-soft text-primary" : ""}
                    >
                      {p.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {p.soal.length} soal · Kelas: {p.kelas.length ? p.kelas.join(", ") : "—"}
                  </p>
                  <PaketActions
                    paket={p}
                    onOpen={() => handleOpenReview(p)}
                    onTerbitTugas={() => {
                      setTerbitTarget(p);
                      setKelasPilihan(p.kelas);
                    }}
                    onArsip={() => setArsipTarget(p)}
                    onHapus={() => setHapus(p)}
                  />
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Desktop table */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Judul / Topik</TableHead>
                    <TableHead>Dipakai di Kelas</TableHead>
                    <TableHead>Jumlah</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="max-w-[18rem]">
                        <span className="block truncate font-medium">{p.judul}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {p.topik}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {p.kelas.length ? p.kelas.join(", ") : "—"}
                      </TableCell>
                      <TableCell>{p.soal.length}</TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={p.status === "Terbit" ? "bg-primary-soft text-primary" : ""}
                        >
                          {p.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <PaketActions
                          align="end"
                          paket={p}
                          onOpen={() => handleOpenReview(p)}
                          onTerbitTugas={() => {
                            setTerbitTarget(p);
                            setKelasPilihan(p.kelas);
                          }}
                          onArsip={() => setArsipTarget(p)}
                          onHapus={() => setHapus(p)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={terbitTarget !== null} onOpenChange={(o) => !o && setTerbitTarget(null)}>
        <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] sm:max-w-md overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <DialogHeader className="min-w-0">
            <DialogTitle className="font-display text-navy break-words">
              Terbitkan sebagai Tugas
            </DialogTitle>
            <DialogDescription className="break-words">
              Pilih kelas tujuan untuk paket soal &ldquo;{terbitTarget?.judul}&rdquo;.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 min-w-0">
            {myKelas.length > 0 ? (
              myKelas.map((k) => {
                const labelKelas = `${k.tingkat} ${k.namaKelas}`;
                return (
                  <label
                    key={k.id}
                    className="flex items-center gap-3 rounded-lg border p-3 text-sm min-w-0 cursor-pointer hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={kelasPilihan.includes(labelKelas)}
                      onCheckedChange={(v) =>
                        setKelasPilihan((prev) =>
                          v ? [...prev, labelKelas] : prev.filter((x) => x !== labelKelas),
                        )
                      }
                    />
                    <span className="truncate font-medium">{labelKelas}</span>
                    {k.mapel ? (
                      <span className="text-xs text-muted-foreground ml-auto">{k.mapel}</span>
                    ) : null}
                  </label>
                );
              })
            ) : (
              <p className="text-xs text-muted-foreground p-3 border rounded-lg">
                Anda belum memiliki kelas. Buat kelas di menu Kelas Saya terlebih dahulu.
              </p>
            )}
          </div>
          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 w-full pt-2">
            <Button
              variant="ghost"
              onClick={() => setTerbitTarget(null)}
              className="w-full sm:w-auto"
            >
              Batal
            </Button>
            <Button
              onClick={() => {
                if (kelasPilihan.length === 0) {
                  toast.error("Pilih minimal satu kelas.");
                  return;
                }
                if (terbitTarget) {
                  void terbitkanSebagaiTugas(terbitTarget.id, kelasPilihan);
                  void trackProductEvent("QUESTION_PACKAGE_PUBLISHED", "soal", {
                    userId: currentGuruId,
                    role: profile.role,
                    metadata: {
                      paketId: terbitTarget.id,
                      questionCount: terbitTarget.soal?.length || 0,
                      target: "tugas",
                      kelasCount: kelasPilihan.length,
                    },
                  });
                }
                setTerbitTarget(null);
                toast.success("Soal diterbitkan sebagai tugas.");
              }}
              className="w-full sm:w-auto"
            >
              <Send className="h-4 w-4" />
              Terbitkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Arsip Paket Soal */}
      <AlertDialog
        open={arsipTarget !== null}
        onOpenChange={(o) => !o && !arsipLoading && setArsipTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-navy">
              Arsipkan paket soal ini?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block font-medium text-foreground">
                &ldquo;{arsipTarget?.judul}&rdquo;
              </span>
              <span className="block text-xs leading-relaxed">
                Paket soal beserta seluruh butir soal di dalamnya akan dipindahkan ke Pusat Arsip dan
                disembunyikan dari daftar bank soal aktif. Anda dapat memulihkannya kapan saja.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={arsipLoading}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={arsipLoading}
              onClick={async (e) => {
                e.preventDefault();
                if (!arsipTarget) return;
                setArsipLoading(true);
                try {
                  const res = await archiveAcademicItem("paket_soal", arsipTarget.id);
                  if (!res.success) {
                    toast.error(res.message);
                    return;
                  }
                  toast.success("Paket soal berhasil diarsipkan ke Pusat Arsip.");
                  setArsipTarget(null);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Gagal mengarsipkan paket soal.");
                } finally {
                  setArsipLoading(false);
                }
              }}
            >
              {arsipLoading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Arsipkan Paket Soal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={hapus !== null} onOpenChange={(o) => !o && setHapus(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus paket soal ini?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{hapus?.judul}&rdquo; beserta {hapus?.soal.length} soal akan dihapus permanen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (hapus) void deletePaket(hapus.id);
                setHapus(null);
                toast.success("Paket soal dihapus.");
              }}
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PaketActions({
  paket,
  onOpen,
  onTerbitTugas,
  onArsip,
  onHapus,
  align = "start",
}: {
  paket: PaketSoal;
  onOpen: () => void;
  onTerbitTugas: () => void;
  onArsip: () => void;
  onHapus: () => void;
  align?: "start" | "end";
}) {
  return (
    <div className={`flex flex-wrap gap-2 ${align === "end" ? "justify-end" : ""}`}>
      <Button size="sm" variant="outline" onClick={onOpen}>
        <Pencil className="h-4 w-4" />
        Tinjau
      </Button>
      {paket.status === "Draft" ? (
        <Button
          size="sm"
          variant="secondary"
          onClick={async () => {
            try {
              await publishPaket(paket.id);
              void trackProductEvent("QUESTION_PACKAGE_PUBLISHED", "soal", {
                role: "guru",
                metadata: {
                  paketId: paket.id,
                  questionCount: paket.soal?.length || 0,
                  target: "bank_soal",
                },
              });
              toast.success("Paket soal berhasil diterbitkan ke Bank Soal.");
            } catch (err: any) {
              console.error("[publishPaket] Error:", err);
              toast.error(err.message || "Gagal menerbitkan paket soal.");
            }
          }}
        >
          <Send className="h-4 w-4" />
          Terbitkan
        </Button>
      ) : (
        <Button size="sm" variant="secondary" onClick={onTerbitTugas}>
          <Send className="h-4 w-4" />
          Terbitkan sebagai Tugas
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        aria-label="Duplikat paket soal"
        onClick={() => {
          void duplicatePaket(paket.id);
          toast.success("Paket soal diduplikasi sebagai draft.");
        }}
      >
        <Copy className="h-4 w-4" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-label="Arsipkan paket soal"
        title="Arsipkan paket soal"
        className="text-muted-foreground hover:text-foreground"
        onClick={onArsip}
      >
        <Archive className="h-4 w-4" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-label="Hapus paket soal"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={onHapus}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
