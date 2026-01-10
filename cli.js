#!/usr/bin/env node

/**
 * CLI entry point for tubeshelf
 * Usage:
 *   node cli.js reset-password <email> <password>
 *   node cli.js toggle-oidc-only [enable|disable]
 *   node cli.js get-oidc-only
 *   node cli.js list-local-users
 */

import { executeCLICommand } from "./lib/cli.js";

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "help" || args[0] === "--help") {
    console.log(`
Tubeshelf CLI Management Tool

Usage:
  node cli.js COMMAND [OPTIONS]

Commands:
  reset-password <email> <password>     Reset the password for a local user
                                        The password must be at least 8 characters
                                        Example: node cli.js reset-password user@example.com newPassword123

  toggle-oidc-only [enable|disable]     Toggle OIDC-only login mode
                                        enable   - Enable OIDC-only login (local passwords disabled)
                                        disable  - Disable OIDC-only login (allow both OIDC and local passwords)
                                        no arg   - Toggle current setting
                                        Example: node cli.js toggle-oidc-only enable

  get-oidc-only                         Show current OIDC-only login mode status
                                        Example: node cli.js get-oidc-only

  list-local-users                      List all local (non-OIDC) users
                                        Example: node cli.js list-local-users

Examples:
  node cli.js reset-password admin@example.com SecurePass123
  node cli.js toggle-oidc-only enable
  node cli.js get-oidc-only
  node cli.js list-local-users
    `);
    process.exit(0);
  }

  try {
    const result = await executeCLICommand(args);

    if (result.data) {
      console.log(result.message);
      if (Array.isArray(result.data)) {
        console.log("\nUsers:");
        result.data.forEach((user) => {
          const adminLabel = user.isAdmin ? " (ADMIN)" : "";
          const nameDisplay = user.name ? ` - ${user.name}` : "";
          console.log(`  ${user.email}${nameDisplay}${adminLabel}`);
        });
      } else {
        console.log(JSON.stringify(result.data, null, 2));
      }
    } else {
      console.log(result.message);
    }

    if (!result.success) {
      process.exit(1);
    }
  } catch (error) {
    console.error(
      "Error:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

main();
