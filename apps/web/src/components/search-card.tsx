"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PriorityBadge, StatusBadge } from "./badges";
import { CABIN_LABEL } from "./create-search-form";
import { TrendPicto } from "./trend-picto";
import { Card } from "./ui";
import { api } from "@/lib/api";
import { flagEmoji } from "@/lib/flags";
import { formatEur, relativeTime } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import type { CabinClass, Search } from "@/lib/types";

/** Rafraîchissement d'affichage : la donnée derrière bouge moins souvent. */
const REFRESH_MS = 60_000;
const CABIN_ORDER: CabinClass[] = ["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS"];

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

  // Le moins cher PAR cabine (Éco / Éco+ / Affaires).
  const cheapestByCabin = CABIN_ORDER.map((cabin) => {
    const offers = (flights.data ?? []).filter((f) => f.cabinClass === cabin);
    if (offers.length === 0) return { cabin, flight: null };
    return {
      cabin,
      flight: offers.reduce((a, b) => (b.latestPriceCents < a.latestPriceCents ? b : a)),
    };
  });
  const best =
    cheapestByCabin.reduce<number | null>(
      (acc, c) =>
        c.flight && (acc === null || c.flight.latestPriceCents < acc)
          ? c.flight.latestPriceCents
          : acc,
      null,
    ) ?? null;
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

        <ul className="mt-3 space-y-1 text-xs">
          {cheapestByCabin.map(({ cabin, flight }) => (
            <li key={cabin} className="flex items-center justify-between gap-2">
              <span className="text-[var(--color-muted)]">{CABIN_LABEL[cabin]}</span>
              <span className="tnum font-medium">
                {flight ? formatEur(flight.latestPriceCents) : "—"}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-center justify-between text-xs text-[var(--color-muted)]">
          <PriorityBadge priority={search.priority} />
          <span>prochaine analyse {relativeTime(search.nextRunAt)}</span>
        </div>
      </Card>
    </Link>
  );
}
