import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json({ user: null });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.isAdmin,
        authType: user.oidcProvider ? "oidc" : "local",
        oidcProvider: user.oidcProvider,
      },
    });
  } catch (error) {
    console.error("[Auth] Session check error:", error);
    return NextResponse.json(
      { error: "Failed to check session" },
      { status: 500 }
    );
  }
}
