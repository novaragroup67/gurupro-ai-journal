import type { AiInput } from "./ai-generator";

const KEY = "gurupro.ai-handoff";

export function setAiHandoff(input: Partial<AiInput>) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(KEY, JSON.stringify(input));
}

export function takeAiHandoff(): Partial<AiInput> | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(KEY);
  window.sessionStorage.removeItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Partial<AiInput>;
  } catch {
    return null;
  }
}
