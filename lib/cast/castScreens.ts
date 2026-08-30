/**
 * Persisted "Link with TV code" screens. The pairing (screenId) is permanent;
 * the lounge token that rides along at pairing time is short-lived, so only
 * the ids are stored and every session refreshes its token.
 */

import { getDb } from "@/lib/db";

const KEY = "castScreens";

export interface CastScreen {
  screenId: string;
  name: string;
  addedAt: string;
}

function readRows(): CastScreen[] {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(KEY) as
    | { value: string }
    | undefined;
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is CastScreen =>
        entry && typeof entry.screenId === "string" && typeof entry.name === "string"
    );
  } catch {
    return [];
  }
}

function writeRows(rows: CastScreen[]) {
  const db = getDb();
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
    KEY,
    JSON.stringify(rows)
  );
}

export function listCastScreens(): CastScreen[] {
  return readRows();
}

export function addCastScreen(input: { screenId: string; name: string }): CastScreen {
  const rows = readRows().filter((row) => row.screenId !== input.screenId);
  const screen: CastScreen = {
    screenId: input.screenId,
    name: input.name,
    addedAt: new Date().toISOString(),
  };
  rows.push(screen);
  writeRows(rows);
  return screen;
}

export function removeCastScreen(screenId: string): boolean {
  const rows = readRows();
  const next = rows.filter((row) => row.screenId !== screenId);
  if (next.length === rows.length) return false;
  writeRows(next);
  return true;
}
