"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, type FormEvent } from "react";
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
import { loadSettings } from "../lib/settings";

const BASE_INTERESTS: ChipOption<string>[] = [
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

const BASE_STACK: ChipOption<string>[] = [
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

  // Custom "Other" inputs
  const [showOtherInterest, setShowOtherInterest] = useState(false);
  const [customInterestInput, setCustomInterestInput] = useState("");
  const [showOtherStack, setShowOtherStack] = useState(false);
  const [customStackInput, setCustomStackInput] = useState("");

  // No API key notice modal state
  const [pendingProfile, setPendingProfile] = useState<Profile | null>(null);
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    if (!pendingProfile) return;

    if (countdown <= 0) {
      proceedToResults(pendingProfile);
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [pendingProfile, countdown]);

  function addCustomInterest() {
    const val = customInterestInput.trim();
    if (val && !interests.includes(val)) {
      setInterests((prev) => [...prev, val]);
      setCustomInterestInput("");
    }
  }

  function addCustomStack() {
    const val = customStackInput.trim();
    if (val && !stack.includes(val)) {
      setStack((prev) => [...prev, val]);
      setCustomStackInput("");
    }
  }

  function proceedToResults(prof: Profile) {
    sessionStorage.removeItem("compass.results");
    sessionStorage.removeItem("compass.scout");
    sessionStorage.setItem("compass.profile", JSON.stringify(prof));
    router.push("/results");
  }

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

    // If user has not configured any keys in Settings, show the quick notice dialog
    const settings = loadSettings();
    const hasKeys = Boolean(settings.llmApiKey.trim() || settings.githubToken.trim());

    if (!hasKeys) {
      setPendingProfile(profile);
      setCountdown(3);
      return;
    }

    proceedToResults(profile);
  }

  // Combine base options with custom ones
  const allInterestOptions: ChipOption<string>[] = [
    ...BASE_INTERESTS,
    ...interests
      .filter((i) => !BASE_INTERESTS.some((b) => b.value.toLowerCase() === i.toLowerCase()))
      .map((val) => ({ value: val, label: `✦ ${val}` })),
  ];

  const allStackOptions: ChipOption<string>[] = [
    ...BASE_STACK,
    ...stack
      .filter((s) => !BASE_STACK.some((b) => b.value.toLowerCase() === s.toLowerCase()))
      .map((val) => ({ value: val, label: `✦ ${val}` })),
  ];

  return (
    <form className="panel" onSubmit={submit} style={{ position: "relative" }}>
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
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
          <ChipGroup
            ariaLabel="Interests"
            options={allInterestOptions}
            selected={interests}
            onToggle={(value) => setInterests((list) => toggle(list, value))}
          />
          <button
            type="button"
            className={`chip${showOtherInterest ? " active" : ""}`}
            style={{ borderStyle: "dashed" }}
            onClick={() => setShowOtherInterest((prev) => !prev)}
          >
            {showOtherInterest ? "− Close Other" : "+ Other..."}
          </button>
        </div>

        {showOtherInterest && (
          <div style={{ marginTop: "10px", display: "flex", gap: "8px", maxWidth: "420px" }}>
            <input
              type="text"
              placeholder="e.g. astronomy, robotics, bioinformatics..."
              value={customInterestInput}
              onChange={(e) => setCustomInterestInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustomInterest();
                }
              }}
              style={{
                flex: 1,
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid var(--line)",
                background: "var(--bg-input, #0d111a)",
                color: "var(--fg)",
                fontSize: "0.85rem",
              }}
            />
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: "4px 12px", fontSize: "0.82rem" }}
              onClick={addCustomInterest}
            >
              Add
            </button>
          </div>
        )}
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
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
          <ChipGroup
            ariaLabel="Technology stack"
            options={allStackOptions}
            selected={stack}
            onToggle={(value) => setStack((list) => toggle(list, value))}
          />
          <button
            type="button"
            className={`chip${showOtherStack ? " active" : ""}`}
            style={{ borderStyle: "dashed" }}
            onClick={() => setShowOtherStack((prev) => !prev)}
          >
            {showOtherStack ? "− Close Other" : "+ Other..."}
          </button>
        </div>

        {showOtherStack && (
          <div style={{ marginTop: "10px", display: "flex", gap: "8px", maxWidth: "420px" }}>
            <input
              type="text"
              placeholder="e.g. Elixir, Dart, Haskell, Lua, Solidity..."
              value={customStackInput}
              onChange={(e) => setCustomStackInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustomStack();
                }
              }}
              style={{
                flex: 1,
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid var(--line)",
                background: "var(--bg-input, #0d111a)",
                color: "var(--fg)",
                fontSize: "0.85rem",
              }}
            />
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: "4px 12px", fontSize: "0.82rem" }}
              onClick={addCustomStack}
            >
              Add
            </button>
          </div>
        )}
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

      {/* Auto-fading Dialog if No API Key or GitHub Token is Configured */}
      {pendingProfile && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.7)",
            backdropFilter: "blur(6px)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            animation: "fadeIn 0.2s ease-out",
          }}
        >
          <div
            className="panel"
            style={{
              maxWidth: "460px",
              width: "100%",
              border: "1px solid var(--accent)",
              boxShadow: "0 20px 50px rgba(0,0,0,0.6)",
              padding: "1.5rem",
              background: "var(--card, #141926)",
              borderRadius: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "0.85rem" }}>
              <span style={{ fontSize: "1.5rem" }}>⚠️</span>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>
                No API Key or Token Registered
              </h3>
            </div>

            <p style={{ fontSize: "0.88rem", lineHeight: 1.5, color: "var(--muted)", margin: "0 0 1rem" }}>
              Live discovery across GitHub and Gemma AI semantic reasoning require credentials.
              Without them, we are serving our <strong>Curated Baseline Catalog</strong>.
            </p>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <Link
                href="/settings"
                className="btn btn-primary"
                style={{ fontSize: "0.84rem", padding: "6px 14px" }}
              >
                Configure Keys in Settings ➔
              </Link>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: "0.84rem", padding: "6px 14px" }}
                onClick={() => proceedToResults(pendingProfile)}
              >
                Continue with Baseline ({countdown}s)
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
