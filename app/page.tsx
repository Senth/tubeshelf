"use client";

import { useState, useEffect, useContext, useRef, useMemo } from "react";
import { ThemeContext } from "@/components/ThemeProvider";
import {
  Play,
  Search,
  Settings,
  Bookmark,
  List,
  X,
  RefreshCw,
  Zap,
  RadioTower,
} from "lucide-react";
import { VideoCard } from "@/components/VideoCard";
import { VideoCardSkeleton } from "@/components/VideoCardSkeleton";
import { SubscriptionManager } from "@/components/SubscriptionManager";
import { SettingsPanel } from "@/components/SettingsPanel";
import { WatchLater } from "@/components/WatchLater";
import { LoadingProgress } from "@/components/LoadingProgress";
import { WelcomeWizard, type WelcomeOptions } from "@/components/WelcomeWizard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  getVideos,
  addSubscription,
  removeSubscription,
  importSubscriptions,
  exportSubscriptions,
  getSettings,
  updateSettings,
  clearWatchHistory,
  resetAllSettings,
  Video,
  Subscription,
} from "@/lib/mockData";
import type { AppSettings } from "@/lib/settingsStore";
import type {
  SubscriptionList,
  SubscriptionListsData,
} from "@/lib/subscriptionListStore";

type Page = "home" | "watch-later";
type FeedTab = "videos" | "shorts" | "livestreams";

interface WatchLaterItem {
  id: string;
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  addedAt: Date;
}

export default function Home() {
  const { theme } = useContext(ThemeContext);
  const [mounted, setMounted] = useState(false);
  const [currentPage, setCurrentPage] = useState<Page>("home");
  const [feedTab, setFeedTab] = useState<FeedTab>("videos");
  const [videos, setVideos] = useState<Video[]>([]);
  const [shorts, setShorts] = useState<Video[]>([]);
  const [livestreams, setLivestreams] = useState<Video[]>([]);
  const [watchLater, setWatchLater] = useState<WatchLaterItem[]>([]);
  const [watchedVideos, setWatchedVideos] = useState<Set<string>>(new Set());
  const [showSubscriptions, setShowSubscriptions] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredVideos, setFilteredVideos] = useState<Video[]>([]);
  const [filteredShorts, setFilteredShorts] = useState<Video[]>([]);
  const [filteredLivestreams, setFilteredLivestreams] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hideWatched, setHideWatched] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [subscriptionLists, setSubscriptionLists] = useState<
    SubscriptionList[]
  >([]);
  const [currentListId, setCurrentListId] = useState<string>("default");
  const [filterListId, setFilterListId] = useState<string>("all");
  const [showLoadingProgress, setShowLoadingProgress] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [progress, setProgress] = useState<{
    completed: number;
    total: number;
    currentChannelTitle?: string;
  } | null>(null);
  const refreshingRef = useRef(false);
  const initialLoadRef = useRef(false);
  const [showWelcomeWizard, setShowWelcomeWizard] = useState(false);
  const [welcomeCompleted, setWelcomeCompleted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!showLoadingProgress) {
      setProgress(null);
      return;
    }

    const eventSource = new EventSource("/api/feed/progress");
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setProgress(data);
      } catch (e) {
        console.error("Failed to parse progress:", e);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [showLoadingProgress]);

  const refreshData = async (forceRefresh = false) => {
    // Prevent concurrent or duplicate refreshes (e.g., React Strict Mode)
    if (refreshingRef.current) return;
    refreshingRef.current = true;

    // Only show full loading state on initial load (when there are no videos yet)
    const isInitialLoad = videos.length === 0;
    if (isInitialLoad) {
      setLoading(true);
    }

    setError(null);
    setShowLoadingProgress(true);
    setIsRefreshing(true);
    try {
      // Fetch lists first and independently
      const listsRes = await fetch("/api/subscription-lists");
      const listsData = await listsRes.json();
      setSubscriptionLists(listsData.lists || []);
      setCurrentListId((prevId) => {
        const listStillExists = (listsData.lists || []).some(
          (l: any) => l.id === prevId
        );
        return prevId && listStillExists ? prevId : "default";
      });

      // Then fetch videos with streaming
      try {
        const response = await fetch(
          `/api/feed/stream?refresh=${forceRefresh}`
        );

        console.log("[Stream] Starting stream...");
        if (!response.ok) throw new Error("Failed to fetch videos stream");

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (reader) {
          // Reset current lists to avoid duplicate counts on refresh
          setVideos([]);
          setShorts([]);
          setLivestreams([]);
          setFilteredVideos([]);
          setFilteredShorts([]);
          setFilteredLivestreams([]);

          let buffer = "";
          const videoIds = new Set<string>();
          let videoCount = 0;
          let hasReceivedFirstVideo = false;

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

                  // Transform raw API response to Video interface
                  const video = {
                    id: videoId,
                    title: rawVideo.title || "",
                    channel: rawVideo.channelTitle || "Unknown",
                    channelId: rawVideo.channelId || "",
                    thumbnail:
                      rawVideo.thumbnail ||
                      (videoId
                        ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
                        : "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=400&h=225&fit=crop"),
                    duration: rawVideo.duration || "—",
                    uploadedAt:
                      rawVideo.publishedAt || new Date().toISOString(),
                    views: rawVideo.viewCount || rawVideo.views,
                    isShort: rawVideo.isShort || false,
                    isLivestream: rawVideo.isLivestream || false,
                    url:
                      rawVideo.url ||
                      (videoId
                        ? `https://www.youtube.com/watch?v=${videoId}`
                        : ""),
                  };

                  if (!videoIds.has(videoId)) {
                    videoIds.add(videoId);
                    videoCount++;

                    // Hide loading overlay once first video arrives
                    if (!hasReceivedFirstVideo) {
                      setLoading(false);
                      hasReceivedFirstVideo = true;
                    }

                    // Update state immediately as videos arrive
                    if (!video.isShort && !video.isLivestream) {
                      setVideos((prev) => {
                        const updated = [...prev, video];
                        return updated;
                      });
                      setFilteredVideos((prev) => {
                        const updated = [...prev, video];
                        return updated;
                      });
                    } else if (video.isShort) {
                      setShorts((prev) => {
                        const updated = [...prev, video];
                        return updated;
                      });
                      setFilteredShorts((prev) => {
                        const updated = [...prev, video];
                        return updated;
                      });
                    } else if (video.isLivestream) {
                      console.log("[Stream] Adding livestream:", videoId);
                      setLivestreams((prev) => {
                        const updated = [...prev, video];
                        console.log(
                          "[Stream] Livestreams state now has",
                          updated.length,
                          "items"
                        );
                        return updated;
                      });
                    }
                  }
                } catch (e) {
                  console.error(
                    "[Stream] Failed to parse line:",
                    e,
                    "line:",
                    line
                  );
                  // Continue if line is not valid JSON
                }
              }
            }
          }
        }
      } catch (vidErr) {
        console.error("Failed to fetch videos:", vidErr);
        // Fall back to regular feed endpoint
        console.log("[Stream] Falling back to regular /api/feed endpoint");
        try {
          const vids = await getVideos(forceRefresh);
          console.log("[Fallback] Received", vids.length, "videos");
          setVideos(vids.filter((v) => !v.isShort && !v.isLivestream));
          setShorts(vids.filter((v) => v.isShort));
          setLivestreams(vids.filter((v) => v.isLivestream));
          setFilteredVideos(vids.filter((v) => !v.isShort && !v.isLivestream));
          setFilteredShorts(vids.filter((v) => v.isShort));
        } catch (fallbackErr) {
          console.error("Fallback fetch also failed:", fallbackErr);
        }
      }
    } catch (err: any) {
      console.error("Failed to load lists:", err);
      setError(err?.message || "Failed to load data");
    } finally {
      const isInitialLoad = videos.length === 0;
      if (isInitialLoad) {
        setLoading(false);
      }
      setShowLoadingProgress(false);
      setIsRefreshing(false);
      refreshingRef.current = false;
    }
  };

  // Load user state from server
  const loadUserState = async () => {
    try {
      const res = await fetch("/api/user-state");
      if (res.ok) {
        const data = await res.json();
        setWatchedVideos(new Set(data.watchedVideos || []));
        setHideWatched(data.hideWatched || false);
        if (typeof data.filterListId === "string") {
          setFilterListId(data.filterListId);
        }
        if (Array.isArray(data.watchLater)) {
          setWatchLater(
            data.watchLater.map((item: any) => ({
              ...item,
              addedAt: new Date(item.addedAt),
            }))
          );
        }
      }
    } catch (e) {
      console.error("Failed to load user state:", e);
    }
  };

  // Save user state to server
  const saveUserState = async () => {
    try {
      await fetch("/api/user-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          watchedVideos: Array.from(watchedVideos),
          hideWatched,
          filterListId,
          watchLater: watchLater.map((item) => ({
            ...item,
            addedAt: item.addedAt.toISOString(),
          })),
        }),
      });
    } catch (e) {
      console.error("Failed to save user state:", e);
    }
  };

  const handleChangeFilterList = async (newId: string) => {
    setFilterListId(newId);
    try {
      await fetch("/api/user-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          watchedVideos: Array.from(watchedVideos),
          hideWatched,
          filterListId: newId,
        }),
      });
      localStorage.setItem("filterListId", JSON.stringify(newId));
    } catch (e) {
      console.error("Failed to persist filter list:", e);
    }
  };

  // Initialize data
  useEffect(() => {
    // Ref used to suppress duplicate init in dev Strict Mode
    refreshingRef.current = false;

    const init = async () => {
      try {
        const appSettings = await getSettings();
        setSettings(appSettings);

        // Check if this is first time user
        if (!appSettings.hasCompletedWelcome) {
          setShowWelcomeWizard(true);
        }
      } catch (e) {
        console.error("Failed to load settings:", e);
      }
    };

    refreshData();
    loadUserState();
    init();

    // Load hideWatched preference from localStorage
    const savedHideWatched = localStorage.getItem("hideWatched");
    if (savedHideWatched !== null) {
      setHideWatched(JSON.parse(savedHideWatched));
    }

    // Load filterListId preference from localStorage
    const savedFilterListId = localStorage.getItem("filterListId");
    if (savedFilterListId !== null) {
      try {
        const parsed = JSON.parse(savedFilterListId);
        if (typeof parsed === "string") {
          // Only apply local value if server hasn't set a different one yet
          // This avoids overwriting server-persisted selection on reload.
          setFilterListId((prev) => (prev ? prev : parsed));
        }
      } catch {}
    }
  }, []);

  // Auto-redirect to first available tab if current tab is disabled
  useEffect(() => {
    if (!settings) return;

    const isCurrentTabDisabled =
      (feedTab === "videos" && !settings.enableVideos) ||
      (feedTab === "shorts" && !settings.enableShorts) ||
      (feedTab === "livestreams" && !settings.enableLivestreams);

    if (isCurrentTabDisabled) {
      // Find first enabled tab
      if (settings.enableVideos) {
        setFeedTab("videos");
      } else if (settings.enableShorts) {
        setFeedTab("shorts");
      } else if (settings.enableLivestreams) {
        setFeedTab("livestreams");
      }
    }
  }, [
    settings?.enableVideos,
    settings?.enableShorts,
    settings?.enableLivestreams,
    feedTab,
  ]);

  // Save user state when it changes
  useEffect(() => {
    if (watchedVideos.size > 0 || hideWatched || watchLater.length > 0) {
      saveUserState();
    }
  }, [watchedVideos, hideWatched, filterListId, watchLater]);

  // Save hideWatched preference to localStorage
  useEffect(() => {
    localStorage.setItem("hideWatched", JSON.stringify(hideWatched));
  }, [hideWatched]);

  // Persist filterListId to localStorage
  useEffect(() => {
    localStorage.setItem("filterListId", JSON.stringify(filterListId));
  }, [filterListId]);

  // Handle Escape key to clear search
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && searchQuery) {
        setSearchQuery("");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchQuery]);

  // Handle search and filter
  useEffect(() => {
    const term = searchQuery.trim().toLowerCase();
    let vids = videos;
    let shts = shorts;
    let liveStreams = livestreams;

    // Filter by subscription list
    if (filterListId !== "all") {
      const selectedList = subscriptionLists.find((l) => l.id === filterListId);
      if (selectedList) {
        const channelIds = new Set(
          selectedList.subscriptions.map((s) => s.channelId)
        );
        vids = vids.filter((v) => channelIds.has(v.channelId));
        shts = shts.filter((v) => channelIds.has(v.channelId));
        liveStreams = liveStreams.filter((v) => channelIds.has(v.channelId));
      }
    }

    // Filter by search term
    if (term) {
      vids = vids.filter(
        (v) =>
          v.title.toLowerCase().includes(term) ||
          v.channel.toLowerCase().includes(term)
      );
      shts = shts.filter(
        (v) =>
          v.title.toLowerCase().includes(term) ||
          v.channel.toLowerCase().includes(term)
      );
      liveStreams = liveStreams.filter(
        (v) =>
          v.title.toLowerCase().includes(term) ||
          v.channel.toLowerCase().includes(term)
      );
    }

    // Filter out watched videos if hideWatched is true
    if (hideWatched) {
      vids = vids.filter((v) => !watchedVideos.has(v.id));
      shts = shts.filter((v) => !watchedVideos.has(v.id));
      liveStreams = liveStreams.filter((v) => !watchedVideos.has(v.id));
    }

    // Sort by date (newest first by default, oldest first if setting is "oldest")
    const sortByDate = (videos: any[]) => {
      return [...videos].sort((a, b) => {
        const dateA = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
        const dateB = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
        // Newest first by default
        const comparison = dateB - dateA;
        // Reverse if oldest first is selected
        return settings?.defaultSortOrder === "oldest"
          ? -comparison
          : comparison;
      });
    };

    vids = sortByDate(vids);
    shts = sortByDate(shts);
    liveStreams = sortByDate(liveStreams);

    setFilteredVideos(vids);
    setFilteredShorts(shts);
    setFilteredLivestreams(liveStreams);
  }, [
    searchQuery,
    videos,
    shorts,
    livestreams,
    hideWatched,
    watchedVideos,
    settings?.defaultSortOrder,
    filterListId,
    subscriptionLists,
  ]);

  const handleAddSubscription = async (url: string) => {
    try {
      await addSubscription(url, currentListId);
      await refreshData();
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  const handleImportSubscriptions = async (data: string, format?: string) => {
    await importSubscriptions(data, format, currentListId);
    // Force refresh of feed to pick up newly imported subscriptions
    await refreshData(true);
    // Re-fetch lists after feed generation completes to pick up enriched thumbnails
    setTimeout(async () => {
      try {
        const listsRes = await fetch("/api/subscription-lists");
        if (listsRes.ok) {
          const listsData = await listsRes.json();
          setSubscriptionLists(listsData.lists || []);
        }
      } catch {}
    }, 2000);
  };

  const handleExportSubscriptions = async (format: "opml" | "json") => {
    const data = await exportSubscriptions(format, currentListId);
    const mimeType = format === "json" ? "application/json" : "application/xml";
    const extension = format === "json" ? "json" : "opml";
    const currentList = subscriptionLists.find((l) => l.id === currentListId);
    const listName = currentList?.name || "subscriptions";
    const sanitizedListName = listName.toLowerCase().replace(/\s+/g, "-");
    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `tubeshelf-${sanitizedListName}.${extension}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleSaveSettings = async (updates: Partial<typeof settings>) => {
    try {
      const durationSettingChanged =
        updates.enableVideoDuration !== undefined &&
        updates.enableVideoDuration !== settings?.enableVideoDuration;

      await updateSettings(updates);
      const freshSettings = await getSettings();
      setSettings(freshSettings);

      // If content filter settings or duration settings changed, refresh feed data
      const contentFilterChanged =
        updates.enableShorts !== undefined ||
        updates.enableLivestreams !== undefined;

      if (contentFilterChanged || durationSettingChanged) {
        // Close settings panel before refresh to show loading bar
        setShowSettings(false);
        await refreshData(true); // Force refresh to bypass cache
      }
    } catch (err) {
      console.error("Failed to save settings:", err);
    }
  };

  const handleDeleteAllSubscriptions = async (listId?: string) => {
    const res = await fetch("/api/subscription-lists/subscriptions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear", listId: listId || null }),
    });
    if (!res.ok) throw new Error("Failed to delete subscriptions");
    await refreshData();
  };

  const handleClearWatchHistory = async () => {
    await clearWatchHistory();
    setWatchedVideos(new Set());
  };

  const handleResetAllSettings = async () => {
    try {
      await resetAllSettings();
      const freshSettings = await getSettings();
      setSettings(freshSettings);
    } catch (err) {
      console.error("Failed to reset settings:", err);
    }
  };

  const handleResetAllData = async () => {
    try {
      // Clear all subscriptions
      const res = await fetch("/api/subscription-lists/subscriptions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear", listId: null }),
      });
      if (!res.ok) throw new Error("Failed to delete subscriptions");

      // Clear watch history
      await clearWatchHistory();
      setWatchedVideos(new Set());

      // Reset settings
      await resetAllSettings();
      const freshSettings = await getSettings();
      setSettings(freshSettings);

      // Refresh feed data
      await refreshData();
    } catch (err) {
      console.error("Failed to reset application:", err);
      throw err;
    }
  };

  const handleRemoveSubscription = async (id: string) => {
    try {
      await removeSubscription(id, currentListId);
      await refreshData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleMoveSubscription = async (
    subscriptionId: string,
    targetListId: string
  ) => {
    try {
      const res = await fetch("/api/subscription-lists/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "move",
          channelId: subscriptionId,
          fromListId: currentListId,
          toListId: targetListId,
        }),
      });
      if (!res.ok) throw new Error("Failed to move subscription");
      const data = await res.json();
      setSubscriptionLists(data.lists);
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  const handleWatchVideo = (videoId: string) => {
    const newWatched = new Set(watchedVideos);
    newWatched.add(videoId);
    setWatchedVideos(newWatched);
    // Open the video in a new tab
    window.open(`https://www.youtube.com/watch?v=${videoId}`, "_blank");
  };

  const handleToggleWatched = (videoId: string) => {
    const newWatched = new Set(watchedVideos);
    if (newWatched.has(videoId)) {
      newWatched.delete(videoId);
    } else {
      newWatched.add(videoId);
    }
    setWatchedVideos(newWatched);
  };

  const handleAddToWatchLater = (video: Video) => {
    const item: WatchLaterItem = {
      id: `wl-${video.id}`,
      videoId: video.id,
      title: video.title,
      channel: video.channel,
      thumbnail: video.thumbnail,
      addedAt: new Date(),
    };
    setWatchLater([item, ...watchLater.filter((w) => w.videoId !== video.id)]);
  };

  const handleRemoveFromWatchLater = (id: string) => {
    setWatchLater(watchLater.filter((w) => w.id !== id));
  };

  const handleWelcomeWizardComplete = async (options: WelcomeOptions) => {
    setShowWelcomeWizard(false);
    setWelcomeCompleted(true);

    try {
      // Apply wizard settings (including hasCompletedWelcome flag)
      const updates: Partial<typeof settings> = {
        enableVideos: options.enableVideos,
        invidousInstance: options.invidousInstance,
        enableShorts: options.enableShorts,
        enableLivestreams: options.enableLivestreams,
        enableVideoDuration: options.invidousInstance ? true : false,
        hasCompletedWelcome: true,
      };

      await updateSettings(updates);
      const freshSettings = await getSettings();
      setSettings(freshSettings);

      // Refresh feed with new settings
      await refreshData(true);
    } catch (err) {
      console.error("Failed to apply welcome wizard settings:", err);
    }
  };

  const handleWelcomeWizardSkip = async () => {
    setShowWelcomeWizard(false);
    setWelcomeCompleted(true);

    try {
      // Mark as completed even if skipped
      await updateSettings({ hasCompletedWelcome: true });
      const freshSettings = await getSettings();
      setSettings(freshSettings);
    } catch (err) {
      console.error("Failed to mark welcome wizard as completed:", err);
    }
  };

  const handleWelcomeWizardImportFile = async (file: File) => {
    try {
      const text = await file.text();
      await importSubscriptions(
        text,
        file.name.endsWith(".opml") ? "opml" : "json",
        currentListId
      );
    } catch (err) {
      throw new Error(
        err instanceof Error ? err.message : "Failed to import file"
      );
    }
  };

  const iconUrl = useMemo(() => {
    if (theme === "dark") return "/icon-dark.svg";
    if (theme === "light") return "/icon-light.svg";
    // system theme
    const prefersDark =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "/icon-dark.svg" : "/icon-light.svg";
  }, [theme]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Navigation */}
      <nav className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div
                className="flex items-center gap-2 cursor-pointer"
                onClick={() => {
                  setCurrentPage("home");
                  setSearchQuery("");
                }}
              >
                <img
                  src={iconUrl}
                  alt=""
                  className={`h-11 w-11 transition-opacity duration-300 ${
                    mounted ? "opacity-100" : "opacity-0"
                  }`}
                />
                <h1 className="text-xl font-bold hidden sm:block">TubeShelf</h1>
              </div>
            </div>

            {/* Search */}
            <div className="hidden md:flex flex-1 max-w-md mx-8">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search videos..."
                  className="w-full text-sm pl-10 pr-9"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    title="Clear search (or press Escape)"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setShowSubscriptions(true)}
                variant="secondary"
                size="sm"
                className="hidden sm:flex gap-1"
                title="Manage subscriptions"
              >
                <List className="w-5 h-5" />
                Manage
              </Button>
              <Button
                onClick={() => setCurrentPage("watch-later")}
                variant="outline"
                size="icon"
                className="relative"
                title="Watch later list"
              >
                <Bookmark className="w-5 h-5" />
                {watchLater.length > 0 && (
                  <span className="absolute top-1 right-1 bg-primary text-primary-foreground text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {watchLater.length}
                  </span>
                )}
              </Button>
              <Button
                onClick={() => setShowSettings(true)}
                variant="ghost"
                size="icon"
                title="Settings"
              >
                <Settings className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Mobile Search */}
          <div className="md:hidden pb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search videos..."
                className="w-full text-sm pl-10 pr-9"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title="Clear search (or press Escape)"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {currentPage === "home" ? (
          <>
            {/* Page Header */}
            <div className="mb-8">
              <div className="flex items-center gap-4 mb-4">
                <h2 className="text-2xl sm:text-3xl font-bold">Your Feed</h2>
                <Button
                  onClick={() => refreshData(true)}
                  variant="ghost"
                  size="sm"
                  disabled={isRefreshing}
                  title="Refresh feed"
                  className="h-auto px-2 mt-1"
                >
                  <RefreshCw
                    className={`w-5 h-5 ${isRefreshing ? "animate-spin" : ""}`}
                  />
                </Button>
                <LoadingProgress isVisible={showLoadingProgress} />
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                <span>
                  {(() => {
                    if (filterListId === "all") {
                      const uniqueChannels = new Set<string>();
                      subscriptionLists.forEach((list) => {
                        list.subscriptions.forEach((sub) => {
                          uniqueChannels.add(sub.channelId);
                        });
                      });
                      return uniqueChannels.size;
                    } else {
                      const selectedList = subscriptionLists.find(
                        (l) => l.id === filterListId
                      );
                      return selectedList?.subscriptions.length || 0;
                    }
                  })()}{" "}
                  subscriptions
                </span>
                {settings?.enableVideos && (
                  <>
                    <span>•</span>
                    <span>{filteredVideos.length} videos</span>
                  </>
                )}
                {settings?.enableShorts && (
                  <>
                    <span>•</span>
                    <span>{filteredShorts.length} shorts</span>
                  </>
                )}
                {settings?.enableLivestreams && (
                  <>
                    <span>•</span>
                    <span>{filteredLivestreams.length} livestreams</span>
                  </>
                )}
                {showLoadingProgress && progress && (
                  <span className="text-sm text-muted-foreground whitespace-nowrap ml-auto">
                    Loading: {progress.currentChannelTitle || "..."} (
                    {progress.completed}/{progress.total})
                  </span>
                )}
              </div>
              {error && (
                <p className="text-sm text-destructive mt-2">{error}</p>
              )}
            </div>

            {/* Mobile Subscription Button */}
            <div className="sm:hidden mb-6">
              <Button
                onClick={() => setShowSubscriptions(true)}
                variant="default"
                className="w-full"
              >
                <List className="w-5 h-5 mr-2" />
                Manage Subscriptions
              </Button>
            </div>

            {loading ? (
              <div className="text-center py-12">
                {/* Loading progress shown via LoadingProgress modal */}
              </div>
            ) : (
              <>
                {/* Tabs and Controls */}
                <div className="flex items-center justify-between mb-6 border-b border-border">
                  <div className="flex gap-4">
                    {settings?.enableVideos && (
                      <button
                        onClick={() => setFeedTab("videos")}
                        className={`px-4 py-2 font-medium transition-colors ${
                          feedTab === "videos"
                            ? "border-b-2 border-primary text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Videos
                      </button>
                    )}
                    {settings?.enableShorts && (
                      <button
                        onClick={() => setFeedTab("shorts")}
                        className={`px-4 py-2 font-medium transition-colors ${
                          feedTab === "shorts"
                            ? "border-b-2 border-primary text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Shorts
                      </button>
                    )}
                    {settings?.enableLivestreams && (
                      <button
                        onClick={() => setFeedTab("livestreams")}
                        className={`px-4 py-2 font-medium transition-colors ${
                          feedTab === "livestreams"
                            ? "border-b-2 border-primary text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Livestreams
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3 pb-2">
                    {/* Hide watched first */}
                    <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                      <Switch
                        checked={hideWatched}
                        onCheckedChange={setHideWatched}
                      />
                      Hide watched
                    </label>
                    {/* List Filter */}
                    <select
                      value={filterListId}
                      onChange={(e) => handleChangeFilterList(e.target.value)}
                      className="px-3 py-1.5 text-sm bg-secondary border border-border rounded-md cursor-pointer hover:bg-secondary/80 transition-colors"
                    >
                      <option value="all">All Lists</option>
                      {subscriptionLists
                        .sort((a, b) =>
                          a.id === "default" ? -1 : b.id === "default" ? 1 : 0
                        )
                        .map((list) => (
                          <option key={list.id} value={list.id}>
                            {list.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {/* Videos Tab */}
                {feedTab === "videos" && (
                  <>
                    {loading ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {Array.from({ length: 12 }).map((_, i) => (
                          <VideoCardSkeleton key={i} />
                        ))}
                      </div>
                    ) : filteredVideos.length === 0 ? (
                      <div className="text-center py-12">
                        <div className="text-5xl mb-4">🎬</div>
                        <h3 className="text-lg font-semibold mb-2">
                          {searchQuery
                            ? "No videos found"
                            : "Your feed is empty"}
                        </h3>
                        <p className="text-muted-foreground">
                          {searchQuery
                            ? "Try adjusting your search"
                            : "Subscribe to channels to populate your feed with fresh videos"}
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {filteredVideos.map((video) => (
                          <VideoCard
                            key={video.id}
                            id={video.id}
                            title={video.title}
                            channel={video.channel}
                            thumbnail={video.thumbnail}
                            duration={video.duration}
                            uploadedAt={video.uploadedAt}
                            views={video.views}
                            watched={watchedVideos.has(video.id)}
                            videoUrl={video.url}
                            showDurationPlaceholder={
                              settings?.enableVideoDuration
                            }
                            onWatch={() => handleWatchVideo(video.id)}
                            onWatchLater={() => handleAddToWatchLater(video)}
                            onMarkWatched={() => handleToggleWatched(video.id)}
                            onChannelClick={(channelName) =>
                              setSearchQuery(
                                searchQuery === channelName ? "" : channelName
                              )
                            }
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* Shorts Tab */}
                {feedTab === "shorts" && (
                  <>
                    {loading ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {Array.from({ length: 15 }).map((_, i) => (
                          <VideoCardSkeleton key={i} />
                        ))}
                      </div>
                    ) : filteredShorts.length === 0 ? (
                      <div className="text-center py-12">
                        <div className="text-5xl mb-4">⏱️</div>
                        <h3 className="text-lg font-semibold mb-2">
                          {searchQuery ? "No shorts found" : "No shorts yet"}
                        </h3>
                        <p className="text-muted-foreground">
                          {searchQuery
                            ? "Try adjusting your search"
                            : "Subscribed channels haven't posted any shorts lately"}
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {filteredShorts.map((video) => (
                          <VideoCard
                            key={video.id}
                            id={video.id}
                            title={video.title}
                            channel={video.channel}
                            thumbnail={video.thumbnail}
                            uploadedAt={video.uploadedAt}
                            views={video.views}
                            watched={watchedVideos.has(video.id)}
                            videoUrl={video.url}
                            onWatch={() => handleWatchVideo(video.id)}
                            onWatchLater={() => handleAddToWatchLater(video)}
                            onMarkWatched={() => handleToggleWatched(video.id)}
                            onChannelClick={(channelName) =>
                              setSearchQuery(
                                searchQuery === channelName ? "" : channelName
                              )
                            }
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* Livestreams Tab */}
                {feedTab === "livestreams" && (
                  <>
                    {loading ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {Array.from({ length: 12 }).map((_, i) => (
                          <VideoCardSkeleton key={i} />
                        ))}
                      </div>
                    ) : filteredLivestreams.length === 0 ? (
                      <div className="text-center py-12">
                        <div className="text-5xl mb-4">📡</div>
                        <h3 className="text-lg font-semibold mb-2">
                          {searchQuery
                            ? "No livestreams found"
                            : "No livestreams"}
                        </h3>
                        <p className="text-muted-foreground">
                          {searchQuery
                            ? "Try adjusting your search"
                            : "No channels are currently streaming"}
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {filteredLivestreams.map((video) => (
                          <VideoCard
                            key={video.id}
                            id={video.id}
                            title={video.title}
                            channel={video.channel}
                            thumbnail={video.thumbnail}
                            uploadedAt={video.uploadedAt}
                            views={video.views}
                            watched={watchedVideos.has(video.id)}
                            videoUrl={video.url}
                            onWatch={() => handleWatchVideo(video.id)}
                            onWatchLater={() => handleAddToWatchLater(video)}
                            onMarkWatched={() => handleToggleWatched(video.id)}
                            onChannelClick={(channelName) =>
                              setSearchQuery(
                                searchQuery === channelName ? "" : channelName
                              )
                            }
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </>
        ) : (
          <>
            {/* Watch Later Page */}
            <div className="mb-8">
              <button
                onClick={() => setCurrentPage("home")}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-3 flex items-center gap-1 cursor-pointer"
              >
                ← Back to Feed
              </button>
              <h2 className="text-2xl sm:text-3xl font-bold mb-2">
                Watch Later
              </h2>
              <p className="text-sm text-muted-foreground">
                {watchLater.length} video{watchLater.length !== 1 ? "s" : ""}{" "}
                saved
              </p>
            </div>

            <div className="max-w-2xl">
              <WatchLater
                items={watchLater}
                watchedVideos={watchedVideos}
                onRemove={handleRemoveFromWatchLater}
                onPlay={handleWatchVideo}
                onToggleWatched={handleToggleWatched}
                onShare={(videoId) => {
                  const url = `https://www.youtube.com/watch?v=${videoId}`;
                  navigator.clipboard.writeText(url).catch(() => {});
                }}
              />
            </div>
          </>
        )}
      </main>

      {/* Subscription Manager Modal */}
      <SubscriptionManager
        lists={subscriptionLists}
        currentListId={currentListId}
        onSelectList={setCurrentListId}
        onCreateList={async (name: string) => {
          const res = await fetch("/api/subscription-lists", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "create", name }),
          });
          if (!res.ok) throw new Error("Failed to create list");
          const newList = await res.json();

          // Fetch only the updated subscription lists (not videos)
          const listsRes = await fetch("/api/subscription-lists");
          const listsData = await listsRes.json();

          // Update lists first, then set the IDs
          setSubscriptionLists(listsData.lists);

          // Use setTimeout to ensure state updates happen after lists are set
          setTimeout(() => {
            setCurrentListId(newList.id);
            setFilterListId(newList.id);

            // Persist to server and localStorage
            fetch("/api/user-state", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                watchedVideos: Array.from(watchedVideos),
                hideWatched,
                filterListId: newList.id,
              }),
            }).catch((e) => console.error("Failed to persist filter list:", e));
            localStorage.setItem("filterListId", JSON.stringify(newList.id));
          }, 0);
        }}
        onDeleteList={async (listId: string) => {
          const res = await fetch("/api/subscription-lists", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "delete", listId }),
          });
          if (!res.ok) throw new Error("Failed to delete list");
          await refreshData();
        }}
        onAdd={handleAddSubscription}
        onRemove={handleRemoveSubscription}
        onMove={handleMoveSubscription}
        onImport={handleImportSubscriptions}
        onExport={handleExportSubscriptions}
        isOpen={showSubscriptions}
        onClose={() => setShowSubscriptions(false)}
      />

      {settings && (
        <SettingsPanel
          settings={settings}
          onSave={handleSaveSettings}
          onDeleteSubscriptions={handleDeleteAllSubscriptions}
          onClearWatchHistory={handleClearWatchHistory}
          onResetSettings={handleResetAllSettings}
          onResetAllData={handleResetAllData}
          subscriptionLists={subscriptionLists}
          currentListId={currentListId}
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-border mt-16 bg-card/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center text-sm text-muted-foreground">
          <p>TubeShelf © 2025 • Licensed under AGPL-3</p>
          <p className="mt-2 text-xs">
            A clean, chronological YouTube feed. No algorithm. No tracking.
          </p>
        </div>
      </footer>

      {/* Welcome Wizard */}
      {showWelcomeWizard && (
        <WelcomeWizard
          onComplete={handleWelcomeWizardComplete}
          onSkip={handleWelcomeWizardSkip}
          onImportFile={handleWelcomeWizardImportFile}
        />
      )}
    </div>
  );
}
