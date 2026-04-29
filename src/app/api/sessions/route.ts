import { NextResponse } from "next/server";
import { z } from "zod";
import { listPastSessions, startSession } from "@/lib/sessions";
import { getClientId } from "@/lib/identity";
import { getIO } from "@/lib/io";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const search = url.searchParams.get("search") ?? undefined;
  const past = await listPastSessions({ search });
  return NextResponse.json({ past });
}

const startBody = z.object({
  title: z.string().min(1).max(80),
  asAdmin: z.boolean().optional().default(true),
});

export async function POST(req: Request) {
  const clientId = await getClientId();
  let body;
  try {
    body = startBody.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  try {
    const s = await startSession({
      title: body.title,
      adminClientId: body.asAdmin ? clientId : null,
    });
    getIO()?.to("lobby").emit("lobby.session_started", {
      id: s.id,
      title: s.title,
      status: s.status,
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt?.toISOString() ?? null,
    });
    return NextResponse.json({ session: s });
  } catch (e) {
    const code = (e as Error & { code?: string }).code;
    if (code === "ACTIVE_EXISTS") {
      return NextResponse.json({ error: "An active retro already exists" }, { status: 409 });
    }
    throw e;
  }
}
