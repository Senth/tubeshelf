import { NextResponse } from "next/server";
import { readSettings } from "@/lib/settingsStore";

/**
 * Public endpoint to get authentication-related settings
 * No authentication required - used by login page
 */
export async function GET() {
  try {
    const settings = await readSettings();

    return NextResponse.json(
      {
        oidcOnly: settings.oidcOnly || false,
        publicRegistration: settings.publicRegistration || false,
      },
      {
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (error) {
    console.error("[Auth Settings] Failed to get settings:", error);
    return NextResponse.json(
      { oidcOnly: false, publicRegistration: false },
      { status: 200 }
    );
  }
}
