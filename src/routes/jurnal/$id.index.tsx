import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { JournalDetail } from "@/components/journal-detail";
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
import { deleteJournal, useJournal } from "@/lib/journal-store";

export const Route = createFileRoute("/jurnal/$id/")({
  head: () => ({
    meta: [
      { title: "Detail Jurnal — GuruPro" },
      {
        name: "description",
        content: "Lihat detail lengkap jurnal mengajar: kegiatan, penilaian, refleksi, tindak lanjut.",
      },
      { property: "og:title", content: "Detail Jurnal — GuruPro" },
      { property: "og:description", content: "Detail lengkap jurnal mengajar di GuruPro." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: JournalDetailPage,
});

function JournalDetailPage() {
  const { id } = Route.useParams();
  const journal = useJournal(id);
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);

  if (!journal) {
    return (
      <Card className="mx-auto max-w-lg border-dashed">
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <p className="font-display font-semibold text-navy">Jurnal tidak ditemukan</p>
          <p className="text-sm text-muted-foreground">
            Jurnal ini mungkin sudah dihapus dari perangkat Anda.
          </p>
          <Button asChild>
            <Link to="/jurnal">Kembali ke Jurnal</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
          <Link to="/jurnal">
            <ArrowLeft className="h-4 w-4" />
            Kembali ke Jurnal
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button asChild variant="outline">
            <Link to="/jurnal/$id/edit" params={{ id: journal.id }}>
              <Pencil className="h-4 w-4" />
              Edit Jurnal
            </Link>
          </Button>
          <Button
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setConfirming(true)}
          >
            <Trash2 className="h-4 w-4" />
            Hapus
          </Button>
        </div>
      </div>

      <JournalDetail journal={journal} />

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus jurnal ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Jurnal &ldquo;{journal.materi}&rdquo; akan dihapus permanen dan tidak dapat dipulihkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                deleteJournal(journal.id);
                toast.success("Jurnal berhasil dihapus.");
                navigate({ to: "/jurnal" });
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
