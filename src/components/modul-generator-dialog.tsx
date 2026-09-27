import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  FileUp,
  Link2,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  Type,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { generateModulAjarServerFn } from "@/lib/ai.functions";
import { supabase } from "@/integrations/supabase/client";
import { isRecoverableAuthError, withAuthRetry } from "@/integrations/supabase/auth-token";
import { useAuth } from "@/lib/auth-store";
import { useKelas } from "@/lib/kelas-store";
import { useTahunAjaran } from "@/lib/tahun-ajaran-store";
import { SUMBER_TIPE, type Modul, type SumberTipe } from "@/lib/modul-types";
import {
  analisisSumberUrl,
  analisisSumberDokumen,
  analisisSumberTeks,
  listTeacherSourcesServerFn,
  type SumberPreview,
  type TeacherSourceItem,
} from "@/lib/sumber.functions";

type SumberTipeWithExisting = SumberTipe | "Materi Tersimpan";

const ALL_SUMBER_OPTIONS: SumberTipeWithExisting[] = [
  ...SUMBER_TIPE,
  "Materi Tersimpan",
];

const ICONS: Record<SumberTipeWithExisting, typeof Target> = {
  "CP / ATP": Target,
  "eBook / Dokumen": FileUp,
  Teks: Type,
  "Link Luar": Link2,
  "Materi Tersimpan": BookOpen,
};

const PLACEHOLDER: Record<SumberTipe, string> = {
  "CP / ATP": "Tempel capaian pembelajaran / alur tujuan pembelajaran di sini… (minimal 50 karakter)",
  "eBook / Dokumen": "Tempel bagian/bab dari eBook yang ingin dijadikan modul…",
  Teks: "Tempel materi, catatan, atau ringkasan bahan ajar Anda… (minimal 50 karakter)",
  "Link Luar": "https://sumber-belajar.example.com/artikel-materi",
};

export type GenerationStage =
  | "idle"
  | "processing_source"
  | "generating"
  | "validating"
  | "saving_draft"
  | "success"
  | "error";

export function ModulGeneratorDialog({
  open,
  onOpenChange,
  onGenerated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerated: (persistedModul: Modul) => void | Promise<void>;
}) {
  const { profile, user } = useAuth();
  const { kelasList, refresh: refreshKelas } = useKelas();
  const { selectedYear } = useTahunAjaran(user?.id || profile?.id);

  // Server Functions
  const analisisUrl = useServerFn(analisisSumberUrl);
  const analisisDokumen = useServerFn(analisisSumberDokumen);
  const analisisTeks = useServerFn(analisisSumberTeks);
  const listSources = useServerFn(listTeacherSourcesServerFn);
  const generateModulAjar = useServerFn(generateModulAjarServerFn);

  const myKelasList = useMemo(() => {
    return kelasList.filter(
      (k) =>
        (k.guruId === user?.id || k.guruId === profile?.id) &&
        (!selectedYear || k.tahunAjaran === selectedYear),
    );
  }, [kelasList, user?.id, profile?.id, selectedYear]);

  const mapelOptions = useMemo(() => {
    const options = new Set<string>();
    if (profile?.mapel?.trim()) options.add(profile.mapel.trim());
    myKelasList.forEach((k) => {
      if (k.mapel?.trim()) options.add(k.mapel.trim());
    });
    return Array.from(options);
  }, [profile?.mapel, myKelasList]);

  // Form State
  const [sumberTipe, setSumberTipe] = useState<SumberTipeWithExisting>("Link Luar");
  const [sumberInput, setSumberInput] = useState("");
  const [topik, setTopik] = useState("");
  const [selectedKelasId, setSelectedKelasId] = useState<string>("");
  const [kelas, setKelas] = useState("");
  const [mapel, setMapel] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<SumberPreview | null>(null);
  const [sumberError, setSumberError] = useState("");
  const [savedSources, setSavedSources] = useState<TeacherSourceItem[]>([]);
  const [selectedSavedSourceId, setSelectedSavedSourceId] = useState("");

  // Generation Stage State Machine
  const [stage, setStage] = useState<GenerationStage>("idle");
  const [stageMessage, setStageMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const busy =
    stage === "processing_source" ||
    stage === "generating" ||
    stage === "validating" ||
    stage === "saving_draft";

  // Refresh classes on open
  useEffect(() => {
    if (open) {
      void refreshKelas();
      // Load saved sources in background
      listSources()
        .then((items) => setSavedSources(items || []))
        .catch(() => {});
    }
  }, [open]);

  // Set default class & mapel
  useEffect(() => {
    if (open) {
      if (profile?.mapel && !mapel) {
        setMapel(profile.mapel);
      }
      if (myKelasList.length > 0) {
        const found = myKelasList.find((k) => k.id === selectedKelasId);
        if (!found) {
          const first = myKelasList[0];
          setSelectedKelasId(first.id);
          setKelas(`${first.tingkat} ${first.namaKelas}`);
          if (first.mapel && !mapel && !profile?.mapel) {
            setMapel(first.mapel);
          }
        }
      }
    }
  }, [open, profile?.mapel, myKelasList, mapel, selectedKelasId]);

  const reset = () => {
    setPreview(null);
    setSumberError("");
    setErrorMessage("");
    setStage("idle");
    setStageMessage("");
  };

  const close = (next: boolean) => {
    if (busy) return;
    if (!next) {
      reset();
    }
    onOpenChange(next);
  };

  const handleAnalisisUrl = async () => {
    if (!sumberInput.trim()) {
      toast.error("Tempel link sumber terlebih dahulu.");
      return;
    }
    setStage("processing_source");
    setStageMessage("Membaca dan memverifikasi isi halaman web...");
    setSumberError("");
    setErrorMessage("");
    setPreview(null);

    try {
      const hasil = await withAuthRetry(
        () => supabase.auth.refreshSession(),
        () => analisisUrl({ data: { url: sumberInput.trim() } }),
      );
      setPreview(hasil);
      if (!topik.trim()) setTopik(hasil.judul);
      toast.success("Isi sumber berhasil dibaca dan diserap.");
      setStage("idle");
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Sumber tidak dapat diakses.";
      const message = isRecoverableAuthError(error)
        ? "Sesi login kedaluwarsa. Silakan muat ulang halaman."
        : raw;
      setSumberError(message);
      setErrorMessage(message);
      setStage("error");
      toast.error(message);
    }
  };

  const handleSelectSavedSource = (snapId: string) => {
    setSelectedSavedSourceId(snapId);
    const found = savedSources.find((s) => s.id === snapId);
    if (found) {
      setPreview({
        url: "",
        judul: found.title,
        situs: "Materi Tersimpan",
        konten: `[Snapshot ID: ${found.id}] ${found.title}`,
        jumlahKata: found.wordCount,
        cukup: found.wordCount >= 20,
        snapshotId: found.id,
      });
      if (!topik.trim()) setTopik(found.title);
      toast.success(`Materi rujukan "${found.title}" dipilih.`);
    }
  };

  const handleGenerate = async () => {
    // 1. Authoritative Teacher Verification Guard
    if (profile?.role !== "guru") {
      toast.error("Hanya akun Guru yang berwenang menyusun modul ajar.");
      return;
    }
    const verStatus = String(profile?.status_verifikasi || "").toLowerCase().trim();
    if (verStatus && verStatus !== "terverifikasi") {
      toast.error("Akun guru Anda belum terverifikasi untuk menggunakan fitur AI.");
      return;
    }

    // 2. Class validation
    if (!selectedKelasId) {
      toast.error("Pilih kelas tujuan terlebih dahulu.");
      return;
    }

    const targetClass = myKelasList.find((k) => k.id === selectedKelasId);
    if (!targetClass) {
      toast.error("Kelas yang dipilih tidak valid atau bukan milik Anda.");
      return;
    }

    // 3. Topic validation
    if (!topik.trim() || topik.trim().length < 3) {
      toast.error("Masukkan topik atau materi pembelajaran (minimal 3 karakter).");
      return;
    }

    // 4. Source validation
    if (sumberTipe === "Link Luar" && !sumberInput.trim() && !preview) {
      toast.error("Masukkan URL sumber pembelajaran terlebih dahulu.");
      return;
    }
    if (sumberTipe === "eBook / Dokumen" && !preview && !sumberInput.trim()) {
      toast.error("Unggah file dokumen materi (PDF, DOCX, TXT, HTML) terlebih dahulu.");
      return;
    }
    if (
      (sumberTipe === "Teks" || sumberTipe === "CP / ATP") &&
      (!sumberInput.trim() || sumberInput.trim().length < 50)
    ) {
      toast.error("Materi teks terlalu sedikit (minimal 50 karakter) agar AI memiliki bukti faktual.");
      return;
    }
    if (sumberTipe === "Materi Tersimpan" && !preview?.snapshotId) {
      toast.error("Pilih salah satu materi sumber tersimpan.");
      return;
    }

    setErrorMessage("");
    let snapshotId = preview?.snapshotId;

    // Stage 1: Processing / Ingesting Source (if not yet processed)
    if (!snapshotId) {
      setStage("processing_source");
      setStageMessage("Membaca dan menyerap materi sumber ke memori server...");
      try {
        if (sumberTipe === "Link Luar") {
          const res = await withAuthRetry(
            () => supabase.auth.refreshSession(),
            () => analisisUrl({ data: { url: sumberInput.trim() } }),
          );
          setPreview(res);
          snapshotId = res.snapshotId;
        } else if (sumberTipe === "Teks" || sumberTipe === "CP / ATP") {
          const res = await withAuthRetry(
            () => supabase.auth.refreshSession(),
            () =>
              analisisTeks({
                data: {
                  text: sumberInput.trim(),
                  title: topik.trim() || "Materi Pembelajaran",
                },
              }),
          );
          setPreview(res);
          snapshotId = res.snapshotId;
        } else if (sumberTipe === "eBook / Dokumen") {
          toast.error("Pilih file dokumen terlebih dahulu.");
          setStage("idle");
          return;
        }
      } catch (err: any) {
        const raw = err?.message || "Gagal memproses materi sumber.";
        setErrorMessage(raw);
        setStage("error");
        toast.error(raw);
        return;
      }
    }

    if (!snapshotId) {
      setStage("error");
      setErrorMessage("ID Snapshot materi sumber tidak ditemukan. Silakan analisis ulang sumber.");
      toast.error("ID Snapshot materi sumber tidak ditemukan.");
      return;
    }

    // Stage 2: Real AI Generation & Grounding
    setStage("generating");
    setStageMessage("GuruPro AI sedang menyusun Modul Ajar dan memvalidasi mutu rujukan (AI-2D)...");

    // Automatically resolve Kurikulum Merdeka Target Fase from class tingkat
    let targetFase: "A" | "B" | "C" | "D" | "E" | "F" = "E";
    const tingkatClean = (targetClass.tingkat || "").toUpperCase().trim();
    if (
      tingkatClean === "XI" ||
      tingkatClean === "XII" ||
      tingkatClean === "11" ||
      tingkatClean === "12"
    ) {
      targetFase = "F";
    } else if (tingkatClean === "X" || tingkatClean === "10") {
      targetFase = "E";
    }

    const finalMapel =
      mapel.trim() || targetClass.mapel?.trim() || profile?.mapel?.trim() || "Mata Pelajaran Kejuruan";

    try {
      const result = await withAuthRetry(
        () => supabase.auth.refreshSession(),
        () =>
          generateModulAjar({
            data: {
              sourceSnapshotIds: [snapshotId],
              kelasId: targetClass.id,
              topik: topik.trim(),
              mapel: finalMapel,
              targetFase,
              alokasiWaktu: "2 x 45 menit",
            },
          }),
      );

      if (result.status === "success" && (result.persistedModul || result.draftModul)) {
        setStage("saving_draft");
        setStageMessage("Menyimpan draf Modul Ajar ke basis data...");

        // Modul is authoritative from server
        const authoritativeModul = result.persistedModul || (result.draftModul as any);

        setStage("success");
        setStageMessage("Modul Ajar berhasil disusun dan disimpan sebagai Draf!");
        toast.success("Modul Ajar berhasil disusun dan disimpan sebagai Draf.");

        if (authoritativeModul.aiMetadata?.catatanKeterbatasan) {
          toast.warning(`Catatan Keterbatasan: ${authoritativeModul.aiMetadata.catatanKeterbatasan}`);
        }

        // Send persisted modul to parent handler
        await onGenerated(authoritativeModul);
        reset();
        onOpenChange(false);
      } else {
        throw new Error("Penyedia AI gagal menghasilkan draf Modul Ajar yang valid.");
      }
    } catch (err: any) {
      setStage("error");
      const rawMsg = err?.message || String(err);
      let userMsg = "Gagal menyusun modul ajar dengan AI.";

      if (
        rawMsg.includes("INSUFFICIENT_EVIDENCE") ||
        rawMsg.includes("bukti yang memadai") ||
        rawMsg.includes("belum memiliki bukti")
      ) {
        userMsg =
          "Materi sumber belum memiliki bukti yang cukup untuk topik ini. Silakan tambahkan materi yang lebih lengkap.";
      } else if (rawMsg.includes("QUALITY_VALIDATION_FAILED") || rawMsg.includes("Validasi mutu")) {
        userMsg =
          "Draf tidak dapat dibuat karena hasil AI tidak memenuhi pemeriksaan kualitas rujukan sumber (AI-2D). Coba pilih materi yang lebih relevan.";
      } else if (rawMsg.includes("UNSUPPORTED_FACTUAL_CLAIM")) {
        userMsg = "Draf memuat klaim atau angka di luar materi sumber rujukan.";
      } else if (rawMsg.includes("SOURCE_CONFLICT")) {
        userMsg = "Terdapat pertentangan data antar-dokumen sumber yang dipilih.";
      } else if (
        rawMsg.includes("PEDAGOGICAL_VALIDATION_FAILED") ||
        rawMsg.includes("fase sasaran")
      ) {
        userMsg = "Keluaran AI tidak selaras dengan fase atau kaidah pedagogis kelas.";
      } else if (rawMsg.includes("AI_RATE_LIMIT") || rawMsg.includes("429")) {
        userMsg = "Batas permintaan AI tercapai. Harap tunggu 1-2 menit sebelum mencoba kembali.";
      } else if (
        rawMsg.includes("AI_PROVIDER_ERROR") ||
        rawMsg.includes("gangguan internal") ||
        rawMsg.includes("500")
      ) {
        userMsg =
          "Layanan AI sedang mengalami gangguan sementara. Silakan coba kembali beberapa saat lagi.";
      } else if (
        rawMsg.includes("ROLE_FORBIDDEN") ||
        rawMsg.includes("Forbidden") ||
        rawMsg.includes("menunggu verifikasi")
      ) {
        userMsg =
          "Akses ditolak: Operasi AI hanya dapat diakses oleh akun Guru yang telah terverifikasi.";
      } else if (isRecoverableAuthError(err)) {
        userMsg = "Sesi login kedaluwarsa. Silakan muat ulang halaman atau masuk kembali.";
      } else {
        userMsg = rawMsg.replace(/^Error:\s*/i, "").slice(0, 200);
      }

      setErrorMessage(userMsg);
      toast.error(userMsg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] sm:max-w-2xl overflow-y-auto overflow-x-hidden p-4 sm:p-6">
        <DialogHeader className="min-w-0">
          <DialogTitle className="font-display text-navy break-words">
            Susun Modul Ajar Baru (AI Grounded)
          </DialogTitle>
          <DialogDescription className="break-words">
            GuruPro membaca materi sumber Anda, membangun rujukan faktual, lalu menyusun Modul Ajar
            Kurikulum Merdeka berakar sumber dengan penjaminan mutu AI-2D.
          </DialogDescription>
        </DialogHeader>

        {busy ? (
          <div className="grid place-items-center gap-3 py-12 text-center min-w-0 px-2">
            <Loader2 className="h-9 w-9 animate-spin text-primary" />
            <p className="font-display font-semibold text-navy text-base sm:text-lg">
              {stageMessage || "GuruPro AI sedang memproses..."}
            </p>
            <div className="flex flex-col items-center gap-1.5 text-xs text-muted-foreground max-w-sm">
              <span
                className={
                  stage === "processing_source" ? "font-semibold text-primary" : "text-muted-foreground"
                }
              >
                1. Membaca & Memverifikasi Materi Sumber
              </span>
              <span
                className={
                  stage === "generating" ? "font-semibold text-primary" : "text-muted-foreground"
                }
              >
                2. Generasi Modul Berakar Sumber (Kurikulum Merdeka)
              </span>
              <span
                className={
                  stage === "validating" ? "font-semibold text-primary" : "text-muted-foreground"
                }
              >
                3. Penjaminan Mutu & Validasi Grounding Faktual (AI-2D)
              </span>
              <span
                className={
                  stage === "saving_draft" ? "font-semibold text-primary" : "text-muted-foreground"
                }
              >
                4. Persistensi Draf Otoritatif ke Basis Data
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground italic">
              Proses ini berakar 100% pada materi Anda dan menerapkan invarian Draf ketat.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 min-w-0">
            {errorMessage ? (
              <div className="flex gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive min-w-0">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">Proses Generasi Draf Belum Berhasil</p>
                  <p className="mt-0.5 text-xs break-words">{errorMessage}</p>
                </div>
              </div>
            ) : null}

            <div className="grid gap-2 min-w-0">
              <Label>Jenis Sumber Materi</Label>
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 min-w-0">
                {ALL_SUMBER_OPTIONS.map((tipe) => {
                  const Icon = ICONS[tipe];
                  const active = sumberTipe === tipe;
                  return (
                    <button
                      key={tipe}
                      type="button"
                      onClick={() => {
                        setSumberTipe(tipe);
                        reset();
                      }}
                      className={`flex items-center gap-2 rounded-xl border p-2.5 text-left text-xs sm:text-sm transition-colors min-w-0 ${
                        active
                          ? "border-primary bg-primary-soft text-primary font-medium"
                          : "hover:bg-muted/60"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate font-medium min-w-0">{tipe}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {sumberTipe === "Materi Tersimpan" ? (
              <div className="grid gap-3 min-w-0">
                <div className="grid gap-2 min-w-0">
                  <Label htmlFor="savedSource">Pilih Materi yang Telah Diserap</Label>
                  <Select
                    value={selectedSavedSourceId}
                    onValueChange={handleSelectSavedSource}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue
                        placeholder={
                          savedSources.length === 0
                            ? "Belum ada materi terserap (masukkan teks/dokumen)"
                            : "Pilih Materi Rujukan"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {savedSources.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.title} ({s.type} · {s.wordCount} kata)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : null}

            {sumberTipe === "Link Luar" ? (
              <div className="grid gap-3 min-w-0">
                <div className="grid gap-2 min-w-0">
                  <Label htmlFor="sumber">Link Sumber Materi (URL)</Label>
                  <div className="flex flex-col gap-2 sm:flex-row min-w-0">
                    <Input
                      id="sumber"
                      value={sumberInput}
                      onChange={(e) => {
                        setSumberInput(e.target.value);
                        reset();
                      }}
                      placeholder={PLACEHOLDER["Link Luar"]}
                      className="min-w-0 flex-1"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleAnalisisUrl}
                      disabled={busy}
                      className="shrink-0 w-full sm:w-auto"
                    >
                      {preview ? <RefreshCw className="h-4 w-4" /> : <Search className="h-4 w-4" />}
                      {preview ? "Baca Ulang" : "Analisis Sumber"}
                    </Button>
                  </div>
                </div>

                {sumberError ? (
                  <div className="flex gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive min-w-0 overflow-hidden">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">Sumber tidak dapat dibaca</p>
                      <p className="mt-0.5 text-xs break-words">{sumberError}</p>
                    </div>
                  </div>
                ) : null}

                {preview ? (
                  <div className="grid gap-2 rounded-xl border bg-muted/40 p-3 min-w-0 max-w-full overflow-hidden">
                    <div className="flex items-start gap-2 min-w-0">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-sm font-semibold text-navy break-words">
                          {preview.judul}
                        </p>
                        <p className="text-xs text-muted-foreground break-all truncate">
                          {preview.url}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground break-words">
                          {preview.situs} · {preview.jumlahKata.toLocaleString("id-ID")} kata terbaca
                          {preview.cukup ? "" : " · isi terbatas"}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {sumberTipe === "eBook / Dokumen" ? (
              <div className="grid gap-2 min-w-0">
                <Label htmlFor="dokumen">Unggah Dokumen (PDF, DOCX, TXT, HTML)</Label>
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed p-3 text-sm text-muted-foreground hover:bg-muted/50 min-w-0">
                  <FileUp className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {fileName ? `File terpilih: ${fileName}` : "Pilih file dokumen (PDF, DOCX, TXT, HTML)"}
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.docx,.txt,.html"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        setFileName(f.name);
                        setStage("processing_source");
                        setStageMessage("Mengekstrak teks dokumen di sisi server...");
                        setSumberError("");
                        const reader = new FileReader();
                        reader.onload = async () => {
                          try {
                            const base64Data = String(reader.result || "");
                            const res = await withAuthRetry(
                              () => supabase.auth.refreshSession(),
                              () =>
                                analisisDokumen({
                                  data: {
                                    fileName: f.name,
                                    fileType: f.type,
                                    base64Data,
                                  },
                                }),
                            );
                            setPreview(res);
                            setSumberInput(res.konten);
                            if (!topik.trim()) setTopik(res.judul || f.name.replace(/\.[^/.]+$/, ""));
                            toast.success(`Dokumen "${f.name}" berhasil diserap (${res.jumlahKata} kata).`);
                            setStage("idle");
                          } catch (err: any) {
                            const msg = err?.message || "Gagal mengekstrak teks dari dokumen.";
                            setSumberError(msg);
                            setErrorMessage(msg);
                            setStage("error");
                            toast.error(msg);
                          }
                        };
                        reader.onerror = () => {
                          setStage("error");
                          setSumberError("Gagal membaca file dari perangkat.");
                        };
                        reader.readAsDataURL(f);
                      }
                    }}
                  />
                </label>
                {preview ? (
                  <div className="flex items-center gap-2 rounded-xl border bg-muted/40 p-2.5 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    <span className="font-medium text-foreground">{preview.judul}</span>
                    <span>· {preview.jumlahKata} kata diserap</span>
                  </div>
                ) : null}
              </div>
            ) : null}

            {sumberTipe === "Teks" || sumberTipe === "CP / ATP" ? (
              <div className="grid gap-2 min-w-0">
                <Label htmlFor="sumberText">{sumberTipe}</Label>
                <Textarea
                  id="sumberText"
                  rows={5}
                  value={sumberInput}
                  onChange={(e) => {
                    setSumberInput(e.target.value);
                    if (preview) setPreview(null);
                  }}
                  placeholder={PLACEHOLDER[sumberTipe]}
                  className="min-w-0 max-w-full break-words"
                />
                <p className="text-xs text-muted-foreground break-words">
                  Isi materi ini akan diserap sebagai rujukan bukti grounding faktual AI. Masukkan
                  minimal 50 karakter materi.
                </p>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-3 min-w-0 pt-2 border-t">
              <div className="grid gap-2 sm:col-span-3 min-w-0">
                <Label htmlFor="topik">Topik / Materi Pokok Pembelajaran</Label>
                <Input
                  id="topik"
                  value={topik}
                  onChange={(e) => setTopik(e.target.value)}
                  placeholder="Misal: Konfigurasi Routing Statis MikroTik"
                  className="min-w-0"
                />
              </div>

              <div className="grid gap-2 min-w-0">
                <Label>Kelas Sasaran</Label>
                <Select
                  value={selectedKelasId}
                  onValueChange={(val) => {
                    setSelectedKelasId(val);
                    const found = myKelasList.find((k) => k.id === val);
                    if (found) {
                      setKelas(`${found.tingkat} ${found.namaKelas}`);
                      if (found.mapel && !mapel) {
                        setMapel(found.mapel);
                      }
                    }
                  }}
                >
                  <SelectTrigger className="min-w-0 w-full">
                    <SelectValue
                      placeholder={
                        myKelasList.length === 0
                          ? "Belum ada kelas (buat di Kelas Saya)"
                          : "Pilih Kelas"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {myKelasList.length > 0 ? (
                      myKelasList.map((k) => {
                        const val = `${k.tingkat} ${k.namaKelas}`;
                        return (
                          <SelectItem key={k.id} value={k.id}>
                            {val} {k.mapel ? `(${k.mapel})` : ""}
                          </SelectItem>
                        );
                      })
                    ) : (
                      <div className="p-2 text-xs text-muted-foreground text-center">
                        Belum ada kelas aktif. Buat kelas terlebih dahulu di menu{" "}
                        <strong>Kelas Saya</strong>.
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2 sm:col-span-2 min-w-0">
                <Label>Mata Pelajaran</Label>
                {mapelOptions.length > 0 ? (
                  <Select value={mapel} onValueChange={setMapel}>
                    <SelectTrigger className="min-w-0 w-full">
                      <SelectValue placeholder="Pilih Mapel" />
                    </SelectTrigger>
                    <SelectContent>
                      {mapelOptions.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m} {m === profile?.mapel ? "(Mapel Profil)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={mapel}
                    onChange={(e) => setMapel(e.target.value)}
                    placeholder="Mata pelajaran (misal: Administrasi Infrastruktur Jaringan)"
                    className="min-w-0"
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {!busy ? (
          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-2 w-full pt-2">
            <Button
              variant="ghost"
              onClick={() => close(false)}
              disabled={busy}
              className="w-full sm:w-auto"
            >
              Batal
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={busy || !selectedKelasId || !topik.trim()}
              className="w-full sm:w-auto"
            >
              <Sparkles className="h-4 w-4" />
              Susun Modul dengan AI
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
