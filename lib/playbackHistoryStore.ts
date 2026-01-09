import { promises as fs } from "fs";
import path from "path";

export interface PlaybackSession {
  videoId: string;
  videoTitle: string;
  channelId: string;
  channelName: string;
  thumbnail: string;
  timestamp: string;
  duration: number; // in seconds
  progress: number; // in seconds
  completed: boolean;
}

const dataDir = path.join(process.cwd(), "data");
const playbackHistoryFile = path.join(dataDir, "playbackHistory.json");

async function ensureDir() {
  await fs.mkdir(dataDir, { recursive: true });
}

async function ensurePlaybackHistoryFile() {
  try {
    await fs.access(playbackHistoryFile);
  } catch {
    await ensureDir();
    await fs.writeFile(playbackHistoryFile, "[]", "utf8");
  }
}

export async function readPlaybackHistory(): Promise<PlaybackSession[]> {
  await ensurePlaybackHistoryFile();
  try {
    const data = await fs.readFile(playbackHistoryFile, "utf8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function savePlaybackSession(
  session: PlaybackSession
): Promise<void> {
  await ensurePlaybackHistoryFile();
  const history = await readPlaybackHistory();

  // Remove any existing session for this video
  const filtered = history.filter((s) => s.videoId !== session.videoId);

  // Add the new session at the beginning
  const updated = [session, ...filtered];

  // Keep only last 500 sessions to prevent file from growing too large
  const trimmed = updated.slice(0, 500);

  await fs.writeFile(
    playbackHistoryFile,
    JSON.stringify(trimmed, null, 2),
    "utf8"
  );
}

export async function getPlaybackSession(
  videoId: string
): Promise<PlaybackSession | null> {
  const history = await readPlaybackHistory();
  return history.find((s) => s.videoId === videoId) || null;
}

export async function clearPlaybackHistory(): Promise<void> {
  await ensureDir();
  await fs.writeFile(playbackHistoryFile, "[]", "utf8");
}

export async function deletePlaybackSession(videoId: string): Promise<void> {
  const history = await readPlaybackHistory();
  const filtered = history.filter((s) => s.videoId !== videoId);
  await fs.writeFile(
    playbackHistoryFile,
    JSON.stringify(filtered, null, 2),
    "utf8"
  );
}
