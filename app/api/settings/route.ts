import { NextResponse } from "next/server";
import { readSettings, writeSettings, AppSettings } from "@/lib/settingsStore";
import { getCurrentUser } from "@/lib/currentUser";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const settings = await readSettings();
  return NextResponse.json(settings);
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const updates = await req.json();
    await writeSettings(updates);
    const updated = await readSettings();
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to save settings" },
      { status: 400 }
    );
  }
}
