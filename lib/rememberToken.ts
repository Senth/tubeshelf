const STORAGE_KEY = "tubeshelf.rememberToken";

export function saveRememberToken(token: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, token);
  } catch {
    // Storage unavailable (private mode etc.) — remember-me just won't work.
  }
}

// Reads and clears the stored token; used on logout so a revoked token can't
// linger on the device.
export function takeRememberToken(): string {
  try {
    const token = localStorage.getItem(STORAGE_KEY) || "";
    localStorage.removeItem(STORAGE_KEY);
    return token;
  } catch {
    return "";
  }
}

function readRememberToken(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

// Returns true and leaves the session cookie set when the stored device token
// was accepted; false (with the stored token cleared) when it was rejected.
// Concurrent callers share a single in-flight attempt so two components (root
// layout + useAuth) never consume the same single-use token twice.
let inFlight: Promise<boolean> | null = null;

export function tryRememberLogin(): Promise<boolean> {
  if (!inFlight) {
    inFlight = attemptRememberLogin().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function attemptRememberLogin(): Promise<boolean> {
  const token = readRememberToken();
  if (!token) return false;

  try {
    const res = await fetch("/api/auth/remember", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ rememberToken: token }),
    });

    if (!res.ok) {
      if (res.status === 401) clearRememberToken();
      return false;
    }

    const data = await res.json().catch(() => null);
    if (typeof data?.rememberToken === "string") {
      saveRememberToken(data.rememberToken);
    }
    return !!data?.user;
  } catch {
    return false;
  }
}

function clearRememberToken(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}
