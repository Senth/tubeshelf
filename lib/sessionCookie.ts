export const SESSION_COOKIE_NAME = "session";
export const SECURE_SESSION_COOKIE_NAME = `__Secure-${SESSION_COOKIE_NAME}`;

// BetterAuth renames the session cookie to `__Secure-session` whenever secure
// cookies are on (i.e. the request arrived over HTTPS), so anything that reads
// or clears the cookie by hand has to handle both names.
export const SESSION_COOKIE_NAMES = [
  SECURE_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
] as const;

export function readSessionCookie(
  get: (name: string) => string | undefined
): string | undefined {
  for (const name of SESSION_COOKIE_NAMES) {
    const value = get(name);
    if (value) return value;
  }
  return undefined;
}
