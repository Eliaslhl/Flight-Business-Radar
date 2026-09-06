/**
 * Correspondance nom de compagnie → code IATA (2 caractères). Les scrapers
 * (Google Flights) renvoient souvent le **nom** ; le modèle interne exige le code.
 * Couverture ciblée sur les compagnies Business au départ de CDG.
 */
const NAME_TO_IATA: Record<string, string> = {
  "air france": "AF",
  klm: "KL",
  "klm royal dutch airlines": "KL",
  lufthansa: "LH",
  "lufthansa german airlines": "LH",
  swiss: "LX",
  "swiss international air lines": "LX",
  "austrian airlines": "OS",
  "brussels airlines": "SN",
  "british airways": "BA",
  iberia: "IB",
  "aer lingus": "EI",
  finnair: "AY",
  sas: "SK",
  "scandinavian airlines": "SK",
  "tap air portugal": "TP",
  "tap portugal": "TP",
  "turkish airlines": "TK",
  ita: "AZ",
  "ita airways": "AZ",
  "qatar airways": "QR",
  emirates: "EK",
  "etihad airways": "EY",
  "singapore airlines": "SQ",
  "cathay pacific": "CX",
  "korean air": "KE",
  "asiana airlines": "OZ",
  "eva air": "BR",
  ana: "NH",
  "all nippon airways": "NH",
  "japan airlines": "JL",
  jal: "JL",
  "thai airways": "TG",
  "vietnam airlines": "VN",
  "malaysia airlines": "MH",
  "garuda indonesia": "GA",
  "air india": "AI",
  "china eastern": "MU",
  "china eastern airlines": "MU",
  "china southern": "CZ",
  "china southern airlines": "CZ",
  "air china": "CA",
  "hainan airlines": "HU",
  delta: "DL",
  "delta air lines": "DL",
  united: "UA",
  "united airlines": "UA",
  "american airlines": "AA",
  "air canada": "AC",
  latam: "LA",
  "latam airlines": "LA",
  "ethiopian airlines": "ET",
  "kenya airways": "KQ",
  saudia: "SV",
  "royal air maroc": "AT",
  egyptair: "MS",
};

const IATA_RE = /^[A-Z0-9]{2}$/;

/**
 * Résout un code IATA à partir d'un code ou d'un nom. Repli : deux premiers
 * caractères alphanumériques, sinon `"XX"` (compagnie inconnue).
 */
export const resolveAirlineCode = (nameOrCode: string | null | undefined): string => {
  if (!nameOrCode) return "XX";
  const trimmed = nameOrCode.trim();
  if (IATA_RE.test(trimmed)) return trimmed.toUpperCase();

  const mapped = NAME_TO_IATA[trimmed.toLowerCase()];
  if (mapped) return mapped;

  const cleaned = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return cleaned.length >= 2 ? cleaned.slice(0, 2) : "XX";
};
