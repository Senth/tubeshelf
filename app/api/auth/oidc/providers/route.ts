import { NextResponse } from "next/server";
import { getPublicOIDCProviders } from "@/lib/oidc";

export async function GET() {
  try {
    const providers = getPublicOIDCProviders();

    return NextResponse.json({
      providers,
    });
  } catch (error) {
    console.error("[OIDC] Failed to get providers:", error);
    return NextResponse.json(
      { error: "Failed to get providers" },
      { status: 500 }
    );
  }
}
