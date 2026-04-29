// Server-side helpers used by the Socket.IO handlers (no Next request context).
import { db } from "@/db";
import { clients } from "@/db/schema";

export async function ensureClient(clientId: string): Promise<void> {
  await db.insert(clients).values({ id: clientId }).onConflictDoNothing();
}
