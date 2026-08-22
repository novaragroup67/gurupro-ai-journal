import { FileUp, Link2, Loader2, Sparkles, Target, Type } from "lucide-react";
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
import { generateModul } from "@/lib/modul-ai";
import { KELAS, MAPEL, SUMBER_TIPE, type Modul, type SumberTipe } from "@/lib/modul-types";

const ICONS: Record<SumberTipe, typeof Target> = {
  "CP / ATP": Target,
  "eBook / Dokumen": FileUp,
  Teks: Type,
  "Link Luar": Link2,
};

const PLACEHOLDER: Record<SumberTipe, string> = {
  "CP / ATP": "Tempel capaian pembelajaran / alur tujuan pembelajaran di sini…",
  "eBook / Dokumen": "Unggah dokumen, atau tulis bagian/bab yang ingin dijadikan modul…",
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
  onGenerated: (draft: Omit<Modul, "id" | "createdAt" | "updatedAt">) => void;
}) {
  const [sumberTipe, setSumberTipe] = useState<SumberTipe>("CP / ATP");
  const [sumberInput, setSumberInput] = useState("");
  const [topik, setTopik] = useState("");
  const [kelas, setKelas] = useState("");
  const [mapel, setMapel] = useState("");
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGenerate = () => {
    if (!topik.trim() && !sumberInput.trim()) {
      toast.error("Isi topik/materi atau sumber agar AI punya konteks.");
      return;
    }
    setLoading(true);
    setTimeout(() => {
      const draft = generateModul({
        sumberTipe,
        sumberInput: fileName ? `${fileName} — ${sumberInput}` : sumberInput,
        topik,
      });
      onGenerated({ ...draft, kelas, mapel });
      setLoading(false);
      onOpenChange(false);
      toast.success("Modul berhasil disusun GuruPro AI.");
    }, 1400);
  };

  return (
    <Dialog open={open} onOpenChange={loading ? () => undefined : onOpenChange}>
      <DialogContent className="max-h-[90dvh] w-[min(40rem,calc(100vw-2rem))] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-navy">Susun Modul Baru</DialogTitle>
          <DialogDescription>
            Susun modul dibantu AI dari berbagai sumber, edit, lalu publikasikan.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="grid place-items-center gap-3 py-14 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="font-display font-semibold text-navy">GuruPro AI sedang menyusun modul…</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Menganalisis sumber, menyusun struktur bab, sub-judul, poin-poin, dan isi modul.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Jenis Sumber AI</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {SUMBER_TIPE.map((tipe) => {
                  const Icon = ICONS[tipe];
                  const active = sumberTipe === tipe;
                  return (
                    <button
                      key={tipe}
                      type="button"
                      onClick={() => setSumberTipe(tipe)}
                      className={`flex items-center gap-2 rounded-xl border p-3 text-left text-sm transition-colors ${
                        active
                          ? "border-primary bg-primary-soft text-primary"
                          : "hover:bg-muted/60"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate font-medium">{tipe}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="sumber">{sumberTipe}</Label>
              {sumberTipe === "Link Luar" ? (
                <Input
                  id="sumber"
                  value={sumberInput}
                  onChange={(e) => setSumberInput(e.target.value)}
                  placeholder={PLACEHOLDER[sumberTipe]}
                />
              ) : sumberTipe === "eBook / Dokumen" ? (
                <div className="grid gap-2">
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground hover:bg-muted/50">
                    <FileUp className="h-4 w-4" />
                    {fileName || "Pilih file eBook / dokumen (PDF, DOCX)"}
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.doc,.docx,.txt"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          setFileName(f.name);
                          toast.success(`${f.name} siap dibaca AI (prototipe).`);
                        }
                      }}
                    />
                  </label>
                  <Textarea
                    id="sumber"
                    rows={3}
                    value={sumberInput}
                    onChange={(e) => setSumberInput(e.target.value)}
                    placeholder={PLACEHOLDER[sumberTipe]}
                  />
                </div>
              ) : (
                <Textarea
                  id="sumber"
                  rows={4}
                  value={sumberInput}
                  onChange={(e) => setSumberInput(e.target.value)}
                  placeholder={PLACEHOLDER[sumberTipe]}
                />
              )}
            </div>

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
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button onClick={handleGenerate}>
              <Sparkles className="h-4 w-4" />
              Generate Modul dengan AI
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
