"use client";
import { useState } from "react";
import { Card } from "./Card";
import { Button } from "@/components/Button";
import type { CardPayload } from "@/server/types";
import { getSocket } from "@/lib/socket";
import { useRetroStore } from "@/lib/retroStore";
import { ChevronDown } from "lucide-react";

export function ColumnView({
  title,
  tone,
  column,
  cards,
  readOnly,
}: {
  title: string;
  tone: "success" | "warning";
  column: "went_well" | "to_improve";
  cards: CardPayload[];
  readOnly: boolean;
}) {
  const [draft, setDraft] = useState("");
  // Defaults to open; the toggle only renders on mobile (`<sm`). On `sm+` the
  // body is forced visible regardless of state via responsive classes.
  const [collapsed, setCollapsed] = useState(false);
  const session = useRetroStore((s) => s.session);
  const me = useRetroStore((s) => s.myParticipantId);

  const writingPhase = session?.status === "writing";
  const isDoneWriting = useRetroStore((s) => s.participants.find((p) => p.id === me)?.isDoneWriting ?? false);
  const canAdd = writingPhase && !isDoneWriting && !readOnly;

  function submit() {
    const text = draft.trim();
    if (!text) return;
    getSocket().emit("card.create", { column, text });
    setDraft("");
  }

  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-3 flex flex-col gap-3 shadow-soft">
      <header className="flex items-center justify-between px-2">
        <h2 className={`text-sm font-semibold ${tone === "success" ? "text-[var(--color-success)]" : "text-[var(--color-warning)]"}`}>
          {title} · {cards.length}
        </h2>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="sm:hidden p-1 rounded hover:bg-[var(--color-bg)] text-[var(--color-muted)]"
          aria-label={collapsed ? "Expand" : "Collapse"}
        >
          <ChevronDown size={18} className={`transition-transform ${collapsed ? "-rotate-90" : ""}`} />
        </button>
      </header>
      <div className={`${collapsed ? "hidden" : "flex"} sm:flex flex-col gap-2 min-h-10`}>
        {cards.map((c) => (
          <Card key={c.id} card={c} readOnly={readOnly} />
        ))}
        {cards.length === 0 && (
          <div className="text-xs text-[var(--color-muted)] px-2 py-4 text-center">No cards yet.</div>
        )}
      </div>
      {canAdd && (
        <div className={`${collapsed ? "hidden" : "flex"} sm:flex flex-col gap-2 mt-auto pt-2 border-t border-[var(--color-border)]`}>
          <textarea
            value={draft}
            maxLength={500}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Add to ${title.toLowerCase()}...`}
            className="resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm h-20"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
          />
          <div className="flex justify-between items-center">
            <span className="text-xs text-[var(--color-muted)]">{draft.length}/500</span>
            <Button size="sm" onClick={submit} disabled={!draft.trim()}>Add</Button>
          </div>
        </div>
      )}
    </section>
  );
}
