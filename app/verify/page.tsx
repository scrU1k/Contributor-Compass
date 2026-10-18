"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { RankedCandidate, Tier } from "@/core/types";
import { minimalProfile } from "@/core/profile/defaults";
import { CandidateCard } from "../components/CandidateCard";
import { SiteHeader } from "../components/SiteHeader";
import { TierToggle } from "../components/TierToggle";
import { settingsHeaders } from "../lib/settings";

export interface OrgCoverageInfo {
  owner: string;
  ownerName: string;
  ownerType: string;
  totalPublicRepos: number;
  scannedRepos: number;
  activeCandidateRepos: number;
  selectedRepos: string[];
}

const QUICK_TAG_SUGGESTIONS = [
  "good first issue",
  "documentation",
  "bug",
  "python",
  "typescript",
  "rust",
];

export default function FindByLinkPage() {
  const router = useRouter();
  const [urls, setUrls] = useState<string[]>([""]);
  const [tagsInput, setTagsInput] = useState<string>("");
  const [tier, setTier] = useState<Tier>("newcomer");
  const [candidates, setCandidates] = useState<RankedCandidate[]>([]);
  const [orgsCoverage, setOrgsCoverage] = useState<OrgCoverageInfo[]>([]);
  const [partialErrors, setPartialErrors] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleUrlChange(index: number, value: string) {
    setUrls((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function addUrlField() {
    setUrls((prev) => [...prev, ""]);
  }

  function removeUrlField(index: number) {
    setUrls((prev) => {
      if (prev.length <= 1) return [""];
      return prev.filter((_, i) => i !== index);
    });
  }

  function addQuickTag(tag: string) {
    const existing = tagsInput
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    if (!existing.includes(tag.toLowerCase())) {
      const updated = existing.length > 0 ? `${tagsInput.trim()}, ${tag}` : tag;
      setTagsInput(updated);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPartialErrors([]);
    setCandidates([]);
    setOrgsCoverage([]);

    const cleanUrls = urls.map((u) => u.trim()).filter(Boolean);
    if (cleanUrls.length === 0) {
      setError("Please enter at least one GitHub issue, repository, or organization link.");
      return;
    }

    setLoading(true);

    const cleanTags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      const response = await fetch("/api/verify", {
        method: "POST",
        headers: { "content-type": "application/json", ...settingsHeaders() },
        body: JSON.stringify({
          urls: cleanUrls,
          tags: cleanTags,
          tier,
        }),
      });
      const data = (await response.json()) as {
        candidates?: RankedCandidate[];
        orgs?: OrgCoverageInfo[];
        org?: OrgCoverageInfo;
        errors?: string[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Could not verify the requested GitHub targets");
      }

      setCandidates(data.candidates ?? []);
      setOrgsCoverage(data.orgs ?? (data.org ? [data.org] : []));
      if (data.errors && data.errors.length > 0) {
        setPartialErrors(data.errors);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong during verification");
    } finally {
      setLoading(false);
    }
  }

  function open(selected: RankedCandidate) {
    const cleanTags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const baseProfile = minimalProfile(tier);
    if (cleanTags.length > 0) {
      baseProfile.stack = cleanTags.map((t) => ({ tech: t, fluency: 3 as const }));
      baseProfile.interests = cleanTags;
    }

    sessionStorage.setItem("compass.profile", JSON.stringify(baseProfile));
    sessionStorage.setItem("compass.selected", JSON.stringify(selected));
    router.push("/guide");
  }

  return (
    <>
      <SiteHeader />
      <main className="container narrow" style={{ paddingBottom: "4rem" }}>
        <section className="hero" style={{ paddingBottom: "1.5rem" }}>
          <p className="eyebrow">Direct GitHub Verification</p>
          <h1>Find by Link</h1>
          <p className="lede">
            Have specific projects or issues in mind? Paste one or multiple GitHub links below to verify
            unassigned starter issues, avoid competing PRs, inspect newcomer docs, and check feasibility before you write code.
          </p>
        </section>

        <form className="panel" onSubmit={submit} style={{ display: "grid", gap: "1.25rem" }}>
          <div className="field">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <label className="field-label" style={{ margin: 0 }}>
                GitHub Target Links ({urls.length})
              </label>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={addUrlField}
                style={{
                  fontSize: "0.78rem",
                  padding: "4px 10px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  border: "1px dashed var(--accent)",
                  color: "var(--accent)",
                }}
                title="Add another GitHub link"
              >
                <span style={{ fontSize: "1rem", lineHeight: 1 }}>+</span> Add another link
              </button>
            </div>
            <p className="field-hint" style={{ marginTop: 0, marginBottom: "10px" }}>
              Accepts issues (<code>pallets/flask#5555</code> or full URL), repositories (<code>facebook/react</code>), or organizations (<code>openstreetmap</code>).
            </p>

            <div style={{ display: "grid", gap: "8px" }}>
              {urls.map((val, idx) => (
                <div key={idx} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <span
                    className="badge neutral"
                    style={{
                      fontSize: "0.75rem",
                      padding: "0.25rem 0.5rem",
                      fontWeight: 600,
                      userSelect: "none",
                      minWidth: "26px",
                      textAlign: "center",
                    }}
                  >
                    #{idx + 1}
                  </span>
                  <input
                    className="input"
                    value={val}
                    onChange={(e) => handleUrlChange(idx, e.target.value)}
                    placeholder={
                      idx === 0
                        ? "e.g. pallets/flask, https://github.com/facebook/react/issues/123, or openstreetmap"
                        : "e.g. rust-lang/rust, owner/repo#456, or organization"
                    }
                    autoComplete="off"
                    spellCheck={false}
                    style={{ flex: 1 }}
                  />
                  {/* Plus button directly beside each input to quickly add another link */}
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={addUrlField}
                    style={{
                      padding: "7px 12px",
                      border: "1px solid var(--accent)",
                      color: "var(--accent)",
                      background: "rgba(59, 130, 246, 0.08)",
                      fontSize: "1.1rem",
                      fontWeight: 700,
                      lineHeight: 1,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      borderRadius: "6px",
                    }}
                    title="Click + to add another link"
                    aria-label="Add link"
                  >
                    +
                  </button>
                  {urls.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => removeUrlField(idx)}
                      style={{
                        padding: "7px 10px",
                        color: "var(--warn, #e5b567)",
                        border: "1px solid var(--line)",
                        fontSize: "0.85rem",
                        borderRadius: "6px",
                      }}
                      title="Remove this link"
                      aria-label="Remove link"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div style={{ marginTop: "10px" }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={addUrlField}
                style={{
                  fontSize: "0.82rem",
                  padding: "6px 14px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  border: "1px dashed var(--accent)",
                  color: "var(--accent)",
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: "1.05rem", fontWeight: 700, lineHeight: 1 }}>+</span>
                <span>Add another link</span>
              </button>
            </div>
          </div>

          {/* Custom Tags Section */}
          <div className="field" style={{ borderTop: "1px solid var(--line)", paddingTop: "1rem" }}>
            <label className="field-label" htmlFor="custom-tags">
              Custom Tags & Focus Areas (Optional)
            </label>
            <p className="field-hint" style={{ marginTop: 2, marginBottom: 8 }}>
              Prioritize or filter issues matching specific labels, languages, or keywords.
            </p>
            <input
              id="custom-tags"
              className="input"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g. good first issue, docs, python, bug"
              autoComplete="off"
              spellCheck={false}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px", alignItems: "center" }}>
              <span className="subtle" style={{ fontSize: "0.75rem", marginRight: "4px" }}>
                Quick tags:
              </span>
              {QUICK_TAG_SUGGESTIONS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="badge neutral"
                  onClick={() => addQuickTag(tag)}
                  style={{ cursor: "pointer", background: "var(--card)", border: "1px solid var(--line)" }}
                >
                  + {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Tier Toggle */}
          <div className="field" style={{ borderTop: "1px solid var(--line)", paddingTop: "1rem" }}>
            <span className="field-label">How much detail do you want?</span>
            <TierToggle value={tier} onChange={setTier} />
          </div>

          {error && <p className="error">{error}</p>}

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.5rem" }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || urls.every((u) => !u.trim())}
              style={{ padding: "8px 24px", fontSize: "0.92rem" }}
            >
              {loading ? "Checking & Verifying…" : `Verify & Find Issues (${urls.filter((u) => u.trim()).length || 1}) ➔`}
            </button>
          </div>
        </form>

        {/* Partial warnings if some links failed */}
        {partialErrors.length > 0 && (
          <div
            className="panel"
            style={{
              marginTop: "1.25rem",
              background: "rgba(229, 181, 103, 0.08)",
              border: "1px solid var(--warn, #e5b567)",
              borderRadius: "8px",
              padding: "0.85rem 1.15rem",
            }}
          >
            <strong style={{ color: "var(--warn, #e5b567)", fontSize: "0.86rem", display: "block", marginBottom: "4px" }}>
              ⚠️ Notice: Some links could not be verified
            </strong>
            <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.8rem", color: "var(--fg)" }}>
              {partialErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Organization Coverage Cards */}
        {orgsCoverage.map((orgCoverage) => (
          <div
            key={orgCoverage.owner}
            className="panel"
            style={{
              marginTop: "1.25rem",
              background: "var(--card)",
              border: "1px solid var(--line)",
              borderRadius: "8px",
              padding: "1rem 1.25rem",
            }}
          >
            <p style={{ margin: 0, fontWeight: 600 }}>
              🏢 {orgCoverage.ownerType}:{" "}
              <a href={`https://github.com/${orgCoverage.owner}`} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                {orgCoverage.ownerName}
              </a>
            </p>
            <p className="subtle" style={{ margin: "0.4rem 0 0", fontSize: "0.82rem" }}>
              Evaluated {orgCoverage.selectedRepos.length} most active repositories (
              {orgCoverage.selectedRepos.map((r) => r.split("/")[1] || r).join(", ")}) of{" "}
              {orgCoverage.totalPublicRepos} public repos.
            </p>
          </div>
        ))}

        {/* Candidate Results */}
        {candidates.length > 0 && (
          <div style={{ marginTop: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
              <p className="subtle" style={{ margin: 0, fontWeight: 600 }}>
                {candidates.length === 1
                  ? "1 verified issue ready to work on:"
                  : `Showing ${candidates.length} verified issue${candidates.length === 1 ? "" : "s"} ranked by readiness:`}
              </p>
              {tagsInput.trim() && (
                <span className="badge accent" style={{ fontSize: "0.75rem" }}>
                  Filtered by tags: {tagsInput}
                </span>
              )}
            </div>

            {candidates.map((cand, idx) => (
              <CandidateCard
                key={`${cand.repo}#${cand.number}`}
                candidate={cand}
                tier={tier}
                featured={idx === 0}
                rank={idx + 1}
                onSelect={open}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
