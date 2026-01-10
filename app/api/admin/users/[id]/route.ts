import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import {
  updateUserAdminStatus,
  deleteUser,
  countAdminUsers,
  getUserById,
} from "@/lib/users";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireAdmin();
    if (!currentUser) {
      return NextResponse.json(
        { error: "Admin privileges required" },
        { status: 403 }
      );
    }

    const { id: userId } = await params;
    const body = await request.json();
    const { isAdmin } = body;

    // Prevent removing admin from the default admin user
    if (!isAdmin) {
      const userToUpdate = getUserById(userId);
      if (userToUpdate?.isDefaultAdmin) {
        return NextResponse.json(
          {
            error: "Cannot remove admin privileges from the default admin user",
          },
          { status: 400 }
        );
      }
    }

    // Prevent removing admin from yourself if you're the last admin
    if (userId === currentUser.id && !isAdmin) {
      const adminCount = countAdminUsers();
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: "Cannot remove admin privileges from the last admin user" },
          { status: 400 }
        );
      }
    }

    const success = updateUserAdminStatus(userId, isAdmin);

    if (!success) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Admin Users] Update error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update user" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireAdmin();
    if (!currentUser) {
      return NextResponse.json(
        { error: "Admin privileges required" },
        { status: 403 }
      );
    }

    const { id: userId } = await params;

    // Prevent deleting yourself
    if (userId === currentUser.id) {
      return NextResponse.json(
        { error: "Cannot delete your own account" },
        { status: 400 }
      );
    }

    // Prevent deleting the default admin
    const userToDelete = getUserById(userId);
    if (userToDelete?.isDefaultAdmin) {
      return NextResponse.json(
        { error: "Cannot delete the default admin user" },
        { status: 400 }
      );
    }

    const success = deleteUser(userId);

    if (!success) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Admin Users] Delete error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete user" },
      { status: 500 }
    );
  }
}
