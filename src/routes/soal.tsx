import { createFileRoute } from "@tanstack/react-router";
import { FileQuestion } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/soal")({
  head: () => ({
    meta: [
      { title: "Bank Soal — GuruPro" },
      { name: "description", content: "Buat dan simpan bank soal per materi, siap dipakai untuk ulangan maupun latihan harian." },
      { property: "og:title", content: "Bank Soal — GuruPro" },
      { property: "og:description", content: "Buat dan simpan bank soal per materi, siap dipakai untuk ulangan maupun latihan harian." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="grid gap-6">
      <PageHeader title="Bank Soal" subtitle="Fitur ini sedang kami siapkan untuk GuruPro versi berikutnya." />
      <ComingSoon title="Bank Soal" description="Buat dan simpan bank soal per materi, siap dipakai untuk ulangan maupun latihan harian." icon={FileQuestion} />
    </div>
  );
}
