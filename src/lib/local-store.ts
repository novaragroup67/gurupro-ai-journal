import { useEffect, useSyncExternalStore } from "react";

/**
 * Tiny localStorage-backed store.
 * SSR-safe: the first client render matches the server (empty list), data is
 * loaded from localStorage inside an effect and then broadcast to subscribers.
 */
export function createLocalStore<T>(key: string, seed: () => T[]) {
  const EMPTY: T[] = [];
  let data: T[] | null = null;
  const listeners = new Set<() => void>();

  const emit = () => listeners.forEach((l) => l());

  const persist = () => {
    if (typeof window === "undefined" || !data) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(data));
    } catch {
      /* ignore quota errors */
    }
  };

  const load = () => {
    if (data || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(key);
      data = raw ? (JSON.parse(raw) as T[]) : seed();
    } catch {
      data = seed();
    }
    persist();
    emit();
  };

  const get = () => data ?? EMPTY;

  const set = (next: T[]) => {
    data = next;
    persist();
    emit();
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  function useItems(): T[] {
    const items = useSyncExternalStore(
      subscribe,
      get,
      () => EMPTY,
    );
    useEffect(() => {
      load();
    }, []);
    return items;
  }

  return { get, set, subscribe, load, useItems };
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}
