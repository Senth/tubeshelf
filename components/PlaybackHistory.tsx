"use client";

import React, { useState, useEffect } from "react";
import { X, Trash2, Play } from "lucide-react";
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
    if (confirm("Are you sure you want to clear all playback history?")) {
      try {
        await fetch("/api/playback-history?clearAll=true", {
          method: "DELETE",
        });
        setHistory([]);
      } catch (error) {
        console.error("Failed to clear playback history:", error);
      }
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

    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div className="bg-card rounded-lg shadow-xl max-w-2xl w-full max-h-96 mx-4 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-xl font-bold">Playback History</h2>
          <Button
            onClick={onClose}
            variant="ghost"
            size="icon"
            className="rounded-full"
          >
            <X size={20} />
          </Button>
        </div>

        {/* History list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Loading...
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
              <div className="w-20 h-20 rounded bg-secondary/50 flex items-center justify-center mb-4">
                <span className="text-4xl">📺</span>
              </div>
              <p className="text-lg font-medium">No playback history yet</p>
              <p className="text-sm text-muted-foreground/70 mt-2">
                Videos you watch will appear here
              </p>
            </div>
          ) : (
            <div className="space-y-2 p-4">
              {history.map((session) => {
                const progressPercent = getProgressPercentage(
                  session.progress,
                  session.duration
                );
                const isCompleted = progressPercent >= 90; // Consider 90%+ as watched
                // Fallback to YouTube thumbnail if no thumbnail stored
                const thumbnailUrl = session.thumbnail || `https://i.ytimg.com/vi/${session.videoId}/hqdefault.jpg`;

                return (
                  <div
                    key={session.videoId}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-secondary transition-colors"
                  >
                    {/* Thumbnail */}
                    <div className="flex-shrink-0 relative w-40">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={thumbnailUrl}
                        alt={session.videoTitle}
                        className="w-full aspect-video rounded object-cover"
                      />
                      {/* Progress bar */}
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-600 rounded-b">
                        <div
                          className="h-full bg-red-600 rounded-b transition-all"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm line-clamp-2">
                        {session.videoTitle}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {session.channelName}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatTime(session.progress)} /{" "}
                        {formatTime(session.duration)} •{" "}
                        {formatDate(session.timestamp)}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1 flex-shrink-0 items-center">
                      <button
                        onClick={() => onPlayVideo?.(session.videoId, session.progress)}
                        className="p-2 bg-primary/20 hover:bg-primary/30 rounded transition-colors cursor-pointer hover:scale-110"
                        title="Resume playback"
                      >
                        <Play className="w-4 h-4 text-primary" />
                      </button>
                      <button
                        onClick={() => handleDelete(session.videoId)}
                        className="p-2 bg-destructive/20 hover:bg-destructive/30 rounded transition-colors cursor-pointer hover:scale-110"
                        title="Remove from history"
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {history.length > 0 && (
          <div className="border-t border-border px-6 py-3 flex justify-end">
            <Button onClick={handleClearAll} variant="destructive" size="sm">
              Clear All History
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
