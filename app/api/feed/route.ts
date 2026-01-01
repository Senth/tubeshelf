import { NextResponse } from "next/server";
import { fetchChannelFeed } from "@/lib/videoFetcher";
import { readLists, writeLists } from "@/lib/subscriptionListStore";
import { readSettings } from "@/lib/settingsStore";

const CONCURRENCY = 4;

// Track if a fetch is currently in progress to prevent duplicate requests
let isFetching = false;
let cachedResult: any = null;
let cacheTimestamp = 0;
let cachedSettings: string = ""; // Cache settings state as a key
const CACHE_DURATION = 1000; // 1 second cache to prevent duplicate requests

// Queue for pending requests to coalesce while in-flight
let pendingResolvers: Array<(result: any) => void> = [];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const idsParam = url.searchParams.get("ids");
  const forceRefresh = url.searchParams.get("refresh") === "true";
  const requestId = Math.random().toString(36).substring(7);

  console.log(
    `[Feed] Request ${requestId} started - ids=${
      idsParam || "all"
    }, forceRefresh=${forceRefresh}`
  );

  // Get current settings to use as cache key - do this early
  let currentSettings = {
    enableVideos: true,
  };
  try {
    const settingsData = await readSettings();
    currentSettings = {
      enableVideos: settingsData.enableVideos,
    };
  } catch {
    // Use defaults
  }
  const settingsKey = JSON.stringify(currentSettings);

  // Check cache only if not forced refresh AND settings haven't changed
  if (
    !forceRefresh &&
    cachedResult &&
    settingsKey === cachedSettings &&
    Date.now() - cacheTimestamp < CACHE_DURATION
  ) {
    console.log(`[Feed] Request ${requestId} using cached result`);
    return NextResponse.json(cachedResult);
  }

  // If a fetch is in progress and not forced refresh, coalesce this request
  if (isFetching && !forceRefresh) {
    console.log(
      `[Feed] Request ${requestId} coalescing with in-flight request`
    );
    const result = await new Promise<any>((resolve) => {
      pendingResolvers.push(resolve);
    });
    return NextResponse.json(result);
  }

  console.log(`[Feed] Request ${requestId} starting fetch operation`);
  isFetching = true;
  cacheTimestamp = Date.now();

  let channelIds: string[] = [];
  let subscriptionMetadata = new Map<string, any>();

  if (idsParam) {
    channelIds = idsParam
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
  } else {
    // Get all unique channel IDs from all subscription lists with their metadata
    const listsData = await readLists();
    listsData.lists.forEach((list) => {
      list.subscriptions.forEach((sub) => {
        if (!subscriptionMetadata.has(sub.channelId)) {
          subscriptionMetadata.set(sub.channelId, sub);
        }
      });
    });

    // Sort channels by last upload time (most recent first)
    const sortedChannels = Array.from(subscriptionMetadata.values()).sort(
      (a, b) => {
        const aTime = a.lastUploadedAt
          ? new Date(a.lastUploadedAt).getTime()
          : 0;
        const bTime = b.lastUploadedAt
          ? new Date(b.lastUploadedAt).getTime()
          : 0;
        // Newer uploads first, then oldest ones
        return bTime - aTime;
      }
    );

    channelIds = sortedChannels.map((sub) => sub.channelId);
  }

  if (channelIds.length === 0) {
    return NextResponse.json({ items: [] });
  }

  // Log the fetch priority order (top 5 channels)
  console.log(
    "[Feed] Channel fetch priority order:",
    channelIds
      .slice(0, 5)
      .map(
        (id) =>
          `${subscriptionMetadata.get(id)?.title || id} (${
            subscriptionMetadata.get(id)?.lastUploadedAt || "never"
          })`
      )
      .join(", ")
  );

  const items: any[] = [];
  // Use a shared queue to avoid race conditions causing duplicate processing
  const queue = [...channelIds];
  // Track which channels had videos (for ranking updates)
  const channelsWithVideos = new Map<string, string>();

  // Use the settings read at the top of the function
  const feedSettings = currentSettings;

  let workerCount = 0;

  const worker = async () => {
    const workerId = ++workerCount;
    console.log(
      `[Feed] Worker ${workerId} for request ${requestId} started, queue has ${queue.length} channels`
    );
    let processed = 0;

    // Loop until queue is empty; shift() ensures unique assignment
    while (queue.length > 0) {
      const current = queue.shift()!;
      processed++;
      console.log(
        `[Feed] Worker ${workerId} processing channel ${current} (queue now has ${queue.length})`
      );
      try {
        let meta: { title: string; thumbnail?: string } | undefined;
        let hasVideos = false;
        let latestUploadTime: string | undefined;

        // Fetch regular videos only if enabled
        if (feedSettings.enableVideos) {
          console.log(
            `[Feed] Worker ${workerId} calling fetchChannelFeed for ${current}`
          );
          const result = await fetchChannelFeed(current);
          meta = result.meta;

          // If the fetch returned no videos and no meta title, treat as unavailable
          if ((result.videos || []).length === 0 && !(meta && meta.title)) {
            const subTitle =
              subscriptionMetadata.get(current)?.title || "(unknown)";
            console.warn(
              `[Feed] Channel unavailable or returned 404: ${current} - ${subTitle}`
            );
          }

          const regularVideos = result.videos;
          if (regularVideos.length > 0) {
            hasVideos = true;
            // Get the most recent upload from this channel
            const mostRecent = regularVideos.reduce((latest, video) => {
              const videoTime = new Date(video.publishedAt).getTime();
              const latestTime = new Date(latest.publishedAt).getTime();
              return videoTime > latestTime ? video : latest;
            });
            latestUploadTime = mostRecent.publishedAt;
          }
          regularVideos.forEach((video) => {
            items.push({
              ...video,
              channelTitle: video.channelTitle || meta?.title,
              thumbnail: video.thumbnail || meta?.thumbnail,
              channelId: video.channelId || current,
            });
          });
        }
        // Only regular videos are fetched for each channel

        // Track the latest upload time for this channel
        // Always update the timestamp with either the latest upload or current time
        if (latestUploadTime) {
          channelsWithVideos.set(current, latestUploadTime);
        } else {
          // Even if no videos found, record current time to update the subscription
          channelsWithVideos.set(current, new Date().toISOString());
        }
      } catch (err) {
        console.error("[Feed] Failed to load feed for channel", {
          channelId: current,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    console.log(
      `[Feed] Worker ${workerId} for request ${requestId} completed, processed ${processed} channels`
    );
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Update lastUploadedAt for all channels that were processed
  console.log(
    `[Feed] Updating lastUploadedAt for ${channelsWithVideos.size} channels`
  );
  if (channelsWithVideos.size > 0) {
    try {
      const listsData = await readLists();
      let updatedCount = 0;
      listsData.lists.forEach((list) => {
        list.subscriptions.forEach((sub) => {
          if (channelsWithVideos.has(sub.channelId)) {
            const newTime = channelsWithVideos.get(sub.channelId);
            sub.lastUploadedAt = newTime;
            updatedCount++;
            console.log(
              `[Feed] Updated ${sub.title} (${sub.channelId}) to ${newTime}`
            );
          }
        });
      });
      console.log(
        `[Feed] Updated ${updatedCount} subscriptions with lastUploadedAt`
      );
      await writeLists(listsData);
    } catch (err) {
      console.error("[Feed] Failed to update subscription ranking:", err);
      // Continue anyway - this is not critical
    }
  }

  items.sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  // Log durations for debugging
  const videosWithDuration = items.filter((item) => item.duration);
  const videosWithoutDuration = items.filter((item) => !item.duration);

  // Return feed immediately without waiting for avatar enrichment
  const result = { items };
  cachedResult = result;
  cachedSettings = settingsKey; // Store settings key with cache
  cacheTimestamp = Date.now();

  // Resolve any coalesced pending requests
  const resolvers = pendingResolvers.splice(0);
  isFetching = false;
  resolvers.forEach((resolve) => resolve(result));

  console.log(
    `[Feed] Request ${requestId} completed - returning ${items.length} items`
  );

  // Fetch avatars and update subscriptions in the background (non-blocking)
  fetchAvatarsAndUpdateAsync(channelIds).catch((err) =>
    console.warn("[Feed] Background avatar fetch failed", {
      error: String(err),
    })
  );

  return NextResponse.json(result);
}

// Background async function to fetch avatars and update subscriptions
async function fetchAvatarsAndUpdateAsync(channelIds: string[]) {
  const avatars = new Map<string, string>();

  // Fetch all avatars in parallel with a short timeout each
  await Promise.all(
    channelIds.map(async (channelId) => {
      try {
        const avatar = await fetchChannelAvatarDirect(channelId);
        if (avatar) {
          avatars.set(channelId, avatar);
        }
      } catch {
        // Silently fail on individual avatar fetches
      }
    })
  );

  // Update subscriptions with the fetched avatars
  if (avatars.size > 0) {
    try {
      const listsData = await readLists();
      let updated = false;
      listsData.lists.forEach((list) => {
        list.subscriptions.forEach((sub) => {
          const avatar = avatars.get(sub.channelId);
          if (avatar && sub.thumbnail !== avatar) {
            sub.thumbnail = avatar;
            updated = true;
          }
        });
      });
      if (updated) {
        await writeLists(listsData);
      }
    } catch (err) {
      console.warn("[Feed] Failed to update subscriptions with avatars", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// Inline avatar fetch to avoid circular imports
async function fetchChannelAvatarDirect(
  channelId: string,
  timeoutMs = 1500
): Promise<string | undefined> {
  const pageUrl = `https://www.youtube.com/channel/${channelId}`;
  const headers = {
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "accept-language": "en-US,en;q=0.8",
    cookie: "CONSENT=YES+1",
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(`${pageUrl}?hl=en&gl=US`, {
      cache: "no-store",
      headers,
      signal: controller.signal as any,
    });

    clearTimeout(timer);
    if (!res.ok) {
      return undefined;
    }

    const html = await res.text();

    // Prefer the Open Graph image (channel avatar)
    const ogImageMatch = html.match(/property="og:image"\s+content="([^"]+)"/);
    if (ogImageMatch?.[1]) {
      return ogImageMatch[1].replace(/\\u0026/g, "&");
    }

    // Fallback: look for avatar thumbnails in embedded JSON
    const avatarMatch = html.match(
      /"avatar"\s*:\s*\{"thumbnails"\s*:\s*\[\s*\{"url":"([^"]+)"/
    );
    if (avatarMatch?.[1]) {
      return avatarMatch[1].replace(/\\u0026/g, "&");
    }

    return undefined;
  } catch {
    return undefined;
  }
}
