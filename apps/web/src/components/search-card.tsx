"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PriorityBadge, StatusBadge } from "./badges";
import { Card } from "./ui";
import { api } from "@/lib/api";
import { formatEur, relativeTime } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import type { Search } from "@/lib/types";

export function SearchCard({ search }: { search: Search }) {
  const flights = useQuery({
    queryKey: qk.flights(search.id),
    queryFn: () => api.flights(search.id),
  });

  const best =
    flights.data?.reduce<number | null>(
      (acc, f) => (acc === null || f.latestPriceCents < acc ? f.latestPriceCents : acc),
      null,
    ) ?? null;
  const target = search.targetPriceCents;
  const belowTarget = best !== null && target !== null && best <= target;

  return (
    <Link href={`/searches/${search.id}`} className="block">
      <Card className="h-full transition hover:border-[var(--color-accent)]">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-semibold">
              {search.label ?? `${search.origin} → ${search.destinations.join(", ") || "Radar"}`}
            </div>
            <div className="text-sm text-[var(--color-muted)]">
              {search.origin} → {search.destinations.join(", ") || "toutes destinations"} ·{" "}
              {search.cabinClass}
            </div>
          </div>
          <StatusBadge status={search.status} />
        </div>

        <div className="mt-4 flex items-end justify-between">
          <div>
            <div className="text-2xl font-semibold">{formatEur(best)}</div>
            <div className="text-xs text-[var(--color-muted)]">
              meilleur prix actuel{target !== null ? ` · cible ${formatEur(target)}` : ""}
            </div>
          </div>
          {belowTarget ? (
            <span className="text-sm font-medium text-[var(--color-ok)]">🔥 sous la cible</span>
          ) : null}
        </div>

        <div className="mt-4 flex items-center justify-between text-xs text-[var(--color-muted)]">
          <PriorityBadge priority={search.priority} />
          <span>prochaine analyse {relativeTime(search.nextRunAt)}</span>
        </div>
      </Card>
    </Link>
  );
}
