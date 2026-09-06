"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/searches", label: "Recherches" },
  { href: "/alerts", label: "Alertes" },
  { href: "/settings", label: "Réglages" },
];

export function NavBar() {
  const pathname = usePathname();
  return (
    <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4">
        <Link href="/dashboard" className="flex items-center gap-2 py-4 font-semibold">
          <span aria-hidden>✈️</span> Flight Business Radar
        </Link>
        <div className="flex gap-1 text-sm">
          {LINKS.map((l) => {
            const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-3 py-1.5 transition ${
                  active
                    ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                    : "text-[var(--color-muted)] hover:bg-[var(--color-bg)]"
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
