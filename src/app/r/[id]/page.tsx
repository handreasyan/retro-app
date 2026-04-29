import { notFound } from "next/navigation";
import { getSession } from "@/lib/sessions";
import { db } from "@/db";
import { participants } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getClientId } from "@/lib/identity";
import { RetroBoard } from "@/components/retro/RetroBoard";

export default async function RetroPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession(id);
  if (!session) notFound();
  const clientId = await getClientId();
  const [me] = await db
    .select()
    .from(participants)
    .where(and(eq(participants.sessionId, id), eq(participants.clientId, clientId)))
    .limit(1);

  return (
    <RetroBoard
      sessionId={id}
      hasJoined={!!me}
      readOnly={session.status === "closed"}
    />
  );
}
