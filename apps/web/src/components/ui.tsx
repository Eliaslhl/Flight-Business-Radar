import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";

const cx = (...parts: (string | false | null | undefined)[]): string =>
  parts.filter(Boolean).join(" ");

// ── Button ──────────────────────────────────────────────────────────────
type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const BUTTON_VARIANTS: Record<Variant, string> = {
  primary:
    "bg-[var(--color-accent)] text-[var(--color-on-accent)] hover:bg-[var(--color-accent-hover)] shadow-[var(--shadow-sm)]",
  secondary:
    "bg-[var(--color-surface)] border border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)]",
  ghost: "hover:bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:text-[var(--color-fg)]",
  danger:
    "bg-[var(--color-surface)] border border-[var(--color-border-strong)] text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]",
};
const BUTTON_SIZES: Record<Size, string> = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-3.5 py-2 text-sm",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cx(
        "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius)] font-medium transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        BUTTON_SIZES[size],
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

// ── Card ────────────────────────────────────────────────────────────────
export function Card({
  className,
  children,
  interactive,
  ...props
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cx(
        "rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-sm)]",
        interactive &&
          "transition hover:border-[var(--color-border-strong)] hover:shadow-[var(--shadow-md)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
        {children}
      </h2>
      {aside ? <div className="text-xs text-[var(--color-muted)]">{aside}</div> : null}
    </div>
  );
}

// ── Page header ─────────────────────────────────────────────────────────
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-[var(--color-muted)]">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

// ── Stat tile ──────────────────────────────────────────────────────────
export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: string | undefined;
  tone?: "ok" | "warn" | undefined;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-sm)]">
      <div className="text-xs text-[var(--color-muted)]">{label}</div>
      <div
        className={cx(
          "tnum mt-1 text-xl font-semibold",
          tone === "ok" && "text-[var(--color-ok)]",
          tone === "warn" && "text-[var(--color-warn)]",
        )}
      >
        {value}
      </div>
      {hint ? <div className="mt-0.5 text-xs text-[var(--color-warn)]">{hint}</div> : null}
    </div>
  );
}

// ── Badge ──────────────────────────────────────────────────────────────
type Tone = "neutral" | "accent" | "ok" | "warn" | "danger";
const BADGE_TONES: Record<Tone, string> = {
  neutral:
    "bg-[var(--color-surface-2)] text-[var(--color-muted)] border border-[var(--color-border)]",
  accent: "bg-[var(--color-accent-soft)] text-[var(--color-accent)]",
  ok: "bg-[var(--color-ok-soft)] text-[var(--color-ok)]",
  warn: "bg-[var(--color-warn-soft)] text-[var(--color-warn)]",
  danger: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        BADGE_TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

// ── Form controls ──────────────────────────────────────────────────────
const CONTROL =
  "w-full rounded-[var(--radius)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-fg)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)]";

/** Types de champ où un curseur « main » est plus juste qu'un curseur texte. */
const POINTER_INPUT_TYPES = new Set([
  "date",
  "datetime-local",
  "time",
  "week",
  "month",
  "checkbox",
  "radio",
  "range",
  "color",
  "file",
]);

export function Input({ className, type, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={cx(CONTROL, type && POINTER_INPUT_TYPES.has(type) && "cursor-pointer", className)}
      {...props}
    />
  );
}

export function Select({
  className,
  size = "md",
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & { size?: "sm" | "md" }) {
  return (
    <select
      className={cx(
        "cursor-pointer rounded-[var(--radius)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[var(--color-fg)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)]",
        size === "sm" ? "px-2 py-1 text-xs" : "w-full px-3 py-2 text-sm",
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

// ── States ─────────────────────────────────────────────────────────────
export function Spinner() {
  return (
    <span
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-border-strong)] border-t-[var(--color-accent)]"
      aria-label="chargement"
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cx(
        "animate-pulse rounded-[var(--radius)] bg-[var(--color-surface-2)]",
        className ?? "h-4 w-full",
      )}
    />
  );
}

export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-[var(--radius)] border border-dashed border-[var(--color-border-strong)] p-8 text-center">
      <div className="text-sm text-[var(--color-muted)]">{children}</div>
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "Erreur inconnue";
  return (
    <div className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-danger-soft)] p-4 text-sm text-[var(--color-danger)]">
      {message} — l&apos;API est-elle démarrée ? (<code>pnpm --filter @fbr/api dev</code>)
    </div>
  );
}
