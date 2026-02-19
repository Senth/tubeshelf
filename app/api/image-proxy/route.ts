import { NextResponse } from "next/server";

function isAllowedImageHost(hostname: string): boolean {
  return (
    hostname.endsWith("ytimg.com") ||
    hostname.endsWith("youtube.com") ||
    hostname.endsWith("yt3.googleusercontent.com") ||
    hostname.endsWith("googleusercontent.com") ||
    hostname.endsWith("ggpht.com")
  );
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const urlParam = searchParams.get("url");

    if (!urlParam) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(urlParam);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    if (!isAllowedImageHost(targetUrl.hostname)) {
      return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
    }

    const upstream = await fetch(targetUrl.toString(), {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "accept-language": "en-US,en;q=0.8",
      },
      cache: "force-cache",
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream image request failed with status ${upstream.status}` },
        { status: 502 }
      );
    }

    const contentType =
      upstream.headers.get("content-type") || "image/jpeg";
    const buffer = await upstream.arrayBuffer();

    return new Response(buffer, {
      status: 200,
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (error) {
    console.error("[Image Proxy] Failed:", error);
    return NextResponse.json(
      { error: "Failed to proxy image" },
      { status: 500 }
    );
  }
}
