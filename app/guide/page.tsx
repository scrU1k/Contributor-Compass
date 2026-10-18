"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Guidance, Profile, RankedCandidate } from "@/core/types";
import { SiteHeader } from "../components/SiteHeader";
import { settingsHeaders } from "../lib/settings";

interface GuidePayload {
  candidate: RankedCandidate;
  guidance: Guidance;
}

interface HistoryItem {
  repo: string;
  number: number;
  title: string;
  url: string;
  status: "solved" | "pr_created" | "merged";
  timestamp: string;
}

export default function GuidePage() {
  const router = useRouter();
  const [payload, setPayload] = useState<GuidePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Status tracking (Solved / PR Created / Merged)
  const [status, setStatus] = useState<"solved" | "pr_created" | "merged" | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  // Ask Gemma states
  const [showAsk, setShowAsk] = useState(false);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [askError, setAskError] = useState<string | null>(null);

  useEffect(() => {
    const rawProfile = sessionStorage.getItem("compass.profile");
    const rawSelected = sessionStorage.getItem("compass.selected");

    if (!rawProfile || !rawSelected) {
      router.replace("/");
      return;
    }

    let profile: Profile;
    let selected: RankedCandidate;
    try {
      profile = JSON.parse(rawProfile) as Profile;
      selected = JSON.parse(rawSelected) as RankedCandidate;
    } catch {
      router.replace("/");
      return;
    }

    // Check contribution status from localStorage
    try {
      const histRaw = localStorage.getItem("compass.history");
      if (histRaw) {
        const hist = JSON.parse(histRaw) as HistoryItem[];
        const item = hist.find((h) => h.repo === selected.repo && h.number === selected.number);
        if (item) setStatus(item.status);
      }

      const savedRaw = localStorage.getItem("compass.saved_issues");
      if (savedRaw) {
        const savedList = JSON.parse(savedRaw) as { repo: string; number: number }[];
        setIsSaved(savedList.some((s) => s.repo === selected.repo && s.number === selected.number));
      }
    } catch {
      // ignore
    }

    // Guide Caching: check if guide was already generated for this issue
    const cacheKey = `compass.guide.${selected.repo}#${selected.number}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as GuidePayload;
        setPayload(parsed);
        return;
      } catch {
        // proceed to fetch
      }
    }

    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/guide", {
          method: "POST",
          headers: { "content-type": "application/json", ...settingsHeaders() },
          body: JSON.stringify({ repo: selected.repo, number: selected.number, profile, candidate: selected }),
        });
        const data = (await response.json()) as GuidePayload & { error?: string };
        if (!response.ok) throw new Error(data.error ?? "Could not build the guide");
        if (!cancelled) {
          setPayload(data);
          sessionStorage.setItem(cacheKey, JSON.stringify(data));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Something went wrong");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  function toggleSave() {
    if (!payload) return;
    const c = payload.candidate;
    const nextSaved = !isSaved;
    setIsSaved(nextSaved);

    try {
      const raw = localStorage.getItem("compass.saved_issues");
      interface SavedItem {
        repo: string;
        number: number;
        title: string;
        url: string;
        candidate: RankedCandidate;
        savedAt: string;
      }
      let list: SavedItem[] = raw ? JSON.parse(raw) : [];
      list = list.filter((i) => !(i.repo === c.repo && i.number === c.number));

      if (nextSaved) {
        list.push({
          repo: c.repo,
          number: c.number,
          title: c.title,
          url: c.url,
          candidate: c,
          savedAt: new Date().toISOString(),
        });
      }
      localStorage.setItem("compass.saved_issues", JSON.stringify(list));
      window.dispatchEvent(new Event("storage"));
    } catch {
      // ignore
    }
  }

  function markStatus(newStatus: "solved" | "pr_created" | "merged") {
    if (!payload) return;
    const c = payload.candidate;
    const next = status === newStatus ? null : newStatus;
    setStatus(next);

    try {
      const raw = localStorage.getItem("compass.history");
      let list: HistoryItem[] = raw ? JSON.parse(raw) : [];
      list = list.filter((i) => !(i.repo === c.repo && i.number === c.number));

      if (next) {
        list.push({
          repo: c.repo,
          number: c.number,
          title: c.title,
          url: c.url,
          status: next,
          timestamp: new Date().toISOString(),
        });
      }
      localStorage.setItem("compass.history", JSON.stringify(list));
      window.dispatchEvent(new Event("storage"));
    } catch {
      // ignore
    }
  }

  async function handleAsk(queryText?: string) {
    const q = queryText ?? question;
    if (!q.trim() || !payload) return;

    setAsking(true);
    setAskError(null);
    setAnswer(null);

    try {
      const res = await fetch("/api/guide/ask", {
        method: "POST",
        headers: { "content-type": "application/json", ...settingsHeaders() },
        body: JSON.stringify({
          repo: payload.candidate.repo,
          number: payload.candidate.number,
          candidate: payload.candidate,
          question: q,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not get an answer");
      setAnswer(data.answer);
    } catch (err) {
      setAskError(err instanceof Error ? err.message : "Failed to ask question");
    } finally {
      setAsking(false);
    }
  }

  async function copyCommit() {
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload.guidance.firstCommit.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="container narrow">
        <div className="page-head">
          <div>
            <Link href="/results" className="back">
              ← Back to results
            </Link>
          </div>
        </div>

        {error && (
          <div className="panel empty">
            <h3>Couldn&apos;t build the guide</h3>
            <p>{error}</p>
            <Link href="/verify" className="btn btn-ghost" style={{ marginTop: 12 }}>
              Verify a link instead
            </Link>
          </div>
        )}

        {!error && !payload && (
          <div className="panel">
            <div className="skeleton skel-line skel-w45" style={{ height: 10 }} />
            <div className="skeleton skel-line skel-w90" style={{ height: 22, marginTop: 14 }} />
            <div className="skeleton skel-line skel-w70" />
            <div className="skeleton skel-line skel-w90" />
            <p className="subtle" style={{ marginTop: 18 }}>
              Reading the repository and writing your path in…
            </p>
          </div>
        )}

        {payload && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px", marginBottom: "8px" }}>
              <div style={{ flex: 1, minWidth: "280px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  <h1 style={{ margin: 0, fontSize: "1.65rem", lineHeight: 1.25 }}>{payload.candidate.title}</h1>
                  <button
                    type="button"
                    className={`btn ${showAsk ? "btn-primary" : "btn-ghost"}`}
                    style={{ padding: "4px 10px", fontSize: "0.82rem", borderRadius: "6px" }}
                    onClick={() => setShowAsk(!showAsk)}
                  >
                    💬 Ask Gemma
                  </button>
                </div>
                <p className="subtle" style={{ margin: "6px 0 0" }}>
                  <a
                    href={payload.candidate.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "var(--accent)" }}
                  >
                    {payload.candidate.repo} #{payload.candidate.number}
                  </a>{" "}
                  · readiness {payload.candidate.score.total.toFixed(0)}/100
                </p>
              </div>

              {/* Status Action Buttons */}
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <button
                  type="button"
                  className={`btn ${isSaved ? "btn-primary" : "btn-ghost"}`}
                  style={{ padding: "5px 10px", fontSize: "0.78rem" }}
                  onClick={toggleSave}
                  title={isSaved ? "Remove from saved issues" : "Save issue for later"}
                >
                  {isSaved ? "★ Saved" : "☆ Save for later"}
                </button>
                <button
                  type="button"
                  className={`btn ${status === "solved" ? "btn-primary" : "btn-ghost"}`}
                  style={{ padding: "5px 10px", fontSize: "0.78rem" }}
                  onClick={() => markStatus("solved")}
                  title="Mark as completed/solved"
                >
                  {status === "solved" ? "✓ Solved" : "Mark Solved"}
                </button>
                <button
                  type="button"
                  className={`btn ${status === "pr_created" ? "btn-primary" : "btn-ghost"}`}
                  style={{ padding: "5px 10px", fontSize: "0.78rem" }}
                  onClick={() => markStatus("pr_created")}
                  title="Mark as PR created"
                >
                  {status === "pr_created" ? "⚡ PR Open" : "PR Created"}
                </button>
                <button
                  type="button"
                  className={`btn ${status === "merged" ? "btn-primary" : "btn-ghost"}`}
                  style={{ padding: "5px 10px", fontSize: "0.78rem" }}
                  onClick={() => markStatus("merged")}
                  title="Mark as merged into repository"
                >
                  {status === "merged" ? "🎉 Merged" : "Merged"}
                </button>
              </div>
            </div>

            {/* Interactive "Ask Gemma" Assistant Panel */}
            {showAsk && (
              <div
                className="panel"
                style={{
                  background: "var(--card, #141926)",
                  border: "1px solid var(--accent)",
                  borderRadius: "10px",
                  padding: "1.2rem",
                  margin: "1.2rem 0 2rem",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                  <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 650, display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>💬</span> Ask Gemma About #{payload.candidate.number}
                  </h3>
                  <button
                    type="button"
                    style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: "0.9rem" }}
                    onClick={() => setShowAsk(false)}
                  >
                    ✕ Close
                  </button>
                </div>

                <p className="subtle" style={{ fontSize: "0.82rem", margin: "0 0 0.75rem" }}>
                  Gemma analyzes the issue body, comments, and repository tree to answer your questions.
                </p>

                {/* Quick suggestions */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "0.85rem" }}>
                  {[
                    "How do I reproduce this?",
                    "Where in the codebase is this bug?",
                    "What tests should I write?",
                    "Explain this bug simply",
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className="chip"
                      style={{ fontSize: "0.76rem", padding: "3px 8px" }}
                      onClick={() => {
                        setQuestion(preset);
                        void handleAsk(preset);
                      }}
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    placeholder="Type your question (e.g., 'What does this error message mean?')..."
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleAsk();
                    }}
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid var(--line)",
                      background: "var(--bg-input, #0d111a)",
                      color: "var(--fg)",
                      fontSize: "0.85rem",
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ padding: "6px 14px", fontSize: "0.85rem" }}
                    onClick={() => handleAsk()}
                    disabled={asking || !question.trim()}
                  >
                    {asking ? "Thinking..." : "Ask"}
                  </button>
                </div>

                {askError && (
                  <p className="error" style={{ fontSize: "0.82rem", marginTop: "0.6rem" }}>
                    {askError}
                  </p>
                )}

                {answer && (
                  <div
                    style={{
                      marginTop: "1rem",
                      padding: "0.85rem 1rem",
                      background: "rgba(111, 157, 237, 0.08)",
                      borderLeft: "3px solid var(--accent)",
                      borderRadius: "6px",
                      fontSize: "0.88rem",
                      lineHeight: 1.55,
                      whiteSpace: "pre-line",
                    }}
                  >
                    {answer}
                  </div>
                )}
              </div>
            )}

            <p className="lede" style={{ margin: "1.25rem 0 2.25rem" }}>
              {payload.guidance.summary}
            </p>

            <section className="guide-section">
              <h2>Get it running</h2>
              <ol className="steps">
                {payload.guidance.setupSteps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </section>

            {payload.guidance.whereToLook.length > 0 && (
              <section className="guide-section">
                <h2>Where to look</h2>
                {payload.guidance.whereToLook.map((item) => (
                  <div className="path-row" key={item.path}>
                    <code>{item.path}</code>
                    <span>{item.why}</span>
                  </div>
                ))}
              </section>
            )}

            <section className="guide-section">
              <h2>Approach</h2>
              <ol className="steps">
                {payload.guidance.approach.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </section>

            <section className="guide-section">
              <h2>Your first commit</h2>
              <div className="commit-box">
                <pre>{payload.guidance.firstCommit.join("\n")}</pre>
                <button type="button" className="btn btn-ghost copy-btn" onClick={copyCommit}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </section>

            {payload.guidance.resources.length > 0 && (
              <section className="guide-section">
                <h2>Resources</h2>
                <ul className="resources">
                  {payload.guidance.resources.map((res) => (
                    <li key={res.url}>
                      <a href={res.url} target="_blank" rel="noreferrer">
                        {res.title} ↗
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}
