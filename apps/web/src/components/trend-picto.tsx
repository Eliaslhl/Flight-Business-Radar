import type { Trend } from "@/lib/types";

/** Flèche d'évolution du prix : ↗ hausse (rouge), ↘ baisse (vert), → stable. */
export function TrendPicto({ direction }: { direction: Trend["direction"] | null }) {
  if (!direction) return null;
  const map = {
    RISING: { icon: "↗", cls: "text-[var(--color-danger)]", label: "en hausse" },
    FALLING: { icon: "↘", cls: "text-[var(--color-ok)]", label: "en baisse" },
    STABLE: { icon: "→", cls: "text-[var(--color-muted)]", label: "stable" },
  } as const;
  const m = map[direction];
  return (
    <span
      className={`text-base leading-none ${m.cls}`}
      title={`Prix ${m.label}`}
      aria-label={m.label}
    >
      {m.icon}
    </span>
  );
}
