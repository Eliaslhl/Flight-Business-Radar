"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AirportInput } from "@/components/airport-input";
import { CABIN_LABEL } from "@/components/create-search-form";
import {
  Badge,
  Button,
  Card,
  CardTitle,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Select,
  Skeleton,
  Spinner,
} from "@/components/ui";
import { api } from "@/lib/api";
import { flagEmoji } from "@/lib/flags";
import { formatDate, formatEur } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import type {
  CabinClass,
  CreateSearchInput,
  RadarDestinationRank,
  Search,
  SeedAirport,
} from "@/lib/types";

const REGION_LABEL: Record<string, string> = {
  ASIA: "Asie",
  NORTH_AMERICA: "Amérique du Nord",
  SOUTH_AMERICA: "Amérique du Sud",
  MIDDLE_EAST: "Moyen-Orient",
  AFRICA: "Afrique",
  OCEANIA: "Océanie",
  INDIAN_OCEAN: "Océan Indien",
};

const CABINS: CabinClass[] = ["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"];

/** Une recherche « radar » : sans destination, ou libellée « Radar … ». */
const isRadarSearch = (s: Search): boolean =>
  s.destinations.length === 0 || (s.label ?? "").startsWith("Radar ");

export default function RadarPage() {
  const qc = useQueryClient();
  const searches = useQuery({ queryKey: qk.searches, queryFn: api.listSearches });
  const seed = useQuery({ queryKey: qk.radarDestinations, queryFn: api.radarDestinations });

  const radarSearches = useMemo(() => (searches.data ?? []).filter(isRadarSearch), [searches.data]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const radarSearch: Search | undefined =
    radarSearches.find((s) => s.id === selectedId) ?? radarSearches[0];

  const ranking = useQuery({
    queryKey: qk.recommendations(radarSearch?.id ?? "none"),
    queryFn: () => api.recommendations(radarSearch!.id),
    enabled: !!radarSearch,
  });

  const run = useMutation({
    mutationFn: () => api.runSearch(radarSearch!.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.recommendations(radarSearch!.id) });
      void qc.invalidateQueries({ queryKey: qk.searches });
    },
  });

  const byRegion = useMemo(() => {
    const map = new Map<string, SeedAirport[]>();
    for (const a of seed.data?.destinations ?? []) {
      const list = map.get(a.region) ?? [];
      list.push(a);
      map.set(a.region, list);
    }
    return [...map.entries()];
  }, [seed.data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Radar"
        subtitle={`Une seule recherche « sans destination » sonde ~${
          seed.data?.count ?? "50"
        } villes long-courrier depuis ${seed.data?.origin ?? "CDG"} et les classe par prix.`}
        actions={
          radarSearch ? (
            <>
              <Button size="md" onClick={() => run.mutate()} disabled={run.isPending}>
                {run.isPending ? "…" : "Analyser maintenant"}
              </Button>
              <Link href={`/searches/${radarSearch.id}`}>
                <Button variant="ghost">Ouvrir la recherche</Button>
              </Link>
            </>
          ) : null
        }
      />

      {searches.isLoading ? (
        <Card>
          <Skeleton className="h-5 w-40" />
          <div className="mt-3 space-y-2">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        </Card>
      ) : searches.isError ? (
        <ErrorState error={searches.error} />
      ) : !radarSearch ? (
        <CreateRadarCard onCreated={() => void qc.invalidateQueries({ queryKey: qk.searches })} />
      ) : (
        <Card>
          <CardTitle aside={ranking.data ? `${ranking.data.sampleSize} observations` : undefined}>
            Classement des destinations
          </CardTitle>
          {radarSearches.length > 1 ? (
            <div className="mb-3">
              <Select
                className="max-w-xs"
                value={radarSearch.id}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {radarSearches.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label ?? `${s.origin} → Radar`}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          {ranking.isLoading ? (
            <Spinner />
          ) : ranking.isError ? (
            <ErrorState error={ranking.error} />
          ) : (ranking.data?.radar ?? []).length === 0 ? (
            <EmptyState
              action={
                <Button onClick={() => run.mutate()} disabled={run.isPending}>
                  Lancer une analyse
                </Button>
              }
            >
              Le radar n&apos;a pas encore collecté de prix pour cette recherche.
            </EmptyState>
          ) : (
            <RankingTable
              rows={ranking.data!.radar!}
              searchId={radarSearch.id}
              seed={seed.data?.destinations ?? []}
            />
          )}
        </Card>
      )}

      <Card>
        <CardTitle>Destinations sondées</CardTitle>
        {seed.isLoading ? (
          <Spinner />
        ) : seed.isError ? (
          <ErrorState error={seed.error} />
        ) : (
          <div className="space-y-4">
            {byRegion.map(([region, airports]) => (
              <div key={region}>
                <div className="mb-1.5 text-xs font-medium text-[var(--color-muted)]">
                  {REGION_LABEL[region] ?? region}{" "}
                  <span className="text-[var(--color-faint)]">· {airports.length}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {airports.map((a) => (
                    <span
                      key={a.iata}
                      title={`${a.city}, ${a.country}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-xs"
                    >
                      <span aria-hidden>{flagEmoji(a.countryCode) || "🏳️"}</span>
                      <span className="font-mono font-medium">{a.iata}</span>
                      <span className="text-[var(--color-muted)]">{a.city}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function RankingTable({
  rows,
  searchId,
  seed,
}: {
  rows: RadarDestinationRank[];
  searchId: string;
  seed: SeedAirport[];
}) {
  const byIata = new Map(seed.map((a) => [a.iata, a]));
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-[36rem] text-sm">
        <thead className="border-y border-[var(--color-border)] text-left text-xs text-[var(--color-muted)]">
          <tr>
            <th className="px-5 py-2 font-medium">#</th>
            <th className="px-5 py-2 font-medium">Destination</th>
            <th className="px-5 py-2 font-medium">Prix récent</th>
            <th className="px-5 py-2 font-medium">Min observé</th>
            <th className="px-5 py-2 font-medium">Meilleure date</th>
            <th className="px-5 py-2 font-medium">Données</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {rows.map((r, i) => (
            <tr key={r.destination} className="hover:bg-[var(--color-surface-2)]">
              <td className="px-5 py-2.5 text-[var(--color-faint)]">{i + 1}</td>
              <td className="px-5 py-2.5">
                <Link
                  href={`/searches/${searchId}`}
                  className="inline-flex items-center gap-1.5 font-medium hover:text-[var(--color-accent)]"
                >
                  <span aria-hidden>
                    {flagEmoji(byIata.get(r.destination)?.countryCode) || "🏳️"}
                  </span>
                  <span className="font-mono">{r.destination}</span>
                  {byIata.get(r.destination) ? (
                    <span className="text-[var(--color-muted)]">
                      {byIata.get(r.destination)!.city}
                    </span>
                  ) : null}
                </Link>
              </td>
              <td className="tnum px-5 py-2.5 font-medium">{formatEur(r.latestPriceEurCents)}</td>
              <td className="tnum px-5 py-2.5 text-[var(--color-muted)]">
                {formatEur(r.minPriceEurCents)}
              </td>
              <td className="px-5 py-2.5 text-[var(--color-muted)]">
                {formatDate(r.bestOutboundDate, true)}
              </td>
              <td className="px-5 py-2.5">
                {r.reliable ? (
                  <Badge tone="ok">fiable</Badge>
                ) : (
                  <Badge tone="neutral">{r.sampleSize} obs.</Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CreateRadarCard({ onCreated }: { onCreated: () => void }) {
  const airports = useQuery({ queryKey: qk.airports, queryFn: api.airports });
  const airportList = airports.data ?? [];
  const seed = useQuery({ queryKey: qk.radarDestinations, queryFn: api.radarDestinations });
  const regions = useMemo(() => {
    const set = new Set((seed.data?.destinations ?? []).map((d) => d.region));
    return [...set];
  }, [seed.data]);

  const [form, setForm] = useState({
    origin: "CDG",
    continent: "ALL",
    cabinClass: "ECONOMY" as CabinClass,
    start: "",
    end: "",
    minDays: "7",
    maxDays: "14",
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const create = useMutation({
    mutationFn: async () => {
      const region = form.continent === "ALL" ? null : form.continent;
      const dests = region
        ? (seed.data?.destinations ?? []).filter((d) => d.region === region).map((d) => d.iata)
        : [];
      const body: CreateSearchInput = {
        label: `Radar ${form.origin.toUpperCase()}${
          region ? ` · ${REGION_LABEL[region] ?? region}` : ""
        }`,
        origin: form.origin.trim().toUpperCase(),
        destinations: dests,
        cabinClass: form.cabinClass,
        departureWindow: { start: form.start, end: form.end },
        tripDuration: { minDays: Number(form.minDays), maxDays: Number(form.maxDays) },
      };
      const created = await api.createSearch(body);
      await api.activateSearch(created.id);
    },
    onSuccess: onCreated,
  });

  return (
    <Card>
      <CardTitle>Activer le radar</CardTitle>
      <p className="mb-4 text-sm text-[var(--color-muted)]">
        <strong>Tous les continents</strong> : une recherche sans destination, le worker sonde une
        tranche tournante de la liste ci-dessous. <strong>Un continent</strong> : une recherche
        ciblant ses villes, classées par prix. La source gratuite ne renvoie des tarifs qu&apos;en{" "}
        <strong>économie</strong>.
      </p>
      <form
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Field label="Départ">
          <AirportInput
            value={form.origin}
            onSelect={(iata) => setForm((f) => ({ ...f, origin: iata }))}
            airports={airportList}
          />
        </Field>
        <Field label="Continent">
          <Select value={form.continent} onChange={set("continent")}>
            <option value="ALL">Tous les continents</option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {REGION_LABEL[r] ?? r}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Classe">
          <Select value={form.cabinClass} onChange={set("cabinClass")}>
            {CABINS.map((c) => (
              <option key={c} value={c}>
                {CABIN_LABEL[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Durée min (j)">
          <Input type="number" min={1} value={form.minDays} onChange={set("minDays")} />
        </Field>
        <Field label="Durée max (j)">
          <Input type="number" min={1} value={form.maxDays} onChange={set("maxDays")} />
        </Field>
        <Field label="Fenêtre — début">
          <Input
            type="date"
            min={new Date().toISOString().slice(0, 10)}
            value={form.start}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                start: e.target.value,
                end: f.end && f.end < e.target.value ? e.target.value : f.end,
              }))
            }
            required
          />
        </Field>
        <Field label="Fenêtre — fin">
          <Input
            type="date"
            min={form.start || new Date().toISOString().slice(0, 10)}
            value={form.end}
            onChange={set("end")}
            required
          />
        </Field>
        <div className="col-span-2 flex items-center gap-3 sm:col-span-4">
          <Button type="submit" variant="primary" disabled={create.isPending}>
            {create.isPending ? "Création…" : "Activer le radar"}
          </Button>
          {create.isError ? (
            <span className="text-sm text-[var(--color-danger)]">Échec — vérifie les champs.</span>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
