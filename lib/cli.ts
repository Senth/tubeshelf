
import { getDb } from "./db";
import { getUserByEmail, updateUserPassword } from "./users";
import { readSettings, writeSettings } from "./settingsStore";
import { getOIDCProviders } from "./oidc";

import crypto from "crypto";

/**
 * Generate a random password with only letters (16 characters)
 */
function generateRandomPassword(): string {
  const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let password = "";
  const randomBytes = crypto.randomBytes(16);

  for (let i = 0; i < 16; i++) {
    password += letters[randomBytes[i] % letters.length];
  }

  return password;
}

/**
 * Reset a local user's password from CLI with a randomly generated password
 */
export async function resetUserPassword(
  email: string
): Promise<{ success: boolean; message: string; password?: string }> {
  try {
    const user = getUserByEmail(email);

    if (!user) {
      return {
        success: false,
        message: `User with email "${email}" not found.`,
      };
    }

    if (user.oidcProvider) {
      return {
        success: false,
        message: `User "${email}" is an OIDC user. Cannot reset password for OIDC users.`,
      };
    }

    // Generate a random 16-letter password
    const newPassword = generateRandomPassword();

    await updateUserPassword(user.id, newPassword);

    return {
      success: true,
      message: `Password for user "${email}" has been reset successfully.`,
      password: newPassword,
    };
  } catch (error) {
    console.error("Error resetting password:", error);
    return {
      success: false,
      message: `An error occurred while resetting the password: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

/**
 * Toggle OIDC-only login mode from CLI
 */
export async function toggleOIDCOnlyMode(
  enable?: boolean
): Promise<{ success: boolean; message: string }> {
  try {
    const oidcProviders = getOIDCProviders();
    const hasEnabledProvider = oidcProviders.some((p) => p.enabled);

    // If enable is not specified, toggle the current state
    let enableMode = enable;
    if (enable === undefined) {
      const settings = await readSettings();
      enableMode = !settings.oidcOnly;
    }

    // Validate: if enabling OIDC-only mode, ensure OIDC is configured
    if (enableMode && !hasEnabledProvider) {
      return {
        success: false,
        message:
          "Cannot enable OIDC-only mode without an enabled OIDC provider. Please configure an OIDC provider first.",
      };
    }

    const settings = await readSettings();
    const updatedSettings = {
      ...settings,
      oidcOnly: enableMode || false,
    };

    await writeSettings(updatedSettings);

    const message = enableMode
      ? "OIDC-only login mode has been enabled. Users can now only log in using OIDC providers."
      : "OIDC-only login mode has been disabled. Users can log in using local credentials or OIDC providers.";

    return {
      success: true,
      message,
    };
  } catch (error) {
    console.error("Error toggling OIDC-only mode:", error);
    return {
      success: false,
      message: `An error occurred: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

/**
 * Get current OIDC-only mode status
 */
export async function getOIDCOnlyMode(): Promise<{
  success: boolean;
  oidcOnly: boolean;
  message: string;
}> {
  try {
    const settings = await readSettings();
    return {
      success: true,
      oidcOnly: settings.oidcOnly || false,
      message: `OIDC-only mode is currently ${
        settings.oidcOnly ? "ENABLED" : "DISABLED"
      }.`,
    };
  } catch (error) {
    console.error("Error getting OIDC-only mode:", error);
    return {
      success: false,
      oidcOnly: false,
      message: `An error occurred: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

/**
 * List all local (non-OIDC) users
 */
export function listLocalUsers(): {
  success: boolean;
  users: Array<{ email: string; name: string | null; isAdmin: boolean }>;
  message: string;
} {
  try {
    const db = getDb();
    const users = db
      .prepare(
        `SELECT email, name, is_admin as isAdmin FROM users 
       WHERE oidc_provider IS NULL 
       ORDER BY email`
      )
      .all() as Array<{ email: string; name: string | null; isAdmin: boolean }>;

    return {
      success: true,
      users,
      message: `Found ${users.length} local user(s).`,
    };
  } catch (error) {
    console.error("Error listing local users:", error);
    return {
      success: false,
      users: [],
      message: `An error occurred: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

/**
 * Parse and execute CLI command
 */
export async function executeCLICommand(
  args: string[]
): Promise<{ success: boolean; message: string; data?: any }> {
  if (args.length === 0) {
    return {
      success: false,
      message: `Usage:
  tubeshelf-cli <command> [options]

User Management:
  user-list                          List all local users
  user-reset-password <email>        Reset password for a local user (generates random 16-letter password)

OIDC Configuration:
  oidc-status                        Get current OIDC-only mode status
  oidc-toggle [enable|disable]       Toggle OIDC-only login mode`,
    };
  }

  const command = args[0];



  // Support both old and new command names for backwards compatibility
  if (command === "user-reset-password" || command === "reset-password") {
    if (args.length < 2) {
      return {
        success: false,
        message:
          "Usage: user-reset-password <email>\nA random 16-letter password will be generated.",
      };
    }

    const email = args[1];

    return await resetUserPassword(email);
  }

  if (command === "oidc-toggle" || command === "toggle-oidc-only") {
    let enable: boolean | undefined;
    if (args.length > 1) {
      if (args[1].toLowerCase() === "enable") {
        enable = true;
      } else if (args[1].toLowerCase() === "disable") {
        enable = false;
      } else {
        return {
          success: false,
          message:
            "Usage: oidc-toggle [enable|disable]\nIf no argument is provided, the current setting will be toggled.",
        };
      }
    }

    return await toggleOIDCOnlyMode(enable);
  }

  if (command === "oidc-status" || command === "get-oidc-only") {
    return await getOIDCOnlyMode();
  }

  if (command === "user-list" || command === "list-local-users") {
    const result = listLocalUsers();
    return {
      success: result.success,
      message: result.message,
      data: result.users,
    };
  }

  return {
    success: false,
    message: `Unknown command: ${command}. Use 'help' for usage information.`,
  };
}
