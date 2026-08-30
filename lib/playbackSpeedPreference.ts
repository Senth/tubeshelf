/**
 * Playback speed is remembered per device (like the feed filter toggles):
 * the same user may want 1.5x on the desktop and 1x on a tablet. The value is
 * restricted to the rate list the player itself offers.
 */

const STORAGE_KEY_PREFIX = "tubeshelf.playbackSpeed.";

export const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export function isValidPlaybackSpeed(value: unknown): value is number {
  return (
    typeof value === "number" &&
    PLAYBACK_SPEEDS.includes(value)
  );
}

/** The speed stored on this device, or null when the user never changed it. */
export function readPlaybackSpeedPreference(userId: string): number | null {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + userId);
    if (raw === null) return null;
    const speed = Number(raw);
    return isValidPlaybackSpeed(speed) ? speed : null;
  } catch {
    return null;
  }
}

export function writePlaybackSpeedPreference(userId: string, speed: number) {
  if (typeof window === "undefined" || !userId || !isValidPlaybackSpeed(speed)) return;
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + userId, String(speed));
  } catch {
    // Private mode etc. — the preference is a nicety, not data.
  }
}
