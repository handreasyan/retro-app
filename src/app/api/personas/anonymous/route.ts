import { NextResponse } from "next/server";
import { z } from "zod";
import { joinAsAnonymous } from "@/lib/personas-server";
import { getClientId } from "@/lib/identity";

const body = z.object({
  sessionId: z.string().uuid(),
  role: z.enum(["participant", "admin"]).default("participant"),
});

export async function POST(req: Request) {
  const clientId = await getClientId();
  let parsed;
  try {
    parsed = body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const persona = await joinAsAnonymous(parsed.sessionId, clientId, parsed.role);
  return NextResponse.json({ persona });
}
