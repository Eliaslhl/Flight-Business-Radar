"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/searches", label: "Recherches" },
  { href: "/radar", label: "Radar" },
  { href: "/alerts", label: "Alertes" },
  { href: "/settings", label: "Réglages" },
];

export function NavBar() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-surface)]/85 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center gap-4 overflow-x-auto px-4 sm:gap-6">
        <Link
          href="/dashboard"
          className="flex shrink-0 items-center gap-2 py-3.5 font-semibold tracking-tight"
        >
          <span aria-hidden>✈️</span>
          <span className="hidden sm:inline">Flight Business Radar</span>
          <span className="sm:hidden">FBR</span>
        </Link>
        <div className="flex gap-1 text-sm">
          {LINKS.map((l) => {
            const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-[var(--radius)] px-3 py-1.5 whitespace-nowrap transition ${
                  active
                    ? "bg-[var(--color-accent-soft)] font-medium text-[var(--color-accent)]"
                    : "text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
