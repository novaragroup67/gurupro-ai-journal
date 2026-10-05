import "./lib/error-capture";

function purgeStaleSupabaseEnv(target: Record<string, any>) {
  if (!target) return;
  const staleSubstrings = ["qfmrappbqslazyxgvbpg", "_KQPLPG8a6MMUy6Yh91XHA_6CB7fP8p"];
  const keysToCheck = [
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_ANON_KEY",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  ];
  for (const k of keysToCheck) {
    if (typeof target[k] === "string" && staleSubstrings.some((stale) => target[k].includes(stale))) {
      delete target[k];
    }
  }
}

try {
  if (typeof process !== "undefined") {
    if (process.env) {
      for (const k of ["GEMINI_API_KEY", "LOVABLE_API_KEY", "OPENAI_API_KEY", "AI_MODEL", "AI_ENDPOINT"]) {
        if (process.env[k] === "") {
          delete process.env[k];
        }
      }
      purgeStaleSupabaseEnv(process.env);
    }
    if (typeof (process as any).loadEnvFile === "function") {
      (process as any).loadEnvFile();
      if (process.env) {
        purgeStaleSupabaseEnv(process.env);
      }
    }
  }
} catch {
  // Ignored in non-Node or production container environments
}

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      if (env && typeof env === "object") {
        (globalThis as any).__CLOUDFLARE_ENV__ = env;
        try {
          if (typeof process !== "undefined" && process.env) {
            Object.assign(process.env, env);
            purgeStaleSupabaseEnv(process.env);
          }
        } catch {
          // ignore error in strict environments
        }
      }
      const url = new URL(request.url);
      if (url.pathname === "/api/health" || url.pathname === "/health") {
        const { checkProductionHealthStatus } = await import("./lib/production-health");
        const health = await checkProductionHealthStatus();
        return new Response(JSON.stringify(health, null, 2), {
          status: health.status === "unavailable" ? 503 : 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store, no-cache, must-revalidate",
          },
        });
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
