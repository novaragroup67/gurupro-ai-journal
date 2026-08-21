import { Link, createFileRoute } from "@tanstack/react-router";
import { NotebookPen, Plus, Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { JournalCard } from "@/components/journal-card";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deleteJournal, useJournals } from "@/lib/journal-store";
import { MATA_PELAJARAN, type Journal } from "@/lib/journal-types";

export const Route = createFileRoute("/jurnal/")({
  head: () => ({
    meta: [
      { title: "Jurnal Mengajar — GuruPro" },
      {
        name: "description",
        content: "Cari, filter, edit, dan kelola seluruh jurnal mengajar Anda di GuruPro.",
      },
      { property: "og:title", content: "Jurnal Mengajar — GuruPro" },
      {
        property: "og:description",
        content: "Semua jurnal mengajar tersimpan rapi dalam satu halaman.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: JurnalPage,
});

function JurnalPage() {
  const journals = useJournals();
  const [query, setQuery] = useState("");
  const [mapel, setMapel] = useState("semua");
  const [source, setSource] = useState("semua");
  const [pending, setPending] = useState<Journal | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return journals.filter((j) => {
      const matchQuery =
        !q ||
        [j.materi, j.mataPelajaran, j.kelas, j.tujuan].some((v) => v.toLowerCase().includes(q));
      const matchMapel = mapel === "semua" || j.mataPelajaran === mapel;
      const matchSource = source === "semua" || j.source === source;
      return matchQuery && matchMapel && matchSource;
    });
  }, [journals, query, mapel, source]);

  const confirmDelete = () => {
    if (!pending) return;
    deleteJournal(pending.id);
    toast.success("Jurnal berhasil dihapus.");
    setPending(null);
  };

  const resetFilter = () => {
    setQuery("");
    setMapel("semua");
    setSource("semua");
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Jurnal Mengajar"
        subtitle="Kelola catatan kegiatan mengajar harian Anda dalam satu tempat."
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/jurnal/create">
                <Plus className="h-4 w-4" />
                Buat Jurnal
              </Link>
            </Button>
            <Button asChild>
              <Link to="/jurnal/ai">
                <Sparkles className="h-4 w-4" />
                Generate dengan AI
              </Link>
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari materi, mata pelajaran, atau kelas..."
              className="pl-9"
            />
          </div>
          <Select value={mapel} onValueChange={setMapel}>
            <SelectTrigger className="w-full lg:w-56">
              <SelectValue placeholder="Mata pelajaran" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="semua">Semua Mata Pelajaran</SelectItem>
              {MATA_PELAJARAN.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="w-full lg:w-40">
              <SelectValue placeholder="Sumber" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="semua">Semua Sumber</SelectItem>
              <SelectItem value="AI">AI</SelectItem>
              <SelectItem value="Manual">Manual</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Menampilkan <span className="font-semibold text-foreground">{filtered.length}</span> dari{" "}
          {journals.length} jurnal
        </p>
        {query || mapel !== "semua" || source !== "semua" ? (
          <Button variant="ghost" size="sm" onClick={resetFilter}>
            Reset filter
          </Button>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft text-primary">
              <NotebookPen className="h-7 w-7" />
            </span>
            <div>
              <p className="font-display font-semibold text-navy">Jurnal tidak ditemukan</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Coba ubah kata kunci pencarian atau buat jurnal baru.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={resetFilter}>
                Reset filter
              </Button>
              <Button asChild>
                <Link to="/jurnal/ai">
                  <Sparkles className="h-4 w-4" />
                  Generate dengan AI
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((journal) => (
            <JournalCard key={journal.id} journal={journal} onDelete={setPending} />
          ))}
        </div>
      )}

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus jurnal ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Jurnal &ldquo;{pending?.materi}&rdquo; akan dihapus permanen dari perangkat Anda.
              Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
