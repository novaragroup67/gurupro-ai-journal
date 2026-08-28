import { createFileRoute } from "@tanstack/react-router";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { KELAS } from "@/lib/modul-types";
import { uid } from "@/lib/local-store";
import { INSTRUKSI_AI, generateSoal, reviseSoalWithAi } from "@/lib/soal-ai";
import {
  addPaket,
  deletePaket,
  duplicatePaket,
  publishPaket,
  terbitkanSebagaiTugas,
  updatePaket,
  usePaketSoal,
} from "@/lib/soal-store";
import { JENIS_SOAL, TINGKAT, type JenisSoal, type PaketSoal, type Soal, type Tingkat } from "@/lib/soal-types";

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
        content: "Buat soal manual atau dibantu AI, simpan ke bank soal, lalu terbitkan sebagai tugas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SoalPage;
});

type Mode = "bank" | "buat" | "review";

function SoalPage() {
  const moduls = useModuls();
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

  const resetDraft = () => {
    setJudul("");
    setTopik("");
    setModulId("");
    setDraftSoal([]);
    setPaketId(null);
    setMPertanyaan("");
    setMKunci("");
  };

  const runGenerate = () => {
    const modul = moduls.find((m) => m.id === modulId);
    const t = topik.trim() || modul?.judul.replace(/^Modul Ajar:\s*/, "") || "";
    if (!t) {
      toast.error("Pilih modul sumber atau tulis topik/materi terlebih dahulu.");
      return;
    }
    setLoading(true);
    setTimeout(() => {
      const hasil = generateSoal({
        topik: t,
        jumlah: Number(jumlah) || 5,
        tingkat,
        jenis,
        ...(modul ? { konteks: modul.judul } : {}),
      });
      setTopik(t);
      setJudul(judul.trim() || t);
      setDraftSoal(hasil);
      setLoading(false);
      setMode("review");
      toast.success(`${hasil.length} soal berhasil dibuat GuruPro AI.`);
    }, 1500);
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

  const simpanKeBank = (status: "Draft" | "Terbit") => {
    if (draftSoal.length === 0) {
      toast.error("Belum ada soal pada draf ini.");
      return;
    }
    const judulFinal = judul.trim() || topik.trim() || "Paket Soal Baru";
    if (paketId) {
      updatePaket(paketId, { judul: judulFinal, topik: topik.trim() || judulFinal, soal: draftSoal, status });
    } else {
      const created = addPaket({
        judul: judulFinal,
        topik: topik.trim() || judulFinal,
        modulId: modulId || undefined,
        status,
        kelas: [],
        soal: draftSoal,
      });
      setPaketId(created.id);
    }
    toast.success(status === "Terbit" ? "Soal berhasil diterbitkan." : "Soal disimpan ke Bank Soal.");
    if (status === "Terbit") {
      resetDraft();
      setMode("bank");
    }
  };

  const applyAiRevisi = () => {
    if (!aiTarget || !instruksi.trim()) {
      toast.error("Pilih instruksi revisi terlebih dahulu.");
      return;
    }
    setAiLoading(true);
    setTimeout(() => {
      const revised = reviseSoalWithAi(aiTarget, instruksi);
      setDraftSoal((prev) => prev.map((s) => (s.id === aiTarget.id ? revised : s)));
      setAiLoading(false);
      setAiTarget(null);
      setInstruksi("");
      toast.success("Soal direvisi AI.");
    }, 1100);
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
                            {moduls.map((m) => (
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
        <Button variant="ghost" size="sm" className="-ml-2 w-fit" onClick={() => setMode("buat")}>
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Form Soal
        </Button>

        <PageHeader
          title="Hasil Draf Soal"
          subtitle={`${draftSoal.length} soal — ${topik || judul}. Tinjau, edit manual atau dengan AI, lalu simpan.`}
          actions={
            <>
              <Button variant="outline" onClick={runGenerate}>
                <RefreshCw className="h-4 w-4" />
                Regenerasi
              </Button>
              <Button variant="secondary" onClick={() => simpanKeBank("Draft")}>
                <Save className="h-4 w-4" />
                Simpan ke Bank Soal
              </Button>
              <Button onClick={() => simpanKeBank("Terbit")}>
                <Send className="h-4 w-4" />
                Publikasikan Soal
              </Button>
            </>
          }
        />

        {draftSoal.map((s, i) => (
          <Card key={s.id}>
            <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
              <CardTitle className="font-display text-base text-navy">Soal {i + 1}</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{s.jenis}</Badge>
                <Button
                  size="sm"
                  variant={editId === s.id ? "secondary" : "outline"}
                  onClick={() => setEditId(editId === s.id ? null : s.id)}
                >
                  {editId === s.id ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                  {editId === s.id ? "Selesai" : "Edit Manual"}
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
              {editId === s.id ? (
                <>
                  <Textarea
                    rows={3}
                    value={s.pertanyaan}
                    onChange={(e) =>
                      setDraftSoal((prev) =>
                        prev.map((x) => (x.id === s.id ? { ...x, pertanyaan: e.target.value } : x)),
                      )
                    }
                  />
                  {s.opsi.length > 0 ? (
                    <div className="grid gap-2">
                      {s.opsi.map((o, oi) => (
                        <Input
                          key={oi}
                          value={o}
                          onChange={(e) =>
                            setDraftSoal((prev) =>
                              prev.map((x) =>
                                x.id === s.id
                                  ? { ...x, opsi: x.opsi.map((v, vi) => (vi === oi ? e.target.value : v)) }
                                  : x,
                              ),
                            )
                          }
                        />
                      ))}
                    </div>
                  ) : null}
                  <div className="grid gap-2">
                    <Label>Kunci Jawaban</Label>
                    <Input
                      value={s.kunci}
                      onChange={(e) =>
                        setDraftSoal((prev) => prev.map((x) => (x.id === s.id ? { ...x, kunci: e.target.value } : x)))
                      }
                    />
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">{s.pertanyaan}</p>
                  {s.opsi.length > 0 ? (
                    <ol className="grid gap-1 text-sm text-muted-foreground">
                      {s.opsi.map((o, oi) => (
                        <li key={oi}>
                          {String.fromCharCode(65 + oi)}. {o}
                        </li>
                      ))}
                    </ol>
                  ) : null}
                  <p className="rounded-lg bg-primary-soft px-3 py-2 text-xs text-primary">
                    Kunci: {s.kunci}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        ))}

        <Dialog open={aiTarget !== null} onOpenChange={(o) => !o && !aiLoading && setAiTarget(null)}>
          <DialogContent className="w-[min(28rem,calc(100vw-2rem))]">
            <DialogHeader>
              <DialogTitle className="font-display text-navy">Edit Soal dengan AI</DialogTitle>
              <DialogDescription>Pilih atau tulis instruksi revisi untuk soal ini.</DialogDescription>
            </DialogHeader>
            {aiLoading ? (
              <div className="grid place-items-center gap-3 py-10 text-center">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">GuruPro AI sedang merevisi soal…</p>
              </div>
            ) : (
              <div className="grid gap-3">
                <div className="flex flex-wrap gap-2">
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
                />
              </div>
            )}
            {!aiLoading ? (
              <DialogFooter>
                <Button variant="ghost" onClick={() => setAiTarget(null)}>
                  Batal
                </Button>
                <Button onClick={applyAiRevisi}>
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
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
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
                    onOpen={() => {
                      setJudul(p.judul);
                      setTopik(p.topik);
                      setModulId(p.modulId ?? "");
                      setDraftSoal(p.soal);
                      setPaketId(p.id);
                      setMode("review");
                    }}
                    onTerbitTugas={() => {
                      setTerbitTarget(p);
                      setKelasPilihan(p.kelas);
                    }}
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
                        <span className="block truncate text-xs text-muted-foreground">{p.topik}</span>
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
                          onOpen={() => {
                            setJudul(p.judul);
                            setTopik(p.topik);
                            setModulId(p.modulId ?? "");
                            setDraftSoal(p.soal);
                            setPaketId(p.id);
                            setMode("review");
                          }}
                          onTerbitTugas={() => {
                            setTerbitTarget(p);
                            setKelasPilihan(p.kelas);
                          }}
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
        <DialogContent className="w-[min(28rem,calc(100vw-2rem))]">
          <DialogHeader>
            <DialogTitle className="font-display text-navy">Terbitkan sebagai Tugas</DialogTitle>
            <DialogDescription>
              Pilih kelas tujuan untuk paket soal &ldquo;{terbitTarget?.judul}&rdquo;.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {KELAS.map((k) => (
              <label key={k} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                <Checkbox
                  checked={kelasPilihan.includes(k)}
                  onCheckedChange={(v) =>
                    setKelasPilihan((prev) => (v ? [...prev, k] : prev.filter((x) => x !== k)))
                  }
                />
                {k}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTerbitTarget(null)}>
              Batal
            </Button>
            <Button
              onClick={() => {
                if (kelasPilihan.length === 0) {
                  toast.error("Pilih minimal satu kelas.");
                  return;
                }
                if (terbitTarget) terbitkanSebagaiTugas(terbitTarget.id, kelasPilihan);
                setTerbitTarget(null);
                toast.success("Soal diterbitkan sebagai tugas.");
              }}
            >
              <Send className="h-4 w-4" />
              Terbitkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                if (hapus) deletePaket(hapus.id);
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
  onHapus,
  align = "start",
}: {
  paket: PaketSoal;
  onOpen: () => void;
  onTerbitTugas: () => void;
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
          onClick={() => {
            publishPaket(paket.id);
            toast.success("Soal berhasil diterbitkan.");
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
          duplicatePaket(paket.id);
          toast.success("Paket soal diduplikasi sebagai draft.");
        }}
      >
        <Copy className="h-4 w-4" />
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
