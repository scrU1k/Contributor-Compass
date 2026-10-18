import { gh, ghMaybe } from "./client";
import { cached } from "@/core/cache/cache";
import type { Evidence, RepoSignals } from "@/core/types";

/**
 * "Verify" lives here.
 *
 * Everything the Readiness Score claims about a repo is established in this
 * file, from data we actually fetched. No claims, no vibes.
 */

const TTL_MS = 6 * 60 * 60 * 1000;
const OUTSIDER_ASSOCIATIONS = new Set(["MEMBER", "OWNER", "COLLABORATOR"]);

interface GhRepo {
  full_name: string;
  description: string | null;
  language: string | null;
  topics?: string[];
  stargazers_count: number;
  created_at: string;
  pushed_at: string;
  open_issues_count: number;
  default_branch: string;
  size: number;
  license: { spdx_id?: string | null; name?: string | null } | null;
}

interface GhTree {
  tree?: { path?: string; type?: string }[];
  truncated?: boolean;
}

interface GhPull {
  merged_at: string | null;
  author_association?: string;
  created_at: string;
  user?: { login?: string; type?: string } | null;
}

const LANGUAGE_WEIGHT: Record<string, number> = {
  JavaScript: 0.3,
  TypeScript: 0.35,
  Python: 0.3,
  Go: 0.3,
  Ruby: 0.3,
  PHP: 0.35,
  Rust: 0.55,
  Java: 0.45,
  "C#": 0.45,
  Kotlin: 0.5,
  Swift: 0.5,
  C: 0.65,
  "C++": 0.7,
  Scala: 0.6,
  Elixir: 0.5,
  Haskell: 0.7,
  Dart: 0.45,
};
const DEFAULT_LANGUAGE_WEIGHT = 0.4;

const INSTALL_MANIFESTS = new Set([
  "package.json",
  "requirements.txt",
  "pyproject.toml",
  "setup.py",
  "Cargo.toml",
  "go.mod",
  "Gemfile",
  "composer.json",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "Makefile",
  "CMakeLists.txt",
  "pubspec.yaml",
  "mix.exs",
]);

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

async function getRepoMeta(owner: string, name: string): Promise<GhRepo> {
  return cached(`repo:v1:${owner}/${name}`, TTL_MS, () => gh<GhRepo>(`/repos/${owner}/${name}`));
}

async function fetchTreePaths(owner: string, name: string, branch: string): Promise<string[]> {
  const tree = await ghMaybe<GhTree>(
    `/repos/${owner}/${name}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
  );
  if (!tree?.tree) return [];
  return tree.tree
    .filter((n) => n.type === "blob" && n.path)
    .map((n) => n.path as string);
}

/** Cached file listing — also used by verify/guide to check claimed paths. */
export async function getRepoTreePaths(fullName: string): Promise<string[]> {
  const [owner, name] = fullName.split("/");
  return cached(`tree:v1:${fullName}`, TTL_MS, async () => {
    const repo = await getRepoMeta(owner, name);
    return fetchTreePaths(owner, name, repo.default_branch);
  });
}

function isBotUser(user?: { login?: string; type?: string } | null): boolean {
  if (!user) return false;
  if (user.type === "Bot") return true;
  const login = (user.login ?? "").toLowerCase();
  return login.endsWith("[bot]") || /^(?:dependabot|renovate|snyk|greenkeeper|allcontributors)/i.test(login);
}

async function countOutsiderMerges(
  owner: string,
  name: string,
): Promise<{ count: number; sampled: boolean; known: boolean; medianResponseHours: number | null }> {
  const pulls = await ghMaybe<GhPull[]>(
    `/repos/${owner}/${name}/pulls?state=closed&sort=updated&direction=desc&per_page=100`,
  );
  if (!pulls) return { count: 0, sampled: false, known: false, medianResponseHours: null };
  const cutoff = Date.now() - 90 * 86_400_000;
  const durationsHours: number[] = [];

  const count = pulls.filter((p) => {
    if (!p.merged_at) return false;
    const mergedTime = new Date(p.merged_at).getTime();
    if (mergedTime < cutoff) return false;
    if (isBotUser(p.user)) return false;
    if (OUTSIDER_ASSOCIATIONS.has(p.author_association ?? "")) return false;

    const createdTime = new Date(p.created_at).getTime();
    if (!isNaN(createdTime) && !isNaN(mergedTime) && mergedTime >= createdTime) {
      durationsHours.push((mergedTime - createdTime) / 3_600_000);
    }
    return true;
  }).length;

  let medianResponseHours: number | null = null;
  if (durationsHours.length > 0) {
    durationsHours.sort((a, b) => a - b);
    const mid = Math.floor(durationsHours.length / 2);
    medianResponseHours =
      durationsHours.length % 2 === 0
        ? Math.round(((durationsHours[mid - 1] + durationsHours[mid]) / 2) * 10) / 10
        : Math.round(durationsHours[mid] * 10) / 10;
  }

  return { count, sampled: pulls.length >= 100, known: true, medianResponseHours };
}

export async function getRepoSignals(fullName: string): Promise<RepoSignals> {
  return cached(`signals:v2:${fullName}`, TTL_MS, () => fetchSignals(fullName));
}

async function fetchSignals(fullName: string): Promise<RepoSignals> {
  const [owner, name] = fullName.split("/");
  const [repo, paths, outsiderMerges] = await Promise.all([
    getRepoMeta(owner, name),
    getRepoTreePaths(fullName),
    countOutsiderMerges(owner, name),
  ]);
  const outsiders = outsiderMerges.count;

  const lower = paths.map((p) => p.toLowerCase());

  const hasReadme = paths.some((p) => /(^|\/)readme(\.|$)/i.test(p));
  const hasInstallManifest = paths.some((p) =>
    INSTALL_MANIFESTS.has(p.split("/").pop() ?? ""),
  );
  const hasContributing = paths.some((p) => /contributing/i.test(p));
  const hasCI = lower.some(
    (p) =>
      p.startsWith(".github/workflows/") ||
      p.startsWith(".circleci/") ||
      p === ".gitlab-ci.yml" ||
      p.startsWith("azure-pipelines") ||
      p === ".travis.yml",
  );
  const hasTests = lower.some(
    (p) =>
      p.startsWith("tests/") ||
      p.startsWith("test/") ||
      p.startsWith("spec/") ||
      p.includes("__tests__/"),
  );
  const hasDevcontainer = lower.some((p) => p.startsWith(".devcontainer"));
  const hasCodeOfConduct = paths.some((p) => /code[-_ ]?of[-_ ]?conduct/i.test(p));

  // Dedicated newcomer / getting-started contributor guide
  const hasNewContributorGuide = paths.some(
    (p) =>
      /new[-_ ]?contributor/i.test(p) ||
      /first[-_ ]?contribution/i.test(p) ||
      /getting[-_ ]?started/i.test(p) ||
      /onboarding/i.test(p) ||
      /good[-_ ]?first/i.test(p) ||
      /quickstart/i.test(p) ||
      /developers?[-_ ]?guide/i.test(p),
  );

  const license =
    repo.license?.spdx_id && repo.license.spdx_id !== "NOASSERTION"
      ? repo.license.spdx_id
      : repo.license?.name ?? null;

  const languageWeight = repo.language
    ? LANGUAGE_WEIGHT[repo.language] ?? DEFAULT_LANGUAGE_WEIGHT
    : DEFAULT_LANGUAGE_WEIGHT;
  const sizeFactor = Math.min((repo.size ?? 0) / 500_000, 0.3);
  const dependencyWeight = clamp01(languageWeight + sizeFactor);

  const readmeSetup = hasReadme && hasInstallManifest;

  const evidence: Evidence[] = [
    {
      id: "readme",
      label: "README and install manifest",
      value: readmeSetup ? "yes" : hasReadme ? "README only" : "no",
      weight: 0.25,
      source: `https://github.com/${fullName}`,
    },
    {
      id: "contributing",
      label: "CONTRIBUTING guide",
      value: hasContributing ? "yes" : "no",
      weight: 0.2,
      source: `https://github.com/${fullName}`,
    },
    {
      id: "ci",
      label: "CI pipeline",
      value: hasCI ? "yes" : "no",
      weight: 0.15,
      source: `https://github.com/${fullName}/actions`,
    },
    {
      id: "tests",
      label: "Test suite",
      value: hasTests ? "yes" : "no",
      weight: 0.15,
      source: `https://github.com/${fullName}`,
    },
    {
      id: "license",
      label: "License",
      value: license ?? "none",
      weight: 0.1,
      source: `https://github.com/${fullName}`,
    },
    {
      id: "new-contributor-guide",
      label: "New contributor guide",
      value: hasNewContributorGuide ? "yes" : "no",
      weight: 0,
      source: `https://github.com/${fullName}`,
    },
    {
      id: "outsider-merges",
      label: "Merges from outside contributors (90d)",
      value: outsiderMerges.known ? `${outsiderMerges.sampled ? "at least " : ""}${outsiders}` : "unknown",
      weight: 0.2,
      source: `https://github.com/${fullName}/pulls?q=is%3Apr+is%3Amerged`,
    },
  ];

  return {
    fullName: repo.full_name ?? fullName,
    description: repo.description,
    language: repo.language,
    topics: repo.topics ?? [],
    stars: repo.stargazers_count ?? 0,
    createdAt: repo.created_at,
    pushedAt: repo.pushed_at,
    openIssues: repo.open_issues_count ?? 0,
    sizeKb: repo.size ?? 0,
    license,
    hasReadmeSetup: readmeSetup,
    hasContributing,
    hasNewContributorGuide,
    hasCI,
    hasTests,
    hasDevcontainer,
    hasCodeOfConduct,
    dependencyWeight,
    mergedPRsFromOutsiders90d: outsiders,
    outsiderMergeSampled: outsiderMerges.sampled,
    outsiderMergeStatusKnown: outsiderMerges.known,
    medianMaintainerResponseHours: outsiderMerges.medianResponseHours,
    evidence,
  };
}
