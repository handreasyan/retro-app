"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { useRetroStore } from "@/lib/retroStore";
import { getSocket } from "@/lib/socket";
import type { CardPayload } from "@/server/types";
import { PersonaAvatar } from "@/components/PersonaAvatar";
import { Trash2, Pencil, Send } from "lucide-react";
import { RichEditor } from "./RichEditor";
import { RichView } from "./RichView";
import { toast } from "@/components/Toast";

export function ActionItemsColumn({ cards, readOnly }: { cards: CardPayload[]; readOnly: boolean }) {
  const session = useRetroStore((s) => s.session);
  const me = useRetroStore((s) => s.participants.find((p) => p.id === s.myParticipantId));
  const myParticipantId = useRetroStore((s) => s.myParticipantId);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [draftRich, setDraftRich] = useState<unknown>(null);
  const [pushing, setPushing] = useState(false);
  const [clickupAvailable, setClickupAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch("/api/integrations/clickup/status");
        if (!r.ok) return;
        const d = await r.json();
        if (!cancelled) setClickupAvailable(!!d.actionItemPushConfigured);
      } catch { /* leave disabled */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const phaseAllowsAdd = session?.status !== "closed";
  const canAdd = !readOnly && phaseAllowsAdd;

  function reset() {
    setDraftText("");
    setDraftRich(null);
    setAdding(false);
    setEditingId(null);
  }

  function submit() {
    const trimmed = draftText.trim();
    if (!trimmed) return;
    if (editingId) {
      getSocket().emit("card.update", { id: editingId, text: trimmed, richText: draftRich });
    } else {
      getSocket().emit("card.create", { column: "action_item", text: trimmed, richText: draftRich });
    }
    reset();
  }

  function startEdit(card: CardPayload) {
    setEditingId(card.id);
    setDraftText(card.text ?? "");
    setDraftRich(card.richText);
    setAdding(true);
  }

  function deleteCard(id: string) {
    if (!confirm("Delete this action item?")) return;
    getSocket().emit("card.delete", { id });
  }

  async function pushToClickup() {
    if (!session) return;
    setPushing(true);
    try {
      const r = await fetch("/api/integrations/clickup/push-action-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retroId: session.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed to push");
      const ok = d.results.filter((x: { clickupTaskId: string | null }) => x.clickupTaskId).length;
      const fail = d.results.length - ok;
      if (fail) toast({ message: `Pushed ${ok}, ${fail} failed`, variant: "danger" });
      else if (ok) toast({ message: `Pushed ${ok} action items to ClickUp`, variant: "success" });
      else toast({ message: "Nothing to push (already in ClickUp)" });
    } catch (e) {
      toast({ message: (e as Error).message, variant: "danger" });
    } finally {
      setPushing(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-3 flex flex-col gap-3 shadow-soft lg:min-h-0 lg:overflow-hidden">
      <header className="flex items-center justify-between px-2 shrink-0">
        <h2 className="text-sm font-semibold text-[var(--color-primary)]">Action items · {cards.length}</h2>
      </header>
      <div className="flex flex-col gap-2 min-h-10 lg:flex-1 lg:overflow-y-auto lg:min-h-0 pr-1">
        {cards.map((c) => {
          const isMine = c.authorParticipantId === myParticipantId;
          const canMutate = !readOnly && (isMine || me?.role === "admin") && session?.status !== "closed";
          return (
            <div key={c.id} className="rounded-xl bg-[var(--color-card)] border border-[var(--color-border)] p-3 group">
              <div className="flex items-center gap-2">
                <PersonaAvatar persona={c.authorPersona} size={20} />
                <span className="text-xs text-[var(--color-muted)]">{c.authorPersona.name}</span>
                {c.pushedToClickup && (
                  <span className="ml-auto text-[10px] uppercase tracking-wide bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded px-1.5 py-0.5">In ClickUp</span>
                )}
              </div>
              <div className="mt-2 text-sm">
                <RichView doc={c.richText} fallbackText={c.text} />
              </div>
              {canMutate && (
                <div className="mt-2 flex justify-end gap-1 text-[var(--color-muted)] opacity-0 group-hover:opacity-100">
                  <button onClick={() => startEdit(c)} className="p-1 rounded hover:bg-[var(--color-bg)]" aria-label="Edit"><Pencil size={14} /></button>
                  <button onClick={() => deleteCard(c.id)} className="p-1 rounded hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-900 dark:hover:text-red-200" aria-label="Delete"><Trash2 size={14} /></button>
                </div>
              )}
            </div>
          );
        })}
        {cards.length === 0 && (
          <div className="text-xs text-[var(--color-muted)] px-2 py-4 text-center">No action items yet.</div>
        )}
      </div>
      {canAdd && (
        adding ? (
          <div className="flex flex-col gap-2 mt-auto pt-2 border-t border-[var(--color-border)] shrink-0">
            <RichEditor
              text={draftText}
              richText={draftRich}
              onChange={(text, rich) => { setDraftText(text); setDraftRich(rich); }}
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={reset}>Cancel</Button>
              <Button size="sm" onClick={submit} disabled={!draftText.trim()}>{editingId ? "Save" : "Done"}</Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setAdding(true)}>+ Add action item</Button>
        )
      )}
      {!readOnly && cards.length > 0 && clickupAvailable && (
        <Button variant="outline" onClick={pushToClickup} disabled={pushing}>
          <Send size={14} /> {pushing ? "Pushing..." : "Move to ClickUp"}
        </Button>
      )}
    </section>
  );
}

