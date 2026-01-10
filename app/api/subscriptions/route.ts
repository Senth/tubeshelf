import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { resolveChannelId, fetchChannelFeed } from "@/lib/videoFetcher";
import {
  readSubscriptions,
  writeSubscriptions,
  StoredSubscription,
} from "@/lib/subscriptionStore";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const subs = await readSubscriptions();
  return NextResponse.json(subs);
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const input = body?.input as string | undefined;
  if (!input || typeof input !== "string") {
    return NextResponse.json({ error: "Input required" }, { status: 400 });
  }

  const channelId = await resolveChannelId(input);
  if (!channelId) {
    console.error("Failed to resolve channel ID from input", { input });
    return NextResponse.json(
      { error: "Could not parse channel ID from input" },
      { status: 400 }
    );
  }

  const existing = await readSubscriptions();
  if (existing.some((s) => s.channelId === channelId)) {
    return NextResponse.json({ error: "Already subscribed" }, { status: 409 });
  }

  try {
    const { meta } = await fetchChannelFeed(channelId);
    const newSub: StoredSubscription = {
      id: channelId,
      channelId,
      title: meta.title || channelId,
      thumbnail: meta.thumbnail,
      url: `https://www.youtube.com/channel/${channelId}`,
      addedAt: new Date().toISOString(),
    };

    const updated = [...existing, newSub];
    await writeSubscriptions(updated);
    return NextResponse.json(newSub, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to subscribe" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") || url.searchParams.get("channelId");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const subs = await readSubscriptions();
  const updated = subs.filter((s) => s.channelId !== id && s.id !== id);
  await writeSubscriptions(updated);
  return NextResponse.json({ ok: true });
}
