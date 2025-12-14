import { NextResponse } from "next/server";
import {
  fetchChannelFeed,
  fetchChannelFeedShorts,
  fetchChannelFeedLivestreams,
} from "@/lib/rss";
import { readLists } from "@/lib/subscriptionListStore";
import { readSettings } from "@/lib/settingsStore";
import { initProgress, updateProgress, getProgress } from "@/lib/feedProgress";

const CONCURRENCY = 4;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const forceRefresh = url.searchParams.get("refresh") === "true";

  // Get current settings
  let currentSettings = {
    enableVideos: true,
    enableShorts: true,
    enableLivestreams: true,
    enableVideoDuration: false,
  };
  try {
    const settingsData = await readSettings();
    currentSettings = {
      enableVideos: settingsData.enableVideos,
      enableShorts: settingsData.enableShorts,
      enableLivestreams: settingsData.enableLivestreams,
      enableVideoDuration: settingsData.enableVideoDuration,
    };
  } catch {
    // Use defaults
  }

  // Get all unique channel IDs
  const listsData = await readLists();
  const uniqueChannelIds = new Set<string>();
  listsData.lists.forEach((list) => {
    list.subscriptions.forEach((sub) => {
      uniqueChannelIds.add(sub.channelId);
    });
  });
  const channelIds = Array.from(uniqueChannelIds);

  if (channelIds.length === 0) {
    return NextResponse.json({ items: [] });
  }

  // Initialize progress tracking
  initProgress(channelIds.length);
  const { sessionId } = getProgress();

  // Use Server-Sent Events to stream videos
  const encoder = new TextEncoder();
  let sentItems: Set<string> = new Set();

  const customReadable = new ReadableStream({
    async start(controller) {
      try {
        const queue = [...channelIds];
        const feedSettings = currentSettings;

        const worker = async () => {
          while (queue.length > 0) {
            const current = queue.shift()!;
            try {
              let meta: { title: string; thumbnail?: string } | undefined;
              const channelItems: any[] = [];

              // Fetch regular videos only if enabled
              if (feedSettings.enableVideos) {
                const result = await fetchChannelFeed(current);
                meta = result.meta;
                const regularVideos = result.videos;
                regularVideos.forEach((video) => {
                  const item = {
                    ...video,
                    channelTitle: video.channelTitle || meta?.title,
                    thumbnail: video.thumbnail || meta?.thumbnail,
                    channelId: video.channelId || current,
                    isShort: video.isShort,
                    isLivestream: video.isLivestream,
                  };
                  channelItems.push(item);
                });
              }

              // Fetch shorts if enabled
              if (feedSettings.enableShorts) {
                try {
                  const { videos: shortVideos, meta: shortMeta } =
                    await fetchChannelFeedShorts(current);
                  if (!meta && shortMeta) {
                    meta = shortMeta;
                  }
                  shortVideos.forEach((video) => {
                    const item = {
                      ...video,
                      channelTitle: video.channelTitle || meta?.title,
                      thumbnail: video.thumbnail || meta?.thumbnail,
                      channelId: video.channelId || current,
                      isShort: true,
                    };
                    channelItems.push(item);
                  });
                } catch {
                  // Continue if shorts fetch fails
                }
              }

              // Fetch livestreams if enabled
              if (feedSettings.enableLivestreams) {
                try {
                  const { videos: livestreams, meta: livestreamMeta } =
                    await fetchChannelFeedLivestreams(current);
                  if (!meta && livestreamMeta) {
                    meta = livestreamMeta;
                  }
                  livestreams.forEach((video) => {
                    const item = {
                      ...video,
                      channelTitle: video.channelTitle || meta?.title,
                      thumbnail: video.thumbnail || meta?.thumbnail,
                      channelId: video.channelId || current,
                      isLivestream: true,
                    };
                    channelItems.push(item);
                  });
                } catch {
                  // Continue if livestreams fetch fails
                }
              }

              // Update progress
              const channelTitle = meta?.title || current;
              updateProgress(current, channelTitle, sessionId);

              // Send newly fetched items
              for (const item of channelItems) {
                const itemId = `${item.id || item.videoId}`;
                if (!sentItems.has(itemId)) {
                  sentItems.add(itemId);
                  const line = `data: ${JSON.stringify(item)}\n\n`;
                  controller.enqueue(encoder.encode(line));
                }
              }
            } catch (err) {
              console.error("[Feed Stream] Failed to load feed for channel", {
                channelId: current,
                error: err instanceof Error ? err.message : String(err),
              });
              updateProgress(current, `[Error] ${current}`, sessionId);
            }
          }
        };

        await Promise.all(Array.from({ length: CONCURRENCY }, worker));
        controller.close();
      } catch (error) {
        console.error("[Feed Stream] Error:", error);
        controller.close();
      }
    },
  });

  return new NextResponse(customReadable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
