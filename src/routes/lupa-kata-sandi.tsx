import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { KeyRound, Loader2, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { completePasswordReset, requestPasswordReset } from "@/lib/auth-store";

export const Route = createFileRoute("/lupa-kata-sandi")({
  head: () => ({
    meta: [{ title: "Reset Kata Sandi — GuruPro" }],
  }),
  component: LupaKataSandiPage,
});

function LupaKataSandiPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "baru">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [linkTerkirim, setLinkTerkirim] = useState(false);

  // Deteksi jika pengguna tiba dari tautan reset password Supabase
  useEffect(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash;
      if (hash && (hash.includes("type=recovery") || hash.includes("access_token="))) {
        setStep("baru");
      }
    }
  }, []);

  const kirimTautan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Email akun terdaftar wajib diisi.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Format email tidak valid.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await requestPasswordReset(email);
      if (!res.ok) {
        setError(res.message);
        toast.error(res.message || "Gagal mengirim tautan reset.");
        return;
      }

      setLinkTerkirim(true);
      toast.success("Tautan reset kata sandi telah dikirim ke email Anda.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal memproses permintaan.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const simpanSandi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError("Kata sandi baru minimal 6 karakter.");
      return;
    }
    if (password !== confirm) {
      setError("Konfirmasi kata sandi tidak sama.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await completePasswordReset(password);
      if (!res.ok) {
        setError(res.message);
        toast.error(res.message || "Gagal memperbarui kata sandi.");
        return;
      }

      toast.success("Kata sandi berhasil diperbarui. Silakan masuk.");
      void navigate({ to: "/login", replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal memperbarui kata sandi.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <h1 className="font-display text-2xl font-bold text-navy sm:text-3xl">Reset Kata Sandi</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {step === "email"
          ? "Tautan reset dikirim ke email terdaftar. Setelah membuka tautan dari email, Anda dapat mengisi kata sandi baru."
          : "Masukkan kata sandi baru untuk akun GuruPro Anda."}
      </p>

      <Card className="mt-6">
        <CardContent className="p-5 sm:p-6">
          {step === "email" ? (
            linkTerkirim ? (
              <div className="grid gap-4 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Mail className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="font-display text-base font-semibold text-navy">Periksa Email Anda</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Kami telah mengirimkan tautan reset kata sandi ke <strong>{email}</strong>.
                    Silakan klik tautan pada email tersebut untuk melanjutkan pembuatan kata sandi baru.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setLinkTerkirim(false);
                    setEmail("");
                  }}
                >
                  Kirim Ulang atau Ganti Email
                </Button>
              </div>
            ) : (
              <form className="grid gap-4" onSubmit={kirimTautan} noValidate>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email akun terdaftar</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError("");
                    }}
                    placeholder="nama@email.com"
                    aria-invalid={!!error}
                  />
                  {error ? <p className="text-xs text-destructive">{error}</p> : null}
                </div>
                <Button type="submit" disabled={loading} className="uppercase tracking-wide">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  {loading ? "Mengirim…" : "Kirim Tautan Reset"}
                </Button>
              </form>
            )
          ) : (
            <form className="grid gap-4" onSubmit={simpanSandi} noValidate>
              <div className="grid gap-2">
                <Label htmlFor="password">Kata Sandi Baru</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Minimal 6 karakter"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirm">Konfirmasi Kata Sandi Baru</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Ulangi kata sandi baru"
                  value={confirm}
                  onChange={(e) => {
                    setConfirm(e.target.value);
                    setError("");
                  }}
                />
                {error ? <p className="text-xs text-destructive">{error}</p> : null}
              </div>
              <Button type="submit" disabled={loading} className="uppercase tracking-wide">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                {loading ? "Menyimpan…" : "Simpan Kata Sandi Baru"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <p className="mt-4 text-center text-sm">
        <Link to="/login" className="font-medium text-primary hover:underline">
          Kembali ke Login
        </Link>
      </p>
    </AuthLayout>
  );
}
