"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge, Card, CardTitle } from "@/components/ui";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";

export default function SettingsPage() {
  const health = useQuery({ queryKey: qk.health, queryFn: api.health, retry: false });
  const channels = useQuery({
    queryKey: qk.notificationChannels,
    queryFn: api.notificationChannels,
    retry: false,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Réglages</h1>

      <Card>
        <CardTitle>API</CardTitle>
        <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
          <dt className="text-[var(--color-muted)]">État</dt>
          <dd>
            {health.isLoading ? (
              "…"
            ) : health.isError ? (
              <Badge tone="danger">injoignable</Badge>
            ) : (
              <Badge tone={health.data?.status === "ok" ? "ok" : "warn"}>
                {health.data?.status} · base {health.data?.checks.database}
              </Badge>
            )}
          </dd>
          <dt className="text-[var(--color-muted)]">Version</dt>
          <dd>{health.data?.version ?? "—"}</dd>
          <dt className="text-[var(--color-muted)]">Proxy</dt>
          <dd className="text-[var(--color-muted)]">
            <code>/api/*</code> → API Fastify (rewrite Next)
          </dd>
        </dl>
      </Card>

      <Card>
        <CardTitle>Notifications</CardTitle>
        <p className="mb-3 text-sm text-[var(--color-muted)]">
          Canaux actifs côté worker. Chacun s&apos;active quand sa config est renseignée dans{" "}
          <code>.env</code> (voir <code>docs/NOTIFICATIONS.md</code>).
        </p>
        {channels.isLoading ? (
          <p className="text-sm">…</p>
        ) : channels.isError ? (
          <Badge tone="danger">injoignable</Badge>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {channels.data?.channels.map((c) => (
              <li key={c.name}>
                <Badge tone={c.configured ? "ok" : "neutral"}>
                  {c.name.toLowerCase()} {c.configured ? "✓" : "—"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle>Compte</CardTitle>
        <p className="text-sm text-[var(--color-muted)]">
          Authentification non encore branchée (Phase 6) : toutes les recherches appartiennent à
          l'utilisateur de développement <code>dev@localhost</code>.
        </p>
      </Card>

      <Card>
        <CardTitle>Devise</CardTitle>
        <p className="text-sm text-[var(--color-muted)]">
          Les statistiques sont exprimées en <strong>EUR</strong> (devise de référence unique). La
          normalisation des devises est gérée côté worker (<code>@fbr/fx</code>).
        </p>
      </Card>
    </div>
  );
}
