import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { discoverCastDevices } from "@/lib/cast/discover";
import { listCastScreens } from "@/lib/cast/castScreens";
import { refreshLoungeToken, screenIsOnline } from "@/lib/cast/lounge";

export interface CastDeviceView {
  id: string;
  name: string;
  kind: "chromecast" | "lounge";
  online: boolean;
}

// Discovery is the slow part; TVs come and go, so cache briefly. Empty scans
// stay cacheable for just a few seconds so "search again" is not a stall.
let cache: { at: number; devices: CastDeviceView[] } | null = null;
const CACHE_MS = 15000;
const EMPTY_CACHE_MS = 3000;

async function scanDevices(): Promise<CastDeviceView[]> {
  const [chromecasts, screens] = await Promise.all([
    discoverCastDevices(),
    Promise.resolve(listCastScreens()),
  ]);

  const devices: CastDeviceView[] = chromecasts.map((device) => ({
    id: device.host,
    name: device.name,
    kind: "chromecast" as const,
    online: true,
  }));

  await Promise.all(
    screens.map(async (screen) => {
      // Availability needs a fresh token, which is also what casting uses.
      let online = false;
      try {
        online = await screenIsOnline(await refreshLoungeToken(screen.screenId));
      } catch {
        online = false;
      }
      devices.push({
        id: screen.screenId,
        name: screen.name,
        kind: "lounge" as const,
        online,
      });
    })
  );

  return devices;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (
      !cache ||
      Date.now() - cache.at > (cache.devices.length > 0 ? CACHE_MS : EMPTY_CACHE_MS)
    ) {
      cache = { at: Date.now(), devices: await scanDevices() };
    }
    return NextResponse.json({ devices: cache.devices });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Device discovery failed" },
      { status: 500 }
    );
  }
}
