/**
 * Symmetric encryption for third-party client secrets and OAuth refresh tokens
 * kept in SQLite.
 *
 * The key is derived from the instance secret, so a stolen `tubeshelf.db` alone
 * does not hand over anyone's Google account. Historically this lived in
 * `lib/oidc.ts`; it is shared now that the YouTube integration stores secrets
 * too, and it keeps that module's legacy-key fallback so already-stored OIDC
 * secrets stay readable.
 */

import crypto from "crypto";
import { existsSync, readFileSync } from "fs";
import path from "path";

const LEGACY_DEFAULT_OIDC_ENCRYPTION_SECRET = "tubeshelf-default-key-change-me";

// Same file lib/betterAuth.ts generates when no secret is configured. Only ever
// read here, never created, so this cannot race with auth start-up.
const GENERATED_AUTH_SECRET_FILE = path.join(
  process.cwd(),
  "data",
  ".better-auth-secret"
);

function readGeneratedAuthSecretFile(): string | null {
  try {
    if (!existsSync(GENERATED_AUTH_SECRET_FILE)) return null;
    const contents = readFileSync(GENERATED_AUTH_SECRET_FILE, "utf8").trim();
    return contents || null;
  } catch {
    return null;
  }
}

declare global {
  var __tubeshelfSecretEncryptionWarningLogged:
    | Record<string, boolean>
    | undefined;
}

export function getConfiguredEncryptionSecret(): string | null {
  return (
    process.env.OIDC_ENCRYPTION_KEY ||
    process.env.BETTER_AUTH_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.SECRET_KEY ||
    null
  );
}

function deriveEncryptionKey(secret: string, salt: string): Buffer {
  return crypto.scryptSync(secret, salt, 32);
}

function warnMissingEncryptionKeyOnce(label: string) {
  const logged = (globalThis.__tubeshelfSecretEncryptionWarningLogged ||= {});
  if (logged[label]) return;
  logged[label] = true;
  console.warn(
    `[${label}] No OIDC_ENCRYPTION_KEY/BETTER_AUTH_SECRET configured. Existing legacy secrets can still be read if they used the historical default key, but storing new secrets requires a configured secret.`
  );
}

export interface SecretCryptoOptions {
  /** scrypt salt. Different per feature so one leaked key scope is not the other. */
  salt: string;
  /** Log prefix, e.g. "OIDC" or "YouTube". */
  label: string;
  /**
   * Accept secrets written with the historical hardcoded key. Only OIDC ever
   * wrote those, so new features leave this off.
   */
  allowLegacyDefaultKey?: boolean;
  /**
   * Fall back to the auto-generated instance secret when no environment
   * variable is set, so features still work on installs that never configured
   * one. OIDC deliberately does not opt in: it has always demanded an explicit
   * secret, and changing that would move which key its stored rows use.
   */
  allowGeneratedAuthSecret?: boolean;
}

/**
 * Keys to try, best first. More than one only when a generated fallback is
 * allowed, so a later-configured env secret does not orphan stored values.
 */
function candidateSecrets(options: SecretCryptoOptions): string[] {
  const secrets: string[] = [];
  const configured = getConfiguredEncryptionSecret();
  if (configured) secrets.push(configured);

  if (options.allowGeneratedAuthSecret) {
    const generated = readGeneratedAuthSecretFile();
    if (generated && !secrets.includes(generated)) {
      secrets.push(generated);
    }
  }

  return secrets;
}

/** Whether anything can be encrypted at all for this feature. */
export function hasUsableEncryptionSecret(
  options: SecretCryptoOptions
): boolean {
  return candidateSecrets(options).length > 0;
}

/** Encrypt to `iv:authTag:ciphertext`, all base64. */
export function encryptSecret(
  plaintext: string,
  options: SecretCryptoOptions
): string {
  const [encryptionSecret] = candidateSecrets(options);
  if (!encryptionSecret) {
    warnMissingEncryptionKeyOnce(options.label);
    throw new Error(
      "OIDC_ENCRYPTION_KEY (or BETTER_AUTH_SECRET) must be configured before storing client secrets"
    );
  }
  const key = deriveEncryptionKey(encryptionSecret, options.salt);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString(
    "base64"
  )}:${encrypted.toString("base64")}`;
}

/**
 * Decrypt a value produced by `encryptSecret`.
 *
 * Returns the input unchanged when it does not look encrypted, which is how
 * pre-encryption OIDC rows keep working.
 */
export function decryptSecret(
  ciphertext: string,
  options: SecretCryptoOptions
): string {
  if (!ciphertext.includes(":")) {
    return ciphertext;
  }

  const [ivB64, authTagB64, encryptedB64] = ciphertext.split(":");
  if (!ivB64 || !authTagB64 || !encryptedB64) {
    return ciphertext;
  }

  const tryDecryptWithSecret = (secret: string): string | null => {
    try {
      const key = deriveEncryptionKey(secret, options.salt);
      const iv = Buffer.from(ivB64, "base64");
      const authTag = Buffer.from(authTagB64, "base64");
      const encrypted = Buffer.from(encryptedB64, "base64");
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);
      return decrypted.toString("utf8");
    } catch {
      return null;
    }
  };

  for (const secret of candidateSecrets(options)) {
    const decrypted = tryDecryptWithSecret(secret);
    if (decrypted !== null) {
      return decrypted;
    }
  }

  if (options.allowLegacyDefaultKey) {
    const legacyDecrypted = tryDecryptWithSecret(
      LEGACY_DEFAULT_OIDC_ENCRYPTION_SECRET
    );
    if (legacyDecrypted !== null) {
      console.warn(
        `[${options.label}] Decrypted secret with legacy default key. Configure OIDC_ENCRYPTION_KEY or BETTER_AUTH_SECRET and rotate/re-save the secret.`
      );
      return legacyDecrypted;
    }
  }

  console.warn(`[${options.label}] Failed to decrypt secret, assuming plaintext`);
  return ciphertext;
}
