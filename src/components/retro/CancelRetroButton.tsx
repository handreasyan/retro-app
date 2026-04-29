"use client";
import { useState } from "react";
import { Button } from "@/components/Button";
import { toast } from "@/components/Toast";
import { useRetroStore } from "@/lib/retroStore";

export function CancelRetroButton() {
  const session = useRetroStore((s) => s.session);
  const me = useRetroStore((s) => s.participants.find((p) => p.id === s.myParticipantId));
  const [busy, setBusy] = useState(false);

  if (!session || me?.role !== "admin" || session.status === "closed") return null;

  async function cancel() {
    if (!confirm("Cancel this retro? It will be permanently deleted, not saved to past retros.")) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/sessions/${session!.id}`, { method: "DELETE" });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed to cancel");
      }
      try { sessionStorage.setItem("retro:flash", "Retro canceled."); } catch {}
      window.location.href = "/";
    } catch (e) {
      toast({ message: (e as Error).message, variant: "danger" });
      setBusy(false);
    }
  }

  return (
    <Button variant="danger" size="sm" onClick={cancel} disabled={busy}>
      {busy ? "Canceling..." : "Cancel retro"}
    </Button>
  );
}
