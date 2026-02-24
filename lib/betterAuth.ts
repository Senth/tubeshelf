import crypto from "crypto";
import bcrypt from "bcryptjs";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db";
import { genericOAuth, type GenericOAuthConfig } from "better-auth/plugins/generic-oauth";
import { decodeJwt } from "jose";
import { getDb } from "@/lib/db";
import { shouldUseSecureCookies } from "@/lib/cookieSecurity";
import { getOIDCProvider, getOIDCProviders, type OIDCProvider } from "@/lib/oidc";

const BCRYPT_ROUNDS = 12;
const LEGACY_SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60;
const BETTER_AUTH_MIGRATION_WARNINGS_TO_SUPPRESS = [
  "Field created_at in table users has a different type in the database. Expected date but got TEXT.",
  "Field updated_at in table users has a different type in the database. Expected date but got TEXT.",
  "Field last_login_at in table users has a different type in the database. Expected date but got TEXT.",
];

type BetterAuthSession = Awaited<ReturnType<ReturnType<typeof createAuth>["api"]["getSession"]>>;

declare global {
  // eslint-disable-next-line no-var
  var __tubeshelfBetterAuthReadyPromise: Promise<void> | undefined;
}

function firstHeaderValue(value: string | null): string {
  if (!value) return "";
  return value.split(",")[0]?.trim() || "";
}

function getRequestBaseUrl(request?: Request): string | undefined {
  if (!request) {
    return process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL;
  }

  const url = new URL(request.url);
  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  const forwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto"));

  if (forwardedHost) {
    const proto = forwardedProto || url.protocol.replace(":", "");
    return `${proto}://${forwardedHost}`;
  }

  return `${url.protocol}//${url.host}`;
}

function parseScopes(scopes?: string | null): string[] | undefined {
  if (!scopes) return undefined;
  const parsed = scopes
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parsed.length ? parsed : undefined;
}

function computeAdminFromClaims(
  provider: Pick<OIDCProvider, "groupClaimName" | "adminGroupValue">,
  claims: Record<string, unknown>
): boolean | null {
  if (!provider.groupClaimName || !provider.adminGroupValue) return null;

  const raw = claims[provider.groupClaimName];
  if (raw == null) return false;

  const values = Array.isArray(raw) ? raw : [raw];
  return values.map(String).includes(provider.adminGroupValue);
}

function redirectUriForProvider(baseUrl: string, provider: OIDCProvider): string {
  return provider.redirectUri || `${baseUrl}/api/auth/oidc/callback`;
}

function toGenericOAuthConfig(baseUrl: string, provider: OIDCProvider): GenericOAuthConfig {
  return {
    providerId: provider.id,
    discoveryUrl:
      provider.discoveryUrl || `${provider.issuer}/.well-known/openid-configuration`,
    issuer: provider.issuer,
    clientId: provider.clientId,
    clientSecret: provider.clientSecret,
    scopes: parseScopes(provider.scopes) || ["openid", "profile", "email", "groups"],
    redirectURI: redirectUriForProvider(baseUrl, provider),
    // Keep sign-up behavior compatible with the current implementation (OIDC auto-provisions users).
    disableImplicitSignUp: false,
    disableSignUp: false,
    mapProfileToUser: async (profile) => {
      const oidcSubject =
        typeof profile.sub === "string"
          ? profile.sub
          : typeof profile.id === "string"
            ? profile.id
            : undefined;
      const isAdmin = computeAdminFromClaims(provider, profile as Record<string, unknown>);

      return {
        name:
          (typeof profile.name === "string" && profile.name) ||
          (typeof profile.preferred_username === "string" && profile.preferred_username) ||
          undefined,
        oidcProvider: provider.id,
        oidcSubject,
        ...(isAdmin === null ? {} : { isAdmin }),
      };
    },
  };
}

function syncAccountBackToLegacyFields(account: Record<string, any>) {
  const db = getDb();
  const providerId = typeof account.providerId === "string" ? account.providerId : "";
  const userId = typeof account.userId === "string" ? account.userId : "";
  if (!providerId || !userId) return;

  if (providerId === "credential") {
    if (typeof account.password === "string") {
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
        account.password,
        userId
      );
    }
    return;
  }

  let isAdminUpdate: boolean | null = null;
  if (typeof account.idToken === "string" && account.idToken) {
    try {
      const provider = getOIDCProvider(providerId);
      if (provider) {
        const claims = decodeJwt(account.idToken) as Record<string, unknown>;
        isAdminUpdate = computeAdminFromClaims(provider, claims);
      }
    } catch {
      // Ignore token decode failures and keep existing admin flag.
    }
  }

  if (isAdminUpdate === null) {
    db.prepare(
      "UPDATE users SET oidc_provider = COALESCE(oidc_provider, ?), oidc_subject = COALESCE(oidc_subject, ?) WHERE id = ?"
    ).run(providerId, account.accountId || null, userId);
    return;
  }

  db.prepare(
    "UPDATE users SET oidc_provider = ?, oidc_subject = ?, is_admin = ? WHERE id = ?"
  ).run(providerId, account.accountId || null, isAdminUpdate ? 1 : 0, userId);
}

function ensureUserColumns() {
  const db = getDb();
  const columns = db
    .prepare("PRAGMA table_info(users)")
    .all() as Array<{ name: string }>;
  const names = new Set(columns.map((c) => c.name));

  if (!names.has("updated_at")) {
    db.exec("ALTER TABLE users ADD COLUMN updated_at TEXT");
  }
  if (!names.has("email_verified")) {
    db.exec("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1");
  }
  if (!names.has("image")) {
    db.exec("ALTER TABLE users ADD COLUMN image TEXT");
  }

  db.exec(`
    UPDATE users
    SET
      updated_at = COALESCE(updated_at, created_at),
      email_verified = COALESCE(email_verified, 1)
    WHERE updated_at IS NULL OR email_verified IS NULL
  `);
}

function ensureLegacyAccountsBackfilled() {
  const db = getDb();

  const hasAuthAccounts = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='auth_accounts'"
    )
    .get() as { name: string } | undefined;

  if (!hasAuthAccounts) return;

  const users = db
    .prepare(
      `SELECT id, password_hash as passwordHash, oidc_provider as oidcProvider, oidc_subject as oidcSubject, created_at as createdAt
       FROM users`
    )
    .all() as Array<{
      id: string;
      passwordHash: string | null;
      oidcProvider: string | null;
      oidcSubject: string | null;
      createdAt: string | null;
    }>;

  const insertCredential = db.prepare(
    `INSERT INTO auth_accounts (
      id, created_at, updated_at, provider_id, account_id, user_id, password
    ) VALUES (?, ?, ?, 'credential', ?, ?, ?)`
  );
  const insertOidc = db.prepare(
    `INSERT INTO auth_accounts (
      id, created_at, updated_at, provider_id, account_id, user_id
    ) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const hasCredential = db.prepare(
    `SELECT 1 FROM auth_accounts WHERE user_id = ? AND provider_id = 'credential' LIMIT 1`
  );
  const hasProviderAccount = db.prepare(
    `SELECT 1 FROM auth_accounts WHERE user_id = ? AND provider_id = ? AND account_id = ? LIMIT 1`
  );

  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    for (const user of users) {
      const createdAt = user.createdAt || now;

      if (user.passwordHash && !hasCredential.get(user.id)) {
        insertCredential.run(
          crypto.randomBytes(16).toString("hex"),
          createdAt,
          createdAt,
          user.id,
          user.id,
          user.passwordHash
        );
      }

      if (user.oidcProvider && user.oidcSubject) {
        if (!hasProviderAccount.get(user.id, user.oidcProvider, user.oidcSubject)) {
          insertOidc.run(
            crypto.randomBytes(16).toString("hex"),
            createdAt,
            createdAt,
            user.oidcProvider,
            user.oidcSubject,
            user.id
          );
        }
      }
    }
  });

  tx();
}

async function initBetterAuthSchema() {
  ensureUserColumns();

  const auth = createAuth();
  const { runMigrations } = await getMigrations(auth.options);
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    const first = args[0];
    if (
      typeof first === "string" &&
      BETTER_AUTH_MIGRATION_WARNINGS_TO_SUPPRESS.some((message) =>
        first.includes(message)
      )
    ) {
      return;
    }
    originalWarn(...args);
  };
  try {
    await runMigrations();
  } finally {
    console.warn = originalWarn;
  }

  ensureLegacyAccountsBackfilled();
}

export async function ensureBetterAuthReady() {
  if (!globalThis.__tubeshelfBetterAuthReadyPromise) {
    globalThis.__tubeshelfBetterAuthReadyPromise = initBetterAuthSchema().catch(
      (error) => {
        globalThis.__tubeshelfBetterAuthReadyPromise = undefined;
        throw error;
      }
    );
  }

  await globalThis.__tubeshelfBetterAuthReadyPromise;
}

function createAuth(request?: Request) {
  const baseUrl = getRequestBaseUrl(request) || "http://localhost:3000";
  const oidcConfigs = getOIDCProviders().map((provider) =>
    toGenericOAuthConfig(baseUrl, provider)
  );

  return betterAuth({
    appName: "TubeShelf",
    baseURL: baseUrl,
    basePath: "/api/auth",
    secret:
      process.env.BETTER_AUTH_SECRET ||
      process.env.AUTH_SECRET ||
      process.env.SECRET_KEY ||
      "tubeshelf-default-key-change-me",
    trustedProxyHeaders: true,
    database: getDb(),
    advanced: {
      useSecureCookies: shouldUseSecureCookies(request),
      cookies: {
        session_token: {
          name: "session",
          attributes: {
            maxAge: LEGACY_SESSION_DURATION_SECONDS,
            sameSite: "lax",
            path: "/",
            httpOnly: true,
          },
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      password: {
        hash: (password) => bcrypt.hash(password, BCRYPT_ROUNDS),
        verify: ({ password, hash }) => bcrypt.compare(password, hash),
      },
    },
    user: {
      modelName: "users",
      fields: {
        createdAt: "created_at",
        updatedAt: "updated_at",
        emailVerified: "email_verified",
      },
      additionalFields: {
        isAdmin: {
          type: "boolean",
          fieldName: "is_admin",
          defaultValue: false,
        },
        isDefaultAdmin: {
          type: "boolean",
          fieldName: "is_default_admin",
          defaultValue: false,
        },
        oidcProvider: {
          type: "string",
          fieldName: "oidc_provider",
          required: false,
        },
        oidcSubject: {
          type: "string",
          fieldName: "oidc_subject",
          required: false,
        },
        lastLoginAt: {
          type: "date",
          fieldName: "last_login_at",
          required: false,
          input: false,
        },
      },
    },
    session: {
      modelName: "auth_sessions",
      fields: {
        createdAt: "created_at",
        updatedAt: "updated_at",
        userId: "user_id",
        expiresAt: "expires_at",
        ipAddress: "ip_address",
        userAgent: "user_agent",
      },
      expiresIn: LEGACY_SESSION_DURATION_SECONDS,
    },
    account: {
      modelName: "auth_accounts",
      fields: {
        createdAt: "created_at",
        updatedAt: "updated_at",
        providerId: "provider_id",
        accountId: "account_id",
        userId: "user_id",
        accessToken: "access_token",
        refreshToken: "refresh_token",
        idToken: "id_token",
        accessTokenExpiresAt: "access_token_expires_at",
        refreshTokenExpiresAt: "refresh_token_expires_at",
      },
    },
    verification: {
      modelName: "auth_verifications",
      fields: {
        createdAt: "created_at",
        updatedAt: "updated_at",
        expiresAt: "expires_at",
      },
    },
    plugins: oidcConfigs.length ? [genericOAuth({ config: oidcConfigs })] : [],
    databaseHooks: {
      session: {
        create: {
          after: async (session) => {
            getDb()
              .prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?")
              .run(session.userId);
          },
        },
      },
      account: {
        create: {
          after: async (account) => {
            syncAccountBackToLegacyFields(account as Record<string, any>);
          },
        },
        update: {
          after: async (account) => {
            syncAccountBackToLegacyFields(account as Record<string, any>);
          },
        },
      },
    },
  });
}

export async function getAuth(request?: Request) {
  await ensureBetterAuthReady();
  return createAuth(request);
}

export type AppAuthUser = {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
  isDefaultAdmin: boolean;
  oidcProvider: string | null;
  authType: "local" | "oidc";
};

export function mapBetterAuthUser(user: Record<string, any> | null | undefined): AppAuthUser | null {
  if (!user) return null;

  const oidcProvider = typeof user.oidcProvider === "string" ? user.oidcProvider : null;

  return {
    id: String(user.id),
    email: String(user.email),
    name: typeof user.name === "string" ? user.name : null,
    isAdmin: !!user.isAdmin,
    isDefaultAdmin: !!user.isDefaultAdmin,
    oidcProvider,
    authType: oidcProvider ? "oidc" : "local",
  };
}

export async function getSessionFromRequest(request: Request) {
  const auth = await getAuth(request);
  return auth.api.getSession({ headers: request.headers });
}

export async function getSessionFromHeaderBag(headerBag: Headers) {
  const auth = await getAuth();
  return auth.api.getSession({ headers: headerBag });
}

export function appendSetCookieHeaders(target: Headers, source?: Headers | null) {
  if (!source) return;
  source.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      target.append(key, value);
      return;
    }
    target.set(key, value);
  });
}

export function getBetterAuthProviderCookieName() {
  return "oidc_provider";
}
