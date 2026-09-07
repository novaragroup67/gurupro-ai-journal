import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Copy,
  Link2,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { initials, logout, updateProfile, useAuth, type GuruProfile } from "@/lib/auth-store";
import { buatKelas, perbaruiKodeKelas, useKelas, type Kelas } from "@/lib/kelas-store";

export const Route = createFileRoute("/profil")({
  head: () => ({
    meta: [
      { title: "Profil Guru — GuruPro" },
      {
        name: "description",
        content:
          "Atur data guru, sekolah, mata pelajaran, dan kelas yang diampu, lalu keluar dari akun GuruPro dengan aman.",
      },
      { property: "og:title", content: "Profil Guru — GuruPro" },
      {
        property: "og:description",
        content: "Atur data guru, sekolah, mata pelajaran, dan kelas yang diampu di GuruPro.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProfilPage,
});

const FIELDS: Array<{ key: keyof GuruProfile; label: string; placeholder: string }> = [
  { key: "nama", label: "Nama Lengkap", placeholder: "Nama guru" },
  { key: "email", label: "Email", placeholder: "guru@sekolah.sch.id" },
  { key: "nip", label: "NIP / NUPTK", placeholder: "Nomor induk" },
  { key: "telepon", label: "Nomor Telepon", placeholder: "08xx-xxxx-xxxx" },
  { key: "sekolah", label: "Sekolah", placeholder: "Nama sekolah" },
  { key: "mapel", label: "Mata Pelajaran", placeholder: "Misal: Matematika" },
  { key: "kelas", label: "Kelas yang Diampu", placeholder: "Misal: X IPA 3, XI IPA 1" },
];

function ProfilPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { kelasList, anggotaList } = useKelas();

  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<GuruProfile>(profile);
  const [confirmLogout, setConfirmLogout] = useState(false);

  // Kelas state
  const myKelasList = kelasList.filter(
    (k) => k.guruEmail.toLowerCase() === profile.email.toLowerCase(),
  );
  const [selectedKelasId, setSelectedKelasId] = useState<string | null>(null);
  const selectedKelas: Kelas | null =
    myKelasList.find((k) => k.id === selectedKelasId) ?? myKelasList[0] ?? null;
  const [confirmPerbaruiKode, setConfirmPerbaruiKode] = useState(false);

  // Form buat kelas baru
  const [namaKelas, setNamaKelas] = useState("");
  const [tingkat, setTingkat] = useState("XI");
  const [mapelKelas, setMapelKelas] = useState(profile.mapel || "Matematika");
  const [tahunAjaran, setTahunAjaran] = useState("2025/2026");
  const [loadingBuatKelas, setLoadingBuatKelas] = useState(false);

  useEffect(() => {
    if (!edit) setDraft(profile);
  }, [profile, edit]);




  const simpan = () => {
    if (!draft.nama.trim() || !draft.email.trim()) {
      toast.error("Nama dan email wajib diisi.");
      return;
    }
    updateProfile(draft);
    setEdit(false);
    toast.success("Profil berhasil diperbarui.");
  };

  const handleBuatKelas = (e: React.FormEvent) => {
    e.preventDefault();
    if (!namaKelas.trim()) {
      toast.error("Nama kelas wajib diisi (misal: IPA 1).");
      return;
    }
    if (!tingkat.trim()) {
      toast.error("Tingkat / jenjang wajib diisi (misal: XI).");
      return;
    }
    if (!mapelKelas.trim()) {
      toast.error("Mata pelajaran wajib diisi.");
      return;
    }

    setLoadingBuatKelas(true);
    try {
      const baru = buatKelas({
        namaKelas: namaKelas.trim(),
        tingkat: tingkat.trim(),
        mapel: mapelKelas.trim(),
        tahunAjaran: tahunAjaran.trim() || "2025/2026",
        guruEmail: profile.email,
      });

      setSelectedKelas(baru);
      setNamaKelas("");
      toast.success(`Kelas ${baru.tingkat} ${baru.namaKelas} berhasil dibuat!`);
    } catch {
      toast.error("Gagal membuat kelas.");
    } finally {
      setLoadingBuatKelas(false);
    }
  };

  const salinKode = (kode: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(kode);
      toast.success(`Kode kelas ${kode} disalin ke clipboard!`);
    }
  };

  const getLinkUndangan = (kode: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://gurupro.app";
    return `${origin}/gabung/${kode}`;
  };

  const salinLink = (kode: string) => {
    const link = getLinkUndangan(kode);
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(link);
      toast.success("Tautan undangan berhasil disalin ke clipboard!");
    }
  };

  const handlePerbaruiKode = () => {
    if (!selectedKelas) return;
    const updated = perbaruiKodeKelas(selectedKelas.id);
    if (updated) {
      setSelectedKelas(updated);
      toast.success("Kode & tautan undangan kelas berhasil diperbarui!");
    }
    setConfirmPerbaruiKode(false);
  };

  const hitungJumlahSiswa = (kelasId: string) => {
    return anggotaList.filter((a) => a.kelasId === kelasId && a.status === "aktif").length;
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Profil Guru"
        subtitle="Data ini dipakai pada modul ajar, soal, dan dokumen yang Anda unduh."
        actions={
          edit ? (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setDraft(profile);
                  setEdit(false);
                }}
              >
                <X className="h-4 w-4" />
                Batal
              </Button>
              <Button onClick={simpan}>
                <Save className="h-4 w-4" />
                Simpan Perubahan
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setEdit(true)}>
              <Pencil className="h-4 w-4" />
              Edit Profil
            </Button>
          )
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 p-5">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-brand-gradient font-display text-xl font-bold text-navy-foreground">
            {initials(profile.nama)}
          </span>
          <div className="min-w-0">
            <p className="font-display text-lg font-bold text-navy">{profile.nama}</p>
            <p className="text-sm text-muted-foreground">
              {profile.mapel} · {profile.sekolah}
            </p>
            <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-primary">
              <ShieldCheck className="h-3.5 w-3.5" />
              Akun terverifikasi (prototipe)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* SECTION KELAS YANG DIAMPU */}
      <div className="grid gap-6">
        <div>
          <h2 className="font-display text-xl font-bold text-navy">Kelas yang Diampu</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Kelola kelas, buat kode dan tautan undangan untuk siswa yang ingin bergabung.
          </p>
        </div>

        {/* Card Kode Kelas Terpilih / Baru */}
        {selectedKelas ? (
          <Card className="border-2 border-primary/30 bg-primary-soft/30 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="font-display text-base font-bold text-navy">
                  Tautan & Kode Undangan: {selectedKelas.tingkat} {selectedKelas.namaKelas}
                </CardTitle>
                <Badge variant="outline" className="border-primary/40 bg-card text-primary">
                  {selectedKelas.mapel} ({selectedKelas.tahunAjaran})
                </Badge>
              </div>
              <CardDescription>
                Bagikan kode atau tautan ini kepada siswa untuk mendaftar dan bergabung ke kelas Anda.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border bg-card p-3.5 shadow-xs">
                  <p className="text-xs font-semibold text-muted-foreground">Kode Kelas</p>
                  <p className="mt-1 font-mono text-2xl font-extrabold tracking-wider text-navy">
                    {selectedKelas.kodeKelas}
                  </p>
                </div>
                <div className="rounded-xl border bg-card p-3.5 shadow-xs">
                  <p className="text-xs font-semibold text-muted-foreground">Tautan Undangan Siswa</p>
                  <p className="mt-1 truncate font-mono text-sm text-primary">
                    {getLinkUndangan(selectedKelas.kodeKelas)}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={() => salinKode(selectedKelas.kodeKelas)}
                  className="gap-1.5 font-medium"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Salin Kode
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => salinLink(selectedKelas.kodeKelas)}
                  className="gap-1.5 font-medium"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  Salin Link
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmPerbaruiKode(true)}
                  className="ml-auto text-xs text-muted-foreground hover:text-destructive"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Perbarui Kode & Link
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Form Buat Kelas Baru */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-base text-navy">Buat Kelas Baru</CardTitle>
              <CardDescription>
                Tambahkan kelas baru untuk menghasilkan kode & link undangan siswa.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleBuatKelas} className="grid gap-3.5">
                <div className="grid gap-1.5">
                  <Label htmlFor="namaKelas">Nama Kelas</Label>
                  <Input
                    id="namaKelas"
                    value={namaKelas}
                    onChange={(e) => setNamaKelas(e.target.value)}
                    placeholder="Misal: IPA 1, RPL 2"
                    required
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="tingkat">Tingkat / Jenjang</Label>
                  <Input
                    id="tingkat"
                    value={tingkat}
                    onChange={(e) => setTingkat(e.target.value)}
                    placeholder="Misal: X, XI, XII"
                    required
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="mapelKelas">Mata Pelajaran</Label>
                  <Input
                    id="mapelKelas"
                    value={mapelKelas}
                    onChange={(e) => setMapelKelas(e.target.value)}
                    placeholder="Misal: Matematika"
                    required
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="tahunAjaran">Tahun Ajaran</Label>
                  <Input
                    id="tahunAjaran"
                    value={tahunAjaran}
                    onChange={(e) => setTahunAjaran(e.target.value)}
                    placeholder="Misal: 2025/2026"
                  />
                </div>

                <Button type="submit" disabled={loadingBuatKelas} className="mt-2 w-full gap-1.5 font-medium">
                  <Plus className="h-4 w-4" />
                  {loadingBuatKelas ? "Membuat…" : "Buat Kelas"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Tabel Daftar Kelas yang Sudah Dibuat */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-base text-navy">
                Daftar Kelas yang Sudah Dibuat
              </CardTitle>
              <CardDescription>
                Total {myKelasList.length} kelas aktif yang Anda kelola di GuruPro.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              {myKelasList.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-muted-foreground">
                  Belum ada kelas yang dibuat. Buat kelas pertama Anda melalui form di samping.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nama Kelas</TableHead>
                        <TableHead>Tingkat</TableHead>
                        <TableHead>Mata Pelajaran</TableHead>
                        <TableHead className="text-center">Siswa</TableHead>
                        <TableHead>Kode Kelas</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {myKelasList.map((k) => {
                        const jumlahSiswa = hitungJumlahSiswa(k.id);
                        const isSelected = selectedKelas?.id === k.id;
                        return (
                          <TableRow
                            key={k.id}
                            className={isSelected ? "bg-primary-soft/20 font-medium" : undefined}
                          >
                            <TableCell className="font-semibold text-navy">
                              {k.namaKelas}
                            </TableCell>
                            <TableCell>{k.tingkat}</TableCell>
                            <TableCell>{k.mapel}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary" className="gap-1">
                                <Users className="h-3 w-3" />
                                {jumlahSiswa}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                                {k.kodeKelas}
                              </code>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => salinKode(k.kodeKelas)}
                                  title="Salin Kode"
                                  className="h-8 px-2 text-xs"
                                >
                                  Kode
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => salinLink(k.kodeKelas)}
                                  title="Salin Link"
                                  className="h-8 px-2 text-xs"
                                >
                                  Link
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => toast.info("Fitur segera hadir")}
                                  className="h-8 px-2.5 text-xs"
                                >
                                  Kelola
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Data Guru Profil */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-base text-navy">Data Guru</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 pt-0 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key} className="grid gap-2">
              <Label htmlFor={f.key}>{f.label}</Label>
              {edit ? (
                <Input
                  id={f.key}
                  value={draft[f.key]}
                  placeholder={f.placeholder}
                  onChange={(e) => setDraft((prev) => ({ ...prev, [f.key]: e.target.value }))}
                />
              ) : (
                <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                  {profile[f.key] || "—"}
                </p>
              )}
            </div>
          ))}
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="bio">Tentang Saya</Label>
            {edit ? (
              <Textarea
                id="bio"
                rows={3}
                value={draft.bio}
                onChange={(e) => setDraft((prev) => ({ ...prev, bio: e.target.value }))}
              />
            ) : (
              <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm leading-relaxed">
                {profile.bio || "—"}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Logout Card */}
      <Card className="border-destructive/30">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="min-w-0">
            <p className="font-display font-semibold text-navy">Keluar dari akun</p>
            <p className="text-sm text-muted-foreground">
              Anda akan diarahkan ke halaman login. Data modul dan soal tetap tersimpan di perangkat.
            </p>
          </div>
          <Button
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setConfirmLogout(true)}
          >
            <LogOut className="h-4 w-4" />
            Log Out
          </Button>
        </CardContent>
      </Card>

      {/* Dialog Konfirmasi Perbarui Kode */}
      <AlertDialog open={confirmPerbaruiKode} onOpenChange={setConfirmPerbaruiKode}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Perbarui Kode & Tautan Undangan?</AlertDialogTitle>
            <AlertDialogDescription>
              Kode dan tautan lama akan langsung tidak berlaku. Siswa yang belum bergabung perlu
              diberikan kode atau tautan baru.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handlePerbaruiKode}>
              Ya, Perbarui
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog Konfirmasi Logout */}
      <AlertDialog open={confirmLogout} onOpenChange={setConfirmLogout}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Keluar dari GuruPro?</AlertDialogTitle>
            <AlertDialogDescription>
              Anda perlu masuk kembali untuk mengakses modul ajar dan bank soal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                logout();
                toast.success("Anda telah keluar dari GuruPro.");
                navigate({ to: "/login", replace: true });
              }}
            >
              Log Out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
