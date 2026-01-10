#!/usr/bin/env node

/**
 * Tubeshelf Server Entry Point
 * 
 * This script handles both CLI commands and starting the web server.
 * 
 * Usage:
 *   node server.js                        - Start the web server
 *   node server.js reset-password ...     - Reset user password
 *   node server.js toggle-oidc-only ...   - Toggle OIDC-only mode
 *   node server.js get-oidc-only          - Get OIDC-only mode status
 *   node server.js list-local-users       - List local users
 */

let executeCLICommand;
try {
  const cliModule = await import("./lib/cli.js");
  executeCLICommand = cliModule.executeCLICommand;
} catch (e) {
  // CLI module not available in standalone build
  executeCLICommand = null;
}

async function main() {
  const args = process.argv.slice(2);

  // If no arguments or if the first argument doesn't look like a command, start the server
  if (args.length === 0) {
    // Start the Next.js server
    const { createServer } = await import("http");
    const { NextServer } = await import("next/dist/server/next.js");
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");

    const dir = process.cwd();
    const isDev = false;

    const nextServer = new NextServer({
      dir,
      conf: JSON.parse(
        readFileSync(resolve(dir, ".next/required-server-files.json")), "utf8"
      ),
      minimalMode: true,
    });

    const handle = nextServer.getRequestHandler();
    const server = createServer((req, res) => {
      handle(req, res);
    });

    const hostname = process.env.HOSTNAME || "0.0.0.0";
    const port = parseInt(process.env.PORT || "3000", 10);

    server.listen(port, hostname, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });

    return;
  }

  // Handle CLI commands
  const command = args[0];

  // Check if it's a known CLI command
  if (
    [
      "reset-password",
      "toggle-oidc-only",
      "get-oidc-only",
      "list-local-users",
      "help",
      "--help",
      "-h",
    ].includes(command) &&
    executeCLICommand
  ) {
    try {
      const result = await executeCLICommand(
        command === "help" || command === "--help" || command === "-h"
          ? []
          : args
      );

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
      process.exit(0);
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : String(error)
      );
      process.exit(1);
    }
  } else {
    // Unknown command - start server and pass arguments (for potential future expansion)
    console.log(`Unknown command: ${command}`);
    console.log("Starting server instead...\n");

    const { createServer } = await import("http");
    const { NextServer } = await import("next/dist/server/next.js");
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");

    const dir = process.cwd();

    const nextServer = new NextServer({
      dir,
      conf: JSON.parse(
        readFileSync(resolve(dir, ".next/required-server-files.json")), "utf8"
      ),
      minimalMode: true,
    });

    const handle = nextServer.getRequestHandler();
    const server = createServer((req, res) => {
      handle(req, res);
    });

    const hostname = process.env.HOSTNAME || "0.0.0.0";
    const port = parseInt(process.env.PORT || "3000", 10);

    server.listen(port, hostname, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
