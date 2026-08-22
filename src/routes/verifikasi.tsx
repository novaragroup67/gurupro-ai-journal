import { createFileRoute } from "@tanstack/react-router";
import { UserCheck } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/verifikasi")({
  head: () => ({
    meta: [
      { title: "Verifikasi Akun Siswa — GuruPro" },
      {
        name: "description",
        content: "Verifikasi akun siswa sebelum mereka bisa mengakses tugas dan penilaian di GuruPro.",
      },
      { property: "og:title", content: "Verifikasi Akun Siswa — GuruPro" },
      {
        property: "og:description",
        content: "Verifikasi akun siswa sebelum mereka mengakses tugas dan penilaian.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Verifikasi Akun Siswa"
        subtitle="Fitur ini sedang kami siapkan untuk tahap pengembangan berikutnya."
      />
      <ComingSoon
        title="Verifikasi Akun Siswa"
        description="Setujui atau tolak permintaan akun siswa, lalu hubungkan mereka ke kelas yang Anda ampu."
        icon={UserCheck}
      />
    </div>
  );
}
