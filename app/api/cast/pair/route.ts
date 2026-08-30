import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import {
  addCastScreen,
  removeCastScreen,
} from "@/lib/cast/castScreens";
import { pairWithCode } from "@/lib/cast/lounge";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!/^\d{6,12}$/.test(code)) {
    return NextResponse.json(
      { error: "Enter the numeric TV code shown in the YouTube app" },
      { status: 400 }
    );
  }

  try {
    const pairing = await pairWithCode(code);
    const name = body?.name?.trim() || pairing.name || "Linked TV";
    const screen = addCastScreen({ screenId: pairing.screenId, name });
    return NextResponse.json({ screen });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Pairing failed" },
      { status: 502 }
    );
  }
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const screenId = searchParams.get("screenId")?.trim() || "";
  if (!screenId) {
    return NextResponse.json({ error: "screenId is required" }, { status: 400 });
  }
  return NextResponse.json({ removed: removeCastScreen(screenId) });
}
