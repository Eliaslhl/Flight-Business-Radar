"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AirportInput } from "./airport-input";
import { Button, Card, Field, Input, Select } from "./ui";
import { flagEmoji } from "@/lib/flags";
import { api, ApiError } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { CabinClass, CreateSearchInput } from "@/lib/types";

const CABINS: CabinClass[] = ["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"];
export const CABIN_LABEL: Record<CabinClass, string> = {
  ECONOMY: "Économie",
  PREMIUM_ECONOMY: "Économie premium",
  BUSINESS: "Affaires",
  FIRST: "Première",
};
const todayISO = (): string => new Date().toISOString().slice(0, 10);

export function CreateSearchForm({ onCreated }: { onCreated?: () => void }) {
  const qc = useQueryClient();
  const airports = useQuery({ queryKey: qk.airports, queryFn: api.airports });
  const list = airports.data ?? [];

  const [form, setForm] = useState({
    label: "",
    origin: "CDG",
    cabinClass: "ECONOMY" as CabinClass,
    start: "",
    end: "",
    minDays: "10",
    maxDays: "14",
    maxStops: "1",
    maxPriceEur: "1500",
    targetPriceEur: "1200",
  });
  const [dests, setDests] = useState<string[]>(["HND"]);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const addDest = (iata: string) => {
    setDests((d) => (d.includes(iata) ? d : [...d, iata]));
  };
  const removeDest = (iata: string) => setDests((d) => d.filter((x) => x !== iata));

  const airportOf = (iata: string) => list.find((a) => a.iata === iata);
  const cityOf = (iata: string): string | undefined => airportOf(iata)?.city;
  const flagOf = (iata: string): string => flagEmoji(airportOf(iata)?.countryCode);

  const mutation = useMutation({
    mutationFn: (body: CreateSearchInput) => api.createSearch(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.searches });
      onCreated?.();
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body: CreateSearchInput = {
      origin: form.origin.trim().toUpperCase(),
      destinations: dests,
      cabinClass: form.cabinClass,
      departureWindow: { start: form.start, end: form.end },
      tripDuration: { minDays: Number(form.minDays), maxDays: Number(form.maxDays) },
      maxStops: Number(form.maxStops),
    };
    if (form.label.trim()) body.label = form.label.trim();
    if (form.maxPriceEur) body.maxPriceCents = Math.round(Number(form.maxPriceEur) * 100);
    if (form.targetPriceEur) body.targetPriceCents = Math.round(Number(form.targetPriceEur) * 100);
    mutation.mutate(body);
  };

  return (
    <Card>
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Libellé (optionnel)">
            <Input value={form.label} onChange={set("label")} placeholder="Paris → Tokyo" />
          </Field>
        </div>

        <Field label="Départ">
          <AirportInput
            value={form.origin}
            onSelect={(iata) => setForm((f) => ({ ...f, origin: iata }))}
            airports={list}
          />
        </Field>

        <div>
          <span className="mb-1 block text-sm font-medium text-[var(--color-muted)]">
            Destinations{" "}
            <span className="font-normal text-[var(--color-faint)]">— vide = mode Radar</span>
          </span>
          {dests.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {dests.map((d) => (
                <span
                  key={d}
                  className="inline-flex items-center gap-1 rounded-full bg-[var(--color-accent-soft)] py-0.5 pr-1 pl-2 text-xs text-[var(--color-accent)]"
                >
                  {flagOf(d) ? <span aria-hidden>{flagOf(d)}</span> : null}
                  <span className="font-mono font-medium">{d}</span>
                  {cityOf(d) ? <span className="opacity-70">{cityOf(d)}</span> : null}
                  <button
                    type="button"
                    onClick={() => removeDest(d)}
                    aria-label={`retirer ${d}`}
                    className="rounded-full px-1 leading-none hover:bg-[var(--color-accent-muted)]"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <AirportInput
            value=""
            onSelect={addDest}
            airports={list}
            placeholder="Ajouter une ville / un aéroport"
          />
        </div>

        <Field label="Classe">
          <Select value={form.cabinClass} onChange={set("cabinClass")}>
            {CABINS.map((c) => (
              <option key={c} value={c}>
                {CABIN_LABEL[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Escales max">
          <Input type="number" min={0} max={4} value={form.maxStops} onChange={set("maxStops")} />
        </Field>
        <Field label="Début de fenêtre">
          <Input
            type="date"
            min={todayISO()}
            value={form.start}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                start: e.target.value,
                // garde une fin cohérente : jamais avant le nouveau début
                end: f.end && f.end < e.target.value ? e.target.value : f.end,
              }))
            }
            required
          />
        </Field>
        <Field label="Fin de fenêtre">
          <Input
            type="date"
            min={form.start || todayISO()}
            value={form.end}
            onChange={set("end")}
            required
          />
        </Field>
        <Field label="Durée min (jours)">
          <Input type="number" min={1} value={form.minDays} onChange={set("minDays")} />
        </Field>
        <Field label="Durée max (jours)">
          <Input type="number" min={1} value={form.maxDays} onChange={set("maxDays")} />
        </Field>
        <Field label="Budget max (€)">
          <Input type="number" min={0} value={form.maxPriceEur} onChange={set("maxPriceEur")} />
        </Field>
        <Field label="Prix cible (€)">
          <Input
            type="number"
            min={0}
            value={form.targetPriceEur}
            onChange={set("targetPriceEur")}
          />
        </Field>

        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" variant="primary" disabled={mutation.isPending}>
            {mutation.isPending ? "Création…" : "Créer la recherche"}
          </Button>
          {mutation.isError ? (
            <span className="text-sm text-[var(--color-danger)]">
              {mutation.error instanceof ApiError && mutation.error.status === 400
                ? "Formulaire invalide"
                : "Échec — API injoignable ?"}
            </span>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
