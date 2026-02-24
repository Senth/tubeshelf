import { NextResponse } from "next/server";
import { getAuth } from "@/lib/betterAuth";

export async function POST(req: Request) {
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
