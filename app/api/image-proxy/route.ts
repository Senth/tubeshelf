import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const imageUrl = url.searchParams.get("url");

  if (!imageUrl) {
    return NextResponse.json(
      { error: "Missing url parameter" },
      { status: 400 }
    );
  }

  try {
    // Validate that the URL is from YouTube's CDN
    if (
      !imageUrl.includes("yt3.googleusercontent.com") &&
      !imageUrl.includes("ytimg.com") &&
      !imageUrl.includes("youtube.com")
    ) {
      return NextResponse.json(
        { error: "Only YouTube images are allowed" },
        { status: 403 }
      );
    }

    const candidateUrls = [imageUrl];
    const customThumbMatch = imageUrl.match(
      /(https?:\/\/[^/]+\/vi\/[^/]+)\/hqdefault_custom_\d\.jpg/i
    );
    if (customThumbMatch) {
      candidateUrls.push(
        `${customThumbMatch[1]}/hqdefault.jpg`,
        `${customThumbMatch[1]}/mqdefault.jpg`,
        `${customThumbMatch[1]}/default.jpg`
      );
    }

    let response: Response | null = null;
    for (const url of candidateUrls) {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        cache: "force-cache",
      });
      if (res.ok) {
        response = res;
        break;
      }
    }

    if (!response) {
      console.error("[Image Proxy] Failed to fetch image:", {
        status: 404,
        url: imageUrl,
      });
      return NextResponse.json(
        { error: "Failed to fetch image" },
        { status: 404 }
      );
    }

    // Get the image buffer and content type
    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || "image/jpeg";

    // Return the image with proper headers to allow browser caching
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000", // Cache for 1 year
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("[Image Proxy] Error fetching image:", {
      error: err instanceof Error ? err.message : String(err),
      url: imageUrl,
    });
    return NextResponse.json(
      { error: "Failed to proxy image" },
      { status: 500 }
    );
  }
}
