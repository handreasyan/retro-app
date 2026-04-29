"use client";
import { useEffect, useRef, useState } from "react";
import { useRetroStore } from "@/lib/retroStore";
import { Button } from "@/components/Button";
import { PersonaAvatar } from "@/components/PersonaAvatar";
import { HelpTooltip } from "@/components/Tooltip";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose } from "@/components/Dialog";
import { getSocket } from "@/lib/socket";
import { Check, Clock } from "lucide-react";
import type { ParticipantState } from "@/server/types";

export function ProgressBanner() {
  const session = useRetroStore((s) => s.session);
  const participants = useRetroStore((s) => s.participants);
  const myParticipantId = useRetroStore((s) => s.myParticipantId);
  const me = participants.find((p) => p.id === myParticipantId);
  if (!session || session.status === "closed") return null;
  const phase = session.status;
  const flag = phase === "writing" ? "isDoneWriting" : "isDoneVoting";
  const connected = participants.filter((p) => p.isConnected);
  const totalParticipants = connected.length;
  const doneParticipants = connected.filter((p) => p[flag]);
  const remaining = connected.filter((p) => !p[flag]);
  const allDone = totalParticipants > 0 && remaining.length === 0;
  const isAdmin = me?.role === "admin";

  // Auto-prompt admin when everyone has just finished. Only fire on the
  // false -> true transition, and reset when allDone goes back to false (e.g.
  // someone un-clicks done) or when the phase changes.
  const [autoPromptOpen, setAutoPromptOpen] = useState(false);
  const dismissedFor = useRef<{ phase: string; sig: string } | null>(null);
  const prevAllDone = useRef(false);
  useEffect(() => {
    const sig = `${phase}:${totalParticipants}`;
    // Only fire the auto-prompt during the writing phase. The voting -> closed
    // transition has bigger consequences (saves to past retros, can't be undone)
    // and is better left to an explicit click on End retro.
    if (allDone && !prevAllDone.current && isAdmin && phase === "writing") {
      const dismissed = dismissedFor.current && dismissedFor.current.phase === phase && dismissedFor.current.sig === sig;
      if (!dismissed) setAutoPromptOpen(true);
    }
    if (!allDone) {
      if (dismissedFor.current?.phase === phase) dismissedFor.current = null;
    }
    prevAllDone.current = allDone;
  }, [allDone, isAdmin, phase, totalParticipants]);

  function toggleDone() {
    if (!me) return;
    getSocket().emit("done.set", { phase, value: !me[flag] });
  }

  function advance() {
    if (phase === "writing") {
      getSocket().emit("session.advance", {});
    } else if (phase === "voting") {
      if (!confirm("End the retro? This cannot be undone.")) return;
      getSocket().emit("session.end", {});
      // Hard-redirect immediately so the admin doesn't race the socket round-trip.
      // Other users still get redirected by their session.terminated handler.
      try { sessionStorage.setItem("retro:flash", "The retro has ended."); } catch {}
      window.location.href = "/";
    }
  }

  function dismissAutoPrompt() {
    dismissedFor.current = { phase, sig: `${phase}:${totalParticipants}` };
    setAutoPromptOpen(false);
  }
  function confirmAutoPrompt() {
    setAutoPromptOpen(false);
    advance();
  }

  let label: React.ReactNode;
  if (allDone) {
    label = (
      <span className="inline-flex items-center gap-2 flex-wrap">
        <span>{phase === "writing" ? "Everyone is done" : "Everyone voted"}</span>
        <AvatarStack people={doneParticipants} />
      </span>
    );
  } else {
    label = (
      <span className="inline-flex items-center gap-4 flex-wrap">
        <HelpTooltip text={waitingTooltip(phase)}>
          <span className="inline-flex items-center gap-2 cursor-help">
            <Clock size={14} className="text-[var(--color-warning)]" />
            <span>Waiting for {remaining.length}</span>
            <AvatarStack people={remaining} />
          </span>
        </HelpTooltip>
        {doneParticipants.length > 0 && (
          <span className="inline-flex items-center gap-2">
            <Check size={14} className="text-[var(--color-success)]" />
            <span>Done {doneParticipants.length}</span>
            <AvatarStack people={doneParticipants} />
          </span>
        )}
      </span>
    );
  }

  const advanceLabel = phase === "writing" ? "Open the board" : "End retro";

  return (
    <>
      <Dialog open={autoPromptOpen} onOpenChange={(o) => !o && dismissAutoPrompt()}>
        <DialogContent>
          <DialogTitle>Everyone is done writing</DialogTitle>
          <DialogDescription>
            All users have clicked I&apos;m done. Open the board to reveal every card and start the voting phase?
          </DialogDescription>
          <div className="mt-6 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost" onClick={dismissAutoPrompt}>Not yet</Button>
            </DialogClose>
            <Button onClick={confirmAutoPrompt}>Open the board</Button>
          </div>
        </DialogContent>
      </Dialog>
      <div className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 sm:px-4 py-2 text-sm ${allDone ? "border-[var(--color-success)]/40 bg-green-50 dark:bg-green-950/30" : "border-[var(--color-border)] bg-[var(--color-bg-elev)]"}`}>
      <div className="flex items-center gap-2 min-w-0">
        {allDone && <Check size={16} className="text-[var(--color-success)] shrink-0" />}
        <div className="min-w-0">{label}</div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {me && (
          <HelpTooltip text={doneTooltip(phase, me[flag])}>
            <Button size="sm" variant={me[flag] ? "secondary" : "primary"} onClick={toggleDone}>
              {me[flag] ? "Not done" : "I'm done"}
            </Button>
          </HelpTooltip>
        )}
        {isAdmin && (
          <HelpTooltip text={advanceTooltip(phase)}>
            <Button size="sm" variant={allDone ? "primary" : "secondary"} onClick={advance}>
              {advanceLabel}
            </Button>
          </HelpTooltip>
        )}
      </div>
    </div>
    </>
  );
}

function doneTooltip(phase: "writing" | "voting" | "closed", isDone: boolean): string {
  if (isDone) {
    return phase === "writing"
      ? "Mark yourself as not done if you'd like to add or edit more cards before the board opens."
      : "Mark yourself as not done if you'd like to keep voting or commenting.";
  }
  return phase === "writing"
    ? "Click when you've written all the cards you want. The board only opens once everyone is done (admin presses Open the board)."
    : "Click when you've finished voting and commenting. The retro ends once everyone is done (admin presses End retro).";
}

function waitingTooltip(phase: "writing" | "voting" | "closed"): string {
  if (phase === "writing")
    return "We're waiting for everyone to click I'm done before the admin can Open the board (which reveals every card and starts voting).";
  if (phase === "voting")
    return "We're waiting for everyone to click I'm done before the admin can End the retro.";
  return "";
}

function advanceTooltip(phase: "writing" | "voting" | "closed"): string {
  if (phase === "writing")
    return "Open the board: reveals every card to everyone (until now, only authors could see their own text), and starts the voting phase where each user can spend 3 likes and 3 dislikes plus unlimited comments. Wait until everyone has clicked I'm done so no one is mid-thought.";
  if (phase === "voting")
    return "End retro: closes the session permanently. Cards sort by likes, the retro moves to Past retros, and the board becomes read-only for everyone. Wait until everyone has clicked I'm done.";
  return "";
}

function AvatarStack({ people, max = 8 }: { people: ParticipantState[]; max?: number }) {
  if (people.length === 0) return null;
  const visible = people.slice(0, max);
  const overflow = people.length - visible.length;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-flex items-center -space-x-1.5">
        {visible.map((p) => (
          <PersonaAvatar key={p.id} persona={p.persona} size={22} className="ring-2 ring-[var(--color-bg-elev)] rounded-full" />
        ))}
      </span>
      {overflow > 0 && <span className="text-[var(--color-muted)]">+{overflow}</span>}
    </span>
  );
}
