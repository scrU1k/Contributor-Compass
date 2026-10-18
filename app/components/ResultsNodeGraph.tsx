"use client";

import { useState } from "react";
import type { Profile, RankedCandidate } from "@/core/types";
import { verdict } from "@/core/format/plain";

interface ResultsNodeGraphProps {
  profile: Profile | null;
  candidates: RankedCandidate[];
  onSelectCandidate: (candidate: RankedCandidate) => void;
}

interface HoverData {
  type: "profile" | "repo" | "issue";
  title: string;
  subtitle?: string;
  badge?: { label: string; tone: "good" | "warn" | "bad" | "neutral" };
  details: string[];
  quote?: string | null;
  candidate?: RankedCandidate;
  x: number;
  y: number;
}

export function ResultsNodeGraph({
  profile,
  candidates,
  onSelectCandidate,
}: ResultsNodeGraphProps) {
  const [hovered, setHovered] = useState<HoverData | null>(null);

  if (!candidates || candidates.length === 0) return null;

  // Group candidates by repository
  const repoMap = new Map<string, RankedCandidate[]>();
  for (const c of candidates) {
    const list = repoMap.get(c.repo) ?? [];
    list.push(c);
    repoMap.set(c.repo, list);
  }

  const uniqueRepos = Array.from(repoMap.keys()).slice(0, 4);

  // Clean, static layout coordinates (viewBox 0 0 960 420)
  const profileX = 90;
  const profileY = 210;

  const repoSpacing = 360 / (uniqueRepos.length + 1);
  const repoNodes = uniqueRepos.map((repoName, idx) => {
    const y = (idx + 1) * repoSpacing + 30;
    return {
      name: repoName,
      x: 370,
      y,
      candidates: repoMap.get(repoName) ?? [],
    };
  });

  // Position issue nodes (taking up to 6 top issues)
  const displayedIssues = candidates.slice(0, 6);
  const issueSpacing = 360 / (displayedIssues.length + 1);
  const issueNodes = displayedIssues.map((cand, idx) => {
    const parentRepo = repoNodes.find((r) => r.name === cand.repo);
    const y = (idx + 1) * issueSpacing + 30;
    return {
      candidate: cand,
      x: 730,
      y,
      parentX: parentRepo?.x ?? 370,
      parentY: parentRepo?.y ?? 210,
    };
  });

  // Clamped stable coordinates for popover card so it never clips and doesn't overlap cursor
  const popoverLeft = hovered
    ? hovered.type === "issue"
      ? 43
      : hovered.type === "repo"
        ? 42
        : 14
    : 0;

  const popoverTop = hovered ? Math.min(Math.max(hovered.y - 70, 25), 230) : 0;

  return (
    <div className="node-graph-container panel" style={{ marginBottom: "2.5rem", position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "8px", marginBottom: "0.85rem" }}>
        <div>
          <span className="eyebrow" style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--accent)", fontWeight: 650 }}>
            Verification Topology Map
          </span>
          <h2 style={{ fontSize: "1.28rem", margin: "0.2rem 0 0", fontWeight: 700, letterSpacing: "-0.01em" }}>
            Discovery & Readiness Graph
          </h2>
        </div>
        <p className="subtle" style={{ margin: 0, fontSize: "0.82rem" }}>
          Hover nodes to inspect repository signals & grounded quotes • Click an issue to start
        </p>
      </div>

      <div
        style={{
          position: "relative",
          width: "100%",
          height: "420px",
          overflow: "hidden",
          borderRadius: "12px",
          background: "radial-gradient(ellipse at 45% 50%, #151d30 0%, #0d111a 100%)",
          border: "1px solid var(--line)",
          boxShadow: "inset 0 0 40px rgba(0, 0, 0, 0.4)",
        }}
      >
        <svg
          viewBox="0 0 960 420"
          style={{ width: "100%", height: "100%", display: "block" }}
          aria-label="Discovery and verification node graph"
        >
          <defs>
            <linearGradient id="edgeGradRepo" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#4f75c2" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#6f9ded" stopOpacity="0.8" />
            </linearGradient>
            <linearGradient id="edgeGradIssue" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#6f9ded" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#5fd39a" stopOpacity="0.85" />
            </linearGradient>
            <filter id="nodeGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <filter id="intenseGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="8" result="blur1" />
              <feGaussianBlur stdDeviation="3" result="blur2" />
              <feMerge>
                <feMergeNode in="blur1" />
                <feMergeNode in="blur2" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background Grid Pattern */}
          <pattern id="graphGrid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
          </pattern>
          <rect width="960" height="420" fill="url(#graphGrid)" />

          {/* Connectors: Profile -> Repositories */}
          {repoNodes.map((r, i) => {
            const isHovered = hovered?.type === "repo" && hovered.title === r.name;
            const midX = (profileX + r.x) / 2;
            const path = `M ${profileX} ${profileY} C ${midX} ${profileY}, ${midX} ${r.y}, ${r.x} ${r.y}`;
            return (
              <path
                key={`p-r-${i}`}
                d={path}
                fill="none"
                stroke={isHovered ? "var(--accent)" : "rgba(111, 157, 237, 0.35)"}
                strokeWidth={isHovered ? 2.8 : 1.5}
                strokeDasharray={isHovered ? "none" : "5 3"}
                style={{
                  transition: "stroke 0.25s, stroke-width 0.25s",
                }}
              />
            );
          })}

          {/* Connectors: Repositories -> Issues */}
          {issueNodes.map((item, i) => {
            const isHovered = hovered?.candidate?.url === item.candidate.url;
            const midX = (item.parentX + item.x) / 2;
            const path = `M ${item.parentX} ${item.parentY} C ${midX} ${item.parentY}, ${midX} ${item.y}, ${item.x} ${item.y}`;
            const v = verdict(item.candidate);
            const color =
              v.tone === "good" ? "var(--ok, #5fd39a)" : v.tone === "warn" ? "var(--warn, #e5b567)" : "var(--bad, #e26e6e)";

            return (
              <path
                key={`r-i-${i}`}
                d={path}
                fill="none"
                stroke={isHovered ? color : "rgba(95, 211, 154, 0.35)"}
                strokeWidth={isHovered ? 3.2 : 1.5}
                filter={isHovered ? "url(#nodeGlow)" : undefined}
                style={{
                  transition: "stroke 0.25s, stroke-width 0.25s",
                }}
              />
            );
          })}

          {/* 1. Profile Root Node (Static, clean, with subtle radar pulse) */}
          <g
            transform={`translate(${profileX}, ${profileY})`}
            style={{ cursor: "pointer" }}
            onMouseEnter={() => {
              setHovered({
                type: "profile",
                title: profile ? `${profile.tier.toUpperCase()} PROFILE` : "Developer Profile",
                subtitle: "Match anchor & preferences",
                badge: { label: profile?.timeBudget ?? "weekend", tone: "neutral" },
                details: [
                  `Languages: ${profile?.stack.map((s) => s.tech).join(", ") || "General"}`,
                  `Goal: ${profile?.goal ?? "learn"}`,
                  `Experience: ${profile?.experienceLevel ?? "newcomer"}`,
                ],
                x: profileX,
                y: profileY,
              });
            }}
            onMouseLeave={() => setHovered(null)}
          >
            {/* Animated Radar Pulse waves */}
            <circle className="radar-pulse-ring" fill="none" stroke="var(--accent)" strokeWidth={1.5} style={{ pointerEvents: "none" }} />
            <circle className="radar-pulse-ring-delayed" fill="none" stroke="var(--accent)" strokeWidth={1} style={{ pointerEvents: "none" }} />

            {/* Hit circle */}
            <circle r={38} fill="transparent" />

            <circle r={32} fill="#141926" stroke="var(--accent)" strokeWidth={2.5} filter="url(#nodeGlow)" style={{ pointerEvents: "none" }} />
            <circle r={38} fill="none" stroke="var(--accent)" strokeWidth={1} strokeOpacity={0.4} strokeDasharray="3 3" style={{ pointerEvents: "none" }} />
            <text textAnchor="middle" dy="-4" fill="#e8ecf3" fontSize="12" fontWeight="600" style={{ pointerEvents: "none", userSelect: "none" }}>
              YOU
            </text>
            <text textAnchor="middle" dy="12" fill="var(--muted)" fontSize="9" style={{ pointerEvents: "none", userSelect: "none" }}>
              {profile?.stack[0]?.tech ?? "Dev"}
            </text>
          </g>

          {/* 2. Repository Nodes (Firmly static, large hit target) */}
          {repoNodes.map((r, i) => {
            const shortName = r.name.split("/")[1] || r.name;
            const signals = r.candidates[0]?.signals;
            const isHovered = hovered?.type === "repo" && hovered.title === r.name;

            return (
              <g
                key={`repo-node-${i}`}
                transform={`translate(${r.x}, ${r.y})`}
                style={{ cursor: "pointer" }}
                onMouseEnter={() => {
                  setHovered({
                    type: "repo",
                    title: r.name,
                    subtitle: signals?.description ?? "Scouted repository",
                    badge: { label: `${signals?.stars ?? 0} ★`, tone: "neutral" },
                    details: [
                      `CI Workflow: ${signals?.hasCI ? "Present ✓" : "None"}`,
                      `Outsider Merges: ${signals?.mergedPRsFromOutsiders90d ?? 0} in 90d`,
                      `Documentation: ${signals?.hasContributing ? "CONTRIBUTING.md ✓" : "README only"}`,
                      `Candidate Issues: ${r.candidates.length}`,
                    ],
                    x: r.x,
                    y: r.y,
                  });
                }}
                onMouseLeave={() => setHovered(null)}
              >
                {/* Generous hit area */}
                <circle r={32} fill="transparent" />

                <circle
                  r={22}
                  fill="#182032"
                  stroke={isHovered ? "var(--accent)" : "rgba(111, 157, 237, 0.85)"}
                  strokeWidth={isHovered ? 2.8 : 1.6}
                  filter={isHovered ? "url(#intenseGlow)" : "url(#nodeGlow)"}
                  style={{
                    pointerEvents: "none",
                    transform: isHovered ? "scale(1.12)" : "scale(1)",
                    transformOrigin: "center",
                    transformBox: "fill-box",
                    transition: "transform 0.2s ease, stroke 0.2s ease",
                  }}
                />
                <text textAnchor="middle" dy="-2" fill="#e8ecf3" fontSize="10" fontWeight="600" style={{ pointerEvents: "none", userSelect: "none" }}>
                  {shortName.slice(0, 9)}
                </text>
                <text textAnchor="middle" dy="10" fill="var(--muted)" fontSize="8" style={{ pointerEvents: "none", userSelect: "none" }}>
                  {signals?.language ?? "Repo"}
                </text>
              </g>
            );
          })}

          {/* 3. Issue Nodes (Firmly static, reliable hover menu) */}
          {issueNodes.map((item, i) => {
            const c = item.candidate;
            const v = verdict(c);
            const isHovered = hovered?.candidate?.url === c.url;
            const strokeColor =
              v.tone === "good" ? "var(--ok, #5fd39a)" : v.tone === "warn" ? "var(--warn, #e5b567)" : "var(--bad, #e26e6e)";

            return (
              <g
                key={`issue-node-${i}`}
                transform={`translate(${item.x}, ${item.y})`}
                style={{ cursor: "pointer" }}
                onClick={() => onSelectCandidate(c)}
                onMouseEnter={() => {
                  setHovered({
                    type: "issue",
                    title: `#${c.number}: ${c.title}`,
                    subtitle: `${c.repo} • Readiness: ${c.score.total.toFixed(0)}/100`,
                    badge: { label: v.label, tone: v.tone },
                    details: [
                      `Effort: ${c.sizeHint}`,
                      `Competition: ${c.linkedOpenPRs === 0 ? "0 open PRs ✓" : `${c.linkedOpenPRs} open PRs`}`,
                      `Assignment: ${c.assigned ? "Assigned" : "Unassigned ✓"}`,
                    ],
                    quote: c.jevDecision?.quoteVerified ? c.jevDecision.quote : null,
                    candidate: c,
                    x: item.x,
                    y: item.y,
                  });
                }}
                onMouseLeave={() => setHovered(null)}
              >
                {/* Generous hit area covering node and label */}
                <rect x={-24} y={-16} width={220} height={32} fill="transparent" />

                <circle
                  r={18}
                  fill="#151b29"
                  stroke={strokeColor}
                  strokeWidth={isHovered ? 3.2 : 2}
                  filter={isHovered ? "url(#intenseGlow)" : undefined}
                  style={{
                    pointerEvents: "none",
                    transform: isHovered ? "scale(1.15)" : "scale(1)",
                    transformOrigin: "center",
                    transformBox: "fill-box",
                    transition: "transform 0.2s ease, stroke 0.2s ease",
                  }}
                />
                <text textAnchor="middle" dy="4" fill="#e8ecf3" fontSize="9" fontWeight="bold" style={{ pointerEvents: "none", userSelect: "none" }}>
                  #{c.number}
                </text>
                <text x="26" y="4" fill={isHovered ? "var(--fg)" : "#cbd5e1"} fontSize="10.5" fontWeight={isHovered ? "600" : "500"} style={{ pointerEvents: "none", userSelect: "none" }}>
                  {c.title.length > 25 ? `${c.title.slice(0, 25)}…` : c.title}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Stable Hover Popover Card positioned cleanly to the side */}
        {hovered && (
          <div
            className="graph-hover-popover"
            style={{
              position: "absolute",
              left: `${popoverLeft}%`,
              top: `${popoverTop}px`,
              zIndex: 30,
              pointerEvents: "auto",
              minWidth: "280px",
              maxWidth: "350px",
              background: "rgba(18, 23, 36, 0.97)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              border: "1px solid var(--line)",
              boxShadow: "0 16px 36px rgba(0,0,0,0.55), 0 0 20px rgba(111,157,237,0.18)",
              borderRadius: "10px",
              padding: "0.9rem 1.1rem",
              animation: "popoverIn 0.15s ease-out",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", marginBottom: "4px" }}>
              <div style={{ fontWeight: 650, fontSize: "0.88rem", color: "var(--fg)", lineHeight: 1.3 }}>
                {hovered.title}
              </div>
              {hovered.badge && (
                <span className={`badge ${hovered.badge.tone}`} style={{ fontSize: "0.72rem", padding: "0.15rem 0.45rem", whiteSpace: "nowrap" }}>
                  {hovered.badge.label}
                </span>
              )}
            </div>

            {hovered.subtitle && (
              <div className="subtle" style={{ fontSize: "0.76rem", marginBottom: "0.5rem" }}>
                {hovered.subtitle}
              </div>
            )}

            <ul style={{ margin: "0.4rem 0 0", paddingLeft: "1.1rem", fontSize: "0.78rem", color: "var(--muted)", lineHeight: 1.45 }}>
              {hovered.details.map((d, idx) => (
                <li key={idx}>{d}</li>
              ))}
            </ul>

            {hovered.quote && (
              <div style={{ marginTop: "0.6rem", padding: "0.45rem 0.65rem", background: "rgba(95, 211, 154, 0.08)", borderLeft: "2px solid var(--ok)", borderRadius: "4px", fontSize: "0.75rem", fontStyle: "italic", color: "#a7f3d0" }}>
                🔍 &ldquo;{hovered.quote}&rdquo;
              </div>
            )}

            {hovered.candidate && (
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: "100%", marginTop: "0.8rem", padding: "0.38rem 0.6rem", fontSize: "0.82rem" }}
                onClick={() => onSelectCandidate(hovered.candidate!)}
              >
                Get Step-by-Step Guide ➔
              </button>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        /* Radar Pulse Rings */
        @keyframes radarExpand {
          0% {
            r: 32px;
            opacity: 0.8;
          }
          100% {
            r: 54px;
            opacity: 0;
          }
        }

        /* Popover Entrance */
        @keyframes popoverIn {
          0% {
            opacity: 0;
            transform: scale(0.97);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }

        .radar-pulse-ring {
          animation: radarExpand 2.8s cubic-bezier(0.2, 0.8, 0.2, 1) infinite;
        }
        .radar-pulse-ring-delayed {
          animation: radarExpand 2.8s cubic-bezier(0.2, 0.8, 0.2, 1) 1.4s infinite;
        }
      `}</style>
    </div>
  );
}
