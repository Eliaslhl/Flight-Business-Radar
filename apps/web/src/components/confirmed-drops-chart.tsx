"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PriceEvent } from "@/lib/types";

const DROP_TYPES = new Set<PriceEvent["type"]>(["DROP", "FLASH_DROP", "RECORD_LOW"]);

/**
 * Activité des baisses sur les 30 derniers jours (toutes recherches) : nombre
 * de baisses détectées vs confirmées par jour. Contextualise le flux « dernières
 * baisses confirmées » du dashboard.
 */
export function ConfirmedDropsChart({
  events,
  days = 30,
}: {
  events: PriceEvent[];
  days?: number;
}) {
  const drops = events.filter((e) => DROP_TYPES.has(e.type));

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const buckets = new Map<string, { detected: number; confirmed: number }>();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    buckets.set(d, { detected: 0, confirmed: 0 });
  }
  for (const e of drops) {
    const day = e.detectedAt.slice(0, 10);
    const b = buckets.get(day);
    if (!b) continue;
    b.detected += 1;
    if (e.confirmed) b.confirmed += 1;
  }

  const data = [...buckets.entries()].map(([day, b]) => ({
    day: day.slice(8, 10) + "/" + day.slice(5, 7),
    ...b,
  }));
  const total = drops.filter((e) => buckets.has(e.detectedAt.slice(0, 10))).length;

  if (total === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-[var(--color-muted)]">
        Aucune baisse sur les {days} derniers jours.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis
          dataKey="day"
          tick={{ fontSize: 10, fill: "var(--color-muted)" }}
          interval="preserveStartEnd"
          minTickGap={16}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: "var(--color-muted)" }}
          width={28}
        />
        <Tooltip
          formatter={(v: number, name: string) => [
            v,
            name === "confirmed" ? "Confirmées" : "Détectées",
          ]}
          labelFormatter={(l: string) => `Le ${l}`}
          contentStyle={{
            borderRadius: 12,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            fontSize: 12,
          }}
        />
        <Legend
          formatter={(v: string) => (v === "confirmed" ? "Confirmées" : "Détectées")}
          wrapperStyle={{ fontSize: 11 }}
        />
        <Line
          type="monotone"
          dataKey="detected"
          stroke="var(--color-accent-muted)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3 }}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="confirmed"
          stroke="var(--color-accent)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
