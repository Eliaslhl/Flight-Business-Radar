"use client";

import Link from "next/link";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { alertTypeLabel } from "@/components/badges";
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { qk } from "@/lib/query-keys";

export default function AlertsPage() {
  const qc = useQueryClient();
  const searches = useQuery({ queryKey: qk.searches, queryFn: api.listSearches });
  const rows = searches.data ?? [];

  const alertQueries = useQueries({
    queries: rows.map((s) => ({
      queryKey: qk.alerts(s.id),
      queryFn: () => api.listAlerts(s.id),
      enabled: rows.length > 0,
    })),
  });

  const all = alertQueries.flatMap((q, i) =>
    (q.data ?? []).map((a) => ({ alert: a, search: rows[i]! })),
  );

  const toggle = useMutation({
    mutationFn: ({ id, enabled, searchId }: { id: string; enabled: boolean; searchId: string }) =>
      (enabled ? api.disableAlert(id) : api.enableAlert(id)).then(() => searchId),
    onSuccess: (searchId) => void qc.invalidateQueries({ queryKey: qk.alerts(searchId) }),
  });
  const remove = useMutation({
    mutationFn: ({ id, searchId }: { id: string; searchId: string }) =>
      api.deleteAlert(id).then(() => searchId),
    onSuccess: (searchId) => void qc.invalidateQueries({ queryKey: qk.alerts(searchId) }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alertes"
        subtitle="Toutes les alertes de tes recherches — activation, désactivation, suppression."
      />

      {searches.isLoading ? (
        <Spinner />
      ) : searches.isError ? (
        <ErrorState error={searches.error} />
      ) : all.length === 0 ? (
        <EmptyState>Aucune alerte. Ouvre une recherche pour en créer.</EmptyState>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-border)] text-left text-[var(--color-muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Recherche</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Cooldown</th>
                <th className="px-4 py-3 font-medium">Dernier déclenchement</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {all.map(({ alert, search }) => (
                <tr key={alert.id}>
                  <td className="px-4 py-3">
                    <Link href={`/searches/${search.id}`} className="font-medium hover:underline">
                      {search.label ??
                        `${search.origin} → ${search.destinations.join(", ") || "Radar"}`}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{alertTypeLabel(alert.type)}</td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">
                    {Math.round(alert.cooldownSeconds / 60)} min
                  </td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">
                    {alert.lastTriggeredAt ? relativeTime(alert.lastTriggeredAt) : "jamais"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={alert.enabled ? "ok" : "neutral"}>
                      {alert.enabled ? "activée" : "désactivée"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <Button
                        onClick={() =>
                          toggle.mutate({
                            id: alert.id,
                            enabled: alert.enabled,
                            searchId: search.id,
                          })
                        }
                      >
                        {alert.enabled ? "Désactiver" : "Activer"}
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => remove.mutate({ id: alert.id, searchId: search.id })}
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
