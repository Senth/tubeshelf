/**
 * DEPRECATED: This endpoint is no longer used
 * Welcome wizard state is now tracked via localStorage only
 * Kept for backward compatibility
 */

import { NextResponse } from "next/server";

export async function GET() {
  // Always return false - logic is now in client-side localStorage
  return NextResponse.json({
    isFirstVisit: false,
    hasCompletedWelcome: true,
  });
}
