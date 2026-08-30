import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import {
  getActiveCastSessions,
  startCastSession,
  stopCastSession,
  type CastDeviceKind,
} from "@/lib/cast/sessions";

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ sessions: getActiveCastSessions() });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const kind: CastDeviceKind = body?.kind === "lounge" ? "lounge" : "chromecast";
  const id = readText(body?.id);
  const name = readText(body?.name) || id;
  const videoId = readText(body?.videoId);
  const speed = Number(body?.speed);

  if (!id || !videoId) {
    return NextResponse.json(
      { error: "id and videoId are required" },
      { status: 400 }
    );
  }

  try {
    const session = await startCastSession({
      kind,
      id,
      name,
      videoId,
      // Reject nonsense speeds instead of silently casting at 1x.
      speed: Number.isFinite(speed) && speed >= 0.25 && speed <= 2 ? speed : undefined,
    });
    return NextResponse.json({ session });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not start casting",
      },
      // 502: TubeShelf is fine, the TV side is not.
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
  const id = readText(searchParams.get("id"));

  if (id) {
    const stopped = await stopCastSession(id);
    return NextResponse.json({ stopped });
  }

  // No id given: stop everything we are casting to.
  const sessions = getActiveCastSessions();
  for (const session of sessions) {
    await stopCastSession(session.id);
  }
  return NextResponse.json({ stopped: sessions.length > 0 });
}
