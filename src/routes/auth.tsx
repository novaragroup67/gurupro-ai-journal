import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Eye, EyeOff, Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { GuruProLogo } from "@/components/gurupro-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { login, register, resetPassword, useAuth } from "@/lib/auth-store";

type Mode = "login" | "daftar" | "lupa";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): { mode?: Mode } => {
    const mode = search["mode"];
    return mode === "daftar" || mode === "login" || mode === "lupa" ? { mode } : {};
  },
  head: () => ({
    meta: [
      { title: "Masuk atau Daftar — GuruPro" },
      {
        name: "description",
        content:
          "Buat akun guru GuruPro atau masuk untuk menyusun modul ajar dan bank soal berbantuan AI.",
      },
      { property: "og:title", content: "Masuk atau Daftar — GuruPro" },
      {
        property: "og:description",
        content: "Buat akun guru GuruPro atau masuk untuk mengelola modul ajar dan bank soal Anda.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { ready, signedIn } = useAuth();

  const [mode, setMode] = useState<Mode>(search.mode ?? "login");
  const [nama, setNama] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState("");

  useEffect(() => {
    if (ready && signedIn) navigate({ to: "/dashboard", replace: true });
  }, [ready, signedIn, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInfo("");
    const mail = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(mail)) {
      toast.error("Masukkan email yang valid.");
      return;
    }
    if (mode !== "lupa" && password.length < 6) {
      toast.error("Password minimal 6 karakter.");
      return;
    }
    if (mode === "daftar" && !nama.trim()) {
      toast.error("Nama lengkap wajib diisi.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "lupa") {
        const res = await resetPassword(mail);
        if (!res.ok) {
          toast.error(res.message);
          return;
        }
        setInfo("Tautan atur ulang password sudah dikirim ke email Anda.");
        toast.success("Email atur ulang password terkirim.");
        return;
      }

      if (mode === "daftar") {
        const res = await register(nama, mail, password);
        if (!res.ok) {
          toast.error(res.message);
          return;
        }
        if (res.needsConfirm) {
          setInfo("Akun dibuat. Periksa email Anda untuk konfirmasi, lalu masuk.");
          setMode("login");
          toast.success("Pendaftaran berhasil, cek email konfirmasi.");
          return;
        }
        toast.success("Akun dibuat. Selamat bergabung di GuruPro!");
        navigate({ to: "/dashboard", replace: true });
        return;
      }

      const res = await login(mail, password);
      if (!res.ok) {
        toast.error(
          /invalid/i.test(res.message) ? "Email atau password salah." : res.message,
        );
        return;
      }
      toast.success("Berhasil masuk. Selamat bekerja!");
      navigate({ to: "/dashboard", replace: true });
    } finally {
      setLoading(false);
    }
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
            Susun modul ajar dari link materi, dokumen, teks, atau CP/ATP. Lanjutkan dengan bank soal
            berbantuan AI — semuanya dari satu dashboard.
          </p>
        </div>
        <Link to="/" className="text-xs text-navy-foreground/60 hover:text-navy-foreground">
          ← Kembali ke halaman utama
        </Link>
      </aside>

      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center justify-between lg:hidden">
            <GuruProLogo />
            <Button asChild variant="ghost" size="sm">
              <Link to="/">
                <ArrowLeft className="h-4 w-4" />
                Beranda
              </Link>
            </Button>
          </div>

          <Tabs
            value={mode === "lupa" ? "login" : mode}
            onValueChange={(v) => {
              setMode(v as Mode);
              setInfo("");
            }}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="daftar">Daftar</TabsTrigger>
            </TabsList>
          </Tabs>

          <h1 className="mt-6 font-display text-2xl font-bold text-navy sm:text-3xl">
            {mode === "daftar"
              ? "Buat akun guru"
              : mode === "lupa"
                ? "Atur ulang password"
                : "Masuk ke GuruPro"}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {mode === "daftar"
              ? "Gratis, cukup nama, email, dan password."
              : mode === "lupa"
                ? "Kami kirim tautan atur ulang ke email Anda."
                : "Gunakan email dan password akun guru Anda."}
          </p>

          <Card className="mt-6">
            <CardContent className="p-5 sm:p-6">
              <form className="grid gap-4" onSubmit={submit} noValidate>
                {mode === "daftar" ? (
                  <div className="grid gap-2">
                    <Label htmlFor="nama">Nama Lengkap</Label>
                    <Input
                      id="nama"
                      autoComplete="name"
                      value={nama}
                      onChange={(e) => setNama(e.target.value)}
                      placeholder="Misal: Sari Wulandari"
                    />
                  </div>
                ) : null}

                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@sekolah.sch.id"
                  />
                </div>

                {mode !== "lupa" ? (
                  <div className="grid gap-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={show ? "text" : "password"}
                        autoComplete={mode === "daftar" ? "new-password" : "current-password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Minimal 6 karakter"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShow((s) => !s)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                        aria-label={show ? "Sembunyikan password" : "Tampilkan password"}
                      >
                        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                ) : null}

                {info ? (
                  <p className="rounded-lg bg-primary-soft px-3 py-2 text-xs text-primary">{info}</p>
                ) : null}

                <Button type="submit" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {mode === "daftar"
                    ? "Daftar Sekarang"
                    : mode === "lupa"
                      ? "Kirim Tautan Atur Ulang"
                      : "Masuk"}
                </Button>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  {mode === "lupa" ? (
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => setMode("login")}
                    >
                      Kembali ke login
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => {
                        setMode("lupa");
                        setInfo("");
                      }}
                    >
                      Lupa password?
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-primary"
                    onClick={() => {
                      setMode(mode === "daftar" ? "login" : "daftar");
                      setInfo("");
                    }}
                  >
                    {mode === "daftar" ? "Sudah punya akun? Masuk" : "Belum punya akun? Daftar"}
                  </button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
