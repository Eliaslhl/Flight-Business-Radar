"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StatusBadge } from "@/components/badges";
import { CreateSearchForm } from "@/components/create-search-form";
import { useToast } from "@/components/toast";
import { Button, Card, EmptyState, ErrorState, PageHeader, Select, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, formatEur, relativeTime } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import type { SearchPriority } from "@/lib/types";

const PRIORITY_RANK: Record<SearchPriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const PRIORITY_LABEL: Record<SearchPriority, string> = {
  HIGH: "Élevée",
  MEDIUM: "Moyenne",
  LOW: "Basse",
};

const ACTION_TOAST: Record<string, string> = {
  activate: "Recherche activée ✓",
  pause: "Recherche en pause",
  delete: "Recherche supprimée ✓",
};

export default function SearchesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);
  const searches = useQuery({ queryKey: qk.searches, queryFn: api.listSearches });

  const invalidate = () => void qc.invalidateQueries({ queryKey: qk.searches });
  const act = useMutation({
    mutationFn: async ({
      id,
      action,
    }: {
      id: string;
      action: "activate" | "pause" | "run" | "delete";
    }): Promise<string> => {
      if (action === "activate") await api.activateSearch(id);
      else if (action === "pause") await api.pauseSearch(id);
      else if (action === "run") {
        const r = await api.runSearch(id);
        return r.scheduled ? "Analyse programmée (prochain passage ≤ 15 min)" : "Analyse lancée ✓";
      } else await api.deleteSearch(id);
      return ACTION_TOAST[action] ?? "Fait ✓";
    },
    onSuccess: (msg) => {
      invalidate();
      toast(msg, "ok");
    },
    onError: () => toast("Action impossible — réessaie", "error"),
  });
  const setPriority = useMutation({
    mutationFn: ({ id, priority }: { id: string; priority: SearchPriority }) =>
      api.setPriority(id, priority),
    onSuccess: () => {
      invalidate();
      toast("Priorité mise à jour ✓", "ok");
    },
  });

  const rows = [...(searches.data ?? [])].sort(
    (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recherches"
        subtitle="Chaque recherche surveille une plage de dates et historise les prix."
        actions={
          <Button variant="primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Fermer" : "+ Nouvelle recherche"}
          </Button>
        }
      />

      {showForm ? <CreateSearchForm onCreated={() => setShowForm(false)} /> : null}

      {searches.isLoading ? (
        <Spinner />
      ) : searches.isError ? (
        <ErrorState error={searches.error} />
      ) : rows.length === 0 ? (
        <EmptyState>Aucune recherche pour l'instant.</EmptyState>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-border)] text-left text-[var(--color-muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Recherche</th>
                <th className="px-4 py-3 font-medium">Dates</th>
                <th className="px-4 py-3 font-medium">Cible</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Prochaine analyse</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3">
                    <Link href={`/searches/${s.id}`} className="font-medium hover:underline">
                      {s.label ?? `${s.origin} → ${s.destinations.join(", ") || "Radar"}`}
                    </Link>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span className="text-xs text-[var(--color-muted)]">Priorité</span>
                      <Select
                        size="sm"
                        className="w-24"
                        value={s.priority}
                        onChange={(e) =>
                          setPriority.mutate({
                            id: s.id,
                            priority: e.target.value as SearchPriority,
                          })
                        }
                      >
                        {(["HIGH", "MEDIUM", "LOW"] as const).map((p) => (
                          <option key={p} value={p}>
                            {PRIORITY_LABEL[p]}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">
                    {formatDate(s.departureWindow.start, true)}
                    <div>
                      retour{" "}
                      {formatDate(
                        new Date(
                          Date.parse(s.departureWindow.start) + s.tripDuration.minDays * 86_400_000,
                        )
                          .toISOString()
                          .slice(0, 10),
                        true,
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">{formatEur(s.targetPriceCents)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">
                    {relativeTime(s.nextRunAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <Button onClick={() => act.mutate({ id: s.id, action: "run" })}>
                        Analyser
                      </Button>
                      {s.status === "ACTIVE" ? (
                        <Button onClick={() => act.mutate({ id: s.id, action: "pause" })}>
                          Pause
                        </Button>
                      ) : (
                        <Button onClick={() => act.mutate({ id: s.id, action: "activate" })}>
                          Activer
                        </Button>
                      )}
                      <Button
                        variant="danger"
                        onClick={() => {
                          if (confirm("Supprimer cette recherche ?"))
                            act.mutate({ id: s.id, action: "delete" });
                        }}
                      >
                        Suppr.
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
