"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import type { Profile, RankedCandidate } from "@/core/types";
import { CandidateCard } from "../components/CandidateCard";
import { ResultsNodeGraph } from "../components/ResultsNodeGraph";
import { SiteHeader } from "../components/SiteHeader";
import { SkeletonList } from "../components/Skeleton";
import { loadSettings, settingsHeaders } from "../lib/settings";

interface ScoutInfo {
  source: "gemma" | "registry" | "hybrid";
  repos: { fullName: string; why: string }[];
}

interface PriorSearch {
  id: string;
  timestamp: string;
  summary: string;
  profile: Profile;
  results: RankedCandidate[];
  scout: ScoutInfo | null;
}

function summary(profile: Profile): string {
  const interests = profile.interests.join(", ") || "no interests";
  const stack = profile.stack.map((s) => s.tech).join(", ") || "no stack";
  return `${interests} · ${stack}`;
}

export default function ResultsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [results, setResults] = useState<RankedCandidate[] | null>(null);
  const [scout, setScout] = useState<ScoutInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAllIssues, setShowAllIssues] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasKeys, setHasKeys] = useState(true);

  const fetchIssues = useCallback(async (parsedProfile: Profile) => {
    try {
      setIsRefreshing(true);
      setError(null);
      const response = await fetch("/api/match", {
        method: "POST",
        headers: { "content-type": "application/json", ...settingsHeaders() },
        body: JSON.stringify(parsedProfile),
      });
      const data = (await response.json()) as {
        results?: RankedCandidate[];
        scout?: ScoutInfo;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Could not fetch issues");

      const fetchedResults = data.results ?? [];
      const fetchedScout = data.scout ?? null;

      setResults(fetchedResults);
      setScout(fetchedScout);

      // Cache results in sessionStorage so navigating to guide and back is instantaneous
      sessionStorage.setItem("compass.results", JSON.stringify(fetchedResults));
      if (fetchedScout) {
        sessionStorage.setItem("compass.scout", JSON.stringify(fetchedScout));
      }

      // Save search snapshot to localStorage for prior results recall
      try {
        const pRaw = localStorage.getItem("compass.prior_searches");
        let priors: PriorSearch[] = pRaw ? JSON.parse(pRaw) : [];
        const summ = summary(parsedProfile);
        priors = priors.filter((p) => p.summary !== summ);
        priors.unshift({
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          summary: summ,
          profile: parsedProfile,
          results: fetchedResults,
          scout: fetchedScout,
        });
        priors = priors.slice(0, 10);
        localStorage.setItem("compass.prior_searches", JSON.stringify(priors));
      } catch {
        // ignore
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const raw = sessionStorage.getItem("compass.profile");
    if (!raw) {
      router.replace("/");
      return;
    }

    let parsed: Profile;
    try {
      parsed = JSON.parse(raw) as Profile;
    } catch {
      router.replace("/");
      return;
    }
    setProfile(parsed);
    setHasKeys(Boolean(loadSettings().llmApiKey.trim() || loadSettings().githubToken.trim()));

    // Check if we already have cached search results in sessionStorage
    const cachedResultsRaw = sessionStorage.getItem("compass.results");
    const cachedScoutRaw = sessionStorage.getItem("compass.scout");

    if (cachedResultsRaw) {
      try {
        const cachedResults = JSON.parse(cachedResultsRaw) as RankedCandidate[];
        const cachedScout = cachedScoutRaw ? (JSON.parse(cachedScoutRaw) as ScoutInfo) : null;
        setResults(cachedResults);
        setScout(cachedScout);
        return;
      } catch {
        // Corrupt cache: fall through to network fetch
      }
    }

    // No cache: perform initial search
    void fetchIssues(parsed);
  }, [router, fetchIssues]);

  function handleRefresh() {
    if (!profile) return;
    sessionStorage.removeItem("compass.results");
    sessionStorage.removeItem("compass.scout");
    setResults(null);
    void fetchIssues(profile);
  }

  function open(candidate: RankedCandidate) {
    sessionStorage.setItem("compass.selected", JSON.stringify(candidate));
    router.push("/guide");
  }

  const newcomer = profile?.tier === "newcomer";

  return (
    <>
      <SiteHeader />
      <main className="container">
        <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h1>{newcomer ? "Your first PR plan" : "Issues worth your time"}</h1>
            {profile && <p className="subtle">{summary(profile)}</p>}
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: "6px 12px", fontSize: "0.82rem" }}
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? "Scanning..." : "↻ Refresh search"}
            </button>
            <Link href="/" className="back">
              ← Change preferences
            </Link>
          </div>
        </div>

        {!hasKeys && (
          <div
            className="panel"
            style={{
              background: "rgba(229, 181, 103, 0.08)",
              border: "1px solid var(--warn, #e5b567)",
              padding: "0.85rem 1.15rem",
              marginBottom: "1.25rem",
              borderRadius: "8px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <div>
              <strong style={{ color: "var(--warn, #e5b567)", display: "flex", alignItems: "center", gap: "6px", fontSize: "0.88rem" }}>
                <span>⚠️</span> Curated Baseline Mode (Offline / Cache Fallback)
              </strong>
              <p className="subtle" style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "var(--muted)" }}>
                Currently displaying verified issues from curated repositories.
                To unlock live real-time GitHub discovery across 300M+ repos for specific interests like &ldquo;{profile?.interests[0] || "astronomy"}&rdquo;, configure a GitHub token in Settings.
              </p>
            </div>
            <Link href="/settings" className="btn btn-ghost" style={{ fontSize: "0.8rem", whiteSpace: "nowrap" }}>
              Add Keys in Settings ➔
            </Link>
          </div>
        )}

        {scout && scout.repos.length > 0 && (
          <p className="subtle" style={{ marginBottom: 16 }}>
            {scout.source === "gemma"
              ? "Gemma selected from registry"
              : scout.source === "hybrid"
                ? "Curated registry + live GitHub discovery"
                : "Registry fallback + live GitHub discovery"}
            : {scout.repos.map((repo) => repo.fullName).join(" · ")}
          </p>
        )}

        {error && (
          <div className="panel empty">
            <h3>That didn&apos;t work</h3>
            <p>{error}</p>
            <p className="hint">
              If this mentions rate limits, add a GitHub token in{" "}
              <Link href="/settings">Settings</Link>.
            </p>
            <div className="card-actions" style={{ justifyContent: "center", marginTop: 16 }}>
              <button type="button" className="btn btn-primary" onClick={handleRefresh}>
                Try again
              </button>
              <Link href="/verify" className="btn btn-ghost">
                Find by Link instead
              </Link>
            </div>
          </div>
        )}

        {!error && results === null && (
          <>
            <p className="subtle" style={{ marginBottom: 16 }}>
              Searching, then verifying each result against the live repository…
            </p>
            <SkeletonList count={3} />
          </>
        )}

        {!error && results !== null && results.length === 0 && (
          <div className="panel empty">
            <h3>Nothing passed verification</h3>
            <p>
              That happens — the filters are strict on purpose. Try widening your interests, or
              verify an issue you already have in mind.
            </p>
            <div className="card-actions" style={{ justifyContent: "center", marginTop: 16 }}>
              <Link href="/" className="btn btn-primary">
                Adjust preferences
              </Link>
              <Link href="/verify" className="btn btn-ghost">
                Find by Link
              </Link>
            </div>
          </div>
        )}

        {!error && results !== null && results.length > 0 && (
          <>
            {/* Interactive Topological Knowledge Graph */}
            <ResultsNodeGraph
              profile={profile}
              candidates={results}
              onSelectCandidate={open}
            />

            {/* Candidate Cards Section */}
            {newcomer ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1rem" }}>
                  <h3 style={{ fontSize: "1.15rem", margin: 0, fontWeight: 650 }}>
                    Top Recommended Starter Issues (1–3)
                  </h3>
                  <span className="subtle" style={{ fontSize: "0.85rem" }}>
                    Verified doable & unassigned
                  </span>
                </div>

                {/* Top 1 Featured Card */}
                <CandidateCard candidate={results[0]} tier="newcomer" featured rank={1} onSelect={open} />

                {/* Top 2 and 3 Cards */}
                {results.length > 1 && (
                  <>
                    <p className="subtle" style={{ margin: "1.75rem 0 0.85rem" }}>
                      Alternative top verified issues:
                    </p>
                    <div className="cards">
                      {results.slice(1, 3).map((candidate, idx) => (
                        <CandidateCard
                          key={`${candidate.repo}#${candidate.number}`}
                          candidate={candidate}
                          tier="newcomer"
                          rank={idx + 2}
                          onSelect={open}
                        />
                      ))}
                    </div>
                  </>
                )}

                {/* Remaining issues (4 to 10) */}
                {results.length > 3 && (
                  <div style={{ marginTop: "2rem" }}>
                    <div style={{ textAlign: "center", margin: "1.5rem 0" }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: "8px 20px", fontSize: "0.88rem", border: "1px dashed var(--line)" }}
                        onClick={() => setShowAllIssues((prev) => !prev)}
                      >
                        {showAllIssues
                          ? "▲ Collapse additional issues"
                          : `▼ Show ${results.length - 3} more verified issues (${results.length} total)`}
                      </button>
                    </div>

                    {showAllIssues && (
                      <div className="cards">
                        {results.slice(3).map((candidate, idx) => (
                          <CandidateCard
                            key={`${candidate.repo}#${candidate.number}`}
                            candidate={candidate}
                            tier="newcomer"
                            rank={idx + 4}
                            onSelect={open}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1rem" }}>
                  <p className="subtle" style={{ margin: 0 }}>
                    {results.length} verified issue{results.length === 1 ? "" : "s"} across repositories, ranked by readiness.
                  </p>
                  {results.length > 3 && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: "0.8rem", padding: "4px 10px" }}
                      onClick={() => setShowAllIssues((prev) => !prev)}
                    >
                      {showAllIssues ? "Show Top 3 Only" : `View All ${results.length}`}
                    </button>
                  )}
                </div>

                <div className="cards">
                  {(showAllIssues ? results : results.slice(0, 3)).map((candidate, idx) => (
                    <CandidateCard
                      key={`${candidate.repo}#${candidate.number}`}
                      candidate={candidate}
                      tier="experienced"
                      rank={idx + 1}
                      onSelect={open}
                    />
                  ))}
                </div>

                {!showAllIssues && results.length > 3 && (
                  <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: "8px 20px", fontSize: "0.88rem", border: "1px dashed var(--line)" }}
                      onClick={() => setShowAllIssues(true)}
                    >
                      ▼ View {results.length - 3} more verified issues ({results.length} total)
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        <footer className="footer">
          Candidate state, assignment and repository signals are checked. Linked pull request
          status is best-effort and shown as unknown if the check fails.
        </footer>
      </main>
    </>
  );
}
