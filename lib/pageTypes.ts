/**
 * Page navigation type
 */
export type Page = "home" | "watch-later";

/**
 * Feed tab type
 */
export type FeedTab = "videos";

/**
 * Watch Later item interface
 */
export interface WatchLaterItem {
  id: string;
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  addedAt: Date;
}
