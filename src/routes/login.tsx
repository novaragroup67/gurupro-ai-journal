import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Link as LinkIcon, Loader2, LogIn, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { activatePendingAccount, DEMO_AKUN, login, useAuth } from "@/lib/auth-store";
import { ajukanGabung, getKelasByKode } from "@/lib/kelas-store";

interface LoginSearchParams {
  kode?: string | undefined;
}

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearchParams => {
    return {
      kode: typeof search["kode"] === "string" ? (search["kode"] as string) : undefined,
    };
  },
  head: () => ({
    meta: [
      { title: "Masuk — GuruPro" },
      {
        name: "description",
        content: "Masuk ke akun GuruPro untuk mengelola administrasi pembelajaran Anda.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { profile } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [ingat, setIngat] = useState(true);
  const [loading, setLoading] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ email?: string | undefined; password?: string | undefined }>({});

  const [kodeKelas, setKodeKelas] = useState(search.kode ?? "");

  useEffect(() => {
    if (!kodeKelas && typeof window !== "undefined") {
      try {
        const pending = window.sessionStorage.getItem("gurupro.pending-kode");
        if (pending) setKodeKelas(pending);
      } catch {
        /* ignore */
      }
    }
  }, [kodeKelas]);

  const kelasInfo = kodeKelas ? getKelasByKode(kodeKelas) : undefined;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const found: typeof errors = {};
    if (!email.trim()) found.email = "Email wajib diisi.";
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) found.email = "Format email tidak valid.";
    if (!password) found.password = "Kata sandi wajib diisi.";
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setLoading(true);
    setPendingEmail(null);
    window.setTimeout(() => {
      const result = login(email, password, ingat);
      setLoading(false);
      if (!result.ok && result.reason === "pending") {
        setPendingEmail(email.trim().toLowerCase());
        toast.error("Akun masih menunggu verifikasi Admin.");
        return;
      }
      if (!result.ok) {
        setErrors({ password: "Email atau kata sandi salah." });
        toast.error("Login gagal. Periksa email dan kata sandi Anda.");
        return;
      }

      // Cek jika ada kode undangan kelas
      if (kelasInfo) {
        ajukanGabung({
          kelasId: kelasInfo.id,
          siswaEmail: email.trim().toLowerCase(),
          siswaNama: profile.nama || email.split("@")[0] || "Siswa",
          siswaNisn: profile.nip || "",
          jenis: "tambah-kelas",
        });

        if (typeof window !== "undefined") {
          try {
            window.sessionStorage.removeItem("gurupro.pending-kode");
          } catch {
            /* ignore */
          }
        }
        toast.success("Berhasil masuk. Permintaan gabung kelas telah dikirim ke guru.");
        void navigate({ to: "/", replace: true });
        return;
      }

      toast.success("Berhasil masuk. Selamat bekerja!");
      void navigate({ to: "/", replace: true });
    }, 700);
  };

  const isiDemo = () => {
    setEmail(DEMO_AKUN.email);
    setPassword(DEMO_AKUN.password);
    setErrors({});
    setPendingEmail(null);
    toast.success("Akun demo terisi. Tekan MASUK.");
  };

  const aktifkanPrototipe = () => {
    if (!pendingEmail) return;
    activatePendingAccount(pendingEmail);
    toast.success("Akun diaktifkan (simulasi Admin). Silakan masuk kembali.");
    setPendingEmail(null);
  };

  return (
    <AuthLayout>
      <h1 className="font-display text-2xl font-bold text-navy sm:text-3xl">Masuk ke GuruPro</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Masuk dengan email dan kata sandi akun Anda.</p>

      {/* Banner jika login membawa kode kelas */}
      {kelasInfo ? (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-primary/30 bg-primary-soft/60 p-3 text-sm text-navy">
          <LinkIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="font-semibold text-primary">Tautan Undangan Aktif</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Setelah masuk, permintaan gabung ke kelas{" "}
              <strong className="text-navy">{kelasInfo.mapel}</strong> ({kelasInfo.tingkat}{" "}
              {kelasInfo.namaKelas}) otomatis terkirim.
            </p>
          </div>
        </div>
      ) : null}

      <Card className="mt-4">
        <CardContent className="p-5 sm:p-6">
          <form className="grid gap-4" onSubmit={submit} noValidate>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErrors((p) => ({ ...p, email: undefined }));
                }}
                placeholder="nama@email.com"
                aria-invalid={!!errors.email}
              />
              {errors.email ? <p className="text-xs text-destructive">{errors.email}</p> : null}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="password">Kata sandi</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrors((p) => ({ ...p, password: undefined }));
                  }}
                  placeholder="••••••••"
                  className="pr-10"
                  aria-invalid={!!errors.password}
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password ? <p className="text-xs text-destructive">{errors.password}</p> : null}
            </div>

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked={ingat} onCheckedChange={(v) => setIngat(v === true)} />
              Ingat saya di perangkat ini
            </label>

            {pendingEmail ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                <p>Akun baru berstatus Menunggu. Aktif setelah Admin memverifikasi data dan identitas pendaftar.</p>
                <Button type="button" variant="outline" size="sm" className="mt-2" onClick={aktifkanPrototipe}>
                  Simulasi verifikasi Admin
                </Button>
              </div>
            ) : null}

            <Button type="submit" disabled={loading} className="uppercase tracking-wide">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              {loading ? "Memeriksa akun…" : "Masuk"}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            <Link to="/lupa-kata-sandi" className="font-medium text-primary hover:underline">
              Lupa kata sandi?
            </Link>
            <span className="px-1.5">·</span>
            <Link
              to="/daftar"
              search={kodeKelas ? { kode: kodeKelas, role: "siswa" as const } : {}}
              className="font-medium text-primary hover:underline"
            >
              Daftar akun baru
            </Link>
          </p>

          <div className="mt-5 rounded-xl border border-dashed p-3">
            <p className="flex items-center gap-2 text-xs font-semibold text-navy">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Akun demo prototipe
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {DEMO_AKUN.email} / {DEMO_AKUN.password}
            </p>
            <Button variant="outline" size="sm" className="mt-2" onClick={isiDemo}>
              Isi otomatis
            </Button>
          </div>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
