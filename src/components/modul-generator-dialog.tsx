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
import { SUMBER_TIPE, type Modul, type SumberTipe } from "@/lib/modul-types";
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
  const { kelasList, refresh: refreshKelas } = useKelas();
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
    return Array.from(options);
  }, [profile?.mapel, myKelasList]);

  const [sumberTipe, setSumberTipe] = useState<SumberTipe>("Link Luar");
  const [sumberInput, setSumberInput] = useState("");
  const [topik, setTopik] = useState("");
  const [selectedKelasId, setSelectedKelasId] = useState<string>("");
  const [kelas, setKelas] = useState("");
  const [mapel, setMapel] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<SumberPreview | null>(null);
  const [sumberError, setSumberError] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      void refreshKelas();
    }
  }, [open]);

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

      const targetClass = myKelasList.find((k) => k.id === selectedKelasId);
      const finalKelasLabel = targetClass ? `${targetClass.tingkat} ${targetClass.namaKelas}` : (kelas || "");
      const finalKelasId = targetClass ? targetClass.id : (selectedKelasId || undefined);
      const finalMapel = mapel.trim() || profile?.mapel?.trim() || "";

      await onGenerated({
        judul: hasil.judul,
        kelas: finalKelasLabel,
        kelasId: finalKelasId,
        mapel: finalMapel,
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

        {loading ? (
          <div className="grid place-items-center gap-3 py-14 text-center min-w-0 px-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="font-display font-semibold text-navy">
              GuruPro AI sedang menyusun modul…
            </p>
            <p className="max-w-sm text-sm text-muted-foreground break-words">
              Menyusun tujuan pembelajaran, bab, poin kunci, penjelasan, dan kesimpulan dari isi
              sumber.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 min-w-0">
            <div className="grid gap-2 min-w-0">
              <Label>Jenis Sumber</Label>
              <div className="grid gap-2 sm:grid-cols-2 min-w-0">
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
                      className={`flex items-center gap-2 rounded-xl border p-3 text-left text-sm transition-colors min-w-0 ${
                        active ? "border-primary bg-primary-soft text-primary" : "hover:bg-muted/60"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate font-medium min-w-0">{tipe}</span>
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
              <div className="grid gap-3 min-w-0">
                <div className="grid gap-2 min-w-0">
                  <Label htmlFor="sumber">Link Sumber Materi</Label>
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
                      onClick={handleAnalisis}
                      disabled={analyzing}
                      className="shrink-0 w-full sm:w-auto"
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
                  <div className="flex gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive min-w-0 overflow-hidden">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">Sumber tidak dapat dibaca</p>
                      <p className="mt-0.5 text-xs break-words [overflow-wrap:anywhere]">
                        {sumberError}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            setSumberTipe("Teks");
                            setSumberError("");
                          }}
                        >
                          Beralih ke Input Teks
                        </Button>
                      </div>
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
                          {preview.situs} · {preview.jumlahKata.toLocaleString("id-ID")} kata
                          terbaca
                          {preview.cukup ? "" : " · isi terbatas"}
                        </p>
                      </div>
                    </div>
                    <p className="max-h-40 overflow-y-auto overflow-x-hidden whitespace-pre-line break-words [overflow-wrap:anywhere] rounded-lg bg-background p-2 text-xs leading-relaxed text-muted-foreground max-w-full">
                      {preview.konten.slice(0, 1200)}
                      {preview.konten.length > 1200 ? "…" : ""}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-2 min-w-0">
                <Label htmlFor="sumber">{sumberTipe}</Label>
                {sumberTipe === "eBook / Dokumen" ? (
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed p-3 text-sm text-muted-foreground hover:bg-muted/50 min-w-0">
                    <FileUp className="h-4 w-4 shrink-0" />
                    <span className="truncate">
                      {fileName || "Tandai nama file eBook (isi materi tetap ditempel di bawah)"}
                    </span>
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.doc,.docx,.txt"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          setFileName(f.name);
                          toast.info(
                            "Tempel bagian isi dokumen di bawah agar AI berdasar isi aslinya.",
                          );
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
                  className="min-w-0 max-w-full break-words"
                />
                <p className="text-xs text-muted-foreground break-words">
                  Isi yang ditempel menjadi satu-satunya rujukan AI, jadi tempel materi selengkap
                  mungkin.
                </p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-3 min-w-0">
              <div className="grid gap-2 sm:col-span-3 min-w-0">
                <Label htmlFor="topik">Topik / Materi</Label>
                <Input
                  id="topik"
                  value={topik}
                  onChange={(e) => setTopik(e.target.value)}
                  placeholder="Misal: Sistem Persamaan Linear"
                  className="min-w-0"
                />
              </div>
              <div className="grid gap-2 min-w-0">
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
                    placeholder="Mata pelajaran (misal: Matematika)"
                    className="min-w-0"
                  />
                )}
              </div>
              <div className="grid gap-2 min-w-0">
                <Label>Kelas</Label>
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
                        Belum ada kelas aktif. Buat kelas terlebih dahulu di menu <strong>Kelas Saya</strong>.
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>

            </div>
          </div>
        )}

        {!loading ? (
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
              disabled={busy || (sumberTipe === "Link Luar" && !preview)}
              className="w-full sm:w-auto"
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
