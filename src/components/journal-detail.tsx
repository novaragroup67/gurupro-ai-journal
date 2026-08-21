import { CalendarDays, Clock, GraduationCap, Sparkles, User } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTanggal, type Journal, type JournalDraft } from "@/lib/journal-types";

const SECTIONS: Array<{ key: keyof JournalDraft; label: string }> = [
  { key: "materi", label: "Materi" },
  { key: "tujuan", label: "Tujuan Pembelajaran" },
  { key: "aktivitas", label: "Kegiatan Pembelajaran" },
  { key: "partisipasi", label: "Partisipasi Siswa" },
  { key: "kondisiKelas", label: "Kondisi Kelas" },
  { key: "penilaian", label: "Penilaian" },
  { key: "refleksi", label: "Refleksi Guru" },
  { key: "tindakLanjut", label: "Tindak Lanjut" },
  { key: "catatan", label: "Catatan Guru" },
];

export function JournalDetail({ journal }: { journal: Journal | JournalDraft }) {
  return (
    <div className="grid gap-5">
      <Card className="overflow-hidden">
        <div className="bg-brand-gradient px-6 py-5">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-navy-foreground/70">
                Identitas Pembelajaran
              </p>
              <h2 className="mt-1 truncate font-display text-xl font-bold text-navy-foreground">
                {journal.mataPelajaran || "Mata Pelajaran"}
              </h2>
            </div>
            <Badge
              variant="secondary"
              className={
                journal.source === "AI"
                  ? "gap-1 bg-accent text-accent-foreground"
                  : "gap-1 bg-navy-foreground/15 text-navy-foreground"
              }
            >
              {journal.source === "AI" ? <Sparkles className="h-3 w-3" /> : null}
              {journal.source}
            </Badge>
          </div>

          <dl className="mt-4 grid gap-3 text-sm text-navy-foreground/85 sm:grid-cols-2 lg:grid-cols-4">
            <Meta icon={GraduationCap} label="Kelas" value={journal.kelas || "-"} />
            <Meta icon={CalendarDays} label="Tanggal" value={formatTanggal(journal.tanggal)} />
            <Meta icon={Clock} label="Jam" value={journal.jam || "-"} />
            <Meta icon={User} label="Metode" value={journal.metode || "-"} />
          </dl>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {SECTIONS.filter((s) => String(journal[s.key] ?? "").trim()).map((section) => (
          <Card key={section.key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-primary">
                {section.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/85">
                {String(journal[section.key])}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Meta({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-navy-foreground/12">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <dt className="text-[11px] uppercase tracking-wide text-navy-foreground/60">{label}</dt>
        <dd className="truncate font-medium text-navy-foreground">{value}</dd>
      </span>
    </div>
  );
}
