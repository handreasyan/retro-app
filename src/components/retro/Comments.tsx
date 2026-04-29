"use client";
import { useMemo, useState } from "react";
import { PersonaAvatar } from "@/components/PersonaAvatar";
import { useRetroStore } from "@/lib/retroStore";
import { getSocket } from "@/lib/socket";
import { Trash2, Pencil } from "lucide-react";

export function Comments({ cardId, canComment }: { cardId: string; canComment: boolean }) {
  const allComments = useRetroStore((s) => s.comments);
  const comments = useMemo(() => allComments.filter((c) => c.cardId === cardId), [allComments, cardId]);
  const me = useRetroStore((s) => s.participants.find((p) => p.id === s.myParticipantId));
  const myParticipantId = useRetroStore((s) => s.myParticipantId);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  function submit() {
    const text = draft.trim();
    if (!text) return;
    getSocket().emit("comment.create", { cardId, text });
    setDraft("");
  }
  function startEdit(id: string, text: string) {
    setEditingId(id);
    setEditDraft(text);
  }
  function saveEdit() {
    if (!editingId) return;
    getSocket().emit("comment.update", { id: editingId, text: editDraft });
    setEditingId(null);
  }
  function deleteComment(id: string) {
    getSocket().emit("comment.delete", { id });
  }

  return (
    <div className="space-y-2">
      {comments.map((c) => {
        const isMine = c.authorParticipantId === myParticipantId;
        const canMutate = isMine || me?.role === "admin";
        return (
          <div key={c.id} className="flex items-start gap-2">
            <PersonaAvatar persona={c.authorPersona} size={20} />
            <div className="flex-1 text-sm">
              <div className="text-xs text-[var(--color-muted)]">{c.authorPersona.name}</div>
              {editingId === c.id ? (
                <div className="flex flex-col gap-1">
                  <input
                    value={editDraft}
                    maxLength={300}
                    onChange={(e) => setEditDraft(e.target.value)}
                    className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm"
                  />
                  <div className="flex gap-2 justify-end">
                    <button className="text-xs text-[var(--color-muted)]" onClick={() => setEditingId(null)}>Cancel</button>
                    <button className="text-xs text-[var(--color-primary)]" onClick={saveEdit}>Save</button>
                  </div>
                </div>
              ) : (
                <p className="whitespace-pre-wrap break-words">{c.text}</p>
              )}
            </div>
            {canMutate && editingId !== c.id && (
              <div className="flex gap-1 text-[var(--color-muted)] opacity-0 group-hover:opacity-100">
                <button onClick={() => startEdit(c.id, c.text)} className="p-1 rounded hover:bg-[var(--color-bg)]" aria-label="Edit comment"><Pencil size={12} /></button>
                <button onClick={() => deleteComment(c.id)} className="p-1 rounded hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-900 dark:hover:text-red-200" aria-label="Delete comment"><Trash2 size={12} /></button>
              </div>
            )}
          </div>
        );
      })}
      {canComment && (
        <div className="flex gap-2">
          <input
            value={draft}
            maxLength={300}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a comment..."
            className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm"
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <button onClick={submit} disabled={!draft.trim()} className="text-xs text-[var(--color-primary)] disabled:opacity-50">Post</button>
        </div>
      )}
    </div>
  );
}
