import { plainEvidence, plainSummary, verdict } from "@/core/format/plain";
import type { RankedCandidate, Tier } from "@/core/types";
import { ScoreCard } from "./ScoreCard";

export function CandidateCard({
  candidate,
  tier,
  featured = false,
  onSelect,
}: {
  candidate: RankedCandidate;
  tier: Tier;
  featured?: boolean;
  onSelect: (candidate: RankedCandidate) => void;
}) {
  const newcomer = tier === "newcomer";
  const v = verdict(candidate);

  return (
    <article className={`card${featured ? " featured" : ""}`}>
      <div className="card-head">
        <a className="repo" href={candidate.url} target="_blank" rel="noreferrer">
          {candidate.repo} <span>#{candidate.number}</span>
        </a>
        {newcomer ? (
          <span className={`badge ${v.tone}`}>{v.label}</span>
        ) : (
          <span className="badge neutral">{candidate.score.total.toFixed(0)}/100</span>
        )}
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
