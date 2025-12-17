import { promises as fs } from "fs";
import path from "path";

interface DurationEntry {
  videoId: string;
  duration: string;
  cachedAt: string;
  missCount?: number; // Track consecutive misses to eventually remove old entries
}

interface DurationCacheData {
  [channelId: string]: DurationEntry[];
}

const dataDir = "data";
const cacheFile = path.join(dataDir, "duration-cache.json");
const CACHE_DURATION = 1000 * 60 * 60 * 24 * 30; // 30 days - update if older

let durationCacheData: DurationCacheData = {};
let isLoaded = false;

async function ensureFile() {
  try {
    await fs.access(cacheFile);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(cacheFile, JSON.stringify({}, null, 2), "utf-8");
  }
}

export async function loadCache(): Promise<void> {
  if (isLoaded) return;

  try {
    await ensureFile();
    const data = await fs.readFile(cacheFile, "utf-8");
    durationCacheData = JSON.parse(data || "{}");
  } catch (err) {
    console.warn("[DurationCache] Failed to load cache:", err);
    durationCacheData = {};
  }
  isLoaded = true;
}

export async function getCachedDurations(
  channelId: string
): Promise<Record<string, string>> {
  await loadCache();

  const entries = durationCacheData[channelId] || [];
  const result: Record<string, string> = {};
  const now = Date.now();
  let hasExpired = false;

  for (const entry of entries) {
    const cachedTime = new Date(entry.cachedAt).getTime();
    // If cache is older than 30 days, it's expired
    if (now - cachedTime > CACHE_DURATION) {
      hasExpired = true;
      continue;
    }
    result[entry.videoId] = entry.duration;
  }

  // Clean up expired entries if any were found
  if (hasExpired && entries.length > 0) {
    durationCacheData[channelId] = entries.filter((entry) => {
      const cachedTime = new Date(entry.cachedAt).getTime();
      return now - cachedTime <= CACHE_DURATION;
    });
    // Save the cleaned data asynchronously
    saveCache().catch((err) =>
      console.warn("[DurationCache] Failed to save after cleanup:", err)
    );
  }

  return result;
}

export async function getUncachedVideoIds(
  channelId: string,
  videoIds: string[]
): Promise<string[]> {
  const cached = await getCachedDurations(channelId);
  return videoIds.filter((id) => !cached[id]);
}

export async function cacheDurations(
  channelId: string,
  durations: Record<string, string>
): Promise<void> {
  await loadCache();

  const now = new Date().toISOString();
  const entries: DurationEntry[] = Object.entries(durations).map(
    ([videoId, duration]) => ({
      videoId,
      duration,
      cachedAt: now,
      missCount: 0, // Reset miss count when video is found
    })
  );

  // Merge with existing entries, giving priority to new ones
  const existingEntries = durationCacheData[channelId] || [];
  const existingMap = new Map(existingEntries.map((e) => [e.videoId, e]));

  // Update with new entries
  entries.forEach((entry) => {
    existingMap.set(entry.videoId, entry);
  });

  durationCacheData[channelId] = Array.from(existingMap.values());

  await saveCache();
}

async function saveCache(): Promise<void> {
  try {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(
      cacheFile,
      JSON.stringify(durationCacheData, null, 2),
      "utf-8"
    );
  } catch (err) {
    console.error("[DurationCache] Failed to save cache:", err);
  }
}

export async function trackMissingVideos(
  channelId: string,
  fetchedVideoIds: string[]
): Promise<void> {
  await loadCache();

  const entries = durationCacheData[channelId] || [];
  const fetchedSet = new Set(fetchedVideoIds);
  const MISS_THRESHOLD = 5;

  // Update miss counts and filter out entries that exceed threshold
  const updatedEntries = entries
    .map((entry) => {
      // If video wasn't found in this fetch, increment miss count
      if (!fetchedSet.has(entry.videoId)) {
        return {
          ...entry,
          missCount: (entry.missCount || 0) + 1,
        };
      } else {
        // Video was found, reset miss count
        return {
          ...entry,
          missCount: 0,
        };
      }
    })
    // Remove entries that have exceeded the miss threshold
    .filter((entry) => entry.missCount < MISS_THRESHOLD);

  durationCacheData[channelId] = updatedEntries;

  // Check if any were removed
  if (updatedEntries.length < entries.length) {
    const removed = entries.length - updatedEntries.length;
    console.log(
      `[DurationCache] Removed ${removed} videos from cache for channel ${channelId} (exceeded miss threshold)`
    );
    await saveCache();
  }
}

export async function mergeCachedWithFresh(
  channelId: string,
  fetchedDurations: Record<string, string>
): Promise<Record<string, string>> {
  const cached = await getCachedDurations(channelId);
  // Merge: fresh data takes priority, then cached
  const result = { ...cached, ...fetchedDurations };

  // Cache any new durations
  if (Object.keys(fetchedDurations).length > 0) {
    await cacheDurations(channelId, fetchedDurations);
  }

  // Track missing videos in this fetch
  const allVideoIds = Object.keys(cached);
  await trackMissingVideos(channelId, Object.keys(fetchedDurations));

  return result;
}
