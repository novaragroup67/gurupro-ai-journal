import { createFileRoute } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/penilaian")({
  head: () => ({
    meta: [
      { title: "Penilaian — GuruPro" },
      { name: "description", content: "Rekap nilai pengetahuan, keterampilan, dan sikap peserta didik secara otomatis." },
      { property: "og:title", content: "Penilaian — GuruPro" },
      { property: "og:description", content: "Rekap nilai pengetahuan, keterampilan, dan sikap peserta didik secara otomatis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="grid gap-6">
      <PageHeader title="Penilaian" subtitle="Fitur ini sedang kami siapkan untuk GuruPro versi berikutnya." />
      <ComingSoon title="Penilaian" description="Rekap nilai pengetahuan, keterampilan, dan sikap peserta didik secara otomatis." icon={GraduationCap} />
    </div>
  );
}
