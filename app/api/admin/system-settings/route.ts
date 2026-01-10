import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { readSettings, writeSettings } from "@/lib/settingsStore";
import { getOIDCProviders } from "@/lib/oidc";

export async function GET() {
  try {
    await requireAdmin();

    const settings = await readSettings();

    return NextResponse.json({
      oidcOnly: settings.oidcOnly || false,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (
      error instanceof Error &&
      error.message === "Admin privileges required"
    ) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("[Admin] Failed to get system settings:", error);
    return NextResponse.json(
      { error: "Failed to get settings" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();

    const body = await req.json();
    const { oidcOnly } = body;

    // Validation: if enabling OIDC-only mode, ensure OIDC is configured
    if (oidcOnly) {
      const oidcProviders = getOIDCProviders();
      const hasEnabledProvider = oidcProviders.some((p) => p.enabled);

      if (!hasEnabledProvider) {
        return NextResponse.json(
          {
            error:
              "Cannot enable OIDC-only mode without an enabled OIDC provider",
          },
          { status: 400 }
        );
      }
    }

    const settings = await readSettings();
    const updatedSettings = {
      ...settings,
      oidcOnly: oidcOnly || false,
    };

    await writeSettings(updatedSettings);

    return NextResponse.json({
      success: true,
      oidcOnly: updatedSettings.oidcOnly,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (
      error instanceof Error &&
      error.message === "Admin privileges required"
    ) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("[Admin] Failed to update system settings:", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
