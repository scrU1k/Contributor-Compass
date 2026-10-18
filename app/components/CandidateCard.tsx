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

  return (
    <article className={`card${featured ? " featured" : ""}${isTopThree ? " top-pick" : ""}`}>
      <div className="card-head">
        <a className="repo" href={candidate.url} target="_blank" rel="noreferrer">
          {candidate.repo} <span>#{candidate.number}</span>
        </a>
        <div className="badges">
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

      <div className="card-actions">
        <button type="button" className="btn btn-primary" onClick={() => onSelect(candidate)}>
          {featured ? "Start here" : "Get the guide"}
        </button>
        <a className="btn btn-ghost" href={candidate.url} target="_blank" rel="noreferrer">
          View on GitHub
        </a>
      </div>
    </article>
  );
}
