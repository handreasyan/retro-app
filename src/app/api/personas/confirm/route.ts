import { NextResponse } from "next/server";
import { z } from "zod";
import { confirmNamedPersona } from "@/lib/personas-server";
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
  try {
    const persona = await confirmNamedPersona(parsed.sessionId, clientId, parsed.role);
    return NextResponse.json({ persona });
  } catch (e) {
    const code = (e as Error & { code?: string }).code;
    if (code === "NO_RESERVATION" || code === "RESERVATION_EXPIRED") {
      return NextResponse.json({ error: "Reservation expired - reroll" }, { status: 409 });
    }
    throw e;
  }
}
