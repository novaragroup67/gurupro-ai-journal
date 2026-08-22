import {
  ArrowLeft,
  Download,
  FileText,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Presentation,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
import { unduhPdf, unduhPpt, unduhWord } from "@/lib/exporters";
import { buatIlustrasi, buatSlides, reviseModulWithAi } from "@/lib/modul-ai";
import type { Modul } from "@/lib/modul-types";

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
  onSaveDraft: () => void;
  onPublish: () => void;
  onBack: () => void;
}) {
  const [manual, setManual] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [instruksi, setInstruksi] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [ilustrasiLoading, setIlustrasiLoading] = useState(false);
  const [pptLoading, setPptLoading] = useState(false);

  const punyaIlustrasi = modul.sections.some((s) => s.ilustrasi);

  const patchSection = (id: string, patch: Partial<Modul["sections"][number]>) =>
    onChange({ ...modul, sections: modul.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) });

  const runAiEdit = () => {
    if (!instruksi.trim()) {
      toast.error("Tulis dulu instruksi untuk AI.");
      return;
    }
    setAiLoading(true);
    setTimeout(() => {
      onChange(reviseModulWithAi(modul, instruksi));
      setAiLoading(false);
      setAiOpen(false);
      setInstruksi("");
      toast.success("Modul diperbarui sesuai instruksi AI.");
    }, 1200);
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
        sections: modul.sections.map((s) => ({ ...s, ilustrasi: s.ilustrasi ?? buatIlustrasi(s.judul, s.poin) })),
      };
      onChange({ ...withIl, slides: buatSlides(withIl) });
      setPptLoading(false);
      toast.success("Slide PPT beserta ilustrasi siap ditinjau.");
    }, 1600);
  };

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" className="-ml-2 w-fit" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            Kembali ke Daftar Modul
          </Button>
          <h1 className="mt-1 font-display text-xl font-bold text-navy sm:text-2xl">{modul.judul}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary" className={modul.status === "Terbit" ? "bg-primary-soft text-primary" : ""}>
              {modul.status === "Terbit" ? "Dipublikasikan" : "Draft"}
            </Badge>
            <span>{[modul.mapel, modul.kelas].filter(Boolean).join(" · ") || "Belum ada kelas"}</span>
            <span>· Sumber: {modul.sumberTipe}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button variant={manual ? "secondary" : "outline"} size="sm" onClick={() => setManual((v) => !v)}>
            {manual ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
            {manual ? "Selesai Edit" : "Edit Manual"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAiOpen(true)}>
            <Sparkles className="h-4 w-4" />
            Edit dengan AI
          </Button>
          <Button variant="secondary" size="sm" onClick={onSaveDraft}>
            <Save className="h-4 w-4" />
            Simpan Draft
          </Button>
          <Button size="sm" onClick={onPublish}>
            <Send className="h-4 w-4" />
            Publikasikan Modul
          </Button>
        </div>
      </div>

      <Tabs defaultValue="isi">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="isi">Isi Modul</TabsTrigger>
          <TabsTrigger value="ilustrasi">Ilustrasi AI</TabsTrigger>
          <TabsTrigger value="ppt">PPT Otomatis</TabsTrigger>
        </TabsList>

        <TabsContent value="isi" className="mt-4 grid gap-4">
          <Card>
            <CardContent className="grid gap-4 p-5">
              {manual ? (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="judul">Judul Modul</Label>
                    <Input id="judul" value={modul.judul} onChange={(e) => onChange({ ...modul, judul: e.target.value })} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="ringkasan">Ringkasan</Label>
                    <Textarea
                      id="ringkasan"
                      rows={3}
                      value={modul.ringkasan}
                      onChange={(e) => onChange({ ...modul, ringkasan: e.target.value })}
                    />
                  </div>
                </>
              ) : (
                <p className="text-sm leading-relaxed text-muted-foreground">{modul.ringkasan}</p>
              )}
            </CardContent>
          </Card>

          {modul.sections.map((s, i) => (
            <Card key={s.id}>
              <CardHeader className="pb-3">
                {manual ? (
                  <Input value={s.judul} onChange={(e) => patchSection(s.id, { judul: e.target.value })} />
                ) : (
                  <CardTitle className="font-display text-base text-navy">
                    Bab {i + 1}. {s.judul}
                  </CardTitle>
                )}
              </CardHeader>
              <CardContent className="grid gap-3 pt-0">
                {manual ? (
                  <>
                    <div className="grid gap-2">
                      <Label>Poin-poin (satu per baris)</Label>
                      <Textarea
                        rows={3}
                        value={s.poin.join("\n")}
                        onChange={(e) =>
                          patchSection(s.id, { poin: e.target.value.split("\n").filter((p) => p.trim() !== "") })
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Isi Modul</Label>
                      <Textarea rows={5} value={s.isi} onChange={(e) => patchSection(s.id, { isi: e.target.value })} />
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
                    <p className="text-sm leading-relaxed text-muted-foreground">{s.isi}</p>
                  </>
                )}
                {s.ilustrasi ? (
                  <img
                    src={s.ilustrasi}
                    alt={`Ilustrasi ${s.judul}`}
                    className="w-full max-w-sm rounded-xl border"
                  />
                ) : null}
              </CardContent>
            </Card>
          ))}

          <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
            <Button variant="outline" onClick={() => unduhPdf(modul)}>
              <FileText className="h-4 w-4" />
              Unduh PDF
            </Button>
            <Button variant="outline" onClick={() => unduhWord(modul)}>
              <Download className="h-4 w-4" />
              Unduh Word
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="ilustrasi" className="mt-4 grid gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-base text-navy">Ilustrasi Modul dengan AI</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 pt-0">
              <p className="text-sm text-muted-foreground">
                AI membaca setiap sub-judul modul lalu membuat ilustrasi yang sesuai konteksnya.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={generateIlustrasi} disabled={ilustrasiLoading}>
                  {ilustrasiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                  {ilustrasiLoading ? "AI sedang menggambar…" : "Generate Ilustrasi dengan AI"}
                </Button>
                <Button variant="outline" disabled={!punyaIlustrasi} onClick={() => unduhPdf(modul, true)}>
                  <FileText className="h-4 w-4" />
                  Unduh PDF dengan Ilustrasi
                </Button>
                <Button variant="outline" disabled={!punyaIlustrasi} onClick={() => unduhWord(modul, true)}>
                  <Download className="h-4 w-4" />
                  Unduh Word dengan Ilustrasi
                </Button>
              </div>

              {punyaIlustrasi ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {modul.sections.map((s) =>
                    s.ilustrasi ? (
                      <div key={s.id} className="grid gap-2 rounded-xl border p-3">
                        <img src={s.ilustrasi} alt={`Ilustrasi ${s.judul}`} className="w-full rounded-lg border" />
                        <p className="truncate text-sm font-medium">{s.judul}</p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              patchSection(s.id, { ilustrasi: buatIlustrasi(s.judul, s.poin, Date.now()) });
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

        <TabsContent value="ppt" className="mt-4 grid gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-base text-navy">Buat PPT Otomatis</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 pt-0">
              <p className="text-sm text-muted-foreground">
                Modul → AI membaca struktur → AI menyusun slide → AI menambahkan ilustrasi → pratinjau → unduh PPT.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={generatePpt} disabled={pptLoading}>
                  {pptLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Presentation className="h-4 w-4" />}
                  {pptLoading ? "AI sedang menyusun slide…" : "Generate PPT dengan Ilustrasi"}
                </Button>
                <Button variant="outline" disabled={modul.slides.length === 0} onClick={() => unduhPpt(modul)}>
                  <Download className="h-4 w-4" />
                  Unduh PPT
                </Button>
              </div>

              {modul.slides.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {modul.slides.map((slide, i) => (
                    <div key={slide.id} className="grid gap-2 rounded-xl border bg-card p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-display text-sm font-semibold text-navy">{slide.judul}</p>
                        <span className="shrink-0 text-xs text-muted-foreground">Slide {i + 1}</span>
                      </div>
                      {slide.ilustrasi ? (
                        <img src={slide.ilustrasi} alt="" className="h-28 w-full rounded-lg border object-cover" />
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

      <Dialog open={aiOpen} onOpenChange={aiLoading ? () => undefined : setAiOpen}>
        <DialogContent className="w-[min(28rem,calc(100vw-2rem))]">
          <DialogHeader>
            <DialogTitle className="font-display text-navy">Edit Modul dengan AI</DialogTitle>
            <DialogDescription>Tulis instruksi, AI akan merevisi isi modul.</DialogDescription>
          </DialogHeader>
          {aiLoading ? (
            <div className="grid place-items-center gap-3 py-10 text-center">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">GuruPro AI sedang merevisi modul…</p>
            </div>
          ) : (
            <div className="grid gap-3">
              <div className="flex flex-wrap gap-2">
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
                placeholder="Misal: tambah contoh kontekstual untuk siswa SMK"
              />
            </div>
          )}
          {!aiLoading ? (
            <DialogFooter>
              <Button variant="ghost" onClick={() => setAiOpen(false)}>
                Batal
              </Button>
              <Button onClick={runAiEdit}>
                <Sparkles className="h-4 w-4" />
                Terapkan Revisi AI
              </Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
