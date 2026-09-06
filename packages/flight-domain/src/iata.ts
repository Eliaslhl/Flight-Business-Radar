import { z } from "zod";

/**
 * Code IATA : 3 lettres majuscules. Sert aussi bien aux aéroports (`CDG`)
 * qu'aux compagnies (`AF`) — non, les compagnies font 2 caractères : on
 * distingue donc explicitement.
 */
export type IataAirport = string & { readonly __brand: "IataAirport" };
export type IataAirline = string & { readonly __brand: "IataAirline" };

const AIRPORT_RE = /^[A-Z]{3}$/;
const AIRLINE_RE = /^[A-Z0-9]{2}$/;

export const isIataAirport = (value: string): value is IataAirport => AIRPORT_RE.test(value);
export const isIataAirline = (value: string): value is IataAirline => AIRLINE_RE.test(value);

export const iataAirport = (value: string): IataAirport => {
  const upper = value.toUpperCase();
  if (!isIataAirport(upper)) {
    throw new Error(`Code aéroport IATA invalide: ${JSON.stringify(value)} (attendu 3 lettres)`);
  }
  return upper;
};

export const iataAirline = (value: string): IataAirline => {
  const upper = value.toUpperCase();
  if (!isIataAirline(upper)) {
    throw new Error(
      `Code compagnie IATA invalide: ${JSON.stringify(value)} (attendu 2 caractères)`,
    );
  }
  return upper;
};

const normalizeCode = (v: unknown): unknown => (typeof v === "string" ? v.trim().toUpperCase() : v);

export const airportCodeSchema = z.preprocess(
  normalizeCode,
  z
    .string()
    .regex(AIRPORT_RE, "code aéroport IATA (3 lettres)")
    .transform((v) => v as IataAirport),
);

export const airlineCodeSchema = z.preprocess(
  normalizeCode,
  z
    .string()
    .regex(AIRLINE_RE, "code compagnie IATA (2 caractères)")
    .transform((v) => v as IataAirline),
);
