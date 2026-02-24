import { isIP } from "net";

type RateLimitEntry = {
  count: number;
  resetAtMs: number;
};

type RateLimitDecision = {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
};

type RateLimitOptions = {
  bucket: string;
  key: string;
  limit: number;
  windowMs: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __tubeshelfRateLimitStore: Map<string, RateLimitEntry> | undefined;
  // eslint-disable-next-line no-var
  var __tubeshelfRateLimitLastSweepAtMs: number | undefined;
}

function getStore(): Map<string, RateLimitEntry> {
  if (!globalThis.__tubeshelfRateLimitStore) {
    globalThis.__tubeshelfRateLimitStore = new Map();
  }
  return globalThis.__tubeshelfRateLimitStore;
}

function maybeSweepExpired(store: Map<string, RateLimitEntry>, nowMs: number) {
  const lastSweep = globalThis.__tubeshelfRateLimitLastSweepAtMs || 0;
  if (nowMs - lastSweep < 60_000) return;
  globalThis.__tubeshelfRateLimitLastSweepAtMs = nowMs;

  for (const [key, entry] of store.entries()) {
    if (entry.resetAtMs <= nowMs) {
      store.delete(key);
    }
  }
}

function trustProxyHeadersForRateLimit(): boolean {
  const raw = process.env.TRUST_PROXY_HEADERS?.trim().toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes") return true;
  if (raw === "false" || raw === "0" || raw === "no") return false;

  // Keep local/dev setups working without extra config, but require explicit opt-in in prod.
  return process.env.NODE_ENV !== "production";
}

function normalizeIpCandidate(value: string | null): string | null {
  if (!value) return null;
  let candidate = value.trim();
  if (!candidate) return null;

  // Strip a common "[ipv6]:port" wrapper format.
  const bracketMatch = candidate.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketMatch?.[1]) {
    candidate = bracketMatch[1];
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(candidate)) {
    // Strip IPv4 port if present.
    candidate = candidate.replace(/:\d+$/, "");
  }

  // Ignore IPv6 zone suffixes (e.g. fe80::1%lo0).
  candidate = candidate.replace(/%.+$/, "");

  return isIP(candidate) ? candidate : null;
}

export function getClientIp(request: Request): string {
  if (trustProxyHeadersForRateLimit()) {
    const cfConnectingIp = normalizeIpCandidate(
      request.headers.get("cf-connecting-ip")
    );
    if (cfConnectingIp) return cfConnectingIp;

    const xRealIp = normalizeIpCandidate(request.headers.get("x-real-ip"));
    if (xRealIp) return xRealIp;

    const xForwardedFor = request.headers.get("x-forwarded-for");
    if (xForwardedFor) {
      for (const part of xForwardedFor.split(",")) {
        const candidate = normalizeIpCandidate(part);
        if (candidate) return candidate;
      }
    }
  }

  return "unknown";
}

export function checkRateLimit({
  bucket,
  key,
  limit,
  windowMs,
}: RateLimitOptions): RateLimitDecision {
  const nowMs = Date.now();
  const store = getStore();
  maybeSweepExpired(store, nowMs);

  const storeKey = `${bucket}:${key}`;
  const existing = store.get(storeKey);

  if (!existing || existing.resetAtMs <= nowMs) {
    store.set(storeKey, {
      count: 1,
      resetAtMs: nowMs + windowMs,
    });
    return {
      allowed: true,
      retryAfterSeconds: 0,
      remaining: Math.max(0, limit - 1),
    };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((existing.resetAtMs - nowMs) / 1000)
      ),
      remaining: 0,
    };
  }

  existing.count += 1;
  store.set(storeKey, existing);

  return {
    allowed: true,
    retryAfterSeconds: 0,
    remaining: Math.max(0, limit - existing.count),
  };
}
