import { NextResponse } from "next/server";
import { readSettings } from "@/lib/settingsStore";

export async function GET() {
  try {
    const settings = await readSettings();
    return NextResponse.json({
      oidcOnly: !!settings.oidcOnly,
      publicRegistration: !!settings.publicRegistration,
    });
  } catch (error) {
    console.error("[Auth Settings] Failed to read settings:", error);
    return NextResponse.json({ oidcOnly: false, publicRegistration: false });
  }
}
