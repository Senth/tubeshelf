import { NextResponse } from "next/server";
import { getAuth } from "@/lib/betterAuth";
import { revokeDeviceToken } from "@/lib/deviceTokens";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const rememberToken =
      typeof body?.rememberToken === "string" ? body.rememberToken : "";
    if (rememberToken) {
      revokeDeviceToken(rememberToken);
    }
  } catch {
    // Token revocation is best-effort; fall through to the BetterAuth sign-out.
  }

  try {
    const auth = await getAuth(req);
    return await auth.api.signOut({
      headers: req.headers,
      asResponse: true,
    });
  } catch {
    // Keep logout idempotent for clients even if BetterAuth rejects the request.
    return NextResponse.json({ success: true });
  }
}
