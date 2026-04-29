import { db } from "@/db";
import { sessions } from "@/db/schema";
import { and, desc, eq, ne, isNull } from "drizzle-orm";

export async function getActiveSession() {
  const [s] = await db
    .select()
    .from(sessions)
    .where(ne(sessions.status, "closed"))
    .orderBy(desc(sessions.startedAt))
    .limit(1);
  return s ?? null;
}

export async function listPastSessions(opts: { search?: string } = {}) {
  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.status, "closed"))
    .orderBy(desc(sessions.endedAt));
  const search = opts.search?.trim().toLowerCase();
  if (!search) return rows;
  return rows.filter((r) => r.title.toLowerCase().includes(search));
}

export async function getSession(id: string) {
  const [s] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  return s ?? null;
}

export async function startSession(opts: { title: string; adminClientId: string | null }) {
  // Enforce single active session
  const active = await getActiveSession();
  if (active) {
    const err = new Error("An active retro already exists");
    (err as Error & { code?: string }).code = "ACTIVE_EXISTS";
    throw err;
  }
  const [s] = await db
    .insert(sessions)
    .values({
      title: opts.title.trim() || "Untitled retro",
      status: "writing",
      adminClientId: opts.adminClientId,
    })
    .returning();
  return s;
}

export async function endSession(id: string) {
  const [s] = await db
    .update(sessions)
    .set({ status: "closed", endedAt: new Date() })
    .where(and(eq(sessions.id, id), ne(sessions.status, "closed")))
    .returning();
  return s ?? null;
}

export async function advanceSessionToVoting(id: string) {
  const [s] = await db
    .update(sessions)
    .set({ status: "voting" })
    .where(and(eq(sessions.id, id), eq(sessions.status, "writing")))
    .returning();
  return s ?? null;
}

/**
 * Atomically assigns the admin slot to `clientId` if it is currently free.
 * Returns the updated session, or null if the slot was already taken.
 */
export async function claimAdmin(sessionId: string, clientId: string) {
  const [s] = await db
    .update(sessions)
    .set({ adminClientId: clientId })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.adminClientId)))
    .returning();
  if (s) return s;
  // Maybe the same client is already admin (idempotent reconnect).
  const [existing] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.adminClientId, clientId)))
    .limit(1);
  return existing ?? null;
}

export async function releaseAdmin(sessionId: string, clientId: string) {
  const [s] = await db
    .update(sessions)
    .set({ adminClientId: null })
    .where(and(eq(sessions.id, sessionId), eq(sessions.adminClientId, clientId)))
    .returning();
  return s ?? null;
}
