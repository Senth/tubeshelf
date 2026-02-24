import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { clearAllSubscriptions } from "@/lib/subscriptionListStore";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await clearAllSubscriptions(user.id);
    return NextResponse.json({
      success: true,
      message: "All subscriptions deleted",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to delete subscriptions" },
      { status: 400 }
    );
  }
}
