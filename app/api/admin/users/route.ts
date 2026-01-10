import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { getAllUsers, countUsers, countAdminUsers } from "@/lib/users";

export async function GET(request: NextRequest) {
  try {
    const currentUser = await requireAdmin();
    if (!currentUser) {
      return NextResponse.json(
        { error: "Admin privileges required" },
        { status: 403 }
      );
    }

    const users = getAllUsers();
    const stats = {
      totalUsers: countUsers(),
      adminUsers: countAdminUsers(),
    };

    // Don't return password hashes
    const sanitizedUsers = users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: user.isAdmin,
      isDefaultAdmin: user.isDefaultAdmin,
      oidcProvider: user.oidcProvider,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    }));

    return NextResponse.json({
      users: sanitizedUsers,
      stats,
    });
  } catch (error: any) {
    console.error("[Admin Users] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch users" },
      { status: 500 }
    );
  }
}
