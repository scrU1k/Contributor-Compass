"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { RankedCandidate } from "@/core/types";

interface SavedItem {
  repo: string;
  number: number;
  title: string;
  url: string;
  candidate: RankedCandidate;
  savedAt: string;
}

export function HeroSavedButton() {
  const router = useRouter();
  const [savedIssues, setSavedIssues] = useState<SavedItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    const readSaved = () => {
      try {
        const raw = localStorage.getItem("compass.saved_issues");
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) setSavedIssues(list);
        } else {
          setSavedIssues([]);
        }
      } catch {
        // ignore
      }
    };

    readSaved();
    window.addEventListener("storage", readSaved);
    return () => window.removeEventListener("storage", readSaved);
  }, []);

  function handleButtonClick() {
    if (savedIssues.length > 0) {
      setIsOpen(true);
      setShowTooltip(false);
    } else {
      setShowTooltip(true);
      setTimeout(() => setShowTooltip(false), 3000);
    }
  }

  function removeSaved(repo: string, number: number) {
    const updated = savedIssues.filter((i) => !(i.repo === repo && i.number === number));
    setSavedIssues(updated);
    try {
      localStorage.setItem("compass.saved_issues", JSON.stringify(updated));
      window.dispatchEvent(new Event("storage"));
    } catch {
      // ignore
    }
    if (updated.length === 0) {
      setIsOpen(false);
    }
  }

  function openGuide(item: SavedItem) {
    try {
      sessionStorage.setItem("compass.selected", JSON.stringify(item.candidate));
      // Ensure there's a fallback profile if none is currently set
      if (!sessionStorage.getItem("compass.profile")) {
        sessionStorage.setItem(
          "compass.profile",
          JSON.stringify({
            tier: "newcomer",
            stack: [{ tech: item.candidate.signals.language || "General", comfort: "learning" }],
            interests: [],
            contributionTypes: ["code"],
            timeBudgetHours: 5,
            preferredEffort: "medium",
          }),
        );
      }
      router.push("/guide");
    } catch {
      // ignore
    }
  }

  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center", margin: 0 }}>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={handleButtonClick}
        onMouseEnter={() => {
          if (savedIssues.length === 0) setShowTooltip(true);
        }}
        onMouseLeave={() => {
          if (savedIssues.length === 0) setShowTooltip(false);
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          height: "36px",
          boxSizing: "border-box",
          lineHeight: 1,
          fontSize: "0.84rem",
          fontWeight: 600,
          padding: "6px 14px",
          borderRadius: "8px",
          border: "1px solid var(--line)",
          background: "var(--card)",
          color: "var(--fg)",
          cursor: "pointer",
        }}
        aria-label="Saved Issues"
      >
        <span style={{ color: savedIssues.length > 0 ? "var(--accent)" : "var(--muted)", fontSize: "0.95rem" }}>★</span>
        <span>Saved Issues</span>
        {savedIssues.length > 0 && (
          <span
            style={{
              background: "var(--accent)",
              color: "#fff",
              fontSize: "0.68rem",
              fontWeight: 700,
              borderRadius: "999px",
              padding: "1px 6px",
              marginLeft: "2px",
            }}
          >
            {savedIssues.length}
          </span>
        )}
      </button>

      {/* Hover Card when nothing is saved */}
      {showTooltip && savedIssues.length === 0 && (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            background: "var(--card, #141926)",
            border: "1px solid var(--line, #242c3d)",
            borderRadius: "8px",
            padding: "8px 14px",
            fontSize: "0.78rem",
            color: "var(--muted)",
            whiteSpace: "nowrap",
            boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
            zIndex: 50,
            pointerEvents: "none",
            animation: "fadeIn 0.15s ease-out",
          }}
        >
          <span style={{ color: "var(--accent)", marginRight: "4px" }}>★</span>
          Nothing saved yet. Click &ldquo;☆ Save&rdquo; on any issue card or guide page to bookmark it!
        </div>
      )}

      {/* Modal / Drawer when saved issues exist */}
      {isOpen && savedIssues.length > 0 && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(6px)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
          onClick={() => setIsOpen(false)}
        >
          <div
            className="panel"
            style={{
              width: "100%",
              maxWidth: "600px",
              maxHeight: "85vh",
              overflowY: "auto",
              background: "var(--card, #141926)",
              border: "1px solid var(--accent)",
              borderRadius: "12px",
              padding: "1.5rem",
              boxShadow: "0 20px 50px rgba(0,0,0,0.6)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.2rem" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700 }}>
                  ★ Saved Issues ({savedIssues.length})
                </h3>
                <p className="subtle" style={{ margin: "4px 0 0", fontSize: "0.8rem" }}>
                  Bookmarked issues you saved for later hacking.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: "0.8rem", padding: "4px 10px" }}
                onClick={() => setIsOpen(false)}
              >
                ✕ Close
              </button>
            </div>

            <div style={{ display: "grid", gap: "10px" }}>
              {savedIssues.map((item) => (
                <div
                  key={`${item.repo}#${item.number}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px 14px",
                    background: "var(--bg)",
                    border: "1px solid var(--line)",
                    borderRadius: "8px",
                    flexWrap: "wrap",
                    gap: "10px",
                  }}
                >
                  <div style={{ flex: 1, minWidth: "240px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ color: "var(--accent)", fontSize: "0.84rem", fontWeight: 600 }}>
                        {item.repo} #{item.number}
                      </span>
                      {item.candidate?.score?.total && (
                        <span className="badge neutral" style={{ fontSize: "0.7rem", padding: "0.1rem 0.4rem" }}>
                          {item.candidate.score.total.toFixed(0)}/100
                        </span>
                      )}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: "0.9rem", marginTop: "3px" }}>
                      {item.title}
                    </div>
                    <div className="subtle" style={{ fontSize: "0.72rem", marginTop: "2px" }}>
                      Saved on {new Date(item.savedAt).toLocaleDateString()}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ fontSize: "0.78rem", padding: "5px 12px" }}
                      onClick={() => openGuide(item)}
                    >
                      Get the guide ➔
                    </button>
                    <a
                      className="btn btn-ghost"
                      style={{ fontSize: "0.78rem", padding: "5px 10px" }}
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      GitHub ↗
                    </a>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: "0.75rem", padding: "5px 8px" }}
                      onClick={() => removeSaved(item.repo, item.number)}
                      title="Remove bookmark"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
