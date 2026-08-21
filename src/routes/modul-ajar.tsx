import { createFileRoute } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/modul-ajar")({
  head: () => ({
    meta: [
      { title: "Modul Ajar — GuruPro" },
      { name: "description", content: "Susun modul ajar dan perangkat pembelajaran sesuai kurikulum, lengkap dengan capaian pembelajaran." },
      { property: "og:title", content: "Modul Ajar — GuruPro" },
      { property: "og:description", content: "Susun modul ajar dan perangkat pembelajaran sesuai kurikulum, lengkap dengan capaian pembelajaran." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="grid gap-6">
      <PageHeader title="Modul Ajar" subtitle="Fitur ini sedang kami siapkan untuk GuruPro versi berikutnya." />
      <ComingSoon title="Modul Ajar" description="Susun modul ajar dan perangkat pembelajaran sesuai kurikulum, lengkap dengan capaian pembelajaran." icon={BookOpen} />
    </div>
  );
}
