import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";

export interface AppSettings {
  defaultSortOrder: "newest" | "oldest";
  theme: "light" | "dark" | "system";
  videoPlayerMode: "built-in" | "new-tab";
  hasCompletedWelcome: boolean;
  fetchMethod: "standard" | "rss";
}

export const defaultSettings: AppSettings = {
  defaultSortOrder: "newest",
  theme: "system",
  videoPlayerMode: "built-in",
  hasCompletedWelcome: false,
  fetchMethod: "standard",
};

const dataDir = "data";
const settingsFile = join(dataDir, "settings.json");

export async function readSettings(): Promise<AppSettings> {
  try {
    const data = await readFile(settingsFile, "utf-8");
    return { ...defaultSettings, ...JSON.parse(data) };
  } catch {
    return defaultSettings;
  }
}

export async function writeSettings(
  settings: Partial<AppSettings>
): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  const current = await readSettings();
  const updated = { ...current, ...settings };

  // Only keep properties that are in AppSettings interface
  const validSettings: Partial<AppSettings> = {};
  const keys: (keyof AppSettings)[] = [
    "defaultSortOrder",
    "theme",
    "videoPlayerMode",
    "hasCompletedWelcome",
    "fetchMethod",
  ];

  for (const key of keys) {
    if (key in updated) {
      validSettings[key] = updated[key];
    }
  }

  await writeFile(
    settingsFile,
    JSON.stringify(validSettings, null, 2),
    "utf-8"
  );
}
