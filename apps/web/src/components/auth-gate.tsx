"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Spinner } from "./ui";
import { api, ApiError } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { AuthUser } from "@/lib/types";

const PUBLIC_PATHS = new Set(["/login", "/register"]);

interface AuthCtx {
  user: AuthUser | null;
  /** `false` = API sans SESSION_SECRET (mode dev, aucun login requis). */
  authRequired: boolean;
}
const Ctx = createContext<AuthCtx>({ user: null, authRequired: false });

/** Hook d'accès à l'utilisateur courant (dans l'arbre `<AuthGate>`). */
export const useAuth = (): AuthCtx => useContext(Ctx);

export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC_PATHS.has(pathname);

  const me = useQuery({
    queryKey: qk.me,
    queryFn: api.me,
    retry: false,
    staleTime: 60_000,
  });

  const unauthenticated =
    me.data?.user == null &&
    (me.data?.authRequired === true || (me.error instanceof ApiError && me.error.status === 401));

  useEffect(() => {
    if (!me.isLoading && unauthenticated && !isPublic) router.replace("/login");
  }, [me.isLoading, unauthenticated, isPublic, router]);

  if (isPublic) return <>{children}</>;

  if (me.isLoading || unauthenticated) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <Ctx.Provider
      value={{ user: me.data?.user ?? null, authRequired: me.data?.authRequired ?? false }}
    >
      {children}
    </Ctx.Provider>
  );
}
