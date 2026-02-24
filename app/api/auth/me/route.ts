import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";

export async function GET(request: Request) {
  const user = await getCurrentUser(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: user.isAdmin,
      oidcProvider: user.oidcProvider,
      authType: user.authType,
    },
  });
}
