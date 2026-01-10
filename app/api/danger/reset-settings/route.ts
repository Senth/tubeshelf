import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { writeSettings, defaultSettings } from "@/lib/settingsStore";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await writeSettings(defaultSettings);
    return NextResponse.json({ success: true, settings: defaultSettings });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to reset settings" },
      { status: 400 }
    );
  }
}
