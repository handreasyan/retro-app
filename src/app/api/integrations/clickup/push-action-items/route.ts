import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { cards } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { createTask } from "@/lib/clickup";

const body = z.object({ retroId: z.string().uuid() });

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const items = await db
    .select()
    .from(cards)
    .where(
      and(
        eq(cards.sessionId, parsed.retroId),
        eq(cards.column, "action_item"),
        isNull(cards.clickupTaskId)
      )
    );
  const results: { id: string; clickupTaskId: string | null }[] = [];
  for (const it of items) {
    const created = await createTask({ name: it.text || "(empty)" });
    if (created) {
      await db
        .update(cards)
        .set({ clickupTaskId: created.id, pushedToClickupAt: new Date() })
        .where(eq(cards.id, it.id));
      results.push({ id: it.id, clickupTaskId: created.id });
    } else {
      results.push({ id: it.id, clickupTaskId: null });
    }
  }
  return NextResponse.json({ results });
}
