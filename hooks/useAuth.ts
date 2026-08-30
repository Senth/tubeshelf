"use client";

import { useCallback, useEffect, useState } from "react";
import {
  takeRememberToken,
  tryRememberLogin,
} from "@/lib/rememberToken";

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
    const fetchMe = () =>
      fetch("/api/auth/me", {
        credentials: "include",
        cache: "no-store",
      });

    try {
      let res = await fetchMe();

      // Session cookie gone (e.g. Android PWA cleared it on app close)?
      // Restore the session from the remembered device token.
      if (res.status === 401 && (await tryRememberLogin())) {
        res = await fetchMe();
      }

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
    const rememberToken = takeRememberToken();
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rememberToken }),
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
