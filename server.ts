import { config as loadEnv } from "dotenv";
loadEnv();

import { createServer } from "node:http";
import next from "next";
import { Server as IOServer } from "socket.io";
import { parse as parseCookies } from "cookie";
import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import { attachSocketHandlers } from "@/server/handlers";
import type { AppIO } from "@/server/types";
import { setIO } from "@/lib/io";

const dev = env.NODE_ENV !== "production";
const port = env.PORT;

const app = next({ dev });
const handle = app.getRequestHandler();

const httpServer = createServer((req, res) => {
  // ensure clientId cookie before Next handles the request
  const cookies = parseCookies(req.headers.cookie ?? "");
  if (!cookies["clientId"]) {
    const newId = randomUUID();
    res.setHeader(
      "Set-Cookie",
      `clientId=${newId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`
    );
    req.headers.cookie = (req.headers.cookie ? req.headers.cookie + "; " : "") + `clientId=${newId}`;
  }
  return handle(req, res);
});

const io: AppIO = new IOServer(httpServer, {
  cors: { origin: true, credentials: true },
});

io.use((socket, nextFn) => {
  const cookieHeader = socket.handshake.headers.cookie ?? "";
  const cookies = parseCookies(cookieHeader);
  const clientId = cookies["clientId"];
  if (!clientId) return nextFn(new Error("No clientId cookie"));
  socket.data.clientId = clientId;
  socket.data.sessionId = null;
  socket.data.participantId = null;
  nextFn();
});

setIO(io);
attachSocketHandlers(io);

app.prepare().then(() => {
  httpServer.listen(port, () => {
    console.log(`> Retro listening on http://localhost:${port}`);
  });
});
