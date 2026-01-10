import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import {
  getOIDCProviders,
  createOIDCProvider,
  updateOIDCProvider,
  deleteOIDCProvider,
} from "@/lib/oidc";

export async function GET() {
  try {
    await requireAdmin();

    const providers = getOIDCProviders();

    // Remove client secrets from response for security
    const sanitizedProviders = providers.map((p) => ({
      id: p.id,
      name: p.name,
      issuer: p.issuer,
      baseUrl: p.baseUrl,
      discoveryUrl: p.discoveryUrl,
      domain: p.domain,
      redirectUri: p.redirectUri,
      clientId: p.clientId,
      scopes: p.scopes,
      autoProvision: p.autoProvision,
      groupClaimName: p.groupClaimName,
      adminGroupValue: p.adminGroupValue,
      enabled: p.enabled,
      createdAt: p.createdAt,
      // Client secret is never returned
    }));

    return NextResponse.json({ providers: sanitizedProviders });
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

    console.error("[Admin] Failed to get OIDC providers:", error);
    return NextResponse.json(
      { error: "Failed to get providers" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();

    const body = await req.json();
    const { id, name, issuer, clientId, clientSecret } = body;

    if (!id || !name || !issuer || !clientId || !clientSecret) {
      return NextResponse.json(
        { error: "All required fields must be provided" },
        { status: 400 }
      );
    }

    const provider = createOIDCProvider({
      id,
      name,
      issuer,
      baseUrl: body.baseUrl,
      discoveryUrl: body.discoveryUrl,
      domain: body.domain,
      redirectUri: body.redirectUri,
      clientId,
      clientSecret,
      scopes: body.scopes,
      autoProvision: body.autoProvision,
      groupClaimName: body.groupClaimName,
      adminGroupValue: body.adminGroupValue,
    });

    // Don't return the secret in the response
    return NextResponse.json({
      provider: {
        id: provider.id,
        name: provider.name,
        issuer: provider.issuer,
        baseUrl: provider.baseUrl,
        discoveryUrl: provider.discoveryUrl,
        domain: provider.domain,
        redirectUri: provider.redirectUri,
        clientId: provider.clientId,
        scopes: provider.scopes,
        autoProvision: provider.autoProvision,
        groupClaimName: provider.groupClaimName,
        adminGroupValue: provider.adminGroupValue,
        enabled: provider.enabled,
        createdAt: provider.createdAt,
      },
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

    console.error("[Admin] Failed to create OIDC provider:", error);
    return NextResponse.json(
      { error: "Failed to create provider" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    await requireAdmin();

    const { id, ...updates } = await req.json();

    if (!id) {
      return NextResponse.json(
        { error: "Provider ID is required" },
        { status: 400 }
      );
    }

    updateOIDCProvider(id, updates);

    return NextResponse.json({ success: true });
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

    console.error("[Admin] Failed to update OIDC provider:", error);
    return NextResponse.json(
      { error: "Failed to update provider" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Provider ID is required" },
        { status: 400 }
      );
    }

    deleteOIDCProvider(id);

    return NextResponse.json({ success: true });
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

    console.error("[Admin] Failed to delete OIDC provider:", error);
    return NextResponse.json(
      { error: "Failed to delete provider" },
      { status: 500 }
    );
  }
}
