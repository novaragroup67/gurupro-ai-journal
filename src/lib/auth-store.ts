import { useEffect, useState, useSyncExternalStore } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { logSystemEvent } from "@/lib/admin-store";

export interface GuruProfile {
  id?: string;
  nama: string;
  email: string;
  nip: string;
  nisn?: string;
  sekolah: string;
  mapel: string;
  kelas: string;
  telepon: string;
  bio: string;
  role?: "guru" | "siswa" | "admin" | string;
  status_verifikasi?: "menunggu" | "terverifikasi" | "ditolak" | string;
}

export type UserProfile = GuruProfile;

export interface AuthState {
  ready: boolean;
  signedIn: boolean;
  user: User | null;
  profile: GuruProfile;
}

export type LoginResult = { ok: true } | { ok: false; message: string };

export type RegisterGuruInput = {
  nama: string;
  email: string;
  telepon: string;
  sekolah: string;
  mapel: string;
  nip: string;
  password: string;
};

export type RegisterSiswaInput = {
  nama: string;
  email: string;
  telepon?: string;
  sekolah: string;
  jenjang: string;
  nisn: string;
  password: string;
};

export type RegisterInput = RegisterGuruInput;

export const AUTH_PUBLIC_PATHS = [
  "/login",
  "/daftar",
  "/lupa-kata-sandi",
  "/landing",
  "/gabung",
] as const;

export function isAuthPublicPath(pathname: string) {
  const clean = pathname.replace(/\/+$/, "") || "/";
  return (
    (AUTH_PUBLIC_PATHS as readonly string[]).includes(
      clean as (typeof AUTH_PUBLIC_PATHS)[number],
    ) || clean.startsWith("/gabung/")
  );
}

export const DEFAULT_PROFILE: GuruProfile = {
  id: "",
  nama: "Pengguna GuruPro",
  email: "",
  nip: "",
  nisn: "",
  sekolah: "",
  mapel: "",
  kelas: "",
  telepon: "",
  bio: "",
  role: "",
  status_verifikasi: "terverifikasi",
};

const LOGGED_OUT: AuthState = {
  ready: false,
  signedIn: false,
  user: null,
  profile: DEFAULT_PROFILE,
};

let state: AuthState = { ...LOGGED_OUT };
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

const get = () => state;

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function setState(next: Partial<AuthState>) {
  state = { ...state, ...next };
  emit();
}

export function isGuru(profile: GuruProfile): boolean {
  return profile?.role === "guru";
}

export function isSiswa(profile: GuruProfile): boolean {
  return profile?.role === "siswa";
}

export function isAdmin(profile: GuruProfile): boolean {
  return profile?.role === "admin";
}

async function fetchProfileForUser(user: User): Promise<GuruProfile> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.warn("[Auth] Failed to load profile from DB:", error.message);
    }

    // Fail-safe role validation: strictly from DB, never trust client user_metadata for role elevation
    const rawRole = data?.role || "";
    const validatedRole =
      rawRole === "guru" || rawRole === "siswa" || rawRole === "admin" ? rawRole : "";

    if (data) {
      const resolvedNisn =
        data.nisn ||
        (validatedRole === "siswa" ? data.nip : "") ||
        "";
      const resolvedNip =
        validatedRole === "siswa" ? "" : data.nip || "";

      return {
        id: data.id,
        nama: data.nama || "Pengguna",
        email: data.email || user.email || "",
        nip: resolvedNip,
        nisn: resolvedNisn,
        sekolah: data.sekolah || "",
        mapel: data.mapel || "",
        kelas: data.kelas || "",
        telepon: data.telepon || "",
        bio: data.bio || "",
        role: validatedRole,
        status_verifikasi: data.status_verifikasi || (validatedRole === "guru" ? "menunggu" : "terverifikasi"),
      };
    }

    // Fallback jika baris di tabel profiles belum ada (tidak ada akses role guru/admin tanpa baris DB)
    return {
      id: user.id,
      nama: user.email?.split("@")[0] || "Pengguna",
      email: user.email || "",
      nip: "",
      nisn: "",
      sekolah: "",
      mapel: "",
      kelas: "",
      telepon: "",
      bio: "",
      role: "",
      status_verifikasi: "menunggu",
    };
  } catch (err) {
    console.error("[Auth] Unexpected error fetching profile:", err);
    return {
      id: user.id,
      nama: user.email?.split("@")[0] || "Pengguna",
      email: user.email || "",
      nip: "",
      nisn: "",
      sekolah: "",
      mapel: "",
      kelas: "",
      telepon: "",
      bio: "",
      role: "",
    };
  }
}

let initialized = false;

function initAuth() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  // Cek session saat pertama kali load
  supabase.auth.getSession().then(async ({ data: { session }, error }) => {
    if (error || !session?.user) {
      setState({ ready: true, signedIn: false, user: null, profile: DEFAULT_PROFILE });
      return;
    }

    const profile = await fetchProfileForUser(session.user);
    setState({
      ready: true,
      signedIn: true,
      user: session.user,
      profile,
    });
  });

  // Listen perubahan auth state (misal login, logout, token refresh)
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      const profile = await fetchProfileForUser(session.user);
      setState({
        ready: true,
        signedIn: true,
        user: session.user,
        profile,
      });
    } else {
      setState({
        ready: true,
        signedIn: false,
        user: null,
        profile: DEFAULT_PROFILE,
      });
    }
  });
}

export function useAuth(): {
  ready: boolean;
  signedIn: boolean;
  user: User | null;
  profile: GuruProfile;
} {
  const current = useSyncExternalStore(subscribe, get, () => LOGGED_OUT);

  useEffect(() => {
    initAuth();
  }, []);

  return {
    ready: current.ready,
    signedIn: current.signedIn,
    user: current.user,
    profile: current.profile,
  };
}

export async function login(
  email: string,
  password: string,
  _remember = true,
): Promise<LoginResult> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      void logSystemEvent("auth_failure", "login_failed", error.message, {
        email: email.trim().toLowerCase(),
      });
      return { ok: false, message: error.message };
    }

    if (!data.user) {
      void logSystemEvent("auth_failure", "user_not_found", "Pengguna tidak ditemukan.", {
        email: email.trim().toLowerCase(),
      });
      return { ok: false, message: "Pengguna tidak ditemukan." };
    }

    const profile = await fetchProfileForUser(data.user);
    setState({
      ready: true,
      signedIn: true,
      user: data.user,
      profile,
    });

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat masuk.";
    void logSystemEvent("error", "login_exception", msg, {
      email: email.trim().toLowerCase(),
    });
    return { ok: false, message: msg };
  }
}

export async function logout(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.error("[Auth] Sign out error:", err);
  } finally {
    setState({
      ready: true,
      signedIn: false,
      user: null,
      profile: DEFAULT_PROFILE,
    });
  }
}

export async function registerGuru(
  input: RegisterGuruInput,
): Promise<{ ok: true; user?: User } | { ok: false; message: string }> {
  try {
    const email = input.email.trim().toLowerCase();

    // 1. Buat user di Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password: input.password,
      options: {
        data: {
          nama: input.nama.trim(),
          role: "guru",
          sekolah: input.sekolah.trim(),
          mapel: input.mapel.trim(),
          nip: input.nip.trim(),
          telepon: input.telepon.trim(),
        },
      },
    });

    if (authError) {
      return { ok: false, message: authError.message };
    }

    const user = authData.user;
    if (!user) {
      return { ok: false, message: "Gagal membuat akun." };
    }

    // 2. Simpan profil di tabel profiles (menggunakan user.id, tanpa password)
    const { error: profileError } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        nama: input.nama.trim(),
        email,
        nip: input.nip.trim(),
        nisn: "",
        sekolah: input.sekolah.trim(),
        mapel: input.mapel.trim(),
        kelas: "",
        telepon: input.telepon.trim(),
        bio: "",
        role: "guru",
        status_verifikasi: "menunggu",
      },
      { onConflict: "id" },
    );

    if (profileError) {
      console.warn("[Auth] Failed to insert profile row:", profileError.message);
    }

    return { ok: true, user };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat mendaftar.";
    return { ok: false, message: msg };
  }
}

export async function registerSiswa(
  input: RegisterSiswaInput,
): Promise<{ ok: true; user?: User } | { ok: false; message: string }> {
  try {
    const email = input.email.trim().toLowerCase();

    // 1. Buat user di Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password: input.password,
      options: {
        data: {
          nama: input.nama.trim(),
          role: "siswa",
          sekolah: input.sekolah.trim(),
          jenjang: input.jenjang.trim(),
          nisn: input.nisn.trim(),
          telepon: (input.telepon ?? "").trim(),
        },
      },
    });

    if (authError) {
      return { ok: false, message: authError.message };
    }

    const user = authData.user;
    if (!user) {
      return { ok: false, message: "Gagal membuat akun siswa." };
    }

    // 2. Simpan profil di tabel profiles (menggunakan user.id, tanpa password)
    const { error: profileError } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        nama: input.nama.trim(),
        email,
        nip: "",
        nisn: input.nisn.trim(),
        sekolah: input.sekolah.trim(),
        mapel: "Siswa",
        kelas: input.jenjang.trim(),
        telepon: (input.telepon ?? "").trim(),
        bio: "",
        role: "siswa",
      },
      { onConflict: "id" },
    );

    if (profileError) {
      console.warn("[Auth] Failed to insert student profile row:", profileError.message);
    }

    return { ok: true, user };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat mendaftar.";
    return { ok: false, message: msg };
  }
}

export async function updateProfile(
  patch: Partial<GuruProfile>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const current = get();
  // Strip privilege & identity fields to prevent client-side authorization escalation
  const { role: _r, status_verifikasi: _s, id: _id, ...safePatch } = patch;
  const nextProfile = { ...current.profile, ...safePatch };
  setState({ profile: nextProfile });

  if (!current.user) {
    return { ok: true };
  }

  try {
    const { error } = await supabase
      .from("profiles")
      .update({
        nama: nextProfile.nama,
        nip: nextProfile.nip,
        nisn: nextProfile.nisn ?? "",
        sekolah: nextProfile.sekolah,
        mapel: nextProfile.mapel,
        kelas: nextProfile.kelas,
        telepon: nextProfile.telepon,
        bio: nextProfile.bio,
      })
      .eq("id", current.user.id);

    if (error) {
      return { ok: false, message: error.message };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal memperbarui profil di database.";
    return { ok: false, message: msg };
  }
}

export async function requestPasswordReset(
  email: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const redirectUrl =
      typeof window !== "undefined" ? `${window.location.origin}/lupa-kata-sandi` : undefined;

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: redirectUrl,
    });

    if (error) {
      return { ok: false, message: error.message };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal mengirim permintaan reset kata sandi.";
    return { ok: false, message: msg };
  }
}

export async function completePasswordReset(
  password: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      return { ok: false, message: error.message };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal memperbarui kata sandi.";
    return { ok: false, message: msg };
  }
}

export function initials(nama: string | undefined | null) {
  if (!nama || typeof nama !== "string") return "GP";
  return (
    nama
      .replace(/^(Bu|Pak|Bapak|Ibu)\s+/i, "")
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0] ?? "")
      .join("")
      .toUpperCase() || "GP"
  );
}

export function shortName(nama: string | undefined | null) {
  if (!nama || typeof nama !== "string") return "Pengguna";
  const parts = nama.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).join(" ") || "Pengguna";
}
