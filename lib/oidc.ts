import { getDb } from "./db";
import {
  decryptSecret as decryptWithKey,
  encryptSecret as encryptWithKey,
} from "./secretCrypto";

// Legacy rows were written with a hardcoded key, so OIDC keeps that fallback.
const OIDC_SECRET_CRYPTO = {
  salt: "tubeshelf-oidc-salt",
  label: "OIDC",
  allowLegacyDefaultKey: true,
} as const;

function encryptSecret(plaintext: string): string {
  return encryptWithKey(plaintext, OIDC_SECRET_CRYPTO);
}

function decryptSecret(ciphertext: string): string {
  return decryptWithKey(ciphertext, OIDC_SECRET_CRYPTO);
}

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
      WHERE enabled = 1 
        AND client_id IS NOT NULL 
        AND client_id != '' 
        AND client_secret IS NOT NULL 
        AND client_secret != ''`
    )
    .all() as any[];

  return providers.map((p) => ({
    ...p,
    clientSecret: decryptSecret(p.clientSecret),
    autoProvision: p.autoProvision === 1,
  })) as OIDCProvider[];
}

// Get providers for public display (no secrets)
export function getPublicOIDCProviders(): Array<{ id: string; name: string }> {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, name FROM oidc_providers WHERE enabled = 1 AND client_id IS NOT NULL AND client_id != '' AND client_secret IS NOT NULL AND client_secret != ''`
    )
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
      WHERE id = ? AND enabled = 1`
    )
    .get(id) as any | undefined;

  if (!provider) return null;

  // Validate required credentials
  if (!provider.clientId || !provider.clientSecret) {
    console.error(`[OIDC] Provider ${id} is missing client credentials`);
    return null;
  }

  return {
    ...provider,
    clientSecret: decryptSecret(provider.clientSecret),
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

  // Encrypt the client secret before storing
  const encryptedSecret = encryptSecret(data.clientSecret);

  // Use INSERT OR REPLACE to handle case where provider with same ID exists
  db.prepare(
    `INSERT OR REPLACE INTO oidc_providers (
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
    encryptedSecret,
    data.scopes || "openid profile email groups",
    data.autoProvision ? 1 : 0,
    data.groupClaimName || null,
    data.adminGroupValue || null,
    1 // Enable by default
  );

  // Return the provider with decrypted secret
  return {
    id: data.id,
    name: data.name,
    issuer: data.issuer,
    baseUrl: data.baseUrl,
    discoveryUrl: data.discoveryUrl,
    domain: data.domain,
    redirectUri: data.redirectUri,
    clientId: data.clientId,
    clientSecret: data.clientSecret, // Return original (not encrypted)
    scopes: data.scopes || "openid profile email groups",
    autoProvision: data.autoProvision || false,
    groupClaimName: data.groupClaimName,
    adminGroupValue: data.adminGroupValue,
    enabled: true,
    createdAt: new Date().toISOString(),
  };
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
    values.push(encryptSecret(data.clientSecret));
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
