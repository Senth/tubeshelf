import { NextResponse } from "next/server";
import { fetchChannelFeed } from "@/lib/videoFetcher";
import { readLists } from "@/lib/subscriptionListStore";
import { readSettings } from "@/lib/settingsStore";
import { initProgress, updateProgress, getProgress } from "@/lib/feedProgress";
import * as logger from "@/lib/logger";

const CONCURRENCY = 4;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const forceRefresh = url.searchParams.get("refresh") === "true";
  const requestId = Math.random().toString(36).substring(7);
  const timestamp = new Date().toISOString();

  logger.debug(`[Stream Server] ========== NEW STREAM REQUEST ==========`);
  logger.debug(`[Stream Server] Request ID: ${requestId}`);
  logger.debug(`[Stream Server] Timestamp: ${timestamp}`);
  logger.debug(`[Stream Server] forceRefresh: ${forceRefresh}`);
  logger.debug(`[Stream Server] Full URL: ${req.url}`);
  logger.debug(
    `[Stream Server] Headers:`,
    Object.fromEntries(req.headers.entries())
  );

  // Get current settings (only video enable flag)
  let currentSettings = { enableVideos: true };
  try {
    const settingsData = await readSettings();
    currentSettings = { enableVideos: settingsData.enableVideos };
  } catch {
    // Use defaults
  }

  // Get all unique channel IDs and map channelId -> title for logging
  const listsData = await readLists();
  const uniqueChannelIds = new Set<string>();
  const channelTitleMap = new Map<string, string>();
  listsData.lists.forEach((list) => {
    list.subscriptions.forEach((sub) => {
      uniqueChannelIds.add(sub.channelId);
      if (!channelTitleMap.has(sub.channelId)) {
        channelTitleMap.set(sub.channelId, sub.title || "(unknown)");
      }
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
      logger.info(
        `[Stream Server] ${requestId} - Starting stream processing with ${channelIds.length} channels`
      );
      try {
        const queue = [...channelIds];
        const feedSettings = currentSettings;
        logger.debug(
          `[Stream Server] ${requestId} - Feed settings:`,
          feedSettings
        );

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

                // If the fetch returned no videos and no meta title, log as unavailable/404
                if (
                  (result.videos || []).length === 0 &&
                  !(meta && meta.title)
                ) {
                  const subTitle = channelTitleMap.get(current) || "(unknown)";
                  console.warn(
                    `[Stream] Channel unavailable or returned 404: ${current} - ${subTitle}`
                  );
                }

                // Update progress now that we have the channel title
                const channelTitle = meta?.title || current;
                updateProgress(current, channelTitle, sessionId);

                const regularVideos = result.videos;
                regularVideos.forEach((video) => {
                  const item = {
                    ...video,
                    channelTitle: video.channelTitle || meta?.title,
                    thumbnail: video.thumbnail || meta?.thumbnail,
                    channelId: video.channelId || current,
                  };
                  channelItems.push(item);
                });
              }

              // Fetch only regular videos for each channel

              // Send newly fetched items sorted by publish date (newest first)
              channelItems.sort((a, b) => {
                const dateA = new Date(a.publishedAt || 0).getTime();
                const dateB = new Date(b.publishedAt || 0).getTime();
                return dateB - dateA; // Descending order (newest first)
              });

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
            }
          }
        };

        await Promise.all(Array.from({ length: CONCURRENCY }, worker));
        logger.info(
          `[Stream Server] ${requestId} - Stream completed, sent ${
            sentItems.size
          } unique items at ${new Date().toISOString()}`
        );
        logger.debug(
          `[Stream Server] ${requestId} - ========== STREAM REQUEST COMPLETE ==========`
        );
        try {
          // Ensure progress is finalized so clients don't see a stuck percentage
          const { completeProgress } = await import("@/lib/feedProgress");
          completeProgress();
        } catch (e) {
          console.warn("Failed to finalize progress:", e);
        }
        controller.close();
      } catch (error) {
        console.error("[Stream] Error:", error);
        try {
          const { completeProgress } = await import("@/lib/feedProgress");
          completeProgress();
        } catch (e) {
          console.warn("Failed to finalize progress after error:", e);
        }
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
