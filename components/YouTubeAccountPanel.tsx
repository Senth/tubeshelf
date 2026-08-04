"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Loader2, ThumbsUp, Unlink } from "lucide-react";
import {
  AUTO_LIKE_THRESHOLD_DEFAULT,
  AUTO_LIKE_THRESHOLD_MAX,
  AUTO_LIKE_THRESHOLD_MIN,
} from "@/lib/settingsSchema";

interface AccountStatus {
  configured: boolean;
  linked: boolean;
  label: string | null;
  linkedAt: string | null;
}

interface YouTubeAccountPanelProps {
  autoLikeEnabled?: boolean;
  onAutoLikeEnabledChange?: (enabled: boolean) => void;
  autoLikeThresholdPercent?: number;
  onAutoLikeThresholdChange?: (percent: number) => void;
  onShowToast?: (message: string, type: "success" | "error" | "info") => void;
}

export function YouTubeAccountPanel({
  autoLikeEnabled = false,
  onAutoLikeEnabledChange,
  autoLikeThresholdPercent = AUTO_LIKE_THRESHOLD_DEFAULT,
  onAutoLikeThresholdChange,
  onShowToast,
}: YouTubeAccountPanelProps) {
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch("/api/youtube/account", {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to load account status");
        const data: AccountStatus = await res.json();
        if (!cancelled) setStatus(data);
      } catch {
        if (!cancelled) setStatus(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleConnect = () => {
    // A full navigation, not fetch: Google's consent screen has to be visited.
    window.location.href = "/api/youtube/oauth/start";
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/youtube/account", {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to disconnect");
      setStatus(await res.json());
      onShowToast?.("YouTube account disconnected", "success");
    } catch {
      onShowToast?.("Could not disconnect the YouTube account", "error");
    } finally {
      setDisconnecting(false);
    }
  };

  // Nothing to show when the instance has no OAuth client: the whole feature is
  // opt-in per install.
  if (loading || !status?.configured) {
    return null;
  }

  return (
    <div className="bg-card/50 border border-border/30 rounded-xl p-5 space-y-4 backdrop-blur-sm">
      <div>
        <p className="text-sm font-semibold text-foreground flex items-center gap-2">
          <ThumbsUp className="w-4 h-4" />
          YouTube Likes
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Connect your YouTube account to like videos straight from the built-in
          player.
        </p>
      </div>

      {status.linked ? (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
              <CheckCircle className="w-4 h-4" />
              Connected{status.label ? ` as ${status.label}` : ""}
            </span>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="px-3 py-1.5 rounded-lg text-sm bg-muted/60 hover:bg-muted transition disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5"
            >
              {disconnecting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Unlink className="w-3.5 h-3.5" />
              )}
              Disconnect
            </button>
          </div>

          <div className="border-t border-border/30 pt-4 space-y-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Auto-like</p>
              <p className="text-xs text-muted-foreground mt-1">
                Default for every channel. Individual channels can override this
                from the player settings menu.
              </p>
            </div>

            <div className="flex gap-2">
              {(
                [
                  { label: "Off", value: false },
                  { label: "On", value: true },
                ] as const
              ).map((option) => (
                <button
                  key={option.label}
                  onClick={() => onAutoLikeEnabledChange?.(option.value)}
                  className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    autoLikeEnabled === option.value
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                      : "bg-muted/60 hover:bg-muted text-foreground hover:shadow-md"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="auto-like-threshold"
                  className="text-xs text-muted-foreground"
                >
                  Like after watching
                </label>
                <span className="text-sm font-medium tabular-nums">
                  {autoLikeThresholdPercent}%
                </span>
              </div>
              <input
                id="auto-like-threshold"
                type="range"
                min={AUTO_LIKE_THRESHOLD_MIN}
                max={AUTO_LIKE_THRESHOLD_MAX}
                step={5}
                value={autoLikeThresholdPercent}
                onChange={(e) =>
                  onAutoLikeThresholdChange?.(Number(e.target.value))
                }
                className="w-full accent-primary cursor-pointer"
              />
              <p className="text-xs text-muted-foreground">
                Measured by position in the video, so skipping a sponsor segment
                or watching at higher speed still counts. Each video is liked at
                most once, and unliking by hand sticks.
              </p>
            </div>
          </div>
        </>
      ) : (
        <button
          onClick={handleConnect}
          className="px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition cursor-pointer"
        >
          Connect YouTube account
        </button>
      )}
    </div>
  );
}
