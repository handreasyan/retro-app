"use client";
import { useRetroStore } from "@/lib/retroStore";
import { Button } from "@/components/Button";
import { HelpTooltip } from "@/components/Tooltip";
import { getSocket } from "@/lib/socket";
import { Crown, User } from "lucide-react";

export function RoleSwitcher() {
  const participants = useRetroStore((s) => s.participants);
  const myParticipantId = useRetroStore((s) => s.myParticipantId);
  const adminSlotTaken = useRetroStore((s) => s.adminSlotTaken);
  const me = participants.find((p) => p.id === myParticipantId);
  const isAdmin = me?.role === "admin";

  if (!me) return null;

  if (isAdmin) {
    return (
      <HelpTooltip text="You are the admin. Stepping down will free the spot so any other user can claim it.">
        <Button variant="secondary" size="sm" onClick={() => getSocket().emit("role.release", {})}>
          <Crown size={14} /> Step down
        </Button>
      </HelpTooltip>
    );
  }

  // Disabled when someone else holds the slot (we don't reveal who).
  const canClaim = !adminSlotTaken;
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={!canClaim}
      title={canClaim ? "" : "Admin slot is taken"}
      onClick={() => canClaim && getSocket().emit("role.claim", {})}
    >
      <User size={14} /> Become admin
    </Button>
  );
}
