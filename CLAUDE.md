# CLAUDE.md

Guidance for Claude Code when working in this repo (TubeShelf — self-hosted YouTube subscription feed, Next.js 16 + better-sqlite3 + better-auth).

## After implementing a feature

Both steps are mandatory, in this order:

1. **Lint and typecheck.**

   ```bash
   npm run lint       # eslint .
   npm run typecheck  # tsc --noEmit
   ```

   Fix every error and warning, including pre-existing ones.

2. **Test the feature with Playwright against the local dev server.** Not just
   unit-level reasoning — drive the real UI, sign in, and confirm the change
   behaves as intended. Take a screenshot on failure.

## Local dev server

```bash
npm run dev          # Next.js dev (Turbopack) on http://localhost:3000
```

Notes:

- SQLite lives in `./data/tubeshelf.db`, created automatically on first request.
  `data/` is gitignored — deleting it resets the instance.
- `BETTER_AUTH_SECRET` is optional locally: if unset, a secret is generated into
  `data/.better-auth-secret` and the UI shows an "auto-generated auth secret"
  banner. Harmless in dev.
- With no users, `/` redirects to `/setup` to create the first admin.

Alternative (closer to production, slower): `npm run docker:build` then
`docker compose -f docker-compose.local.yml up -d`.

## Local dev admin account

Dev server only — never use these anywhere else:

- **Email:** `claude@example.com`
- **Password:** `claude414`

If `data/` was wiped, recreate the account (password must be 8+ chars, name 2+):

```bash
curl -s -X POST http://localhost:3000/api/setup \
  -H 'Content-Type: application/json' \
  -d '{"name":"Claude Dev","email":"claude@example.com","password":"claude414"}'
```

Same thing via the UI: open `http://localhost:3000/setup`.

Other local user management goes through the CLI: `npm run cli -- user-list`,
`npm run cli -- user-reset-password <email>`.

## Playwright

Use the **`playwright-cli` skill** — don't add Playwright to `package.json` and
don't hand-roll browser scripts.

Sign-in flow against the local dev server:

```bash
playwright-cli open http://localhost:3000/login
playwright-cli snapshot            # refs settle only after the client fetches
                                   # the OIDC config — re-snapshot if the form
                                   # is missing from the first one
playwright-cli fill <email-ref> "claude@example.com"
playwright-cli fill <password-ref> "claude414"
playwright-cli click <sign-in-ref>
playwright-cli snapshot            # signed in => URL is / and the header shows
                                   # the user button
playwright-cli close
```

Useful during feature checks: `playwright-cli console` for page errors,
`playwright-cli requests` for network calls, `playwright-cli screenshot` when a
picture is worth attaching. Snapshots and logs land in `.playwright-cli/`
(gitignored).

Don't test auth flows with `curl` — better-auth rejects requests without proper
origin/cookie handling and returns `401 Authentication required` even for valid
credentials. Use the browser.

Keep any other scratch artifacts in `.tmp/`.
