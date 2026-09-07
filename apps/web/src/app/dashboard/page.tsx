"use client";

import Link from "next/link";
import { useQueries, useQuery } from "@tanstack/react-query";
import { EventBadge } from "@/components/badges";
import { ConfirmedDropsChart } from "@/components/confirmed-drops-chart";
import { SearchCard } from "@/components/search-card";
import {
  Button,
  Card,
  CardTitle,
  EmptyState,
  ErrorState,
  PageHeader,
  Spinner,
} from "@/components/ui";
import { api } from "@/lib/api";
import { formatEur, relativeTime } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import type { PriceEvent } from "@/lib/types";

export default function DashboardPage() {
  const searches = useQuery({
    queryKey: qk.searches,
    queryFn: api.listSearches,
    refetchInterval: 60_000,
  });
  const rows = searches.data ?? [];

  const eventQueries = useQueries({
    queries: rows.map((s) => ({
      queryKey: qk.events(s.id),
      queryFn: () => api.events(s.id),
      enabled: rows.length > 0,
    })),
  });

  const allEvents: (PriceEvent & { searchId: string })[] = eventQueries.flatMap((q, i) =>
    (q.data ?? []).map((e) => ({ ...e, searchId: rows[i]!.id })),
  );
  const recent = allEvents
    .filter((e) => e.type !== "RISE" && e.type !== "RECORD_HIGH")
    .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))
    .slice(0, 8);

  const activeCount = rows.filter((s) => s.status === "ACTIVE").length;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        subtitle={`${rows.length} recherche${rows.length > 1 ? "s" : ""} · ${activeCount} active${
          activeCount > 1 ? "s" : ""
        }`}
        actions={
          <Link href="/searches">
            <Button variant="primary">+ Nouvelle recherche</Button>
          </Link>
        }
      />

      {searches.isLoading ? (
        <Spinner />
      ) : searches.isError ? (
        <ErrorState error={searches.error} />
      ) : rows.length === 0 ? (
        <EmptyState>
          Aucune recherche.{" "}
          <Link href="/searches" className="underline">
            Crée-en une
          </Link>
          .
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((s) => (
            <SearchCard key={s.id} search={s} />
          ))}
        </div>
      )}

      <Card>
        <CardTitle>Dernières baisses détectées</CardTitle>
        {recent.length === 0 ? (
          <EmptyState>Aucun événement de baisse pour l'instant.</EmptyState>
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {recent.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="flex items-center gap-3">
                  <EventBadge type={e.type} />
                  <Link href={`/searches/${e.searchId}`} className="font-medium hover:underline">
                    {formatEur(e.newPriceEurCents)}
                  </Link>
                  {e.previousPriceEurCents !== null ? (
                    <span className="text-[var(--color-muted)] line-through">
                      {formatEur(e.previousPriceEurCents)}
                    </span>
                  ) : null}
                  {e.confirmed ? (
                    <span className="text-xs text-[var(--color-ok)]">confirmé</span>
                  ) : null}
                </div>
                <span className="text-[var(--color-muted)]">{relativeTime(e.detectedAt)}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 border-t border-[var(--color-border)] pt-4">
          <div className="mb-2 text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
            Activité · 30 derniers jours
          </div>
          <ConfirmedDropsChart events={allEvents} />
        </div>
      </Card>
    </div>
  );
}
