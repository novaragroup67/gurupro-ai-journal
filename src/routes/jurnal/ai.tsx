import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Loader2,
  Pencil,
  RefreshCw,
  Save,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { JournalDetail } from "@/components/journal-detail";
import { JournalForm, validateJournal, type JournalErrors } from "@/components/journal-form";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { generateJournal, type AiInput } from "@/lib/ai-generator";
import { takeAiHandoff } from "@/lib/ai-handoff";
import { addJournal } from "@/lib/journal-store";
import {
  KELAS,
  KONDISI_KELAS,
  MATA_PELAJARAN,
  METODE,
  type JournalDraft,
} from "@/lib/journal-types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/jurnal/ai")({
  head: () => ({
    meta: [
      { title: "AI Journal Generator — GuruPro" },
      {
        name: "description",
        content:
          "Masukkan materi yang Anda ajarkan, GuruPro AI menyusun jurnal mengajar lengkap secara otomatis.",
      },
      { property: "og:title", content: "AI Journal Generator — GuruPro" },
      {
        property: "og:description",
        content: "Guru fokus mengajar, GuruPro urus adminnya.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AiGeneratorPage,
});

type Step = "input" | "loading" | "preview";

const LOADING_STEPS = [
  "Membaca konteks materi Anda...",
  "Menyusun kegiatan pembelajaran...",
  "Menyiapkan penilaian dan refleksi...",
  "Merapikan hasil jurnal...",
];

function emptyInput(): AiInput {
  return {
    mataPelajaran: "",
    kelas: "",
    tanggal: new Date().toISOString().slice(0, 10),
    jam: "",
    materi: "",
    tujuan: "",
    metode: "",
    kondisiKelas: "",
    catatan: "",
  };
}

function AiGeneratorPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("input");
  const [input, setInput] = useState<AiInput>(emptyInput());
  const [inputErrors, setInputErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<JournalDraft | null>(null);
  const [editing, setEditing] = useState(false);
  const [editErrors, setEditErrors] = useState<JournalErrors>({});
  const [progress, setProgress] = useState(0);
  const [loadingLabel, setLoadingLabel] = useState(LOADING_STEPS[0] ?? "");

  useEffect(() => {
    const handoff = takeAiHandoff();
    if (handoff) setInput((prev) => ({ ...prev, ...handoff }));
  }, []);

  const setField = (patch: Partial<AiInput>) => {
    setInput((prev) => ({ ...prev, ...patch }));
    setInputErrors((prev) => {
      const next = { ...prev };
      Object.keys(patch).forEach((k) => delete next[k]);
      return next;
    });
  };

  const runGenerate = (source: AiInput) => {
    setStep("loading");
    setEditing(false);
    setProgress(8);
    setLoadingLabel(LOADING_STEPS[0] ?? "");

    let i = 0;
    const timer = window.setInterval(() => {
      i += 1;
      setProgress(Math.min(95, 8 + i * 22));
      setLoadingLabel(LOADING_STEPS[Math.min(i, LOADING_STEPS.length - 1)] ?? "");
      if (i >= LOADING_STEPS.length) {
        window.clearInterval(timer);
        setProgress(100);
        setResult(generateJournal(source, Date.now()));
        setStep("preview");
      }
    }, 550);
  };

  const handleGenerate = () => {
    const errors: Record<string, string> = {};
    if (!input.mataPelajaran) errors.mataPelajaran = "Mata pelajaran wajib dipilih.";
    if (!input.kelas) errors.kelas = "Kelas wajib dipilih.";
    if (!input.materi.trim()) errors.materi = "Materi wajib diisi agar hasil AI relevan.";
    setInputErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast.error("Lengkapi data agar GuruPro AI punya konteks yang cukup.");
      return;
    }
    runGenerate(input);
  };

  const handleSave = () => {
    if (!result) return;
    const found = validateJournal(result);
    setEditErrors(found);
    if (Object.keys(found).length > 0) {
      toast.error("Lengkapi dulu kolom wajib yang ditandai.");
      return;
    }
    addJournal({ ...result, source: "AI" });
    toast.success("Jurnal berhasil disimpan.");
    navigate({ to: "/jurnal" });
  };

  const invalid = (key: string) =>
    cn(inputErrors[key] && "border-destructive focus-visible:ring-destructive/30");

  return (
    <div className="grid gap-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link to="/jurnal">
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Jurnal
        </Link>
      </Button>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            AI Journal Generator
            <Badge className="gap-1 bg-accent text-accent-foreground hover:bg-accent">
              <Sparkles className="h-3 w-3" />
              Prototype
            </Badge>
          </span>
        }
        subtitle="Cukup masukkan materi yang Anda ajarkan hari ini, GuruPro AI menyusun jurnal lengkap mulai dari kegiatan hingga tindak lanjut."
      />

      {step === "input" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Konteks Pembelajaran</CardTitle>
            <CardDescription>
              Semakin lengkap datanya, semakin relevan jurnal yang dihasilkan.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>
                  Mata Pelajaran <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={input.mataPelajaran}
                  onValueChange={(v) => setField({ mataPelajaran: v })}
                >
                  <SelectTrigger className={cn("w-full", invalid("mataPelajaran"))}>
                    <SelectValue placeholder="Pilih mata pelajaran" />
                  </SelectTrigger>
                  <SelectContent>
                    {MATA_PELAJARAN.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {inputErrors.mataPelajaran ? (
                  <p className="text-xs font-medium text-destructive">{inputErrors.mataPelajaran}</p>
                ) : null}
              </div>

              <div className="grid gap-2">
                <Label>
                  Kelas <span className="text-destructive">*</span>
                </Label>
                <Select value={input.kelas} onValueChange={(v) => setField({ kelas: v })}>
                  <SelectTrigger className={cn("w-full", invalid("kelas"))}>
                    <SelectValue placeholder="Pilih kelas" />
                  </SelectTrigger>
                  <SelectContent>
                    {KELAS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {k}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {inputErrors.kelas ? (
                  <p className="text-xs font-medium text-destructive">{inputErrors.kelas}</p>
                ) : null}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="ai-tanggal">Tanggal</Label>
                <Input
                  id="ai-tanggal"
                  type="date"
                  value={input.tanggal}
                  onChange={(e) => setField({ tanggal: e.target.value })}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="ai-jam">Jam Pelajaran</Label>
                <Input
                  id="ai-jam"
                  placeholder="Contoh: 07:30 - 09:00"
                  value={input.jam}
                  onChange={(e) => setField({ jam: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ai-materi">
                Materi / Topik <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ai-materi"
                placeholder="Contoh: Konsep Database"
                value={input.materi}
                onChange={(e) => setField({ materi: e.target.value })}
                className={invalid("materi")}
              />
              {inputErrors.materi ? (
                <p className="text-xs font-medium text-destructive">{inputErrors.materi}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Contoh topik: Konsep Database, Subnetting, Flexbox, Statistika Dasar.
                </p>
              )}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Metode Pembelajaran (opsional)</Label>
                <Select value={input.metode} onValueChange={(v) => setField({ metode: v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Biarkan AI memilih" />
                  </SelectTrigger>
                  <SelectContent>
                    {METODE.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Kondisi Kelas (opsional)</Label>
                <Select
                  value={input.kondisiKelas}
                  onValueChange={(v) => setField({ kondisiKelas: v })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Biarkan AI memilih" />
                  </SelectTrigger>
                  <SelectContent>
                    {KONDISI_KELAS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {k}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ai-tujuan">Tujuan Pembelajaran (opsional)</Label>
              <Textarea
                id="ai-tujuan"
                rows={3}
                placeholder="Kosongkan jika ingin disusun otomatis oleh AI."
                value={input.tujuan}
                onChange={(e) => setField({ tujuan: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ai-catatan">Catatan Guru (opsional)</Label>
              <Textarea
                id="ai-catatan"
                rows={2}
                placeholder="Misal: 3 siswa izin lomba, LCD kelas rusak."
                value={input.catatan}
                onChange={(e) => setField({ catatan: e.target.value })}
              />
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
              <Button asChild variant="ghost">
                <Link to="/jurnal/create">Isi manual saja</Link>
              </Button>
              <Button size="lg" onClick={handleGenerate}>
                <Wand2 className="h-4 w-4" />
                Generate dengan AI
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === "loading" ? (
        <Card className="border-0 bg-brand-gradient">
          <CardContent className="flex flex-col items-center gap-4 px-6 py-16 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-navy-foreground/15">
              <Loader2 className="h-8 w-8 animate-spin text-navy-foreground" />
            </span>
            <div>
              <p className="font-display text-lg font-bold text-navy-foreground">
                GuruPro AI sedang menyusun jurnal...
              </p>
              <p className="mt-1 text-sm text-navy-foreground/80">{loadingLabel}</p>
            </div>
            <Progress value={progress} className="h-2 w-full max-w-sm bg-navy-foreground/20" />
            <p className="text-xs text-navy-foreground/70">
              Materi: {input.materi} · {input.mataPelajaran} · {input.kelas}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {step === "preview" && result ? (
        <div className="grid gap-5">
          <Card className="border-primary/25 bg-primary-soft/60">
            <CardContent className="grid gap-3 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-display font-semibold text-navy">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Jurnal berhasil disusun GuruPro AI
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Periksa hasilnya, sesuaikan bila perlu, lalu simpan ke daftar jurnal Anda.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                <Button variant="outline" onClick={() => setEditing((v) => !v)}>
                  <Pencil className="h-4 w-4" />
                  {editing ? "Lihat Pratinjau" : "Edit"}
                </Button>
                <Button variant="outline" onClick={() => runGenerate(input)}>
                  <RefreshCw className="h-4 w-4" />
                  Regenerate
                </Button>
                <Button onClick={handleSave}>
                  <Save className="h-4 w-4" />
                  Simpan Jurnal
                </Button>
              </div>
            </CardContent>
          </Card>

          {editing ? (
            <JournalForm
              draft={result}
              errors={editErrors}
              showAiSections
              onChange={(patch) => {
                setResult((prev) => (prev ? { ...prev, ...patch } : prev));
                setEditErrors((prev) => {
                  const next = { ...prev };
                  (Object.keys(patch) as Array<keyof JournalDraft>).forEach((k) => delete next[k]);
                  return next;
                });
              }}
            />
          ) : (
            <JournalDetail journal={result} />
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
            <Button variant="ghost" onClick={() => setStep("input")}>
              <ArrowLeft className="h-4 w-4" />
              Kembali
            </Button>
            <Button variant="outline" onClick={() => runGenerate(input)}>
              <RefreshCw className="h-4 w-4" />
              Regenerate
            </Button>
            <Button onClick={handleSave}>
              <Save className="h-4 w-4" />
              Simpan Jurnal
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
