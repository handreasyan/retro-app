"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose } from "@/components/Dialog";
import { Button } from "@/components/Button";
import { toast } from "@/components/Toast";

export function StartRetroButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/integrations/clickup/last-sprint");
        const d = await r.json();
        if (!cancelled) setTitle(d.name);
      } catch { /* keep empty */ }
    })();
    return () => { cancelled = true; };
  }, [open]);

  async function submit() {
    if (!title.trim()) {
      toast({ message: "Please enter a title", variant: "danger" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, asAdmin: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start");
      router.push(`/r/${data.session.id}`);
    } catch (e) {
      toast({ message: (e as Error).message, variant: "danger" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>Start new retro</Button>
      <DialogContent>
        <DialogTitle>Start a new retro</DialogTitle>
        <DialogDescription>You will be the admin for this session.</DialogDescription>
        <div className="mt-4 space-y-3">
          <label className="block text-sm font-medium">Title</label>
          <input
            autoFocus
            type="text"
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Sprint Apr 15 - Apr 28"
            className="w-full h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 text-sm"
          />
          <p className="text-xs text-[var(--color-muted)]">
            Prefilled from the last ClickUp sprint, or a 2-week range as fallback. Edit freely.
          </p>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button onClick={submit} disabled={loading}>
            {loading ? "Starting..." : "Start retro"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
