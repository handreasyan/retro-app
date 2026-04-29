"use client";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { PersonaAvatar } from "@/components/PersonaAvatar";
import { Button } from "@/components/Button";
import type { Persona } from "@/server/types";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/Dialog";
import { toast } from "@/components/Toast";
import { ANONYMOUS_AVATAR, personaPool, avatarFor } from "@/lib/personas";

type Reserved = { slug: string; name: string; avatar: string; expiresAt: string };

type Props = {
  open: boolean;
  sessionId: string;
  onConfirmed: () => void;
  onClose: () => void;
};

export function PersonaPicker({ open, sessionId, onConfirmed, onClose }: Props) {
  const [reservation, setReservation] = useState<Reserved | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [reelIndex, setReelIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<"participant" | "admin">("participant");
  const [adminAvailable, setAdminAvailable] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!open) return;
    void roll();
    void checkAdminAvailable();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function checkAdminAvailable() {
    const r = await fetch(`/api/sessions/${sessionId}`);
    if (!r.ok) return;
    const d = await safeJson(r);
    if (!d) return;
    setAdminAvailable(!!d.adminSlotAvailableForMe);
    if (d.session?.adminClientId && d.session.adminClientId === d.currentClientId) {
      setRole("admin");
    }
  }

  function startReel() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setSpinning(true);
    intervalRef.current = setInterval(() => {
      setReelIndex((i) => (i + 1) % personaPool.length);
    }, 70);
  }
  function stopReel() {
    setSpinning(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  async function roll() {
    startReel();
    try {
      // Try once, retry once if the body comes back empty (Next dev can do this during HMR).
      let data: { reservation?: { slug: string; name: string; avatar: string; expiresAt: string }; error?: string } | null = null;
      let lastStatus = 0;
      for (let attempt = 0; attempt < 2 && !data; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 250));
        const res = await fetch("/api/personas/reserve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        lastStatus = res.status;
        data = await safeJson(res);
      }
      if (!data) throw new Error(`Server returned an empty response (status ${lastStatus}). Click Repick.`);
      if (lastStatus >= 400) throw new Error(data.error ?? "Failed to reserve");
      if (!data.reservation) throw new Error("No reservation in response");
      const reservation = data.reservation;
      setTimeout(() => {
        stopReel();
        setReservation(reservation);
      }, 1500);
    } catch (e) {
      stopReel();
      toast({ message: (e as Error).message, variant: "danger" });
    }
  }

  async function confirm() {
    if (!reservation) return;
    setBusy(true);
    try {
      const res = await fetch("/api/personas/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, role }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error ?? "Failed to confirm");
      onConfirmed();
    } catch (e) {
      toast({ message: (e as Error).message, variant: "danger" });
    } finally {
      setBusy(false);
    }
  }

  async function joinAnonymous() {
    setBusy(true);
    try {
      const res = await fetch("/api/personas/anonymous", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, role }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error ?? "Failed to join");
      onConfirmed();
    } catch (e) {
      toast({ message: (e as Error).message, variant: "danger" });
    } finally {
      setBusy(false);
    }
  }

  async function safeJson(res: Response): Promise<any> {
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  const reelEntry = personaPool[reelIndex];
  const display = spinning
    ? { name: reelEntry.name, avatar: avatarFor(reelEntry.slug) }
    : reservation
    ? { name: reservation.name, avatar: reservation.avatar }
    : { name: "...", avatar: ANONYMOUS_AVATAR };

  // Build a Persona for the hover card once the reel has landed.
  const landedPersona: Persona | null = !spinning && reservation
    ? {
        kind: "named",
        slug: reservation.slug,
        name: reservation.name,
        avatar: reservation.avatar,
        anonymousNumber: null,
      }
    : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogTitle>Let&apos;s see who you are today</DialogTitle>
        <DialogDescription>Spin the reel, or stay anonymous.</DialogDescription>

        <div className="mt-6 flex flex-col items-center gap-3">
          {landedPersona ? (
            <PersonaAvatar persona={landedPersona} size={96} />
          ) : (
            <Avatar src={display.avatar} alt={display.name} size={96} className={spinning ? "opacity-90 transition" : ""} />
          )}
          <div className="text-2xl font-semibold tracking-tight">{display.name}</div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2 rounded-lg border border-[var(--color-border)] p-1 text-sm">
          <button
            type="button"
            onClick={() => setRole("participant")}
            className={`rounded-md px-3 py-2 ${role === "participant" ? "bg-[var(--color-bg)] font-semibold" : "text-[var(--color-muted)]"}`}
          >
            Participant
          </button>
          <button
            type="button"
            onClick={() => adminAvailable && setRole("admin")}
            disabled={!adminAvailable}
            className={`rounded-md px-3 py-2 ${role === "admin" ? "bg-[var(--color-bg)] font-semibold" : "text-[var(--color-muted)]"} disabled:opacity-50 disabled:cursor-not-allowed`}
            title={adminAvailable ? "" : "Admin slot is currently taken"}
          >
            Admin
          </button>
        </div>

        <div className="mt-6 flex flex-wrap gap-2 sm:justify-end">
          <Button variant="ghost" onClick={joinAnonymous} disabled={busy || spinning} className="flex-1 sm:flex-none">Stay anonymous</Button>
          <Button variant="secondary" onClick={roll} disabled={busy || spinning} className="flex-1 sm:flex-none">Repick</Button>
          <Button onClick={confirm} disabled={busy || spinning || !reservation} className="flex-1 sm:flex-none">
            Looks good, let me in
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
