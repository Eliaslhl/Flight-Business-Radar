"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EventBadge, StatusBadge } from "@/components/badges";
import { AlertsPanel } from "@/components/alerts-panel";
import { CABIN_LABEL } from "@/components/create-search-form";
import { EditSearchForm } from "@/components/edit-search-form";
import { MonthlyChart } from "@/components/monthly-chart";
import { PriceChart } from "@/components/price-chart";
import { useToast } from "@/components/toast";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  EmptyState,
  ErrorState,
  Select,
  Spinner,
  Stat,
} from "@/components/ui";
import { api } from "@/lib/api";
import { flagEmoji } from "@/lib/flags";
import {
  formatDate,
  formatDateTime,
  formatEur,
  formatMonthKey,
  formatPct,
  relativeTime,
} from "@/lib/format";
import { qk } from "@/lib/query-keys";
import type {
  AdviceAction,
  OpportunityBand,
  RecommendationReport,
  SearchPriority,
} from "@/lib/types";

const PRIORITY_LABEL: Record<SearchPriority, string> = {
  HIGH: "Élevée",
  MEDIUM: "Moyenne",
  LOW: "Basse",
};

const ADVICE_LABEL: Record<AdviceAction, string> = {
  COLLECTE: "Encore trop tôt",
  ACHETE_MAINTENANT: "Achète maintenant",
  PRET_A_ACHETER: "Bon moment",
  SURVEILLE: "Surveille",
  ATTENDS: "Attends",
};
const ADVICE_TONE: Record<AdviceAction, "ok" | "accent" | "warn" | "neutral"> = {
  COLLECTE: "neutral",
  ACHETE_MAINTENANT: "ok",
  PRET_A_ACHETER: "accent",
  SURVEILLE: "warn",
  ATTENDS: "neutral",
};

export default function SearchDetailPage() {
  const id = String(useParams().id);
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);

  const search = useQuery({ queryKey: qk.search(id), queryFn: () => api.getSearch(id) });
  const flights = useQuery({ queryKey: qk.flights(id), queryFn: () => api.flights(id) });
  const prices = useQuery({ queryKey: qk.prices(id), queryFn: () => api.prices(id) });
  const analytics = useQuery({ queryKey: qk.analytics(id), queryFn: () => api.analytics(id) });
  const recommendations = useQuery({
    queryKey: qk.recommendations(id),
    queryFn: () => api.recommendations(id),
  });
  const advice = useQuery({
    queryKey: qk.advice(id),
    queryFn: () => api.advice(id),
    retry: false,
  });
  const events = useQuery({ queryKey: qk.events(id), queryFn: () => api.events(id) });
  const notifications = useQuery({
    queryKey: qk.notifications(id),
    queryFn: () => api.notifications(id),
  });
  const airports = useQuery({ queryKey: qk.airports, queryFn: api.airports });
  const flagOf = (iata: string): string =>
    flagEmoji(airports.data?.find((a) => a.iata === iata)?.countryCode);

  const invalidateAll = () => {
    for (const key of [
      qk.search(id),
      qk.flights(id),
      qk.prices(id),
      qk.analytics(id),
      qk.recommendations(id),
      qk.advice(id),
      qk.events(id),
      qk.notifications(id),
    ]) {
      void qc.invalidateQueries({ queryKey: key });
    }
  };
  const run = useMutation({
    mutationFn: () => api.runSearch(id),
    onSuccess: (r) => {
      invalidateAll();
      toast(
        r.scheduled ? "Analyse programmée (prochain passage ≤ 15 min)" : "Analyse lancée ✓",
        "ok",
      );
    },
    onError: () => toast("Analyse impossible — réessaie", "error"),
  });
  const setPriority = useMutation({
    mutationFn: (priority: SearchPriority) => api.setPriority(id, priority),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.search(id) });
      toast("Priorité mise à jour ✓", "ok");
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
              {flagOf(s.origin)} {s.origin} →{" "}
              {s.destinations.length === 0
                ? "toutes destinations"
                : s.destinations.map((d) => `${flagOf(d)} ${d}`).join(", ")}{" "}
              · toutes cabines · aller {formatDate(s.departureWindow.start, true)} · retour{" "}
              {formatDate(
                new Date(Date.parse(s.departureWindow.start) + s.tripDuration.minDays * 86_400_000)
                  .toISOString()
                  .slice(0, 10),
                true,
              )}{" "}
              · ≤ {s.maxStops} escale(s)
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={s.status} />
              <label className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
                Priorité
                <Select
                  size="sm"
                  className="w-24"
                  value={s.priority}
                  onChange={(e) => setPriority.mutate(e.target.value as SearchPriority)}
                >
                  {(["HIGH", "MEDIUM", "LOW"] as const).map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </option>
                  ))}
                </Select>
              </label>
              {s.targetPriceCents !== null ? (
                <Badge tone="accent">cible {formatEur(s.targetPriceCents)}</Badge>
              ) : null}
              <span className="text-xs text-[var(--color-muted)]">
                analyse toutes les {Math.round(s.intervalSeconds / 60)} min · prochaine{" "}
                {relativeTime(s.nextRunAt)}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" onClick={() => setEditing((v) => !v)}>
              {editing ? "Fermer" : "Modifier"}
            </Button>
            <Button variant="primary" onClick={() => run.mutate()} disabled={run.isPending}>
              {run.isPending ? "…" : "Analyser maintenant"}
            </Button>
          </div>
        </div>
        {editing ? (
          <div className="mt-4">
            <EditSearchForm search={s} onDone={() => setEditing(false)} />
          </div>
        ) : null}
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
        <CardTitle>Conseil</CardTitle>
        {advice.isLoading ? (
          <Spinner />
        ) : advice.isError ? (
          <ErrorState error={advice.error} />
        ) : advice.data ? (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={ADVICE_TONE[advice.data.action]}>
                {ADVICE_LABEL[advice.data.action]}
              </Badge>
              <span className="text-xs text-[var(--color-muted)]">
                généré par {advice.data.model === "rules" ? "règles" : advice.data.model}
              </span>
              {advice.data.fallback && advice.data.verdict === "FLAGGED" ? (
                <Badge tone="warn">réponse recadrée</Badge>
              ) : null}
            </div>
            <p className="whitespace-pre-line leading-relaxed">{advice.data.text}</p>
            {advice.data.fallback && advice.data.verdict === "FLAGGED" ? (
              <p className="text-xs text-[var(--color-muted)]">
                Le modèle a cité des valeurs hors de l&apos;historique
                {advice.data.flagged.length > 0 ? ` (${advice.data.flagged.join(", ")})` : ""} : le
                conseil déterministe est affiché à la place.
              </p>
            ) : null}
          </div>
        ) : (
          <EmptyState>Pas encore de conseil.</EmptyState>
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
                <th className="px-5 py-3 font-medium">Cabine</th>
                <th className="px-5 py-3 font-medium">Dates</th>
                <th className="px-5 py-3 font-medium">Compagnie</th>
                <th className="px-5 py-3 font-medium">Escales</th>
                <th className="px-5 py-3 font-medium">Prix</th>
                <th className="px-5 py-3 font-medium">Vu</th>
                <th className="px-5 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {[...(flights.data ?? [])]
                .sort((x, y) => x.latestPriceCents - y.latestPriceCents)
                .map((f, i) => (
                  <tr key={f.fingerprint} className={i < 3 ? "bg-[var(--color-ok-soft)]/40" : ""}>
                    <td className="px-5 py-3 whitespace-nowrap">
                      {flagOf(f.origin)} {f.origin} → {flagOf(f.destination)} {f.destination}
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone="neutral">{CABIN_LABEL[f.cabinClass]}</Badge>
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
                    <td className="px-5 py-3 whitespace-nowrap">
                      {f.bookingUrl ? (
                        <a
                          href={f.bookingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--color-accent)] hover:underline"
                        >
                          Réserver ↗
                        </a>
                      ) : null}
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
