"use client";

import { useEffect } from "react";
import { tryRememberLogin } from "@/lib/rememberToken";

// Restores the session from the remembered device token when the browser lost
// the session cookie (e.g. Android PWAs clear their cookie jar when the app is
// closed). Rendered in the root layout because a cookie-less visitor lands on
// the welcome rewrite of "/", where the app page and useAuth never mount.
export function RememberSession() {
  useEffect(() => {
    (async () => {
      try {
        const me = await fetch("/api/auth/me", {
          credentials: "include",
          cache: "no-store",
        });
        if (me.ok) return;
        if (!(await tryRememberLogin())) return;
        window.location.replace("/");
      } catch {
        // Server unreachable — leave the page as is.
      }
    })();
  }, []);

  return null;
}
