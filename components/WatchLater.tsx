import React, { useState } from "react";
import { Bookmark, Trash2, Eye, Share2, Check, Clock } from "lucide-react";

interface WatchLaterItem {
  id: string;
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  addedAt: Date;
}

interface WatchLaterProps {
  items: WatchLaterItem[];
  watchedVideos?: Set<string>;
  onRemove?: (id: string) => void;
  onPlay?: (videoId: string) => void;
  onToggleWatched?: (videoId: string) => void;
  onShare?: (videoId: string) => void;
}

export function WatchLater({
  items,
  watchedVideos,
  onRemove,
  onPlay,
  onToggleWatched,
  onShare,
}: WatchLaterProps) {
  const [copiedVideoId, setCopiedVideoId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <Bookmark className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
        <h3 className="text-lg font-semibold mb-2">No videos saved</h3>
        <p className="text-muted-foreground">
          Videos you save for later will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-4">
        <Bookmark className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold">Watch Later ({items.length})</h2>
      </div>

      {items.map((item) => {
        const isWatched = watchedVideos?.has(item.videoId);
        const addedDate = new Date(item.addedAt);
        const timeAgo = getTimeAgo(addedDate);

        return (
          <div
            key={item.id}
            className="group bg-card border border-border rounded-lg overflow-hidden hover:border-primary/50 hover:shadow-md transition-all duration-200"
          >
            {/* Main Content */}
            <div className="flex gap-3 p-3">
              {/* Thumbnail */}
              <div className="relative w-28 h-16 flex-shrink-0 rounded-md overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.thumbnail}
                  alt={item.title}
                  className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-200"
                  onClick={() => onPlay?.(item.videoId)}
                />

                {isWatched && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-md">
                    <Eye className="w-5 h-5 text-white" />
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <h4
                  className="font-semibold text-sm line-clamp-2 text-foreground group-hover:text-primary transition-colors cursor-pointer"
                  onClick={() => onPlay?.(item.videoId)}
                >
                  {item.title}
                </h4>
                <p className="text-xs text-muted-foreground mt-1">
                  {item.channel}
                </p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
                  <Clock className="w-3 h-3" />
                  {timeAgo}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-1 flex-shrink-0 items-center opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => onToggleWatched?.(item.videoId)}
                  className="p-2 rounded-md hover:bg-primary/10 transition-colors"
                  title={isWatched ? "Mark as unwatched" : "Mark as watched"}
                >
                  <Eye
                    className={`w-4 h-4 ${
                      isWatched ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                </button>
                <button
                  onClick={() => {
                    onShare?.(item.videoId);
                    setCopiedVideoId(item.videoId);
                    setTimeout(() => setCopiedVideoId(null), 2000);
                  }}
                  className="p-2 rounded-md hover:bg-primary/10 transition-colors"
                  title="Copy link"
                >
                  {copiedVideoId === item.videoId ? (
                    <Check className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Share2 className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>
                <button
                  onClick={() => onRemove?.(item.id)}
                  className="p-2 rounded-md hover:bg-destructive/10 transition-colors"
                  title="Remove"
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60,
  };

  for (const [name, secondsInUnit] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInUnit);
    if (interval >= 1) {
      return `${interval} ${name}${interval > 1 ? "s" : ""} ago`;
    }
  }

  return "just now";
}
