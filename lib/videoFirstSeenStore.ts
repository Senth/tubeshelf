import { getDb } from "./db";

const SQLITE_MAX_VARIABLES = 900;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function readFirstSeenRows(videoIds: string[]): Array<{ videoId: string; firstSeenAt: string }> {
  if (videoIds.length === 0) return [];
  const db = getDb();
  const rows: Array<{ videoId: string; firstSeenAt: string }> = [];

  for (const part of chunk(videoIds, SQLITE_MAX_VARIABLES)) {
    const placeholders = part.map(() => "?").join(", ");
    const stmt = db.prepare(
      `SELECT video_id as videoId, first_seen_at as firstSeenAt
       FROM video_first_seen
       WHERE video_id IN (${placeholders})`
    );
    rows.push(...((stmt.all(...part) as Array<{ videoId: string; firstSeenAt: string }>) || []));
  }

  return rows;
}

export function ensureFirstSeenForVideos(
  orderedVideoIds: string[]
): Map<string, number> {
  const uniqueOrderedIds = Array.from(
    new Set(
      orderedVideoIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0
      )
    )
  );

  if (uniqueOrderedIds.length === 0) return new Map();

  const db = getDb();
  const existingRows = readFirstSeenRows(uniqueOrderedIds);
  const existingMap = new Map(
    existingRows.map((row) => [row.videoId, row.firstSeenAt] as const)
  );

  const missingIds = uniqueOrderedIds.filter((id) => !existingMap.has(id));
  if (missingIds.length > 0) {
    const insert = db.prepare(
      "INSERT OR IGNORE INTO video_first_seen (video_id, first_seen_at) VALUES (?, ?)"
    );
    const baseMs = Date.now();

    const tx = db.transaction(() => {
      missingIds.forEach((videoId, index) => {
        // Preserve the current deterministic feed order for coarse timestamp ties.
        const firstSeenAt = new Date(baseMs + index).toISOString();
        insert.run(videoId, firstSeenAt);
      });
    });

    tx();
  }

  const finalRows = readFirstSeenRows(uniqueOrderedIds);
  const finalMap = new Map<string, number>();
  for (const row of finalRows) {
    const time = Date.parse(row.firstSeenAt);
    if (Number.isFinite(time)) {
      finalMap.set(row.videoId, time);
    }
  }

  return finalMap;
}

