import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, MoreVertical, Pencil, Plus, Search, Send, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
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
import { addModul, deleteModul, saveModul, useModuls } from "@/lib/modul-store";
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
  const moduls = useModuls();
  const [tab, setTab] = useState<TabValue>("semua");
  const [query, setQuery] = useState("");
  const [openGenerator, setOpenGenerator] = useState(false);
  const [editing, setEditing] = useState<Modul | null>(null);
  const [hapus, setHapus] = useState<Modul | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return moduls.filter((m) => {
      const byTab =
        tab === "semua" ? true : tab === "draft" ? m.status === "Draft" : m.status === "Terbit";
      const byQuery =
        !q ||
        m.judul.toLowerCase().includes(q) ||
        m.mapel.toLowerCase().includes(q) ||
        m.kelas.toLowerCase().includes(q);
      return byTab && byQuery;
    });
  }, [moduls, tab, query]);

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
        subtitle="Susun modul dibantu AI dari berbagai sumber, edit, lalu publikasikan."
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
              <p className="font-display font-semibold text-navy">Belum ada modul di tampilan ini</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Susun modul pertama Anda dari CP/ATP, eBook, teks, atau link luar — dibantu GuruPro AI.
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
                            m.status === "Terbit" ? "Modul dikembalikan ke draft." : "Modul dipublikasikan.",
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
          try {
            const created = await addModul(draft);
            setEditing(created);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Gagal menyimpan modul.");
          }
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
