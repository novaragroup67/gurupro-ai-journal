import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
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
import { useState } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { generateModulAi } from "@/lib/ai.functions";
import { uid } from "@/lib/cloud-store";
import { KELAS, MAPEL, SUMBER_TIPE, type Modul, type SumberTipe } from "@/lib/modul-types";
import { analisisSumberUrl, type SumberPreview } from "@/lib/sumber.functions";

const ICONS: Record<SumberTipe, typeof Target> = {
  "CP / ATP": Target,
  "eBook / Dokumen": FileUp,
  Teks: Type,
  "Link Luar": Link2,
};

const PLACEHOLDER: Record<SumberTipe, string> = {
  "CP / ATP": "Tempel capaian pembelajaran / alur tujuan pembelajaran di sini…",
  "eBook / Dokumen": "Tempel bagian/bab dari eBook yang ingin dijadikan modul…",
  Teks: "Tempel materi, catatan, atau ringkasan bahan ajar Anda…",
  "Link Luar": "https://sumber-belajar.example.com/artikel-materi",
};

export function ModulGeneratorDialog({
  open,
  onOpenChange,
  onGenerated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerated: (draft: Omit<Modul, "id" | "createdAt" | "updatedAt">) => void | Promise<void>;
}) {
  const analisis = useServerFn(analisisSumberUrl);
  const generate = useServerFn(generateModulAi);

  const [sumberTipe, setSumberTipe] = useState<SumberTipe>("Link Luar");
  const [sumberInput, setSumberInput] = useState("");
  const [topik, setTopik] = useState("");
  const [kelas, setKelas] = useState("");
  const [mapel, setMapel] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<SumberPreview | null>(null);
  const [sumberError, setSumberError] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setPreview(null);
    setSumberError("");
  };

  const close = (next: boolean) => {
    if (loading || analyzing) return;
    if (!next) {
      reset();
    }
    onOpenChange(next);
  };

  const handleAnalisis = async () => {
    if (!sumberInput.trim()) {
      toast.error("Tempel link sumber terlebih dahulu.");
      return;
    }
    setAnalyzing(true);
    setSumberError("");
    setPreview(null);
    try {
      const hasil = await analisis({ data: { url: sumberInput.trim() } });
      setPreview(hasil);
      if (!topik.trim()) setTopik(hasil.judul);
      toast.success("Isi sumber berhasil dibaca.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sumber tidak dapat diakses.";
      setSumberError(message);
      toast.error(message);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleGenerate = async () => {
    const isLink = sumberTipe === "Link Luar";
    if (isLink && !preview) {
      toast.error("Analisis sumber terlebih dahulu agar modul benar-benar berdasar isi halaman.");
      return;
    }
    const konten = isLink
      ? (preview?.konten ?? "")
      : [fileName, sumberInput.trim()].filter(Boolean).join("\n");

    if (konten.trim().length < 80) {
      toast.error("Materi sumber terlalu sedikit. Tambahkan isi materi agar AI tidak mengarang.");
      return;
    }

    setLoading(true);
    try {
      const hasil = await generate({
        data: {
          sumberTipe,
          konten,
          topik: topik.trim(),
          mapel,
          kelas,
          ...(preview ? { sumberJudul: preview.judul, sumberUrl: preview.url } : {}),
        },
      });

      const sections = hasil.sections.map((s) => ({
        id: uid(),
        judul: s.judul,
        poin: s.poin,
        isi: s.isi,
      }));
      if (hasil.kesimpulan) {
        sections.push({ id: uid(), judul: "Kesimpulan", poin: [], isi: hasil.kesimpulan });
      }

      const ringkasan = [
        hasil.ringkasan,
        hasil.tujuan.length ? `Tujuan pembelajaran: ${hasil.tujuan.join("; ")}.` : "",
        hasil.catatanKeterbatasan ? `Catatan sumber: ${hasil.catatanKeterbatasan}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      await onGenerated({
        judul: hasil.judul,
        kelas,
        mapel,
        status: "Draft",
        sumberTipe,
        sumberInput: isLink ? (preview?.url ?? sumberInput) : konten.slice(0, 4000),
        sumberUrl: preview?.url,
        sumberJudul: preview?.judul,
        sumberKutipan: (preview?.konten ?? konten).slice(0, 1200),
        ringkasan,
        sections,
        slides: [],
      });

      if (hasil.catatanKeterbatasan) {
        toast.warning(`Catatan AI: ${hasil.catatanKeterbatasan}`);
      }
      toast.success("Modul berhasil disusun dari isi sumber.");
      reset();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI gagal menyusun modul.");
    } finally {
      setLoading(false);
    }
  };

  const busy = loading || analyzing;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90dvh] w-[min(42rem,calc(100vw-2rem))] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-navy">Susun Modul Baru</DialogTitle>
          <DialogDescription>
            GuruPro membaca isi sumber terlebih dahulu, lalu menyusun modul berdasar isi tersebut.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="grid place-items-center gap-3 py-14 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="font-display font-semibold text-navy">GuruPro AI sedang menyusun modul…</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Menyusun tujuan pembelajaran, bab, poin kunci, penjelasan, dan kesimpulan dari isi sumber.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Jenis Sumber</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {SUMBER_TIPE.map((tipe) => {
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
                      className={`flex items-center gap-2 rounded-xl border p-3 text-left text-sm transition-colors ${
                        active ? "border-primary bg-primary-soft text-primary" : "hover:bg-muted/60"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate font-medium">{tipe}</span>
                      {tipe === "Link Luar" ? (
                        <span className="ml-auto shrink-0 text-[10px] font-semibold uppercase text-accent-foreground">
                          utama
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            {sumberTipe === "Link Luar" ? (
              <div className="grid gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="sumber">Link Sumber Materi</Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id="sumber"
                      value={sumberInput}
                      onChange={(e) => {
                        setSumberInput(e.target.value);
                        reset();
                      }}
                      placeholder={PLACEHOLDER["Link Luar"]}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleAnalisis}
                      disabled={analyzing}
                      className="shrink-0"
                    >
                      {analyzing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : preview ? (
                        <RefreshCw className="h-4 w-4" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                      {analyzing ? "Membaca…" : preview ? "Baca Ulang" : "Analisis Sumber"}
                    </Button>
                  </div>
                </div>

                {sumberError ? (
                  <div className="flex gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="font-medium">Sumber tidak dapat dibaca</p>
                      <p className="mt-0.5 text-xs">{sumberError}</p>
                    </div>
                  </div>
                ) : null}

                {preview ? (
                  <div className="grid gap-2 rounded-xl border bg-muted/40 p-3">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <p className="truncate font-display text-sm font-semibold text-navy">
                          {preview.judul}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{preview.url}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {preview.situs} · {preview.jumlahKata.toLocaleString("id-ID")} kata terbaca
                          {preview.cukup ? "" : " · isi terbatas"}
                        </p>
                      </div>
                    </div>
                    <p className="max-h-40 overflow-y-auto whitespace-pre-line rounded-lg bg-background p-2 text-xs leading-relaxed text-muted-foreground">
                      {preview.konten.slice(0, 1200)}
                      {preview.konten.length > 1200 ? "…" : ""}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-2">
                <Label htmlFor="sumber">{sumberTipe}</Label>
                {sumberTipe === "eBook / Dokumen" ? (
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed p-3 text-sm text-muted-foreground hover:bg-muted/50">
                    <FileUp className="h-4 w-4" />
                    {fileName || "Tandai nama file eBook (isi materi tetap ditempel di bawah)"}
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.doc,.docx,.txt"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          setFileName(f.name);
                          toast.info("Tempel bagian isi dokumen di bawah agar AI berdasar isi aslinya.");
                        }
                      }}
                    />
                  </label>
                ) : null}
                <Textarea
                  id="sumber"
                  rows={6}
                  value={sumberInput}
                  onChange={(e) => setSumberInput(e.target.value)}
                  placeholder={PLACEHOLDER[sumberTipe]}
                />
                <p className="text-xs text-muted-foreground">
                  Isi yang ditempel menjadi satu-satunya rujukan AI, jadi tempel materi selengkap mungkin.
                </p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2 sm:col-span-3">
                <Label htmlFor="topik">Topik / Materi</Label>
                <Input
                  id="topik"
                  value={topik}
                  onChange={(e) => setTopik(e.target.value)}
                  placeholder="Misal: Sistem Persamaan Linear"
                />
              </div>
              <div className="grid gap-2">
                <Label>Mata Pelajaran</Label>
                <Select value={mapel} onValueChange={setMapel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih" />
                  </SelectTrigger>
                  <SelectContent>
                    {MAPEL.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Kelas</Label>
                <Select value={kelas} onValueChange={setKelas}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih" />
                  </SelectTrigger>
                  <SelectContent>
                    {KELAS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {k}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {!loading ? (
          <DialogFooter>
            <Button variant="ghost" onClick={() => close(false)} disabled={busy}>
              Batal
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={busy || (sumberTipe === "Link Luar" && !preview)}
            >
              <Sparkles className="h-4 w-4" />
              Generate Modul dengan AI
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
