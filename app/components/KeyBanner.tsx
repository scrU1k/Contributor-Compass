"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadSettings } from "../lib/settings";
import { SiteHeader } from "../components/SiteHeader";

/**
 * First-run prompt. Renders nothing on the server and nothing once keys exist,
 * so it never flashes for someone who has already configured the app.
 */
export function KeyBanner() {
  const [missing, setMissing] = useState<string[] | null>(null);

  useEffect(() => {
    const settings = loadSettings();
    const absent: string[] = [];
    if (!settings.llmApiKey.trim()) absent.push("a Gemma API key");
    if (!settings.githubToken.trim()) absent.push("a GitHub token");
    setMissing(absent);
  }, []);

  if (!missing || missing.length === 0) return null;

  return (
    <div className="callout">
      <div>
        <strong>Bring your own key</strong>
        <p className="hint">
          Add {missing.join(" and ")} to run live searches. Keys stay in this browser and are
          never stored on the server.
        </p>
      </div>
      <Link href="/settings" className="btn btn-primary btn-sm">
        Add keys
      </Link>
    </div>
  );
}
