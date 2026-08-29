import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2, LogIn, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { GuruProLogo } from "@/components/gurupro-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEMO_AKUN, login, useAuth } from "@/lib/auth-store";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Masuk ke GuruPro — Login Guru" },
      {
        name: "description",
        content:
          "Masuk ke akun GuruPro untuk menyusun modul ajar, bank soal, penugasan, dan penilaian dibantu AI.",
      },
      { property: "og:title", content: "Masuk ke GuruPro — Login Guru" },
      {
        property: "og:description",
        content: "Masuk ke akun GuruPro untuk mengelola administrasi pembelajaran Anda.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { ready, signedIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [ingat, setIngat] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string | undefined; password?: string | undefined }>({});

  useEffect(() => {
    if (ready && signedIn) navigate({ to: "/", replace: true });
  }, [ready, signedIn, navigate]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const found: typeof errors = {};
    if (!email.trim()) found.email = "Email wajib diisi.";
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) found.email = "Format email tidak valid.";
    if (!password) found.password = "Password wajib diisi.";
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setLoading(true);
    setTimeout(() => {
      const ok = login(email, password);
      setLoading(false);
      if (!ok) {
        setErrors({ password: "Email atau password salah." });
        toast.error("Login gagal. Periksa email dan password Anda.");
        return;
      }
      toast.success("Berhasil masuk. Selamat bekerja!");
      navigate({ to: "/", replace: true });
    }, 900);
  };

  const isiDemo = () => {
    setEmail(DEMO_AKUN.email);
    setPassword(DEMO_AKUN.password);
    setErrors({});
    toast.success("Akun demo terisi, tekan Masuk.");
  };

  return (
    <div className="grid min-h-screen w-full lg:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-navy p-10 text-navy-foreground lg:flex">
        <GuruProLogo variant="light" />
        <div className="grid gap-4">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            GuruPro AI
          </span>
          <h2 className="font-display text-3xl font-bold leading-tight">
            Guru fokus mengajar, GuruPro urus adminnya.
          </h2>
          <p className="max-w-md text-sm leading-relaxed text-navy-foreground/75">
            Susun modul ajar dari CP/ATP, eBook, teks, atau link luar. Lengkapi dengan ilustrasi dan PPT
            otomatis, lalu buat soal dibantu AI — semuanya dari satu dashboard.
          </p>
        </div>
        <p className="text-xs text-navy-foreground/60">Prototipe v2 — data disimpan di perangkat Anda.</p>
      </aside>

      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-6 flex justify-center lg:hidden">
            <GuruProLogo />
          </div>

          <h1 className="font-display text-2xl font-bold text-navy sm:text-3xl">Masuk ke GuruPro</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Gunakan akun guru Anda untuk melanjutkan.
          </p>

          <Card className="mt-6">
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
                    placeholder="guru@gurupro.id"
                    aria-invalid={!!errors.email}
                  />
                  {errors.email ? <p className="text-xs text-destructive">{errors.email}</p> : null}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="password">Password</Label>
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
                      aria-label={show ? "Sembunyikan password" : "Tampilkan password"}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                    >
                      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password ? <p className="text-xs text-destructive">{errors.password}</p> : null}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Checkbox checked={ingat} onCheckedChange={(v) => setIngat(v === true)} />
                    Ingat saya
                  </label>
                  <button
                    type="button"
                    className="text-sm font-medium text-primary hover:underline"
                    onClick={() => toast.info("Hubungi admin sekolah untuk reset password (prototipe).")}
                  >
                    Lupa password?
                  </button>
                </div>

                <Button type="submit" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                  {loading ? "Memeriksa akun…" : "Masuk"}
                </Button>
              </form>

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

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Belum punya akun? Pendaftaran guru dilakukan oleh admin sekolah.
          </p>
        </div>
      </main>
    </div>
  );
}
