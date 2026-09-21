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

export type ProfileStatus = "idle" | "loading" | "loaded" | "missing" | "error";

export interface AuthState {
  ready: boolean;
  signedIn: boolean;
  user: User | null;
  profile: GuruProfile;
  profileStatus: ProfileStatus;
  profileError: string | null;
}

export type LoginResult = { ok: true } | { ok: false; message: string; code?: string };

export type RegisterResult =
  | { ok: true; user?: User; needsConfirmation?: boolean; message?: string }
  | { ok: false; message: string; code?: string };

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
  profileStatus: "idle",
  profileError: null,
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

export type FetchProfileResult =
  | { status: "loaded"; profile: GuruProfile }
  | { status: "missing"; profile: GuruProfile }
  | { status: "error"; message: string; profile: GuruProfile };

export async function fetchProfileForUser(user: User): Promise<FetchProfileResult> {
  const fallbackProfile: GuruProfile = {
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

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.error("[Auth] Real DB/RLS query error during fetchProfileForUser:", error.message, error);
      return {
        status: "error",
        message: error.message || "Gagal memuat profil akun dari basis data.",
        profile: fallbackProfile,
      };
    }

    if (!data) {
      console.warn("[Auth] No profile row found in DB for auth.uid():", user.id);
      return {
        status: "missing",
        profile: fallbackProfile,
      };
    }

    // Fail-safe role validation: strictly from DB, never trust client user_metadata for role elevation
    const rawRole = data.role || "";
    const validatedRole =
      rawRole === "guru" || rawRole === "siswa" || rawRole === "admin" ? rawRole : "";

    const resolvedNisn =
      data.nisn ||
      (validatedRole === "siswa" ? data.nip : "") ||
      "";
    const resolvedNip =
      validatedRole === "siswa" ? "" : data.nip || "";

    return {
      status: "loaded",
      profile: {
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
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat memuat data profil.";
    console.error("[Auth] Unexpected error fetching profile:", err);
    return {
      status: "error",
      message: msg,
      profile: fallbackProfile,
    };
  }
}

let authRequestId = 0;

async function syncProfile(user: User | null): Promise<FetchProfileResult | null> {
  const reqId = ++authRequestId;
  if (!user) {
    setState({
      ready: true,
      signedIn: false,
      user: null,
      profile: DEFAULT_PROFILE,
      profileStatus: "idle",
      profileError: null,
    });
    return null;
  }

  // Set loading status jika profil belum loaded
  if (state.profileStatus !== "loaded" || state.user?.id !== user.id) {
    setState({
      ready: true,
      signedIn: true,
      user,
      profileStatus: "loading",
      profileError: null,
    });
  }

  const result = await fetchProfileForUser(user);

  // Jika ada request auth yang lebih baru saat query berjalan, abaikan hasil usang
  if (reqId !== authRequestId) {
    return result;
  }

  setState({
    ready: true,
    signedIn: true,
    user,
    profile: result.profile,
    profileStatus: result.status,
    profileError: result.status === "error" ? result.message : null,
  });

  return result;
}

export async function refreshProfile(): Promise<FetchProfileResult | null> {
  const current = get();
  if (!current.user) return null;
  return syncProfile(current.user);
}

let initialized = false;

function initAuth() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  // Cek session saat pertama kali load
  supabase.auth.getSession().then(({ data: { session }, error }) => {
    if (error || !session?.user) {
      setState({
        ready: true,
        signedIn: false,
        user: null,
        profile: DEFAULT_PROFILE,
        profileStatus: "idle",
        profileError: null,
      });
      return;
    }
    void syncProfile(session.user);
  });

  // Listen perubahan auth state (misal login, logout, token refresh)
  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user) {
      void syncProfile(session.user);
    } else {
      void syncProfile(null);
    }
  });
}

export function useAuth(): {
  ready: boolean;
  signedIn: boolean;
  user: User | null;
  profile: GuruProfile;
  profileStatus: ProfileStatus;
  profileError: string | null;
  refreshProfile: () => Promise<FetchProfileResult | null>;
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
    profileStatus: current.profileStatus,
    profileError: current.profileError,
    refreshProfile,
  };
}

export async function login(
  email: string,
  password: string,
  _remember = true,
): Promise<LoginResult> {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error) {
      void logSystemEvent("auth_failure", "login_failed", error.message, {
        email: normalizedEmail,
      });

      const errMsg = error.message.toLowerCase();
      let userFacingMessage = error.message;

      if (errMsg.includes("invalid login credentials")) {
        userFacingMessage =
          "Email atau kata sandi tidak valid. Pastikan email dan kata sandi benar, serta email Anda sudah terverifikasi.";
      } else if (errMsg.includes("email not confirmed")) {
        userFacingMessage =
          "Email Anda belum dikonfirmasi. Silakan periksa tautan verifikasi pada kotak masuk atau folder spam email Anda.";
      } else if (errMsg.includes("rate limit") || errMsg.includes("too many requests")) {
        userFacingMessage =
          "Terlalu banyak percobaan masuk yang gagal. Silakan tunggu beberapa saat sebelum mencoba kembali.";
      }

      return { ok: false, message: userFacingMessage };
    }

    if (!data.session || !data.user) {
      void logSystemEvent("auth_failure", "session_not_created", "Sesi autentikasi tidak valid.", {
        email: normalizedEmail,
      });
      return { ok: false, message: "Sesi login tidak valid. Silakan coba masuk kembali." };
    }

    // Explicitly synchronize and await validated database profile
    const profileResult = await syncProfile(data.user);

    if (profileResult?.status === "error") {
      return {
        ok: false,
        message: `Terhubung ke akun, namun gagal memuat profil dari basis data: ${profileResult.message}. Silakan coba lagi.`,
        code: "database_error",
      };
    }

    if (profileResult?.status === "missing") {
      return {
        ok: false,
        message:
          "Profil akun tidak ditemukan di basis data. Silakan hubungi administrator untuk mendaftarkan profil Anda.",
        code: "profile_missing",
      };
    }

    if (
      profileResult?.status === "loaded" &&
      (!profileResult.profile.role ||
        (profileResult.profile.role !== "guru" &&
          profileResult.profile.role !== "siswa" &&
          profileResult.profile.role !== "admin"))
    ) {
      return {
        ok: false,
        message: "Peran akun Anda belum terdaftar di sistem. Silakan hubungi administrator.",
        code: "invalid_role",
      };
    }

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
      ...LOGGED_OUT,
      ready: true,
    });
  }
}

export async function registerGuru(
  input: RegisterGuruInput,
): Promise<RegisterResult> {
  try {
    const email = input.email.trim().toLowerCase();

    const redirectUrl =
      typeof window !== "undefined" && window.location.origin
        ? `${window.location.origin}/masuk`
        : "https://gurupro-ai-journal.vercel.app/masuk";

    // 1. Buat user di Supabase Auth
    // Trigger database handle_new_user() di Postgres akan otomatis menyisipkan profil ke public.profiles
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password: input.password,
      options: {
        emailRedirectTo: redirectUrl,
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
      const errMsg = authError.message.toLowerCase();
      const status = (authError as any).status;
      if (
        errMsg.includes("already registered") ||
        errMsg.includes("already taken") ||
        errMsg.includes("user already exists") ||
        (authError as any).code === "user_already_exists"
      ) {
        return {
          ok: false,
          message: "Email ini sudah terdaftar. Silakan masuk menggunakan akun Anda atau gunakan fitur lupa kata sandi.",
          code: "email_exists",
        };
      }
      if (
        errMsg.includes("rate limit") ||
        errMsg.includes("too many requests") ||
        errMsg.includes("security purposes") ||
        status === 429 ||
        (authError as any).code === "over_email_send_rate_limit" ||
        (authError as any).code === "over_request_rate_limit"
      ) {
        return {
          ok: false,
          message: "Batas pengiriman email sistem terlampaui. Silakan tunggu 1-2 menit sebelum mencoba mendaftar kembali.",
          code: "rate_limited",
        };
      }
      return { ok: false, message: authError.message };
    }

    const user = authData.user;
    if (!user) {
      return { ok: false, message: "Gagal membuat akun guru." };
    }

    // Supabase returns an empty identities array if the email is already registered
    if (Array.isArray(user.identities) && user.identities.length === 0) {
      return {
        ok: false,
        message: "Email ini sudah terdaftar. Silakan masuk menggunakan akun Anda atau gunakan fitur lupa kata sandi.",
        code: "email_exists",
      };
    }

    const needsConfirmation = !authData.session;
    const message = needsConfirmation
      ? "Pendaftaran berhasil! Tautan konfirmasi telah dikirimkan ke email Anda. Silakan verifikasi email Anda sebelum masuk."
      : "Pendaftaran akun guru berhasil! Silakan masuk dengan akun Anda.";

    return { ok: true, user, needsConfirmation, message };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat mendaftar.";
    return { ok: false, message: msg };
  }
}

export async function registerSiswa(
  input: RegisterSiswaInput,
): Promise<RegisterResult> {
  try {
    const email = input.email.trim().toLowerCase();

    // 1. Buat user di Supabase Auth
    // Trigger database handle_new_user() di Postgres akan otomatis menyisipkan profil ke public.profiles
    const redirectUrl =
      typeof window !== "undefined" && window.location.origin
        ? `${window.location.origin}/masuk`
        : "https://gurupro-ai-journal.vercel.app/masuk";
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password: input.password,
      options: {
        emailRedirectTo: redirectUrl,
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
      const errMsg = authError.message.toLowerCase();
      const status = (authError as any).status;
      if (
        errMsg.includes("already registered") ||
        errMsg.includes("already taken") ||
        errMsg.includes("user already exists") ||
        (authError as any).code === "user_already_exists"
      ) {
        return {
          ok: false,
          message: "Email ini sudah terdaftar. Silakan masuk menggunakan akun Anda atau gunakan fitur lupa kata sandi.",
          code: "email_exists",
        };
      }
      if (
        errMsg.includes("rate limit") ||
        errMsg.includes("too many requests") ||
        errMsg.includes("security purposes") ||
        status === 429 ||
        (authError as any).code === "over_email_send_rate_limit" ||
        (authError as any).code === "over_request_rate_limit"
      ) {
        return {
          ok: false,
          message: "Batas pengiriman email sistem terlampaui. Silakan tunggu 1-2 menit sebelum mencoba mendaftar kembali.",
          code: "rate_limited",
        };
      }
      return { ok: false, message: authError.message };
    }

    const user = authData.user;
    if (!user) {
      return { ok: false, message: "Gagal membuat akun siswa." };
    }

    // Supabase returns an empty identities array if the email is already registered
    if (Array.isArray(user.identities) && user.identities.length === 0) {
      return {
        ok: false,
        message: "Email ini sudah terdaftar. Silakan masuk menggunakan akun Anda atau gunakan fitur lupa kata sandi.",
        code: "email_exists",
      };
    }

    const needsConfirmation = !authData.session;
    const message = needsConfirmation
      ? "Pendaftaran berhasil! Tautan konfirmasi telah dikirimkan ke email Anda. Silakan verifikasi email Anda sebelum masuk."
      : "Pendaftaran akun siswa berhasil! Silakan masuk dengan akun Anda.";

    return { ok: true, user, needsConfirmation, message };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat mendaftar.";
    return { ok: false, message: msg };
  }
}

export async function updateProfile(
  patch: Partial<GuruProfile>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const current = get();
  if (!current.user) {
    return {
      ok: false,
      message: "Sesi autentikasi tidak ditemukan. Silakan login terlebih dahulu.",
    };
  }

  // Strip privilege & identity fields to prevent client-side authorization escalation
  const { role: _r, status_verifikasi: _s, id: _id, ...safePatch } = patch;
  const nextProfile = { ...current.profile, ...safePatch };

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

    // Update in-memory state only AFTER Supabase confirms write
    setState({ profile: nextProfile });
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
