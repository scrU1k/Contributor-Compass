import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden>
            ◇
          </span>
          Compass
        </Link>
        <nav className="nav" aria-label="Main">
          <Link href="/">Find issues</Link>
          <Link href="/verify">Verify a link</Link>
          <Link href="/settings">Keys</Link>
        </nav>
      </div>
    </header>
  );
}
