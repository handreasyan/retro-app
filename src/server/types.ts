import type { Server as IOServer, Socket as IOSocket } from "socket.io";

export type Persona = {
  kind: "named" | "anonymous";
  slug: string | null;
  name: string;
  avatar: string;
  anonymousNumber: number | null;
};

export type ParticipantState = {
  id: string;
  clientId: string;
  persona: Persona;
  role: "participant" | "admin";
  isDoneWriting: boolean;
  isDoneVoting: boolean;
  isConnected: boolean;
};

export type SessionSummary = {
  id: string;
  title: string;
  status: "writing" | "voting" | "closed";
  startedAt: string;
  endedAt: string | null;
};

export type ServerToClient = {
  "lobby.session_started": (s: SessionSummary) => void;
  "lobby.session_ended": (s: SessionSummary) => void;
  // adminClientId is included only for the admin themselves; everyone else gets null.
  // adminSlotTaken tells non-admins whether someone holds the role, without revealing who.
  "presence.snapshot": (p: { participants: ParticipantState[]; adminClientId: string | null; adminSlotTaken: boolean }) => void;
  "participant.upserted": (p: ParticipantState) => void;
  "participant.left": (p: { participantId: string; clientId: string }) => void;
  "role.changed": (p: { adminClientId: string | null; adminSlotTaken: boolean }) => void;
  "phase.changed": (p: { status: "writing" | "voting" | "closed" }) => void;
  "session.terminated": (p: { reason: "ended" | "canceled" }) => void;
  "cards.revealed": (p: { cards: CardPayload[] }) => void;
  "card.upserted": (c: CardPayload) => void;
  "card.deleted": (p: { id: string }) => void;
  "vote.changed": (p: VotePayload) => void;
  "comment.upserted": (c: CommentPayload) => void;
  "comment.deleted": (p: { id: string }) => void;
  "error": (p: { message: string }) => void;
};

export type ClientToServer = {
  "join": (p: { sessionId: string }) => void;
  "role.claim": (p: Record<string, never>) => void;
  "role.release": (p: Record<string, never>) => void;
  "card.create": (p: { column: "went_well" | "to_improve" | "action_item"; text: string; richText?: unknown }) => void;
  "card.update": (p: { id: string; text?: string; richText?: unknown }) => void;
  "card.delete": (p: { id: string }) => void;
  "done.set": (p: { phase: "writing" | "voting"; value: boolean; targetParticipantId?: string }) => void;
  "session.advance": (p: Record<string, never>) => void;
  "session.end": (p: Record<string, never>) => void;
  "vote.cast": (p: { cardId: string; kind: "like" | "dislike" }) => void;
  "comment.create": (p: { cardId: string; text: string }) => void;
  "comment.update": (p: { id: string; text: string }) => void;
  "comment.delete": (p: { id: string }) => void;
};

export type SocketData = {
  clientId: string;
  sessionId: string | null;
  participantId: string | null;
};

export type AppIO = IOServer<ClientToServer, ServerToClient, Record<string, never>, SocketData>;
export type AppSocket = IOSocket<ClientToServer, ServerToClient, Record<string, never>, SocketData>;

export type CardPayload = {
  id: string;
  column: "went_well" | "to_improve" | "action_item";
  text: string | null; // null when blurred
  richText: unknown | null;
  hasText: boolean;
  authorParticipantId: string;
  authorPersona: Persona;
  pushedToClickup: boolean;
  clickupTaskId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VotePayload = {
  cardId: string;
  likeCount: number;
  dislikeCount: number;
  likeVoters: Persona[];
  dislikeVoters: Persona[];
  myVote: "like" | "dislike" | null;
};

export type CommentPayload = {
  id: string;
  cardId: string;
  text: string;
  authorParticipantId: string;
  authorPersona: Persona;
  createdAt: string;
  updatedAt: string;
};
