"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SiteHeader } from "../components/SiteHeader";
import {
  DEFAULT_SETTINGS,
  clearSettings,
  headersFor,
  loadSettings,
  saveSettings,
  type Settings,
} from "../lib/settings";

interface Health {
  github: boolean;
  githubProbe: "ok" | "unauthorized" | "rate-limited" | "error" | "skipped";
  llm: boolean;
  model: string | null;
  baseUrl: string | null;
}

function describeGithub(health: Health): string {
  if (!health.github) return "no token — 60 requests/hour";
  switch (health.githubProbe) {
    case "ok":
      return "token verified · 5,000 requests/hour";
    case "unauthorized":
      return "token rejected — check it and try again";
    case "rate-limited":
      return "token present, but rate limited right now";
    case "error":
      return "token present, probe failed";
    default:
      return "token present";
  }
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
    setHealth(null);
  }

  function save() {
    saveSettings(settings);
    setSaved(true);
  }

  async function test() {
    setTesting(true);
    setError(null);
    setHealth(null);
    saveSettings(settings);

    try {
      const response = await fetch("/api/health?probe=1", { headers: headersFor(settings) });
      if (!response.ok) throw new Error(`Health check failed (${response.status})`);
      setHealth((await response.json()) as Health);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the server");
    } finally {
      setTesting(false);
    }
  }

  function reset() {
    clearSettings();
    setSettings(DEFAULT_SETTINGS);
    setHealth(null);
    setSaved(false);
  }

  return (
    <>
      <SiteHeader />
      <main className="container narrow">
        <section className="hero" style={{ paddingBottom: "1.5rem" }}>
          <p className="eyebrow">Setup</p>
          <h1>Bring your own keys.</h1>
          <p className="lede">
            This app runs on credentials you provide. They are stored in this browser, sent to
            this app&apos;s server only for the length of a request, and never written to disk.
          </p>
        </section>

        <div className="panel">
          <div className="field">
            <label className="field-label" htmlFor="llm-key">
              Gemma API key
            </label>
            <p className="field-hint">
              From{" "}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                Google AI Studio
              </a>
              . Used for the Repo Scout, semantic checks, and the getting-started guide.
            </p>
            <input
              id="llm-key"
              className="input"
              type="password"
              value={settings.llmApiKey}
              onChange={(event) => update("llmApiKey", event.target.value)}
              placeholder="AIza…"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className="field-grid">
            <div className="field">
              <label className="field-label" htmlFor="llm-model">
                Model
              </label>
              <p className="field-hint">Any OpenAI-compatible model id.</p>
              <input
                id="llm-model"
                className="input"
                value={settings.llmModel}
                onChange={(event) => update("llmModel", event.target.value)}
                placeholder="gemma-4-31b-it"
                spellCheck={false}
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="llm-base">
                Base URL
              </label>
              <p className="field-hint">Swap providers without a rebuild.</p>
              <input
                id="llm-base"
                className="input"
                value={settings.llmBaseUrl}
                onChange={(event) => update("llmBaseUrl", event.target.value)}
                spellCheck={false}
              />
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="gh-token">
              GitHub token
            </label>
            <p className="field-hint">
              <a
                href="https://github.com/settings/tokens/new?description=Contributor%20Compass&scopes=public_repo"
                target="_blank"
                rel="noreferrer"
              >
                Create one
              </a>{" "}
              — public read access is enough. Without it you get 60 requests/hour instead of
              5,000.
            </p>
            <input
              id="gh-token"
              className="input"
              type="password"
              value={settings.githubToken}
              onChange={(event) => update("githubToken", event.target.value)}
              placeholder="ghp_…"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={save}>
              Save keys
            </button>
            <button type="button" className="btn btn-ghost" onClick={test} disabled={testing}>
              {testing ? "Checking…" : "Test connection"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={reset}>
              Clear
            </button>
            <Link href="/" className="btn btn-ghost">
              Back to search
            </Link>
          </div>

          {saved && !error && (
            <p className="hint" style={{ marginTop: 12 }}>
              Saved in this browser.
            </p>
          )}
          {error && (
            <p className="error" style={{ marginTop: 12 }}>
              {error}
            </p>
          )}

          {health && (
            <div className="status-grid">
              <div className={`status ${health.llm ? "ok" : "off"}`}>
                <strong>Gemma</strong>
                <span>
                  {health.llm
                    ? `configured · ${health.model}`
                    : "not configured — AI features will fall back to deterministic output"}
                </span>
              </div>
              <div
                className={`status ${
                  health.githubProbe === "ok" ? "ok" : health.github ? "warn" : "off"
                }`}
              >
                <strong>GitHub</strong>
                <span>{describeGithub(health)}</span>
              </div>
            </div>
          )}
        </div>

        <p className="subtle" style={{ marginTop: 16 }}>
          Prefer environment variables? The same settings work in <code>.env</code>. Anything
          you enter here takes precedence for your session.
        </p>
      </main>
    </>
  );
}
