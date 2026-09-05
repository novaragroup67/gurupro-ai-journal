import { useEffect, useState, useSyncExternalStore } from "react";

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

export type AccountStatus = "menunggu" | "aktif";

export interface GuruAccount {
  id: string;
  role: "guru";
  nama: string;
  email: string;
  telepon: string;
  sekolah: string;
  mapel: string;
  nip: string;
  password: string;
  status: AccountStatus;
}

export interface SiswaAccount {
  id: string;
  role: "siswa";
  nama: string;
  email: string;
  telepon: string;
  sekolah: string;
  jenjang: string; // mis. "XI"
  nisn: string;
  password: string;
  status: AccountStatus; // "menunggu" | "aktif"
}

export type AnyAccount = GuruAccount | SiswaAccount;

export interface AuthState {
  signedIn: boolean;
  remember: boolean;
  profile: GuruProfile;
}

export type LoginResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "pending" };

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

export const AUTH_PUBLIC_PATHS = ["/login", "/daftar", "/lupa-kata-sandi", "/landing", "/gabung", "/auth"] as const;

export function isAuthPublicPath(pathname: string) {
  const clean = pathname.replace(/\/+$/, "") || "/";
  return (
    (AUTH_PUBLIC_PATHS as readonly string[]).includes(clean) ||
    clean.startsWith("/gabung/")
  );
}

const AUTH_KEY = "gurupro.auth";
const ACCOUNTS_KEY = "gurupro.accounts";
const RESET_KEY = "gurupro.password-reset";

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

const DEMO_ACCOUNT: GuruAccount = {
  id: "demo-guru",
  role: "guru",
  nama: DEFAULT_PROFILE.nama,
  email: DEMO_AKUN.email,
  telepon: DEFAULT_PROFILE.telepon,
  sekolah: DEFAULT_PROFILE.sekolah,
  mapel: DEFAULT_PROFILE.mapel,
  nip: DEFAULT_PROFILE.nip,
  password: DEMO_AKUN.password,
  status: "aktif",
};

const LOGGED_OUT: AuthState = { signedIn: false, remember: true, profile: DEFAULT_PROFILE };

let state: AuthState | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

function profileFromAccount(account: AnyAccount, prev?: GuruProfile): GuruProfile {
  if (account.role === "guru") {
    return {
      nama: account.nama,
      email: account.email,
      nip: account.nip,
      sekolah: account.sekolah,
      mapel: account.mapel,
      kelas: prev?.email === account.email ? prev.kelas : "",
      telepon: account.telepon,
      bio: prev?.email === account.email ? prev.bio : "",
    };
  }
  return {
    nama: account.nama,
    email: account.email,
    nip: account.nisn,
    sekolah: account.sekolah,
    mapel: "Siswa",
    kelas: account.jenjang,
    telepon: account.telepon,
    bio: "",
  };
}

function persistAuth() {
  if (typeof window === "undefined" || !state) return;
  try {
    if (!state.signedIn) {
      window.localStorage.removeItem(AUTH_KEY);
      window.sessionStorage.removeItem(AUTH_KEY);
      return;
    }
    const payload = JSON.stringify(state);
    if (state.remember) {
      window.localStorage.setItem(AUTH_KEY, payload);
      window.sessionStorage.removeItem(AUTH_KEY);
    } else {
      window.sessionStorage.setItem(AUTH_KEY, payload);
      window.localStorage.removeItem(AUTH_KEY);
    }
  } catch {
    /* ignore */
  }
}

function readAccounts(): AnyAccount[] {
  if (typeof window === "undefined") return [DEMO_ACCOUNT];
  try {
    const raw = window.localStorage.getItem(ACCOUNTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as (Partial<GuruAccount & SiswaAccount> & { role?: string; kelas?: string; nis?: string })[]) : [];
    const list: AnyAccount[] = (Array.isArray(parsed) ? parsed : []).map((acc) => {
      if (!acc.role || acc.role === "guru") {
        return {
          id: acc.id ?? `guru-${Date.now()}`,
          role: "guru" as const,
          nama: acc.nama ?? "",
          email: acc.email ?? "",
          telepon: acc.telepon ?? "",
          sekolah: acc.sekolah ?? "",
          mapel: acc.mapel ?? "",
          nip: acc.nip ?? "",
          password: acc.password ?? "",
          status: (acc.status as AccountStatus) ?? "aktif",
        };
      }
      return {
        id: acc.id ?? `siswa-${Date.now()}`,
        role: "siswa" as const,
        nama: acc.nama ?? "",
        email: acc.email ?? "",
        telepon: acc.telepon ?? "",
        sekolah: acc.sekolah ?? "",
        jenjang: acc.jenjang ?? acc.kelas ?? "XI",
        nisn: acc.nisn ?? acc.nis ?? "",
        password: acc.password ?? "",
        status: (acc.status as AccountStatus) ?? "menunggu",
      };
    });
    if (!list.some((a) => a.email.toLowerCase() === DEMO_AKUN.email)) {
      list.unshift(DEMO_ACCOUNT);
      window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
    }
    return list;
  } catch {
    return [DEMO_ACCOUNT];
  }
}

function writeAccounts(accounts: AnyAccount[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    /* ignore */
  }
}

function findAccount(email: string): AnyAccount | undefined {
  return readAccounts().find((a) => a.email.toLowerCase() === email.trim().toLowerCase());
}

let isLoaded = false;

function load() {
  if (isLoaded || typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(AUTH_KEY) ?? window.localStorage.getItem(AUTH_KEY);
    state = raw ? { ...LOGGED_OUT, ...(JSON.parse(raw) as AuthState) } : { ...LOGGED_OUT };
  } catch {
    state = { ...LOGGED_OUT };
  }
  isLoaded = true;
  emit();
}

const get = () => state ?? LOGGED_OUT;

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function set(next: AuthState) {
  state = next;
  isLoaded = true;
  persistAuth();
  emit();
}

/** null = belum diketahui (SSR / sebelum localStorage dibaca). */
export function useAuth(): { ready: boolean; signedIn: boolean; profile: GuruProfile } {
  const [mounted, setMounted] = useState(isLoaded);
  const current = useSyncExternalStore(subscribe, get, () => LOGGED_OUT);

  useEffect(() => {
    load();
    setMounted(true);
  }, []);

  const ready = mounted || isLoaded;
  return { ready, signedIn: current.signedIn, profile: current.profile };
}

export function login(email: string, password: string, remember = true): LoginResult {
  load();
  const account = findAccount(email);
  if (!account || account.password !== password) {
    return { ok: false, reason: "invalid" };
  }
  if (account.status !== "aktif") {
    return { ok: false, reason: "pending" };
  }
  set({
    signedIn: true,
    remember,
    profile: profileFromAccount(account, get().profile),
  });
  return { ok: true };
}

export function logout() {
  load();
  set({ signedIn: false, remember: true, profile: get().profile });
}

export function registerGuru(input: RegisterGuruInput): { ok: true } | { ok: false; reason: "duplicate" } {
  load();
  const accounts = readAccounts();
  if (accounts.some((a) => a.email.toLowerCase() === input.email.trim().toLowerCase())) {
    return { ok: false, reason: "duplicate" };
  }
  accounts.push({
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `guru-${Date.now()}`,
    role: "guru",
    nama: input.nama.trim(),
    email: input.email.trim().toLowerCase(),
    telepon: input.telepon.trim(),
    sekolah: input.sekolah.trim(),
    mapel: input.mapel.trim(),
    nip: input.nip.trim(),
    password: input.password,
    status: "menunggu",
  });
  writeAccounts(accounts);
  return { ok: true };
}

export function registerSiswa(input: RegisterSiswaInput): { ok: true } | { ok: false; reason: "duplicate" } {
  load();
  const accounts = readAccounts();
  if (accounts.some((a) => a.email.toLowerCase() === input.email.trim().toLowerCase())) {
    return { ok: false, reason: "duplicate" };
  }
  accounts.push({
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `siswa-${Date.now()}`,
    role: "siswa",
    nama: input.nama.trim(),
    email: input.email.trim().toLowerCase(),
    telepon: (input.telepon ?? "").trim(),
    sekolah: input.sekolah.trim(),
    jenjang: input.jenjang.trim(),
    nisn: input.nisn.trim(),
    password: input.password,
    status: "menunggu",
  });
  writeAccounts(accounts);
  return { ok: true };
}

/** Simulasi verifikasi Admin agar akun terdaftar bisa dipakai di prototipe. */
export function activatePendingAccount(email: string): boolean {
  const accounts = readAccounts();
  const idx = accounts.findIndex((a) => a.email.toLowerCase() === email.trim().toLowerCase());
  if (idx < 0) return false;
  const target = accounts[idx];
  if (!target) return false;
  accounts[idx] = { ...target, status: "aktif" };
  writeAccounts(accounts);
  return true;
}

export function requestPasswordReset(email: string): boolean {
  const account = findAccount(email);
  if (!account || typeof window === "undefined") return false;
  try {
    window.sessionStorage.setItem(
      RESET_KEY,
      JSON.stringify({ email: account.email, createdAt: Date.now() }),
    );
  } catch {
    return false;
  }
  return true;
}

export function getPendingResetEmail(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(RESET_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { email?: string };
    return parsed.email ?? null;
  } catch {
    return null;
  }
}

export function completePasswordReset(email: string, password: string): boolean {
  const accounts = readAccounts();
  const idx = accounts.findIndex((a) => a.email.toLowerCase() === email.trim().toLowerCase());
  if (idx < 0) return false;
  const target = accounts[idx];
  if (!target) return false;
  accounts[idx] = { ...target, password };
  writeAccounts(accounts);
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(RESET_KEY);
    } catch {
      /* ignore */
    }
  }
  return true;
}

export function updateProfile(patch: Partial<GuruProfile>) {
  load();
  const nextProfile = { ...get().profile, ...patch };
  set({ ...get(), profile: nextProfile });
  if (!get().signedIn) return;
  const accounts = readAccounts();
  const idx = accounts.findIndex((a) => a.email.toLowerCase() === nextProfile.email.toLowerCase());
  if (idx < 0) return;
  const target = accounts[idx];
  if (target && target.role === "guru") {
    accounts[idx] = {
      ...target,
      nama: nextProfile.nama,
      email: nextProfile.email,
      nip: nextProfile.nip,
      sekolah: nextProfile.sekolah,
      mapel: nextProfile.mapel,
      telepon: nextProfile.telepon,
    };
    writeAccounts(accounts);
  }
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

export function shortName(nama: string) {
  const parts = nama.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).join(" ") || "Guru";
}
