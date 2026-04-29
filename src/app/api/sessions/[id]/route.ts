import { NextResponse } from "next/server";
import { getSession } from "@/lib/sessions";
import { db } from "@/db";
import { cards, comments, participants, sessions, votes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { avatarFor, ANONYMOUS_AVATAR, personaBySlug } from "@/lib/personas";
import { getClientId } from "@/lib/identity";
import { getIO } from "@/lib/io";
import type { CardPayload, CommentPayload, ParticipantState, Persona, VotePayload } from "@/server/types";

function buildPersona(p: typeof participants.$inferSelect): Persona {
  if (p.personaKind === "anonymous") {
    return {
      kind: "anonymous",
      slug: null,
      name: `Anonymous ${p.anonymousNumber ?? 0}`,
      avatar: ANONYMOUS_AVATAR,
      anonymousNumber: p.anonymousNumber,
    };
  }
  const entry = p.personaSlug ? personaBySlug(p.personaSlug) : undefined;
  return {
    kind: "named",
    slug: p.personaSlug,
    name: entry?.name ?? p.personaSlug ?? "Unknown",
    avatar: avatarFor(p.personaSlug),
    anonymousNumber: null,
  };
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession(id);
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const myClientId = await getClientId();

  const allParticipants = await db.select().from(participants).where(eq(participants.sessionId, id));
  const me = allParticipants.find((p) => p.clientId === myClientId);

  const participantState: ParticipantState[] = allParticipants.map((p) => ({
    id: p.id,
    clientId: p.clientId,
    persona: buildPersona(p),
    // Admin identity is private. Each viewer sees their own role accurately;
    // everyone else is reported as a plain participant.
    role: p.clientId === myClientId ? p.role : "participant",
    isDoneWriting: p.isDoneWriting,
    isDoneVoting: p.isDoneVoting,
    isConnected: false,
  }));

  const allCards = await db.select().from(cards).where(eq(cards.sessionId, id));
  const cardPayload: CardPayload[] = allCards
    .filter((c) => !c.deletedAt)
    .map((c) => {
      const author = allParticipants.find((p) => p.id === c.authorParticipantId);
      const authorPersona: Persona = author ? buildPersona(author) : {
        kind: "named",
        slug: null,
        name: "Unknown",
        avatar: ANONYMOUS_AVATAR,
        anonymousNumber: null,
      };
      const isOwn = author?.clientId === myClientId;
      const isAction = c.column === "action_item";
      // Blur boundary: during writing, hide text from non-authors unless action item.
      const reveal = session.status !== "writing" || isOwn || isAction;
      return {
        id: c.id,
        column: c.column,
        text: reveal ? c.text : null,
        richText: reveal ? c.richText : null,
        hasText: c.text.length > 0,
        authorParticipantId: c.authorParticipantId,
        authorPersona,
        pushedToClickup: !!c.pushedToClickupAt,
        clickupTaskId: c.clickupTaskId,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      };
    });

  const allVotes = await db.select().from(votes).where(eq(votes.sessionId, id));
  const voteMap = new Map<string, VotePayload>();
  for (const c of allCards) voteMap.set(c.id, {
    cardId: c.id, likeCount: 0, dislikeCount: 0, likeVoters: [], dislikeVoters: [], myVote: null,
  });
  for (const v of allVotes) {
    const card = voteMap.get(v.cardId);
    if (!card) continue;
    const voter = allParticipants.find((p) => p.id === v.voterParticipantId);
    const persona: Persona = voter ? buildPersona(voter) : {
      kind: "named", slug: null, name: "Unknown", avatar: ANONYMOUS_AVATAR, anonymousNumber: null,
    };
    if (v.kind === "like") { card.likeCount++; card.likeVoters.push(persona); }
    else { card.dislikeCount++; card.dislikeVoters.push(persona); }
    if (me && v.voterParticipantId === me.id) card.myVote = v.kind;
  }

  const allComments = await db.select().from(comments).where(eq(comments.sessionId, id));
  const commentPayload: CommentPayload[] = allComments.map((c) => {
    const author = allParticipants.find((p) => p.id === c.authorParticipantId);
    const persona: Persona = author ? buildPersona(author) : {
      kind: "named", slug: null, name: "Unknown", avatar: ANONYMOUS_AVATAR, anonymousNumber: null,
    };
    return {
      id: c.id,
      cardId: c.cardId,
      text: c.text,
      authorParticipantId: c.authorParticipantId,
      authorPersona: persona,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  });

  const adminSlotTaken = !!session.adminClientId;
  const iAmAdmin = !!session.adminClientId && session.adminClientId === myClientId;
  const adminSlotAvailableForMe = !session.adminClientId || iAmAdmin;
  // Don't leak adminClientId to non-admins.
  const safeSession = {
    ...session,
    adminClientId: iAmAdmin ? session.adminClientId : null,
  };

  return NextResponse.json({
    session: safeSession,
    participants: participantState,
    cards: cardPayload,
    votes: Array.from(voteMap.values()),
    comments: commentPayload,
    me: me ? { participantId: me.id, clientId: me.clientId } : null,
    currentClientId: myClientId,
    adminSlotAvailableForMe,
    adminSlotTaken,
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const clientId = await getClientId();
  const session = await getSession(id);
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (session.adminClientId !== clientId) {
    return NextResponse.json({ error: "Only the admin can delete the retro" }, { status: 403 });
  }
  const io = getIO();
  // Tell everyone in the room first, then disconnect them.
  if (io) {
    io.to(`retro:${id}`).emit("session.terminated", { reason: "canceled" });
    // give the event a moment to flush before disconnecting
    await new Promise((r) => setTimeout(r, 50));
    const sockets = await io.in(`retro:${id}`).fetchSockets();
    for (const s of sockets) s.disconnect(true);
  }
  // Cascade-deletes wipe participants/cards/votes/comments/persona_reservations
  await db.delete(sessions).where(eq(sessions.id, id));
  io?.to("lobby").emit("lobby.session_ended", {
    id: session.id,
    title: session.title,
    status: "closed",
    startedAt: session.startedAt.toISOString(),
    endedAt: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true });
}
