import { Link } from "@tanstack/react-router";
import { CalendarDays, Clock, Eye, GraduationCap, Pencil, Sparkles, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatTanggal, type Journal } from "@/lib/journal-types";

export function JournalCard({
  journal,
  onDelete,
}: {
  journal: Journal;
  onDelete: (journal: Journal) => void;
}) {
  return (
    <Card className="group transition-shadow hover:shadow-lift">
      <CardContent className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="secondary"
              className={
                journal.source === "AI"
                  ? "gap-1 bg-accent-soft text-accent-foreground"
                  : "gap-1 bg-secondary text-secondary-foreground"
              }
            >
              {journal.source === "AI" ? <Sparkles className="h-3 w-3" /> : null}
              {journal.source}
            </Badge>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              {formatTanggal(journal.tanggal)}
            </span>
            {journal.jam ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {journal.jam}
              </span>
            ) : null}
          </div>

          <Link
            to="/jurnal/$id"
            params={{ id: journal.id }}
            className="mt-2 block font-display text-lg font-semibold text-navy hover:text-primary"
          >
            <span className="line-clamp-2">{journal.materi}</span>
          </Link>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground/80">{journal.mataPelajaran}</span>
            <span className="inline-flex items-center gap-1.5">
              <GraduationCap className="h-4 w-4" />
              {journal.kelas}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button asChild variant="outline" size="sm">
            <Link to="/jurnal/$id" params={{ id: journal.id }}>
              <Eye className="h-4 w-4" />
              Lihat
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link to="/jurnal/$id/edit" params={{ id: journal.id }}>
              <Pencil className="h-4 w-4" />
              Edit
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => onDelete(journal)}
          >
            <Trash2 className="h-4 w-4" />
            Hapus
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
