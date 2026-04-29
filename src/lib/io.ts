import type { AppIO } from "@/server/types";

declare global {
  // eslint-disable-next-line no-var
  var __retroIO: AppIO | undefined;
}

export function setIO(io: AppIO) {
  globalThis.__retroIO = io;
}

export function getIO(): AppIO | undefined {
  return globalThis.__retroIO;
}
