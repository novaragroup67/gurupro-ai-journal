import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertCircle, ArrowRight, BookOpen, Loader2, LogIn, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";

import { GuruProLogo } from "@/components/gurupro-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { initials } from "@/lib/auth-store";
import { getKelasByKode, type Kelas } from "@/lib/kelas-store";

export const Route = createFileRoute("/gabung/$kodeKelas")({
  head: () => ({
    meta: [{ title: "Undangan Gabung Kelas — GuruPro" }],
  }),
  component: GabungKelasPage,
});

function GabungKelasPage() {
  const { kodeKelas } = Route.useParams();
  const navigate = useNavigate();

  const [kelas, setKelas] = useState<Kelas | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getKelasByKode(kodeKelas)
      .then((k) => {
        if (active) setKelas(k);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [kodeKelas]);

  const handleBelumPunyaAkun = () => {
    void navigate({
      to: "/daftar",
      search: { role: "siswa" },
    });
  };

  const handleSudahPunyaAkun = () => {
    void navigate({
      to: "/login",
    });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12 selection:bg-primary/20">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Link to="/landing">
            <GuruProLogo />
          </Link>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <p className="mt-3">Memeriksa tautan undangan kelas…</p>
          </div>
        ) : !kelas ? (
          <Card className="border-destructive/30 shadow-md">
            <CardContent className="p-6 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                <AlertCircle className="h-7 w-7" />
              </div>
              <h1 className="mt-4 font-display text-xl font-bold text-navy">
                Tautan Tidak Ditemukan
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Tautan undangan tidak valid atau kelas tidak ditemukan. Minta gurumu mengirim ulang
                kode atau tautannya.
              </p>
              <div className="mt-6">
                <Button asChild variant="outline" className="w-full">
                  <Link to="/landing">Kembali ke Beranda</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6">
            <div className="text-center">
              <h1 className="font-display text-2xl font-bold text-navy sm:text-3xl">
                Undangan Gabung Kelas
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Kamu diundang untuk bergabung ke kelas pembelajaran di GuruPro.
              </p>
            </div>

            {/* Card Info Undangan Kelas */}
            <Card className="border-2 border-primary/20 bg-card shadow-lift">
              <CardContent className="p-6 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-gradient font-display text-xl font-bold text-navy-foreground shadow-sm">
                  {initials(kelas.mapel || "GP")}
                </div>

                <p className="mt-4 text-sm font-medium text-muted-foreground">
                  Gurumu mengundangmu bergabung ke:
                </p>

                <div className="mt-3 rounded-2xl border border-primary/20 bg-primary-soft/50 p-4">
                  <div className="flex items-center justify-center gap-2 text-primary">
                    <BookOpen className="h-5 w-5" />
                    <span className="font-display text-lg font-bold text-navy">
                      {kelas.mapel}
                    </span>
                  </div>
                  <p className="mt-1 font-semibold text-primary">
                    Kelas {kelas.tingkat} {kelas.namaKelas}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Tahun Ajaran {kelas.tahunAjaran}
                  </p>
                </div>

                <div className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs font-mono text-muted-foreground">
                  Kode: <span className="font-bold text-navy">{kelas.kodeKelas}</span>
                </div>
              </CardContent>
            </Card>

            {/* Pilihan Aksi Siswa */}
            <div className="grid gap-3">
              <button
                type="button"
                onClick={handleBelumPunyaAkun}
                className="group flex flex-col items-start rounded-2xl border-2 border-primary/40 bg-card p-4 text-left transition-all hover:border-primary hover:bg-primary-soft/20 hover:shadow-md"
              >
                <div className="flex w-full items-center justify-between">
                  <span className="flex items-center gap-2 font-display text-base font-bold text-navy group-hover:text-primary">
                    <UserPlus className="h-4 w-4 text-primary" />
                    Saya Belum Punya Akun → Daftar
                  </span>
                  <ArrowRight className="h-4 w-4 text-primary transition-transform group-hover:translate-x-1" />
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  Buat akun siswa terlebih dahulu, lalu masukkan kode kelas ini di dashboard siswa.
                </p>
              </button>

              <button
                type="button"
                onClick={handleSudahPunyaAkun}
                className="group flex flex-col items-start rounded-2xl border bg-card p-4 text-left transition-all hover:border-navy/30 hover:bg-muted/40 hover:shadow-sm"
              >
                <div className="flex w-full items-center justify-between">
                  <span className="flex items-center gap-2 font-display text-base font-bold text-navy">
                    <LogIn className="h-4 w-4 text-navy" />
                    Saya Sudah Punya Akun → Masuk
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  Masuk ke akunmu, lalu masukkan kode kelas ini di dashboard siswa untuk bergabung.
                </p>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
