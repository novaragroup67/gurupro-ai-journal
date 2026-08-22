import { Link } from "@tanstack/react-router";
import { ArrowLeft, Construction, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function ComingSoon({
  title,
  description,
  icon: Icon = Construction,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
}) {
  return (
    <Card className="mx-auto max-w-2xl border-dashed text-center">
      <CardContent className="flex flex-col items-center gap-4 px-6 py-14">
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-primary-soft text-primary">
          <Icon className="h-8 w-8" />
        </span>
        <div>
          <h2 className="font-display text-xl font-bold text-navy">{title}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-foreground">
          <Sparkles className="h-3.5 w-3.5" />
          Segera hadir di GuruPro
        </span>
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          <Button asChild variant="outline">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" />
              Kembali ke Dashboard
            </Link>
          </Button>
          <Button asChild>
            <Link to="/modul-ajar">Kelola Modul Ajar</Link>
          </Button>

        </div>
      </CardContent>
    </Card>
  );
}
