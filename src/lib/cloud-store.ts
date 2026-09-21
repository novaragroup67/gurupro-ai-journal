import { useEffect, useSyncExternalStore } from "react";

const resets = new Set<() => void>();

/** Dipanggil saat user keluar / berganti akun agar data lama tidak bocor ke tampilan. */
export function resetAllCloudStores() {
  resets.forEach((r) => r());
}

/**
 * Store kecil berbasis database (Lovable Cloud) dengan API sinkron untuk komponen:
 * data dibaca sekali saat komponen mount, lalu diperbarui setiap ada perubahan.
 */
export function createCloudStore<T>(fetcher: () => Promise<T[]>) {
  const EMPTY: T[] = [];
  let data: T[] = EMPTY;
  let loaded = false;
  let error: Error | null = null;
  let inflight: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  const emit = () => listeners.forEach((l) => l());
  const get = () => data;
  const getError = () => error;
  const isLoaded = () => loaded;

  const set = (next: T[]) => {
    data = next;
    emit();
  };

  const reload = async () => {
    try {
      error = null;
      data = await fetcher();
      loaded = true;
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err));
      console.error("[CloudStore] Error loading data from Supabase:", error.message);
    }
    emit();
    if (error) throw error;
  };

  const ensure = () => {
    if (loaded) return Promise.resolve();
    if (!inflight) {
      inflight = reload()
        .catch(() => {})
        .finally(() => {
          inflight = null;
        });
    }
    return inflight;
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  resets.add(() => {
    data = EMPTY;
    loaded = false;
    error = null;
    emit();
  });

  function useItems(): T[] {
    const items = useSyncExternalStore(subscribe, get, () => EMPTY);
    useEffect(() => {
      void ensure();
    }, []);
    return items;
  }

  function useError(): Error | null {
    return useSyncExternalStore(subscribe, getError, () => null);
  }

  return { get, set, reload, ensure, useItems, useError, getError, isLoaded, subscribe };
}

export function uid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2, 10);
}
