"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { alertTypeLabel } from "./badges";
import { Badge, Button, Card, CardTitle, EmptyState, Select, Spinner } from "./ui";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { AlertType } from "@/lib/types";

const TYPES: AlertType[] = [
  "FLASH_DROP",
  "PRICE_DROP",
  "TARGET_PRICE",
  "RECORD_LOW",
  "UNUSUAL_PRICE",
];

export function AlertsPanel({ searchId }: { searchId: string }) {
  const qc = useQueryClient();
  const [type, setType] = useState<AlertType>("FLASH_DROP");
  const alerts = useQuery({
    queryKey: qk.alerts(searchId),
    queryFn: () => api.listAlerts(searchId),
  });
  const invalidate = () => void qc.invalidateQueries({ queryKey: qk.alerts(searchId) });

  const create = useMutation({
    mutationFn: () => api.createAlert({ searchId, type }),
    onSuccess: invalidate,
  });
  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      enabled ? api.disableAlert(id) : api.enableAlert(id),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteAlert(id),
    onSuccess: invalidate,
    onError: () => window.alert("Suppression impossible — réessaie dans un instant."),
  });
  const askRemove = (id: string) => {
    if (window.confirm("Supprimer cette alerte ?")) remove.mutate(id);
  };

  const rows = alerts.data ?? [];

  return (
    <Card>
      <CardTitle>Alertes</CardTitle>

      <div className="mb-4 flex items-end gap-2">
        <Select
          value={type}
          onChange={(e) => setType(e.target.value as AlertType)}
          className="max-w-48"
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {alertTypeLabel(t)}
            </option>
          ))}
        </Select>
        <Button variant="primary" onClick={() => create.mutate()} disabled={create.isPending}>
          Ajouter
        </Button>
      </div>

      {alerts.isLoading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState>Aucune alerte. Ajoute-en une pour être notifié.</EmptyState>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {rows.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">{alertTypeLabel(a.type)}</span>
                <Badge tone={a.enabled ? "ok" : "neutral"}>
                  {a.enabled ? "activée" : "désactivée"}
                </Badge>
                <span className="text-xs text-[var(--color-muted)]">
                  cooldown {Math.round(a.cooldownSeconds / 60)} min
                </span>
              </div>
              <div className="flex gap-1.5">
                <Button
                  onClick={() => toggle.mutate({ id: a.id, enabled: a.enabled })}
                  disabled={toggle.isPending}
                >
                  {a.enabled ? "Désactiver" : "Activer"}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => askRemove(a.id)}
                  disabled={remove.isPending && remove.variables === a.id}
                >
                  {remove.isPending && remove.variables === a.id ? "Suppr.…" : "Suppr."}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
