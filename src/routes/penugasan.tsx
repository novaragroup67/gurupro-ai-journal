import { createFileRoute } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/penugasan")({
  head: () => ({
    meta: [
      { title: "Penugasan — GuruPro" },
      { name: "description", content: "Kelola tugas siswa, tenggat pengumpulan, dan status pengerjaan dari satu halaman." },
      { property: "og:title", content: "Penugasan — GuruPro" },
      { property: "og:description", content: "Kelola tugas siswa, tenggat pengumpulan, dan status pengerjaan dari satu halaman." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="grid gap-6">
      <PageHeader title="Penugasan" subtitle="Fitur ini sedang kami siapkan untuk GuruPro versi berikutnya." />
      <ComingSoon title="Penugasan" description="Kelola tugas siswa, tenggat pengumpulan, dan status pengerjaan dari satu halaman." icon={ClipboardList} />
    </div>
  );
}
