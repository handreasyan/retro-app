import { NextResponse } from "next/server";
import { z } from "zod";
import { reservePersona } from "@/lib/personas-server";
import { getClientId } from "@/lib/identity";

const body = z.object({ sessionId: z.string().uuid() });

export async function POST(req: Request) {
  const clientId = await getClientId();
  let parsed;
  try {
    parsed = body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  try {
    const reservation = await reservePersona(parsed.sessionId, clientId);
    return NextResponse.json({ reservation });
  } catch (e) {
    const code = (e as Error & { code?: string }).code;
    if (code === "POOL_EXHAUSTED") {
      return NextResponse.json({ error: "All named personas are taken; choose anonymous" }, { status: 409 });
    }
    throw e;
  }
}
