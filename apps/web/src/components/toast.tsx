"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type Tone = "ok" | "error" | "info";
interface Toast {
  id: number;
  message: string;
  tone: Tone;
}

const ToastCtx = createContext<(message: string, tone?: Tone) => void>(() => undefined);

/** `const toast = useToast(); toast("Recherche créée", "ok")`. */
export const useToast = (): ((message: string, tone?: Tone) => void) => useContext(ToastCtx);

const TONE_CLASS: Record<Tone, string> = {
  ok: "border-[var(--color-ok)] bg-[var(--color-ok-soft)] text-[var(--color-ok)]",
  error: "border-[var(--color-danger)] bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
  info: "border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[var(--color-fg)]",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const push = useCallback((message: string, tone: Tone = "info") => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto rounded-[var(--radius)] border px-3.5 py-2.5 text-sm shadow-[var(--shadow-md)] ${TONE_CLASS[t.tone]}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
