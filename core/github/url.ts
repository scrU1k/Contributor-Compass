/**
 * Universal GitHub URL and target identifier parser.
 *
 * Distinguishes between:
 *   1. Single Issue: "github.com/owner/repo/issues/123"
 *   2. Single Repository: "github.com/owner/repo" or "owner/repo"
 *   3. Owner / Organization: "github.com/openstreetmap" or "openstreetmap" or "@openstreetmap"
 */

export type GitHubTarget =
  | { kind: "issue"; repo: string; number: number; rawUrl: string }
  | { kind: "repo"; owner: string; repo: string; fullName: string; rawUrl: string }
  | { kind: "owner"; owner: string; rawUrl: string };

export function parseGitHubTarget(input: string): GitHubTarget | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Strip leading @ if user pasted an org handle like @openstreetmap
  const cleanInput = trimmed.replace(/^@/, "");

  // 1. Check if input is a plain text identifier (no URL protocol, no domain)
  if (!cleanInput.includes("://") && !cleanInput.startsWith("github.com")) {
    const parts = cleanInput.split("/").map((p) => p.trim()).filter(Boolean);
    if (parts.length === 1) {
      if (/^[A-Za-z0-9_-]+$/.test(parts[0])) {
        return {
          kind: "owner",
          owner: parts[0],
          rawUrl: `https://github.com/${parts[0]}`,
        };
      }
    } else if (parts.length === 2) {
      if (parts[1].includes("#")) {
        const [repoName, numStr] = parts[1].split("#");
        const num = Number(numStr);
        if (/^[A-Za-z0-9_-]+$/.test(parts[0]) && /^[A-Za-z0-9_.-]+$/.test(repoName) && !isNaN(num) && num > 0) {
          return {
            kind: "issue",
            repo: `${parts[0]}/${repoName}`,
            number: num,
            rawUrl: `https://github.com/${parts[0]}/${repoName}/issues/${num}`,
          };
        }
      }
      if (/^[A-Za-z0-9_-]+$/.test(parts[0]) && /^[A-Za-z0-9_.-]+$/.test(parts[1])) {
        return {
          kind: "repo",
          owner: parts[0],
          repo: parts[1],
          fullName: `${parts[0]}/${parts[1]}`,
          rawUrl: `https://github.com/${parts[0]}/${parts[1]}`,
        };
      }
    } else if (parts.length >= 4 && (parts[2] === "issues" || parts[2] === "pull")) {
      const num = Number(parts[3]);
      if (!isNaN(num) && num > 0) {
        return {
          kind: "issue",
          repo: `${parts[0]}/${parts[1]}`,
          number: num,
          rawUrl: `https://github.com/${parts[0]}/${parts[1]}/issues/${num}`,
        };
      }
    }
  }

  // 2. Parse as URL
  try {
    let normalized = cleanInput;
    if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
      normalized = `https://${normalized}`;
    }
    const url = new URL(normalized);
    if (url.hostname.toLowerCase() !== "github.com") return null;

    const segments = url.pathname.split("/").map((s) => s.trim()).filter(Boolean);
    if (segments.length === 0) return null;

    // Filter out reserved GitHub top-level paths that aren't orgs
    const RESERVED = new Set([
      "features", "pricing", "marketplace", "explore", "topics",
      "trending", "collections", "events", "settings", "notifications",
      "login", "join", "about", "contact", "security", "search",
    ]);
    if (RESERVED.has(segments[0].toLowerCase())) {
      return null;
    }

    if (segments.length === 1) {
      // e.g. https://github.com/openstreetmap
      if (/^[A-Za-z0-9_-]+$/.test(segments[0])) {
        return {
          kind: "owner",
          owner: segments[0],
          rawUrl: `https://github.com/${segments[0]}`,
        };
      }
    } else if (segments.length === 2) {
      // e.g. https://github.com/openstreetmap/iD
      if (/^[A-Za-z0-9_-]+$/.test(segments[0]) && /^[A-Za-z0-9_.-]+$/.test(segments[1])) {
        return {
          kind: "repo",
          owner: segments[0],
          repo: segments[1],
          fullName: `${segments[0]}/${segments[1]}`,
          rawUrl: `https://github.com/${segments[0]}/${segments[1]}`,
        };
      }
    } else if (segments.length >= 4 && (segments[2] === "issues" || segments[2] === "pull")) {
      // e.g. https://github.com/openstreetmap/iD/issues/8942
      const num = Number(segments[3]);
      if (!isNaN(num) && num > 0) {
        return {
          kind: "issue",
          repo: `${segments[0]}/${segments[1]}`,
          number: num,
          rawUrl: `https://github.com/${segments[0]}/${segments[1]}/issues/${num}`,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}
