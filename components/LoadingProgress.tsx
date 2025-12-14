import React, { useEffect, useState, useRef } from "react";

interface FeedProgress {
  total: number;
  completed: number;
  currentChannel?: string;
  currentChannelTitle?: string;
}

interface LoadingProgressProps {
  isVisible: boolean;
}

export function LoadingProgress({ isVisible }: LoadingProgressProps) {
  const [progress, setProgress] = useState<FeedProgress>({
    total: 0,
    completed: 0,
  });
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!isVisible) {
      // Reset progress when becoming invisible
      setProgress({ total: 0, completed: 0 });
      // Close any existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    // Avoid creating multiple EventSource connections
    if (!eventSourceRef.current) {
      eventSourceRef.current = new EventSource("/api/feed/progress");
    }

    const eventSource = eventSourceRef.current;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setProgress(data);
      } catch (e) {
        console.error("Failed to parse progress update:", e);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      eventSourceRef.current = null;
    };

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [isVisible]);

  if (!isVisible || progress.total === 0) {
    return null;
  }

  const percentage = Math.round((progress.completed / progress.total) * 100);

  return (
    <div className="w-64 h-3 bg-secondary rounded-full overflow-hidden ml-auto">
      <div
        className="h-full bg-gradient-to-r from-primary via-primary/80 to-primary rounded-full transition-all duration-300 ease-out"
        style={{ width: `${Math.min(percentage, 100)}%` }}
      />
    </div>
  );
}
