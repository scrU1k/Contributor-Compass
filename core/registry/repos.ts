/**
 * The curated registry: a prior, not a truth.
 *
 * Stage 1 of discovery needs somewhere to start that isn't a keyword search.
 * This list encodes what a good scout already knows — active projects with real
 * review cultures — and the Repo Scout narrows it for a specific person.
 *
 * Crucially, nothing here is trusted. Stars, liveness and "beginner friendly"
 * are all re-established live in signals.ts. This file only decides *where to
 * look*, never *what is true*.
 */

export interface RegistryRepo {
  fullName: string;
  language: string;
  /** Lowercase matching keywords. Deliberately broad. */
  topics: string[];
  /** One line the scout can reason over. */
  note: string;
}

const repo = (
  fullName: string,
  language: string,
  topics: string[],
  note: string,
): RegistryRepo => ({ fullName, language, topics, note });

export const REGISTRY: RegistryRepo[] = [
  // Python
  repo("pallets/flask", "Python", ["web", "backend", "api"], "Small web framework with a long history of first-time contributors."),
  repo("django/django", "Python", ["web", "backend"], "Batteries-included web framework; large but well-documented contribution process."),
  repo("psf/requests", "Python", ["http", "api", "library"], "The canonical Python HTTP library."),
  repo("pandas-dev/pandas", "Python", ["data", "ml", "science", "docs"], "Data analysis library; docs and tests are approachable."),
  repo("numpy/numpy", "Python", ["data", "science"], "Core numerical library."),
  repo("scikit-learn/scikit-learn", "Python", ["ml", "data", "science", "docs"], "Classic ML library with a strong docs culture."),
  repo("matplotlib/matplotlib", "Python", ["data", "visualization", "docs"], "Plotting library; good documentation tasks."),
  repo("fastapi/fastapi", "Python", ["web", "api", "backend"], "Modern async web framework."),
  repo("pydantic/pydantic", "Python", ["data", "validation", "library"], "Data validation library."),
  repo("pytest-dev/pytest", "Python", ["testing", "devtools"], "The Python test framework."),
  repo("python-poetry/poetry", "Python", ["devtools", "packaging", "cli"], "Dependency management and packaging."),
  repo("sphinx-doc/sphinx", "Python", ["docs", "devtools"], "Documentation generator."),
  repo("home-assistant/core", "Python", ["iot", "automation"], "Home automation; many small integration tasks."),
  repo("tiangolo/typer", "Python", ["cli", "devtools"], "CLI framework built on Click."),

  // JavaScript / TypeScript / web
  repo("nodejs/node", "JavaScript", ["runtime", "backend"], "The Node.js runtime."),
  repo("vercel/next.js", "TypeScript", ["web", "frontend", "react"], "React framework."),
  repo("facebook/react", "JavaScript", ["frontend", "ui"], "The React UI library."),
  repo("sveltejs/svelte", "JavaScript", ["frontend", "ui"], "Compiler-first UI framework."),
  repo("vitejs/vite", "TypeScript", ["devtools", "build", "frontend"], "Frontend build tool."),
  repo("withastro/astro", "TypeScript", ["web", "frontend"], "Content-focused web framework."),
  repo("tailwindlabs/tailwindcss", "TypeScript", ["css", "design", "frontend"], "Utility-first CSS framework."),
  repo("nuxt/nuxt", "TypeScript", ["web", "frontend", "vue"], "Vue framework."),
  repo("jestjs/jest", "TypeScript", ["testing", "devtools"], "JavaScript testing framework."),
  repo("eslint/eslint", "JavaScript", ["devtools", "linting"], "Linter."),
  repo("prettier/prettier", "JavaScript", ["devtools", "formatting"], "Code formatter."),
  repo("storybookjs/storybook", "TypeScript", ["frontend", "design", "devtools"], "UI component workshop."),

  // Documentation and education
  repo("mdn/content", "Markdown", ["docs", "education", "web"], "MDN documentation content; docs-only contributions."),
  repo("freeCodeCamp/freeCodeCamp", "TypeScript", ["education", "web"], "Learn-to-code platform; docs and curriculum tasks."),
  repo("TheOdinProject/curriculum", "Markdown", ["education", "docs"], "Open curriculum for web development."),
  repo("github/docs", "Markdown", ["docs", "education"], "GitHub's own documentation."),
  repo("rust-lang/book", "Markdown", ["docs", "education", "rust"], "The Rust Book; docs contributions."),

  // Go
  repo("golang/go", "Go", ["language", "compiler"], "The Go programming language."),
  repo("gin-gonic/gin", "Go", ["web", "api", "backend"], "HTTP web framework."),
  repo("spf13/cobra", "Go", ["cli", "devtools"], "CLI library."),
  repo("cli/cli", "Go", ["cli", "devtools"], "GitHub's official CLI."),
  repo("caddyserver/caddy", "Go", ["web", "server", "devops"], "Web server with automatic HTTPS."),
  repo("junegunn/fzf", "Go", ["cli", "devtools"], "Fuzzy finder."),
  repo("grafana/grafana", "TypeScript", ["devops", "visualization", "observability"], "Observability dashboards."),
  repo("prometheus/prometheus", "Go", ["devops", "observability"], "Metrics and monitoring."),
  repo("hashicorp/terraform", "Go", ["devops", "infrastructure"], "Infrastructure as code."),

  // Rust
  repo("rust-lang/rust", "Rust", ["language", "compiler"], "The Rust programming language."),
  repo("tokio-rs/tokio", "Rust", ["async", "runtime"], "Async runtime."),
  repo("clap-rs/clap", "Rust", ["cli", "devtools"], "CLI argument parser."),
  repo("BurntSushi/ripgrep", "Rust", ["cli", "devtools", "search"], "Fast recursive search."),
  repo("sharkdp/bat", "Rust", ["cli", "devtools"], "Cat clone with syntax highlighting."),
  repo("nushell/nushell", "Rust", ["cli", "shell"], "A modern shell."),
  repo("starship/starship", "Rust", ["cli", "devtools"], "Cross-shell prompt."),

  // Java / JVM
  repo("spring-projects/spring-boot", "Java", ["backend", "web"], "Spring Boot."),
  repo("apache/kafka", "Java", ["backend", "streaming"], "Event streaming platform."),
  repo("google/guava", "Java", ["library", "utility"], "Core Java libraries."),
  repo("JetBrains/kotlin", "Kotlin", ["language", "compiler"], "The Kotlin language."),

  // C / C++
  repo("curl/curl", "C", ["http", "cli", "networking"], "The curl tool and library."),
  repo("redis/redis", "C", ["database", "backend"], "In-memory data store."),
  repo("nlohmann/json", "C++", ["library", "json"], "JSON for modern C++."),
  repo("fmtlib/fmt", "C++", ["library", "formatting"], "Formatting library."),

  // Ruby
  repo("rails/rails", "Ruby", ["web", "backend"], "Ruby on Rails."),
  repo("jekyll/jekyll", "Ruby", ["static-site", "docs"], "Static site generator."),
  repo("homebrew/brew", "Ruby", ["packaging", "cli", "devtools"], "The macOS package manager."),
  repo("rubocop/rubocop", "Ruby", ["devtools", "linting"], "Ruby linter and formatter."),

  // PHP
  repo("laravel/framework", "PHP", ["web", "backend"], "PHP web framework."),
  repo("composer/composer", "PHP", ["packaging", "devtools"], "PHP dependency manager."),
  repo("WordPress/WordPress", "PHP", ["cms", "web"], "The WordPress CMS."),

  // .NET / Swift
  repo("dotnet/runtime", ".NET", ["runtime", "backend"], "The .NET runtime."),
  repo("PowerShell/PowerShell", "C#", ["cli", "shell", "devtools"], "Cross-platform PowerShell."),
  repo("apple/swift", "Swift", ["language", "compiler"], "The Swift language."),
];

export function findRepo(fullName: string): RegistryRepo | undefined {
  const target = fullName.toLowerCase();
  return REGISTRY.find((r) => r.fullName.toLowerCase() === target);
}
