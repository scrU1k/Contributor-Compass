/**
 * Bring-your-own-key, stored only in this browser.
 *
 * Judges supply their own Gemma and GitHub credentials. We keep them in
 * localStorage so a refresh doesn't force re-entry, and send them as headers on
 * each API call. The server scopes them to that one request and never persists
 * them.
 *
 * Server-side .env values still work as defaults, so the same build runs for a
 * developer with a .env and a judge with no .env at all.
 */

export interface Settings {
  llmApiKey: string;
  llmModel: string;
  llmBaseUrl: string;
  githubToken: string;
}

export const DEFAULT_SETTINGS: Settings = {
  llmApiKey: "",
  llmModel: "gemma-4-31b-it",
  llmBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
  githubToken: "",
};

const STORAGE_KEY = "compass.settings.v1";

export function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function clearSettings(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

/** Headers for a specific settings object (used by the connection test). */
export function headersFor(settings: Settings): Record<string, string> {
  const headers: Record<string, string> = {};
  if (settings.llmApiKey.trim()) headers["x-compass-llm-key"] = settings.llmApiKey.trim();
  if (settings.llmModel.trim()) headers["x-compass-llm-model"] = settings.llmModel.trim();
  if (settings.llmBaseUrl.trim()) headers["x-compass-llm-base"] = settings.llmBaseUrl.trim();
  if (settings.githubToken.trim()) {
    headers["x-compass-github-token"] = settings.githubToken.trim();
  }
  return headers;
}

/** Headers for the settings currently saved in this browser. */
export function settingsHeaders(): Record<string, string> {
  return headersFor(loadSettings());
}
