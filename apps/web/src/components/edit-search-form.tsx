"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "./toast";
import { Button, Card, Field, Input } from "./ui";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { Search, UpdateSearchInput } from "@/lib/types";

const iso = (d: string): string => d.slice(0, 10);
const addDays = (dateISO: string, n: number): string =>
  new Date(Date.parse(dateISO) + n * 86_400_000).toISOString().slice(0, 10);

export function EditSearchForm({ search, onDone }: { search: Search; onDone: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const retourInit = addDays(search.departureWindow.start, search.tripDuration.minDays);

  const [form, setForm] = useState({
    label: search.label ?? "",
    depart: iso(search.departureWindow.start),
    retour: retourInit,
    maxStops: String(search.maxStops),
    maxPriceEur: search.maxPriceCents != null ? String(search.maxPriceCents / 100) : "",
    targetPriceEur: search.targetPriceCents != null ? String(search.targetPriceCents / 100) : "",
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = useMutation({
    mutationFn: () => {
      const nights = Math.max(
        1,
        Math.round((Date.parse(form.retour) - Date.parse(form.depart)) / 86_400_000) || 1,
      );
      const body: UpdateSearchInput = {
        label: form.label.trim() || null,
        departureWindow: { start: form.depart, end: form.depart },
        tripDuration: { minDays: nights, maxDays: nights },
        maxStops: Number(form.maxStops),
        maxPriceCents: form.maxPriceEur ? Math.round(Number(form.maxPriceEur) * 100) : null,
        targetPriceCents: form.targetPriceEur
          ? Math.round(Number(form.targetPriceEur) * 100)
          : null,
      };
      return api.updateSearch(search.id, body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.search(search.id) });
      void qc.invalidateQueries({ queryKey: qk.searches });
      toast("Recherche modifiée ✓", "ok");
      onDone();
    },
    onError: () => toast("Modification impossible — vérifie les champs", "error"),
  });

  return (
    <Card>
      <form
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="sm:col-span-2">
          <Field label="Libellé">
            <Input value={form.label} onChange={set("label")} />
          </Field>
        </div>
        <Field label="Date aller">
          <Input
            type="date"
            value={form.depart}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                depart: e.target.value,
                retour: f.retour && f.retour <= e.target.value ? "" : f.retour,
              }))
            }
            required
          />
        </Field>
        <Field label="Date retour">
          <Input
            type="date"
            min={form.depart}
            value={form.retour}
            onChange={set("retour")}
            required
          />
        </Field>
        <Field label="Escales max">
          <Input type="number" min={0} max={4} value={form.maxStops} onChange={set("maxStops")} />
        </Field>
        <Field label="Budget max (€)">
          <Input
            type="number"
            min={0}
            value={form.maxPriceEur}
            onChange={set("maxPriceEur")}
            placeholder="aucun"
          />
        </Field>
        <Field label="Prix cible (€)">
          <Input
            type="number"
            min={0}
            value={form.targetPriceEur}
            onChange={set("targetPriceEur")}
            placeholder="aucun"
          />
        </Field>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {save.isPending ? "…" : "Enregistrer"}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Annuler
          </Button>
        </div>
      </form>
    </Card>
  );
}
