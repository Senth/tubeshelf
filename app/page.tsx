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
import ClientOnly from "@/components/ClientOnly";
import { feedManager } from "@/lib/feedManager";
import { VideoCard } from "@/components/VideoCard";
import { VideoCardSkeleton } from "@/components/VideoCardSkeleton";
import { SubscriptionManager } from "@/components/SubscriptionManager";
import { SettingsPanel } from "@/components/SettingsPanel";
import { WatchLater } from "@/components/WatchLater";
import { LoadingProgress } from "@/components/LoadingProgress";
import { WelcomeWizard, type WelcomeOptions } from "@/components/WelcomeWizard";
import { ToastContainer } from "@/components/ToastContainer";
import type { ToastProps } from "@/components/Toast";
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
import type { Page, FeedTab, WatchLaterItem } from "@/lib/pageTypes";
import {
  arraysHaveSameIds,
  filterAndSortVideos,
  getThemeIconUrl,
} from "@/lib/videoUtils";

export default function Home() {
  const { theme } = useContext(ThemeContext);
  const [mounted, setMounted] = useState(false);
  const [currentPage, setCurrentPage] = useState<Page>("home");
  const componentId = useRef(Math.random().toString(36).substring(7));
  const [feedTab, setFeedTab] = useState<FeedTab>("videos");
  const [videos, setVideos] = useState<Video[]>([]);
  const videosRef = useRef<Video[]>([]);
  const loadingRef = useRef<boolean>(false);
  const fetchingRef = useRef<boolean>(false);
  const errorRef = useRef<string | null>(null);
  const [watchLater, setWatchLater] = useState<WatchLaterItem[]>([]);
  const [watchedVideos, setWatchedVideos] = useState<Set<string>>(new Set());
  const [showSubscriptions, setShowSubscriptions] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredVideos, setFilteredVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hideWatched, setHideWatched] = useState(false);
  const [hideMemberOnly, setHideMemberOnly] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [subscriptionLists, setSubscriptionLists] = useState<
    SubscriptionList[]
  >([]);
  const [currentListId, setCurrentListId] = useState<string>("default");
  const [filterListId, setFilterListId] = useState<string>("all");
  const [showLoadingProgress, setShowLoadingProgress] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshingRef = useRef(false);
  const initializedRef = useRef(false);
  const [showWelcomeWizard, setShowWelcomeWizard] = useState(false);
  const [welcomeCompleted, setWelcomeCompleted] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const [highlightedVideoIndex, setHighlightedVideoIndex] = useState<
    number | null
  >(null);
  const videoRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [toasts, setToasts] = useState<Omit<ToastProps, "onClose">[]>([]);

  const showToast = (
    message: string,
    type: "success" | "error" | "info" = "success",
    onUndo?: () => void
  ) => {
    const id = Math.random().toString(36).substring(7);
    setToasts((prev) => [...prev, { id, message, type, onUndo }]);
  };

  const closeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close the ad-hoc "more" menu when clicking outside
  useEffect(() => {
    const onClick = (ev: MouseEvent) => {
      if (
        showMoreMenu &&
        moreMenuRef.current &&
        !(ev.target instanceof Node && moreMenuRef.current.contains(ev.target))
      ) {
        setShowMoreMenu(false);
      }
    };

    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [showMoreMenu]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't interfere when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        // Allow Escape to blur the input and clear search
        if (e.key === "Escape" && e.target instanceof HTMLInputElement) {
          e.target.blur();
          if (searchQuery) {
            setSearchQuery("");
          }
        }
        return;
      }

      // Don't interfere when modals are open
      if (showSubscriptions || showSettings || showWelcomeWizard) {
        // Allow Escape to close modals
        if (e.key === "Escape") {
          setShowSubscriptions(false);
          setShowSettings(false);
          setShowKeyboardHelp(false);
        }
        return;
      }

      // Close keyboard help with Escape or ?
      if (e.key === "Escape" || e.key === "?") {
        if (showKeyboardHelp) {
          e.preventDefault();
          setShowKeyboardHelp(false);
          return;
        }
        // ? toggles the help
        if (e.key === "?") {
          e.preventDefault();
          setShowKeyboardHelp(true);
          return;
        }
      }

      // Only work on home page
      if (currentPage !== "home") return;

      // "/" to focus search
      if (e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      const currentVideos = filteredVideos;
      if (currentVideos.length === 0) return;

      switch (e.key.toLowerCase()) {
        case "j": // Next video
          e.preventDefault();
          setHighlightedVideoIndex((prev) => {
            const nextIndex =
              prev === null ? 0 : Math.min(prev + 1, currentVideos.length - 1);
            // Scroll to video
            setTimeout(() => {
              const el = videoRefs.current.get(nextIndex);
              if (el) {
                el.scrollIntoView({
                  behavior: "smooth",
                  block: "center",
                });
              }
            }, 0);
            return nextIndex;
          });
          break;

        case "k": // Previous video
          e.preventDefault();
          setHighlightedVideoIndex((prev) => {
            const nextIndex = prev === null ? 0 : Math.max(prev - 1, 0);
            // Scroll to video
            setTimeout(() => {
              const el = videoRefs.current.get(nextIndex);
              if (el) {
                el.scrollIntoView({
                  behavior: "smooth",
                  block: "center",
                });
              }
            }, 0);
            return nextIndex;
          });
          break;

        case "enter": // Open highlighted video
          e.preventDefault();
          if (highlightedVideoIndex !== null) {
            const video = currentVideos[highlightedVideoIndex];
            if (video) {
              window.open(video.url, "_blank");
              handleWatchVideo(video.id);
            }
          }
          break;

        case "w": // Toggle watched
          e.preventDefault();
          if (highlightedVideoIndex !== null) {
            const video = currentVideos[highlightedVideoIndex];
            if (video) {
              handleToggleWatched(video.id);
            }
          }
          break;

        case "l": // Add to watch later
          e.preventDefault();
          if (highlightedVideoIndex !== null) {
            const video = currentVideos[highlightedVideoIndex];
            if (video) {
              handleAddToWatchLater(video);
            }
          }
          break;

        case "escape": // Clear highlight and search
          e.preventDefault();
          setHighlightedVideoIndex(null);
          if (searchQuery) {
            setSearchQuery("");
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    filteredVideos,
    highlightedVideoIndex,
    currentPage,
    showSubscriptions,
    showSettings,
    showWelcomeWizard,
    showKeyboardHelp,
    searchQuery,
  ]);

  // Reset highlight when videos change
  useEffect(() => {
    setHighlightedVideoIndex(null);
  }, [filteredVideos]);

  const refreshData = async (forceRefresh = false) => {
    setError(null);
    setShowLoadingProgress(true);
    setIsRefreshing(true);

    try {
      // Fetch lists first
      const listsRes = await fetch("/api/subscription-lists");
      const listsData = await listsRes.json();
      setSubscriptionLists(listsData.lists || []);
      setCurrentListId((prevId) => {
        const listStillExists = (listsData.lists || []).some(
          (l: any) => l.id === prevId
        );
        return prevId && listStillExists ? prevId : "default";
      });

      // Refresh feed via singleton manager
      await feedManager.refresh();
    } catch (err: any) {
      console.error("Failed to refresh:", err);
      setError(err?.message || "Failed to load data");
    } finally {
      setShowLoadingProgress(false);
      setIsRefreshing(false);
      refreshingRef.current = false;
    }
  };

  const loadUserState = async () => {
    try {
      const res = await fetch("/api/user-state");
      if (res.ok) {
        const data = await res.json();
        setWatchedVideos(new Set(data.watchedVideos || []));
        setHideWatched(data.hideWatched || false);
        setHideMemberOnly(data.hideMemberOnly || false);
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
          hideMemberOnly,
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

  // Toggle and persist hideMemberOnly. The Switch component reports its checked state
  // as `true` when member videos are shown, so we invert it when storing.
  const toggleHideMemberOnlyPersist = async (switchChecked: boolean) => {
    const newHideMemberOnly = !switchChecked;
    setHideMemberOnly(newHideMemberOnly);

    try {
      await fetch("/api/user-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          watchedVideos: Array.from(watchedVideos),
          hideWatched,
          hideMemberOnly: newHideMemberOnly,
          filterListId,
          watchLater: watchLater.map((item) => ({
            ...item,
            addedAt: item.addedAt.toISOString(),
          })),
        }),
      });
    } catch (e) {
      console.error("Failed to persist hideMemberOnly setting:", e);
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

  // Initialize data on mount using singleton feed manager
  useEffect(() => {
    // Subscribe to feed manager (skip auto-init, we'll initialize manually based on welcome state)
    const unsubscribe = feedManager.subscribe(
      (feedData) => {
        if (!arraysHaveSameIds(videosRef.current, feedData.videos)) {
          setVideos(feedData.videos);
          videosRef.current = feedData.videos;
        }

        // Update loading/fetching/error when values change
        if (loadingRef.current !== feedData.loading) {
          setLoading(feedData.loading);
          loadingRef.current = feedData.loading;
        }

        if (fetchingRef.current !== feedData.fetching) {
          // Don't show loading progress during welcome wizard
          setShowLoadingProgress(feedData.fetching && !showWelcomeWizard);
          fetchingRef.current = feedData.fetching;
        }

        if (errorRef.current !== feedData.error) {
          setError(feedData.error);
          errorRef.current = feedData.error;
        }
      },
      true // Skip auto-init
    );

    // Load other settings
    const init = async () => {
      try {
        const appSettings = await getSettings();
        setSettings(appSettings);

        // Check if this is first time user
        if (!appSettings.hasCompletedWelcome) {
          setShowWelcomeWizard(true);
          // Don't auto-initialize feed for first-time users
        } else {
          // For returning users, initialize feed immediately
          feedManager.initialize();
        }

        // Load subscription lists
        try {
          const listsRes = await fetch("/api/subscription-lists");
          if (listsRes.ok) {
            const listsData = await listsRes.json();
            setSubscriptionLists(listsData.lists || []);
          }
        } catch (e) {
          console.error("Failed to load subscription lists:", e);
        }

        // Load hideWatched preference from localStorage
        const savedHideWatched = localStorage.getItem("hideWatched");
        if (savedHideWatched !== null) {
          setHideWatched(JSON.parse(savedHideWatched));
        }

        // Load hideMemberOnly preference from localStorage
        const savedHideMemberOnly = localStorage.getItem("hideMemberOnly");
        if (savedHideMemberOnly !== null) {
          setHideMemberOnly(JSON.parse(savedHideMemberOnly));
        }

        // Load filterListId preference from localStorage
        const savedFilterListId = localStorage.getItem("filterListId");
        if (savedFilterListId !== null) {
          try {
            const parsed = JSON.parse(savedFilterListId);
            if (typeof parsed === "string") {
              setFilterListId((prev) => (prev ? prev : parsed));
            }
          } catch {}
        }

        await loadUserState();
      } catch (e) {
        console.error("Failed to load settings:", e);
      }
    };

    init();

    // Don't cleanup subscription - let it persist across remounts
    // Only cleanup on actual page navigation
  }, []);

  // Save user state when it changes
  useEffect(() => {
    if (
      watchedVideos.size > 0 ||
      hideWatched ||
      hideMemberOnly ||
      watchLater.length > 0
    ) {
      saveUserState();
    }
  }, [watchedVideos, hideWatched, hideMemberOnly, filterListId, watchLater]);

  // Save hideWatched preference to localStorage
  useEffect(() => {
    localStorage.setItem("hideWatched", JSON.stringify(hideWatched));
  }, [hideWatched]);

  // Save hideMemberOnly preference to localStorage
  useEffect(() => {
    localStorage.setItem("hideMemberOnly", JSON.stringify(hideMemberOnly));
  }, [hideMemberOnly]);

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
    // Debounce filtering and sorting to avoid race conditions when
    // subscription lists and videos update in quick succession.
    const timer = setTimeout(() => {
      const vids = filterAndSortVideos(videos, {
        searchQuery,
        filterListId,
        subscriptionLists,
        hideWatched,
        hideMemberOnly,
        watchedVideos,
        settings,
      });
      setFilteredVideos(vids);
    }, 200);

    return () => clearTimeout(timer);
  }, [
    searchQuery,
    videos,
    hideWatched,
    hideMemberOnly,
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
      await updateSettings(updates);
      const freshSettings = await getSettings();
      setSettings(freshSettings);

      // If content filter settings changed, refresh feed data
      const contentFilterChanged = updates.enableVideos !== undefined;

      if (contentFilterChanged) {
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
    // VideoCard component handles opening the video
  };

  const handleToggleWatched = (videoId: string) => {
    const wasWatched = watchedVideos.has(videoId);
    const newWatched = new Set(watchedVideos);

    if (wasWatched) {
      newWatched.delete(videoId);
      setWatchedVideos(newWatched);
      showToast("Marked as unwatched", "success", () => {
        // Undo: mark as watched again
        const undoWatched = new Set(watchedVideos);
        undoWatched.add(videoId);
        setWatchedVideos(undoWatched);
      });
    } else {
      newWatched.add(videoId);
      setWatchedVideos(newWatched);
      showToast("Marked as watched", "success", () => {
        // Undo: mark as unwatched
        const undoWatched = new Set(watchedVideos);
        undoWatched.delete(videoId);
        setWatchedVideos(undoWatched);
      });
    }
  };

  const handleAddToWatchLater = (video: Video) => {
    const alreadyExists = watchLater.some((w) => w.videoId === video.id);

    if (alreadyExists) {
      showToast("Already in Watch Later", "info");
      return;
    }

    const item: WatchLaterItem = {
      id: `wl-${video.id}`,
      videoId: video.id,
      title: video.title,
      channel: video.channel,
      thumbnail: video.thumbnail,
      addedAt: new Date(),
    };

    const previousWatchLater = watchLater;
    setWatchLater([item, ...watchLater]);

    showToast("Added to Watch Later", "success", () => {
      // Undo: remove from watch later
      setWatchLater(previousWatchLater);
    });
  };

  const handleRemoveFromWatchLater = (id: string) => {
    const removedItem = watchLater.find((w) => w.id === id);
    const previousWatchLater = watchLater;

    setWatchLater(watchLater.filter((w) => w.id !== id));

    if (removedItem) {
      showToast("Removed from Watch Later", "success", () => {
        // Undo: add back to watch later
        setWatchLater(previousWatchLater);
      });
    }
  };

  const handleWelcomeWizardComplete = async (options: WelcomeOptions) => {
    setShowWelcomeWizard(false);
    setWelcomeCompleted(true);

    try {
      // Apply wizard settings (including hasCompletedWelcome flag and fetchMethod)
      const updates: Partial<typeof settings> = {
        enableVideos: options.enableVideos,
        hasCompletedWelcome: true,
        fetchMethod: options.fetchMethod,
      };

      await updateSettings(updates);
      const freshSettings = await getSettings();
      setSettings(freshSettings);

      // Initialize feedManager (will fetch if there are subscriptions, otherwise return empty)
      await feedManager.initialize();
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

      // Reload subscription lists to update the counter
      const listsRes = await fetch("/api/subscription-lists");
      if (listsRes.ok) {
        const listsData = await listsRes.json();
        setSubscriptionLists(listsData.lists || []);
      }
    } catch (err) {
      throw new Error(
        err instanceof Error ? err.message : "Failed to import file"
      );
    }
  };

  const iconUrl = useMemo(
    () => getThemeIconUrl(theme, mounted),
    [theme, mounted]
  );

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Navigation */}
      <nav className="sticky top-0 z-40 border-b border-border/50 bg-card/90 backdrop-blur-md shadow-sm">
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
                <ClientOnly>
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                </ClientOnly>
                <Input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search videos..."
                  className="w-full text-sm pl-10 pr-12"
                />
                {!searchQuery && (
                  <kbd className="absolute right-3 top-1/2 transform -translate-y-1/2 px-2 py-0.5 text-xs bg-secondary border border-border rounded font-mono text-muted-foreground pointer-events-none">
                    /
                  </kbd>
                )}
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    title="Clear search (or press Escape)"
                  >
                    <ClientOnly>
                      <X className="w-4 h-4" />
                    </ClientOnly>
                  </button>
                )}
              </div>
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-2">
              {/* Keyboard shortcuts help */}
              <div className="relative">
                <Button
                  onClick={() => setShowKeyboardHelp(!showKeyboardHelp)}
                  variant="ghost"
                  size="icon"
                  title="Keyboard shortcuts"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="M6 8h.01" />
                    <path d="M10 8h.01" />
                    <path d="M14 8h.01" />
                    <path d="M18 8h.01" />
                    <path d="M8 12h.01" />
                    <path d="M12 12h.01" />
                    <path d="M16 12h.01" />
                    <path d="M7 16h10" />
                  </svg>
                </Button>
                {showKeyboardHelp && (
                  <div className="absolute right-0 mt-2 w-72 bg-card border border-border rounded-lg shadow-lg p-4 z-50">
                    <h3 className="font-semibold mb-3 text-sm">
                      Keyboard Shortcuts
                    </h3>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">
                          Focus search
                        </span>
                        <kbd className="px-2 py-1 bg-secondary rounded border border-border font-mono">
                          /
                        </kbd>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">
                          Next video
                        </span>
                        <kbd className="px-2 py-1 bg-secondary rounded border border-border font-mono">
                          J
                        </kbd>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">
                          Previous video
                        </span>
                        <kbd className="px-2 py-1 bg-secondary rounded border border-border font-mono">
                          K
                        </kbd>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">
                          Open video
                        </span>
                        <kbd className="px-2 py-1 bg-secondary rounded border border-border font-mono">
                          Enter
                        </kbd>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">
                          Toggle watched
                        </span>
                        <kbd className="px-2 py-1 bg-secondary rounded border border-border font-mono">
                          W
                        </kbd>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">
                          Watch later
                        </span>
                        <kbd className="px-2 py-1 bg-secondary rounded border border-border font-mono">
                          L
                        </kbd>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">
                          Clear / Close
                        </span>
                        <kbd className="px-2 py-1 bg-secondary rounded border border-border font-mono">
                          Esc
                        </kbd>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <Button
                onClick={() => setShowSubscriptions(true)}
                variant="secondary"
                size="sm"
                className="hidden sm:flex gap-1"
                title="Manage subscriptions"
              >
                <ClientOnly>
                  <List className="w-5 h-5" />
                </ClientOnly>
                Manage
              </Button>
              <Button
                onClick={() => setCurrentPage("watch-later")}
                variant="outline"
                size="icon"
                className="relative"
                title="Watch later list"
              >
                <ClientOnly>
                  <Bookmark className="w-5 h-5" />
                </ClientOnly>
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
                <ClientOnly>
                  <Settings className="w-5 h-5" />
                </ClientOnly>
              </Button>
            </div>
          </div>

          {/* Mobile Search */}
          <div className="md:hidden pb-4">
            <div className="relative">
              <ClientOnly>
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              </ClientOnly>
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
                  <ClientOnly>
                    <X className="w-4 h-4" />
                  </ClientOnly>
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full">
        {currentPage === "home" ? (
          <>
            {/* Page Header */}
            <div className="mb-10">
              <div className="flex items-center gap-4 mb-4">
                <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                  Your Feed
                </h2>
                <Button
                  onClick={() => refreshData(true)}
                  variant="ghost"
                  size="sm"
                  disabled={isRefreshing}
                  title="Refresh feed"
                  className="h-auto px-2 mt-1"
                >
                  <ClientOnly>
                    <RefreshCw
                      className={`w-5 h-5 ${
                        isRefreshing ? "animate-spin" : ""
                      }`}
                    />
                  </ClientOnly>
                </Button>
                <ClientOnly>
                  <LoadingProgress isVisible={showLoadingProgress} />
                </ClientOnly>
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
                <ClientOnly>
                  <List className="w-5 h-5 mr-2" />
                </ClientOnly>
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
                <div className="flex items-center justify-between mb-6 border-b border-border/30">
                  <div className="flex gap-1">
                    {settings?.enableVideos && (
                      <button
                        onClick={() => setFeedTab("videos")}
                        className={`px-4 py-3 font-medium transition-all duration-200 relative ${
                          feedTab === "videos"
                            ? "text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        } after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 ${
                          feedTab === "videos"
                            ? "after:bg-primary"
                            : "after:bg-transparent"
                        } hover:after:bg-primary/50`}
                      >
                        Videos
                      </button>
                    )}
                    {/* Tabs simplified — only Videos available */}
                  </div>
                  <div className="flex items-center gap-3 pb-2">
                    {/* Ad-hoc three-dot menu for extra controls (contains Hide watched + member toggle) */}
                    <div className="relative" ref={moreMenuRef}>
                      <button
                        onClick={() => setShowMoreMenu((s) => !s)}
                        aria-label="More"
                        title="More"
                        className="p-1.5 rounded-md hover:bg-accent/20 text-muted-foreground"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          className="w-4 h-4"
                        >
                          <circle cx="12" cy="5" r="2" />
                          <circle cx="12" cy="12" r="2" />
                          <circle cx="12" cy="19" r="2" />
                        </svg>
                      </button>

                      {showMoreMenu && (
                        <div className="absolute right-0 mt-2 w-64 bg-card border border-border/50 rounded shadow-lg p-2 z-50">
                          <div className="flex flex-col gap-2">
                            <label className="flex items-center justify-between gap-3 px-2 py-2 hover:bg-muted/5 rounded">
                              <div className="text-sm text-foreground">
                                Hide watched
                              </div>
                              <Switch
                                checked={hideWatched}
                                onCheckedChange={setHideWatched}
                              />
                            </label>

                            <label className="flex items-center justify-between gap-3 px-2 py-2 hover:bg-muted/5 rounded">
                              <div className="text-sm text-foreground">
                                Show member videos
                              </div>
                              <Switch
                                checked={!hideMemberOnly}
                                onCheckedChange={toggleHideMemberOnlyPersist}
                              />
                            </label>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* List Filter */}
                    <select
                      value={filterListId}
                      onChange={(e) => handleChangeFilterList(e.target.value)}
                      className="px-3 py-1.5 text-sm bg-secondary border border-border/50 rounded-lg cursor-pointer hover:border-border transition-all duration-200 focus:border-primary focus:outline-none"
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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
                      <>
                        {console.log(
                          `Rendering ${filteredVideos.length} video cards`
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                          {filteredVideos.map((video, index) => (
                            <div
                              key={video.id}
                              ref={(el) => {
                                if (el) {
                                  videoRefs.current.set(index, el);
                                } else {
                                  videoRefs.current.delete(index);
                                }
                              }}
                              className={`transition-all duration-200 rounded-xl ${
                                highlightedVideoIndex === index
                                  ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                                  : ""
                              }`}
                            >
                              <VideoCard
                                id={video.id}
                                title={video.title}
                                channel={video.channel}
                                thumbnail={video.thumbnail}
                                duration={video.duration}
                                uploadedAt={video.uploadedAt}
                                views={video.views}
                                watched={watchedVideos.has(video.id)}
                                videoUrl={video.url}
                                showDurationPlaceholder={true}
                                onWatch={() => handleWatchVideo(video.id)}
                                onWatchLater={() =>
                                  handleAddToWatchLater(video)
                                }
                                onMarkWatched={() =>
                                  handleToggleWatched(video.id)
                                }
                                onChannelClick={(channelName) =>
                                  setSearchQuery(
                                    searchQuery === channelName
                                      ? ""
                                      : channelName
                                  )
                                }
                              />
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}

                {/* UI simplified — only Videos tab content shown */}
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

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onClose={closeToast} />
    </div>
  );
}
