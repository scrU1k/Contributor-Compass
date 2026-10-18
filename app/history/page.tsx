"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Profile, RankedCandidate } from "@/core/types";
import { SiteHeader } from "../components/SiteHeader";

interface PriorSearch {
  id: string;
  timestamp: string;
  summary: string;
  profile: Profile;
  results: RankedCandidate[];
  scout?: {
    source: "gemma" | "registry" | "hybrid";
    repos: { fullName: string; why: string }[];
  } | null;
}

export default function HistoryPage() {
  const router = useRouter();
  const [historyList, setHistoryList] = useState<PriorSearch[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem("compass.prior_searches");
      if (raw) {
        const parsed = JSON.parse(raw) as PriorSearch[];
        setHistoryList(parsed);
        // Expand the most recent search by default if available
        if (parsed.length > 0) {
          setExpandedIds(new Set([parsed[0].id]));
        }
      }
    } catch {
      // ignore
    }
  }, []);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function deleteSearch(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const updated = historyList.filter((item) => item.id !== id);
    setHistoryList(updated);
    try {
      localStorage.setItem("compass.prior_searches", JSON.stringify(updated));
    } catch {
      // ignore
    }
  }

  function clearAllHistory() {
    setHistoryList([]);
    try {
      localStorage.removeItem("compass.prior_searches");
    } catch {
      // ignore
    }
  }

  function restoreLiveSearch(ps: PriorSearch, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      sessionStorage.setItem("compass.profile", JSON.stringify(ps.profile));
      sessionStorage.setItem("compass.results", JSON.stringify(ps.results));
      if (ps.scout) {
        sessionStorage.setItem("compass.scout", JSON.stringify(ps.scout));
      } else {
        sessionStorage.removeItem("compass.scout");
      }
      router.push("/results");
    } catch {
      // ignore
    }
  }

  function openGuide(ps: PriorSearch, candidate: RankedCandidate) {
    try {
      sessionStorage.setItem("compass.profile", JSON.stringify(ps.profile));
      sessionStorage.setItem("compass.selected", JSON.stringify(candidate));
      router.push("/guide");
    } catch {
      // ignore
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="container narrow" style={{ paddingBottom: "4rem" }}>
        <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h1>Search History</h1>
            <p className="subtle">Browse and inspect previous discovery runs and their verified issues.</p>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            {historyList.length > 0 && (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: "0.8rem", padding: "6px 12px" }}
                onClick={clearAllHistory}
              >
                Clear all history
              </button>
            )}
            <Link href="/" className="back">
              ← New Search
            </Link>
          </div>
        </div>

        {/* Stale Warning Notice Required for History Page */}
        <div
          className="panel"
          style={{
            background: "rgba(229, 181, 103, 0.08)",
            border: "1px solid var(--warn, #e5b567)",
            borderRadius: "10px",
            padding: "1rem 1.25rem",
            marginBottom: "2rem",
            display: "flex",
            alignItems: "flex-start",
            gap: "14px",
          }}
        >
          <span style={{ fontSize: "1.4rem", lineHeight: 1 }}>⚠️</span>
          <div>
            <strong style={{ color: "var(--warn, #e5b567)", fontSize: "0.92rem", display: "block", marginBottom: "4px" }}>
              Historical Cached Snapshot Notice
            </strong>
            <p className="subtle" style={{ margin: 0, fontSize: "0.82rem", lineHeight: 1.55, color: "var(--fg)" }}>
              Search results listed on this history page are historical snapshots from previous runs.
              Because GitHub issue states evolve continuously, some issues may now be assigned, closed, or have competing PRs.
              The results below represent the verified state at the time the search was conducted and may be stale.
            </p>
          </div>
        </div>

        {historyList.length === 0 ? (
          <div className="panel empty" style={{ textAlign: "center", padding: "3rem 1.5rem" }}>
            <h3>No search history yet</h3>
            <p className="subtle" style={{ marginTop: "0.5rem" }}>
              Run a discovery search from the home page. Every run is automatically saved here so you never lose your progress.
            </p>
            <Link href="/" className="btn btn-primary" style={{ marginTop: "1.2rem", display: "inline-block" }}>
              Find issues now ➔
            </Link>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "1.25rem" }}>
            {historyList.map((ps) => {
              const isExpanded = expandedIds.has(ps.id);
              const issueCount = ps.results?.length ?? 0;

              return (
                <div
                  key={ps.id}
                  className="panel"
                  style={{
                    background: "var(--card)",
                    border: "1px solid var(--line)",
                    borderRadius: "10px",
                    padding: "1.2rem",
                    transition: "border-color 0.2s ease",
                  }}
                >
                  {/* Search Session Header Card */}
                  <div
                    onClick={() => toggleExpand(ps.id)}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "10px",
                      cursor: "pointer",
                      userSelect: "none",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: "260px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 650, fontSize: "0.98rem", color: "var(--fg)" }}>
                          {ps.summary}
                        </span>
                        <span className="badge neutral" style={{ fontSize: "0.72rem", padding: "0.15rem 0.45rem" }}>
                          {issueCount} issue{issueCount === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="subtle" style={{ fontSize: "0.75rem", marginTop: "4px" }}>
                        Searched on {new Date(ps.timestamp).toLocaleString()} • Tier: {ps.profile?.tier ?? "newcomer"}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ fontSize: "0.78rem", padding: "5px 12px" }}
                        onClick={(e) => restoreLiveSearch(ps, e)}
                        title="Load this entire search back into the active results page"
                      >
                        Restore Search ➔
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ fontSize: "0.78rem", padding: "5px 10px" }}
                        onClick={() => toggleExpand(ps.id)}
                      >
                        {isExpanded ? "▲ Hide Issues" : `▼ View ${issueCount} Issues`}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ fontSize: "0.75rem", padding: "5px 8px" }}
                        onClick={(e) => deleteSearch(ps.id, e)}
                        title="Delete this snapshot"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* Expanded Issues List */}
                  {isExpanded && (
                    <div style={{ marginTop: "1.2rem", paddingTop: "1rem", borderTop: "1px solid var(--line)" }}>
                      <p className="subtle" style={{ fontSize: "0.8rem", marginBottom: "0.85rem" }}>
                        Verified candidates captured in this search (click &ldquo;Open Guide&rdquo; to work on an issue):
                      </p>

                      {issueCount === 0 ? (
                        <p className="subtle" style={{ fontSize: "0.82rem" }}>
                          No issues passed verification filters during this run.
                        </p>
                      ) : (
                        <div style={{ display: "grid", gap: "10px" }}>
                          {ps.results.map((candidate, idx) => (
                            <div
                              key={`${candidate.repo}#${candidate.number}-${idx}`}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                padding: "10px 14px",
                                background: "var(--bg)",
                                border: "1px solid var(--line)",
                                borderRadius: "8px",
                                flexWrap: "wrap",
                                gap: "10px",
                              }}
                            >
                              <div style={{ flex: 1, minWidth: "260px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                  <a
                                    href={candidate.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ color: "var(--accent)", fontSize: "0.84rem", fontWeight: 600, textDecoration: "none" }}
                                  >
                                    {candidate.repo} #{candidate.number}
                                  </a>
                                  {candidate.score?.total && (
                                    <span className="badge neutral" style={{ fontSize: "0.7rem", padding: "0.1rem 0.4rem" }}>
                                      {candidate.score.total.toFixed(0)}/100
                                    </span>
                                  )}
                                  {candidate.sizeHint && (
                                    <span className="badge neutral" style={{ fontSize: "0.7rem", padding: "0.1rem 0.4rem" }}>
                                      {candidate.sizeHint}
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontWeight: 550, fontSize: "0.88rem", marginTop: "3px", color: "var(--fg)" }}>
                                  {candidate.title}
                                </div>
                              </div>

                              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  style={{ fontSize: "0.78rem", padding: "5px 12px" }}
                                  onClick={() => openGuide(ps, candidate)}
                                >
                                  Open Guide ➔
                                </button>
                                <a
                                  className="btn btn-ghost"
                                  style={{ fontSize: "0.78rem", padding: "5px 10px" }}
                                  href={candidate.url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  GitHub ↗
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
