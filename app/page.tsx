import { KeyBanner } from "./components/KeyBanner";
import { ScopeForm } from "./components/ScopeForm";
import { SiteHeader } from "./components/SiteHeader";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="container narrow">
        <section className="hero">
          <p className="eyebrow">Hacktoberfest Hack Day</p>
          <h1>Find an issue you can actually land.</h1>
          <p className="lede">
            Most &ldquo;good first issue&rdquo; lists are static and stale. We check that the issue
            is still open, unassigned, and in a project that actually merges work from outsiders —
            then we write you a way in.
          </p>
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
