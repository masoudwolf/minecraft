import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/worlds/[id] — full world record (data JSON included) */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const world = await db.world.findUnique({ where: { id } });
    if (!world) return NextResponse.json({ error: "World not found" }, { status: 404 });
    return NextResponse.json({ world });
  } catch (err) {
    console.error("GET /api/worlds/[id] failed", err);
    return NextResponse.json({ error: "Failed to load world" }, { status: 500 });
  }
}

/** PUT /api/worlds/[id] — persist save data { name?, gameMode?, seed?, time?, data?, achievements? } */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 40);
    if (body.gameMode === "survival" || body.gameMode === "creative") data.gameMode = body.gameMode;
    if (typeof body.seed === "number") data.seed = Math.floor(body.seed);
    if (typeof body.time === "number") data.time = body.time;
    if (typeof body.data === "string") data.data = body.data;
    if (typeof body.achievements === "string") data.achievements = body.achievements;
    const world = await db.world.update({
      where: { id },
      data,
      select: { id: true, updatedAt: true },
    });
    return NextResponse.json({ ok: true, world });
  } catch (err) {
    console.error("PUT /api/worlds/[id] failed", err);
    return NextResponse.json({ error: "Failed to save world" }, { status: 500 });
  }
}

/** DELETE /api/worlds/[id] */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await db.world.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/worlds/[id] failed", err);
    return NextResponse.json({ error: "Failed to delete world" }, { status: 500 });
  }
}
