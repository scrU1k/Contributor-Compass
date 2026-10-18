import Link from "next/link";
import { HeroSavedButton } from "./components/HeroSavedButton";
import { KeyBanner } from "./components/KeyBanner";
import { ScopeForm } from "./components/ScopeForm";
import { SiteHeader } from "./components/SiteHeader";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="container narrow">
        <section className="hero">
          <p className="eyebrow">Open Source For All</p>
          <h1>Find an issue you can actually land.</h1>
          <p className="lede">
            Most &ldquo;good first issue&rdquo; lists are static and stale. We check that the issue
            is still open, unassigned, and in a project that actually merges work from outsiders —
            then we write you a way in.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginTop: "1rem" }}>
            <Link
              href="/verify"
              className="btn btn-ghost"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                height: "36px",
                boxSizing: "border-box",
                lineHeight: 1,
                fontSize: "0.84rem",
                padding: "6px 14px",
                borderRadius: "8px",
                border: "1px solid var(--accent)",
                color: "var(--accent)",
                background: "rgba(59, 130, 246, 0.08)",
                fontWeight: 600,
                textDecoration: "none",
                margin: 0,
              }}
              title="Verify issues directly from any GitHub issue, repo, or organization link"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              <span>Find by Link ➔</span>
            </Link>
            <HeroSavedButton />
          </div>
        </section>

        <KeyBanner />
        <ScopeForm />

        <footer className="footer">
          Structural checks are deterministic. Semantic checks and the guide are written by Gemma.
        </footer>
      </main>
    </>
  );
}
