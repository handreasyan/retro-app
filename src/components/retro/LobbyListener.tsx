"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { toast } from "@/components/Toast";

export function LobbyListener() {
  const router = useRouter();
  useEffect(() => {
    // Show any one-shot flash message left by the retro page (e.g. "Admin canceled the retro").
    try {
      const flash = sessionStorage.getItem("retro:flash");
      if (flash) {
        toast({ message: flash });
        sessionStorage.removeItem("retro:flash");
      }
    } catch { /* ignore */ }

    const sock = getSocket();
    if (!sock.connected) sock.connect();
    const refresh = () => router.refresh();
    sock.on("lobby.session_started", refresh);
    sock.on("lobby.session_ended", refresh);
    return () => {
      sock.off("lobby.session_started", refresh);
      sock.off("lobby.session_ended", refresh);
    };
  }, [router]);
  return null;
}
