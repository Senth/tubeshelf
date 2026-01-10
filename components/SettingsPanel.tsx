"use client";

import React, { useState, useContext, useEffect, useRef } from "react";
import { AlertTriangle, HelpCircle, Palette, Zap, Monitor } from "lucide-react";
import { Button } from "./ui/button";
import { ThemeContext } from "./ThemeProvider";
import type { AppSettings } from "@/lib/settingsStore";

interface SettingsPanelProps {
  settings: AppSettings;
  onSave?: (settings: Partial<AppSettings>) => void;
  onDeleteSubscriptions?: (listId?: string) => Promise<void>;
  onClearWatchHistory?: () => Promise<void>;
  onResetSettings?: () => Promise<void>;
  subscriptionLists?: Array<{ id: string; name: string }>;
  currentListId?: string;
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsPanel({
  settings,
  onSave,
  onDeleteSubscriptions,
  onClearWatchHistory,
  onResetSettings,
  subscriptionLists = [],
  currentListId,
  isOpen,
  onClose,
}: SettingsPanelProps) {
  const { setTheme } = useContext(ThemeContext);
  const [local, setLocal] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<"all" | string>("all");
  const [version, setVersion] = useState<string>("...");
  const [showFeedLoadingHelp, setShowFeedLoadingHelp] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Sync local state when settings prop changes
    setLocal(settings);
  }, [settings]);

  useEffect(() => {
    // Close tooltip when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(event.target as Node)
      ) {
        setShowFeedLoadingHelp(false);
      }
    };

    if (showFeedLoadingHelp) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [showFeedLoadingHelp]);

  useEffect(() => {
    fetch("/api/version")
      .then((res) => res.json())
      .then((data) => setVersion(data.version))
      .catch(() => setVersion("unknown"));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave?.(local);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleDangerAction = async (
    action: "subscriptions" | "history" | "settings"
  ) => {
    setSaving(true);
    setError(null);
    try {
      if (action === "subscriptions") {
        const targetListId = deleteTarget === "all" ? undefined : deleteTarget;
        await onDeleteSubscriptions?.(targetListId);
      } else if (action === "history") await onClearWatchHistory?.();
      else if (action === "settings") await onResetSettings?.();
      setConfirmAction(null);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to complete action");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="space-y-6">
      {confirmAction ? (
        // Confirmation Dialog
        <div className="space-y-4">
          <div className="flex items-start gap-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-sm">
                {confirmAction === "subscriptions"
                  ? "Delete Subscriptions"
                  : confirmAction === "history"
                  ? "Clear Watch History"
                  : "Reset Settings"}
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                {confirmAction === "subscriptions"
                  ? deleteTarget === "all"
                    ? "This will permanently remove all your subscriptions from all lists. This action cannot be undone."
                    : "This will permanently remove all your subscriptions from the selected list. This action cannot be undone."
                  : confirmAction === "history"
                  ? "This will permanently clear all your watched/unwatched video states. This action cannot be undone."
                  : "Your settings will be reset to default values. Your subscriptions and watch history will not be affected."}
              </p>
            </div>
          </div>

          {confirmAction === "subscriptions" && (
            <div className="space-y-2">
              <label className="block text-sm font-medium">Delete from:</label>
              <select
                value={deleteTarget}
                onChange={(e) => setDeleteTarget(e.target.value)}
                className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm appearance-none cursor-pointer hover:border-primary/50 transition-colors"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 0.75rem center",
                  paddingRight: "2rem",
                }}
              >
                <option value="all">All Lists</option>
                {subscriptionLists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <Button
              onClick={() => {
                setConfirmAction(null);
                setDeleteTarget("all");
              }}
              variant="outline"
              size="sm"
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                handleDangerAction(
                  confirmAction as "subscriptions" | "history" | "settings"
                )
              }
              variant="destructive"
              size="sm"
              disabled={saving}
            >
              {saving ? "Processing..." : "Confirm"}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Preferences Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Preferences
            </h3>

            {/* Default Sort Order */}
            <div className="bg-card border border-border rounded-lg p-4 space-y-3">
              <div>
                <p className="text-sm font-medium">Default Sort Order</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  How to organize videos in your feed
                </p>
              </div>
              <div className="flex gap-2">
                {(["newest", "oldest"] as const).map((order) => (
                  <button
                    key={order}
                    onClick={() =>
                      setLocal({ ...local, defaultSortOrder: order })
                    }
                    className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-all ${
                      local.defaultSortOrder === order
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-secondary hover:bg-secondary/80"
                    }`}
                  >
                    {order === "newest" ? "Newest First" : "Oldest First"}
                  </button>
                ))}
              </div>
            </div>

            {/* Feed Loading Method */}
            <div
              className="bg-card border border-border rounded-lg p-4 space-y-3 relative"
              ref={tooltipRef}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium">Feed Loading Method</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Speed vs completeness trade-off
                  </p>
                </div>
                <button
                  onClick={() => setShowFeedLoadingHelp(!showFeedLoadingHelp)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Learn about feed loading methods"
                >
                  <HelpCircle size={16} />
                </button>
              </div>

              {showFeedLoadingHelp && (
                <div className="absolute right-0 top-12 z-50 bg-background border border-border rounded-lg shadow-xl p-4 w-96 text-xs space-y-3 animate-in fade-in">
                  <p className="font-semibold text-sm">
                    How Feed Loading Works
                  </p>
                  <div className="space-y-3">
                    <div>
                      <p className="font-medium text-foreground mb-1">
                        Default (Complete)
                      </p>
                      <p className="text-muted-foreground">
                        Fetches full channel data. Slower but includes all info.
                      </p>
                    </div>
                    <div>
                      <p className="font-medium text-foreground mb-1">
                        Fast (RSS Feed)
                      </p>
                      <p className="text-muted-foreground">
                        Uses YouTube RSS. Much faster but limited info (~15
                        videos).
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                {(["standard", "rss"] as const).map((method) => (
                  <button
                    key={method}
                    onClick={() => setLocal({ ...local, fetchMethod: method })}
                    className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-all ${
                      local.fetchMethod === method
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-secondary hover:bg-secondary/80"
                    }`}
                  >
                    {method === "standard" ? "Complete" : "Fast"}
                  </button>
                ))}
              </div>
            </div>

            {/* Video Player Mode */}
            <div className="bg-card border border-border rounded-lg p-4 space-y-3">
              <div>
                <p className="text-sm font-medium">Video Player</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Where to watch videos
                </p>
              </div>
              <div className="flex gap-2">
                {(["built-in", "new-tab"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() =>
                      setLocal({ ...local, videoPlayerMode: mode })
                    }
                    className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-all ${
                      local.videoPlayerMode === mode
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-secondary hover:bg-secondary/80"
                    }`}
                  >
                    {mode === "built-in" ? "Built-in" : "New Tab"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Appearance Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Palette className="w-4 h-4" />
              Appearance
            </h3>

            <div className="bg-card border border-border rounded-lg p-4 space-y-3">
              <div>
                <p className="text-sm font-medium">Theme</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Choose your preferred color scheme
                </p>
              </div>
              <div className="flex gap-2">
                {(["system", "light", "dark"] as const).map((theme) => (
                  <button
                    key={theme}
                    onClick={() => {
                      const updated = { ...local, theme };
                      setLocal(updated);
                      setTheme(theme);
                    }}
                    className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-all ${
                      local.theme === theme
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-secondary hover:bg-secondary/80"
                    }`}
                  >
                    {theme === "system"
                      ? "System"
                      : theme === "light"
                      ? "Light"
                      : "Dark"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* About Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Monitor className="w-4 h-4" />
              About
            </h3>

            <div className="bg-card border border-border rounded-lg p-4 space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Version</span>
                <span className="font-mono font-medium">v{version}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Application</span>
                <span className="font-medium">TubeShelf</span>
              </div>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-4 h-4" />
              Danger Zone
            </h3>

            <div className="space-y-2">
              <button
                onClick={() => setConfirmAction("history")}
                className="w-full bg-card border border-border/50 hover:border-destructive/50 hover:bg-destructive/5 rounded-lg p-4 text-left transition-all group"
              >
                <p className="font-medium text-sm text-destructive">
                  Clear Watch History
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Delete all watched/unwatched video states permanently
                </p>
              </button>

              <button
                onClick={() => setConfirmAction("subscriptions")}
                className="w-full bg-card border border-border/50 hover:border-destructive/50 hover:bg-destructive/5 rounded-lg p-4 text-left transition-all group"
              >
                <p className="font-medium text-sm text-destructive">
                  Delete All Subscriptions
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Remove all your channel subscriptions permanently
                </p>
              </button>

              <button
                onClick={() => setConfirmAction("settings")}
                className="w-full bg-card border border-border/50 hover:border-destructive/50 hover:bg-destructive/5 rounded-lg p-4 text-left transition-all group"
              >
                <p className="font-medium text-sm text-destructive">
                  Reset Settings
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Restore all settings to default values
                </p>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Footer Actions */}
      {!confirmAction && (
        <div className="pt-6 border-t border-border flex justify-end gap-2">
          <Button onClick={onClose} variant="outline" size="sm">
            Close
          </Button>
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      )}
    </div>
  );
}
