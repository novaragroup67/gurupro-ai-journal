import { useEffect, useState, useSyncExternalStore } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { logSystemEvent } from "@/lib/admin-store";
import { resetAllCloudStores } from "@/lib/cloud-store";

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
    console.error("[Auth] Exception in fetchProfileForUser:", msg);
    return {
      status: "error",
      message: msg,
      profile: fallbackProfile,
    };
  }
}

export async function refreshProfile(): Promise<FetchProfileResult | null> {
  const current = state.user;
  if (!current) return null;
  const res = await fetchProfileForUser(current);
  setState({
    profile: res.profile,
    profileStatus: res.status,
    profileError: res.status === "error" ? res.message : null,
  });
  return res;
}

export async function login(email: string, password: string): Promise<LoginResult> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.error("[Auth] Sign in error:", error.message);
      return { ok: false, message: error.message, code: error.status ? String(error.status) : undefined };
    }
    if (!data.user) {
      return { ok: false, message: "Gagal masuk: Data pengguna tidak ditemukan." };
    }

    // Proactively fetch profile right away
    const profRes = await fetchProfileForUser(data.user);

    setState({
      ready: true,
      signedIn: true,
      user: data.user,
      profile: profRes.profile,
      profileStatus: profRes.status,
      profileError: profRes.status === "error" ? profRes.message : null,
    });

    logSystemEvent({
      action: "LOGIN",
      category: "auth",
      detail: `Pengguna masuk: ${data.user.email} (${profRes.profile.role || "unknown"})`,
      userEmail: data.user.email || undefined,
      userRole: profRes.profile.role || undefined,
    });

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Terjadi kesalahan tidak terduga saat masuk.";
    return { ok: false, message: msg };
  }
}

export async function registerGuru(input: RegisterGuruInput): Promise<RegisterResult> {
  try {
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: {
          nama: input.nama,
          telepon: input.telepon,
          sekolah: input.sekolah,
          mapel: input.mapel,
          nip: input.nip,
          role: "guru",
        },
      },
    });

    if (error) {
      return { ok: false, message: error.message, code: error.status ? String(error.status) : undefined };
    }

    const needsConfirmation = !data.session && !!data.user;

    logSystemEvent({
      action: "REGISTER_GURU",
      category: "auth",
      detail: `Guru mendaftar: ${input.email} (${input.nama})`,
      userEmail: input.email,
      userRole: "guru",
    });

    return {
      ok: true,
      user: data.user || undefined,
      needsConfirmation,
      message: needsConfirmation
        ? "Pendaftaran berhasil! Silakan periksa email Anda untuk konfirmasi akun."
        : "Pendaftaran berhasil!",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Terjadi kesalahan tidak terduga saat mendaftar.";
    return { ok: false, message: msg };
  }
}

export async function registerSiswa(input: RegisterSiswaInput): Promise<RegisterResult> {
  try {
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: {
          nama: input.nama,
          telepon: input.telepon || "",
          sekolah: input.sekolah,
          jenjang: input.jenjang,
          nisn: input.nisn,
          role: "siswa",
        },
      },
    });

    if (error) {
      return { ok: false, message: error.message, code: error.status ? String(error.status) : undefined };
    }

    const needsConfirmation = !data.session && !!data.user;

    logSystemEvent({
      action: "REGISTER_SISWA",
      category: "auth",
      detail: `Siswa mendaftar: ${input.email} (${input.nama})`,
      userEmail: input.email,
      userRole: "siswa",
    });

    return {
      ok: true,
      user: data.user || undefined,
      needsConfirmation,
      message: needsConfirmation
        ? "Pendaftaran berhasil! Silakan periksa email Anda untuk konfirmasi akun."
        : "Pendaftaran berhasil!",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Terjadi kesalahan tidak terduga saat mendaftar.";
    return { ok: false, message: msg };
  }
}

export async function logout(): Promise<void> {
  try {
    const userEmail = state.user?.email;
    const userRole = state.profile?.role;
    if (userEmail) {
      logSystemEvent({
        action: "LOGOUT",
        category: "auth",
        detail: `Pengguna keluar: ${userEmail}`,
        userEmail,
        userRole,
      });
    }
    await supabase.auth.signOut();
  } catch (err) {
    console.error("[Auth] Error signing out:", err);
  } finally {
    resetAllCloudStores();
    setState({ ...LOGGED_OUT, ready: true });
  }
}

let authInitialized = false;

export function initAuth(): () => void {
  if (authInitialized) return () => {};
  authInitialized = true;

  supabase.auth.getSession().then(({ data: { session }, error }) => {
    if (error) {
      console.error("[Auth] Initial getSession error:", error.message);
      setState({ ready: true, signedIn: false, user: null, profile: DEFAULT_PROFILE });
      return;
    }

    if (session?.user) {
      fetchProfileForUser(session.user).then((res) => {
        setState({
          ready: true,
          signedIn: true,
          user: session.user,
          profile: res.profile,
          profileStatus: res.status,
          profileError: res.status === "error" ? res.message : null,
        });
      });
    } else {
      setState({ ready: true, signedIn: false, user: null, profile: DEFAULT_PROFILE });
    }
  });

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
      if (session?.user) {
        const res = await fetchProfileForUser(session.user);
        setState({
          ready: true,
          signedIn: true,
          user: session.user,
          profile: res.profile,
          profileStatus: res.status,
          profileError: res.status === "error" ? res.message : null,
        });
      }
    } else if (event === "SIGNED_OUT") {
      resetAllCloudStores();
      setState({ ...LOGGED_OUT, ready: true });
    }
  });

  return () => {
    subscription.unsubscribe();
  };
}

export function useAuth() {
  const s = useSyncExternalStore(subscribe, get, get);
  return {
    ready: s.ready,
    signedIn: s.signedIn,
    user: s.user,
    profile: s.profile,
    profileStatus: s.profileStatus,
    profileError: s.profileError,
    isGuru: isGuru(s.profile),
    isSiswa: isSiswa(s.profile),
    isAdmin: isAdmin(s.profile),
  };
}
