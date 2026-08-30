import { useEffect, useSyncExternalStore } from "react";

export interface GuruProfile {
  nama: string;
  email: string;
  nip: string;
  sekolah: string;
  mapel: string;
  kelas: string;
  telepon: string;
  bio: string;
}

export interface AuthState {
  ready: boolean;
  signedIn: boolean;
  profile: GuruProfile;
}

const KEY = "gurupro.auth";

/** Akun demo prototipe (frontend-only, tanpa backend). */
export const DEMO_AKUN = { email: "guru@gurupro.id", password: "gurupro123" };

export const DEFAULT_PROFILE: GuruProfile = {
  nama: "Bu Sari Wulandari",
  email: DEMO_AKUN.email,
  nip: "19850312 201001 2 004",
  sekolah: "SMK Negeri 1 Nusantara",
  mapel: "Matematika",
  kelas: "X IPA 3, XI IPA 1, XI IPA 2",
  telepon: "0812-3456-7890",
  bio: "Guru matematika yang senang memanfaatkan teknologi untuk mengurangi beban administrasi.",
};

const PENDING: AuthState = { ready: false, signedIn: false, profile: DEFAULT_PROFILE };
const LOGGED_OUT: AuthState = { ready: true, signedIn: false, profile: DEFAULT_PROFILE };

let state: AuthState | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

function persist() {
  if (typeof window === "undefined" || !state) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function load() {
  if (state || typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(KEY);
    state = raw
      ? { ...LOGGED_OUT, ...(JSON.parse(raw) as AuthState), ready: true }
      : { ...LOGGED_OUT };
  } catch {
    state = { ...LOGGED_OUT };
  }
  emit();
}

const get = () => state ?? PENDING;

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function set(next: AuthState) {
  state = next;
  persist();
  emit();
}

/** ready=false selama SSR / sebelum localStorage dibaca. */
export function useAuth(): AuthState {
  const current = useSyncExternalStore(subscribe, get, () => PENDING);
  useEffect(() => {
    load();
  }, []);
  return current;
}

export function login(email: string, password: string): boolean {
  load();
  if (email.trim().toLowerCase() !== DEMO_AKUN.email || password !== DEMO_AKUN.password) {
    return false;
  }
  set({ ready: true, signedIn: true, profile: { ...get().profile, email: DEMO_AKUN.email } });
  return true;
}

export function logout() {
  set({ ...get(), signedIn: false });
}

export function updateProfile(patch: Partial<GuruProfile>) {
  set({ ...get(), profile: { ...get().profile, ...patch } });
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
