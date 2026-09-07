"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "./ui";
import type { WorldAirport } from "@/lib/types";

const norm = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/** Classe les correspondances : code exact > préfixe code > préfixe ville > reste. */
function rank(a: WorldAirport, q: string): number {
  const iata = a.iata.toLowerCase();
  const city = norm(a.city);
  if (iata === q) return 0;
  if (iata.startsWith(q)) return 1;
  if (city.startsWith(q)) return 2;
  if (city.includes(q) || norm(a.country).includes(q)) return 3;
  return 99;
}

export interface AirportInputProps {
  value: string;
  onSelect: (iata: string) => void;
  airports: WorldAirport[];
  placeholder?: string;
  id?: string;
}

export function AirportInput({ value, onSelect, airports, placeholder, id }: AirportInputProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => setQuery(value), [value]);

  useEffect(() => {
    const onClickAway = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  const matches = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return [];
    return airports
      .map((a) => ({ a, r: rank(a, q) }))
      .filter((m) => m.r < 99)
      .sort((x, y) => x.r - y.r || x.a.city.localeCompare(y.a.city))
      .slice(0, 8)
      .map((m) => m.a);
  }, [airports, query]);

  const commit = (raw: string) => {
    const code = raw.trim().toUpperCase();
    if (/^[A-Z0-9]{3}$/.test(code)) {
      onSelect(code);
      setQuery(code);
    } else {
      setQuery(value); // revient à la dernière valeur valide
    }
    setOpen(false);
  };

  const pick = (a: WorldAirport) => {
    onSelect(a.iata);
    setQuery(a.iata);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <Input
        id={id}
        value={query}
        placeholder={placeholder ?? "Ville ou code IATA"}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHi(0);
        }}
        onFocus={() => query.trim() && setOpen(true)}
        onBlur={() => commit(query)}
        onKeyDown={(e) => {
          if (!open || matches.length === 0) {
            if (e.key === "Enter") commit(query);
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHi((h) => Math.min(h + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(matches[hi]!);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && matches.length > 0 ? (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-[var(--radius)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] py-1 text-sm shadow-[var(--shadow-md)]">
          {matches.map((a, i) => (
            <li key={a.iata}>
              <button
                type="button"
                // évite que le blur de l'input ferme la liste avant le clic
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(a)}
                className={`flex w-full items-baseline gap-2 px-3 py-1.5 text-left ${
                  i === hi ? "bg-[var(--color-accent-soft)]" : "hover:bg-[var(--color-surface-2)]"
                }`}
              >
                <span className="font-mono font-medium">{a.iata}</span>
                <span className="truncate text-[var(--color-muted)]">
                  {a.city}
                  <span className="text-[var(--color-faint)]"> · {a.country}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
