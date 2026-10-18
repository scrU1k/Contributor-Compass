import type { ReadinessScore, ScoreKey } from "@/core/types";

const LABELS: [ScoreKey, string][] = [
  ["fit", "Match"],
  ["accessibility", "Can run it"],
  ["liveness", "Gets merged"],
  ["issueQuality", "Issue quality"],
  ["competition", "Uncontested"],
  ["setupCost", "Light setup"],
];

export function ScoreCard({ score }: { score: ReadinessScore }) {
  return (
    <div className="score">
      <div className="score-total">
        <span>{score.total.toFixed(0)}</span>
        <small>/ 100 readiness</small>
      </div>
      <div className="bars">
        {LABELS.map(([key, label]) => {
          const value = Math.round(score[key] * 100);
          return (
            <div className="bar-row" key={key}>
              <span className="bar-label">{label}</span>
              <span
                className="bar-track"
                role="img"
                aria-label={`${label}: ${value} out of 100`}
              >
                <span className="bar-fill" style={{ width: `${value}%` }} />
              </span>
              <span className="bar-value">{value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
