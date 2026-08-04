/**
 * Page navigation type
 */
export type Page =
  | "home"
  | "dashboard"
  | "watch-later"
  | "admin"
  | "admin-oidc"
  | "admin-users"
  | "admin-system"
  | "admin-youtube"
  | "settings"
  | "watch-history"
  | "about"
  | "danger-zone";

/**
 * Feed tab type
 */
export type FeedTab = "videos" | "watch-later" | "watch-history";

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
