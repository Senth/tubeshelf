import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { authenticateUser, updateUserPassword } from "@/lib/auth";

export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user.authType === "oidc") {
    return NextResponse.json(
      { error: "OIDC-managed users cannot change local password" },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  const currentPassword =
    typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const newPassword =
    typeof body?.newPassword === "string" ? body.newPassword : "";

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: "Current and new passwords are required" },
      { status: 400 }
    );
  }

  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: "New password must be at least 8 characters" },
      { status: 400 }
    );
  }

  const validUser = await authenticateUser(user.email, currentPassword);
  if (!validUser) {
    return NextResponse.json(
      { error: "Current password is incorrect" },
      { status: 400 }
    );
  }

  await updateUserPassword(user.id, newPassword);
  return NextResponse.json({ success: true });
}
