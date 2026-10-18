"use client";

import type { Tier } from "@/core/types";

const OPTIONS: { value: Tier; title: string; blurb: string }[] = [
  {
    value: "newcomer",
    title: "I'm new to open source",
    blurb: "Guided, jargon explained, doable first issues.",
  },
  {
    value: "experienced",
    title: "I know my stack",
    blurb: "Fast-ranked issues worth your time.",
  },
];

export function TierToggle({
  value,
  onChange,
}: {
  value: Tier;
  onChange: (tier: Tier) => void;
}) {
  return (
    <div className="tier-toggle" role="tablist" aria-label="Experience level">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={`tier-btn${value === option.value ? " active" : ""}`}
          onClick={() => onChange(option.value)}
        >
          <strong>{option.title}</strong>
          <span>{option.blurb}</span>
        </button>
      ))}
    </div>
  );
}
