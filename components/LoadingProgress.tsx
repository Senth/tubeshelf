"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import type { Video } from "@/lib/mockData";

interface FeedProgress {
  total: number;
  completed: number;
  currentChannelTitle?: string;
}

interface LoadingProgressProps {
  isVisible: boolean;
  // optional server-sent progress snapshot
  progress?: FeedProgress | null;
  liveChannelTitle?: string | null;
  // fallback total derived from subscription lists (page may supply)
  fallbackTotal?: number | null;
  // videos received so far (used to derive completed fallback)
  videos?: Video[];
}

export function LoadingProgress({
  isVisible,
  progress,
  liveChannelTitle,
  fallbackTotal,
  videos,
}: LoadingProgressProps) {
  if (!isVisible) return null;

  const hasServerProgress = !!progress && progress.total > 0;

  // Derive fallback total if not provided
  const derivedFallbackTotal = useMemo(() => {
    if (typeof fallbackTotal === "number" && fallbackTotal > 0)
      return fallbackTotal;
    // Fallback: count unique channels in provided videos (best-effort estimate)
    if (videos && videos.length > 0) {
      const set = new Set<string>();
      videos.forEach((v) => v.channelId && set.add(v.channelId));
      return set.size || 0;
    }
    return 0;
  }, [fallbackTotal, videos]);

  const effectiveTotal = hasServerProgress
    ? progress!.total || 0
    : derivedFallbackTotal || 0;

  const completedFromServer = hasServerProgress ? progress!.completed : 0;
  const completedFallback = useMemo(() => {
    if (!videos) return 0;
    const set = new Set<string>();
    videos.forEach((v) => v.channelId && set.add(v.channelId));
    return set.size;
  }, [videos]);

  // Compute an initial displayed value synchronously to avoid a 0 -> N jump on first render
  const initialDisplayed = Math.max(completedFromServer, completedFallback);
  const [displayed, setDisplayed] = useState<number>(initialDisplayed);
  const [animate, setAnimate] = useState(false);

  const intervalRef = useRef<number | null>(null);
  const lastServerTs = useRef<number | null>(null);

  // Sync when server progress updates
  useEffect(() => {
    if (hasServerProgress) {
      lastServerTs.current = Date.now();
      // jump to server value (but don't overshoot total)
      setDisplayed(Math.min(progress!.completed, progress!.total));
      // if server reports completion, finalize quickly
      if (progress!.completed >= progress!.total && progress!.total > 0) {
        // small delay to allow UX animation
        setTimeout(() => setDisplayed(progress!.total), 200);
      }
    }
  }, [progress]);

  // If we don't have server progress but have fallbacks, make the displayed value reflect them immediately
  useEffect(() => {
    const hasFallback =
      !hasServerProgress && (derivedFallbackTotal > 0 || completedFallback > 0);
    if (hasFallback) {
      // Use completedFallback as displayed completed
      setDisplayed(
        Math.min(completedFallback, derivedFallbackTotal || completedFallback)
      );
    }
  }, [hasServerProgress, derivedFallbackTotal, completedFallback]);

  // Pseudo-progress engine when server updates are sparse or absent
  useEffect(() => {
    if (!isVisible) return;

    // Only run pseudo-progress when we have NO authoritative counts available
    const hasAuthoritative =
      hasServerProgress || derivedFallbackTotal > 0 || completedFallback > 0;
    if (hasAuthoritative) {
      // ensure we stop any pseudo-progress
      if (intervalRef.current != null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // At this point we have no server progress and no fallbacks — run pseudo-progress toward a soft cap
    const targetTotal = Math.max(5, 10);
    const softCap = Math.floor(targetTotal * 0.7);
    if (displayed >= softCap) return;

    if (intervalRef.current == null) {
      intervalRef.current = window.setInterval(() => {
        setDisplayed((prev) => {
          const remaining = Math.max(0, softCap - prev);
          const step = Math.max(1, Math.round(Math.max(1, remaining) * 0.12));
          return Math.min(prev + step, softCap);
        });
      }, 600) as unknown as number;
    }

    return () => {
      if (intervalRef.current != null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isVisible, effectiveTotal, progress, completedFallback, displayed]);

  // Clean up when hidden
  useEffect(() => {
    if (!isVisible) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [isVisible]);

  // Enable transitions after mount to avoid initial flash
  useEffect(() => {
    const id = window.setTimeout(() => setAnimate(true), 80);
    return () => clearTimeout(id);
  }, []);

  // Decide final numbers for rendering
  const finalTotal = Math.max(effectiveTotal, 0);
  const finalCompleted = Math.min(displayed, finalTotal || displayed);

  // Indeterminate when we have no sensible total
  // Always treat a zero total as indeterminate to avoid rendering a full bar
  const showIndeterminate = finalTotal === 0;

  if (showIndeterminate) {
    return (
      <div className="flex items-center gap-2 ml-auto">
        <div className="w-64 h-3 bg-secondary rounded-full overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/60 to-transparent animate-[move_1.8s_linear_infinite]" />
        </div>
        <div className="w-3 h-3 rounded-full bg-primary animate-pulse" />
        <style>{`@keyframes move { 0% { transform: translateX(-30%);} 100% { transform: translateX(130%);} }`}</style>
      </div>
    );
  }

  const percentage = Math.round(
    (finalCompleted / Math.max(finalTotal, 1)) * 100
  );
  const isStalled = finalCompleted >= finalTotal && finalTotal > 0;

  return (
    <div
      className={`flex items-center gap-2 ml-auto ${
        animate ? "" : "invisible"
      }`}
    >
      <div className="w-64 h-3 bg-secondary rounded-full overflow-hidden relative">
        <div
          className={`h-full bg-gradient-to-r from-primary via-primary/80 to-primary rounded-full ${
            animate ? "transition-all duration-300 ease-out" : ""
          }`}
          style={{ width: `${Math.min(isStalled ? 98 : percentage, 100)}%` }}
        />

        {isStalled && (
          <div className="absolute inset-0">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/60 to-transparent animate-[move_1.8s_linear_infinite]" />
          </div>
        )}
      </div>
      <style>{`@keyframes move { 0% { transform: translateX(-30%);} 100% { transform: translateX(130%);} }`}</style>
    </div>
  );
}
