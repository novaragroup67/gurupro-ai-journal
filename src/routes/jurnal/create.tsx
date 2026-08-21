import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Save, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  JournalForm,
  validateJournal,
  type JournalErrors,
} from "@/components/journal-form";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { setAiHandoff } from "@/lib/ai-handoff";
import { addJournal } from "@/lib/journal-store";
import { emptyDraft, type JournalDraft } from "@/lib/journal-types";

export const Route = createFileRoute("/jurnal/create")({
  head: () => ({
    meta: [
      { title: "Buat Jurnal Mengajar — GuruPro" },
      {
        name: "description",
        content: "Isi jurnal mengajar secara manual atau lanjutkan dengan GuruPro AI.",
      },
      { property: "og:title", content: "Buat Jurnal Mengajar — GuruPro" },
      {
        property: "og:description",
        content: "Formulir jurnal mengajar lengkap dengan validasi otomatis.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CreateJurnal,
});

function CreateJurnal() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<JournalDraft>(emptyDraft());
  const [errors, setErrors] = useState<JournalErrors>({});

  const update = (patch: Partial<JournalDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    setErrors((prev) => {
      const next = { ...prev };
      (Object.keys(patch) as Array<keyof JournalDraft>).forEach((k) => delete next[k]);
      return next;
    });
  };

  const handleSave = () => {
    const found = validateJournal(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      toast.error("Lengkapi dulu kolom wajib yang ditandai.");
      return;
    }
    addJournal({ ...draft, source: "Manual" });
    toast.success("Jurnal berhasil disimpan.");
    navigate({ to: "/jurnal" });
  };

  const handleGenerate = () => {
    if (!draft.materi.trim() || !draft.mataPelajaran) {
      setErrors(validateJournal(draft));
      toast.error("Isi minimal mata pelajaran dan materi agar AI punya konteks.");
      return;
    }
    setAiHandoff({
      mataPelajaran: draft.mataPelajaran,
      kelas: draft.kelas,
      tanggal: draft.tanggal,
      jam: draft.jam,
      materi: draft.materi,
      tujuan: draft.tujuan,
      metode: draft.metode,
      kondisiKelas: draft.kondisiKelas,
      catatan: draft.catatan,
    });
    navigate({ to: "/jurnal/ai" });
  };

  return (
    <div className="grid gap-6">
      <Button asChild variant="ghost" size="sm" className="w-fit -ml-2">
        <Link to="/jurnal">
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Jurnal
        </Link>
      </Button>

      <PageHeader
        title="Buat Jurnal"
        subtitle="Isi kolom bertanda * sebagai data wajib. Sisanya bisa dibantu GuruPro AI."
        actions={
          <>
            <Button variant="outline" onClick={handleGenerate}>
              <Sparkles className="h-4 w-4" />
              Generate dengan AI
            </Button>
            <Button onClick={handleSave}>
              <Save className="h-4 w-4" />
              Simpan Jurnal
            </Button>
          </>
        }
      />

      <JournalForm draft={draft} errors={errors} onChange={update} />

      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        <Button asChild variant="ghost">
          <Link to="/jurnal">Batal</Link>
        </Button>
        <Button variant="outline" onClick={handleGenerate}>
          <Sparkles className="h-4 w-4" />
          Generate dengan AI
        </Button>
        <Button onClick={handleSave}>
          <Save className="h-4 w-4" />
          Simpan Jurnal
        </Button>
      </div>
    </div>
  );
}
