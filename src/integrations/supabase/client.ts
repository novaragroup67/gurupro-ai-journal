import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    // New Supabase API keys are opaque strings, not bearer JWTs.
    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function sanitizeEnvValue(val?: string | null): string {
  if (!val || typeof val !== "string") return "";
  let cleaned = val.trim();
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned;
}

const CANONICAL_SUPABASE_PROJECT_ID = "dxzzpsrgbiummjplggyo";
const CANONICAL_SUPABASE_URL = "https://dxzzpsrgbiummjplggyo.supabase.co";
const CANONICAL_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_T_KM74qD7YgJYa4Om9jnww_HTzRSjs-";
const STALE_PROJECT_SUBSTRINGS = ["qfmrappbqslazyxgvbpg", "_KQPLPG8a6MMUy6Yh91XHA_6CB7fP8p"];

function resolveClientSupabaseUrl(): string {
  const candidates = [
    typeof import.meta !== "undefined" ? import.meta.env?.["VITE_SUPABASE_URL"] : undefined,
    typeof import.meta !== "undefined" ? import.meta.env?.["NEXT_PUBLIC_SUPABASE_URL"] : undefined,
    typeof process !== "undefined" ? process.env?.["SUPABASE_URL"] || process.env?.["VITE_SUPABASE_URL"] : undefined,
  ];
  for (const c of candidates) {
    const sanitized = sanitizeEnvValue(c).replace(/\/+$/, "");
    if (!sanitized) continue;
    if (STALE_PROJECT_SUBSTRINGS.some((stale) => sanitized.includes(stale))) continue;
    return sanitized;
  }
  return CANONICAL_SUPABASE_URL;
}

function resolveClientSupabaseKey(): string {
  const url = resolveClientSupabaseUrl();
  const isCanonical = url.includes(CANONICAL_SUPABASE_PROJECT_ID);
  const candidates = [
    typeof import.meta !== "undefined" ? import.meta.env?.["VITE_SUPABASE_PUBLISHABLE_KEY"] : undefined,
    typeof import.meta !== "undefined" ? import.meta.env?.["VITE_SUPABASE_ANON_KEY"] : undefined,
    typeof import.meta !== "undefined" ? import.meta.env?.["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] : undefined,
    typeof import.meta !== "undefined" ? import.meta.env?.["NEXT_PUBLIC_SUPABASE_ANON_KEY"] : undefined,
    typeof process !== "undefined" ? process.env?.["SUPABASE_PUBLISHABLE_KEY"] || process.env?.["SUPABASE_ANON_KEY"] : undefined,
  ];
  for (const c of candidates) {
    const sanitized = sanitizeEnvValue(c);
    if (!sanitized) continue;
    if (STALE_PROJECT_SUBSTRINGS.some((stale) => sanitized.includes(stale))) continue;
    if (isCanonical && sanitized.startsWith("sb_publishable_") && sanitized !== CANONICAL_SUPABASE_PUBLISHABLE_KEY) continue;
    return sanitized;
  }
  return CANONICAL_SUPABASE_PUBLISHABLE_KEY;
}

export const SUPABASE_URL = resolveClientSupabaseUrl();
export const SUPABASE_PUBLISHABLE_KEY = resolveClientSupabaseKey();

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  global: {
    fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY),
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});
