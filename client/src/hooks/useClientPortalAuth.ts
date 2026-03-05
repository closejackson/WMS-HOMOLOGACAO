/**
 * useClientPortalAuth.ts
 *
 * Hook de autenticação do portal do cliente.
 * Análogo ao useAuth.ts do painel WMS, mas usa o endpoint clientPortal.me.
 *
 * Colocar em: client/src/hooks/useClientPortalAuth.ts
 */

import { trpc } from "@/lib/trpc";
import { useCallback, useEffect } from "react";
import { useLocation } from "wouter";

export function useClientPortalAuth(options?: { redirectIfUnauthenticated?: boolean }) {
  const { redirectIfUnauthenticated = false } = options ?? {};
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const meQuery = trpc.clientPortal.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.clientPortal.logout.useMutation({
    onSuccess: () => {
      utils.clientPortal.me.setData(undefined, null);
      setLocation("/portal/login");
    },
  });

  useEffect(() => {
    if (!redirectIfUnauthenticated) return;
    if (meQuery.isLoading) return;
    if (meQuery.data) return;
    setLocation("/portal/login");
  }, [redirectIfUnauthenticated, meQuery.isLoading, meQuery.data, setLocation]);

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
  }, [logoutMutation]);

  return {
    user: meQuery.data ?? null,
    loading: meQuery.isLoading,
    isAuthenticated: Boolean(meQuery.data),
    logout,
  };
}
