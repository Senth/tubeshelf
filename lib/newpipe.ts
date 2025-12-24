/**
 * NewPipe-inspired YouTube data fetcher
 *
 * This module implements a YouTube data fetcher using similar techniques to NewPipe:
 * - Direct HTML scraping from YouTube pages
 * - No API keys required
 * - Extracts channel videos, metadata, and durations
 *
 * Unlike RSS feeds which are limited to ~15 recent videos, this can fetch more videos
 * and includes duration data natively.
 */

export interface NewPipeVideo {
  id: string;
  title: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  url: string;
  thumbnail?: string;
  duration?: string;
  viewCount?: number;
  isShort?: boolean;
  isLivestream?: boolean;
}

export interface NewPipeChannelMeta {
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
        console.warn("[NewPipe] Failed to parse ytInitialData:", e);
      }
    }
  }

  return null;
}

/**
 * Format seconds into HH:MM:SS or MM:SS duration string
 */
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Parse duration string like "PT4M13S" to seconds
 */
function parseDuration(duration: string): number {
  if (!duration || !duration.startsWith("PT")) return 0;

  const hourMatch = duration.match(/(\d+)H/);
  const minuteMatch = duration.match(/(\d+)M/);
  const secondMatch = duration.match(/(\d+)S/);

  const hours = hourMatch ? parseInt(hourMatch[1]) : 0;
  const minutes = minuteMatch ? parseInt(minuteMatch[1]) : 0;
  const seconds = secondMatch ? parseInt(secondMatch[1]) : 0;

  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Parse video renderer data from YouTube's internal format
 */
function parseVideoRenderer(renderer: any): NewPipeVideo | null {
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

    // Detect shorts and livestreams
    const isShort =
      renderer.thumbnailOverlays?.some(
        (overlay: any) =>
          overlay.thumbnailOverlayTimeStatusRenderer?.style === "SHORTS"
      ) || false;

    const isLivestream =
      renderer.badges?.some(
        (badge: any) =>
          badge.metadataBadgeRenderer?.style === "BADGE_STYLE_TYPE_LIVE_NOW"
      ) || false;

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
      isShort,
      isLivestream,
    };
  } catch (error) {
    console.warn("[NewPipe] Failed to parse video renderer:", error);
    return null;
  }
}

/**
 * Fetch channel videos using NewPipe-style scraping
 */
export async function fetchChannelVideos(
  channelId: string,
  options: {
    type?: "videos" | "shorts" | "livestreams";
    limit?: number;
  } = {}
): Promise<{ videos: NewPipeVideo[]; meta: NewPipeChannelMeta }> {
  const { type = "videos", limit = 30 } = options;

  let url = `https://www.youtube.com/channel/${channelId}`;

  // Add tab parameter based on type
  if (type === "videos") {
    url += "/videos";
  } else if (type === "shorts") {
    url += "/shorts";
  } else if (type === "livestreams") {
    url += "/streams";
  }

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    Cookie: "CONSENT=YES+1",
  };

  try {
    console.log(`[NewPipe] Fetching ${type} for channel ${channelId}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

    const response = await fetch(`${url}?hl=en&gl=US`, {
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
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
        // Videos/Shorts tab
        const contents = richGrid.contents || [];
          videoRenderers = contents
            .map((item: any) => {
              const content = item.richItemRenderer?.content || {};
              return (
                content.videoRenderer ||
                content.gridVideoRenderer ||
                content.shortRenderer ||
                content.shortsVideoRenderer ||
                content.reelItemRenderer ||
                content.gridShortsRenderer ||
                null
              );
            })
            .filter(Boolean);
      } else if (sectionList) {
        // Livestreams tab or alternative layout
        const sections = sectionList.contents || [];
        for (const section of sections) {
          const itemSection = section.itemSectionRenderer;
          if (itemSection) {
            const contents = itemSection.contents || [];
            videoRenderers.push(
              ...contents
                  .map((item: any) =>
                    item.videoRenderer ||
                    item.gridVideoRenderer ||
                    item.shortRenderer ||
                    item.shortsVideoRenderer ||
                    item.reelItemRenderer ||
                    null
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
      .filter((v): v is NewPipeVideo => v !== null)
      .slice(0, limit);

    // Filter based on type
    // Note: rely less strictly on the parsed flags for shorts/livestreams
    // because YouTube's renderer structure can change. When requesting the
    // dedicated "shorts" or "livestreams" tab, assume the returned
    // renderers are of that type and accept them. For the regular
    // "videos" tab, exclude detected shorts/livestreams as before.
    const filteredVideos = videos.filter((video) => {
      if (type === "shorts") return true; // accept all from /shorts
      if (type === "livestreams") return true; // accept all from /streams
      if (type === "videos") return !video.isShort && !video.isLivestream;
      return true;
    });

    // Ensure items fetched from the dedicated tabs are flagged correctly
    if (type === "shorts") {
      filteredVideos.forEach((v) => (v.isShort = true));
    }
    if (type === "livestreams") {
      filteredVideos.forEach((v) => (v.isLivestream = true));
    }

    console.log(
      `[NewPipe] Found ${filteredVideos.length} ${type} for channel ${channelId}`
    );

    const meta: NewPipeChannelMeta = {
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

    return { videos: filteredVideos, meta };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[NewPipe] Failed to fetch channel ${type}:`, errorMsg);

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
  return fetchChannelVideos(channelId, { type: "videos" });
}

/**
 * Fetch shorts for a channel
 */
export async function fetchChannelFeedShorts(channelId: string) {
  return fetchChannelVideos(channelId, { type: "shorts" });
}

/**
 * Fetch livestreams for a channel
 */
export async function fetchChannelFeedLivestreams(channelId: string) {
  return fetchChannelVideos(channelId, { type: "livestreams" });
}

/**
 * Convert NewPipe video format to RSS-compatible format
 */
export function newPipeToRSSFormat(video: NewPipeVideo): any {
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
    isShort: video.isShort,
    isLivestream: video.isLivestream,
  };
}
