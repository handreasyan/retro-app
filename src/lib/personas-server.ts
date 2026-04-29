import { db } from "@/db";
import { participants, personaReservations, sessions } from "@/db/schema";
import { and, count, eq, gte, isNotNull, max, sql } from "drizzle-orm";
import { personaPool, personaBySlug, avatarFor, ANONYMOUS_AVATAR } from "@/lib/personas";
import type { Persona } from "@/server/types";

const RESERVATION_TTL_MS = 30_000;
const ROTATION_FLOOR_FRACTION = 0.2;

/**
 * Picks the lowest count threshold K such that at least 20% of the pool sits
 * at or below K, so the slot machine prefers personas that have been used
 * least. When everyone reaches the same level, K bumps up by 1 and the cycle
 * starts over. See user-facing rules in PRD.md.
 */
function thresholdForRotation(counts: Map<string, number>): number {
  const total = personaPool.length;
  const minNeeded = Math.max(1, Math.ceil(total * ROTATION_FLOOR_FRACTION));
  let k = 0;
  while (true) {
    let eligible = 0;
    for (const p of personaPool) {
      if ((counts.get(p.slug) ?? 0) <= k) eligible++;
    }
    if (eligible >= minNeeded) return k;
    k++;
    if (k > 1000) return k;
  }
}

export async function reservePersona(sessionId: string, clientId: string) {
  // Sweep expired reservations
  await db.delete(personaReservations).where(sql`expires_at < now()`);

  // Find taken slugs in this session: committed participants + active reservations.
  const taken = new Set<string>();
  const committed = await db
    .select({ slug: participants.personaSlug })
    .from(participants)
    .where(eq(participants.sessionId, sessionId));
  for (const c of committed) if (c.slug) taken.add(c.slug);
  const active = await db
    .select({ slug: personaReservations.personaSlug, clientId: personaReservations.clientId })
    .from(personaReservations)
    .where(and(eq(personaReservations.sessionId, sessionId), gte(personaReservations.expiresAt, new Date())));
  for (const r of active) if (r.clientId !== clientId) taken.add(r.slug);

  // Global pick-count rotation: lifetime usage of each persona across all sessions.
  const usageRows = await db
    .select({ slug: participants.personaSlug, n: count() })
    .from(participants)
    .where(isNotNull(participants.personaSlug))
    .groupBy(participants.personaSlug);
  const counts = new Map<string, number>();
  for (const u of usageRows) if (u.slug) counts.set(u.slug, Number(u.n));

  const threshold = thresholdForRotation(counts);
  const available = personaPool.filter((p) => !taken.has(p.slug));
  if (!available.length) {
    const err = new Error("Persona pool exhausted");
    (err as Error & { code?: string }).code = "POOL_EXHAUSTED";
    throw err;
  }
  // Prefer least-picked personas; if every <= threshold one is taken in this
  // session, fall back to any available so the picker never deadlocks.
  const preferred = available.filter((p) => (counts.get(p.slug) ?? 0) <= threshold);
  const pool = preferred.length > 0 ? preferred : available;
  const pick = pool[Math.floor(Math.random() * pool.length)];

  // Replace this client's reservation.
  await db
    .delete(personaReservations)
    .where(and(eq(personaReservations.sessionId, sessionId), eq(personaReservations.clientId, clientId)));
  const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);
  await db.insert(personaReservations).values({
    sessionId,
    clientId,
    personaSlug: pick.slug,
    expiresAt,
  });
  return { slug: pick.slug, name: pick.name, avatar: avatarFor(pick.slug), expiresAt };
}

export async function confirmNamedPersona(sessionId: string, clientId: string, role: "participant" | "admin"): Promise<Persona & { participantId: string }> {
  // Use a transaction so the reservation -> participant promotion is atomic.
  return await db.transaction(async (tx) => {
    const [reservation] = await tx
      .select()
      .from(personaReservations)
      .where(and(eq(personaReservations.sessionId, sessionId), eq(personaReservations.clientId, clientId)))
      .limit(1);
    if (!reservation) {
      const err = new Error("No active reservation - reroll first");
      (err as Error & { code?: string }).code = "NO_RESERVATION";
      throw err;
    }
    if (reservation.expiresAt.getTime() < Date.now()) {
      const err = new Error("Reservation expired");
      (err as Error & { code?: string }).code = "RESERVATION_EXPIRED";
      throw err;
    }
    // Did this client already join (e.g. reconnect)?
    const [existing] = await tx
      .select()
      .from(participants)
      .where(and(eq(participants.sessionId, sessionId), eq(participants.clientId, clientId)))
      .limit(1);
    if (existing) {
      await tx.delete(personaReservations).where(eq(personaReservations.id, reservation.id));
      const entry = existing.personaSlug ? personaBySlug(existing.personaSlug) : undefined;
      return {
        participantId: existing.id,
        kind: existing.personaKind,
        slug: existing.personaSlug,
        name: existing.personaKind === "anonymous" ? `Anonymous ${existing.anonymousNumber}` : entry?.name ?? "Unknown",
        avatar: existing.personaKind === "anonymous" ? ANONYMOUS_AVATAR : avatarFor(existing.personaSlug),
        anonymousNumber: existing.anonymousNumber,
      };
    }
    const finalRole = await resolveAdminClaim(tx, sessionId, clientId, role);
    const [inserted] = await tx
      .insert(participants)
      .values({
        sessionId,
        clientId,
        personaKind: "named",
        personaSlug: reservation.personaSlug,
        anonymousNumber: null,
        role: finalRole,
      })
      .returning();
    await tx.delete(personaReservations).where(eq(personaReservations.id, reservation.id));
    const entry = personaBySlug(reservation.personaSlug);
    return {
      participantId: inserted.id,
      kind: "named",
      slug: reservation.personaSlug,
      name: entry?.name ?? reservation.personaSlug,
      avatar: avatarFor(reservation.personaSlug),
      anonymousNumber: null,
    };
  });
}

// Returns the role we can actually grant. If 'admin' is requested:
//  - claim the slot atomically when free or already mine.
//  - if someone else already holds it, fall back to 'participant'.
async function resolveAdminClaim(
  tx: { select: typeof db.select; update: typeof db.update },
  sessionId: string,
  clientId: string,
  requested: "participant" | "admin",
): Promise<"participant" | "admin"> {
  if (requested !== "admin") return "participant";
  const [s] = await tx.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (!s) return "participant";
  if (s.adminClientId && s.adminClientId !== clientId) return "participant";
  if (!s.adminClientId) {
    await tx.update(sessions).set({ adminClientId: clientId }).where(eq(sessions.id, sessionId));
  }
  return "admin";
}

export async function joinAsAnonymous(sessionId: string, clientId: string, role: "participant" | "admin"): Promise<Persona & { participantId: string }> {
  return await db.transaction(async (tx) => {
    // Reuse existing participant if reconnect.
    const [existing] = await tx
      .select()
      .from(participants)
      .where(and(eq(participants.sessionId, sessionId), eq(participants.clientId, clientId)))
      .limit(1);
    if (existing) {
      const entry = existing.personaSlug ? personaBySlug(existing.personaSlug) : undefined;
      return {
        participantId: existing.id,
        kind: existing.personaKind,
        slug: existing.personaSlug,
        name: existing.personaKind === "anonymous" ? `Anonymous ${existing.anonymousNumber}` : entry?.name ?? "Unknown",
        avatar: existing.personaKind === "anonymous" ? ANONYMOUS_AVATAR : avatarFor(existing.personaSlug),
        anonymousNumber: existing.anonymousNumber,
      };
    }
    const [{ maxN }] = await tx
      .select({ maxN: max(participants.anonymousNumber) })
      .from(participants)
      .where(eq(participants.sessionId, sessionId));
    const next = (maxN ?? 0) + 1;
    const finalRole = await resolveAdminClaim(tx, sessionId, clientId, role);
    const [inserted] = await tx
      .insert(participants)
      .values({
        sessionId,
        clientId,
        personaKind: "anonymous",
        personaSlug: null,
        anonymousNumber: next,
        role: finalRole,
      })
      .returning();
    await tx
      .delete(personaReservations)
      .where(and(eq(personaReservations.sessionId, sessionId), eq(personaReservations.clientId, clientId)));
    return {
      participantId: inserted.id,
      kind: "anonymous",
      slug: null,
      name: `Anonymous ${next}`,
      avatar: ANONYMOUS_AVATAR,
      anonymousNumber: next,
    };
  });
}

export async function maybeAssignAdmin(sessionId: string, clientId: string) {
  const [s] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (!s) return null;
  if (!s.adminClientId) {
    const [updated] = await db
      .update(sessions)
      .set({ adminClientId: clientId })
      .where(and(eq(sessions.id, sessionId), eq(sessions.id, sessionId)))
      .returning();
    return updated;
  }
  return s;
}
