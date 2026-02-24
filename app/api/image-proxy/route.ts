import { NextResponse } from "next/server";

const ALLOWED_IMAGE_HOSTS = [
  "ytimg.com",
  "youtube.com",
  "yt3.googleusercontent.com",
  "googleusercontent.com",
  "ggpht.com",
] as const;

function isSameHostOrSubdomain(hostname: string, allowedHost: string): boolean {
  const normalizedHost = hostname.toLowerCase();
  const normalizedAllowed = allowedHost.toLowerCase();
  return (
    normalizedHost === normalizedAllowed ||
    normalizedHost.endsWith(`.${normalizedAllowed}`)
  );
}

function isAllowedImageHost(hostname: string): boolean {
  return ALLOWED_IMAGE_HOSTS.some((allowedHost) =>
    isSameHostOrSubdomain(hostname, allowedHost)
  );
}

function isAllowedImageUrl(url: URL): boolean {
  if (!["http:", "https:"].includes(url.protocol)) return false;
  if (url.username || url.password) return false;
  return isAllowedImageHost(url.hostname);
}

async function fetchAllowedImageWithRedirects(startUrl: URL): Promise<Response> {
  let currentUrl = new URL(startUrl.toString());

  for (let i = 0; i < 4; i += 1) {
    if (!isAllowedImageUrl(currentUrl)) {
      throw new Error("Disallowed upstream image URL");
    }

    const upstream = await fetch(currentUrl.toString(), {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "accept-language": "en-US,en;q=0.8",
      },
      cache: "force-cache",
      redirect: "manual",
    });

    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get("location");
      if (!location) {
        throw new Error("Upstream redirect missing Location header");
      }
      currentUrl = new URL(location, currentUrl);
      continue;
    }

    return upstream;
  }

  throw new Error("Too many upstream redirects");
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

    if (!isAllowedImageUrl(targetUrl)) {
      return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
    }

    const upstream = await fetchAllowedImageWithRedirects(targetUrl);

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream image request failed with status ${upstream.status}` },
        { status: 502 }
      );
    }

    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return NextResponse.json(
        { error: "Upstream response was not an image" },
        { status: 502 }
      );
    }
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
