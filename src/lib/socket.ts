"use client";
import { io, Socket } from "socket.io-client";
import type { ClientToServer, ServerToClient } from "@/server/types";

let socket: Socket<ServerToClient, ClientToServer> | null = null;

export function getSocket(): Socket<ServerToClient, ClientToServer> {
  if (!socket) {
    socket = io({
      autoConnect: true,
      withCredentials: true,
      transports: ["websocket", "polling"],
    });
  }
  return socket;
}
