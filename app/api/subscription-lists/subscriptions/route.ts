import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  readLists,
  addSubscriptionToList,
  removeSubscriptionFromList,
  clearListSubscriptions,
  clearAllSubscriptions,
  moveSubscription,
} from "@/lib/subscriptionListStore";
import { fetchChannelFeed, resolveChannelId } from "@/lib/videoFetcher";
import { getUserFromSession } from "@/lib/auth";

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("session")?.value;
  const user = getUserFromSession(sessionId);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const { listId, input } = body || {};

  if (!listId || !input) {
    console.error("[API] Add subscription failed: Missing required fields", {
      listId: !!listId,
      input: !!input,
    });
    return NextResponse.json(
      { error: "List ID and input required" },
      { status: 400 }
    );
  }

  try {
    const channelId = await resolveChannelId(input);
    if (!channelId) {
      console.error(
        "[API] Add subscription failed: Could not resolve channel ID",
        {
          input,
          listId,
        }
      );
      return NextResponse.json(
        { error: "Could not parse channel ID from input" },
        { status: 400 }
      );
    }

    const { meta } = await fetchChannelFeed(channelId);
    const subscription = {
      id: channelId,
      channelId,
      title: meta.title || channelId,
      url: `https://www.youtube.com/channel/${channelId}`,
      thumbnail: meta.thumbnail,
      subscriberCount: meta.subscriberCount,
      addedAt: new Date().toISOString(),
    };

    await addSubscriptionToList(listId, subscription, user.id);
    const lists = await readLists(user.id);
    const list = lists.lists.find((l) => l.id === listId);
    return NextResponse.json(list);
  } catch (err: any) {
    console.error("[API] Add subscription failed", {
      listId,
      input,
      error: err?.message || String(err),
      stack: err?.stack,
    });
    return NextResponse.json(
      { error: err?.message || "Failed to add subscription" },
      { status: 400 }
    );
  }
}

export async function DELETE(req: Request) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("session")?.value;
  const user = getUserFromSession(sessionId);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const { action, channelId, listId } = body || {};

  // Handle clear actions (delete all or from specific list)
  if (action === "clear") {
    try {
      if (listId) {
        // Clear subscriptions from specific list
        await clearListSubscriptions(listId, user.id);
      } else {
        // Clear all subscriptions from all lists
        await clearAllSubscriptions(user.id);
      }
      const lists = await readLists(user.id);
      return NextResponse.json(lists);
    } catch (err: any) {
      console.error("[API] Clear subscriptions failed", {
        action,
        listId,
        error: err?.message || String(err),
        stack: err?.stack,
      });
      return NextResponse.json(
        { error: err?.message || "Failed to clear subscriptions" },
        { status: 400 }
      );
    }
  }

  // Handle removing a single subscription
  const listIdParam = listId || new URL(req.url).searchParams.get("listId");
  const channelIdParam =
    channelId || new URL(req.url).searchParams.get("channelId");

  if (!listIdParam || !channelIdParam) {
    console.error("[API] Remove subscription failed: Missing parameters", {
      listId: !!listIdParam,
      channelId: !!channelIdParam,
    });
    return NextResponse.json(
      { error: "List ID and channel ID required" },
      { status: 400 }
    );
  }

  try {
    await removeSubscriptionFromList(listIdParam, channelIdParam, user.id);
    const lists = await readLists(user.id);
    return NextResponse.json(lists);
  } catch (err: any) {
    console.error("[API] Remove subscription failed", {
      listId: listIdParam,
      channelId: channelIdParam,
      error: err?.message || String(err),
      stack: err?.stack,
    });
    return NextResponse.json(
      { error: err?.message || "Failed to remove subscription" },
      { status: 400 }
    );
  }
}

export async function PATCH(req: Request) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("session")?.value;
  const user = getUserFromSession(sessionId);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const { action, channelId, fromListId, toListId } = body || {};

  if (action === "move") {
    if (!channelId || !fromListId || !toListId) {
      console.error("[API] Move subscription failed: Missing parameters", {
        channelId: !!channelId,
        fromListId: !!fromListId,
        toListId: !!toListId,
      });
      return NextResponse.json(
        { error: "Channel ID, source list ID, and target list ID required" },
        { status: 400 }
      );
    }

    try {
      await moveSubscription(fromListId, toListId, channelId, user.id);
      const lists = await readLists(user.id);
      return NextResponse.json(lists);
    } catch (err: any) {
      console.error("[API] Move subscription failed", {
        channelId,
        fromListId,
        toListId,
        error: err?.message || String(err),
        stack: err?.stack,
      });
      return NextResponse.json(
        { error: err?.message || "Failed to move subscription" },
        { status: 400 }
      );
    }
  }

  console.error("[API] PATCH subscription failed: Unknown action", { action });
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
