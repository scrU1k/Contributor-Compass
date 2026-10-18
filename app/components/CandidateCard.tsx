"use client";

import { useEffect, useState } from "react";
import { plainEvidence, plainSummary, verdict } from "@/core/format/plain";
import type { RankedCandidate, Tier } from "@/core/types";
import { ScoreCard } from "./ScoreCard";

interface CandidateCardProps {
  candidate: RankedCandidate;
  tier: Tier;
  featured?: boolean;
  rank?: number;
  onSelect: (candidate: RankedCandidate) => void;
}

interface HistoryItem {
  repo: string;
  number: number;
  title: string;
  url: string;
  status: "solved" | "pr_created" | "merged";
  timestamp: string;
}

export function CandidateCard({
  candidate,
  tier,
  featured = false,
  rank,
  onSelect,
}: CandidateCardProps) {
  const newcomer = tier === "newcomer";
  const v = verdict(candidate);
  const isTopThree = rank !== undefined && rank <= 3;
  const hasNewContributorGuide = candidate.signals?.hasNewContributorGuide;

  const [status, setStatus] = useState<"solved" | "pr_created" | "merged" | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("compass.history");
      if (raw) {
        const hist = JSON.parse(raw) as HistoryItem[];
        const item = hist.find((h) => h.repo === candidate.repo && h.number === candidate.number);
        if (item) setStatus(item.status);
      }

      const rawSaved = localStorage.getItem("compass.saved_issues");
      if (rawSaved) {
        const savedList = JSON.parse(rawSaved) as { repo: string; number: number }[];
        setIsSaved(savedList.some((s) => s.repo === candidate.repo && s.number === candidate.number));
      }
    } catch {
      // ignore
    }
  }, [candidate.repo, candidate.number]);

  function toggleSave() {
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
      list = list.filter((i) => !(i.repo === candidate.repo && i.number === candidate.number));

      if (nextSaved) {
        list.push({
          repo: candidate.repo,
          number: candidate.number,
          title: candidate.title,
          url: candidate.url,
          candidate,
          savedAt: new Date().toISOString(),
        });
      }
      localStorage.setItem("compass.saved_issues", JSON.stringify(list));
      window.dispatchEvent(new Event("storage"));
    } catch {
      // ignore
    }
  }

  function toggleStatus(nextStatus: "solved" | "pr_created" | "merged") {
    const next = status === nextStatus ? null : nextStatus;
    setStatus(next);

    try {
      const raw = localStorage.getItem("compass.history");
      let list: HistoryItem[] = raw ? JSON.parse(raw) : [];
      list = list.filter((i) => !(i.repo === candidate.repo && i.number === candidate.number));

      if (next) {
        list.push({
          repo: candidate.repo,
          number: candidate.number,
          title: candidate.title,
          url: candidate.url,
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

  return (
    <article className={`card${featured ? " featured" : ""}${isTopThree ? " top-pick" : ""}`}>
      <div className="card-head">
        <a className="repo" href={candidate.url} target="_blank" rel="noreferrer">
          {candidate.repo} <span>#{candidate.number}</span>
        </a>
        <div className="badges">
          {status === "solved" && <span className="badge ok">✓ Solved</span>}
          {status === "pr_created" && <span className="badge accent">⚡ PR Open</span>}
          {status === "merged" && <span className="badge good">🎉 Merged</span>}

          {newcomer && (
            <span className={`badge ${v.tone}`}>{v.label}</span>
          )}
          {isTopThree && (
            <span className="badge top-badge">Top {rank}</span>
          )}
          {hasNewContributorGuide && (
            <span className="badge guide-badge">📖 New contributor guide</span>
          )}
          {!newcomer && !isTopThree && (
            <span className="badge neutral">{candidate.score.total.toFixed(0)}/100</span>
          )}
        </div>
      </div>

      <h3 className="card-title">{candidate.title}</h3>

      <p className="card-summary">{newcomer ? plainSummary(candidate) : candidate.why}</p>

      {!newcomer && <ScoreCard score={candidate.score} />}

      {newcomer && (
        <ul className="evidence" aria-label="Why this one">
          {plainEvidence(candidate).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}

      {!newcomer && (
        <ul className="evidence" aria-label="Evidence">
          {candidate.score.evidence
            .filter((e) => e.id !== "fit")
            .slice(0, 4)
            .map((e) => (
              <li key={e.id}>
                {e.label}: {e.value}
              </li>
            ))}
        </ul>
      )}

      <div className="card-actions" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button type="button" className="btn btn-primary" onClick={() => onSelect(candidate)}>
            {featured ? "Start here" : "Get the guide"}
          </button>
          <a className="btn btn-ghost" href={candidate.url} target="_blank" rel="noreferrer">
            View on GitHub ↗
          </a>
          <button
            type="button"
            className={`btn ${isSaved ? "btn-primary" : "btn-ghost"}`}
            style={{ fontSize: "0.8rem", padding: "5px 10px" }}
            onClick={toggleSave}
            title={isSaved ? "Remove from saved issues" : "Save issue for later"}
          >
            {isSaved ? "★ Saved" : "☆ Save"}
          </button>
        </div>

        {/* Contribution Tracking Actions */}
        <div style={{ display: "flex", gap: "6px" }}>
          <button
            type="button"
            className={`btn ${status === "solved" ? "btn-primary" : "btn-ghost"}`}
            style={{ fontSize: "0.76rem", padding: "4px 8px" }}
            onClick={() => toggleStatus("solved")}
            title="Mark as solved"
          >
            {status === "solved" ? "✓ Solved" : "Done"}
          </button>
          <button
            type="button"
            className={`btn ${status === "pr_created" ? "btn-primary" : "btn-ghost"}`}
            style={{ fontSize: "0.76rem", padding: "4px 8px" }}
            onClick={() => toggleStatus("pr_created")}
            title="Mark as PR created"
          >
            {status === "pr_created" ? "⚡ PR Open" : "PR Opened"}
          </button>
          <button
            type="button"
            className={`btn ${status === "merged" ? "btn-primary" : "btn-ghost"}`}
            style={{ fontSize: "0.76rem", padding: "4px 8px" }}
            onClick={() => toggleStatus("merged")}
            title="Mark as merged"
          >
            {status === "merged" ? "🎉 Merged" : "Merged"}
          </button>
        </div>
      </div>
    </article>
  );
}
