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

const SUPABASE_URL = sanitizeEnvValue(
  (typeof import.meta !== "undefined" && import.meta.env?.["VITE_SUPABASE_URL"]) ||
  (typeof import.meta !== "undefined" && import.meta.env?.["NEXT_PUBLIC_SUPABASE_URL"]) ||
  (typeof process !== "undefined" ? process.env?.["SUPABASE_URL"] || process.env?.["VITE_SUPABASE_URL"] : "") ||
  "https://dxzzpsrgbiummjplggyo.supabase.co"
).replace(/\/+$/, "");

const SUPABASE_PUBLISHABLE_KEY = sanitizeEnvValue(
  (typeof import.meta !== "undefined" && import.meta.env?.["VITE_SUPABASE_PUBLISHABLE_KEY"]) ||
  (typeof import.meta !== "undefined" && import.meta.env?.["VITE_SUPABASE_ANON_KEY"]) ||
  (typeof import.meta !== "undefined" && import.meta.env?.["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]) ||
  (typeof import.meta !== "undefined" && import.meta.env?.["NEXT_PUBLIC_SUPABASE_ANON_KEY"]) ||
  (typeof process !== "undefined" ? process.env?.["SUPABASE_PUBLISHABLE_KEY"] || process.env?.["SUPABASE_ANON_KEY"] : "") ||
  "sb_publishable_T_KM74qD7YgJYa4Om9jnww_HTzRSjs-"
);

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
