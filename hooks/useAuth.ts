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
  insecureDefaultAuthSecret: boolean;
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
    insecureDefaultAuthSecret: false,
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
        insecureDefaultAuthSecret: !!data?.warnings?.insecureDefaultAuthSecret,
      });

      if (!res.ok) {
        setUser(null);
        return;
      }

      setUser(data.user || null);
    } catch {
      setUser(null);
      setWarnings({ insecureDefaultAuthSecret: false });
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
