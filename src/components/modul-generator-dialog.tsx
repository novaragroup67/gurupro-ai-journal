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
import { generateModulAi } from "@/lib/ai.functions";
import { supabase } from "@/integrations/supabase/client";
import { isRecoverableAuthError, withAuthRetry } from "@/integrations/supabase/auth-token";
import { useAuth } from "@/lib/auth-store";
import { uid } from "@/lib/cloud-store";
import { useKelas } from "@/lib/kelas-store";
import { MAPEL, SUMBER_TIPE, type Modul, type SumberTipe } from "@/lib/modul-types";
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
  const { profile, user } = useAuth();
  const { kelasList } = useKelas();
  const analisis = useServerFn(analisisSumberUrl);
  const generate = useServerFn(generateModulAi);

  const myKelasList = useMemo(() => {
    return kelasList.filter((k) => k.guruId === user?.id || k.guruId === profile?.id);
  }, [kelasList, user?.id, profile?.id]);

  const mapelOptions = useMemo(() => {
    const options = new Set<string>();
    if (profile?.mapel?.trim()) options.add(profile.mapel.trim());
    myKelasList.forEach((k) => {
      if (k.mapel?.trim()) options.add(k.mapel.trim());
    });
    MAPEL.forEach((m) => options.add(m));
    return Array.from(options);
  }, [profile?.mapel, myKelasList]);

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

  useEffect(() => {
    if (open) {
      if (profile?.mapel && !mapel) {
        setMapel(profile.mapel);
      }
      if (myKelasList.length > 0 && !kelas) {
        setKelas(`${myKelasList[0].tingkat} ${myKelasList[0].namaKelas}`);
      }
    }
  }, [open, profile?.mapel, myKelasList, mapel, kelas]);

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
      const hasil = await withAuthRetry(
        () => supabase.auth.refreshSession(),
        () => analisis({ data: { url: sumberInput.trim() } }),
      );
      setPreview(hasil);
      if (!topik.trim()) setTopik(hasil.judul);
      toast.success("Isi sumber berhasil dibaca.");
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Sumber tidak dapat diakses.";
      const message = isRecoverableAuthError(error)
        ? "Sesi login tidak valid atau kedaluwarsa. Keluar lalu masuk kembali, kemudian analisis sumber lagi."
        : raw;
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
    let hasil: any = null;
    try {
      hasil = await withAuthRetry(
        () => supabase.auth.refreshSession(),
        () =>
          generate({
            data: {
              sumberTipe,
              konten,
              topik: topik.trim(),
              mapel,
              kelas,
              ...(preview ? { sumberJudul: preview.judul, sumberUrl: preview.url } : {}),
            },
          }),
      );
    } catch (error) {
      const raw = error instanceof Error ? error.message : "AI gagal menyusun modul.";
      const message = isRecoverableAuthError(error)
        ? "Sesi login tidak valid atau kedaluwarsa. Keluar lalu masuk kembali, kemudian coba generate ulang."
        : raw;
      toast.error(message);
      setLoading(false);
      return;
    }

    // Proses hasil AI dan simpan modul secara terpisah
    try {
      const sections = (hasil.sections || []).map((s: any) => ({
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
        hasil.tujuan?.length ? `Tujuan pembelajaran: ${hasil.tujuan.join("; ")}.` : "",
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
    } catch (saveError) {
      const msg = saveError instanceof Error ? saveError.message : "Gagal menyimpan modul hasil AI.";
      console.error("[ModulGenerator] Error saving generated modul:", saveError);
      toast.error(`Modul selesai disusun AI, namun gagal disimpan: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const busy = loading || analyzing;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] sm:max-w-2xl overflow-y-auto overflow-x-hidden p-4 sm:p-6">
        <DialogHeader className="min-w-0">
          <DialogTitle className="font-display text-navy break-words">Susun Modul Baru</DialogTitle>
          <DialogDescription className="break-words">
            GuruPro membaca isi sumber terlebih dahulu, lalu menyusun modul berdasar isi tersebut.
          </DialogDescription>
        </DialogHeader>

        {loading ? (\r
          <div className="grid place-items-center gap-3 py-14 text-center min-w-0 px-2">\r
            <Loader2 className="h-8 w-8 animate-spin text-primary" />\r
            <p className="font-display font-semibold text-navy">\r
              GuruPro AI sedang menyusun modul…\r
            </p>\r
            <p className="max-w-sm text-sm text-muted-foreground break-words">\r
              Menyusun tujuan pembelajaran, bab, poin kunci, penjelasan, dan kesimpulan dari isi\r
              sumber.\r
            </p>\r
          </div>\r
        ) : (\r
          <div className="grid gap-4 min-w-0">\r
            <div className="grid gap-2 min-w-0">\r
              <Label>Jenis Sumber</Label>\r
              <div className="grid gap-2 sm:grid-cols-2 min-w-0">\r
                {SUMBER_TIPE.map((tipe) => {\r
                  const Icon = ICONS[tipe];\r
                  const active = sumberTipe === tipe;\r
                  return (\r
                    <button\r
                      key={tipe}\r
                      type="button"\r
                      onClick={() => {\r
                        setSumberTipe(tipe);\r
                        reset();\r
                      }}\r
                      className={`flex items-center gap-2 rounded-xl border p-3 text-left text-sm transition-colors min-w-0 ${\r
                        active ? "border-primary bg-primary-soft text-primary" : "hover:bg-muted/60"\r
                      }`}\r
                    >\r
                      <Icon className="h-4 w-4 shrink-0" />\r
                      <span className="truncate font-medium min-w-0">{tipe}</span>\r
                      {tipe === "Link Luar" ? (\r
                        <span className="ml-auto shrink-0 text-[10px] font-semibold uppercase text-accent-foreground">\r
                          utama\r
                        </span>\r
                      ) : null}\r
                    </button>\r
                  );\r
                })}\r
              </div>\r
            </div>\r
\r
            {sumberTipe === "Link Luar" ? (\r
              <div className="grid gap-3 min-w-0">\r
                <div className="grid gap-2 min-w-0">\r
                  <Label htmlFor="sumber">Link Sumber Materi</Label>\r
                  <div className="flex flex-col gap-2 sm:flex-row min-w-0">\r
                    <Input\r
                      id="sumber"\r
                      value={sumberInput}\r
                      onChange={(e) => {\r
                        setSumberInput(e.target.value);\r
                        reset();\r
                      }}\r
                      placeholder={PLACEHOLDER["Link Luar"]}\r
                      className="min-w-0 flex-1"\r
                    />\r
                    <Button\r
                      type="button"\r
                      variant="secondary"\r
                      onClick={handleAnalisis}\r
                      disabled={analyzing}\r
                      className="shrink-0 w-full sm:w-auto"\r
                    >\r
                      {analyzing ? (\r
                        <Loader2 className="h-4 w-4 animate-spin" />\r
                      ) : preview ? (\r
                        <RefreshCw className="h-4 w-4" />\r
                      ) : (\r
                        <Search className="h-4 w-4" />\r
                      )}\r
                      {analyzing ? "Membaca…" : preview ? "Baca Ulang" : "Analisis Sumber"}\r
                    </Button>\r
                  </div>\r
                </div>\r
\r
                {sumberError ? (\r
                  <div className="flex gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive min-w-0 overflow-hidden">\r
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />\r
                    <div className="min-w-0 flex-1">\r
                      <p className="font-medium">Sumber tidak dapat dibaca</p>\r
                      <p className="mt-0.5 text-xs break-words [overflow-wrap:anywhere]">\r
                        {sumberError}\r
                      </p>\r
                      <div className="mt-2 flex flex-wrap items-center gap-2">\r
                        <Button\r
                          type="button"\r
                          variant="outline"\r
                          size="sm"\r
                          className="h-7 text-xs"\r
                          onClick={() => {\r
                            setSumberTipe("Teks");\r
                            setSumberError("");\r
                          }}\r
                        >\r
                          Beralih ke Input Teks\r
                        </Button>\r
                      </div>\r
                    </div>\r
                  </div>\r
                ) : null}\r
\r
                {preview ? (\r
                  <div className="grid gap-2 rounded-xl border bg-muted/40 p-3 min-w-0 max-w-full overflow-hidden">\r
                    <div className="flex items-start gap-2 min-w-0">\r
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />\r
                      <div className="min-w-0 flex-1">\r
                        <p className="truncate font-display text-sm font-semibold text-navy break-words">\r
                          {preview.judul}\r
                        </p>\r
                        <p className="text-xs text-muted-foreground break-all truncate">\r
                          {preview.url}\r
                        </p>\r
                        <p className="mt-0.5 text-xs text-muted-foreground break-words">\r
                          {preview.situs} · {preview.jumlahKata.toLocaleString("id-ID")} kata\r
                          terbaca\r
                          {preview.cukup ? "" : " · isi terbatas"}\r
                        </p>\r
                      </div>\r
                    </div>\r
                    <p className="max-h-40 overflow-y-auto overflow-x-hidden whitespace-pre-line break-words [overflow-wrap:anywhere] rounded-lg bg-background p-2 text-xs leading-relaxed text-muted-foreground max-w-full">\r
                      {preview.konten.slice(0, 1200)}\r
                      {preview.konten.length > 1200 ? "…" : ""}\r
                    </p>\r
                  </div>\r
                ) : null}\r
              </div>\r
            ) : (\r
              <div className="grid gap-2 min-w-0">\r
                <Label htmlFor="sumber">{sumberTipe}</Label>\r
                {sumberTipe === "eBook / Dokumen" ? (\r
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed p-3 text-sm text-muted-foreground hover:bg-muted/50 min-w-0">\r
                    <FileUp className="h-4 w-4 shrink-0" />\r
                    <span className="truncate">\r
                      {fileName || "Tandai nama file eBook (isi materi tetap ditempel di bawah)"}\r
                    </span>\r
                    <input\r
                      type="file"\r
                      className="hidden"\r
                      accept=".pdf,.doc,.docx,.txt"\r
                      onChange={(e) => {\r
                        const f = e.target.files?.[0];\r
                        if (f) {\r
                          setFileName(f.name);\r
                          toast.info(\r
                            "Tempel bagian isi dokumen di bawah agar AI berdasar isi aslinya.",\r
                          );\r
                        }\r
                      }}\r
                    />\r
                  </label>\r
                ) : null}\r
                <Textarea\r
                  id="sumber"\r
                  rows={6}\r
                  value={sumberInput}\r
                  onChange={(e) => setSumberInput(e.target.value)}\r
                  placeholder={PLACEHOLDER[sumberTipe]}\r
                  className="min-w-0 max-w-full break-words"\r
                />\r
                <p className="text-xs text-muted-foreground break-words">\r
                  Isi yang ditempel menjadi satu-satunya rujukan AI, jadi tempel materi selengkap\r
                  mungkin.\r
                </p>\r
              </div>\r
            )}\r
\r
            <div className="grid gap-4 sm:grid-cols-3 min-w-0">\r
              <div className="grid gap-2 sm:col-span-3 min-w-0">\r
                <Label htmlFor="topik">Topik / Materi</Label>\r
                <Input\r
                  id="topik"\r
                  value={topik}\r
                  onChange={(e) => setTopik(e.target.value)}\r
                  placeholder="Misal: Sistem Persamaan Linear"\r
                  className="min-w-0"\r
                />\r
              </div>\r
              <div className="grid gap-2 min-w-0">\r
                <Label>Mata Pelajaran</Label>\r
                <Select value={mapel} onValueChange={setMapel}>\r
                  <SelectTrigger className="min-w-0 w-full">\r
                    <SelectValue placeholder="Pilih Mapel" />\r
                  </SelectTrigger>\r
                  <SelectContent>\r
                    {mapelOptions.map((m) => (\r
                      <SelectItem key={m} value={m}>\r
                        {m}\r
                      </SelectItem>\r
                    ))}\r
                  </SelectContent>\r
                </Select>\r
              </div>\r
              <div className="grid gap-2 min-w-0">\r
                <Label>Kelas</Label>\r
                <Select value={kelas} onValueChange={setKelas}>\r
                  <SelectTrigger className="min-w-0 w-full">\r
                    <SelectValue\r
                      placeholder={\r
                        myKelasList.length === 0\r
                          ? "Belum ada kelas (buat di Kelas Saya)"\r
                          : "Pilih Kelas"\r
                      }\r
                    />\r
                  </SelectTrigger>\r
                  <SelectContent>\r
                    {myKelasList.length > 0 ? (\r
                      myKelasList.map((k) => {\r
                        const val = `${k.tingkat} ${k.namaKelas}`;\r
                        return (\r
                          <SelectItem key={k.id} value={val}>\r
                            {val} {k.mapel ? `(${k.mapel})` : ""}\r
                          </SelectItem>\r
                        );\r
                      })\r
                    ) : (\r
                      <div className="p-2 text-xs text-muted-foreground text-center">\r
                        Belum ada kelas aktif. Buat kelas terlebih dahulu di menu <strong>Kelas Saya</strong>.\r
                      </div>\r
                    )}\r
                  </SelectContent>\r
                </Select>\r
              </div>\r
            </div>\r
          </div>\r
        )}\r
\r
        {!loading ? (\r
          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-2 w-full pt-2">\r
            <Button\r
              variant="ghost"\r
              onClick={() => close(false)}\r
              disabled={busy}\r
              className="w-full sm:w-auto"\r
            >\r
              Batal\r
            </Button>\r
            <Button\r
              onClick={handleGenerate}\r
              disabled={busy || (sumberTipe === "Link Luar" && !preview)}\r
              className="w-full sm:w-auto"\r
            >\r
              <Sparkles className="h-4 w-4" />\r
              Generate Modul dengan AI\r
            </Button>\r
          </DialogFooter>\r
        ) : null}\r
      </DialogContent>\r
    </Dialog>\r
  );\r
}