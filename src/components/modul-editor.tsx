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
import { buatIlustrasi, buatSlides } from "@/lib/modul-ai";
import type { Modul } from "@/lib/modul-types";
import { useServerFn } from "@tanstack/react-start";
import { editModulAi, generateModulAi } from "@/lib/ai.functions";
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
  onSaveDraft: () => void;
  onPublish: () => void;
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

  const editAi = useServerFn(editModulAi);
  const generateAi = useServerFn(generateModulAi);

  const punyaIlustrasi = modul.sections.some((s) => s.ilustrasi);

  const patchSection = (id: string, patch: Partial<Modul["sections"][number]>) =>
    onChange({
      ...modul,
      sections: modul.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });

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
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" className="-ml-2 w-fit" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            Kembali ke Daftar Modul
          </Button>
          <h1 className="mt-1 font-display text-xl font-bold text-navy sm:text-2xl">
            {modul.judul}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge
              variant="secondary"
              className={modul.status === "Terbit" ? "bg-primary-soft text-primary" : ""}
            >
              {modul.status === "Terbit" ? "Dipublikasikan" : "Draft"}
            </Badge>
            <span>
              {[modul.mapel, modul.kelas].filter(Boolean).join(" · ") || "Belum ada kelas"}
            </span>
            <span>· Sumber: {modul.sumberTipe}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button
            variant={manual ? "secondary" : "outline"}
            size="sm"
            onClick={() => setManual((v) => !v)}
          >
            {manual ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
            {manual ? "Selesai Edit" : "Edit Manual"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAiOpen(true)}>
            <Sparkles className="h-4 w-4" />
            Edit dengan AI
          </Button>
          <Button variant="outline" size="sm" onClick={() => setRegenerateOpen(true)}>
            <RefreshCw className="h-4 w-4" />
            Regenerasi
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

      {modul.sumberUrl || modul.sumberJudul ? (\n        <Card className="bg-muted/30 border-muted">
          <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs text-muted-foreground">
            <div className="min-w-0 flex-1 truncate">
              <span className="font-semibold text-foreground">Sumber Rujukan: </span>
              <span>{modul.sumberJudul || modul.sumberTipe}</span>
              {modul.sumberUrl ? (
                <a
                  href={modul.sumberUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="ml-2 underline text-primary truncate hover:opacity-80 break-all"
                >
                  {modul.sumberUrl}
                </a>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

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
                    <Input
                      id="judul"
                      value={modul.judul}
                      onChange={(e) => onChange({ ...modul, judul: e.target.value })}
                    />
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
                <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {modul.ringkasan}
                </p>
              )}
            </CardContent>
          </Card>

          {modul.sections.map((s, i) => (
            <Card key={s.id}>
              <CardHeader className="pb-3">
                {manual ? (
                  <Input
                    value={s.judul}
                    onChange={(e) => patchSection(s.id, { judul: e.target.value })}
                  />
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
                          patchSection(s.id, {
                            poin: e.target.value.split("\n").filter((p) => p.trim() !== ""),
                          })
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Isi Modul</Label>
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
                  onClick={() => unduhPdf(modul, true)}
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
    </div>
  );
}
