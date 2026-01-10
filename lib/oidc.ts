import { getDb } from "./db";
import * as jose from "jose";
import { createUser, getUserByOIDC, User } from "./auth";

export interface OIDCProvider {
  id: string;
  name: string;
  issuer: string;
  baseUrl?: string;
  discoveryUrl?: string;
  domain?: string;
  redirectUri?: string;
  clientId: string;
  clientSecret: string;
  scopes?: string;
  autoProvision?: boolean;
  groupClaimName?: string;
  adminGroupValue?: string;
  enabled: boolean;
  createdAt: string;
}

export interface OIDCConfig {
  enabled: boolean;
  allowRegistration: boolean;
  providers: OIDCProvider[];
}

// OIDC Provider management
export function getOIDCProviders(): OIDCProvider[] {
  const db = getDb();
  const providers = db
    .prepare(
      `SELECT 
        id, 
        name, 
        issuer,
        base_url as baseUrl,
        discovery_url as discoveryUrl,
        domain,
        redirect_uri as redirectUri,
        client_id as clientId, 
        client_secret as clientSecret,
        scopes,
        auto_provision as autoProvision,
        group_claim_name as groupClaimName,
        admin_group_value as adminGroupValue,
        enabled, 
        created_at as createdAt 
      FROM oidc_providers 
      WHERE enabled = 1`
    )
    .all() as any[];

  return providers.map((p) => ({
    ...p,
    autoProvision: p.autoProvision === 1,
  })) as OIDCProvider[];
}

// Get providers for public display (no secrets)
export function getPublicOIDCProviders(): Array<{ id: string; name: string }> {
  const db = getDb();
  return db
    .prepare(`SELECT id, name FROM oidc_providers WHERE enabled = 1`)
    .all() as Array<{ id: string; name: string }>;
}

export function getOIDCProvider(id: string): OIDCProvider | null {
  const db = getDb();
  const provider = db
    .prepare(
      `SELECT 
        id, 
        name, 
        issuer,
        base_url as baseUrl,
        discovery_url as discoveryUrl,
        domain,
        redirect_uri as redirectUri,
        client_id as clientId, 
        client_secret as clientSecret,
        scopes,
        auto_provision as autoProvision,
        group_claim_name as groupClaimName,
        admin_group_value as adminGroupValue,
        enabled, 
        created_at as createdAt 
      FROM oidc_providers 
      WHERE id = ?`
    )
    .get(id) as any | undefined;

  if (!provider) return null;

  return {
    ...provider,
    autoProvision: provider.autoProvision === 1,
  };
}

export function createOIDCProvider(data: {
  id: string;
  name: string;
  issuer: string;
  baseUrl?: string;
  discoveryUrl?: string;
  domain?: string;
  redirectUri?: string;
  clientId: string;
  clientSecret: string;
  scopes?: string;
  autoProvision?: boolean;
  groupClaimName?: string;
  adminGroupValue?: string;
}): OIDCProvider {
  const db = getDb();

  db.prepare(
    `INSERT INTO oidc_providers (
      id, name, issuer, base_url, discovery_url, domain, redirect_uri,
      client_id, client_secret, scopes, auto_provision,
      group_claim_name, admin_group_value, enabled
    ) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    data.id,
    data.name,
    data.issuer,
    data.baseUrl || null,
    data.discoveryUrl || null,
    data.domain || null,
    data.redirectUri || null,
    data.clientId,
    data.clientSecret,
    data.scopes || "openid profile email groups",
    data.autoProvision ? 1 : 0,
    data.groupClaimName || null,
    data.adminGroupValue || null,
    1 // Enable by default
  );

  return getOIDCProvider(data.id)!;
}

export function updateOIDCProvider(
  id: string,
  data: Partial<Omit<OIDCProvider, "id" | "createdAt">>
): void {
  const db = getDb();
  const updates: string[] = [];
  const values: any[] = [];

  if (data.name !== undefined) {
    updates.push("name = ?");
    values.push(data.name);
  }
  if (data.issuer !== undefined) {
    updates.push("issuer = ?");
    values.push(data.issuer);
  }
  if (data.baseUrl !== undefined) {
    updates.push("base_url = ?");
    values.push(data.baseUrl || null);
  }
  if (data.discoveryUrl !== undefined) {
    updates.push("discovery_url = ?");
    values.push(data.discoveryUrl || null);
  }
  if (data.domain !== undefined) {
    updates.push("domain = ?");
    values.push(data.domain || null);
  }
  if (data.redirectUri !== undefined) {
    updates.push("redirect_uri = ?");
    values.push(data.redirectUri || null);
  }
  if (data.clientId !== undefined) {
    updates.push("client_id = ?");
    values.push(data.clientId);
  }
  if (data.clientSecret !== undefined) {
    updates.push("client_secret = ?");
    values.push(data.clientSecret);
  }
  if (data.scopes !== undefined) {
    updates.push("scopes = ?");
    values.push(data.scopes);
  }
  if (data.autoProvision !== undefined) {
    updates.push("auto_provision = ?");
    values.push(data.autoProvision ? 1 : 0);
  }
  if (data.groupClaimName !== undefined) {
    updates.push("group_claim_name = ?");
    values.push(data.groupClaimName || null);
  }
  if (data.adminGroupValue !== undefined) {
    updates.push("admin_group_value = ?");
    values.push(data.adminGroupValue || null);
  }
  if (data.enabled !== undefined) {
    updates.push("enabled = ?");
    values.push(data.enabled ? 1 : 0);
  }

  if (updates.length === 0) return;

  values.push(id);
  db.prepare(
    `UPDATE oidc_providers SET ${updates.join(", ")} WHERE id = ?`
  ).run(...values);
}

export function deleteOIDCProvider(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM oidc_providers WHERE id = ?").run(id);
}

// OIDC flow helpers
export function generateOIDCState(): string {
  return Math.random().toString(36).substring(2, 15);
}

// Build redirect URI from request URL
export function buildRedirectUri(request: Request): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/api/auth/oidc/callback`;
}

interface OIDCDiscoveryConfig {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  issuer: string;
}

// Fetch OIDC discovery configuration
export async function getOIDCDiscoveryConfig(
  provider: OIDCProvider
): Promise<OIDCDiscoveryConfig> {
  const discoveryUrl =
    provider.discoveryUrl ||
    `${provider.issuer}/.well-known/openid-configuration`;

  const response = await fetch(discoveryUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch OIDC discovery configuration from ${discoveryUrl}`
    );
  }

  return await response.json();
}

export async function buildAuthorizationUrl(
  provider: OIDCProvider,
  redirectUri: string,
  state: string
): Promise<string> {
  const config = await getOIDCDiscoveryConfig(provider);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: provider.clientId,
    redirect_uri: redirectUri,
    scope: provider.scopes || "openid profile email groups",
    state: state,
  });

  return `${config.authorization_endpoint}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
}

export async function exchangeCodeForToken(
  provider: OIDCProvider,
  code: string,
  redirectUri: string
): Promise<TokenResponse> {
  const config = await getOIDCDiscoveryConfig(provider);
  const tokenEndpoint = config.token_endpoint;

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: code,
      redirect_uri: redirectUri,
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  return response.json();
}

interface IDTokenClaims {
  sub: string;
  email: string;
  name?: string;
  preferred_username?: string;
  [key: string]: any; // Allow any claim for group claims
}

export async function verifyIDToken(
  provider: OIDCProvider,
  idToken: string
): Promise<IDTokenClaims> {
  try {
    // Fetch OIDC discovery config to get JWKS URI
    const config = await getOIDCDiscoveryConfig(provider);
    const JWKS = jose.createRemoteJWKSet(new URL(config.jwks_uri));

    // Verify the token
    const { payload } = await jose.jwtVerify(idToken, JWKS, {
      issuer: provider.issuer,
      audience: provider.clientId,
    });

    return payload as unknown as IDTokenClaims;
  } catch (error) {
    throw new Error(
      `ID token verification failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

export async function handleOIDCCallback(
  providerId: string,
  code: string,
  redirectUri: string,
  allowRegistration: boolean = true
): Promise<User> {
  const provider = getOIDCProvider(providerId);
  if (!provider) {
    throw new Error("Invalid OIDC provider");
  }

  // Exchange code for tokens
  const tokens = await exchangeCodeForToken(provider, code, redirectUri);

  // Verify ID token
  const claims = await verifyIDToken(provider, tokens.id_token);

  // Check if user should be admin based on group claims
  let shouldBeAdmin = false;
  if (provider.groupClaimName && provider.adminGroupValue) {
    const groupClaim = claims[provider.groupClaimName];
    if (groupClaim) {
      // Handle both array and string group claims
      const groups = Array.isArray(groupClaim) ? groupClaim : [groupClaim];
      shouldBeAdmin = groups.includes(provider.adminGroupValue);
    }
  }

  // Check if user exists
  let user = getUserByOIDC(providerId, claims.sub);

  if (!user) {
    if (!allowRegistration && !provider.autoProvision) {
      throw new Error("User registration is disabled");
    }

    // Create new user
    user = await createUser({
      email: claims.email,
      name: claims.name || claims.preferred_username || claims.email,
      oidcProvider: providerId,
      oidcSubject: claims.sub,
      isAdmin: shouldBeAdmin,
    });
  } else {
    // Update existing user's admin status based on group claims
    if (provider.groupClaimName && provider.adminGroupValue) {
      const db = getDb();
      db.prepare("UPDATE users SET is_admin = ? WHERE id = ?").run(
        shouldBeAdmin ? 1 : 0,
        user.id
      );
      user.isAdmin = shouldBeAdmin;
    }
  }

  return user;
}
