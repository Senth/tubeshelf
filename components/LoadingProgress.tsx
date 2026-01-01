"use client";

import React from "react";

interface LoadingProgressProps {
  isVisible: boolean;
}

export function LoadingProgress({ isVisible }: LoadingProgressProps) {
  if (!isVisible) return null;

  return (
    <div className="flex items-center ml-auto">
      {/* Shimmer loading bar */}
      <div className="w-48 h-1 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-zinc-900 dark:via-zinc-100 to-transparent animate-[shimmer_1.5s_ease-in-out_infinite] opacity-40 dark:opacity-60" />
      </div>

      <style jsx>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </div>
  );
}
