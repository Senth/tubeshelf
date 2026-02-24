"use client";

import { useCallback, useEffect, useState } from "react";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
  oidcProvider: string | null;
  authType: "local" | "oidc";
}

export interface AuthWarnings {
  generatedAuthSecretFallback: boolean;
}

interface UseAuthResult {
  user: AuthUser | null;
  warnings: AuthWarnings;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

export function useAuth(): UseAuthResult {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [warnings, setWarnings] = useState<AuthWarnings>({
    generatedAuthSecretFallback: false,
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", {
        credentials: "include",
        cache: "no-store",
      });

      const data = await res.json().catch(() => null);
      setWarnings({
        generatedAuthSecretFallback:
          !!data?.warnings?.generatedAuthSecretFallback ||
          !!data?.warnings?.insecureDefaultAuthSecret,
      });

      if (!res.ok) {
        setUser(null);
        return;
      }

      setUser(data.user || null);
    } catch {
      setUser(null);
      setWarnings({ generatedAuthSecretFallback: false });
    }
  }, []);

  useEffect(() => {
    let active = true;

    (async () => {
      await refresh();
      if (active) {
        setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      setUser(null);
    }
  }, []);

  return {
    user,
    warnings,
    loading,
    refresh,
    logout,
  };
}
