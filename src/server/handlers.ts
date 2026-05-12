import type { AppIO, AppSocket, CardPayload, CommentPayload, ParticipantState, VotePayload } from "./types";
import { db } from "@/db";
import { cards, comments, participants, sessions, votes } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { ensureClient } from "@/lib/identity-server";
import { advanceSessionToVoting, claimAdmin, endSession, releaseAdmin } from "@/lib/sessions";
import { connectedClientsForSession, trackConnection, untrackConnection } from "./state";
import { buildPersona } from "./persona";

const MAX_LIKES = 3;
const MAX_DISLIKES = 3;
const COMMENT_MAX = 300;

function room(sessionId: string) { return `retro:${sessionId}`; }

async function getMe(socket: AppSocket) {
  if (!socket.data.sessionId || !socket.data.participantId) return null;
  const [me] = await db.select().from(participants).where(eq(participants.id, socket.data.participantId)).limit(1);
  return me ?? null;
}

async function snapshotPresence(io: AppIO, sessionId: string) {
  const all = await db.select().from(participants).where(eq(participants.sessionId, sessionId));
  const connected = connectedClientsForSession(sessionId);
  const [s] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  const adminClientId = s?.adminClientId ?? null;
  const adminSlotTaken = !!adminClientId;

  // Per-recipient redaction: each viewer only sees their own role accurately;
  // every other participant is reported as 'participant' so the admin's identity
  // cannot be inferred from the participant list.
  const sockets = await io.in(room(sessionId)).fetchSockets();
  for (const sock of sockets) {
    const viewerClientId = sock.data.clientId;
    const list: ParticipantState[] = all.map((p) => ({
      id: p.id,
      clientId: p.clientId,
      persona: buildPersona(p),
      role: p.clientId === viewerClientId ? p.role : "participant",
      isDoneWriting: p.isDoneWriting,
      isDoneVoting: p.isDoneVoting,
      isConnected: connected.has(p.clientId),
    }));
    sock.emit("presence.snapshot", {
      participants: list,
      adminClientId: viewerClientId === adminClientId ? adminClientId : null,
      adminSlotTaken,
    });
  }
}

async function broadcastRoleChanged(io: AppIO, sessionId: string) {
  const [s] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  const adminClientId = s?.adminClientId ?? null;
  const adminSlotTaken = !!adminClientId;
  const sockets = await io.in(room(sessionId)).fetchSockets();
  for (const sock of sockets) {
    sock.emit("role.changed", {
      adminClientId: sock.data.clientId === adminClientId ? adminClientId : null,
      adminSlotTaken,
    });
  }
}

async function emitCard(io: AppIO, sessionId: string, cardId: string, opts: { forceReveal?: boolean } = {}) {
  const [c] = await db.select().from(cards).where(eq(cards.id, cardId)).limit(1);
  if (!c) return;
  const [author] = await db.select().from(participants).where(eq(participants.id, c.authorParticipantId)).limit(1);
  const [s] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (!author || !s) return;
  const isAction = c.column === "action_item";
  // For non-action items in writing phase, blur is applied per-recipient via separate emits.
  if (s.status === "writing" && !isAction && !opts.forceReveal) {
    // Author socket(s) get full text; others get blurred.
    const room$ = io.in(room(sessionId)).fetchSockets();
    const sockets = await room$;
    const fullPayload: CardPayload = {
      id: c.id,
      column: c.column,
      text: c.text,
      richText: c.richText,
      hasText: c.text.length > 0,
      authorParticipantId: c.authorParticipantId,
      authorPersona: buildPersona(author),
      pushedToClickup: !!c.pushedToClickupAt,
      clickupTaskId: c.clickupTaskId,
      discussedAt: c.discussedAt ? c.discussedAt.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
    const blurredPayload: CardPayload = { ...fullPayload, text: null, richText: null };
    for (const sock of sockets) {
      const isOwn = sock.data.clientId === author.clientId;
      sock.emit("card.upserted", isOwn ? fullPayload : blurredPayload);
    }
    return;
  }
  const payload: CardPayload = {
    id: c.id,
    column: c.column,
    text: c.text,
    richText: c.richText,
    hasText: c.text.length > 0,
    authorParticipantId: c.authorParticipantId,
    authorPersona: buildPersona(author),
    pushedToClickup: !!c.pushedToClickupAt,
    clickupTaskId: c.clickupTaskId,
    discussedAt: c.discussedAt ? c.discussedAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
  io.to(room(sessionId)).emit("card.upserted", payload);
}

async function emitVote(io: AppIO, sessionId: string, cardId: string) {
  const [c] = await db.select().from(cards).where(eq(cards.id, cardId)).limit(1);
  if (!c) return;
  const allVotes = await db.select().from(votes).where(eq(votes.cardId, cardId));
  // Voter identities are private. Only send counts; do not leak persona lists.
  const likeCount = allVotes.filter((v) => v.kind === "like").length;
  const dislikeCount = allVotes.filter((v) => v.kind === "dislike").length;

  const sockets = await io.in(room(sessionId)).fetchSockets();
  for (const sock of sockets) {
    const meId = sock.data.participantId;
    const myVote = meId ? allVotes.find((v) => v.voterParticipantId === meId) : null;
    const payload: VotePayload = {
      cardId,
      likeCount,
      dislikeCount,
      likeVoters: [],
      dislikeVoters: [],
      myVote: myVote ? myVote.kind : null,
    };
    sock.emit("vote.changed", payload);
  }
}

async function emitComment(io: AppIO, c: typeof comments.$inferSelect) {
  const [author] = await db.select().from(participants).where(eq(participants.id, c.authorParticipantId)).limit(1);
  if (!author) return;
  const payload: CommentPayload = {
    id: c.id,
    cardId: c.cardId,
    text: c.text,
    authorParticipantId: c.authorParticipantId,
    authorPersona: buildPersona(author),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
  io.to(room(c.sessionId)).emit("comment.upserted", payload);
}

async function broadcastCardsRevealed(io: AppIO, sessionId: string) {
  const allCards = await db.select().from(cards).where(eq(cards.sessionId, sessionId));
  const allParticipants = await db.select().from(participants).where(eq(participants.sessionId, sessionId));
  const payload: CardPayload[] = allCards
    .filter((c) => !c.deletedAt)
    .map((c) => {
      const author = allParticipants.find((p) => p.id === c.authorParticipantId);
      return {
        id: c.id,
        column: c.column,
        text: c.text,
        richText: c.richText,
        hasText: c.text.length > 0,
        authorParticipantId: c.authorParticipantId,
        authorPersona: author ? buildPersona(author) : {
          kind: "named", slug: null, name: "Unknown", avatar: "/avatars/_anonymous.svg", anonymousNumber: null,
        },
        pushedToClickup: !!c.pushedToClickupAt,
        clickupTaskId: c.clickupTaskId,
        discussedAt: c.discussedAt ? c.discussedAt.toISOString() : null,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      };
    });
  io.to(room(sessionId)).emit("cards.revealed", { cards: payload });
}

export function attachSocketHandlers(io: AppIO) {
  io.on("connection", (socket) => {
    // Every socket joins the lobby room so it can receive
    // lobby.session_started / lobby.session_ended events. Joining a retro
    // room (via `join`) does not remove them from lobby.
    void socket.join("lobby");

    socket.on("join", async ({ sessionId }) => {
      try {
        await ensureClient(socket.data.clientId);
        const [s] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
        if (!s) return socket.emit("error", { message: "Session not found" });

        const [participant] = await db
          .select()
          .from(participants)
          .where(and(eq(participants.sessionId, sessionId), eq(participants.clientId, socket.data.clientId)))
          .limit(1);
        if (!participant) {
          return socket.emit("error", { message: "You must pick a persona before joining" });
        }
        socket.data.sessionId = sessionId;
        socket.data.participantId = participant.id;
        await socket.join(room(sessionId));
        trackConnection(sessionId, socket.data.clientId, socket.id);

        // If this client was admin and reconnects to an empty admin slot, reclaim.
        if (!s.adminClientId && participant.role === "admin") {
          await claimAdmin(sessionId, socket.data.clientId);
        }

        await snapshotPresence(io, sessionId);
      } catch (err) {
        console.error("join error", err);
        socket.emit("error", { message: "Failed to join" });
      }
    });

    socket.on("role.claim", async () => {
      const sid = socket.data.sessionId;
      if (!sid) return;
      const updated = await claimAdmin(sid, socket.data.clientId);
      if (updated) {
        await db
          .update(participants)
          .set({ role: "admin" })
          .where(and(eq(participants.sessionId, sid), eq(participants.clientId, socket.data.clientId)));
        // Demote any other admin participants
        await db
          .update(participants)
          .set({ role: "participant" })
          .where(and(
            eq(participants.sessionId, sid),
            eq(participants.role, "admin"),
            sql`${participants.clientId} != ${socket.data.clientId}`,
          ));
      }
      await broadcastRoleChanged(io, sid);
      await snapshotPresence(io, sid);
    });

    socket.on("role.release", async () => {
      const sid = socket.data.sessionId;
      if (!sid) return;
      await releaseAdmin(sid, socket.data.clientId);
      await db
        .update(participants)
        .set({ role: "participant" })
        .where(and(eq(participants.sessionId, sid), eq(participants.clientId, socket.data.clientId)));
      await broadcastRoleChanged(io, sid);
      await snapshotPresence(io, sid);
    });

    socket.on("card.create", async ({ column, text, richText }) => {
      const sid = socket.data.sessionId;
      const me = await getMe(socket);
      if (!sid || !me) return;
      const [s] = await db.select().from(sessions).where(eq(sessions.id, sid)).limit(1);
      if (!s) return;
      // Action items can be added in writing or voting; regular cards only in writing.
      if (column !== "action_item" && s.status !== "writing") {
        return socket.emit("error", { message: "Cards can only be added during the writing phase" });
      }
      if (s.status === "closed") return;
      const trimmed = (text ?? "");
      const [created] = await db
        .insert(cards)
        .values({
          sessionId: sid,
          authorParticipantId: me.id,
          column,
          text: trimmed,
          richText: column === "action_item" ? (richText ?? null) : null,
        })
        .returning();
      await emitCard(io, sid, created.id);
    });

    socket.on("card.update", async ({ id, text, richText }) => {
      const sid = socket.data.sessionId;
      const me = await getMe(socket);
      if (!sid || !me) return;
      const [c] = await db.select().from(cards).where(eq(cards.id, id)).limit(1);
      if (!c) return;
      const [s] = await db.select().from(sessions).where(eq(sessions.id, sid)).limit(1);
      if (!s || s.status === "closed") return;
      const isOwner = c.authorParticipantId === me.id;
      const isAdmin = me.role === "admin";
      if (!isOwner && !isAdmin) {
        return socket.emit("error", { message: "Not allowed" });
      }
      const updates: Partial<typeof cards.$inferInsert> = { updatedAt: new Date() };
      if (typeof text === "string") updates.text = text;
      if (richText !== undefined && c.column === "action_item") updates.richText = richText as object;
      await db.update(cards).set(updates).where(eq(cards.id, id));
      await emitCard(io, sid, id);
    });

    socket.on("card.delete", async ({ id }) => {
      const sid = socket.data.sessionId;
      const me = await getMe(socket);
      if (!sid || !me) return;
      const [c] = await db.select().from(cards).where(eq(cards.id, id)).limit(1);
      if (!c) return;
      const [s] = await db.select().from(sessions).where(eq(sessions.id, sid)).limit(1);
      if (!s || s.status === "closed") return;
      const isOwner = c.authorParticipantId === me.id;
      const isAdmin = me.role === "admin";
      if (!isOwner && !isAdmin) return socket.emit("error", { message: "Not allowed" });
      await db.update(cards).set({ deletedAt: new Date() }).where(eq(cards.id, id));
      // Cascade votes/comments are kept by deletedAt; for v1 we hard-delete to keep client state simple.
      await db.delete(votes).where(eq(votes.cardId, id));
      await db.delete(comments).where(eq(comments.cardId, id));
      await db.delete(cards).where(eq(cards.id, id));
      io.to(room(sid)).emit("card.deleted", { id });
    });

    socket.on("card.discussed.set", async ({ id, value }) => {
      const sid = socket.data.sessionId;
      const me = await getMe(socket);
      if (!sid || !me) return;
      const [s] = await db.select().from(sessions).where(eq(sessions.id, sid)).limit(1);
      if (!s || s.status === "closed") return;
      const [c] = await db.select().from(cards).where(eq(cards.id, id)).limit(1);
      if (!c || c.sessionId !== sid) return;
      await db
        .update(cards)
        .set({ discussedAt: value ? new Date() : null, updatedAt: new Date() })
        .where(eq(cards.id, id));
      await emitCard(io, sid, id);
    });

    socket.on("done.set", async ({ phase, value, targetParticipantId }) => {
      const sid = socket.data.sessionId;
      const me = await getMe(socket);
      if (!sid || !me) return;
      const targetId = targetParticipantId ?? me.id;
      if (targetId !== me.id && me.role !== "admin") {
        return socket.emit("error", { message: "Only admin can set someone else's done flag" });
      }
      const col = phase === "writing" ? participants.isDoneWriting : participants.isDoneVoting;
      const update = phase === "writing" ? { isDoneWriting: value } : { isDoneVoting: value };
      void col;
      await db.update(participants).set(update).where(eq(participants.id, targetId));
      await snapshotPresence(io, sid);
    });

    socket.on("session.advance", async () => {
      const sid = socket.data.sessionId;
      const me = await getMe(socket);
      if (!sid || !me) return;
      if (me.role !== "admin") return socket.emit("error", { message: "Only admin can advance" });
      const updated = await advanceSessionToVoting(sid);
      if (!updated) return;
      io.to(room(sid)).emit("phase.changed", { status: updated.status });
      await broadcastCardsRevealed(io, sid);
    });

    socket.on("session.end", async () => {
      const sid = socket.data.sessionId;
      const me = await getMe(socket);
      if (!sid || !me) return;
      if (me.role !== "admin") return socket.emit("error", { message: "Only admin can end" });
      const updated = await endSession(sid);
      if (!updated) return;
      io.to(room(sid)).emit("phase.changed", { status: "closed" });
      io.to(room(sid)).emit("session.terminated", { reason: "ended" });
      io.to("lobby").emit("lobby.session_ended", {
        id: updated.id,
        title: updated.title,
        status: updated.status,
        startedAt: updated.startedAt.toISOString(),
        endedAt: updated.endedAt?.toISOString() ?? null,
      });
    });

    socket.on("vote.cast", async ({ cardId, kind }) => {
      const sid = socket.data.sessionId;
      const me = await getMe(socket);
      if (!sid || !me) return;
      const [s] = await db.select().from(sessions).where(eq(sessions.id, sid)).limit(1);
      if (!s || s.status !== "voting") return socket.emit("error", { message: "Voting not open" });
      const [c] = await db.select().from(cards).where(eq(cards.id, cardId)).limit(1);
      if (!c || c.sessionId !== sid) return;
      if (c.authorParticipantId === me.id) return socket.emit("error", { message: "You can't vote on your own card" });

      const [existing] = await db
        .select()
        .from(votes)
        .where(and(eq(votes.cardId, cardId), eq(votes.voterParticipantId, me.id)))
        .limit(1);

      if (existing && existing.kind === kind) {
        // toggle off
        await db.delete(votes).where(eq(votes.id, existing.id));
      } else if (existing) {
        // flipping requires a budget slot of the new kind (refund the old kind first)
        const myVotesOfNewKind = await db
          .select()
          .from(votes)
          .where(and(eq(votes.sessionId, sid), eq(votes.voterParticipantId, me.id), eq(votes.kind, kind)));
        const cap = kind === "like" ? MAX_LIKES : MAX_DISLIKES;
        if (myVotesOfNewKind.length >= cap) {
          return socket.emit("error", { message: `Out of ${kind}s` });
        }
        await db.update(votes).set({ kind }).where(eq(votes.id, existing.id));
      } else {
        // new vote: budget check
        const myVotesOfKind = await db
          .select()
          .from(votes)
          .where(and(eq(votes.sessionId, sid), eq(votes.voterParticipantId, me.id), eq(votes.kind, kind)));
        const cap = kind === "like" ? MAX_LIKES : MAX_DISLIKES;
        if (myVotesOfKind.length >= cap) {
          return socket.emit("error", { message: `Out of ${kind}s` });
        }
        await db.insert(votes).values({
          sessionId: sid,
          cardId,
          voterParticipantId: me.id,
          kind,
        });
      }
      await emitVote(io, sid, cardId);
    });

    socket.on("comment.create", async ({ cardId, text }) => {
      const sid = socket.data.sessionId;
      const me = await getMe(socket);
      if (!sid || !me) return;
      const [s] = await db.select().from(sessions).where(eq(sessions.id, sid)).limit(1);
      if (!s || s.status === "closed") return;
      if (s.status !== "voting") return socket.emit("error", { message: "Comments open during voting only" });
      const [c] = await db.select().from(cards).where(eq(cards.id, cardId)).limit(1);
      if (!c || c.sessionId !== sid) return;
      const trimmed = text.slice(0, COMMENT_MAX).trim();
      if (!trimmed) return;
      const [created] = await db
        .insert(comments)
        .values({ sessionId: sid, cardId, authorParticipantId: me.id, text: trimmed })
        .returning();
      await emitComment(io, created);
    });

    socket.on("comment.update", async ({ id, text }) => {
      const sid = socket.data.sessionId;
      const me = await getMe(socket);
      if (!sid || !me) return;
      const [c] = await db.select().from(comments).where(eq(comments.id, id)).limit(1);
      if (!c) return;
      const isOwner = c.authorParticipantId === me.id;
      const isAdmin = me.role === "admin";
      if (!isOwner && !isAdmin) return socket.emit("error", { message: "Not allowed" });
      await db.update(comments).set({ text: text.slice(0, COMMENT_MAX), updatedAt: new Date() }).where(eq(comments.id, id));
      const [updated] = await db.select().from(comments).where(eq(comments.id, id)).limit(1);
      if (updated) await emitComment(io, updated);
    });

    socket.on("comment.delete", async ({ id }) => {
      const sid = socket.data.sessionId;
      const me = await getMe(socket);
      if (!sid || !me) return;
      const [c] = await db.select().from(comments).where(eq(comments.id, id)).limit(1);
      if (!c) return;
      const isOwner = c.authorParticipantId === me.id;
      const isAdmin = me.role === "admin";
      if (!isOwner && !isAdmin) return socket.emit("error", { message: "Not allowed" });
      await db.delete(comments).where(eq(comments.id, id));
      io.to(room(sid)).emit("comment.deleted", { id });
    });

    socket.on("disconnect", async () => {
      const sid = socket.data.sessionId;
      if (!sid) return;
      const { stillConnected } = untrackConnection(sid, socket.data.clientId, socket.id);
      if (!stillConnected) {
        // free admin slot if this was the admin
        const [s] = await db.select().from(sessions).where(eq(sessions.id, sid)).limit(1);
        if (s && s.adminClientId === socket.data.clientId) {
          await releaseAdmin(sid, socket.data.clientId);
          await broadcastRoleChanged(io, sid);
        }
      }
      await snapshotPresence(io, sid);
    });
  });
}
