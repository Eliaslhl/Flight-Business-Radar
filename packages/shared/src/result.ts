/**
 * Type `Result` — succès/erreur explicite sans exception.
 * Utilisé dans le domaine et les couches provider/normalizer pour rendre
 * les échecs prévisibles et testables (data quality, validation, etc.).
 */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}
export type Result<T, E> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export const isOk = <T, E>(result: Result<T, E>): result is Ok<T> => result.ok;
export const isErr = <T, E>(result: Result<T, E>): result is Err<E> => !result.ok;

/** Applique `fn` à la valeur d'un `Ok`, laisse un `Err` inchangé. */
export const mapResult = <T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> =>
  result.ok ? ok(fn(result.value)) : result;

/** Retourne la valeur d'un `Ok` ou `fallback` pour un `Err`. */
export const unwrapOr = <T, E>(result: Result<T, E>, fallback: T): T =>
  result.ok ? result.value : fallback;

/** Sépare une liste de `Result` en valeurs réussies et erreurs. */
export const partitionResults = <T, E>(
  results: readonly Result<T, E>[],
): { values: T[]; errors: E[] } => {
  const values: T[] = [];
  const errors: E[] = [];
  for (const result of results) {
    if (result.ok) values.push(result.value);
    else errors.push(result.error);
  }
  return { values, errors };
};
