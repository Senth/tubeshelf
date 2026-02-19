import { warn } from "@/lib/logger";

type CookieSecureMode = "auto" | "always" | "never";

let warnedInsecureProduction = false;

function firstHeaderValue(value: string | null): string {
  if (!value) return "";
  return value.split(",")[0]?.trim().toLowerCase() || "";
}

function normalizeToken(value: string): string {
  return value.trim().replace(/^"+|"+$/g, "").toLowerCase();
}

function parseForwardedProto(forwardedHeader: string | null): string {
  const firstPart = firstHeaderValue(forwardedHeader);
  if (!firstPart) return "";

  const segments = firstPart.split(";");
  for (const segment of segments) {
    const [rawKey, rawValue] = segment.split("=", 2);
    if (!rawKey || !rawValue) continue;
    if (rawKey.trim().toLowerCase() !== "proto") continue;
    return normalizeToken(rawValue);
  }

  return "";
}

function parseBooleanLike(raw: string): boolean | null {
  const value = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on", "always"].includes(value)) return true;
  if (["0", "false", "no", "off", "never"].includes(value)) return false;
  return null;
}

function readCookieSecureMode(): CookieSecureMode {
  const modeRaw = process.env.COOKIE_SECURE_MODE?.trim().toLowerCase();
  if (modeRaw === "always") return "always";
  if (modeRaw === "never") return "never";
  if (modeRaw === "auto" || modeRaw === "") return "auto";

  const authSecureCookiesRaw = process.env.AUTH_SECURE_COOKIES;
  if (typeof authSecureCookiesRaw === "string") {
    const parsed = parseBooleanLike(authSecureCookiesRaw);
    if (parsed === true) return "always";
    if (parsed === false) return "never";
  }

  const secureCookiesRaw = process.env.SECURE_COOKIES;
  if (typeof secureCookiesRaw === "string") {
    const parsed = parseBooleanLike(secureCookiesRaw);
    if (parsed === true) return "always";
    if (parsed === false) return "never";
  }

  return "auto";
}

function requestUsesHttps(request?: Request): boolean {
  if (!request) return false;

  const forwardedHeaderProto = parseForwardedProto(request.headers.get("forwarded"));
  if (forwardedHeaderProto === "https") return true;
  if (forwardedHeaderProto === "http") return false;

  const forwardedProto = normalizeToken(
    firstHeaderValue(request.headers.get("x-forwarded-proto"))
  );
  if (forwardedProto.includes("https")) return true;
  if (forwardedProto.includes("http")) return false;

  const forwardedSsl = normalizeToken(
    firstHeaderValue(request.headers.get("x-forwarded-ssl"))
  );
  if (forwardedSsl === "on") return true;

  const frontEndHttps = normalizeToken(
    firstHeaderValue(request.headers.get("front-end-https"))
  );
  if (frontEndHttps === "on") return true;

  const forwardedPort = normalizeToken(
    firstHeaderValue(request.headers.get("x-forwarded-port"))
  );
  if (forwardedPort === "443") return true;

  try {
    const protocol = new URL(request.url).protocol;
    return protocol === "https:";
  } catch {
    return false;
  }
}

export function shouldUseSecureCookies(request?: Request): boolean {
  const mode = readCookieSecureMode();

  if (mode === "always") return true;
  if (mode === "never") {
    if (process.env.NODE_ENV === "production" && !warnedInsecureProduction) {
      warnedInsecureProduction = true;
      warn(
        "[Auth] Insecure cookies enabled via COOKIE_SECURE_MODE/AUTH_SECURE_COOKIES/SECURE_COOKIES. Use only behind trusted local networks."
      );
    }
    return false;
  }

  return requestUsesHttps(request);
}
