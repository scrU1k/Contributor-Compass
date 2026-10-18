"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function SiteHeader() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [historyCount, setHistoryCount] = useState<number>(0);
  const [savedCount, setSavedCount] = useState<number>(0);

  useEffect(() => {
    // Read theme preference
    const saved = localStorage.getItem("compass.theme") as "dark" | "light" | null;
    if (saved === "light" || saved === "dark") {
      setTheme(saved);
      document.documentElement.setAttribute("data-theme", saved);
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
      setTheme("light");
      document.documentElement.setAttribute("data-theme", "light");
    }

    // Read contribution history count & saved count
    const updateCounts = () => {
      try {
        const rawHist = localStorage.getItem("compass.history");
        if (rawHist) {
          const hist = JSON.parse(rawHist);
          if (Array.isArray(hist)) setHistoryCount(hist.length);
        }

        const rawSaved = localStorage.getItem("compass.saved_issues");
        if (rawSaved) {
          const savedList = JSON.parse(rawSaved);
          if (Array.isArray(savedList)) setSavedCount(savedList.length);
        }
      } catch {
        // ignore
      }
    };

    updateCounts();
    window.addEventListener("storage", updateCounts);
    return () => window.removeEventListener("storage", updateCounts);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("compass.theme", next);
    document.documentElement.setAttribute("data-theme", next);
  }

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link href="/" className="brand" style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
          <svg
            height="22"
            viewBox="0 0 16 16"
            width="22"
            fill="#3b82f6"
            aria-hidden="true"
            style={{ display: "inline-block", verticalAlign: "middle" }}
          >
            <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
          </svg>
          <span style={{ fontWeight: 650, letterSpacing: "-0.01em" }}>Contribute Compass</span>
        </Link>

        <nav className="nav" aria-label="Main" style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          {/* Pure SVG Icon for Light / Dark Mode Toggle placed just before Find issues */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            style={{
              background: "transparent",
              border: "1px solid var(--line)",
              borderRadius: "6px",
              padding: "6px 8px",
              cursor: "pointer",
              color: "var(--fg)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
            }}
          >
            {theme === "dark" ? (
              // Crisp Sun SVG Icon for Dark Mode (click to switch to light)
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              // Crisp Moon SVG Icon for Light Mode (click to switch to dark)
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>

          <Link href="/">Find issues</Link>
          <Link href="/verify">Verify a link</Link>
          <Link href="/settings">Keys</Link>

          {savedCount > 0 && (
            <Link
              href="/results?tab=saved"
              className="badge neutral"
              title="View bookmarked issues"
              style={{ fontSize: "0.74rem", padding: "0.2rem 0.55rem", textDecoration: "none" }}
            >
              ★ {savedCount} Saved
            </Link>
          )}

          {historyCount > 0 && (
            <span
              className="badge ok"
              title="Issues you marked as solved, PR opened, or merged"
              style={{ fontSize: "0.74rem", padding: "0.2rem 0.55rem" }}
            >
              ✓ {historyCount} Tracked
            </span>
          )}
        </nav>
      </div>
    </header>
  );
}
