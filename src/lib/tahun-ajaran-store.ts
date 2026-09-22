import { useEffect, useState, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TahunAjaranItem {
  id: string;
  tahun: string;
  isActive: boolean;
}

export const DEFAULT_AVAILABLE_YEARS: TahunAjaranItem[] = [
  { id: "ta-canonical-2026", tahun: "2026/2027", isActive: true },
  { id: "ta-canonical-2025", tahun: "2025/2026", isActive: false },
  { id: "ta-canonical-2024", tahun: "2024/2025", isActive: false },
];

export const DEFAULT_ACTIVE_YEAR = "2026/2027";

interface TahunAjaranState {
  availableYears: TahunAjaranItem[];
  selectedYear: string;
  activeYear: string;
  loading: boolean;
  error: string | null;
}

function getStorageKey(userId?: string): string {
  return userId ? `gurupro_selected_tahun_ajaran_${userId}` : "gurupro_selected_tahun_ajaran";
}

function getStoredYear(userId?: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(getStorageKey(userId));
  } catch {
    return null;
  }
}

function setStoredYear(year: string, userId?: string): void {
  if (typeof window === "undefined") return;
  try {
    if (year) {
      sessionStorage.setItem(getStorageKey(userId), year);
    } else {
      sessionStorage.removeItem(getStorageKey(userId));
    }
  } catch {
    // Ignore sessionStorage errors
  }
}

function getInitialState(): TahunAjaranState {
  let initialSelected = DEFAULT_ACTIVE_YEAR;
  if (typeof window !== "undefined") {
    try {
      const stored = getStoredYear();
      if (stored && DEFAULT_AVAILABLE_YEARS.some((y) => y.tahun === stored)) {
        initialSelected = stored;
      }
    } catch {
      // Ignore
    }
  }
  return {
    availableYears: DEFAULT_AVAILABLE_YEARS,
    selectedYear: initialSelected,
    activeYear: DEFAULT_ACTIVE_YEAR,
    loading: false,
    error: null,
  };
}

let cachedState: TahunAjaranState = getInitialState();

const listeners = new Set<() => void>();
const emitChange = () => listeners.forEach((l) => l());

export function resetTahunAjaranStore(): void {
  cachedState = {
    availableYears: DEFAULT_AVAILABLE_YEARS,
    selectedYear: DEFAULT_ACTIVE_YEAR,
    activeYear: DEFAULT_ACTIVE_YEAR,
    loading: false,
    error: null,
  };
  if (typeof window !== "undefined") {
    try {
      // Clear any stored tahun ajaran keys
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith("gurupro_selected_tahun_ajaran")) {
          sessionStorage.removeItem(key);
        }
      }
    } catch {
      // Ignore sessionStorage errors
    }
  }
  emitChange();
}

/**
 * Fetch available academic years from Supabase canonical database.
 * Merges master public.tahun_ajaran with any distinct years found in public.kelas.
 */
export async function refreshTahunAjaran(userId?: string): Promise<TahunAjaranState> {
  cachedState = { ...cachedState, loading: true, error: null };
  emitChange();

  try {
    // 1. Ambil data master tahun ajaran
    const { data: masterRows, error: masterErr } = await supabase
      .from("tahun_ajaran")
      .select("id, tahun, is_active")
      .order("tahun", { ascending: false });

    if (masterErr) {
      console.warn("[TahunAjaranStore] Error loading master tahun_ajaran:", masterErr.message);
    }

    // 2. Ambil distinct tahun ajaran dari kelas jika ada tahun yang belum tercatat
    const { data: kelasRows } = await supabase
      .from("kelas")
      .select("tahun_ajaran");

    const yearsMap = new Map<string, TahunAjaranItem>();

    // Pre-populate canonical default academic years so the list is never empty
    DEFAULT_AVAILABLE_YEARS.forEach((d) => {
      yearsMap.set(d.tahun, { ...d });
    });

    // Masukkan data master dari Supabase (overwrite fallback dengan data asli)
    (masterRows || []).forEach((r) => {
      const cleanTahun = r.tahun.trim();
      if (cleanTahun) {
        yearsMap.set(cleanTahun, {
          id: r.id,
          tahun: cleanTahun,
          isActive: Boolean(r.is_active),
        });
      }
    });

    // Masukkan tahun dari kelas jika belum ada
    (kelasRows || []).forEach((k) => {
      const clean = (k.tahun_ajaran || "").trim();
      if (clean && !yearsMap.has(clean)) {
        yearsMap.set(clean, {
          id: `kelas-${clean}`,
          tahun: clean,
          isActive: false,
        });
      }
    });

    // Urutkan tahun akademik descending (e.g. 2026/2027, 2025/2026, 2024/2025)
    const availableYears = Array.from(yearsMap.values()).sort((a, b) =>
      b.tahun.localeCompare(a.tahun, undefined, { numeric: true }),
    );

    // Tentukan tahun aktif canonical
    const activeItem = availableYears.find((y) => y.isActive);
    const canonicalActiveYear = activeItem ? activeItem.tahun : DEFAULT_ACTIVE_YEAR;

    // Tentukan tahun terpilih:
    // Prioritas: 1. Stored user selection (jika masih valid di availableYears)
    //            2. Currently selected year jika masih valid
    //            3. Active year canonical
    //            4. Tahun pertama di daftar
    const stored = getStoredYear(userId);
    let resolvedYear = "";
    if (stored && availableYears.some((y) => y.tahun === stored)) {
      resolvedYear = stored;
    } else if (cachedState.selectedYear && availableYears.some((y) => y.tahun === cachedState.selectedYear)) {
      resolvedYear = cachedState.selectedYear;
    } else if (canonicalActiveYear) {
      resolvedYear = canonicalActiveYear;
    } else if (availableYears.length > 0) {
      resolvedYear = availableYears[0].tahun;
    } else {
      resolvedYear = DEFAULT_ACTIVE_YEAR;
    }

    if (resolvedYear) {
      setStoredYear(resolvedYear, userId);
    }

    cachedState = {
      availableYears,
      selectedYear: resolvedYear,
      activeYear: canonicalActiveYear,
      loading: false,
      error: null,
    };
    emitChange();
    return cachedState;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Gagal memuat tahun ajaran.";
    cachedState = {
      ...cachedState,
      availableYears: cachedState.availableYears.length > 0 ? cachedState.availableYears : DEFAULT_AVAILABLE_YEARS,
      selectedYear: cachedState.selectedYear || DEFAULT_ACTIVE_YEAR,
      activeYear: cachedState.activeYear || DEFAULT_ACTIVE_YEAR,
      loading: false,
      error: errorMsg,
    };
    emitChange();
    return cachedState;
  }
}

export function setSelectedTahunAjaran(year: string, userId?: string): void {
  const cleanYear = year.trim();
  if (cachedState.selectedYear === cleanYear) return;

  cachedState = {
    ...cachedState,
    selectedYear: cleanYear,
  };
  setStoredYear(cleanYear, userId);
  emitChange();
}

export function useTahunAjaran(currentUserId?: string) {
  const state = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => cachedState,
    () => cachedState,
  );

  useEffect(() => {
    // Sinkronisasi tahun tersimpan untuk user ini jika ada
    if (currentUserId) {
      const stored = getStoredYear(currentUserId);
      if (stored && stored !== state.selectedYear && state.availableYears.some((y) => y.tahun === stored)) {
        setSelectedTahunAjaran(stored, currentUserId);
      }
    }
  }, [currentUserId, state.selectedYear, state.availableYears]);

  useEffect(() => {
    // Muat data master dari Supabase pada mount / perubahan user
    void refreshTahunAjaran(currentUserId);
  }, [currentUserId]);

  return {
    ...state,
    setSelectedYear: (year: string) => setSelectedTahunAjaran(year, currentUserId),
    refresh: () => refreshTahunAjaran(currentUserId),
  };
}
