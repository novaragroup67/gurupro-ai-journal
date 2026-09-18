import { Link, createFileRoute } from "@tanstack/react-router";
import { Archive } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-store";

export const Route = createFileRoute("/arsip")({
  head: () => ({
    meta: [
      { title: "Arsip — GuruPro" },
      {
        name: "description",
        content:
          "Simpan seluruh dokumen administrasi per semester agar mudah ditemukan saat dibutuhkan.",
      },
      { property: "og:title", content: "Arsip — GuruPro" },
      {
        property: "og:description",
        content:
          "Simpan seluruh dokumen administrasi per semester agar mudah ditemukan saat dibutuhkan.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  const { profile, ready } = useAuth();

  if (ready && profile.role !== "guru") {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Akses Khusus Guru</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Halaman Arsip Administrasi hanya dapat diakses oleh akun Guru terdaftar.
          </p>
          <div className="pt-2 flex justify-center">
            <Button asChild variant="outline">
              <Link to="/">Kembali ke Dashboard</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Arsip"
        subtitle="Fitur ini sedang kami siapkan untuk GuruPro versi berikutnya."
      />
      <ComingSoon
        title="Arsip"
        description="Simpan seluruh dokumen administrasi per semester agar mudah ditemukan saat dibutuhkan."
        icon={Archive}
      />
    </div>
  );
}
