import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/worlds — list all worlds (metadata + aggregated achievements) */
export async function GET() {
  try {
    const worlds = await db.world.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        gameMode: true,
        seed: true,
        updatedAt: true,
        achievements: true,
      },
    });
    // v0.58: no-store — the world list must always reflect fresh updatedAt
    const res = NextResponse.json({ worlds });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (err) {
    console.error("GET /api/worlds failed", err);
    return NextResponse.json({ error: "Failed to list worlds" }, { status: 500 });
  }
}

/** POST /api/worlds — create a new world { name, gameMode, seed?, time?, data? } */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 40) : "New World";
    const gameMode = body.gameMode === "creative" ? "creative" : "survival";
    const seed =
      typeof body.seed === "number" && Number.isFinite(body.seed)
        ? Math.floor(Math.abs(body.seed)) % 2147483647
        : Math.floor(Math.random() * 2147483647);
    const world = await db.world.create({
      data: {
        name,
        gameMode,
        seed,
        time: typeof body.time === "number" ? body.time : 6000,
        data: typeof body.data === "string" ? body.data : "{}",
        achievements: "[]",
      },
      select: { id: true, name: true, gameMode: true, seed: true, updatedAt: true },
    });
    return NextResponse.json({ world });
  } catch (err) {
    console.error("POST /api/worlds failed", err);
    return NextResponse.json({ error: "Failed to create world" }, { status: 500 });
  }
}
