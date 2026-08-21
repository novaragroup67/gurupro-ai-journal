import { createFileRoute } from "@tanstack/react-router";
import { Archive } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/arsip")({
  head: () => ({
    meta: [
      { title: "Arsip — GuruPro" },
      { name: "description", content: "Simpan seluruh dokumen administrasi per semester agar mudah ditemukan saat dibutuhkan." },
      { property: "og:title", content: "Arsip — GuruPro" },
      { property: "og:description", content: "Simpan seluruh dokumen administrasi per semester agar mudah ditemukan saat dibutuhkan." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="grid gap-6">
      <PageHeader title="Arsip" subtitle="Fitur ini sedang kami siapkan untuk GuruPro versi berikutnya." />
      <ComingSoon title="Arsip" description="Simpan seluruh dokumen administrasi per semester agar mudah ditemukan saat dibutuhkan." icon={Archive} />
    </div>
  );
}
