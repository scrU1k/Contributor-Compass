"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { RankedCandidate, Tier } from "@/core/types";
import { minimalProfile } from "@/core/profile/defaults";
import { CandidateCard } from "../components/CandidateCard";
import { SiteHeader } from "../components/SiteHeader";
import { TierToggle } from "../components/TierToggle";
import { settingsHeaders } from "../lib/settings";

export default function VerifyPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [tier, setTier] = useState<Tier>("newcomer");
  const [candidate, setCandidate] = useState<RankedCandidate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setCandidate(null);
    setLoading(true);

    try {
      const response = await fetch("/api/verify", {
        method: "POST",
        headers: { "content-type": "application/json", ...settingsHeaders() },
        body: JSON.stringify({ url, tier }),
      });
      const data = (await response.json()) as {
        candidate?: RankedCandidate;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Could not verify that issue");
      setCandidate(data.candidate ?? null);
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
          <h1>Already looking at an issue?</h1>
          <p className="lede">
            Paste the link. We&apos;ll check whether it&apos;s actually doable before you invest
            an evening in it — assignment, competing PRs, setup docs, and whether the project
            merges work from outside contributors.
          </p>
        </section>

        <form className="panel" onSubmit={submit}>
          <div className="field">
            <label className="field-label" htmlFor="issue-url">
              GitHub issue URL
            </label>
            <p className="field-hint">For example: github.com/owner/repo/issues/123</p>
            <div className="url-form">
              <input
                id="issue-url"
                className="input"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://github.com/pallets/flask/issues/1234"
                autoComplete="off"
                spellCheck={false}
              />
              <button type="submit" className="btn btn-primary" disabled={loading || !url.trim()}>
                {loading ? "Checking…" : "Verify"}
              </button>
            </div>
          </div>

          <div className="field" style={{ marginTop: "1.25rem" }}>
            <span className="field-label">How much detail do you want?</span>
            <TierToggle value={tier} onChange={setTier} />
          </div>

          {error && <p className="error">{error}</p>}
        </form>

        {candidate && (
          <div style={{ marginTop: "1.5rem" }}>
            <p className="subtle" style={{ marginBottom: 12 }}>
              Personal fit isn&apos;t assessed here — this is about whether the issue is doable.
            </p>
            <CandidateCard candidate={candidate} tier={tier} featured onSelect={open} />
          </div>
        )}
      </main>
    </>
  );
}
