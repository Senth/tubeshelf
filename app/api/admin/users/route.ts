import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getAllUsers, countUsers, countAdminUsers } from "@/lib/users";

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser || !currentUser.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = getAllUsers();
  const stats = {
    totalUsers: countUsers(),
    adminUsers: countAdminUsers(),
  };

  return NextResponse.json({ users, stats });
}
