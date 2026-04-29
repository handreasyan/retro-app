"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PersonaPicker } from "./PersonaPicker";
import { Board } from "./Board";
import { useRetroStore } from "@/lib/retroStore";
import { getSocket } from "@/lib/socket";

export function RetroBoard({ sessionId, hasJoined, readOnly }: { sessionId: string; hasJoined: boolean; readOnly: boolean }) {
  const router = useRouter();
  const [needsPicker, setNeedsPicker] = useState(!hasJoined && !readOnly);
  const [bootstrapped, setBootstrapped] = useState(false);

  const setSnapshot = useRetroStore((s) => s.setSnapshot);
  const upsertParticipants = useRetroStore((s) => s.upsertParticipants);
  const upsertCard = useRetroStore((s) => s.upsertCard);
  const removeCard = useRetroStore((s) => s.removeCard);
  const setCards = useRetroStore((s) => s.setCards);
  const setVote = useRetroStore((s) => s.setVote);
  const upsertComment = useRetroStore((s) => s.upsertComment);
  const removeComment = useRetroStore((s) => s.removeComment);
  const setStatus = useRetroStore((s) => s.setStatus);
  const setAdmin = useRetroStore((s) => s.setAdmin);
  const setAdminSlotTaken = useRetroStore((s) => s.setAdminSlotTaken);
  const setConnected = useRetroStore((s) => s.setConnected);

  useEffect(() => {
    if (needsPicker) return;
    let cancelled = false;
    void (async () => {
      const r = await fetch(`/api/sessions/${sessionId}`);
      if (!r.ok) return;
      const d = await r.json();
      if (cancelled) return;
      const votesMap: Record<string, typeof d.votes[number]> = {};
      for (const v of d.votes) votesMap[v.cardId] = v;
      setSnapshot({
        session: d.session,
        participants: d.participants,
        cards: d.cards,
        votes: votesMap,
        comments: d.comments,
        myParticipantId: d.me?.participantId ?? null,
        myClientId: d.me?.clientId ?? d.currentClientId ?? null,
        adminSlotTaken: !!d.adminSlotTaken,
      });
      setBootstrapped(true);
    })();
    return () => { cancelled = true; };
  }, [sessionId, needsPicker, setSnapshot]);

  useEffect(() => {
    if (needsPicker || !bootstrapped || readOnly) return;
    const sock = getSocket();
    setConnected(sock.connected);

    function onConnect() { setConnected(true); sock.emit("join", { sessionId }); }
    function onDisconnect() { setConnected(false); }

    sock.on("connect", onConnect);
    sock.on("disconnect", onDisconnect);
    if (sock.connected) onConnect(); else sock.connect();

    sock.on("presence.snapshot", (p) => {
      upsertParticipants(p.participants);
      setAdmin(p.adminClientId);
      setAdminSlotTaken(!!p.adminSlotTaken);
    });
    sock.on("role.changed", (p) => {
      setAdmin(p.adminClientId);
      setAdminSlotTaken(!!p.adminSlotTaken);
    });
    sock.on("phase.changed", (p) => setStatus(p.status));
    sock.on("cards.revealed", (p) => setCards(p.cards));
    sock.on("card.upserted", (c) => upsertCard(c));
    sock.on("card.deleted", (p) => removeCard(p.id));
    sock.on("vote.changed", (v) => setVote(v));
    sock.on("comment.upserted", (c) => upsertComment(c));
    sock.on("comment.deleted", (p) => removeComment(p.id));
    sock.on("error", (e) => console.error(e));
    sock.on("session.terminated", ({ reason }) => {
      const msg = reason === "canceled"
        ? "Admin canceled the retro."
        : "The retro has ended.";
      try { sessionStorage.setItem("retro:flash", msg); } catch { /* ignore */ }
      // Hard navigation: avoids a Next router-cache miss where the stale retro
      // route shows a 404 before the navigation completes.
      window.location.href = "/";
    });

    return () => {
      sock.off("connect", onConnect);
      sock.off("disconnect", onDisconnect);
      sock.off("presence.snapshot");
      sock.off("role.changed");
      sock.off("phase.changed");
      sock.off("cards.revealed");
      sock.off("card.upserted");
      sock.off("card.deleted");
      sock.off("vote.changed");
      sock.off("comment.upserted");
      sock.off("comment.deleted");
      sock.off("error");
      sock.off("session.terminated");
    };
  }, [sessionId, needsPicker, bootstrapped, readOnly, router, setConnected, upsertParticipants, setAdmin, setAdminSlotTaken, setStatus, setCards, upsertCard, removeCard, setVote, upsertComment, removeComment]);

  if (readOnly) {
    return <Board readOnly={true} />;
  }
  if (needsPicker) {
    return (
      <PersonaPicker
        sessionId={sessionId}
        open={needsPicker}
        onClose={() => setNeedsPicker(false)}
        onConfirmed={() => {
          setNeedsPicker(false);
          // refresh page to bootstrap me + join
          window.location.reload();
        }}
      />
    );
  }
  if (!bootstrapped) {
    return <div className="mx-auto max-w-6xl px-6 py-10 text-[var(--color-muted)]">Loading retro...</div>;
  }
  return <Board readOnly={false} />;
}
