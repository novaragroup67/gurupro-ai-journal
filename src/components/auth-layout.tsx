import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";

import { GuruProLogo } from "@/components/gurupro-logo";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen w-full lg:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-navy p-10 text-navy-foreground lg:flex">
        <GuruProLogo variant="light" />
        <div className="grid gap-4">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            GuruPro AI
          </span>
          <h2 className="font-display text-3xl font-bold leading-tight">
            Guru fokus mengajar, GuruPro urus adminnya.
          </h2>
          <p className="max-w-md text-sm leading-relaxed text-navy-foreground/75">
            Daftar, diverifikasi Admin, lalu masuk untuk menyusun modul, soal, dan penilaian dari satu
            dashboard.
          </p>
        </div>
        <p className="text-xs text-navy-foreground/60">Prototipe v2 — data disimpan di perangkat Anda.</p>
      </aside>

      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-6 flex justify-center lg:hidden">
            <GuruProLogo />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
