import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";

const cx = (...parts: (string | false | null | undefined)[]): string =>
  parts.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_VARIANTS: Record<Variant, string> = {
  primary: "bg-[var(--color-accent)] text-white hover:opacity-90",
  secondary: "bg-white border border-[var(--color-border)] hover:bg-[var(--color-bg)]",
  ghost: "hover:bg-[var(--color-bg)]",
  danger: "bg-white border border-[var(--color-border)] text-[var(--color-danger)] hover:bg-red-50",
};

export function Button({
  variant = "secondary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        "rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wide">
      {children}
    </h2>
  );
}

type Tone = "neutral" | "accent" | "ok" | "warn" | "danger";
const BADGE_TONES: Record<Tone, string> = {
  neutral: "bg-[var(--color-bg)] text-[var(--color-muted)]",
  accent: "bg-[var(--color-accent-soft)] text-[var(--color-accent)]",
  ok: "bg-green-50 text-[var(--color-ok)]",
  warn: "bg-orange-50 text-[var(--color-warn)]",
  danger: "bg-red-50 text-[var(--color-danger)]",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        BADGE_TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx(
        "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]",
        className,
      )}
      {...props}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-[var(--color-muted)]">{label}</span>
      {children}
    </label>
  );
}

export function Spinner() {
  return (
    <span
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-accent)]"
      aria-label="chargement"
    />
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-muted)]">
      {children}
    </div>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "Erreur inconnue";
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-red-50 p-4 text-sm text-[var(--color-danger)]">
      {message} — l'API est-elle démarrée ? (<code>pnpm --filter @fbr/api dev</code>)
    </div>
  );
}
