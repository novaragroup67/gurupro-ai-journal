import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { KeyRound, Loader2, Mail } from "lucide-react";
import { useState } from "react";
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

  const kirimTautan = (e: React.FormEvent) => {
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
    window.setTimeout(() => {
      const ok = requestPasswordReset(email);
      setLoading(false);
      if (!ok) {
        setError("Email tidak ditemukan pada akun guru di perangkat ini.");
        toast.error("Email tidak terdaftar.");
        return;
      }
      toast.success("Tautan reset disiapkan. Lanjutkan ke kata sandi baru.");
      setError("");
      setStep("baru");
    }, 700);
  };

  const simpanSandi = (e: React.FormEvent) => {
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
    window.setTimeout(() => {
      const ok = completePasswordReset(email, password);
      setLoading(false);
      if (!ok) {
        setError("Reset gagal. Ulangi dari email terdaftar.");
        return;
      }
      toast.success("Kata sandi diperbarui. Silakan masuk.");
      navigate({ to: "/login", replace: true });
    }, 700);
  };

  return (
    <AuthLayout>
      <h1 className="font-display text-2xl font-bold text-navy sm:text-3xl">Reset Kata Sandi — Guru</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {step === "email"
          ? "Tautan reset dikirim ke email terdaftar, berlaku sementara. Setelah tautan dikonfirmasi, guru mengisi kata sandi baru."
          : "Masukkan kata sandi baru untuk akun Anda."}
      </p>

      <Card className="mt-6">
        <CardContent className="p-5 sm:p-6">
          {step === "email" ? (
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
                  aria-invalid={!!error}
                />
                {error ? <p className="text-xs text-destructive">{error}</p> : null}
              </div>
              <Button type="submit" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                {loading ? "Mengirim…" : "Kirim Tautan Reset"}
              </Button>
            </form>
          ) : (
            <form className="grid gap-4" onSubmit={simpanSandi} noValidate>
              <div className="grid gap-2">
                <Label htmlFor="password">Kata Sandi Baru</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
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
                  value={confirm}
                  onChange={(e) => {
                    setConfirm(e.target.value);
                    setError("");
                  }}
                />
                {error ? <p className="text-xs text-destructive">{error}</p> : null}
              </div>
              <Button type="submit" disabled={loading}>
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
