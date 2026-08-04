import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getLinkedAccount, unlinkAccount } from "@/lib/youtubeAccountStore";
import { isYouTubeOAuthConfigured } from "@/lib/youtubeOAuth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const configured = isYouTubeOAuthConfigured();
  const account = configured ? getLinkedAccount(user.id) : null;

  return NextResponse.json({
    configured,
    linked: !!account,
    label: account?.label ?? null,
    linkedAt: account?.linkedAt ?? null,
  });
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await unlinkAccount(user.id);

  return NextResponse.json({
    configured: isYouTubeOAuthConfigured(),
    linked: false,
    label: null,
    linkedAt: null,
  });
}
