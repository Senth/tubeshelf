import { NextResponse } from "next/server";
import {
  readChannelCaptionOverrides,
  writeChannelCaptionOverride,
} from "@/lib/channelConfigStore";
import { getCurrentUser } from "@/lib/currentUser";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const captions = await readChannelCaptionOverrides(user.id);
  return NextResponse.json({ captions });
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

  // null clears the override so the channel follows the user default again.
  const raw = body.captionsEnabled;
  if (raw !== null && typeof raw !== "boolean") {
    return NextResponse.json(
      { error: "captionsEnabled must be a boolean or null" },
      { status: 400 }
    );
  }

  await writeChannelCaptionOverride(user.id, channelId, raw);
  const captions = await readChannelCaptionOverrides(user.id);
  return NextResponse.json({ captions });
}
