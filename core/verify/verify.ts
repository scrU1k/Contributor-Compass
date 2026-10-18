import { getRepoTreePaths } from "@/core/github/signals";

/**
 * The rule that keeps the demo honest: if we claim a file exists, we check.
 * A visible hallucination costs more than a missing bullet point.
 */

export interface ClaimedPath {
  path: string;
  why: string;
}

export interface VerifyResult {
  kept: ClaimedPath[];
  dropped: string[];
}

export async function filterExistingPaths(
  repo: string,
  claimed: ClaimedPath[],
): Promise<VerifyResult> {
  if (claimed.length === 0) return { kept: [], dropped: [] };

  const tree = (await getRepoTreePaths(repo)).map((p) => p.toLowerCase());
  const treeSet = new Set(tree);

  const kept: ClaimedPath[] = [];
  const dropped: string[] = [];

  for (const claim of claimed) {
    const needle = claim.path.replace(/^\.?\//, "").replace(/\/+$/, "").toLowerCase();
    if (!needle) {
      dropped.push(claim.path);
      continue;
    }
    const exists =
      treeSet.has(needle) || tree.some((p) => p.startsWith(`${needle}/`) || p === needle);
    if (exists) kept.push(claim);
    else dropped.push(claim.path);
  }

  return { kept, dropped };
}
