/** Shared helpers for attaching and validating Supabase user access tokens. */

export const ACCESS_TOKEN_HEADER = "x-supabase-access-token";

export function extractBearerToken(authHeader: string | null | undefined): string | null {
  if (!authHeader) return null;
  let token = String(authHeader).replace(/^\uFEFF/, "").trim();
  while (/^bearer\s+/i.test(token)) {
    token = token.replace(/^bearer\s+/i, "").trim();
  }
  return token || null;
}

export function resolveRequestAccessToken(headers: Headers): string | null {
  const fromAuth = extractBearerToken(headers.get("authorization"));
  if (fromAuth) return fromAuth;
  return extractBearerToken(headers.get(ACCESS_TOKEN_HEADER));
}

export function looksLikeJwt(token: string): boolean {
  const parts = token.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

export function readJwtPayload(token: string): Record<string, unknown> | null {
  if (!looksLikeJwt(token)) return null;
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const json =
      typeof atob === "function"
        ? atob(padded)
        : Buffer.from(padded, "base64").toString("utf8");
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function isJwtExpired(token: string, skewMs = 30_000): boolean {
  const payload = readJwtPayload(token);
  if (!payload || typeof payload.exp !== "number") return false;
  return payload.exp * 1000 <= Date.now() + skewMs;
}

export function isSessionExpiring(expiresAt: number | null | undefined, withinMs = 60_000): boolean {
  if (!expiresAt) return true;
  const ms = expiresAt > 1_000_000_000_000 ? expiresAt : expiresAt * 1000;
  return ms - Date.now() < withinMs;
}

export function isRecoverableAuthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /unauthorized|invalid token|jwt expired|bad_jwt|sesi kedaluwarsa|no authorization header|no token provided|401|403/i.test(
    message,
  );
}

export function sessionExpiredError(): Error {
  return new Error("Unauthorized: Sesi kedaluwarsa. Silakan masuk kembali.");
}

export async function withAuthRetry<T>(
  refreshFn: () => Promise<unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isRecoverableAuthError(err)) {
      throw err;
    }
    try {
      await refreshFn();
    } catch {
      // Ignore refresh error; retry will either succeed or throw definitive error
    }
    return await fn();
  }
}

export async function fetchAuthUser(
  supabaseUrl: string,
  apiKey: string,
  token: string,
): Promise<{ id: string; [key: string]: unknown }> {
  const res = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: apiKey,
      Accept: "application/json",
    },
  });

  const body = (await res.json().catch(() => null)) as
    | { id?: string; msg?: string; message?: string; error_description?: string }
    | null;

  if (!res.ok || !body?.id) {
    const detail = body?.message || body?.msg || body?.error_description || `HTTP ${res.status}`;
    throw new Error(detail);
  }

  return body as { id: string; [key: string]: unknown };
}
