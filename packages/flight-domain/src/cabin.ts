import { z } from "zod";

/** Classes de cabine gérées. Le produit cible `BUSINESS` au départ de CDG. */
export const CABIN_CLASSES = ["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"] as const;

export const cabinClassSchema = z.enum(CABIN_CLASSES);
export type CabinClass = z.infer<typeof cabinClassSchema>;

export const isCabinClass = (value: unknown): value is CabinClass =>
  typeof value === "string" && (CABIN_CLASSES as readonly string[]).includes(value);

/** Disponibilité déclarée par le provider pour une offre. */
export const AVAILABILITIES = ["AVAILABLE", "LOW", "WAITLIST", "UNKNOWN"] as const;
export const availabilitySchema = z.enum(AVAILABILITIES);
export type Availability = z.infer<typeof availabilitySchema>;
