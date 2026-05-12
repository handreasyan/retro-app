"use client";
import { useMemo, useState } from "react";
import { PersonaAvatar } from "@/components/PersonaAvatar";
import { ThumbsUp, ThumbsDown, Pencil, Trash2, MessageSquare, CheckCircle2, ChevronDown } from "lucide-react";
import { useRetroStore } from "@/lib/retroStore";
import { getSocket } from "@/lib/socket";
import type { CardPayload, Persona } from "@/server/types";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Comments } from "./Comments";
import { Button } from "@/components/Button";

export function Card({ card, readOnly }: { card: CardPayload; readOnly: boolean }) {
  const me = useRetroStore((s) => s.participants.find((p) => p.id === s.myParticipantId));
  const myParticipantId = useRetroStore((s) => s.myParticipantId);
  const session = useRetroStore((s) => s.session);
  const vote = useRetroStore((s) => s.votes[card.id]);
  const allComments = useRetroStore((s) => s.comments);
  const comments = useMemo(() => allComments.filter((c) => c.cardId === card.id), [allComments, card.id]);

  const isMine = card.authorParticipantId === myParticipantId;
  const isAdmin = me?.role === "admin";
  const blurred = card.text === null;
  const phase = session?.status ?? "writing";
  const canEdit = !readOnly && (isMine || isAdmin) && phase !== "closed";
  const canDelete = canEdit;
  const canVote = !readOnly && phase === "voting" && !isMine;
  const canComment = !readOnly && phase === "voting";

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.text ?? "");
  const [showComments, setShowComments] = useState(false);
  // When a card is marked Discussed, it collapses for everyone. Each user can
  // locally expand it to peek without un-marking it for the team.
  const [locallyExpanded, setLocallyExpanded] = useState(false);
  const isDiscussed = !!card.discussedAt;
  const collapsed = isDiscussed && !locallyExpanded;
  const canMarkDiscussed = !readOnly && phase !== "writing" && !blurred;

  function castVote(kind: "like" | "dislike") {
    getSocket().emit("vote.cast", { cardId: card.id, kind });
  }
  function deleteCard() {
    if (!confirm("Delete this card?")) return;
    getSocket().emit("card.delete", { id: card.id });
  }
  function saveEdit() {
    getSocket().emit("card.update", { id: card.id, text: draft });
    setEditing(false);
  }
  function toggleDiscussed() {
    getSocket().emit("card.discussed.set", { id: card.id, value: !isDiscussed });
    setLocallyExpanded(false);
  }

  return (
    <div className={`rounded-xl bg-[var(--color-card)] border p-3 group ${isDiscussed ? "border-[var(--color-success)]/40 opacity-90" : "border-[var(--color-border)]"}`}>
      <div className="flex items-center gap-2">
        <PersonaAvatar persona={card.authorPersona} size={24} />
        <span className="text-xs text-[var(--color-muted)] font-medium">{card.authorPersona.name}</span>
        {card.pushedToClickup && (
          <span className="text-[10px] uppercase tracking-wide bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded px-1.5 py-0.5">In ClickUp</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {isDiscussed && (
            <button
              type="button"
              onClick={() => setLocallyExpanded((v) => !v)}
              className="p-1 rounded hover:bg-[var(--color-bg)] text-[var(--color-muted)]"
              aria-label={locallyExpanded ? "Hide" : "Show"}
            >
              <ChevronDown size={16} className={`transition-transform ${locallyExpanded ? "" : "-rotate-90"}`} />
            </button>
          )}
          {canMarkDiscussed && (
            <button
              type="button"
              onClick={toggleDiscussed}
              className={`inline-flex items-center gap-1 text-xs rounded-md px-2 py-1 ${isDiscussed ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200" : "border border-[var(--color-border)] hover:bg-[var(--color-bg)]"}`}
              title={isDiscussed ? "Reopen for discussion" : "Mark as discussed for everyone"}
            >
              <CheckCircle2 size={14} /> {isDiscussed ? "Reopen" : "Discussed"}
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
      <div className="mt-2 text-sm">
        {blurred ? (
          <div className="skeleton-blur h-12">hidden during writing phase</div>
        ) : editing ? (
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full resize-y rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm min-h-20"
          />
        ) : (
          <p className="whitespace-pre-wrap break-words">{card.text}</p>
        )}
      </div>
      )}

      {!blurred && !collapsed && (
        <div className="mt-2 flex items-center gap-3 text-[var(--color-muted)] flex-wrap">
          {phase !== "writing" && (
            <>
              <Tooltip.Provider delayDuration={150}>
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <button
                      type="button"
                      onClick={() => canVote && castVote("like")}
                      disabled={!canVote}
                      className={`inline-flex items-center gap-1 text-sm rounded-md px-1.5 py-0.5 ${vote?.myVote === "like" ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200" : "hover:bg-[var(--color-bg)]"}`}
                    >
                      <ThumbsUp size={14} /> {vote?.likeCount ?? 0}
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content className="rounded-md bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 px-2 py-1 text-xs shadow-soft" sideOffset={6}>
                      <VoterList voters={vote?.likeVoters ?? []} empty="No likes yet" />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <button
                      type="button"
                      onClick={() => canVote && castVote("dislike")}
                      disabled={!canVote}
                      className={`inline-flex items-center gap-1 text-sm rounded-md px-1.5 py-0.5 ${vote?.myVote === "dislike" ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200" : "hover:bg-[var(--color-bg)]"}`}
                    >
                      <ThumbsDown size={14} /> {vote?.dislikeCount ?? 0}
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content className="rounded-md bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 px-2 py-1 text-xs shadow-soft" sideOffset={6}>
                      <VoterList voters={vote?.dislikeVoters ?? []} empty="No dislikes yet" />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              </Tooltip.Provider>
              <button
                type="button"
                onClick={() => setShowComments((v) => !v)}
                className="inline-flex items-center gap-1 text-sm rounded-md px-1.5 py-0.5 hover:bg-[var(--color-bg)]"
              >
                <MessageSquare size={14} /> {comments.length}
              </button>
            </>
          )}
          <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
            {canEdit && !editing && (
              <button onClick={() => { setDraft(card.text ?? ""); setEditing(true); }} className="p-1 rounded hover:bg-[var(--color-bg)]" aria-label="Edit"><Pencil size={14} /></button>
            )}
            {canDelete && !editing && (
              <button onClick={deleteCard} className="p-1 rounded hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-900 dark:hover:text-red-200" aria-label="Delete"><Trash2 size={14} /></button>
            )}
          </div>
        </div>
      )}

      {editing && (
        <div className="mt-2 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          <Button size="sm" onClick={saveEdit}>Save</Button>
        </div>
      )}

      {showComments && !blurred && phase !== "writing" && (
        <div className="mt-3 border-t border-[var(--color-border)] pt-2">
          <Comments cardId={card.id} canComment={canComment} />
        </div>
      )}
    </div>
  );
}

function VoterList({ voters, empty }: { voters: Persona[]; empty: string }) {
  if (voters.length === 0) return <span className="text-zinc-300 dark:text-zinc-700">{empty}</span>;
  return (
    <div className="flex flex-col gap-0.5 min-w-32">
      {voters.map((v, i) => (
        <span key={i}>{v.name}</span>
      ))}
    </div>
  );
}
