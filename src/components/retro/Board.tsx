"use client";
import { useMemo } from "react";
import { useRetroStore } from "@/lib/retroStore";
import { ColumnView } from "./ColumnView";
import { ActionItemsColumn } from "./ActionItemsColumn";
import { ProgressBanner } from "./ProgressBanner";
import { RoleSwitcher } from "./RoleSwitcher";
import { CancelRetroButton } from "./CancelRetroButton";

export function Board({ readOnly }: { readOnly: boolean }) {
  const session = useRetroStore((s) => s.session);
  const cards = useRetroStore((s) => s.cards);
  const votes = useRetroStore((s) => s.votes);
  const participants = useRetroStore((s) => s.participants);

  const allDoneVoting = useMemo(() => {
    const connected = participants.filter((p) => p.isConnected);
    return connected.length > 0 && connected.every((p) => p.isDoneVoting);
  }, [participants]);

  // Sort only after everyone is done voting (or once the retro is closed).
  // During voting, cards stay in creation order so the layout doesn't shuffle
  // out from under people while they're still casting votes.
  const shouldSortByVotes = session?.status === "closed" || (session?.status === "voting" && allDoneVoting);

  const sortedCards = useMemo(() => {
    if (!shouldSortByVotes) {
      return [...cards].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    }
    const cmp = (a: typeof cards[0], b: typeof cards[0]) => {
      const va = votes[a.id]; const vb = votes[b.id];
      const al = va?.likeCount ?? 0; const bl = vb?.likeCount ?? 0;
      if (al !== bl) return bl - al;
      const ad = va?.dislikeCount ?? 0; const bd = vb?.dislikeCount ?? 0;
      if (ad !== bd) return ad - bd;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    };
    return [...cards].sort(cmp);
  }, [cards, votes, shouldSortByVotes]);

  if (!session) {
    return <div className="mx-auto max-w-6xl px-6 py-10 text-[var(--color-muted)]">Loading...</div>;
  }

  const wentWell = sortedCards.filter((c) => c.column === "went_well");
  const toImprove = sortedCards.filter((c) => c.column === "to_improve");
  const actionItems = sortedCards.filter((c) => c.column === "action_item");

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-4 sm:py-6 flex flex-col gap-4 lg:h-[calc(100dvh-3.75rem)] lg:overflow-hidden">
      <div className="flex items-start sm:items-center justify-between gap-2 flex-wrap shrink-0">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight truncate">{session.title}</h1>
          <p className="text-xs text-[var(--color-muted)]">
            Phase: <span className="font-medium">{session.status}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!readOnly && <RoleSwitcher />}
          {!readOnly && <CancelRetroButton />}
        </div>
      </div>

      {!readOnly && <div className="shrink-0"><ProgressBanner /></div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 lg:flex-1 lg:min-h-0">
        <ColumnView
          title="Went well"
          tone="success"
          column="went_well"
          cards={wentWell}
          readOnly={readOnly || session.status === "closed"}
        />
        <ColumnView
          title="To improve"
          tone="warning"
          column="to_improve"
          cards={toImprove}
          readOnly={readOnly || session.status === "closed"}
        />
        <ActionItemsColumn cards={actionItems} readOnly={readOnly || session.status === "closed"} />
      </div>
    </div>
  );
}
