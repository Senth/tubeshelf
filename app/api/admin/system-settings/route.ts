import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { readSettings, writeSettings } from "@/lib/settingsStore";
import { getOIDCProviders } from "@/lib/oidc";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !user.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const settings = await readSettings();
  return NextResponse.json({
    oidcOnly: !!settings.oidcOnly,
    publicRegistration: !!settings.publicRegistration,
  });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !user.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const updates: Record<string, boolean> = {};

  if (typeof body?.oidcOnly === "boolean") {
    if (body.oidcOnly && getOIDCProviders().length === 0) {
      return NextResponse.json(
        { error: "Cannot enable OIDC-only mode without an enabled OIDC provider" },
        { status: 400 }
      );
    }
    updates.oidcOnly = body.oidcOnly;
  }

  if (typeof body?.publicRegistration === "boolean") {
    updates.publicRegistration = body.publicRegistration;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid settings provided" },
      { status: 400 }
    );
  }

  await writeSettings(updates);
  const settings = await readSettings();

  return NextResponse.json({
    oidcOnly: !!settings.oidcOnly,
    publicRegistration: !!settings.publicRegistration,
  });
}
