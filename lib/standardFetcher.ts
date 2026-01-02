/**
 * Standard YouTube data fetcher
 *
 * This module implements a YouTube data fetcher using web scraping techniques:
 * - Direct HTML scraping from YouTube pages
 * - No API keys required
 * - Extracts channel videos, metadata, and durations
 *
 * Unlike RSS feeds which are limited to ~15 recent videos, this can fetch more videos
 * and includes duration data natively.
 */

export interface StandardVideo {
  id: string;
  title: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  url: string;
  thumbnail?: string;
  duration?: string;
  viewCount?: number;
  isMemberOnly?: boolean;
}

export interface StandardChannelMeta {
  channelId: string;
  title: string;
  thumbnail?: string;
  avatar?: string;
  subscriberCount?: string;
}

/**
 * Extract initial data from YouTube HTML page
 */
function extractYouTubeInitialData(html: string): any {
  // Try to find ytInitialData in the HTML
  const patterns = [
    /var ytInitialData = ({.+?});/,
    /window\["ytInitialData"\] = ({.+?});/,
    /ytInitialData = ({.+?});<\/script>/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      try {
        return JSON.parse(match[1]);
      } catch (e) {
        console.warn("[StandardFetcher] Failed to parse ytInitialData:", e);
      }
    }
  }

  return null;
}

// duration formatting/parsing helpers were removed as they were unused

/**
 * Parse video renderer data from YouTube's internal format
 */
function parseVideoRenderer(renderer: any): StandardVideo | null {
  try {
    const videoId = renderer.videoId;
    if (!videoId) return null;

    const title =
      renderer.title?.runs?.[0]?.text || renderer.title?.simpleText || "";
    const channelName =
      renderer.ownerText?.runs?.[0]?.text ||
      renderer.shortBylineText?.runs?.[0]?.text ||
      "";
    const channelId =
      renderer.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint
        ?.browseId ||
      renderer.shortBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint
        ?.browseId ||
      "";

    // Get thumbnail
    const thumbnails = renderer.thumbnail?.thumbnails || [];
    const thumbnail =
      thumbnails.length > 0
        ? thumbnails[thumbnails.length - 1]?.url
        : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    // Parse duration
    let duration: string | undefined;
    const lengthText =
      renderer.lengthText?.simpleText ||
      renderer.lengthText?.accessibility?.accessibilityData?.label;
    if (lengthText) {
      duration = lengthText;
    } else if (renderer.thumbnailOverlays) {
      // Check for duration in thumbnail overlays
      for (const overlay of renderer.thumbnailOverlays) {
        const timeText =
          overlay.thumbnailOverlayTimeStatusRenderer?.text?.simpleText;
        if (timeText) {
          duration = timeText;
          break;
        }
      }
    }

    // Parse published date
    const publishedText = renderer.publishedTimeText?.simpleText || "";
    let publishedAt = new Date().toISOString();

    // Try to parse relative time like "2 hours ago", "3 days ago"
    if (publishedText) {
      const now = new Date();
      const timeMatch = publishedText.match(
        /(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i
      );
      if (timeMatch) {
        const value = parseInt(timeMatch[1]);
        const unit = timeMatch[2].toLowerCase();

        switch (unit) {
          case "second":
            now.setSeconds(now.getSeconds() - value);
            break;
          case "minute":
            now.setMinutes(now.getMinutes() - value);
            break;
          case "hour":
            now.setHours(now.getHours() - value);
            break;
          case "day":
            now.setDate(now.getDate() - value);
            break;
          case "week":
            now.setDate(now.getDate() - value * 7);
            break;
          case "month":
            now.setMonth(now.getMonth() - value);
            break;
          case "year":
            now.setFullYear(now.getFullYear() - value);
            break;
        }
        publishedAt = now.toISOString();
      }
    }

    // Parse view count
    let viewCount: number | undefined;
    const viewText =
      renderer.viewCountText?.simpleText ||
      renderer.shortViewCountText?.simpleText ||
      "";
    const viewMatch = viewText.match(/([\d,\.]+)\s*[KMB]?\s*views?/i);
    if (viewMatch) {
      let views = viewMatch[1].replace(/,/g, "");
      const multiplierMatch = viewText.match(/([\d,\.]+)\s*([KMB])\s*views?/i);
      if (multiplierMatch) {
        const base = parseFloat(multiplierMatch[1]);
        const multiplier = multiplierMatch[2];
        if (multiplier === "K") views = String(base * 1000);
        else if (multiplier === "M") views = String(base * 1000000);
        else if (multiplier === "B") views = String(base * 1000000000);
      }
      viewCount = parseInt(views);
    }

    // Detect members-only videos via badges, explicit flags, or embedded text
    let isMemberOnly = false;
    try {
      if (
        renderer.isForMembers ||
        renderer.forMembershipsOnly ||
        renderer.membersOnly ||
        renderer.isMembersOnly
      ) {
        isMemberOnly = true;
      }

      const badgeCandidates =
        renderer.badges || renderer.ownerBadges || renderer.badgeMeta || [];
      if (Array.isArray(badgeCandidates)) {
        for (const b of badgeCandidates) {
          const text = (
            b?.label ||
            b?.metadata?.label ||
            b?.badgeRenderer?.label ||
            ""
          )
            .toString()
            .toLowerCase();
          if (text.includes("member") || text.includes("members")) {
            isMemberOnly = true;
            break;
          }
          const style = b?.badgeRenderer?.style || "";
          if (
            typeof style === "string" &&
            style.toLowerCase().includes("member")
          ) {
            isMemberOnly = true;
            break;
          }
        }
      }
    } catch (e) {
      // ignore detection errors
    }

    // Additional heuristic: search renderer fields for 'member' text
    const containsMemberText = (val: any, depth = 0): boolean => {
      if (depth > 6 || val == null) return false;
      if (typeof val === "string")
        return /members?[-\s]?only|for members|member(s)?/i.test(val);
      if (typeof val === "number" || typeof val === "boolean") return false;
      if (Array.isArray(val)) {
        for (const el of val)
          if (containsMemberText(el, depth + 1)) return true;
        return false;
      }
      if (typeof val === "object") {
        // iterate over more keys to catch nested metadata
        const keys = Object.keys(val).slice(0, 100);
        for (const k of keys) {
          try {
            if (containsMemberText(val[k], depth + 1)) return true;
          } catch {}
        }
      }
      return false;
    };

    try {
      if (!isMemberOnly && containsMemberText(renderer)) {
        isMemberOnly = true;
      }
    } catch {}

    return {
      id: videoId,
      title,
      channelId,
      channelTitle: channelName,
      publishedAt,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnail: thumbnail.startsWith("//") ? `https:${thumbnail}` : thumbnail,
      duration,
      viewCount,
      isMemberOnly,
    };
  } catch (error) {
    console.warn("[StandardFetcher] Failed to parse video renderer:", error);
    return null;
  }
}

/**
 * Fetch channel videos using standard web scraping
 */
export async function fetchChannelVideos(
  channelId: string,
  options: {
    limit?: number;
  } = {}
): Promise<{ videos: StandardVideo[]; meta: StandardChannelMeta }> {
  const { limit = 30 } = options;

  const url = `https://www.youtube.com/channel/${channelId}/videos`;

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    Cookie: "CONSENT=YES+1",
  };

  try {
    // Debug/info only: fetching starts
    // Use logger so default LOG_LEVEL (error) suppresses this in production
    // and you can enable it with LOG_LEVEL=debug
    const { debug } = await import("@/lib/logger");
    debug(`[StandardFetcher] Fetching videos for channel ${channelId}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

    const response = await fetch(`${url}?hl=en&gl=US`, {
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      // Explicitly log 404s so the container logs contain channel diagnostics
      if (response.status === 404) {
        console.error(
          `[StandardFetcher] Channel page returned 404 for ${channelId} -> ${url}`
        );
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const initialData = extractYouTubeInitialData(html);

    if (!initialData) {
      throw new Error("Failed to extract YouTube data from page");
    }

    // Extract channel metadata
    const channelHeader =
      initialData.header?.c4TabbedHeaderRenderer ||
      initialData.header?.pageHeaderRenderer;
    const channelTitle =
      channelHeader?.title ||
      channelHeader?.content?.pageHeaderViewModel?.title?.dynamicTextViewModel
        ?.text?.content ||
      "";
    const channelAvatar =
      channelHeader?.avatar?.thumbnails?.[0]?.url ||
      channelHeader?.image?.decoratedAvatarViewModel?.avatar?.avatarViewModel
        ?.image?.sources?.[0]?.url;
    const subscriberText = channelHeader?.subscriberCountText?.simpleText || "";

    // Find the video list
    const tabs =
      initialData.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
    let videoRenderers: any[] = [];

    for (const tab of tabs) {
      const tabRenderer = tab.tabRenderer;
      if (!tabRenderer || !tabRenderer.selected) continue;

      const content = tabRenderer.content;
      const richGrid = content?.richGridRenderer;
      const sectionList = content?.sectionListRenderer;

      if (richGrid) {
        const contents = richGrid.contents || [];
        videoRenderers = contents
          .map((item: any) => {
            const content = item.richItemRenderer?.content || {};
            return content.videoRenderer || content.gridVideoRenderer || null;
          })
          .filter(Boolean);
      } else if (sectionList) {
        const sections = sectionList.contents || [];
        for (const section of sections) {
          const itemSection = section.itemSectionRenderer;
          if (itemSection) {
            const contents = itemSection.contents || [];
            videoRenderers.push(
              ...contents
                .map(
                  (item: any) =>
                    item.videoRenderer || item.gridVideoRenderer || null
                )
                .filter(Boolean)
            );
          }
        }
      }
    }

    // Parse videos
    const videos = videoRenderers
      .map(parseVideoRenderer)
      .filter((v): v is StandardVideo => v !== null)
      .slice(0, limit);

    const { debug: dbg } = await import("@/lib/logger");
    dbg(
      `[StandardFetcher] Found ${videos.length} videos for channel ${channelId}`
    );

    const meta: StandardChannelMeta = {
      channelId,
      title: channelTitle,
      avatar: channelAvatar?.startsWith("//")
        ? `https:${channelAvatar}`
        : channelAvatar,
      thumbnail: channelAvatar?.startsWith("//")
        ? `https:${channelAvatar}`
        : channelAvatar,
      subscriberCount: subscriberText,
    };

    return { videos, meta };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(
      `[StandardFetcher] Failed to fetch channel videos:`,
      errorMsg
    );

    // Return empty result instead of throwing
    return {
      videos: [],
      meta: {
        channelId,
        title: "",
        thumbnail: undefined,
        avatar: undefined,
      },
    };
  }
}

/**
 * Fetch regular videos for a channel
 */
export async function fetchChannelFeed(channelId: string) {
  return fetchChannelVideos(channelId, {});
}

/**
 * Convert standard video format to RSS-compatible format
 */
export function standardToRSSFormat(video: StandardVideo): any {
  return {
    id: video.id,
    videoId: video.id,
    title: video.title,
    channelId: video.channelId,
    channelTitle: video.channelTitle,
    publishedAt: video.publishedAt,
    url: video.url,
    thumbnail: video.thumbnail,
    duration: video.duration,
    viewCount: video.viewCount,
    views: video.viewCount,
    isMemberOnly: !!video.isMemberOnly,
  };
}
