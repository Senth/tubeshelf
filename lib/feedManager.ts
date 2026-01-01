/**
 * Singleton Feed Manager
 * Ensures only one data fetch happens regardless of component instances
 */

import { Video } from "./mockData";

type FeedData = {
  videos: Video[];
  loading: boolean;
  fetching: boolean; // Background refresh in progress
  error: string | null;
  currentChannelTitle?: string | null;
};

type Listener = (data: FeedData) => void;

const CACHE_KEY = "tubeshelf_feed_cache";

class FeedManager {
  private static instance: FeedManager;
  private data: FeedData = {
    videos: [],
    loading: false,
    fetching: false,
    error: null,
    currentChannelTitle: null,
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
      if (cached && cached.videos && cached.videos.length > 0) {
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
        const response = await fetch(`/api/feed?refresh=false`);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const json = await response.json();
        const items = json.items || [];

        const videos: Video[] = items.map((raw: any) => ({
          id: raw.id || raw.videoId,
          title: raw.title || "Untitled",
          channel:
            raw.channelTitle ||
            raw.uploaderName ||
            raw.channel ||
            "Unknown Channel",
          channelId: raw.channelId || raw.uploaderId || "",
          thumbnail:
            raw.thumbnail ||
            raw.thumbnailUrl ||
            `https://i.ytimg.com/vi/${raw.id || raw.videoId}/hqdefault.jpg`,
          duration: raw.duration,
          views: raw.viewCount ?? raw.views,
          uploadedAt:
            raw.publishedAt ||
            raw.uploadDate ||
            raw.uploaded ||
            new Date().toISOString(),
          url:
            raw.url ||
            `https://www.youtube.com/watch?v=${raw.id || raw.videoId}`,
          isMemberOnly: raw.isMemberOnly || raw.membersOnly || false,
        }));

        // Only update if data actually changed (prevents visual flicker when cache matches fresh data)
        const dataChanged =
          this.data.videos.length !== videos.length ||
          !this.arraysHaveSameIds(this.data.videos, videos);

        if (dataChanged || !this.hasCachedData) {
          this.updateData({
            videos,
            loading: false,
            fetching: false,
            currentChannelTitle: null,
          });
        } else {
          // Don't update arrays - keep showing cached data
          // Just update fetching/loading states
          this.updateData({
            loading: false,
            fetching: false,
            currentChannelTitle: null,
          });
        }

        this.initialized = true;
        this.saveCache();
      } catch (err) {
        console.error("[FeedManager] Error:", err);
        this.updateData({
          error: err instanceof Error ? err.message : "Failed to fetch feed",
          loading: false,
          fetching: false,
          currentChannelTitle: null,
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
