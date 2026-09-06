"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Card, Field, Input, Select } from "./ui";
import { api, ApiError } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { CabinClass, CreateSearchInput } from "@/lib/types";

const CABINS: CabinClass[] = ["BUSINESS", "FIRST", "PREMIUM_ECONOMY", "ECONOMY"];

export function CreateSearchForm({ onCreated }: { onCreated?: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    label: "",
    origin: "CDG",
    destinations: "HND",
    cabinClass: "BUSINESS" as CabinClass,
    start: "",
    end: "",
    minDays: "10",
    maxDays: "14",
    maxStops: "1",
    maxPriceEur: "1500",
    targetPriceEur: "1200",
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

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
      destinations: form.destinations
        .split(",")
        .map((d) => d.trim().toUpperCase())
        .filter(Boolean),
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
            <Input
              value={form.label}
              onChange={set("label")}
              placeholder="Paris → Tokyo Business"
            />
          </Field>
        </div>
        <Field label="Départ (IATA)">
          <Input value={form.origin} onChange={set("origin")} maxLength={3} />
        </Field>
        <Field label="Destinations (IATA, séparées par des virgules)">
          <Input value={form.destinations} onChange={set("destinations")} placeholder="HND, ICN" />
        </Field>
        <Field label="Classe">
          <Select value={form.cabinClass} onChange={set("cabinClass")}>
            {CABINS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Escales max">
          <Input type="number" min={0} max={4} value={form.maxStops} onChange={set("maxStops")} />
        </Field>
        <Field label="Début de fenêtre">
          <Input type="date" value={form.start} onChange={set("start")} required />
        </Field>
        <Field label="Fin de fenêtre">
          <Input type="date" value={form.end} onChange={set("end")} required />
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

        <div className="sm:col-span-2 flex items-center gap-3">
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
