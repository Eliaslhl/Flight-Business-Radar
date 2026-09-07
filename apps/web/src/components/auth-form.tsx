"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Field, Input } from "./ui";
import { api, ApiError } from "@/lib/api";
import { qk } from "@/lib/query-keys";

const MESSAGES: Record<string, string> = {
  EMAIL_TAKEN: "Cet e-mail a déjà un compte.",
  INVALID_CREDENTIALS: "E-mail ou mot de passe incorrect.",
  VALIDATION_FAILED: "Vérifie l'e-mail et le mot de passe (8 caractères minimum).",
  AUTH_DISABLED: "L'authentification n'est pas activée sur cette API.",
};

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = useMutation({
    mutationFn: () =>
      mode === "login" ? api.login(email.trim(), password) : api.register(email.trim(), password),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.me });
      router.replace("/dashboard");
    },
  });

  const errCode =
    submit.error instanceof ApiError &&
    submit.error.detail &&
    typeof submit.error.detail === "object"
      ? (submit.error.detail as { error?: string }).error
      : undefined;

  return (
    <div className="mx-auto mt-16 max-w-sm">
      <div className="mb-6 flex items-center justify-center gap-2 text-lg font-semibold tracking-tight">
        <span aria-hidden>✈️</span> Flight Business Radar
      </div>
      <Card>
        <h1 className="mb-4 text-base font-semibold">
          {mode === "login" ? "Connexion" : "Créer un compte"}
        </h1>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit.mutate();
          }}
        >
          <Field label="E-mail">
            <Input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Mot de passe">
            <Input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Button type="submit" variant="primary" className="w-full" disabled={submit.isPending}>
            {submit.isPending ? "…" : mode === "login" ? "Se connecter" : "Créer le compte"}
          </Button>
          {submit.isError ? (
            <p className="text-sm text-[var(--color-danger)]">
              {(errCode && MESSAGES[errCode]) ?? "Échec — réessaie dans un instant."}
            </p>
          ) : null}
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-[var(--color-muted)]">
        {mode === "login" ? (
          <>
            Pas de compte ?{" "}
            <Link href="/register" className="text-[var(--color-accent)] hover:underline">
              Créer un compte
            </Link>
          </>
        ) : (
          <>
            Déjà inscrit ?{" "}
            <Link href="/login" className="text-[var(--color-accent)] hover:underline">
              Se connecter
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
