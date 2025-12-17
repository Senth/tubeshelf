import { XMLParser } from "fast-xml-parser";
import { readSettings } from "./settingsStore";

export interface FeedVideo {
  id: string;
  title: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  updatedAt?: string;
  url: string;
  thumbnail?: string;
  duration?: string;
  isShort?: boolean;
  isLivestream?: boolean;
}

export interface ChannelMeta {
  channelId: string;
  title: string;
  thumbnail?: string;
  avatar?: string;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,
});

function parseEntry(entry: any): FeedVideo | null {
  if (!entry) return null;
  const videoId = entry["yt:videoId"] || entry["videoId"];
  const link = Array.isArray(entry.link)
    ? entry.link.find((l: any) => l.rel === "alternate")?.href
    : entry.link?.href || entry.link;
  const mediaGroup = entry["media:group"] || entry.mediaGroup || {};
  const thumb =
    mediaGroup["media:thumbnail"]?.url ||
    mediaGroup["media:content"]?.url ||
    entry["media:thumbnail"]?.url ||
    (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : undefined);

  const published = entry.published || entry["published"];
  const updated = entry.updated || entry["updated"];

  return {
    id: videoId || entry.id,
    title: entry.title || "",
    channelId: entry["yt:channelId"] || entry["channelId"] || "",
    channelTitle: entry.author?.name || entry["author"]?.["name"] || "",
    publishedAt: published || new Date().toISOString(),
    updatedAt: updated,
    url: link || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : ""),
    thumbnail: thumb,
    duration: mediaGroup["media:content"]?.duration
      ? `${mediaGroup["media:content"].duration}s`
      : undefined,
    isShort: typeof link === "string" ? link.includes("/shorts/") : false,
  };
}

async function fetchChannelAvatar(
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
      signal: controller.signal,
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

// Cache for durations to avoid repeated fetches
const durationCache = new Map<
  string,
  { durations: Record<string, string>; timestamp: number }
>();
const DURATION_CACHE_TTL = 1000 * 60 * 60; // 1 hour

async function fetchDurationsFromInvidious(
  channelId: string,
  instanceUrl: string
): Promise<Record<string, string>> {
  const durations: Record<string, string> = {};

  // Check cache first
  const cached = durationCache.get(channelId);
  if (cached && Date.now() - cached.timestamp < DURATION_CACHE_TTL) {
    return cached.durations;
  }

  try {
    // Normalize instance URL - add https:// if missing
    let normalizedUrl = instanceUrl.trim();
    if (
      !normalizedUrl.startsWith("http://") &&
      !normalizedUrl.startsWith("https://")
    ) {
      normalizedUrl = "https://" + normalizedUrl;
    }
    // Ensure URL ends with /
    if (!normalizedUrl.endsWith("/")) {
      normalizedUrl += "/";
    }

    const url = `${normalizedUrl}api/v1/channels/${channelId}?fields=latestVideos`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 second timeout

    const res = await fetch(url, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(
        `[RSS] Invidious API error for ${instanceUrl}: HTTP ${res.status}`
      );
      return durations;
    }

    // Check if response is actually JSON before parsing
    const contentType = res.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      console.warn(
        `[RSS] Invidious API error for ${instanceUrl}: Expected JSON, got ${
          contentType || "unknown content-type"
        }`
      );
      return durations;
    }

    const data: any = await res.json();

    if (data.latestVideos && Array.isArray(data.latestVideos)) {
      for (const video of data.latestVideos) {
        if (video.videoId && typeof video.lengthSeconds === "number") {
          // Format duration as HH:MM:SS or MM:SS
          const seconds = video.lengthSeconds;
          const hours = Math.floor(seconds / 3600);
          const minutes = Math.floor((seconds % 3600) / 60);
          const secs = seconds % 60;

          let durationStr = "";
          if (hours > 0) {
            durationStr = `${hours}:${minutes
              .toString()
              .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
          } else {
            durationStr = `${minutes}:${secs.toString().padStart(2, "0")}`;
          }

          durations[video.videoId] = durationStr;
        }
      }
    }

    // Cache the result
    durationCache.set(channelId, { durations, timestamp: Date.now() });

    return durations;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[RSS] Failed to fetch durations from ${instanceUrl}: ${errorMsg}`
    );
    return durations;
  }
}

export async function fetchChannelFeed(channelId: string) {
  // Always fetch regular videos using UULF (videos only, no shorts, no livestreams)
  return fetchChannelFeedByType(channelId, "videos");
}

export async function fetchChannelFeedShorts(channelId: string) {
  // Fetch all content and filter for shorts
  return fetchChannelFeedByType(channelId, "shorts");
}

export async function fetchChannelFeedLivestreams(channelId: string) {
  // Fetch livestreams using UULV
  return fetchChannelFeedByType(channelId, "livestreams");
}

async function fetchChannelFeedByType(
  channelId: string,
  type: "videos" | "shorts" | "livestreams"
) {
  let playlistId = channelId;

  if (channelId.startsWith("UC")) {
    if (type === "videos") {
      // Videos only (no shorts, no livestreams)
      playlistId = "UULF" + channelId.slice(2);
    } else if (type === "livestreams") {
      // Livestreams only
      playlistId = "UULV" + channelId.slice(2);
    }
    // For shorts, use default channel_id to get all content, then filter
  }

  const feedUrl = `https://www.youtube.com/feeds/videos.xml?${
    playlistId.startsWith("UULF") || playlistId.startsWith("UULV")
      ? `playlist_id=${encodeURIComponent(playlistId)}`
      : `channel_id=${encodeURIComponent(channelId)}`
  }`;
  const res = await fetch(feedUrl, { next: { revalidate: 300 } });
  if (!res.ok) {
    console.error("[RSS] Failed to fetch channel feed", {
      channelId,
      feedUrl,
      status: res.status,
      statusText: res.statusText,
    });
    throw new Error(
      `Failed to fetch feed for channel ${channelId}: ${res.status} ${res.statusText}`
    );
  }
  const xml = await res.text();
  const parsed = parser.parse(xml);
  const feed = parsed?.feed;
  const entries = feed?.entry
    ? Array.isArray(feed.entry)
      ? feed.entry
      : [feed.entry]
    : [];

  const videos = entries
    .map((entry: any) => {
      const video = parseEntry(entry);
      if (video) {
        if (type === "livestreams") {
          video.isLivestream = true;
        } else if (type === "shorts" && !video.isShort) {
          // Filter out non-shorts when fetching shorts type
          return null;
        }
      }
      return video;
    })
    .filter(Boolean) as FeedVideo[];

  // Fetch durations from Invidious if enabled (only for regular videos, not shorts or livestreams)
  // Uses a timeout to prevent blocking the response too long
  if (type === "videos") {
    try {
      const settings = await readSettings();

      // Only fetch durations if explicitly enabled by user
      if (settings.enableVideoDuration) {
        const invidousUrl = settings.invidousInstance?.trim();

        // Check if instance URL is configured
        if (!invidousUrl) {
          console.warn(
            `[RSS] Video duration enabled but no Invidious instance URL configured`
          );
        } else {
          // Create a promise that fetches durations with a max wait time
          const durationPromise = fetchDurationsFromInvidious(
            channelId,
            invidousUrl
          );

          // Wait up to 15 seconds for durations to fetch
          const timeoutPromise = new Promise<Record<string, string>>(
            (resolve) => setTimeout(() => resolve({}), 15000)
          );

          const durations = await Promise.race([
            durationPromise,
            timeoutPromise,
          ]);

          // Update videos with durations
          for (const video of videos) {
            if (durations[video.id]) {
              video.duration = durations[video.id];
            }
          }

          const withDuration = videos.filter((v) => v.duration).length;
          if (withDuration === 0) {
            console.warn(
              `[RSS] No durations retrieved from ${invidousUrl} for channel ${channelId}`
            );
          }
        }
      }
    } catch (err) {
      // Silently fail - durations are optional
      console.debug(
        `[RSS] Error fetching durations:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  const channelTitle =
    entries[0]?.author?.name ||
    entries[0]?.["author"]?.["name"] ||
    videos[0]?.channelTitle ||
    (feed?.title && feed.title !== "Videos" ? feed.title : undefined) ||
    channelId ||
    "";
  // Prefer thumbnails already present in the feed; only fetch avatar if missing to avoid extra latency.
  const channelThumbnailFromFeed =
    entries[0]?.["media:group"]?.["media:thumbnail"]?.url ||
    entries[0]?.["media:thumbnail"]?.url ||
    (videos[0]?.thumbnail ? videos[0].thumbnail : undefined);

  const channelThumbnail = channelThumbnailFromFeed || undefined;

  const meta: ChannelMeta = {
    channelId,
    title: channelTitle,
    thumbnail: channelThumbnail,
    avatar: undefined, // Avatar fetched separately in background
  };

  // Debug: log empty channel titles
  if (!channelTitle) {
    console.warn("[RSS] Empty channel title from feed or entries", {
      channelId,
      feedTitle: feed?.title,
      firstEntryAuthor:
        entries[0]?.author?.name || entries[0]?.["author"]?.["name"],
      firstVideoChannelTitle: videos[0]?.channelTitle,
      feedKeys: feed ? Object.keys(feed) : [],
    });
  }

  return { videos, meta };
}

function getHandleFromPath(parts: string[]): string | null {
  const atHandle = parts.find((p) => p.startsWith("@"));
  if (atHandle) return atHandle;
  const cIndex = parts.indexOf("c");
  if (cIndex !== -1 && parts[cIndex + 1]) return `@${parts[cIndex + 1]}`;
  const userIndex = parts.indexOf("user");
  if (userIndex !== -1 && parts[userIndex + 1])
    return `@${parts[userIndex + 1]}`;
  return null;
}

export function extractChannelId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Direct channel ID
  if (/^UC[A-Za-z0-9_-]{21}[A-Za-z0-9_-]{1}$/.test(trimmed)) {
    return trimmed;
  }

  // Handle only (e.g., @somechannel)
  if (trimmed.startsWith("@")) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (url.searchParams.get("channel_id")) {
      return url.searchParams.get("channel_id");
    }
    const pathParts = url.pathname.split("/").filter(Boolean);
    const channelIndex = pathParts.indexOf("channel");
    if (channelIndex !== -1 && pathParts[channelIndex + 1]) {
      return pathParts[channelIndex + 1];
    }
    const handle = getHandleFromPath(pathParts);
    if (handle) {
      return null; // will resolve via handle lookup
    }
  } catch {
    // Not a URL; fall through
  }

  return null;
}

async function resolveHandleToChannelId(
  handle: string
): Promise<string | null> {
  const cleanHandle = handle.startsWith("@") ? handle : `@${handle}`;
  const pageUrl = `https://www.youtube.com/${cleanHandle}`;

  const headers = {
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "accept-language": "en-US,en;q=0.8",
    cookie: "CONSENT=YES+1",
  };

  try {
    const res = await fetch(`${pageUrl}?hl=en&gl=US`, {
      cache: "no-store",
      headers,
    });
    if (!res.ok) {
      console.warn("[RSS] Handle resolution: Page fetch failed", {
        handle: cleanHandle,
        pageUrl,
        status: res.status,
      });
      return null;
    }
    const html = await res.text();

    // Look for the canonical URL first, which directly contains the channel handle
    // This is the most reliable way to get the correct channel ID
    const canonicalMatch = html.match(
      /<link\s+rel="canonical"\s+href="https:\/\/www\.youtube\.com\/([^"]+)"/
    );
    if (canonicalMatch) {
      const canonicalPath = canonicalMatch[1];
      // If it redirects to a channel ID, extract it
      if (canonicalPath.startsWith("channel/")) {
        const channelId = canonicalPath.replace("channel/", "");
        if (/^UC[A-Za-z0-9_-]{22}$/.test(channelId)) {
          return channelId;
        }
      }
    }

    // Fallback: Look for ytInitialData with the channel's own metadata
    // This appears early in the page and contains the page's own channel info
    const initialDataMatch = html.match(/var ytInitialData = ({.*?});/);
    if (initialDataMatch) {
      try {
        const data = JSON.parse(initialDataMatch[1]);
        // Navigate through the initial data structure to find the channel ID
        // This is more reliable than regex on the whole page
        const channelId =
          data?.metadata?.channelMetadataRenderer?.externalId ||
          data?.metadata?.playlistMetadataRenderer?.externalId ||
          data?.microformat?.microformatDataRenderer?.externalId;
        if (channelId && /^UC[A-Za-z0-9_-]{22}$/.test(channelId)) {
          return channelId;
        }
      } catch (e) {
        // JSON parse failed, continue with regex fallback
      }
    }

    // Fallback: Search for channelId in the initial data, preferring the first occurrence
    // which is typically the page's own channel
    const regexes = [
      /"externalId":"(UC[A-Za-z0-9_-]{22})"/,
      /"channelId":"(UC[A-Za-z0-9_-]{22})"/,
      /"browseId":"(UC[A-Za-z0-9_-]{22})"/,
    ];

    for (const r of regexes) {
      const m = html.match(r);
      if (m?.[1]) {
        const channelId = m[1].replace(/["\s]/g, "");
        if (/^UC[A-Za-z0-9_-]{22}$/.test(channelId)) {
          return channelId;
        }
      }
    }

    return null;
  } catch (err) {
    console.error("[RSS] Handle resolution error", {
      handle: cleanHandle,
      pageUrl,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function resolveChannelId(input: string): Promise<string | null> {
  const direct = extractChannelId(input);
  if (direct) return direct;

  const trimmed = input.trim();
  if (trimmed.startsWith("@")) {
    return resolveHandleToChannelId(trimmed);
  }

  try {
    const url = new URL(trimmed);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const handle = getHandleFromPath(pathParts);
    if (handle) {
      return resolveHandleToChannelId(handle);
    }
  } catch {
    // not a url
  }

  return null;
}
