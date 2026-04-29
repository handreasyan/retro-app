"use client";
import { create } from "zustand";
import type { CardPayload, CommentPayload, ParticipantState, VotePayload } from "@/server/types";

type SessionLite = {
  id: string;
  title: string;
  status: "writing" | "voting" | "closed";
  adminClientId: string | null;
  startedAt: string;
  endedAt: string | null;
};

type RetroStore = {
  session: SessionLite | null;
  participants: ParticipantState[];
  cards: CardPayload[];
  votes: Record<string, VotePayload>;
  comments: CommentPayload[];
  myParticipantId: string | null;
  myClientId: string | null;
  connected: boolean;
  adminSlotTaken: boolean;
  setSnapshot: (data: Partial<RetroStore>) => void;
  upsertParticipants: (ps: ParticipantState[]) => void;
  upsertParticipant: (p: ParticipantState) => void;
  removeParticipant: (id: string) => void;
  upsertCard: (c: CardPayload) => void;
  removeCard: (id: string) => void;
  setCards: (cards: CardPayload[]) => void;
  setVote: (v: VotePayload) => void;
  upsertComment: (c: CommentPayload) => void;
  removeComment: (id: string) => void;
  setStatus: (status: "writing" | "voting" | "closed") => void;
  setAdmin: (clientId: string | null) => void;
  setAdminSlotTaken: (taken: boolean) => void;
  setConnected: (c: boolean) => void;
};

export const useRetroStore = create<RetroStore>((set) => ({
  session: null,
  participants: [],
  cards: [],
  votes: {},
  comments: [],
  myParticipantId: null,
  myClientId: null,
  connected: false,
  adminSlotTaken: false,
  setSnapshot: (data) => set(() => ({ ...data })),
  upsertParticipants: (ps) => set(() => ({ participants: ps })),
  upsertParticipant: (p) =>
    set((s) => {
      const others = s.participants.filter((x) => x.id !== p.id);
      return { participants: [...others, p] };
    }),
  removeParticipant: (id) => set((s) => ({ participants: s.participants.filter((p) => p.id !== id) })),
  upsertCard: (c) =>
    set((s) => {
      const others = s.cards.filter((x) => x.id !== c.id);
      return { cards: [...others, c] };
    }),
  removeCard: (id) => set((s) => ({ cards: s.cards.filter((c) => c.id !== id) })),
  setCards: (cards) => set(() => ({ cards })),
  setVote: (v) => set((s) => ({ votes: { ...s.votes, [v.cardId]: v } })),
  upsertComment: (c) =>
    set((s) => {
      const others = s.comments.filter((x) => x.id !== c.id);
      return { comments: [...others, c] };
    }),
  removeComment: (id) => set((s) => ({ comments: s.comments.filter((c) => c.id !== id) })),
  setStatus: (status) =>
    set((s) => ({ session: s.session ? { ...s.session, status } : s.session })),
  setAdmin: (clientId) =>
    set((s) => ({ session: s.session ? { ...s.session, adminClientId: clientId } : s.session })),
  setAdminSlotTaken: (taken) => set(() => ({ adminSlotTaken: taken })),
  setConnected: (c) => set(() => ({ connected: c })),
}));
