"use client";

import React, { useState, useEffect } from "react";
import { Trash2, Play, History, AlertTriangle } from "lucide-react";
import { Button } from "./ui/button";
import type { PlaybackSession } from "@/lib/playbackHistoryStore";

interface PlaybackHistoryProps {
  onClose: () => void;
  onPlayVideo?: (videoId: string, progress: number) => void;
}

export function PlaybackHistory({
  onClose,
  onPlayVideo,
}: PlaybackHistoryProps) {
  const [history, setHistory] = useState<PlaybackSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const response = await fetch("/api/playback-history");
      const data = await response.json();
      setHistory(data);
    } catch (error) {
      console.error("Failed to fetch playback history:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (videoId: string) => {
    try {
      await fetch(`/api/playback-history?videoId=${videoId}`, {
        method: "DELETE",
      });
      setHistory(history.filter((s) => s.videoId !== videoId));
    } catch (error) {
      console.error("Failed to delete playback session:", error);
    }
  };

  const handleClearAll = async () => {
    try {
      await fetch("/api/playback-history?clearAll=true", {
        method: "DELETE",
      });
      setHistory([]);
      setConfirmClear(false);
    } catch (error) {
      console.error("Failed to clear playback history:", error);
    }
  };

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getProgressPercentage = (progress: number, duration: number) => {
    if (!duration) return 0;
    return Math.round((progress / duration) * 100);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) return "just now";
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <div className="animate-spin mr-2">⏳</div>
        Loading history...
      </div>
    );
  }

  if (confirmClear) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-sm">Clear Watch History</p>
            <p className="text-sm text-muted-foreground mt-2">
              This will permanently delete your entire playback history. This
              action cannot be undone.
            </p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button
            onClick={() => setConfirmClear(false)}
            variant="outline"
            size="sm"
          >
            Cancel
          </Button>
          <Button onClick={handleClearAll} variant="destructive" size="sm">
            Clear All
          </Button>
        </div>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-12">
        <History className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
        <h3 className="text-lg font-semibold mb-2">No watch history</h3>
        <p className="text-muted-foreground">
          Videos you watch will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <History className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold">
          Playback History ({history.length})
        </h2>
      </div>

      {/* History List */}
      <div className="space-y-2">
        {history.map((session) => {
          const progressPercent = getProgressPercentage(
            session.progress,
            session.duration
          );
          const thumbnailUrl =
            session.thumbnail ||
            `https://i.ytimg.com/vi/${session.videoId}/hqdefault.jpg`;

          return (
            <div
              key={session.videoId}
              className="group bg-card border border-border rounded-lg overflow-hidden hover:border-primary/50 hover:shadow-md transition-all duration-200"
            >
              <div className="flex gap-3 p-3">
                {/* Thumbnail with progress */}
                <div className="flex-shrink-0 relative w-28 h-16 rounded-md overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumbnailUrl}
                    alt={session.videoTitle}
                    className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-200"
                    onClick={() =>
                      onPlayVideo?.(session.videoId, session.progress)
                    }
                  />
                  {/* Progress bar */}
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-secondary">
                    <div
                      className="h-full bg-red-500 transition-all"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h4
                    className="font-semibold text-sm line-clamp-2 text-foreground group-hover:text-primary transition-colors cursor-pointer"
                    onClick={() =>
                      onPlayVideo?.(session.videoId, session.progress)
                    }
                  >
                    {session.videoTitle}
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    {session.channelName}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                    <span>
                      {formatTime(session.progress)} /{" "}
                      {formatTime(session.duration)}
                    </span>
                    <span>•</span>
                    <span>{formatDate(session.timestamp)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-1 flex-shrink-0 items-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() =>
                      onPlayVideo?.(session.videoId, session.progress)
                    }
                    className="p-2 rounded-md hover:bg-primary/10 transition-colors"
                    title="Resume playback"
                  >
                    <Play className="w-4 h-4 text-primary" />
                  </button>
                  <button
                    onClick={() => handleDelete(session.videoId)}
                    className="p-2 rounded-md hover:bg-destructive/10 transition-colors"
                    title="Remove from history"
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      {history.length > 0 && (
        <div className="pt-4 border-t border-border flex justify-end">
          <Button
            onClick={() => setConfirmClear(true)}
            variant="destructive"
            size="sm"
          >
            Clear All History
          </Button>
        </div>
      )}
    </div>
  );
}
