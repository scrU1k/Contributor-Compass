"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Profile, RankedCandidate } from "@/core/types";
import { CandidateCard } from "../components/CandidateCard";
import { SiteHeader } from "../components/SiteHeader";
import { SkeletonList } from "../components/Skeleton";
import { settingsHeaders } from "../lib/settings";

interface ScoutInfo {
  source: "gemma" | "registry";
  repos: { fullName: string; why: string }[];
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

  useEffect(() => {
    const raw = sessionStorage.getItem("compass.profile");
    if (!raw) {
      router.replace("/");
      return;
    }

    const parsed = JSON.parse(raw) as Profile;
    setProfile(parsed);

    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/match", {
          method: "POST",
          headers: { "content-type": "application/json", ...settingsHeaders() },
          body: JSON.stringify(parsed),
        });
        const data = (await response.json()) as {
          results?: RankedCandidate[];
          scout?: ScoutInfo;
          error?: string;
        };
        if (!response.ok) throw new Error(data.error ?? "Could not fetch issues");
        if (!cancelled) {
          setResults(data.results ?? []);
          setScout(data.scout ?? null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Something went wrong");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  function open(candidate: RankedCandidate) {
    sessionStorage.setItem("compass.selected", JSON.stringify(candidate));
    router.push("/guide");
  }

  const newcomer = profile?.tier === "newcomer";

  return (
    <>
      <SiteHeader />
      <main className="container">
        <div className="page-head">
          <div>
            <h1>{newcomer ? "Your first PR plan" : "Issues worth your time"}</h1>
            {profile && <p className="subtle">{summary(profile)}</p>}
          </div>
          <Link href="/" className="back">
            ← Change preferences
          </Link>
        </div>

        {scout && scout.repos.length > 0 && (
          <p className="subtle" style={{ marginBottom: 16 }}>
            {scout.source === "gemma" ? "Gemma scouted" : "Registry fallback scouted"}:{" "}
            {scout.repos.map((repo) => repo.fullName).join(" · ")}
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
              <button type="button" className="btn btn-primary" onClick={() => location.reload()}>
                Try again
              </button>
              <Link href="/verify" className="btn btn-ghost">
                Verify a link instead
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
                Verify a link
              </Link>
            </div>
          </div>
        )}

        {!error && results !== null && results.length > 0 && newcomer && (
          <>
            <CandidateCard candidate={results[0]} tier="newcomer" featured rank={1} onSelect={open} />
            {results.length > 1 && (
              <>
                <p className="subtle" style={{ margin: "1.75rem 0 0.85rem" }}>
                  If that one doesn&apos;t fit, these are also verified:
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
          </>
        )}

        {!error && results !== null && results.length > 0 && !newcomer && (
          <>
            <p className="subtle" style={{ marginBottom: 16 }}>
              {results.length} verified issue{results.length === 1 ? "" : "s"}, ranked by readiness.
            </p>
            <div className="cards">
              {results.map((candidate) => (
                <CandidateCard
                  key={`${candidate.repo}#${candidate.number}`}
                  candidate={candidate}
                  tier="experienced"
                  onSelect={open}
                />
              ))}
            </div>
          </>
        )}

        <footer className="footer">
          Every candidate was checked for: still open · unassigned · no competing PR · real setup
          docs · recent outsider merges.
        </footer>
      </main>
    </>
  );
}
