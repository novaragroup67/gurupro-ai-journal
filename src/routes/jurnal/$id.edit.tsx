import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { JournalForm, validateJournal, type JournalErrors } from "@/components/journal-form";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { updateJournal, useJournal } from "@/lib/journal-store";
import { emptyDraft, type JournalDraft } from "@/lib/journal-types";

export const Route = createFileRoute("/jurnal/$id/edit")({
  head: () => ({
    meta: [
      { title: "Edit Jurnal — GuruPro" },
      { name: "description", content: "Perbarui isi jurnal mengajar Anda di GuruPro." },
      { property: "og:title", content: "Edit Jurnal — GuruPro" },
      { property: "og:description", content: "Perbarui isi jurnal mengajar Anda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EditJournalPage,
});

function EditJournalPage() {
  const { id } = Route.useParams();
  const journal = useJournal(id);
  const navigate = useNavigate();
  const [draft, setDraft] = useState<JournalDraft | null>(null);
  const [errors, setErrors] = useState<JournalErrors>({});

  const current: JournalDraft = draft ?? (journal ? { ...journal } : emptyDraft());

  if (!journal) {
    return (
      <Card className="mx-auto max-w-lg border-dashed">
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <p className="font-display font-semibold text-navy">Jurnal tidak ditemukan</p>
          <Button asChild>
            <Link to="/jurnal">Kembali ke Jurnal</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const update = (patch: Partial<JournalDraft>) => {
    setDraft({ ...current, ...patch });
    setErrors((prev) => {
      const next = { ...prev };
      (Object.keys(patch) as Array<keyof JournalDraft>).forEach((k) => delete next[k]);
      return next;
    });
  };

  const handleSave = () => {
    const found = validateJournal(current);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      toast.error("Lengkapi dulu kolom wajib yang ditandai.");
      return;
    }
    updateJournal(journal.id, current);
    toast.success("Perubahan jurnal berhasil disimpan.");
    navigate({ to: "/jurnal/$id", params: { id: journal.id } });
  };

  return (
    <div className="grid gap-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link to="/jurnal/$id" params={{ id: journal.id }}>
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Detail
        </Link>
      </Button>

      <PageHeader
        title="Edit Jurnal"
        subtitle={`${journal.mataPelajaran} · ${journal.kelas}`}
        actions={
          <Button onClick={handleSave}>
            <Save className="h-4 w-4" />
            Simpan Perubahan
          </Button>
        }
      />

      <JournalForm draft={current} errors={errors} onChange={update} showAiSections />

      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        <Button asChild variant="ghost">
          <Link to="/jurnal/$id" params={{ id: journal.id }}>
            Batal
          </Link>
        </Button>
        <Button onClick={handleSave}>
          <Save className="h-4 w-4" />
          Simpan Perubahan
        </Button>
      </div>
    </div>
  );
}
