"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PriorityBadge, StatusBadge } from "./badges";
import { CABIN_LABEL } from "./create-search-form";
import { TrendPicto } from "./trend-picto";
import { Badge, Card } from "./ui";
import { api } from "@/lib/api";
import { flagEmoji } from "@/lib/flags";
import { formatEur, relativeTime } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import type { Search } from "@/lib/types";

/** Rafraîchissement d'affichage : la donnée derrière bouge moins souvent. */
const REFRESH_MS = 60_000;

export function SearchCard({ search }: { search: Search }) {
  const flights = useQuery({
    queryKey: qk.flights(search.id),
    queryFn: () => api.flights(search.id),
    refetchInterval: REFRESH_MS,
  });
  const analytics = useQuery({
    queryKey: qk.analytics(search.id),
    queryFn: () => api.analytics(search.id),
    refetchInterval: REFRESH_MS,
  });
  const airports = useQuery({ queryKey: qk.airports, queryFn: api.airports });
  const flagOf = (iata: string): string =>
    flagEmoji(airports.data?.find((a) => a.iata === iata)?.countryCode);
  const route = [search.origin, ...search.destinations];

  const top3 = [...(flights.data ?? [])]
    .sort((a, b) => a.latestPriceCents - b.latestPriceCents)
    .slice(0, 3);
  const best = top3[0]?.latestPriceCents ?? null;
  const target = search.targetPriceCents;
  const belowTarget = best !== null && target !== null && best <= target;

  return (
    <Link href={`/searches/${search.id}`} className="block">
      <Card interactive className="h-full">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-semibold">
              {search.label ?? `${search.origin} → ${search.destinations.join(", ") || "Radar"}`}
            </div>
            <div className="flex flex-wrap items-center gap-x-1.5 text-sm text-[var(--color-muted)]">
              {search.destinations.length === 0 ? (
                <span>
                  {flagOf(search.origin)} {search.origin} → toutes destinations
                </span>
              ) : (
                route.map((iata, i) => (
                  <span key={iata}>
                    {i > 0 ? "→ " : ""}
                    {flagOf(iata)} {iata}
                  </span>
                ))
              )}
              <span>· toutes cabines</span>
            </div>
          </div>
          <StatusBadge status={search.status} />
        </div>

        <div className="mt-4 flex items-end justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-2xl font-semibold">
              {formatEur(best)}
              <TrendPicto direction={analytics.data?.trend?.direction ?? null} />
            </div>
            <div className="text-xs text-[var(--color-muted)]">
              meilleur prix actuel{target !== null ? ` · cible ${formatEur(target)}` : ""}
            </div>
          </div>
          {belowTarget ? (
            <span className="text-sm font-medium text-[var(--color-ok)]">🔥 sous la cible</span>
          ) : null}
        </div>

        {top3.length > 1 ? (
          <ul className="mt-3 space-y-1 text-xs">
            {top3.map((f) => (
              <li key={f.fingerprint} className="flex items-center justify-between gap-2">
                <span className="tnum font-medium">{formatEur(f.latestPriceCents)}</span>
                <Badge tone="neutral">{CABIN_LABEL[f.cabinClass]}</Badge>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-4 flex items-center justify-between text-xs text-[var(--color-muted)]">
          <PriorityBadge priority={search.priority} />
          <span>prochaine analyse {relativeTime(search.nextRunAt)}</span>
        </div>
      </Card>
    </Link>
  );
}
