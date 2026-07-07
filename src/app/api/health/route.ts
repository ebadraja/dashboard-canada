import { NextResponse } from "next/server";

// Minimal health check so we can confirm the server is up. No auth, no DB —
// this is the "it starts" signal for the empty skeleton.
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "ai-receptionist",
    time: new Date().toISOString(),
  });
}
