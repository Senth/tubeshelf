import { NextResponse } from "next/server";
import {
  initProgress,
  updateProgress,
  completeProgress,
  getProgress,
} from "@/lib/feedProgress";

// Simple utility to sleep
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

export async function POST(req: Request) {
  try {
    // Read JSON body for optional total (default 5)
    const body = await req.json().catch(() => ({}));
    const total =
      typeof body.total === "number" && body.total > 0 ? body.total : 5;

    const snapshots: Array<any> = [];

    // Initialize progress
    initProgress(total);
    snapshots.push({ step: "init", snapshot: getProgress() });

    // Simulate per-channel updates
    for (let i = 1; i <= total; i++) {
      // simulate a channel id and title
      const channelId = `test-ch-${i}`;
      const title = `Test Channel ${i}`;
      // wait a bit to mimic processing
      await sleep(120);
      updateProgress(channelId, title);
      snapshots.push({ step: `update-${i}`, snapshot: getProgress() });
    }

    // finalize
    await sleep(80);
    completeProgress();
    snapshots.push({ step: "complete", snapshot: getProgress() });

    return NextResponse.json({ ok: true, snapshots });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
