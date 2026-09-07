/**
 * Emoji drapeau à partir d'un code ISO 3166-1 alpha-2 (paire d'indicateurs
 * régionaux Unicode). Retourne `""` si le code est invalide/absent — l'appelant
 * peut alors ne rien afficher.
 */
export function flagEmoji(iso2: string | null | undefined): string {
  const c = (iso2 ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "";
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}
