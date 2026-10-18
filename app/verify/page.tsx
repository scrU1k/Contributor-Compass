"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { RankedCandidate, Tier } from "@/core/types";
import { minimalProfile } from "@/core/profile/defaults";
import { CandidateCard } from "../components/CandidateCard";
import { SiteHeader } from "../components/SiteHeader";
import { TierToggle } from "../components/TierToggle";
import { settingsHeaders } from "../lib/settings";

export interface OrgCoverageInfo {
  owner: string;
  ownerName: string;
  ownerType: string;
  totalPublicRepos: number;
  scannedRepos: number;
  activeCandidateRepos: number;
  selectedRepos: string[];
}

export default function VerifyPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [tier, setTier] = useState<Tier>("newcomer");
  const [candidates, setCandidates] = useState<RankedCandidate[]>([]);
  const [orgCoverage, setOrgCoverage] = useState<OrgCoverageInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setCandidates([]);
    setOrgCoverage(null);
    setLoading(true);

    try {
      const response = await fetch("/api/verify", {
        method: "POST",
        headers: { "content-type": "application/json", ...settingsHeaders() },
        body: JSON.stringify({ url, tier }),
      });
      const data = (await response.json()) as {
        mode?: "issue" | "repo" | "org";
        candidate?: RankedCandidate;
        candidates?: RankedCandidate[];
        org?: OrgCoverageInfo;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Could not verify that GitHub target");
      setCandidates(data.candidates ?? (data.candidate ? [data.candidate] : []));
      setOrgCoverage(data.org ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function open(selected: RankedCandidate) {
    sessionStorage.setItem("compass.profile", JSON.stringify(minimalProfile(tier)));
    sessionStorage.setItem("compass.selected", JSON.stringify(selected));
    router.push("/guide");
  }

  return (
    <>
      <SiteHeader />
      <main className="container narrow">
        <section className="hero" style={{ paddingBottom: "1.5rem" }}>
          <p className="eyebrow">Side door</p>
          <h1>Have a specific issue or organization in mind?</h1>
          <p className="lede">
            Paste an issue link to check its feasibility, or enter an organization (e.g.{" "}
            <code>github.com/openstreetmap</code>) to discover and verify its best starter issues.
            We verify assignment, competing PRs, setup docs, and semantic traps before you begin.
          </p>
        </section>

        <form className="panel" onSubmit={submit}>
          <div className="field">
            <label className="field-label" htmlFor="issue-url">
              GitHub issue, repo, or organization URL
            </label>
            <p className="field-hint">
              Examples: <code>github.com/openstreetmap</code>, <code>pallets/flask</code>, or{" "}
              <code>github.com/owner/repo/issues/123</code>
            </p>
            <div className="url-form">
              <input
                id="issue-url"
                className="input"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://github.com/openstreetmap"
                autoComplete="off"
                spellCheck={false}
              />
              <button type="submit" className="btn btn-primary" disabled={loading || !url.trim()}>
                {loading ? "Checking…" : "Verify & Find"}
              </button>
            </div>
          </div>

          <div className="field" style={{ marginTop: "1.25rem" }}>
            <span className="field-label">How much detail do you want?</span>
            <TierToggle value={tier} onChange={setTier} />
          </div>

          {error && <p className="error">{error}</p>}
        </form>

        {orgCoverage && (
          <div
            className="panel"
            style={{
              marginTop: "1.5rem",
              background: "var(--card-bg, #1a1f2c)",
              border: "1px solid var(--border-color, #2d3748)",
            }}
          >
            <p style={{ margin: 0, fontWeight: 600 }}>
              🏢 {orgCoverage.ownerType}:{" "}
              <a href={`https://github.com/${orgCoverage.owner}`} target="_blank" rel="noreferrer">
                {orgCoverage.ownerName}
              </a>
            </p>
            <p className="subtle" style={{ margin: "0.4rem 0 0" }}>
              Budgeted scan: evaluated {orgCoverage.selectedRepos.length} most active of{" "}
              {orgCoverage.totalPublicRepos} public repositories (
              {orgCoverage.selectedRepos.map((r) => r.split("/")[1]).join(", ")}) — found{" "}
              {candidates.length} verified candidate issue{candidates.length === 1 ? "" : "s"}.
            </p>
          </div>
        )}

        {candidates.length > 0 && (
          <div style={{ marginTop: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
            <p className="subtle" style={{ marginBottom: 4 }}>
              {candidates.length === 1
                ? "Personal fit isn't assessed here — this is about whether the issue is doable."
                : `Showing ${candidates.length} verified issue${candidates.length === 1 ? "" : "s"} ranked by readiness:`}
            </p>
            {candidates.map((cand, idx) => (
              <CandidateCard
                key={`${cand.repo}#${cand.number}`}
                candidate={cand}
                tier={tier}
                featured={idx === 0}
                rank={idx + 1}
                onSelect={open}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
