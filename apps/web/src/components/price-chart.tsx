"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDateTime, formatEur } from "@/lib/format";
import type { PriceSnapshot } from "@/lib/types";

/** Prix (EUR) dans le temps, à partir des snapshots d'une recherche. */
export function PriceChart({ prices }: { prices: PriceSnapshot[] }) {
  const data = prices
    .filter((p) => p.priceEurCents !== null)
    .map((p) => ({ t: new Date(p.observedAt).getTime(), eur: (p.priceEurCents ?? 0) / 100 }))
    .sort((a, b) => a.t - b.t);

  if (data.length < 2) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-[var(--color-muted)]">
        Pas encore assez d'observations pour tracer une courbe.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          tickFormatter={(t: number) => formatDateTime(new Date(t).toISOString())}
          tick={{ fontSize: 11, fill: "var(--color-muted)" }}
          minTickGap={40}
        />
        <YAxis
          tickFormatter={(v: number) => `${Math.round(v)} €`}
          tick={{ fontSize: 11, fill: "var(--color-muted)" }}
          width={64}
          domain={["auto", "auto"]}
        />
        <Tooltip
          formatter={(v: number) => [formatEur(v * 100), "Prix"]}
          labelFormatter={(t: number) => formatDateTime(new Date(t).toISOString())}
          contentStyle={{ borderRadius: 12, border: "1px solid var(--color-border)", fontSize: 12 }}
        />
        <Line
          type="monotone"
          dataKey="eur"
          stroke="var(--color-accent)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
