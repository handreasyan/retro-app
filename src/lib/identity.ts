import { cookies } from "next/headers";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Returns the clientId from the request cookie. The cookie is set by
 * `server.ts` on the first request, so by the time any route handler runs the
 * cookie always exists. This helper also lazily inserts the client row.
 */
export async function getClientId(): Promise<string> {
  const store = await cookies();
  const cookieClientId = store.get("clientId")?.value;
  if (!cookieClientId) {
    throw new Error("clientId cookie missing - check server.ts middleware");
  }
  // upsert client row
  const existing = await db.query.clients.findFirst({ where: eq(clients.id, cookieClientId) });
  if (!existing) {
    await db.insert(clients).values({ id: cookieClientId }).onConflictDoNothing();
  }
  return cookieClientId;
}
