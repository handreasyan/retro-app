import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

export const sessionStatus = pgEnum("session_status", ["writing", "voting", "closed"]);
export const personaKind = pgEnum("persona_kind", ["named", "anonymous"]);
export const participantRole = pgEnum("participant_role", ["participant", "admin"]);
export const cardColumn = pgEnum("card_column", ["went_well", "to_improve", "action_item"]);
export const voteKind = pgEnum("vote_kind", ["like", "dislike"]);

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  status: sessionStatus("status").notNull().default("writing"),
  adminClientId: uuid("admin_client_id").references(() => clients.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export const participants = pgTable(
  "participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    personaKind: personaKind("persona_kind").notNull(),
    personaSlug: text("persona_slug"),
    anonymousNumber: integer("anonymous_number"),
    role: participantRole("role").notNull().default("participant"),
    isDoneWriting: boolean("is_done_writing").notNull().default(false),
    isDoneVoting: boolean("is_done_voting").notNull().default(false),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sessionClientUq: uniqueIndex("participants_session_client_uq").on(t.sessionId, t.clientId),
    sessionPersonaUq: uniqueIndex("participants_session_persona_uq")
      .on(t.sessionId, t.personaSlug)
      .where(sql`${t.personaSlug} is not null`),
    sessionAnonUq: uniqueIndex("participants_session_anon_uq")
      .on(t.sessionId, t.anonymousNumber)
      .where(sql`${t.anonymousNumber} is not null`),
  })
);

export const personaReservations = pgTable(
  "persona_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    personaSlug: text("persona_slug").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    sessionPersonaUq: uniqueIndex("reservations_session_persona_uq").on(t.sessionId, t.personaSlug),
    sessionClientUq: uniqueIndex("reservations_session_client_uq").on(t.sessionId, t.clientId),
  })
);

export const cards = pgTable(
  "cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    authorParticipantId: uuid("author_participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    column: cardColumn("column").notNull(),
    text: text("text").notNull().default(""),
    richText: jsonb("rich_text"),
    pushedToClickupAt: timestamp("pushed_to_clickup_at", { withTimezone: true }),
    clickupTaskId: text("clickup_task_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    sessionIdx: index("cards_session_idx").on(t.sessionId),
  })
);

export const votes = pgTable(
  "votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    voterParticipantId: uuid("voter_participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    kind: voteKind("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    cardVoterUq: uniqueIndex("votes_card_voter_uq").on(t.cardId, t.voterParticipantId),
  })
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    authorParticipantId: uuid("author_participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    cardIdx: index("comments_card_idx").on(t.cardId),
  })
);

export const sessionsRelations = relations(sessions, ({ many, one }) => ({
  participants: many(participants),
  cards: many(cards),
  admin: one(clients, { fields: [sessions.adminClientId], references: [clients.id] }),
}));

export const participantsRelations = relations(participants, ({ one, many }) => ({
  session: one(sessions, { fields: [participants.sessionId], references: [sessions.id] }),
  client: one(clients, { fields: [participants.clientId], references: [clients.id] }),
  cards: many(cards),
  votes: many(votes),
  comments: many(comments),
}));

export const cardsRelations = relations(cards, ({ one, many }) => ({
  session: one(sessions, { fields: [cards.sessionId], references: [sessions.id] }),
  author: one(participants, { fields: [cards.authorParticipantId], references: [participants.id] }),
  votes: many(votes),
  comments: many(comments),
}));

export const votesRelations = relations(votes, ({ one }) => ({
  card: one(cards, { fields: [votes.cardId], references: [cards.id] }),
  voter: one(participants, { fields: [votes.voterParticipantId], references: [participants.id] }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  card: one(cards, { fields: [comments.cardId], references: [cards.id] }),
  author: one(participants, { fields: [comments.authorParticipantId], references: [participants.id] }),
}));
