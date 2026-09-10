import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Check,
  Clock,
  Copy,
  GraduationCap,
  Link2,
  Plus,
  School,
  Sparkles,
  Users,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth-store";
import { buatKelas, useKelas, type Kelas } from "@/lib/kelas-store";

export const Route = createFileRoute("/kelas/")({
  head: () => ({
    meta: [
      { title: "Kelas Saya — GuruPro" },
      {
        name: "description",
        content: "Kelola kelas, bagikan kode/link undangan ke siswa, dan pantau aktivitas belajar.",
      },
      { property: "og:title", content: "Kelas Saya — GuruPro" },
      {
        property: "og:description",
        content: "Kelola kelas, bagikan kode/link undangan ke siswa, dan pantau aktivitas belajar.",
      },
    ],
  }),
  component: KelasListPage,
});

function KelasListPage() {
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const { kelasList, anggotaList, refresh } = useKelas();

  // Filter kelas milik guru yang sedang login
  const guruId = user?.id || profile.id;
  const myKelasList = kelasList.filter((k) => (guruId ? k.guruId === guruId : true));

  // Dialog buat kelas baru
  const [openCreateModal, setOpenCreateModal] = useState(false);
  const [namaKelas, setNamaKelas] = useState("");
  const [tingkat, setTingkat] = useState("XI");
  const [mapel, setMapel] = useState(profile.mapel || "Matematika");
  const [tahunAjaran, setTahunAjaran] = useState("2025/2026");
  const [submitting, setSubmitting] = useState(false);

  // Status copy feedback per kelas id
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  const getLinkUndangan = (kode: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://gurupro.app";
    return `${origin}/gabung/${kode}`;
  };

  const handleSalinKode = (kelasId: string, kode: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(kode);
      setCopiedCodeId(kelasId);
      setTimeout(() => setCopiedCodeId(null), 2000);
      toast.success(`Kode kelas ${kode} berhasil disalin ke clipboard!`);
    }
  };

  const handleSalinLink = (kelasId: string, kode: string) => {
    const link = getLinkUndangan(kode);
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(link);
      setCopiedLinkId(kelasId);
      setTimeout(() => setCopiedLinkId(null), 2000);
      toast.success("Tautan undangan kelas berhasil disalin ke clipboard!");
    }
  };

  const handleBuatKelas = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!namaKelas.trim()) {
      toast.error("Nama kelas wajib diisi (misal: IPA 1, RPL 2).");
      return;
    }
    if (!tingkat.trim()) {
      toast.error("Pilih tingkat / jenjang kelas.");
      return;
    }
    if (!mapel.trim()) {
      toast.error("Mata pelajaran wajib diisi.");
      return;
    }

    const currentGuruId = user?.id || profile.id;
    if (!currentGuruId) {
      toast.error("Sesi guru tidak valid. Silakan masuk kembali.");
      return;
    }

    setSubmitting(true);
    try {
      const baru = await buatKelas({
        namaKelas: namaKelas.trim(),
        tingkat: tingkat.trim(),
        mapel: mapel.trim(),
        tahunAjaran: tahunAjaran.trim() || "2025/2026",
        guruId: currentGuruId,
      });

      toast.success(`Kelas ${baru.tingkat} ${baru.namaKelas} berhasil dibuat!`);
      setNamaKelas("");
      setOpenCreateModal(false);
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal membuat kelas.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const hitungAnggota = (kelasId: string) => {
    const aktif = anggotaList.filter((a) => a.kelasId === kelasId && a.status === "aktif").length;
    const menunggu = anggotaList.filter(
      (a) => a.kelasId === kelasId && a.status === "menunggu",
    ).length;
    return { aktif, menunggu };
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Kelas Saya"
        subtitle="Kelola kelas, bagikan kode/link undangan ke siswa, dan pantau aktivitas belajar."
        actions={
          <Dialog open={openCreateModal} onOpenChange={setOpenCreateModal}>
            <DialogTrigger asChild>
              <Button className="gap-2 shadow-sm font-medium">
                <Plus className="h-4 w-4" />
                Buat Kelas Baru
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <form onSubmit={handleBuatKelas}>
                <DialogHeader>
                  <DialogTitle className="font-display text-navy">Buat Kelas Baru</DialogTitle>
                  <DialogDescription>
                    Tambahkan kelas baru untuk menghasilkan kode dan tautan undangan bagi peserta
                    didik Anda.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                  <div className="grid gap-1.5">
                    <Label htmlFor="namaKelas">Nama Kelas</Label>
                    <Input
                      id="namaKelas"
                      placeholder="Contoh: XI RPL 1 atau IPA 2"
                      value={namaKelas}
                      onChange={(e) => setNamaKelas(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label htmlFor="tingkat">Tingkat / Jenjang</Label>
                      <Select value={tingkat} onValueChange={setTingkat}>
                        <SelectTrigger id="tingkat">
                          <SelectValue placeholder="Pilih tingkat" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="X">Kelas X</SelectItem>
                          <SelectItem value="XI">Kelas XI</SelectItem>
                          <SelectItem value="XII">Kelas XII</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-1.5">
                      <Label htmlFor="tahunAjaran">Tahun Ajaran</Label>
                      <Input
                        id="tahunAjaran"
                        placeholder="2025/2026"
                        value={tahunAjaran}
                        onChange={(e) => setTahunAjaran(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor="mapel">Mata Pelajaran</Label>
                    <Input
                      id="mapel"
                      placeholder="Contoh: Matematika, Pemrograman Web"
                      value={mapel}
                      onChange={(e) => setMapel(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOpenCreateModal(false)}
                    disabled={submitting}
                  >
                    Batal
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Membuat Kelas…" : "Simpan & Buat Kelas"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Grid Kartu Kelas */}
      {myKelasList.length === 0 ? (
        <Card className="border-dashed py-12 text-center">
          <CardContent className="flex flex-col items-center justify-center p-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-soft text-primary">
              <School className="h-8 w-8" />
            </div>
            <h3 className="mt-4 font-display text-lg font-bold text-navy">
              Belum Ada Kelas Pembelajaran
            </h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Mulai buat kelas pertama Anda untuk mendapatkan kode unik dan tautan undangan yang
              dapat dibagikan kepada para siswa.
            </p>
            <Button className="mt-6 gap-2" onClick={() => setOpenCreateModal(true)}>
              <Plus className="h-4 w-4" />
              Buat Kelas Sekarang
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {myKelasList.map((kelas) => {
            const { aktif, menunggu } = hitungAnggota(kelas.id);
            const isCopiedCode = copiedCodeId === kelas.id;
            const isCopiedLink = copiedLinkId === kelas.id;

            return (
              <Card
                key={kelas.id}
                className="group flex flex-col justify-between overflow-hidden border-border/80 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lift"
              >
                <div>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <Badge
                        variant="secondary"
                        className="bg-primary-soft/80 font-medium text-primary hover:bg-primary-soft"
                      >
                        {kelas.tingkat} · {kelas.mapel}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{kelas.tahunAjaran}</span>
                    </div>
                    <CardTitle className="mt-2 font-display text-xl font-bold tracking-tight text-navy">
                      {kelas.namaKelas}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-2 pt-1 text-xs">
                      <span className="inline-flex items-center gap-1 font-medium text-foreground">
                        <Users className="h-3.5 w-3.5 text-primary" />
                        {aktif} Siswa Aktif
                      </span>
                      {menunggu > 0 ? (
                        <Badge
                          variant="outline"
                          className="border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                        >
                          <Clock className="mr-1 h-3 w-3 animate-pulse" />
                          {menunggu} Menunggu
                        </Badge>
                      ) : null}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="pb-4">
                    {/* Box Kode Kelas */}
                    <div className="rounded-xl border border-border/80 bg-muted/30 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                          Kode Kelas Siswa
                        </span>
                        <span className="text-[11px] text-muted-foreground">Undangan</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <code className="font-mono text-lg font-extrabold tracking-wider text-navy">
                          {kelas.kodeKelas}
                        </code>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                            onClick={() => handleSalinKode(kelas.id, kelas.kodeKelas)}
                            title="Salin Kode Kelas"
                          >
                            {isCopiedCode ? (
                              <Check className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                            onClick={() => handleSalinLink(kelas.id, kelas.kodeKelas)}
                            title="Salin Tautan Gabung Siswa"
                          >
                            {isCopiedLink ? (
                              <Check className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <Link2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </div>

                <CardFooter className="border-t border-border/60 bg-card/50 pt-3">
                  <Button
                    asChild
                    variant="outline"
                    className="w-full justify-between font-medium group-hover:border-primary/50 group-hover:bg-primary group-hover:text-primary-foreground"
                  >
                    <Link to="/kelas/$kelasId" params={{ kelasId: kelas.id }}>
                      <span>Buka Kelas</span>
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
