import { NextResponse } from "next/server";
import {
  readChannelAutoLikeOverrides,
  readChannelCaptionOverrides,
  writeChannelAutoLikeOverride,
  writeChannelCaptionOverride,
} from "@/lib/channelConfigStore";
import { getCurrentUser } from "@/lib/currentUser";

async function readOverrides(userId: string) {
  const [captions, autoLike] = await Promise.all([
    readChannelCaptionOverrides(userId),
    readChannelAutoLikeOverrides(userId),
  ]);
  return { captions, autoLike };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(await readOverrides(user.id));
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const channelId =
    typeof body.channelId === "string" ? body.channelId.trim() : "";
  if (!channelId) {
    return NextResponse.json({ error: "channelId is required" }, { status: 400 });
  }

  // null clears an override so the channel follows the user default again.
  // Each key is optional, so one request can set either or both.
  const writes: Array<Promise<void>> = [];

  if ("captionsEnabled" in body) {
    const raw = body.captionsEnabled;
    if (raw !== null && typeof raw !== "boolean") {
      return NextResponse.json(
        { error: "captionsEnabled must be a boolean or null" },
        { status: 400 }
      );
    }
    writes.push(writeChannelCaptionOverride(user.id, channelId, raw));
  }

  if ("autoLikeEnabled" in body) {
    const raw = body.autoLikeEnabled;
    if (raw !== null && typeof raw !== "boolean") {
      return NextResponse.json(
        { error: "autoLikeEnabled must be a boolean or null" },
        { status: 400 }
      );
    }
    writes.push(writeChannelAutoLikeOverride(user.id, channelId, raw));
  }

  if (writes.length === 0) {
    return NextResponse.json(
      { error: "captionsEnabled or autoLikeEnabled is required" },
      { status: 400 }
    );
  }

  await Promise.all(writes);
  return NextResponse.json(await readOverrides(user.id));
}
