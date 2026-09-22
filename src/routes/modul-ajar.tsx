import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  BookOpen,
  Eye,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ModulEditor } from "@/components/modul-editor";
import { ModulGeneratorDialog } from "@/components/modul-generator-dialog";
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
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth-store";
import { useKelas } from "@/lib/kelas-store";
import { useTahunAjaran } from "@/lib/tahun-ajaran-store";
import {
  addModul,
  deleteModul,
  getPublishedModulsForSiswa,
  saveModul,
  useModuls,
} from "@/lib/modul-store";
import { formatTanggal, type Modul } from "@/lib/modul-types";

export const Route = createFileRoute("/modul-ajar")({
  head: () => ({
    meta: [
      { title: "Modul Ajar — GuruPro" },
      {
        name: "description",
        content:
          "Susun modul dibantu AI dari CP/ATP, eBook, teks, atau link luar. Tambahkan ilustrasi dan PPT otomatis, lalu publikasikan.",
      },
      { property: "og:title", content: "Modul Ajar — GuruPro" },
      {
        property: "og:description",
        content: "Susun modul dibantu AI, tambahkan ilustrasi dan PPT otomatis, lalu publikasikan.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ModulAjarPage,
});

type TabValue = "semua" | "draft" | "terbit";

function ModulAjarPage() {
  const { profile, user, ready } = useAuth();
  const currentGuruId = user?.id || profile.id;
  const moduls = useModuls();
  const { kelasList } = useKelas();
  const { selectedYear } = useTahunAjaran(currentGuruId);
  const [tab, setTab] = useState<TabValue>("semua");
  const [query, setQuery] = useState("");
  const [openGenerator, setOpenGenerator] = useState(false);
  const [editing, setEditing] = useState<Modul | null>(null);
  const [hapus, setHapus] = useState<Modul | null>(null);

  const teacherClassesInYear = useMemo(() => {
    const list = Array.isArray(kelasList) ? kelasList : [];
    return list.filter(
      (k) =>
        (k.guruId === currentGuruId) &&
        (!selectedYear || k.tahunAjaran === selectedYear),
    );
  }, [kelasList, currentGuruId, selectedYear]);

  const teacherClassIdsInYear = useMemo(() => {
    return new Set(teacherClassesInYear.map((k) => k.id));
  }, [teacherClassesInYear]);

  const teacherClassNamesInYear = useMemo(() => {
    return new Set(
      teacherClassesInYear.map((k) => `${k.tingkat} ${k.namaKelas}`.trim().toLowerCase()),
    );
  }, [teacherClassesInYear]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return moduls.filter((m) => {
      // Filter Tahun Ajaran berbasis relasi kelas guru
      if (selectedYear) {
        if (m.kelasId) {
          if (!teacherClassIdsInYear.has(m.kelasId)) return false;
        } else if (m.kelas) {
          const cleanName = m.kelas.trim().toLowerCase();
          if (!teacherClassNamesInYear.has(cleanName)) return false;
        } else {
          return false;
        }
      }

      const byTab =
        tab === "semua" ? true : tab === "draft" ? m.status === "Draft" : m.status === "Terbit";
      const byQuery =
        !q ||
        m.judul.toLowerCase().includes(q) ||
        m.mapel.toLowerCase().includes(q) ||
        m.kelas.toLowerCase().includes(q);
      return byTab && byQuery;
    });
  }, [moduls, tab, query, selectedYear, teacherClassIdsInYear, teacherClassNamesInYear]);

  if (ready && profile.role === "siswa") {
    return <SiswaModulAjarView />;
  }

  if (ready && profile.role !== "guru") {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Akses Khusus Guru</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Halaman penyusunan modul ajar hanya dapat diakses oleh akun Guru terdaftar.
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

  if (editing) {
    return (
      <ModulEditor
        modul={editing}
        onChange={setEditing}
        onBack={() => setEditing(null)}
        onSaveDraft={() => {
          saveModul({ ...editing, status: "Draft" });
          setEditing({ ...editing, status: "Draft" });
          toast.success("Modul disimpan sebagai draft.");
        }}
        onPublish={() => {
          saveModul({ ...editing, status: "Terbit" });
          setEditing({ ...editing, status: "Terbit" });
          toast.success("Modul berhasil dipublikasikan.");
        }}
      />
    );
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Modul Ajar"
        subtitle={
          selectedYear
            ? `Susun dan kelola modul ajar untuk Tahun Ajaran ${selectedYear}, edit, lalu publikasikan.`
            : "Susun modul dibantu AI dari berbagai sumber, edit, lalu publikasikan."
        }
        actions={
          <Button onClick={() => setOpenGenerator(true)}>
            <Plus className="h-4 w-4" />
            Susun Modul Baru
          </Button>
        }
      />

      <div className="grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
          <TabsList className="w-full justify-start overflow-x-auto lg:w-auto">
            <TabsTrigger value="semua">Semua</TabsTrigger>
            <TabsTrigger value="draft">Draft</TabsTrigger>
            <TabsTrigger value="terbit">Dipublikasikan</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative lg:max-w-xs lg:justify-self-end">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari modul, mapel, kelas…"
            className="pl-9"
            aria-label="Cari modul"
          />
        </div>
      </div>

      <section className="grid gap-3">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Daftar Modul ({filtered.length})
        </h2>

        {filtered.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft text-primary">
                <BookOpen className="h-7 w-7" />
              </span>
              <p className="font-display font-semibold text-navy">
                {selectedYear
                  ? `Belum Ada Modul di Tahun Ajaran ${selectedYear}`
                  : "Belum ada modul di tampilan ini"}
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {selectedYear
                  ? `Tidak ada modul pembelajaran yang terhubung dengan kelas pada tahun ajaran ${selectedYear}. Anda dapat menyusun modul baru atau memilih tahun ajaran lain di header.`
                  : "Susun modul pertama Anda dari CP/ATP, eBook, teks, atau link luar — dibantu GuruPro AI."}
              </p>
              <Button onClick={() => setOpenGenerator(true)}>
                <Sparkles className="h-4 w-4" />
                Susun Modul Baru
              </Button>
            </CardContent>
          </Card>
        ) : (
          filtered.map((m) => (
            <Card key={m.id} className="transition-shadow hover:shadow-lift">
              <CardContent className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="secondary"
                      className={m.status === "Terbit" ? "bg-primary-soft text-primary" : ""}
                    >
                      {m.status === "Terbit" ? "Dipublikasikan" : "Draft"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">Sumber: {m.sumberTipe}</span>
                    <span className="text-xs text-muted-foreground">
                      Diperbarui {formatTanggal(m.updatedAt)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditing(m)}
                    className="mt-2 block max-w-full text-left font-display text-lg font-semibold text-navy hover:text-primary"
                  >
                    <span className="line-clamp-2">{m.judul}</span>
                  </button>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {[m.mapel, m.kelas].filter(Boolean).join(" · ") || "Belum ada kelas"} ·{" "}
                    {m.sections.length} bab
                    {m.sections.some((s) => s.ilustrasi) ? " · ada ilustrasi" : ""}
                    {m.slides.length > 0 ? ` · ${m.slides.length} slide` : ""}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <Button variant="outline" size="sm" onClick={() => setEditing(m)}>
                    <Pencil className="h-4 w-4" />
                    Buka Editor
                  </Button>
                  {m.status === "Draft" ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        saveModul({ ...m, status: "Terbit" });
                        toast.success("Modul berhasil dipublikasikan.");
                      }}
                    >
                      <Send className="h-4 w-4" />
                      Publikasikan
                    </Button>
                  ) : null}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Aksi lain">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditing(m)}>Edit modul</DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => {
                          saveModul({ ...m, status: m.status === "Terbit" ? "Draft" : "Terbit" });
                          toast.success(
                            m.status === "Terbit"
                              ? "Modul dikembalikan ke draft."
                              : "Modul dipublikasikan.",
                          );
                        }}
                      >
                        {m.status === "Terbit" ? "Jadikan draft" : "Publikasikan"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onSelect={(e) => {
                          e.preventDefault();
                          setHapus(m);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        Hapus modul
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </section>

      <ModulGeneratorDialog
        open={openGenerator}
        onOpenChange={setOpenGenerator}
        onGenerated={async (draft) => {
          const created = await addModul(draft);
          setEditing(created);
        }}
      />

      <AlertDialog open={hapus !== null} onOpenChange={(o) => !o && setHapus(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus modul ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Modul &ldquo;{hapus?.judul}&rdquo; akan dihapus permanen dari akun Anda.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (hapus) void deleteModul(hapus.id);
                setHapus(null);
                toast.success("Modul berhasil dihapus.");
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

// ==================== SISWA MODULE VIEW (READ-ONLY) ====================

function SiswaModulAjarView() {
  const [moduls, setModuls] = useState<Modul[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeModul, setActiveModul] = useState<Modul | null>(null);

  useEffect(() => {
    let mounted = true;
    getPublishedModulsForSiswa().then((data) => {
      if (mounted) {
        setModuls(data);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return moduls;
    return moduls.filter(
      (m) =>
        m.judul.toLowerCase().includes(q) ||
        m.mapel.toLowerCase().includes(q) ||
        m.kelas.toLowerCase().includes(q),
    );
  }, [moduls, query]);

  if (activeModul) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between border-b pb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveModul(null)}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Kembali ke Daftar Modul
          </Button>
          <Badge className="bg-emerald-600 text-white hover:bg-emerald-700">Modul Terbit</Badge>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-semibold text-primary">{activeModul.mapel}</span>
            <span>•</span>
            <span>{activeModul.kelas}</span>
            <span>•</span>
            <span>Diperbarui: {formatTanggal(activeModul.updatedAt)}</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-navy sm:text-3xl">
            {activeModul.judul}
          </h1>
          {activeModul.ringkasan && (
            <div className="rounded-xl border border-primary/20 bg-primary-soft/30 p-4 text-sm text-foreground leading-relaxed">
              <p className="font-semibold text-primary mb-1">Ringkasan Materi:</p>
              {activeModul.ringkasan}
            </div>
          )}
        </div>

        {/* Bagian-Bagian Pembelajaran */}
        <div className="space-y-6">
          {activeModul.sections.map((sec, idx) => (
            <Card key={sec.id || idx} className="overflow-hidden">
              <CardContent className="p-5 sm:p-6 space-y-4">
                <h3 className="font-display text-lg font-semibold text-navy">
                  {idx + 1}. {sec.judul}
                </h3>
                {sec.poin && sec.poin.length > 0 && (
                  <ul className="list-disc pl-5 text-sm space-y-1 text-muted-foreground">
                    {sec.poin.map((p, pIdx) => (
                      <li key={pIdx}>{p}</li>
                    ))}
                  </ul>
                )}
                {sec.isi && (
                  <div className="prose prose-sm max-w-none text-foreground leading-relaxed whitespace-pre-wrap">
                    {sec.isi}
                  </div>
                )}
                {sec.ilustrasi && (
                  <div className="rounded-lg overflow-hidden border">
                    <img
                      src={sec.ilustrasi}
                      alt={sec.judul}
                      className="max-h-80 w-full object-cover"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Slide Ringkas */}
        {activeModul.slides && activeModul.slides.length > 0 && (
          <div className="space-y-4 pt-4 border-t">
            <h2 className="font-display text-lg font-semibold text-navy">
              Slide Materi Ringkas
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {activeModul.slides.map((s, idx) => (
                <div
                  key={s.id || idx}
                  className="rounded-xl border p-4 bg-card shadow-xs space-y-2"
                >
                  <span className="text-xs font-bold text-primary">Slide {idx + 1}</span>
                  <h4 className="font-semibold text-sm text-navy">{s.judul}</h4>
                  <ul className="list-disc pl-4 text-xs space-y-1 text-muted-foreground">
                    {s.bullets.map((b, bIdx) => (
                      <li key={bIdx}>{b}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-center pt-4">
          <Button variant="outline" onClick={() => setActiveModul(null)} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Kembali ke Daftar Modul
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Modul Pembelajaran Siswa 📚"
        subtitle="Pelajari modul ajar dan materi pembelajaran yang diterbitkan oleh bapak/ibu guru untuk kelasmu."
      />

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cari judul modul, mata pelajaran, atau kelas…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          Memuat modul pembelajaran…
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-3 font-display text-base font-semibold text-navy">
            {query
              ? "Tidak ada modul yang cocok dengan pencarian"
              : "Belum Ada Modul Ajar Terbit"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
            {query
              ? "Coba gunakan kata kunci lain untuk mencari materi modul."
              : "Bapak/ibu guru belum menerbitkan modul ajar untuk kelas yang kamu ikuti. Periksa kembali nanti."}
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((m) => (
            <Card
              key={m.id}
              className="flex flex-col justify-between transition-shadow hover:shadow-lift"
            >
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <Badge variant="outline" className="font-semibold text-primary">
                    {m.mapel}
                  </Badge>
                  <span className="text-muted-foreground">{m.kelas}</span>
                </div>
                <div>
                  <h3 className="font-display font-semibold text-navy line-clamp-2">{m.judul}</h3>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-3">
                    {m.ringkasan || "Klik tombol baca modul untuk melihat rangkuman materi lengkap."}
                  </p>
                </div>
                <div className="pt-2 flex items-center justify-between border-t text-[11px] text-muted-foreground">
                  <span>{formatTanggal(m.updatedAt)}</span>
                  <Button
                    size="sm"
                    onClick={() => setActiveModul(m)}
                    className="gap-1.5 h-8 text-xs font-medium"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Baca Modul
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
