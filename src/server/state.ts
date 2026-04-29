// In-memory presence: which clientIds currently have a live socket per session.
// Source of truth for "is admin slot connected right now".
const sessionToClients = new Map<string, Set<string>>();
const clientToSockets = new Map<string, Set<string>>();

export function trackConnection(sessionId: string, clientId: string, socketId: string) {
  let setC = sessionToClients.get(sessionId);
  if (!setC) {
    setC = new Set();
    sessionToClients.set(sessionId, setC);
  }
  setC.add(clientId);
  let setS = clientToSockets.get(clientId);
  if (!setS) {
    setS = new Set();
    clientToSockets.set(clientId, setS);
  }
  setS.add(socketId);
}

export function untrackConnection(sessionId: string, clientId: string, socketId: string): { stillConnected: boolean } {
  const sockets = clientToSockets.get(clientId);
  sockets?.delete(socketId);
  const stillConnected = !!sockets && sockets.size > 0;
  if (!stillConnected) {
    sessionToClients.get(sessionId)?.delete(clientId);
    clientToSockets.delete(clientId);
  }
  return { stillConnected };
}

export function isClientConnected(clientId: string): boolean {
  const set = clientToSockets.get(clientId);
  return !!set && set.size > 0;
}

export function connectedClientsForSession(sessionId: string): Set<string> {
  return sessionToClients.get(sessionId) ?? new Set();
}
