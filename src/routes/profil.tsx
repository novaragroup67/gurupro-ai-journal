import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LogOut, Pencil, Save, ShieldCheck, X } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { initials, logout, updateProfile, useAuth, type GuruProfile } from "@/lib/auth-store";

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
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<GuruProfile>(profile);
  const [confirmLogout, setConfirmLogout] = useState(false);

  useEffect(() => {
    if (!edit) setDraft(profile);
  }, [profile, edit]);

  const simpan = () => {
    if (!draft.nama.trim() || !draft.email.trim()) {
      toast.error("Nama dan email wajib diisi.");
      return;
    }
    void updateProfile(draft);
    setEdit(false);
    toast.success("Profil berhasil diperbarui.");
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
                void logout();
                toast.success("Anda telah keluar dari GuruPro.");
                navigate({ to: "/auth", replace: true });
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
