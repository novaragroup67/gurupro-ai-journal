import { createFileRoute } from "@tanstack/react-router";
import { Check, Clock, UserCheck, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { initials, useAuth } from "@/lib/auth-store";
import {
  setujuiAnggota,
  tolakAnggota,
  useKelas,
  type AnggotaItem,
} from "@/lib/kelas-store";

export const Route = createFileRoute("/verifikasi")({
  head: () => ({
    meta: [
      { title: "Verifikasi Akun Siswa — GuruPro" },
      {
        name: "description",
        content:
          "Verifikasi dan kelola permohonan siswa yang mendaftar atau ingin bergabung ke kelas Anda.",
      },
      { property: "og:title", content: "Verifikasi Akun Siswa — GuruPro" },
      {
        property: "og:description",
        content: "Setujui atau tolak permintaan akun siswa yang mendaftar lewat kode kelas Anda.",
      },
    ],
  }),
  component: VerifikasiPage,
});

function formatTanggal(isoDate: string) {
  try {
    const d = new Date(isoDate);
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return isoDate;
  }
}

function VerifikasiPage() {
  const { profile, user } = useAuth();
  const { kelasList, anggotaList } = useKelas();

  const [activeTab, setActiveTab] = useState("menunggu");
  const [targetTolak, setTargetTolak] = useState<AnggotaItem | null>(null);

  // Ambil semua permintaan siswa untuk kelas guru ini berdasarkan guru_id
  const guruId = user?.id || profile.id;
  const myKelas = kelasList.filter((k) => k.guruId === guruId);
  const myKelasMap = new Map(myKelas.map((k) => [k.id, k]));

  const allAnggota: AnggotaItem[] = anggotaList
    .filter((a) => myKelasMap.has(a.kelasId))
    .map((a) => {
      const k = myKelasMap.get(a.kelasId);
      return {
        ...a,
        namaKelas: k ? `${k.tingkat} ${k.namaKelas}` : "Kelas",
        mapel: k ? k.mapel : "-",
        tingkat: k ? k.tingkat : "-",
      };
    });

  const menungguList = allAnggota.filter((a) => a.status === "menunggu");
  const disetujuiList = allAnggota.filter((a) => a.status === "aktif");
  const ditolakList = allAnggota.filter((a) => a.status === "ditolak");

  const handleSetujui = async (item: AnggotaItem) => {
    const ok = await setujuiAnggota(item.id);
    if (ok) {
      toast.success(`${item.siswaNama} berhasil disetujui dan bergabung ke ${item.namaKelas}.`);
    } else {
      toast.error("Gagal menyetujui siswa.");
    }
  };

  const handleTolakConfirm = async () => {
    if (!targetTolak) return;
    const ok = await tolakAnggota(targetTolak.id);
    if (ok) {
      toast.info(`Permintaan bergabung dari ${targetTolak.siswaNama} telah ditolak.`);
    } else {
      toast.error("Gagal menolak siswa.");
    }
    setTargetTolak(null);
  };

  const renderTable = (items: AnggotaItem[], showActions: boolean) => {
    if (items.length === 0) {
      return (
        <div className="py-12 text-center">
          <Clock className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm font-medium text-navy">Tidak ada data</p>
          <p className="text-xs text-muted-foreground">
            Belum ada permohonan siswa pada kategori ini.
          </p>
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama Siswa</TableHead>
              <TableHead>Jenis</TableHead>
              <TableHead>Kelas Dituju</TableHead>
              <TableHead>Diajukan</TableHead>
              <TableHead>Status</TableHead>
              {showActions ? <TableHead className="text-right">Aksi</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-gradient text-xs font-bold text-navy-foreground">
                      {initials(item.siswaNama)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-navy">{item.siswaNama}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        NISN: {item.siswaNisn || "—"} · {item.siswaEmail}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {item.jenis === "akun-baru" ? (
                    <Badge className="bg-primary text-primary-foreground">Akun Baru</Badge>
                  ) : (
                    <Badge variant="outline" className="border-primary/50 text-primary">
                      Tambah Kelas
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="font-medium text-navy">
                  {item.namaKelas}
                  <span className="block text-xs text-muted-foreground">{item.mapel}</span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatTanggal(item.diajukan)}
                </TableCell>
                <TableCell>
                  {item.status === "menunggu" ? (
                    <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                      Menunggu
                    </Badge>
                  ) : item.status === "aktif" ? (
                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">
                      Disetujui
                    </Badge>
                  ) : (
                    <Badge variant="destructive">Ditolak</Badge>
                  )}
                </TableCell>
                {showActions ? (
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        onClick={() => handleSetujui(item)}
                        className="h-8 gap-1 bg-emerald-600 px-3 text-xs text-white hover:bg-emerald-700"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Setujui
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setTargetTolak(item)}
                        className="h-8 gap-1 px-3 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                        Tolak
                      </Button>
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Verifikasi Akun Siswa"
        subtitle="Daftar ini hanya menampilkan siswa yang mendaftar lewat kode kelas milikmu. Kolom Jenis membedakan siswa baru (aktivasi akun) dengan siswa yang sudah punya akun dan ingin tambah kelas."
      />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="font-display text-base text-navy">Permintaan Siswa</CardTitle>
            <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <UserCheck className="h-4 w-4 text-primary" />
              Total {allAnggota.length} permohonan tercatat
            </div>
          </div>
          <CardDescription>
            Tinjau siswa yang mendaftar melalui tautan atau kode kelas Anda.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3 sm:w-auto">
              <TabsTrigger value="menunggu" className="gap-1.5">
                Menunggu
                {menungguList.length > 0 ? (
                  <Badge variant="secondary" className="h-5 rounded-full px-1.5 text-xs">
                    {menungguList.length}
                  </Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="disetujui" className="gap-1.5">
                Disetujui
                {disetujuiList.length > 0 ? (
                  <Badge variant="outline" className="h-5 rounded-full px-1.5 text-xs">
                    {disetujuiList.length}
                  </Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="ditolak" className="gap-1.5">
                Ditolak
                {ditolakList.length > 0 ? (
                  <Badge variant="outline" className="h-5 rounded-full px-1.5 text-xs">
                    {ditolakList.length}
                  </Badge>
                ) : null}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="menunggu" className="mt-4">
              {renderTable(menungguList, true)}
            </TabsContent>

            <TabsContent value="disetujui" className="mt-4">
              {renderTable(disetujuiList, false)}
            </TabsContent>

            <TabsContent value="ditolak" className="mt-4">
              {renderTable(ditolakList, false)}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Dialog Konfirmasi Tolak */}
      <AlertDialog open={!!targetTolak} onOpenChange={(open) => !open && setTargetTolak(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tolak Permintaan Siswa?</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menolak permohonan bergabung dari{" "}
              <strong>{targetTolak?.siswaNama}</strong> ke kelas{" "}
              <strong>{targetTolak?.namaKelas}</strong>? Siswa tidak akan bisa mengakses kelas ini.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleTolakConfirm}
            >
              Tolak Siswa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
