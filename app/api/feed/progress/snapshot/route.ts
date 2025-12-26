import { NextResponse } from "next/server";
import { getProgress } from "@/lib/feedProgress";

export async function GET() {
  try {
    const snapshot = getProgress();
    return NextResponse.json({ ok: true, snapshot });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
