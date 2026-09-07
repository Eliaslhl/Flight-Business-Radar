"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EventBadge, PriorityBadge, StatusBadge } from "@/components/badges";
import { AlertsPanel } from "@/components/alerts-panel";
import { MonthlyChart } from "@/components/monthly-chart";
import { PriceChart } from "@/components/price-chart";
import { Badge, Button, Card, CardTitle, EmptyState, ErrorState, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import {
  formatDate,
  formatDateTime,
  formatEur,
  formatMonthKey,
  formatPct,
  relativeTime,
} from "@/lib/format";
import { qk } from "@/lib/query-keys";
import type { OpportunityBand, RecommendationReport } from "@/lib/types";

export default function SearchDetailPage() {
  const id = String(useParams().id);
  const qc = useQueryClient();

  const search = useQuery({ queryKey: qk.search(id), queryFn: () => api.getSearch(id) });
  const flights = useQuery({ queryKey: qk.flights(id), queryFn: () => api.flights(id) });
  const prices = useQuery({ queryKey: qk.prices(id), queryFn: () => api.prices(id) });
  const analytics = useQuery({ queryKey: qk.analytics(id), queryFn: () => api.analytics(id) });
  const recommendations = useQuery({
    queryKey: qk.recommendations(id),
    queryFn: () => api.recommendations(id),
  });
  const events = useQuery({ queryKey: qk.events(id), queryFn: () => api.events(id) });
  const notifications = useQuery({
    queryKey: qk.notifications(id),
    queryFn: () => api.notifications(id),
  });

  const run = useMutation({
    mutationFn: () => api.runSearch(id),
    onSuccess: () => {
      for (const key of [
        qk.search(id),
        qk.flights(id),
        qk.prices(id),
        qk.analytics(id),
        qk.recommendations(id),
        qk.events(id),
        qk.notifications(id),
      ]) {
        void qc.invalidateQueries({ queryKey: key });
      }
    },
  });

  if (search.isLoading) return <Spinner />;
  if (search.isError) return <ErrorState error={search.error} />;
  const s = search.data!;
  const a = analytics.data;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/searches" className="text-sm text-[var(--color-muted)] hover:underline">
          ← Recherches
        </Link>
        <div className="mt-1 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">
              {s.label ?? `${s.origin} → ${s.destinations.join(", ") || "Radar"}`}
            </h1>
            <p className="text-sm text-[var(--color-muted)]">
              {s.origin} → {s.destinations.join(", ") || "toutes destinations"} · {s.cabinClass} ·{" "}
              {formatDate(s.departureWindow.start, true)}–{formatDate(s.departureWindow.end, true)}{" "}
              · {s.tripDuration.minDays}–{s.tripDuration.maxDays} j · ≤ {s.maxStops} escale(s)
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={s.status} />
              <PriorityBadge priority={s.priority} />
              {s.targetPriceCents !== null ? (
                <Badge tone="accent">cible {formatEur(s.targetPriceCents)}</Badge>
              ) : null}
              <span className="text-xs text-[var(--color-muted)]">
                analyse toutes les {Math.round(s.intervalSeconds / 60)} min · prochaine{" "}
                {relativeTime(s.nextRunAt)}
              </span>
            </div>
          </div>
          <Button variant="primary" onClick={() => run.mutate()} disabled={run.isPending}>
            {run.isPending ? "…" : "Analyser maintenant"}
          </Button>
        </div>
      </div>

      {/* Analytics résumé */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Prix actuel" value={formatEur(a?.latest?.priceEurCents ?? null)} />
        <Stat label="Meilleur observé" value={formatEur(a?.best?.priceEurCents ?? null)} />
        <Stat
          label="Moyenne"
          value={formatEur(a?.summary ? Math.round(a.summary.mean) : null)}
          hint={a && !a.reliable ? "données insuffisantes" : undefined}
        />
        <Stat
          label="Tendance"
          value={
            a?.trend
              ? a.trend.direction === "FALLING"
                ? `📉 ${formatPct(a.trend.changePct)}`
                : a.trend.direction === "RISING"
                  ? `📈 ${formatPct(a.trend.changePct)}`
                  : "≈ stable"
              : "—"
          }
        />
      </div>

      <Card>
        <CardTitle>Recommandations</CardTitle>
        {recommendations.isLoading ? (
          <Spinner />
        ) : recommendations.isError ? (
          <ErrorState error={recommendations.error} />
        ) : (
          <RecommendationsBody data={recommendations.data} />
        )}
      </Card>

      <Card>
        <CardTitle>Prix dans le temps</CardTitle>
        {prices.isLoading ? <Spinner /> : <PriceChart prices={prices.data ?? []} />}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>Prix moyen par mois de départ</CardTitle>
          {analytics.isLoading ? <Spinner /> : <MonthlyChart byMonth={a?.byMonth ?? []} />}
          {a?.bestMonth ? (
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              Meilleur mois : <strong>{formatMonthKey(a.bestMonth.key)}</strong> (
              {formatEur(a.bestMonth.meanEurCents)} de moyenne
              {a.bestMonth.reliable ? "" : ", peu de données"})
            </p>
          ) : null}
        </Card>

        <Card>
          <CardTitle>Événements de prix</CardTitle>
          {events.isLoading ? (
            <Spinner />
          ) : (events.data ?? []).length === 0 ? (
            <EmptyState>Aucun événement détecté.</EmptyState>
          ) : (
            <ul className="max-h-72 divide-y divide-[var(--color-border)] overflow-y-auto">
              {(events.data ?? []).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <EventBadge type={e.type} />
                    <span className="font-medium">{formatEur(e.newPriceEurCents)}</span>
                    {e.dropPct !== null ? (
                      <span className="text-xs text-[var(--color-muted)]">
                        {formatPct(-e.dropPct)}
                      </span>
                    ) : null}
                    {e.confirmed ? (
                      <span className="text-xs text-[var(--color-ok)]">confirmé</span>
                    ) : null}
                    {e.resolvedAt ? (
                      <span className="text-xs text-[var(--color-muted)]">résolu</span>
                    ) : null}
                  </div>
                  <span className="text-xs text-[var(--color-muted)]">
                    {relativeTime(e.detectedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AlertsPanel searchId={id} />

        <Card>
          <CardTitle>Notifications</CardTitle>
          {notifications.isLoading ? (
            <Spinner />
          ) : (notifications.data ?? []).length === 0 ? (
            <EmptyState>Aucune notification envoyée.</EmptyState>
          ) : (
            <ul className="max-h-72 divide-y divide-[var(--color-border)] overflow-y-auto">
              {(notifications.data ?? []).map((n) => (
                <li key={n.id} className="py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{n.subject}</span>
                    <Badge
                      tone={
                        n.status === "SENT" ? "ok" : n.status === "FAILED" ? "danger" : "neutral"
                      }
                    >
                      {n.status}
                    </Badge>
                  </div>
                  <div className="mt-0.5 whitespace-pre-line text-xs text-[var(--color-muted)]">
                    {n.body}
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--color-muted)]">
                    {n.channel} · {formatDateTime(n.createdAt)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="overflow-x-auto p-0">
        <div className="p-5 pb-0">
          <CardTitle>Vols observés</CardTitle>
        </div>
        {flights.isLoading ? (
          <div className="p-5">
            <Spinner />
          </div>
        ) : (flights.data ?? []).length === 0 ? (
          <div className="p-5">
            <EmptyState>Pas encore de vol. Lance une analyse.</EmptyState>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-border)] text-left text-[var(--color-muted)]">
              <tr>
                <th className="px-5 py-3 font-medium">Trajet</th>
                <th className="px-5 py-3 font-medium">Dates</th>
                <th className="px-5 py-3 font-medium">Compagnie</th>
                <th className="px-5 py-3 font-medium">Escales</th>
                <th className="px-5 py-3 font-medium">Prix</th>
                <th className="px-5 py-3 font-medium">Vu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {(flights.data ?? []).map((f) => (
                <tr key={f.fingerprint}>
                  <td className="px-5 py-3">
                    {f.origin} → {f.destination}
                  </td>
                  <td className="px-5 py-3 text-[var(--color-muted)]">
                    {formatDate(f.outboundDate, true)}
                    {f.returnDate ? ` → ${formatDate(f.returnDate, true)}` : ""}
                  </td>
                  <td className="px-5 py-3">{f.marketingAirline ?? "—"}</td>
                  <td className="px-5 py-3">{f.maxStops}</td>
                  <td className="px-5 py-3 font-medium">{formatEur(f.latestPriceCents)}</td>
                  <td className="px-5 py-3 text-[var(--color-muted)]">
                    {relativeTime(f.observedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string | undefined }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-[var(--color-muted)]">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      {hint ? <div className="text-xs text-[var(--color-warn)]">{hint}</div> : null}
    </Card>
  );
}

const OPPORTUNITY_META: Record<
  OpportunityBand,
  { label: string; tone: "ok" | "accent" | "warn" | "neutral" }
> = {
  EXCEPTIONAL: { label: "Exceptionnel", tone: "ok" },
  GOOD: { label: "Bon moment", tone: "accent" },
  FAIR: { label: "Correct", tone: "warn" },
  POOR: { label: "Peu favorable", tone: "neutral" },
  INSUFFICIENT_DATA: { label: "Données insuffisantes", tone: "neutral" },
};

function RecommendationsBody({ data }: { data: RecommendationReport | undefined }) {
  if (!data) return <EmptyState>Pas encore de recommandation.</EmptyState>;
  const meta = OPPORTUNITY_META[data.opportunity.band];
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={meta.tone}>{meta.label}</Badge>
        {data.opportunity.score !== null ? (
          <span className="text-lg font-semibold">{data.opportunity.score}/100</span>
        ) : null}
        <span className="text-xs text-[var(--color-muted)]">
          score d&apos;opportunité · {data.sampleSize} observations
        </span>
      </div>
      {data.opportunity.reasons.length > 0 ? (
        <ul className="list-disc space-y-0.5 pl-5 text-[var(--color-muted)]">
          {data.opportunity.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      ) : null}

      {data.dates.length > 0 ? (
        <div>
          <div className="mb-1 font-medium">Meilleures dates</div>
          <ul className="divide-y divide-[var(--color-border)]">
            {data.dates.map((d) => (
              <li
                key={`${d.outboundDate}-${d.returnDate ?? ""}`}
                className="flex items-center justify-between gap-2 py-1.5"
              >
                <span>
                  {formatDate(d.outboundDate, true)}
                  {d.returnDate ? ` → ${formatDate(d.returnDate, true)}` : ""}
                  {d.reliable ? "" : " ·  peu de données"}
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-medium">{formatEur(d.latestPriceEurCents)}</span>
                  <span className="text-xs text-[var(--color-muted)]">
                    {formatPct(d.deltaVsMedianPct)} vs médiane
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {data.radar && data.radar.length > 0 ? (
        <div>
          <div className="mb-1 font-medium">Classement destinations (Radar)</div>
          <ul className="divide-y divide-[var(--color-border)]">
            {data.radar.map((r) => (
              <li key={r.destination} className="flex items-center justify-between gap-2 py-1.5">
                <span>
                  <strong>{r.destination}</strong> · meilleure date{" "}
                  {formatDate(r.bestOutboundDate, true)}
                  {r.reliable ? "" : " ·  peu de données"}
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-medium">{formatEur(r.latestPriceEurCents)}</span>
                  <span className="text-xs text-[var(--color-muted)]">
                    min {formatEur(r.minPriceEurCents)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
