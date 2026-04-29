"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { toast } from "@/components/Toast";

export function ActiveRetroAdminControls({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function cancelRetro() {
    if (!confirm("Cancel this retro? It will be permanently deleted, not saved to past retros.")) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed to cancel");
      }
      router.refresh();
    } catch (e) {
      toast({ message: (e as Error).message, variant: "danger" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="danger" size="md" onClick={cancelRetro} disabled={busy}>
      {busy ? "Canceling..." : "Cancel retro"}
    </Button>
  );
}
