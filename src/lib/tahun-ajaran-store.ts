import { useEffect, useState, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TahunAjaranItem {
  id: string;
  tahun: string;
  isActive: boolean;
}

interface TahunAjaranState {
  availableYears: TahunAjaranItem[];
  selectedYear: string;
  activeYear: string;
  loading: boolean;
  error: string | null;
}

let cachedState: TahunAjaranState = {
  availableYears: [],
  selectedYear: "",
  activeYear: "",
  loading: true,
  error: null,
};

const listeners = new Set<() => void>();
const emitChange = () => listeners.forEach((l) => l());

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

export function resetTahunAjaranStore(): void {
  cachedState = {
    availableYears: [],
    selectedYear: "",
    activeYear: "",
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

    // Masukkan data master
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
    const canonicalActiveYear = activeItem ? activeItem.tahun : availableYears[0]?.tahun || "";

    // Tentukan tahun terpilih:
    // Prioritas: 1. Stored user selection (jika masih valid di availableYears)
    //            2. Active year canonical
    //            3. Tahun teratas
    const stored = getStoredYear(userId);
    let resolvedYear = "";
    if (stored && availableYears.some((y) => y.tahun === stored)) {
      resolvedYear = stored;
    } else if (canonicalActiveYear) {
      resolvedYear = canonicalActiveYear;
    } else if (availableYears.length > 0) {
      resolvedYear = availableYears[0].tahun;
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
    // Muat data jika belum dimuat atau kosong
    if (state.availableYears.length === 0 && !state.error) {
      void refreshTahunAjaran(currentUserId);
    }
  }, [currentUserId, state.availableYears.length, state.error]);

  return {
    ...state,
    setSelectedYear: (year: string) => setSelectedTahunAjaran(year, currentUserId),
    refresh: () => refreshTahunAjaran(currentUserId),
  };
}
