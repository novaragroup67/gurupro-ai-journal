import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth-store";
import {
  ArrowLeft,
  Copy,
  FileQuestion,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

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
import { KELAS } from "@/lib/modul-types";
import { uid } from "@/lib/cloud-store";
import { INSTRUKSI_AI } from "@/lib/soal-ai";
import { generateSoalAi, reviseSoalAi } from "@/lib/ai.functions";
import { supabase } from "@/integrations/supabase/client";
import { isRecoverableAuthError, withAuthRetry } from "@/integrations/supabase/auth-token";
import {
  addPaket,
  deletePaket,
  duplicatePaket,
  publishPaket,
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
  const { kelasList } = useKelas();
  const myKelas = useMemo(() => {
    return kelasList.filter((k) => k.guruId === user?.id || k.guruId === profile?.id);
  }, [kelasList, user?.id, profile?.id]);
  const moduls = useModuls();
  const generateAi = useServerFn(generateSoalAi);
  const reviseAi = useServerFn(reviseSoalAi);
  const pakets = usePaketSoal();

  const [mode, setMode] = useState<Mode>("bank");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"semua" | "Draft" | "Terbit">("semua");

  // draft review state
  const [judul, setJudul] = useState("");
  const [topik, setTopik] = useState("");
  const [modulId, setModulId] = useState("");
  const [draftSoal, setDraftSoal] = useState<Soal[]>([]);
  const [paketId, setPaketId] = useState<string | null>(null);

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pakets.filter(
      (p) =>
        (statusFilter === "semua" || p.status === statusFilter) &&
        (!q || p.judul.toLowerCase().includes(q) || p.topik.toLowerCase().includes(q)),
    );
  }, [pakets, query, statusFilter]);

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
    setMPertanyaan("");
    setMKunci("");
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
      setJudul(judul.trim() || t);
      setDraftSoal(unik);
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
    };
    setDraftSoal((prev) => [...prev, soal]);
    setMPertanyaan("");
    setMKunci("");
    toast.success("Soal ditambahkan ke draf.");
  };

  const simpanKeBank = async (status: "Draft" | "Terbit") => {
    if (draftSoal.length === 0) {
      toast.error("Belum ada soal pada draf ini.");
      return;
    }
    const judulFinal = judul.trim() || topik.trim() || "Paket Soal Baru";
    try {
      if (paketId) {
        await updatePaket(paketId, {
          judul: judulFinal,
          topik: topik.trim() || judulFinal,
          soal: draftSoal,
          status,
        });
      } else {
        const created = await addPaket({
          judul: judulFinal,
          topik: topik.trim() || judulFinal,
          modulId: modulId || undefined,
          status,
          kelas: [],
          soal: draftSoal,
        });
        setPaketId(created.id);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menyimpan ke Bank Soal.");
      return;
    }
    toast.success(
      status === "Terbit" ? "Soal berhasil diterbitkan." : "Soal disimpan ke Bank Soal.",
    );
    if (status === "Terbit") {
      resetDraft();
      setMode("bank");
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
      const revised = await withAuthRetry(
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
                ) : (\n                  <>\n                    <div className=\"grid gap-4 sm:grid-cols-2\">\n                      <div className=\"grid gap-2\">\n                        <Label>Pilih Modul Sumber (opsional)</Label>\n                        <Select value={modulId} onValueChange={setModulId}>\n                          <SelectTrigger>\n                            <SelectValue placeholder=\"Tanpa modul sumber\" />\n                          </SelectTrigger>\n                          <SelectContent>\n                            {moduls.map((m) => (\n                              <SelectItem key={m.id} value={m.id}>\n                                {m.judul}\n                              </SelectItem>\n                            ))}\n                          </SelectContent>\n                        </Select>\n                      </div>\n                      <div className=\"grid gap-2\">\n                        <Label htmlFor=\"topik\">Topik / Materi</Label>\n                        <Input\n                          id=\"topik\"\n                          value={topik}\n                          onChange={(e) => setTopik(e.target.value)}\n                          placeholder=\"Misal: Turunan Fungsi Aljabar\"\n                        />\n                      </div>\n                      <div className=\"grid gap-2\">\n                        <Label htmlFor=\"jumlah\">Jumlah Soal</Label>\n                        <Input\n                          id=\"jumlah\"\n                          type=\"number\"\n                          min={1}\n                          max={20}\n                          value={jumlah}\n                          onChange={(e) => setJumlah(e.target.value)}\n                        />\n                      </div>\n                      <div className=\"grid gap-2\">\n                        <Label>Tingkat Kesulitan</Label>\n                        <Select value={tingkat} onValueChange={(v) => setTingkat(v as Tingkat)}>\n                          <SelectTrigger>\n                            <SelectValue />\n                          </SelectTrigger>\n                          <SelectContent>\n                            {TINGKAT.map((t) => (\n                              <SelectItem key={t} value={t}>\n                                {t}\n                              </SelectItem>\n                            ))}\n                          </SelectContent>\n                        </Select>\n                      </div>\n                      <div className=\"grid gap-2\">\n                        <Label>Jenis Soal</Label>\n                        <Select value={jenis} onValueChange={(v) => setJenis(v as JenisSoal)}>\n                          <SelectTrigger>\n                            <SelectValue />\n                          </SelectTrigger>\n                          <SelectContent>\n                            {JENIS_SOAL.map((j) => (\n                              <SelectItem key={j} value={j}>\n                                {j}\n                              </SelectItem>\n                            ))}\n                          </SelectContent>\n                        </Select>\n                      </div>\n                    </div>\n                    <div className=\"flex flex-wrap justify-end gap-2 border-t pt-4\">\n                      <Button onClick={runGenerate}>\n                        <Sparkles className=\"h-4 w-4\" />\n                        Buatkan Soal dengan AI\n                      </Button>\n                    </div>\n                  </>\n                )}\n              </CardContent>\n            </Card>\n          </TabsContent>\n\n          <TabsContent value=\"manual\" className=\"mt-4 grid gap-4\">\n            <Card>\n              <CardContent className=\"grid gap-4 p-5\">\n                <div className=\"grid gap-2\">\n                  <Label htmlFor=\"pertanyaan\">Pertanyaan</Label>\n                  <Textarea\n                    id=\"pertanyaan\"\n                    rows={3}\n                    value={mPertanyaan}\n                    onChange={(e) => setMPertanyaan(e.target.value)}\n                    placeholder=\"Tulis pertanyaan…\"\n                  />\n                </div>\n                <div className=\"grid gap-4 sm:grid-cols-2\">\n                  <div className=\"grid gap-2\">\n                    <Label>Jenis Soal</Label>\n                    <Select value={mJenis} onValueChange={(v) => setMJenis(v as JenisSoal)}>\n                      <SelectTrigger>\n                        <SelectValue />\n                      </SelectTrigger>\n                      <SelectContent>\n                        {JENIS_SOAL.map((j) => (\n                          <SelectItem key={j} value={j}>\n                            {j}\n                          </SelectItem>\n                        ))}\n                      </SelectContent>\n                    </Select>\n                  </div>\n                  <div className=\"grid gap-2\">\n                    <Label htmlFor=\"kunci\">Kunci Jawaban</Label>\n                    <Input\n                      id=\"kunci\"\n                      value={mKunci}\n                      onChange={(e) => setMKunci(e.target.value)}\n                      placeholder={mJenis === \"Pilihan Ganda\" ? \"Misal: A\" : \"Poin jawaban ideal\"}\n                    />\n                  </div>\n                </div>\n                <div className=\"flex flex-wrap justify-end gap-2 border-t pt-4\">\n                  <Button variant=\"outline\" onClick={addManual}>\n                    <Plus className=\"h-4 w-4\" />\n                    Tambah ke Draf\n                  </Button>\n                  <Button disabled={draftSoal.length === 0} onClick={() => setMode(\"review\")}>\n                    Tinjau Draf ({draftSoal.length})\n                  </Button>\n                </div>\n              </CardContent>\n            </Card>\n          </TabsContent>\n        </Tabs>\n      </div>\n    );\n  }\n\n  if (mode === \"review\") {\n    return (\n      <div className=\"grid gap-5\">\n        <Button variant=\"ghost\" size=\"sm\" className=\"-ml-2 w-fit\" onClick={() => setMode(\"buat\")}>\n          <ArrowLeft className=\"h-4 w-4\" />\n          Kembali ke Form Soal\n        </Button>\n\n        <PageHeader\n          title=\"Hasil Draf Soal\"\n          subtitle={`${draftSoal.length} soal — ${topik || judul}. Tinjau, edit manual atau dengan AI, lalu simpan.`}\n          actions={\n            <>\n              <Button variant=\"outline\" onClick={runGenerate}>\n                <RefreshCw className=\"h-4 w-4\" />\n                Regenerasi\n              </Button>\n              <Button variant=\"secondary\" onClick={() => simpanKeBank(\"Draft\")}>\n                <Save className=\"h-4 w-4\" />\n                Simpan ke Bank Soal\n              </Button>\n              <Button onClick={() => simpanKeBank(\"Terbit\")}>\n                <Send className=\"h-4 w-4\" />\n                Publikasikan Soal\n              </Button>\n            </>\n          }\n        />\n\n        {draftSoal.map((s, i) => (\n          <Card key={s.id}>\n            <CardHeader className=\"flex-row items-start justify-between gap-3 space-y-0 pb-3\">\n              <CardTitle className=\"font-display text-base text-navy\">Soal {i + 1}</CardTitle>\n              <div className=\"flex flex-wrap gap-2\">\n                <Badge variant=\"secondary\">{s.jenis}</Badge>\n                <Button\n                  size=\"sm\"\n                  variant={editId === s.id ? \"secondary\" : \"outline\"}\n                  onClick={() => setEditId(editId === s.id ? null : s.id)}\n                >\n                  {editId === s.id ? <X className=\"h-4 w-4\" /> : <Pencil className=\"h-4 w-4\" />}\n                  {editId === s.id ? \"Selesai\" : \"Edit Manual\"}\n                </Button>\n                <Button size=\"sm\" variant=\"outline\" onClick={() => setAiTarget(s)}>\n                  <Sparkles className=\"h-4 w-4\" />\n                  Edit dengan AI\n                </Button>\n                <Button\n                  size=\"sm\"\n                  variant=\"ghost\"\n                  className=\"text-destructive hover:bg-destructive/10 hover:text-destructive\"\n                  onClick={() => setDraftSoal((prev) => prev.filter((x) => x.id !== s.id))}\n                >\n                  <Trash2 className=\"h-4 w-4\" />\n                </Button>\n              </div>\n            </CardHeader>\n            <CardContent className=\"grid gap-3 pt-0\">\n              {editId === s.id ? (\n                <>\n                  <Textarea\n                    rows={3}\n                    value={s.pertanyaan}\n                    onChange={(e) =>\n                      setDraftSoal((prev) =>\n                        prev.map((x) => (x.id === s.id ? { ...x, pertanyaan: e.target.value } : x)),\n                      )\n                    }\n                  />\n                  {s.opsi.length > 0 ? (\n                    <div className=\"grid gap-2\">\n                      {s.opsi.map((o, oi) => (\n                        <Input\n                          key={oi}\n                          value={o}\n                          onChange={(e) =>\n                            setDraftSoal((prev) =>\n                              prev.map((x) =>\n                                x.id === s.id\n                                  ? {\n                                      ...x,\n                                      opsi: x.opsi.map((v, vi) => (vi === oi ? e.target.value : v)),\n                                    }\n                                  : x,\n                              ),\n                            )\n                          }\n                        />\n                      ))}\n                    </div>\n                  ) : null}\n                  <div className=\"grid gap-2\">\n                    <Label>Kunci Jawaban</Label>\n                    <Input\n                      value={s.kunci}\n                      onChange={(e) =>\n                        setDraftSoal((prev) =>\n                          prev.map((x) => (x.id === s.id ? { ...x, kunci: e.target.value } : x)),\n                        )\n                      }\n                    />\n                  </div>\n                </>\n              ) : (\n                <>\n                  <p className=\"text-sm font-medium\">{s.pertanyaan}</p>\n                  {s.opsi.length > 0 ? (\n                    <ol className=\"grid gap-1 text-sm text-muted-foreground\">\n                      {s.opsi.map((o, oi) => (\n                        <li key={oi}>\n                          {String.fromCharCode(65 + oi)}. {o}\n                        </li>\n                      ))}\n                    </ol>\n                  ) : null}\n                  <p className=\"rounded-lg bg-primary-soft px-3 py-2 text-xs text-primary\">\n                    Kunci: {s.kunci}\n                  </p>\n                </>\n              )}\n            </CardContent>\n          </Card>\n        ))}\n\n        <Dialog\n          open={aiTarget !== null}\n          onOpenChange={(o) => !o && !aiLoading && setAiTarget(null)}\n        >\n          <DialogContent className=\"max-h-[90dvh] w-[calc(100vw-2rem)] sm:max-w-md overflow-y-auto overflow-x-hidden p-4 sm:p-6\">\n            <DialogHeader className=\"min-w-0\">\n              <DialogTitle className=\"font-display text-navy break-words\">\n                Edit Soal dengan AI\n              </DialogTitle>\n              <DialogDescription className=\"break-words\">\n                Pilih atau tulis instruksi revisi untuk soal ini.\n              </DialogDescription>\n            </DialogHeader>\n            {aiLoading ? (\n              <div className=\"grid place-items-center gap-3 py-10 text-center min-w-0 px-2\">\n                <Loader2 className=\"h-7 w-7 animate-spin text-primary\" />\n                <p className=\"text-sm text-muted-foreground break-words\">\n                  GuruPro AI sedang merevisi soal…\n                </p>\n              </div>\n            ) : (\n              <div className=\"grid gap-3 min-w-0\">\n                <div className=\"flex flex-wrap gap-2 min-w-0\">\n                  {INSTRUKSI_AI.map((i) => (\n                    <Button\n                      key={i}\n                      size=\"sm\"\n                      variant={instruksi === i ? \"secondary\" : \"outline\"}\n                      onClick={() => setInstruksi(i)}\n                    >\n                      {i}\n                    </Button>\n                  ))}\n                </div>\n                <Textarea\n                  rows={2}\n                  value={instruksi}\n                  onChange={(e) => setInstruksi(e.target.value)}\n                  placeholder=\"Misal: buat lebih sulit\"\n                  className=\"min-w-0 max-w-full break-words\"\n                />\n              </div>\n            )}\n            {!aiLoading ? (\n              <DialogFooter className=\"flex flex-col-reverse sm:flex-row sm:justify-end gap-2 w-full pt-2\">\n                <Button\n                  variant=\"ghost\"\n                  onClick={() => setAiTarget(null)}\n                  className=\"w-full sm:w-auto\"\n                >\n                  Batal\n                </Button>\n                <Button onClick={applyAiRevisi} className=\"w-full sm:w-auto\">\n                  <Sparkles className=\"h-4 w-4\" />\n                  Terapkan Revisi\n                </Button>\n              </DialogFooter>\n            ) : null}\n          </DialogContent>\n        </Dialog>\n      </div>\n    );\n  }\n\n  return (\n    <div className=\"grid gap-6\">\n      <PageHeader\n        title=\"Bank Soal\"\n        subtitle=\"Soal disimpan sebagai konten umum. Kelas dipilih saat Anda menerbitkannya sebagai tugas.\"\n        actions={\n          <Button\n            onClick={() => {\n              resetDraft();\n              setMode(\"buat\");\n            }}\n          >\n            <Plus className=\"h-4 w-4\" />\n            Buat Soal\n          </Button>\n        }\n      />\n\n      <div className=\"grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center\">\n        <div className=\"relative sm:max-w-xs\">\n          <Search className=\"absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground\" />\n          <Input\n            value={query}\n            onChange={(e) => setQuery(e.target.value)}\n            placeholder=\"Cari judul atau topik soal…\"\n            className=\"pl-9\"\n            aria-label=\"Cari soal\"\n          />\n        </div>\n        <Select\n          value={statusFilter}\n          onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}\n        >\n          <SelectTrigger className=\"sm:w-44\">\n            <SelectValue />\n          </SelectTrigger>\n          <SelectContent>\n            <SelectItem value=\"semua\">Semua status</SelectItem>\n            <SelectItem value=\"Draft\">Draft</SelectItem>\n            <SelectItem value=\"Terbit\">Terbit</SelectItem>\n          </SelectContent>\n        </Select>\n      </div>\n\n      {filtered.length === 0 ? (\n        <Card className=\"border-dashed\">\n          <CardContent className=\"flex flex-col items-center gap-3 py-14 text-center\">\n            <span className=\"grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft text-primary\">\n              <FileQuestion className=\"h-7 w-7\" />\n            </span>\n            <p className=\"font-display font-semibold text-navy\">Bank soal masih kosong</p>\n            <p className=\"max-w-sm text-sm text-muted-foreground\">\n              Buat soal manual atau minta GuruPro AI menyusun soal dari modul ajar Anda.\n            </p>\n            <Button\n              onClick={() => {\n                resetDraft();\n                setMode(\"buat\");\n              }}\n            >\n              <Sparkles className=\"h-4 w-4\" />\n              Buat Soal\n            </Button>\n          </CardContent>\n        </Card>\n      ) : (\n        <>\n          {/* Mobile cards */}\n          <div className=\"grid gap-3 md:hidden\">\n            {filtered.map((p) => (\n              <Card key={p.id}>\n                <CardContent className=\"grid gap-3 p-4\">\n                  <div className=\"flex items-start justify-between gap-2\">\n                    <div className=\"min-w-0\">\n                      <p className=\"truncate font-display font-semibold text-navy\">{p.judul}</p>\n                      <p className=\"truncate text-xs text-muted-foreground\">{p.topik}</p>\n                    </div>\n                    <Badge\n                      variant=\"secondary\"\n                      className={p.status === \"Terbit\" ? \"bg-primary-soft text-primary\" : \"\"}\n                    >\n                      {p.status}\n                    </Badge>\n                  </div>\n                  <p className=\"text-xs text-muted-foreground\">\n                    {p.soal.length} soal · Kelas: {p.kelas.length ? p.kelas.join(\", \") : \"—\"}\n                  </p>\n                  <PaketActions\n                    paket={p}\n                    onOpen={() => {\n                      setJudul(p.judul);\n                      setTopik(p.topik);\n                      setModulId(p.modulId ?? \"\");\n                      setDraftSoal(p.soal);\n                      setPaketId(p.id);\n                      setMode(\"review\");\n                    }}\n                    onTerbitTugas={() => {\n                      setTerbitTarget(p);\n                      setKelasPilihan(p.kelas);\n                    }}\n                    onHapus={() => setHapus(p)}\n                  />\n                </CardContent>\n              </Card>\n            ))}\n          </div>\n\n          {/* Desktop table */}\n          <Card className=\"hidden md:block\">\n            <CardContent className=\"p-0\">\n              <Table>\n                <TableHeader>\n                  <TableRow>\n                    <TableHead>Judul / Topik</TableHead>\n                    <TableHead>Dipakai di Kelas</TableHead>\n                    <TableHead>Jumlah</TableHead>\n                    <TableHead>Status</TableHead>\n                    <TableHead className=\"text-right\">Aksi</TableHead>\n                  </TableRow>\n                </TableHeader>\n                <TableBody>\n                  {filtered.map((p) => (\n                    <TableRow key={p.id}>\n                      <TableCell className=\"max-w-[18rem]\">\n                        <span className=\"block truncate font-medium\">{p.judul}</span>\n                        <span className=\"block truncate text-xs text-muted-foreground\">\n                          {p.topik}\n                        </span>\n                      </TableCell>\n                      <TableCell className=\"text-sm text-muted-foreground\">\n                        {p.kelas.length ? p.kelas.join(\", \") : \"—\"}\n                      </TableCell>\n                      <TableCell>{p.soal.length}</TableCell>\n                      <TableCell>\n                        <Badge\n                          variant=\"secondary\"\n                          className={p.status === \"Terbit\" ? \"bg-primary-soft text-primary\" : \"\"}\n                        >\n                          {p.status}\n                        </Badge>\n                      </TableCell>\n                      <TableCell>\n                        <PaketActions\n                          align=\"end\"\n                          paket={p}\n                          onOpen={() => {\n                            setJudul(p.judul);\n                            setTopik(p.topik);\n                            setModulId(p.modulId ?? \"\");\n                            setDraftSoal(p.soal);\n                            setPaketId(p.id);\n                            setMode(\"review\");\n                          }}\n                          onTerbitTugas={() => {\n                            setTerbitTarget(p);\n                            setKelasPilihan(p.kelas);\n                          }}\n                          onHapus={() => setHapus(p)}\n                        />\n                      </TableCell>\n                    </TableRow>\n                  ))}\n                </TableBody>\n              </Table>\n            </CardContent>\n          </Card>\n        </>\n      )}\n\n      <Dialog open={terbitTarget !== null} onOpenChange={(o) => !o && setTerbitTarget(null)}>\n        <DialogContent className=\"max-h-[90dvh] w-[calc(100vw-2rem)] sm:max-w-md overflow-y-auto overflow-x-hidden p-4 sm:p-6\">\n          <DialogHeader className=\"min-w-0\">\n            <DialogTitle className=\"font-display text-navy break-words\">\n              Terbitkan sebagai Tugas\n            </DialogTitle>\n            <DialogDescription className=\"break-words\">\n              Pilih kelas tujuan untuk paket soal &ldquo;{terbitTarget?.judul}&rdquo;.\n            </DialogDescription>\n          </DialogHeader>\n          <div className=\"grid gap-2 min-w-0\">\n            {myKelas.length > 0 ? (\n              myKelas.map((k) => {\n                const labelKelas = `${k.tingkat} ${k.namaKelas}`;\n                return (\n                  <label\n                    key={k.id}\n                    className=\"flex items-center gap-3 rounded-lg border p-3 text-sm min-w-0 cursor-pointer hover:bg-muted/50\"\n                  >\n                    <Checkbox\n                      checked={kelasPilihan.includes(labelKelas)}\n                      onCheckedChange={(v) =>\n                        setKelasPilihan((prev) =>\n                          v ? [...prev, labelKelas] : prev.filter((x) => x !== labelKelas),\n                        )\n                      }\n                    />\n                    <span className=\"truncate font-medium\">{labelKelas}</span>\n                    {k.mapel ? (\n                      <span className=\"text-xs text-muted-foreground ml-auto\">{k.mapel}</span>\n                    ) : null}\n                  </label>\n                );\n              })\n            ) : (\n              <p className=\"text-xs text-muted-foreground p-3 border rounded-lg\">\n                Anda belum memiliki kelas. Buat kelas di menu Kelas Saya terlebih dahulu.\n              </p>\n            )}\n          </div>\n          <DialogFooter className=\"flex flex-col-reverse sm:flex-row sm:justify-end gap-2 w-full pt-2\">\n            <Button\n              variant=\"ghost\"\n              onClick={() => setTerbitTarget(null)}\n              className=\"w-full sm:w-auto\"\n            >\n              Batal\n            </Button>\n            <Button\n              onClick={() => {\n                if (kelasPilihan.length === 0) {\n                  toast.error(\"Pilih minimal satu kelas.\");\n                  return;\n                }\n                if (terbitTarget) void terbitkanSebagaiTugas(terbitTarget.id, kelasPilihan);\n                setTerbitTarget(null);\n                toast.success(\"Soal diterbitkan sebagai tugas.\");\n              }}\n              className=\"w-full sm:w-auto\"\n            >\n              <Send className=\"h-4 w-4\" />\n              Terbitkan\n            </Button>\n          </DialogFooter>\n        </DialogContent>\n      </Dialog>\n\n      <AlertDialog open={hapus !== null} onOpenChange={(o) => !o && setHapus(null)}>\n        <AlertDialogContent>\n          <AlertDialogHeader>\n            <AlertDialogTitle>Hapus paket soal ini?</AlertDialogTitle>\n            <AlertDialogDescription>\n              &ldquo;{hapus?.judul}&rdquo; beserta {hapus?.soal.length} soal akan dihapus permanen.\n            </AlertDialogDescription>\n          </AlertDialogHeader>\n          <AlertDialogFooter>\n            <AlertDialogCancel>Batal</AlertDialogCancel>\n            <AlertDialogAction\n              className=\"bg-destructive text-destructive-foreground hover:bg-destructive/90\"\n              onClick={() => {\n                if (hapus) void deletePaket(hapus.id);\n                setHapus(null);\n                toast.success(\"Paket soal dihapus.\");\n              }}\n            >\n              Hapus\n            </AlertDialogAction>\n          </AlertDialogFooter>\n        </AlertDialogContent>\n      </AlertDialog>\n    </div>\n  );\n}\n\nfunction PaketActions({\n  paket,\n  onOpen,\n  onTerbitTugas,\n  onHapus,\n  align = \"start\",\n}: {\n  paket: PaketSoal;\n  onOpen: () => void;\n  onTerbitTugas: () => void;\n  onHapus: () => void;\n  align?: \"start\" | \"end\";\n}) {\n  return (\n    <div className={`flex flex-wrap gap-2 ${align === \"end\" ? \"justify-end\" : \"\"}`}>\n      <Button size=\"sm\" variant=\"outline\" onClick={onOpen}>\n        <Pencil className=\"h-4 w-4\" />\n        Tinjau\n      </Button>\n      {paket.status === \"Draft\" ? (\n        <Button\n          size=\"sm\"\n          variant=\"secondary\"\n          onClick={() => {\n            void publishPaket(paket.id);\n            toast.success(\"Soal berhasil diterbitkan.\");\n          }}\n        >\n          <Send className=\"h-4 w-4\" />\n          Terbitkan\n        </Button>\n      ) : (\n        <Button size=\"sm\" variant=\"secondary\" onClick={onTerbitTugas}>\n          <Send className=\"h-4 w-4\" />\n          Terbitkan sebagai Tugas\n        </Button>\n      )}\n      <Button\n        size=\"sm\"\n        variant=\"ghost\"\n        aria-label=\"Duplikat paket soal\"\n        onClick={() => {\n          void duplicatePaket(paket.id);\n          toast.success(\"Paket soal diduplikasi sebagai draft.\");\n        }}\n      >\n        <Copy className=\"h-4 w-4\" />\n      </Button>\n      <Button\n        size=\"sm\"\n        variant=\"ghost\"\n        aria-label=\"Hapus paket soal\"\n        className=\"text-destructive hover:bg-destructive/10 hover:text-destructive\"\n        onClick={onHapus}\n      >\n        <Trash2 className=\"h-4 w-4\" />\n      </Button>\n    </div>\n  );\n}\n