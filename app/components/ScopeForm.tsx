"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type {
  ContributionType,
  ExperienceLevel,
  Goal,
  IssueSize,
  Profile,
  Tier,
  TimeBudget,
} from "@/core/types";
import { ChipGroup, type ChipOption } from "./ChipGroup";
import { TierToggle } from "./TierToggle";

const INTERESTS: ChipOption<string>[] = [
  "Web",
  "CLI tooling",
  "Data / ML",
  "Games",
  "DevOps",
  "Design / frontend",
  "Accessibility",
  "Education",
  "Documentation",
  "Security",
  "Not sure — open to anything",
].map((value) => ({ value, label: value }));

const STACK: ChipOption<string>[] = [
  "Python",
  "JavaScript",
  "TypeScript",
  "Go",
  "Rust",
  "Java",
  "C++",
  "C",
  "Ruby",
  "PHP",
  "C#",
  "Kotlin",
  "Swift",
].map((value) => ({ value, label: value }));

const GOALS: ChipOption<Goal>[] = [
  { value: "learn", label: "Learn something new" },
  { value: "merge-fast", label: "Get a PR merged fast" },
  { value: "portfolio", label: "Build a portfolio" },
  { value: "maintainer-track", label: "Become a maintainer" },
];

const TIMES: ChipOption<TimeBudget>[] = [
  { value: "under-1h", label: "Under an hour" },
  { value: "weekend", label: "A weekend" },
  { value: "ongoing", label: "Ongoing" },
];

const TYPES: ChipOption<ContributionType>[] = [
  { value: "code", label: "Code" },
  { value: "docs", label: "Docs" },
  { value: "tests", label: "Tests" },
  { value: "design", label: "Design" },
  { value: "translation", label: "Translation" },
  { value: "triage", label: "Triaging" },
];

const SIZES: ChipOption<IssueSize>[] = [
  { value: "tiny", label: "Tiny — a few lines" },
  { value: "small", label: "Small — one file" },
  { value: "any", label: "Anything if it's clear" },
];

const EXPERIENCE: ChipOption<ExperienceLevel>[] = [
  { value: "newcomer", label: "Never opened a PR" },
  { value: "dabbler", label: "Forked or cloned a repo" },
  { value: "experienced", label: "I've opened PRs before" },
];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function ScopeForm() {
  const router = useRouter();

  const [tier, setTier] = useState<Tier>("newcomer");
  const [experience, setExperience] = useState<ExperienceLevel>("newcomer");
  const [interests, setInterests] = useState<string[]>([]);
  const [stack, setStack] = useState<string[]>([]);
  const [fears, setFears] = useState<string[]>([]);
  const [goal, setGoal] = useState<Goal>("learn");
  const [time, setTime] = useState<TimeBudget>("weekend");
  const [types, setTypes] = useState<ContributionType[]>(["code"]);
  const [size, setSize] = useState<IssueSize>("small");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();

    if (stack.length === 0) {
      setError("Pick at least one technology so we know what to look for.");
      return;
    }

    setError(null);

    const profile: Profile = {
      tier,
      experienceLevel: tier === "newcomer" ? experience : "experienced",
      goal,
      stack: stack.map((tech) => ({ tech, fluency: tier === "newcomer" ? 2 : 4 })),
      interests,
      fears: tier === "newcomer" ? fears : [],
      contributionTypes: types.length > 0 ? types : ["code"],
      timeBudget: time,
      constraints: {},
      issueSize: tier === "newcomer" ? "any" : size,
    };

    sessionStorage.setItem("compass.profile", JSON.stringify(profile));
    router.push("/results");
  }

  return (
    <form className="panel" onSubmit={submit}>
      <TierToggle value={tier} onChange={setTier} />

      {tier === "newcomer" && (
        <div className="field">
          <span className="field-label">Where are you starting from?</span>
          <p className="field-hint">This changes how much the guide explains. No wrong answer.</p>
          <ChipGroup
            ariaLabel="Experience"
            options={EXPERIENCE}
            selected={[experience]}
            onToggle={(value) => setExperience(value)}
          />
        </div>
      )}

      <div className="field">
        <span className="field-label">What do you find interesting?</span>
        <p className="field-hint">Interest is the best predictor of whether you finish.</p>
        <ChipGroup
          ariaLabel="Interests"
          options={INTERESTS}
          selected={interests}
          onToggle={(value) => setInterests((list) => toggle(list, value))}
        />
      </div>

      {tier === "newcomer" && (
        <div className="field">
          <span className="field-label">What's the scariest part?</span>
          <p className="field-hint">We'll pick issues that avoid your blockers.</p>
          <ChipGroup
            ariaLabel="Fears"
            options={[
              { value: "setup", label: "Getting the project running" },
              { value: "codebase", label: "Understanding a new codebase" },
              { value: "review", label: "The review / rejection process" },
              { value: "not-sure", label: "Not sure — I'm just starting" },
            ].map((v) => ({ value: v.value, label: v.label }))}
            selected={fears}
            onToggle={(value) => setFears((list) => toggle(list, value))}
          />
        </div>
      )}

      <div className="field">
        <span className="field-label">What can you work in today?</span>
        <p className="field-hint">Be honest — this filters the search.</p>
        <ChipGroup
          ariaLabel="Technology stack"
          options={STACK}
          selected={stack}
          onToggle={(value) => setStack((list) => toggle(list, value))}
        />
      </div>

      <div className="field">
        <span className="field-label">What are you optimising for?</span>
        <ChipGroup
          ariaLabel="Goal"
          options={GOALS}
          selected={[goal]}
          onToggle={(value) => setGoal(value)}
        />
      </div>

      <div className="field">
        <span className="field-label">How much time can you give this?</span>
        <ChipGroup
          ariaLabel="Time budget"
          options={TIMES}
          selected={[time]}
          onToggle={(value) => setTime(value)}
        />
      </div>

      <div className="field">
        <span className="field-label">What kind of contribution appeals to you?</span>
        <ChipGroup
          ariaLabel="Contribution types"
          options={TYPES}
          selected={types}
          onToggle={(value) => setTypes((list) => toggle(list, value))}
        />
      </div>

      {tier === "experienced" && (
        <div className="field">
          <span className="field-label">How big an issue do you want?</span>
          <ChipGroup
            ariaLabel="Issue size"
            options={SIZES}
            selected={[size]}
            onToggle={(value) => setSize(value)}
          />
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <div className="form-actions">
        <button type="submit" className="btn btn-primary">
          {tier === "newcomer" ? "Find my first issue" : "Find issues"}
        </button>
        <span className="hint">Takes a few seconds. Results are verified, not just listed.</span>
      </div>

      <p className="subtle" style={{ marginTop: "1.5rem" }}>
        Already have a link?{" "}
        <a href="/verify" style={{ color: "var(--accent)" }}>
          Verify a specific issue
        </a>{" "}
        instead.
      </p>
    </form>
  );
}
