"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PriorityBadge, StatusBadge } from "@/components/badges";
import { CreateSearchForm } from "@/components/create-search-form";
import { Button, Card, EmptyState, ErrorState, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, formatEur, relativeTime } from "@/lib/format";
import { qk } from "@/lib/query-keys";

export default function SearchesPage() {
  const qc = useQueryClient();
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
    }): Promise<void> => {
      if (action === "activate") await api.activateSearch(id);
      else if (action === "pause") await api.pauseSearch(id);
      else if (action === "run") await api.runSearch(id);
      else await api.deleteSearch(id);
    },
    onSuccess: invalidate,
  });

  const rows = searches.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Recherches</h1>
        <Button variant="primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Fermer" : "+ Nouvelle recherche"}
        </Button>
      </div>

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
                <th className="px-4 py-3 font-medium">Fenêtre</th>
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
                    <div className="mt-1">
                      <PriorityBadge priority={s.priority} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">
                    {formatDate(s.departureWindow.start, true)} –{" "}
                    {formatDate(s.departureWindow.end, true)}
                    <div>
                      {s.tripDuration.minDays}–{s.tripDuration.maxDays} j
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
