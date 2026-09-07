"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatEur, formatMonthKey } from "@/lib/format";
import type { GroupStat } from "@/lib/types";

/** Prix moyen par mois de départ (barres). Les mois peu fiables sont estompés. */
export function MonthlyChart({ byMonth }: { byMonth: GroupStat<string>[] }) {
  const data = byMonth.map((m) => ({
    month: formatMonthKey(m.key),
    mean: Math.round(m.summary.mean / 100),
    min: Math.round(m.summary.min / 100),
    reliable: m.reliable,
  }));

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-[var(--color-muted)]">
        Aucune donnée mensuelle.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--color-muted)" }} />
        <YAxis
          tickFormatter={(v: number) => `${v} €`}
          tick={{ fontSize: 11, fill: "var(--color-muted)" }}
          width={56}
        />
        <Tooltip
          formatter={(v: number, name: string) => [
            formatEur(v * 100),
            name === "mean" ? "Moyenne" : "Min",
          ]}
          contentStyle={{ borderRadius: 12, border: "1px solid var(--color-border)", fontSize: 12 }}
        />
        <Bar dataKey="mean" radius={[6, 6, 0, 0]} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.reliable ? "var(--color-accent)" : "var(--color-accent-muted)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
