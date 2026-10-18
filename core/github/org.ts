import { gh, GitHubError } from "./client";
import { cached } from "@/core/cache/cache";
import { getRepoIssues, getRepoOpenPRs, linkedPRCount } from "./issues";
import { getRepoSignals } from "./signals";
import { toCandidate } from "@/core/candidate";
import { rankCandidates } from "@/core/rank/rank";
import { evaluateIssueWithJev } from "@/core/verify/jev";
import { llmConfigured } from "@/core/llm/adapter";
import { isPromising, fitsHardConstraints } from "./filters";
import type { IssueCandidate, Profile, RankedCandidate } from "@/core/types";

export interface GhOwnerInfo {
  login: string;
  type: "Organization" | "User";
  name?: string;
  public_repos: number;
  description?: string;
  html_url: string;
}

export interface GhOrgRepoItem {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  open_issues_count: number;
  fork: boolean;
  archived: boolean;
  disabled: boolean;
  pushed_at: string;
  has_issues: boolean;
}

export interface OrgDiscoveryResult {
  owner: string;
  ownerName: string;
  ownerType: "Organization" | "User";
  ownerUrl: string;
  description?: string;
  totalPublicRepos: number;
  scannedRepos: number;
  activeCandidateRepos: number;
  selectedRepos: string[];
  candidates: RankedCandidate[];
}

const OWNER_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const REPOS_TTL_MS = 60 * 60 * 1000;       // 1 hour
const MAX_SCOUT_REPOS = 5;                 // Budget: evaluate up to 5 repos per org search
const ISSUES_PER_REPO = 5;

/**
 * Resolves whether an owner is an Organization or User and retrieves their public stats.
 */
export async function getOwnerInfo(owner: string): Promise<GhOwnerInfo> {
  const cleanOwner = owner.trim();
  return cached(`owner-info:v1:${cleanOwner.toLowerCase()}`, OWNER_TTL_MS, async () => {
    try {
      const data = await gh<GhOwnerInfo>(`/users/${encodeURIComponent(cleanOwner)}`);
      return {
        login: data.login,
        type: data.type || "Organization",
        name: data.name || data.login,
        public_repos: data.public_repos || 0,
        description: data.description || "",
        html_url: data.html_url || `https://github.com/${data.login}`,
      };
    } catch (err) {
      if (err instanceof GitHubError && err.status === 404) {
        throw new Error(`GitHub organization or user "${cleanOwner}" was not found.`);
      }
      throw err;
    }
  });
}

/**
 * Lists the most recently active public repositories for an organization or user.
 */
export async function getOwnerRepos(
  owner: string,
  ownerType: "Organization" | "User" = "Organization",
): Promise<GhOrgRepoItem[]> {
  const cleanOwner = owner.trim();
  const endpoint =
    ownerType === "Organization"
      ? `/orgs/${encodeURIComponent(cleanOwner)}/repos?type=public&sort=pushed&direction=desc&per_page=100`
      : `/users/${encodeURIComponent(cleanOwner)}/repos?type=owner&sort=pushed&direction=desc&per_page=100`;

  return cached(`owner-repos:v1:${cleanOwner.toLowerCase()}`, REPOS_TTL_MS, async () => {
    return await gh<GhOrgRepoItem[]>(endpoint);
  });
}

/**
 * Ranks an organization's repositories according to the user's stack and general health signals.
 */
function rankOrgRepos(repos: GhOrgRepoItem[], profile: Profile): GhOrgRepoItem[] {
  const userLanguages = new Set(
    profile.stack.map((s) => s.tech.toLowerCase().replace(/[^a-z0-9+#]/g, "")),
  );

  return [...repos].sort((a, b) => {
    // 1. Language preference match
    const langA = (a.language ?? "").toLowerCase().replace(/[^a-z0-9+#]/g, "");
    const langB = (b.language ?? "").toLowerCase().replace(/[^a-z0-9+#]/g, "");
    const matchA = userLanguages.has(langA) ? 1 : 0;
    const matchB = userLanguages.has(langB) ? 1 : 0;
    if (matchA !== matchB) return matchB - matchA;

    // 2. Non-fork preference
    if (a.fork !== b.fork) return a.fork ? 1 : -1;

    // 3. Recency of pushes (recent pushes first)
    const pushA = new Date(a.pushed_at || 0).getTime();
    const pushB = new Date(b.pushed_at || 0).getTime();
    if (Math.abs(pushA - pushB) > 7 * 24 * 60 * 60 * 1000) {
      return pushB - pushA;
    }

    // 4. Stargazer popularity
    return b.stargazers_count - a.stargazers_count;
  });
}

/**
 * Performs bounded, verified discovery within an entire GitHub organization or user repo-base.
 */
export async function discoverOrgCandidates(
  owner: string,
  profile: Profile,
  options?: { repoLimit?: number; issueLimit?: number },
): Promise<OrgDiscoveryResult> {
  const repoBudget = options?.repoLimit ?? MAX_SCOUT_REPOS;
  const issueLimit = options?.issueLimit ?? 10;

  // 1. Resolve owner profile
  const ownerInfo = await getOwnerInfo(owner);

  // 2. Fetch accessible public repositories (up to 100 most active)
  let repos: GhOrgRepoItem[] = [];
  try {
    repos = await getOwnerRepos(ownerInfo.login, ownerInfo.type);
  } catch {
    repos = [];
  }

  // 3. Filter valid candidate repositories
  const activeCandidates = repos.filter(
    (r) => !r.archived && !r.disabled && r.has_issues && r.open_issues_count > 0,
  );

  // 4. Rank repositories within the organization
  const rankedRepos = rankOrgRepos(activeCandidates, profile);
  const selectedRepos = rankedRepos.slice(0, repoBudget);

  // 5. Fetch and score candidate issues for each selected repository
  const candidatePool: IssueCandidate[] = [];

  for (const repo of selectedRepos) {
    try {
      const [issues, signals, pullsResult] = await Promise.all([
        getRepoIssues(repo.full_name),
        getRepoSignals(repo.full_name),
        getRepoOpenPRs(repo.full_name).catch(() => null),
      ]);

      const candidates = issues
        .filter(isPromising)
        .slice(0, ISSUES_PER_REPO)
        .map((issue) =>
          toCandidate(
            issue,
            repo.full_name,
            signals,
            pullsResult ? linkedPRCount(pullsResult, issue.number) : null,
          ),
        )
        .filter((c) => c.state === "open" && fitsHardConstraints(c, profile));

      candidatePool.push(...candidates);
    } catch {
      // One repo failing shouldn't sink the entire org discovery
      continue;
    }
  }

  // 6. Gemma 4 Jev decision harness on the top candidates
  if (llmConfigured() && candidatePool.length > 0) {
    const preliminaryRanked = await rankCandidates(candidatePool, profile, Math.min(3, candidatePool.length));
    const decisions = await Promise.all(
      preliminaryRanked.map((c) => evaluateIssueWithJev(c, c.signals).catch(() => undefined)),
    );
    decisions.forEach((decision, idx) => {
      if (decision) preliminaryRanked[idx].jevDecision = decision;
    });

    const jevMap = new Map(
      preliminaryRanked.map((c) => [`${c.repo}#${c.number}`, c.jevDecision]),
    );
    for (const c of candidatePool) {
      const d = jevMap.get(`${c.repo}#${c.number}`);
      if (d) c.jevDecision = d;
    }
  }

  // 7. Final ranking
  const ranked = await rankCandidates(candidatePool, profile, issueLimit);

  return {
    owner: ownerInfo.login,
    ownerName: ownerInfo.name || ownerInfo.login,
    ownerType: ownerInfo.type,
    ownerUrl: ownerInfo.html_url,
    description: ownerInfo.description,
    totalPublicRepos: ownerInfo.public_repos,
    scannedRepos: repos.length,
    activeCandidateRepos: activeCandidates.length,
    selectedRepos: selectedRepos.map((r) => r.full_name),
    candidates: ranked,
  };
}

/**
 * Performs verified discovery scoped to a single specific repository (e.g. "pallets/flask").
 */
export async function discoverRepoCandidates(
  repoFullName: string,
  profile: Profile,
  issueLimit = 10,
): Promise<OrgDiscoveryResult> {
  const [ownerPart] = repoFullName.split("/");
  const [issues, signals, pullsResult] = await Promise.all([
    getRepoIssues(repoFullName),
    getRepoSignals(repoFullName),
    getRepoOpenPRs(repoFullName).catch(() => null),
  ]);

  const candidates = issues
    .filter(isPromising)
    .map((issue) =>
      toCandidate(
        issue,
        repoFullName,
        signals,
        pullsResult ? linkedPRCount(pullsResult, issue.number) : null,
      ),
    )
    .filter((c) => c.state === "open" && fitsHardConstraints(c, profile));

  if (llmConfigured() && candidates.length > 0) {
    const preliminary = await rankCandidates(candidates, profile, Math.min(3, candidates.length));
    const decisions = await Promise.all(
      preliminary.map((c) => evaluateIssueWithJev(c, c.signals).catch(() => undefined)),
    );
    decisions.forEach((decision, idx) => {
      if (decision) preliminary[idx].jevDecision = decision;
    });

    const jevMap = new Map(preliminary.map((c) => [`${c.repo}#${c.number}`, c.jevDecision]));
    for (const c of candidates) {
      const d = jevMap.get(`${c.repo}#${c.number}`);
      if (d) c.jevDecision = d;
    }
  }

  const ranked = await rankCandidates(candidates, profile, issueLimit);

  return {
    owner: ownerPart,
    ownerName: ownerPart,
    ownerType: "Organization",
    ownerUrl: `https://github.com/${ownerPart}`,
    description: signals.description || "",
    totalPublicRepos: 1,
    scannedRepos: 1,
    activeCandidateRepos: 1,
    selectedRepos: [repoFullName],
    candidates: ranked,
  };
}
