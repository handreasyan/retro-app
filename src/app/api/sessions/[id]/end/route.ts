import { NextResponse } from "next/server";
import { endSession, getSession } from "@/lib/sessions";
import { getClientId } from "@/lib/identity";
import { getIO } from "@/lib/io";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const clientId = await getClientId();
  const session = await getSession(id);
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (session.adminClientId !== clientId) {
    return NextResponse.json({ error: "Only the admin can end the retro" }, { status: 403 });
  }
  const updated = await endSession(id);
  if (updated) {
    getIO()?.to("lobby").emit("lobby.session_ended", {
      id: updated.id,
      title: updated.title,
      status: updated.status,
      startedAt: updated.startedAt.toISOString(),
      endedAt: updated.endedAt?.toISOString() ?? null,
    });
  }
  return NextResponse.json({ session: updated });
}
