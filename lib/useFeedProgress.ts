"use client";

import { useEffect, useMemo, useState } from "react";
import { feedManager } from "@/lib/feedManager";
import type { Video } from "@/lib/mockData";
import type { SubscriptionList } from "@/lib/subscriptionListStore";

export type ProgressSnapshot = {
  completed: number;
  total: number;
  currentChannelTitle?: string;
} | null;

export function useFeedProgress(
  showLoadingProgress: boolean,
  subscriptionLists: SubscriptionList[],
  filterListId: string,
  videos: Video[]
) {
  const [progress, setProgress] = useState<ProgressSnapshot>(null);
  const [liveChannelTitle, setLiveChannelTitle] = useState<string | null>(null);

  // Compute a fallback total from subscription lists when server progress isn't available
  const fallbackTotal = useMemo(() => {
    if (filterListId === "all") {
      const uniqueChannels = new Set<string>();
      subscriptionLists.forEach((list) => {
        list.subscriptions.forEach((sub) => uniqueChannels.add(sub.channelId));
      });
      return uniqueChannels.size || 0;
    } else {
      const selectedList = subscriptionLists.find((l) => l.id === filterListId);
      return selectedList?.subscriptions.length || 0;
    }
  }, [filterListId, subscriptionLists]);

  // Derive completed fallback from unique channels seen in received videos
  const completedFallback = useMemo(() => {
    const set = new Set<string>();
    videos.forEach((v) => {
      if (v.channelId) set.add(v.channelId);
    });
    return set.size;
  }, [videos]);

  useEffect(() => {
    // Subscribe to feedManager for a short-lived live channel title
    const unsubscribe = feedManager.subscribe((data) => {
      setLiveChannelTitle(data.currentChannelTitle || null);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let closeTimeout: number | null = null;

    const openSse = () => {
      if (eventSource) return;
      eventSource = new EventSource("/api/feed/progress");
      // opening EventSource
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // parsed SSE data
          setProgress(data);
        } catch (e) {
          console.error("Failed to parse progress:", e);
        }
      };
      eventSource.onerror = (err) => {
        // EventSource error
        try {
          eventSource?.close();
        } catch {}
        eventSource = null;
      };
      // Also fetch a fast JSON snapshot in case EventSource missed initial messages
      (async () => {
        try {
          const res = await fetch("/api/feed/progress/snapshot");
          if (res.ok) {
            const data = await res.json();
            if (data && data.snapshot) {
              // snapshot fetched
              setProgress(data.snapshot as any);
            }
          }
        } catch (e) {
          // snapshot fetch failed
        }
      })();
    };

    const closeSse = () => {
      if (closeTimeout != null) {
        clearTimeout(closeTimeout);
        closeTimeout = null;
      }
      if (eventSource) {
        try {
          eventSource.close();
        } catch {}
        eventSource = null;
      }
      setProgress(null);
    };

    if (showLoadingProgress) {
      openSse();
    } else {
      // Keep final progress around briefly so UI can animate to completion
      if (
        progress &&
        progress.total > 0 &&
        progress.completed < progress.total
      ) {
        closeTimeout = window.setTimeout(
          () => closeSse(),
          1500
        ) as unknown as number;
      } else {
        closeSse();
      }
    }

    return () => {
      if (closeTimeout != null) {
        clearTimeout(closeTimeout);
        closeTimeout = null;
      }
      if (eventSource) {
        try {
          eventSource.close();
        } catch {}
        eventSource = null;
      }
    };
  }, [showLoadingProgress]);

  return {
    progress,
    liveChannelTitle,
    fallbackTotal,
    completedFallback,
  } as const;
}

export default useFeedProgress;
