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

export default function GuidePage() {
  const router = useRouter();
  const [payload, setPayload] = useState<GuidePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/guide", {
          method: "POST",
          headers: { "content-type": "application/json", ...settingsHeaders() },
          body: JSON.stringify({ repo: selected.repo, number: selected.number, profile }),
        });
        const data = (await response.json()) as GuidePayload & { error?: string };
        if (!response.ok) throw new Error(data.error ?? "Could not build the guide");
        if (!cancelled) setPayload(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Something went wrong");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

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
            <h1 style={{ marginBottom: 6 }}>{payload.candidate.title}</h1>
            <p className="subtle">
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
                    <span className="path-why">{item.why}</span>
                  </div>
                ))}
              </section>
            )}

            <section className="guide-section">
              <h2>How to approach it</h2>
              <ol className="steps">
                {payload.guidance.approach.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </section>

            <section className="guide-section">
              <h2>Your first commit</h2>
              <div className="commit-box">
                <code style={{ border: "none", background: "transparent", padding: 0 }}>
                  {payload.guidance.firstCommit[0]}
                </code>
                <button type="button" className="btn btn-ghost btn-sm" onClick={copyCommit}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </section>

            {payload.guidance.resources.length > 0 && (
              <section className="guide-section">
                <h2>Resources</h2>
                <ul className="steps">
                  {payload.guidance.resources.map((resource) => (
                    <li key={resource.url}>
                      <a href={resource.url} target="_blank" rel="noreferrer">
                        {resource.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <p className="hint">
              File paths above were checked against the repository tree before being shown.
            </p>
          </>
        )}
      </main>
    </>
  );
}
