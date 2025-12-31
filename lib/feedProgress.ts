// Global progress tracking for feed fetching
interface FeedProgressInternal {
  total: number;
  completed: number;
  currentChannel?: string;
  currentChannelTitle?: string;
  subscribers: ((data: any) => void)[];
  sessionId?: string;
}

// Public snapshot type (sanitized, JSON-safe)
export type FeedProgress = {
  total: number;
  completed: number;
  currentChannel?: string;
  currentChannelTitle?: string;
  sessionId?: string;
};

import * as logger from "@/lib/logger";

const progress: FeedProgressInternal = {
  total: 0,
  completed: 0,
  subscribers: [],
};

export function initProgress(total: number) {
  // Don't clear subscribers, just reset the progress values
  progress.total = total;
  progress.completed = 0;
  progress.currentChannel = undefined;
  progress.currentChannelTitle = undefined;
  // Start a new session for this progress run
  progress.sessionId = `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  logger.info(`[FeedProgress] initProgress: total=${total}, sessionId=${progress.sessionId}`);
  notifySubscribers();
}

export function updateProgress(
  channelId: string,
  channelTitle?: string,
  sessionId?: string
) {
  // Ignore updates from previous sessions
  if (sessionId && progress.sessionId && sessionId !== progress.sessionId) {
    logger.debug(`[FeedProgress] Ignoring update from old session: ${sessionId}`);
    return;
  }
  // Ignore updates if progress is not initialized
  if (progress.total <= 0) {
    logger.debug(`[FeedProgress] Progress not initialized, ignoring update`);
    return;
  }
  // If already completed, keep it capped and ignore further increments
  if (progress.completed >= progress.total) {
    progress.completed = progress.total;
    return;
  }
  progress.completed += 1;
  if (progress.completed > progress.total) {
    progress.completed = progress.total;
  }
  progress.currentChannel = channelId;
  progress.currentChannelTitle = channelTitle;
  logger.debug(`[FeedProgress] ${progress.completed}/${progress.total}: ${channelTitle}`);
  notifySubscribers();
}

// Return a sanitized snapshot (no functions) for JSON serialization
export function getProgress() {
  const { total, completed, currentChannel, currentChannelTitle, sessionId } = progress;
  return { total, completed, currentChannel, currentChannelTitle, sessionId };
}

// Mark progress as complete and notify subscribers (used when stream finishes)
export function completeProgress() {
  if (progress.total > 0) {
    progress.completed = progress.total;
  }
  progress.currentChannel = undefined;
  progress.currentChannelTitle = undefined;
  notifySubscribers();
}

export function subscribe(callback: (data: FeedProgress) => void) {
  progress.subscribers.push(callback as any);
  // Immediately send sanitized snapshot
  callback(getProgress() as any);

  return () => {
    progress.subscribers = progress.subscribers.filter((cb) => cb !== (callback as any));
  };
}

function notifySubscribers() {
  const snapshot = getProgress();
  progress.subscribers.forEach((callback) => {
    try {
      callback(snapshot as any);
    } catch {}
  });
}
