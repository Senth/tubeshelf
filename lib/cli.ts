import { getDb } from "./db";
import { getUserByEmail, updateUserPassword } from "./auth";
import { readSettings, writeSettings } from "./settingsStore";
import { getOIDCProviders } from "./oidc";

/**
 * Reset a local user's password from CLI
 */
export async function resetUserPassword(
  email: string,
  newPassword: string
): Promise<{ success: boolean; message: string }> {
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

    if (newPassword.length < 8) {
      return {
        success: false,
        message: "Password must be at least 8 characters long.",
      };
    }

    await updateUserPassword(user.id, newPassword);

    return {
      success: true,
      message: `Password for user "${email}" has been reset successfully.`,
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
  node server.js reset-password <email> <new-password>
  node server.js toggle-oidc-only [enable|disable]
  node server.js get-oidc-only
  node server.js list-local-users

Commands:
  reset-password <email> <password>  Reset password for a local user
  toggle-oidc-only [enable|disable]  Toggle OIDC-only login mode
  get-oidc-only                      Get current OIDC-only mode status
  list-local-users                   List all local (non-OIDC) users`,
    };
  }

  const command = args[0];

  if (command === "reset-password") {
    if (args.length < 3) {
      return {
        success: false,
        message:
          "Usage: reset-password <email> <new-password>\nPassword must be at least 8 characters.",
      };
    }

    const email = args[1];
    const newPassword = args.slice(2).join(" ");

    return await resetUserPassword(email, newPassword);
  }

  if (command === "toggle-oidc-only") {
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
            "Usage: toggle-oidc-only [enable|disable]\nIf no argument is provided, the current setting will be toggled.",
        };
      }
    }

    return await toggleOIDCOnlyMode(enable);
  }

  if (command === "get-oidc-only") {
    return await getOIDCOnlyMode();
  }

  if (command === "list-local-users") {
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
