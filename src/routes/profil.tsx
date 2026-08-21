import { createFileRoute } from "@tanstack/react-router";
import { UserRound } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/profil")({
  head: () => ({
    meta: [
      { title: "Profil Guru — GuruPro" },
      { name: "description", content: "Atur data guru, mata pelajaran yang diampu, dan preferensi tampilan GuruPro." },
      { property: "og:title", content: "Profil Guru — GuruPro" },
      { property: "og:description", content: "Atur data guru, mata pelajaran yang diampu, dan preferensi tampilan GuruPro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="grid gap-6">
      <PageHeader title="Profil Guru" subtitle="Fitur ini sedang kami siapkan untuk GuruPro versi berikutnya." />
      <ComingSoon title="Profil Guru" description="Atur data guru, mata pelajaran yang diampu, dan preferensi tampilan GuruPro." icon={UserRound} />
    </div>
  );
}
