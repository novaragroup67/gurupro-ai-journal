import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Eye,
  EyeOff,
  GraduationCap,
  Loader2,
  User,
  UserPlus,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerGuru, registerSiswa } from "@/lib/auth-store";
import { cn } from "@/lib/utils";

interface DaftarSearchParams {
  role?: "guru" | "siswa";
}

export const Route = createFileRoute("/daftar")({
  validateSearch: (search: Record<string, unknown>): DaftarSearchParams => {
    return {
      role: search["role"] === "siswa" ? "siswa" : search["role"] === "guru" ? "guru" : undefined,
    };
  },
  head: () => ({
    meta: [{ title: "Daftar Akun — GuruPro" }],
  }),
  component: DaftarPage,
});

type Role = "guru" | "siswa";

type FieldKey =
  | "nama"
  | "email"
  | "telepon"
  | "sekolah"
  | "mapel"
  | "nip"
  | "nisn"
  | "jenjang"
  | "password"
  | "confirm";

type FormErrors = Partial<Record<FieldKey, string>>;

function DaftarPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();

  const [role, setRole] = useState<Role>(search.role === "siswa" ? "siswa" : "guru");

  // Common fields
  const [nama, setNama] = useState("");
  const [email, setEmail] = useState("");
  const [telepon, setTelepon] = useState("");
  const [sekolah, setSekolah] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  // Guru fields
  const [mapel, setMapel] = useState("");
  const [nip, setNip] = useState("");

  // Siswa fields
  const [nisn, setNisn] = useState("");
  const [jenjang, setJenjang] = useState("XI");

  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  // Sync role jika query param berubah
  useEffect(() => {
    if (search.role === "siswa") setRole("siswa");
  }, [search.role]);

  const handleRoleChange = (nextRole: Role) => {
    setRole(nextRole);
    setErrors({});
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const found: FormErrors = {};

    // Common validations
    if (!nama.trim()) found.nama = "Nama lengkap wajib diisi.";
    if (!email.trim()) found.email = "Email wajib diisi.";
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) found.email = "Format email tidak valid.";
    if (!sekolah.trim()) found.sekolah = "Asal sekolah wajib diisi.";

    // Role-specific validations
    if (role === "guru") {
      if (!telepon.trim()) found.telepon = "Nomor HP wajib diisi.";
      if (!mapel.trim()) found.mapel = "Mata pelajaran yang diampu wajib diisi.";
      if (!nip.trim()) found.nip = "NIP / NUPTK wajib diisi.";
    } else {
      if (!nisn.trim()) found.nisn = "NISN wajib diisi.";
      if (!jenjang.trim()) found.jenjang = "Jenjang / angkatan wajib diisi.";
    }

    // Password validations
    if (!password) found.password = "Kata sandi wajib diisi.";
    else if (password.length < 6) found.password = "Kata sandi minimal 6 karakter.";
    if (confirm !== password) found.confirm = "Konfirmasi kata sandi tidak sama.";

    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setLoading(true);
    try {
      if (role === "guru") {
        const result = await registerGuru({
          nama,
          email,
          telepon,
          sekolah,
          mapel,
          nip,
          password,
        });

        if (!result.ok) {
          setErrors({ email: result.message });
          toast.error(result.message || "Pendaftaran gagal. Periksa kembali data Anda.");
          return;
        }

        toast.success("Pendaftaran akun guru berhasil! Silakan masuk dengan akun Anda.");
        void navigate({ to: "/login", replace: true });
      } else {
        const result = await registerSiswa({
          nama,
          email,
          telepon,
          sekolah,
          jenjang,
          nisn,
          password,
        });

        if (!result.ok) {
          setErrors({ email: result.message });
          toast.error(result.message || "Pendaftaran gagal. Periksa kembali data Anda.");
          return;
        }

        toast.success("Pendaftaran akun siswa berhasil! Silakan masuk dengan akun Anda.");
        void navigate({ to: "/login", replace: true });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat pendaftaran.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const renderField = (
    id: FieldKey,
    label: string,
    value: string,
    onChange: (v: string) => void,
    opts?: { type?: string; autoComplete?: string; placeholder?: string; disabled?: boolean },
  ) => (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={opts?.type ?? "text"}
        autoComplete={opts?.autoComplete}
        placeholder={opts?.placeholder}
        disabled={opts?.disabled}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setErrors((p) => {
            const next = { ...p };
            delete next[id];
            return next;
          });
        }}
        aria-invalid={!!errors[id]}
      />
      {errors[id] ? <p className="text-xs text-destructive">{errors[id]}</p> : null}
    </div>
  );

  return (
    <AuthLayout>
      <h1 className="font-display text-2xl font-bold text-navy sm:text-3xl">
        {role === "guru" ? "Daftar Akun Guru" : "Daftar Akun Siswa"}
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {role === "guru"
          ? "Daftar akun guru untuk menyusun modul ajar, bank soal, dan mengelola kelas pembelajaran."
          : "Daftar akun siswa untuk mengakses pembelajaran, materi, dan tugas."}
      </p>

      {/* Pilihan Peran di Awal */}
      <div className="mt-6 grid grid-cols-2 gap-2 rounded-xl bg-muted p-1 text-sm font-medium">
        <button
          type="button"
          onClick={() => handleRoleChange("guru")}
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg py-2.5 transition-all",
            role === "guru"
              ? "bg-card font-semibold text-navy shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <GraduationCap className="h-4 w-4" />
          👩‍🏫 Saya Guru
        </button>
        <button
          type="button"
          onClick={() => handleRoleChange("siswa")}
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg py-2.5 transition-all",
            role === "siswa"
              ? "bg-card font-semibold text-navy shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <User className="h-4 w-4" />
          🎓 Saya Siswa
        </button>
      </div>

      <Card className="mt-4">
        <CardContent className="p-5 sm:p-6">
          <form className="grid gap-4" onSubmit={submit} noValidate>
            {renderField("nama", "Nama Lengkap", nama, setNama, {
              autoComplete: "name",
              placeholder: role === "guru" ? "Nama lengkap beserta gelar" : "Nama lengkap siswa",
            })}

            {role === "siswa"
              ? renderField("nisn", "NISN", nisn, setNisn, {
                  placeholder: "Nomor Induk Siswa Nasional",
                })
              : null}

            {renderField("email", "Email", email, setEmail, {
              type: "email",
              autoComplete: "email",
              placeholder: "alamat.email@sekolah.sch.id",
            })}

            {renderField("telepon", "No. HP", telepon, setTelepon, {
              type: "tel",
              autoComplete: "tel",
              placeholder: "08xx-xxxx-xxxx",
            })}

            {renderField("sekolah", "Asal Sekolah", sekolah, setSekolah, {
              placeholder: "Contoh: SMKN 1 Jakarta",
            })}

            {/* Field khusus Guru */}
            {role === "guru" ? (
              <>
                {renderField("mapel", "Mata Pelajaran yang Diampu", mapel, setMapel, {
                  placeholder: "Contoh: Pemrograman Web",
                })}
                {renderField("nip", "NIP / NUPTK", nip, setNip, {
                  placeholder: "Sebagai verifikasi identitas guru",
                })}
              </>
            ) : null}

            {/* Field khusus Siswa */}
            {role === "siswa" ? (
              <>
                {renderField("jenjang", "Jenjang / Angkatan", jenjang, setJenjang, {
                  placeholder: "Misal: X, XI, XII",
                })}
              </>
            ) : null}

            <div className="grid gap-2">
              <Label htmlFor="password">Kata Sandi</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Minimal 6 karakter"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrors((p) => {
                      const next = { ...p };
                      delete next.password;
                      return next;
                    });
                  }}
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

            <div className="grid gap-2">
              <Label htmlFor="confirm">Konfirmasi Kata Sandi</Label>
              <Input
                id="confirm"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Ulangi kata sandi"
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  setErrors((p) => {
                    const next = { ...p };
                    delete next.confirm;
                    return next;
                  });
                }}
                aria-invalid={!!errors.confirm}
              />
              {errors.confirm ? <p className="text-xs text-destructive">{errors.confirm}</p> : null}
            </div>

            <Button type="submit" disabled={loading} className="uppercase tracking-wide">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              {loading ? "Menyimpan…" : `Daftar sebagai ${role === "guru" ? "Guru" : "Siswa"}`}
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        Sudah punya akun?{" "}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Masuk di sini
        </Link>
      </p>
    </AuthLayout>
  );
}
