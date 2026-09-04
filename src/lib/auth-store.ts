import { useEffect, useSyncExternalStore } from "react";

import { supabase } from "@/integrations/supabase/client";
import { resetAllCloudStores } from "./cloud-store";

export interface GuruProfile {
  nama: string;
  email: string;
  nip: string;
  sekolah: string;
  mapel: string;
  kelas: string;
  telepon: string;
  bio: string;
  role?: "guru" | "siswa";
}

export interface AuthState {
  ready: boolean;
  signedIn: boolean;
  userId: string | null;
  profile: GuruProfile;
}

export const DEFAULT_PROFILE: GuruProfile = {
  nama: "",
  email: "",
  nip: "",
  sekolah: "",
  mapel: "",
  kelas: "",
  telepon: "",
  bio: "",
};

const PENDING: AuthState = { ready: false, signedIn: false, userId: null, profile: DEFAULT_PROFILE };

let state: AuthState = PENDING;
let started = false;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());
const get = () => state;
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function set(next: AuthState) {
  state = next;
  emit();
}

async function loadProfile(userId: string, email: string): Promise<GuruProfile> {
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (data) {
    return {
      nama: data.nama || email.split("@")[0] || "Guru",
      email: data.email || email,
      nip: data.nip ?? "",
      sekolah: data.sekolah ?? "",
      mapel: data.mapel ?? "",
      kelas: data.kelas ?? "",
      telepon: data.telepon ?? "",
      bio: data.bio ?? "",
    };
  }
  const fresh: GuruProfile = { ...DEFAULT_PROFILE, email, nama: email.split("@")[0] || "Guru" };
  await supabase.from("profiles").insert({ id: userId, ...fresh });
  return fresh;
}

async function syncSession(userId: string | null, email: string | null) {
  if (!userId) {
    resetAllCloudStores();
    set({ ready: true, signedIn: false, userId: null, profile: DEFAULT_PROFILE });
    return;
  }
  const profile = await loadProfile(userId, email ?? "");
  set({ ready: true, signedIn: true, userId, profile });
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  void supabase.auth.getSession().then(({ data }) => {
    void syncSession(data.session?.user?.id ?? null, data.session?.user?.email ?? null);
  });
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") return;
    if (event === "SIGNED_OUT") resetAllCloudStores();
    void syncSession(session?.user?.id ?? null, session?.user?.email ?? null);
  });
}

/** ready=false selama SSR / sebelum sesi dibaca. */
export function useAuth(): AuthState {
  const current = useSyncExternalStore(subscribe, get, () => PENDING);
  useEffect(() => {
    start();
  }, []);
  return current;
}

export interface RegisterParams {
  nama: string;
  email: string;
  password: string;
  role?: "guru" | "siswa";
  telepon?: string;
  sekolah?: string;
  mapel?: string;
  nip?: string;
  kelas?: string;
  nis?: string;
}

export async function register(
  paramOrNama: string | RegisterParams,
  emailArg?: string,
  passwordArg?: string,
) {
  const params: RegisterParams =
    typeof paramOrNama === "object"
      ? paramOrNama
      : { nama: paramOrNama, email: emailArg ?? "", password: passwordArg ?? "" };

  const { data, error } = await supabase.auth.signUp({
    email: params.email.trim(),
    password: params.password,
    options: {
      emailRedirectTo: `${window.location.origin}/auth`,
      data: {
        nama: params.nama.trim(),
        role: params.role ?? "guru",
        telepon: params.telepon?.trim() ?? "",
        sekolah: params.sekolah?.trim() ?? "",
        mapel: params.mapel?.trim() ?? "",
        nip: params.nip?.trim() ?? "",
        kelas: params.kelas?.trim() ?? "",
        nis: params.nis?.trim() ?? "",
      },
    },
  });
  if (error) return { ok: false as const, message: error.message };
  if (data.user) {
    await supabase.from("profiles").upsert({
      id: data.user.id,
      email: params.email.trim(),
      nama: params.nama.trim(),
      telepon: params.telepon?.trim() ?? "",
      sekolah: params.sekolah?.trim() ?? "",
      mapel: params.mapel?.trim() ?? "",
      nip: params.nip?.trim() ?? "",
      kelas: params.kelas?.trim() ?? "",
    });
    if (data.session) {
      await syncSession(data.user.id, data.user.email ?? params.email);
      return { ok: true as const, needsConfirm: false };
    }
  }
  return { ok: true as const, needsConfirm: true };
}

export async function login(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) return { ok: false as const, message: error.message };
  await syncSession(data.user?.id ?? null, data.user?.email ?? null);
  return { ok: true as const };
}

export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/auth`,
  });
  return error ? { ok: false as const, message: error.message } : { ok: true as const };
}

export async function logout() {
  resetAllCloudStores();
  await supabase.auth.signOut();
  set({ ready: true, signedIn: false, userId: null, profile: DEFAULT_PROFILE });
}

export async function updateProfile(patch: Partial<GuruProfile>) {
  const current = get();
  if (!current.userId) return;
  const next = { ...current.profile, ...patch };
  set({ ...current, profile: next });
  await supabase.from("profiles").upsert({ id: current.userId, ...next });
}

export function initials(nama: string) {
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
