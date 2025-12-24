/**
 * Singleton Feed Manager
 * Ensures only one data fetch happens regardless of component instances
 */

import { Video } from "./mockData";

type FeedData = {
  videos: Video[];
  shorts: Video[];
  livestreams: Video[];
  loading: boolean;
  fetching: boolean; // Background refresh in progress
  error: string | null;
};

type Listener = (data: FeedData) => void;

const CACHE_KEY = "tubeshelf_feed_cache";

class FeedManager {
  private static instance: FeedManager;
  private data: FeedData = {
    videos: [],
    shorts: [],
    livestreams: [],
    loading: false,
    fetching: false,
    error: null,
  };
  private listeners: Set<Listener> = new Set();
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private hasCachedData = false;

  private constructor() {}

  private loadCache(): FeedData | null {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const data = JSON.parse(cached);
        // Return cached data with loading: false so it displays immediately
        return { ...data, loading: false, error: null };
      }
    } catch (e) {
      console.error("Failed to load cache:", e);
    }
    return null;
  }

  private saveCache() {
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          videos: this.data.videos,
          shorts: this.data.shorts,
          livestreams: this.data.livestreams,
        })
      );
    } catch (e) {
      console.error("Failed to save cache:", e);
    }
  }

  private arraysHaveSameIds(arr1: Video[], arr2: Video[]): boolean {
    if (arr1.length !== arr2.length) return false;
    const ids1 = new Set(arr1.map((v) => v.id));
    const ids2 = new Set(arr2.map((v) => v.id));
    if (ids1.size !== ids2.size) return false;
    for (const id of ids1) {
      if (!ids2.has(id)) return false;
    }
    return true;
  }

  static getInstance(): FeedManager {
    if (!FeedManager.instance) {
      FeedManager.instance = new FeedManager();
    }
    return FeedManager.instance;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);

    // Load cache on first subscription if not already loaded
    if (this.listeners.size === 1 && !this.initialized) {
      const cached = this.loadCache();
      if (
        cached &&
        (cached.videos.length > 0 ||
          cached.shorts.length > 0 ||
          cached.livestreams.length > 0)
      ) {
        this.data = cached;
        this.hasCachedData = true;
      }
    }

    // Immediately notify with current data (cached or empty)
    listener(this.data);

    // Auto-initialize on first subscription to fetch fresh data
    if (!this.initialized && !this.initPromise) {
      this.initialize();
    }

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((listener) => listener(this.data));
  }

  private updateData(updates: Partial<FeedData>) {
    this.data = { ...this.data, ...updates };
    this.notify();
  }

  async initialize() {
    if (this.initialized) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      // Show fetching state to indicate background refresh
      // Show loading only if we don't have cached data
      if (!this.hasCachedData) {
        this.updateData({ loading: true, fetching: true, error: null });
      } else {
        this.updateData({ fetching: true, error: null });
      }

      try {
        const streamUrl = `/api/feed/stream?refresh=false`;

        const response = await fetch(streamUrl);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        if (!response.body) {
          throw new Error("No response body");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        const videos: Video[] = [];
        const shorts: Video[] = [];
        const livestreams: Video[] = [];

        let buffer = "";
        const videoIds = new Set<string>();
        let batchCounter = 0;
        const BATCH_SIZE = 10; // Update UI every 10 videos

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const rawVideo = JSON.parse(line.slice(6));
                const videoId = rawVideo.id || rawVideo.videoId;

                if (videoIds.has(videoId)) continue;
                videoIds.add(videoId);

                // Normalize thumbnail URL to basic format without expiring query params
                const getThumbnailUrl = (
                  thumb: string | undefined,
                  id: string
                ) => {
                  if (!thumb)
                    return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
                  // Extract video ID from thumbnail URL and use basic format
                  const match = thumb.match(/\/vi\/([^\/]+)\//);
                  return match
                    ? `https://i.ytimg.com/vi/${match[1]}/hqdefault.jpg`
                    : thumb;
                };

                const video: Video = {
                  id: videoId,
                  title: rawVideo.title || "Untitled",
                  channel:
                    rawVideo.channelTitle ||
                    rawVideo.uploaderName ||
                    rawVideo.channel ||
                    "Unknown Channel",
                  channelId: rawVideo.channelId || rawVideo.uploaderId || "",
                  thumbnail: getThumbnailUrl(
                    rawVideo.thumbnail || rawVideo.thumbnailUrl,
                    videoId
                  ),
                  duration: String(rawVideo.duration || "—"),
                  views: rawVideo.viewCount || rawVideo.views || 0,
                  uploadedAt:
                    rawVideo.publishedAt ||
                    rawVideo.uploadDate ||
                    rawVideo.uploaded ||
                    new Date().toISOString(),
                  url:
                    rawVideo.url ||
                    `https://www.youtube.com/watch?v=${videoId}`,
                  isShort:
                    rawVideo.isShort || rawVideo.shortFormContent || false,
                  isLivestream: rawVideo.isLivestream || false,
                  isMemberOnly:
                    rawVideo.isMemberOnly ||
                    rawVideo.membersOnly ||
                    rawVideo.isMembersOnly ||
                    rawVideo.isForMembers ||
                    false,
                };

                if (video.isShort) {
                  shorts.push(video);
                } else if (video.isLivestream) {
                  livestreams.push(video);
                } else {
                  videos.push(video);
                }

                batchCounter++;
                // Update data progressively in batches
                // Skip progressive updates if we have cached data to prevent flickering
                if (batchCounter >= BATCH_SIZE) {
                  if (!this.hasCachedData) {
                    console.log(`Progressive update: ${videos.length} videos`);
                    // Turn off loading after first batch to show videos
                    this.updateData({
                      videos: [...videos],
                      shorts: [...shorts],
                      livestreams: [...livestreams],
                      loading: false, // Show videos as they arrive
                    });
                  }
                  batchCounter = 0;
                }
              } catch (e) {
                console.error("[FeedManager] Failed to parse line:", e);
              }
            }
          }
        }

        // Final update for any remaining videos
        // Only update if data actually changed (prevents visual flicker when cache matches fresh data)
        const dataChanged =
          this.data.videos.length !== videos.length ||
          this.data.shorts.length !== shorts.length ||
          this.data.livestreams.length !== livestreams.length ||
          // Also check if the video IDs changed (different videos, not just reordered)
          !this.arraysHaveSameIds(this.data.videos, videos) ||
          !this.arraysHaveSameIds(this.data.shorts, shorts) ||
          !this.arraysHaveSameIds(this.data.livestreams, livestreams);

        if (dataChanged || !this.hasCachedData) {
          this.updateData({
            videos: [...videos],
            shorts: [...shorts],
            livestreams: [...livestreams],
            loading: false,
            fetching: false,
          });
        } else {
          // Don't update arrays - keep showing cached data
          // Just update fetching/loading states
          this.updateData({ loading: false, fetching: false });
        }

        this.initialized = true;

        // Save to cache for next page load
        this.saveCache();
      } catch (err) {
        console.error("[FeedManager] Error:", err);
        this.updateData({
          error: err instanceof Error ? err.message : "Failed to fetch feed",
          loading: false,
          fetching: false,
        });
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  async refresh() {
    this.initialized = false;
    // Don't clear hasCachedData - keep showing cached videos while refreshing
    // This prevents flicker during manual refresh
    return this.initialize();
  }

  getData(): FeedData {
    return this.data;
  }
}

export const feedManager = FeedManager.getInstance();
