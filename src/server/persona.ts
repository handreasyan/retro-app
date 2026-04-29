import { ANONYMOUS_AVATAR, avatarFor, personaBySlug } from "@/lib/personas";
import type { Persona } from "@/server/types";
import type { participants } from "@/db/schema";

export function buildPersona(p: typeof participants.$inferSelect): Persona {
  if (p.personaKind === "anonymous") {
    return {
      kind: "anonymous",
      slug: null,
      name: `Anonymous ${p.anonymousNumber ?? 0}`,
      avatar: ANONYMOUS_AVATAR,
      anonymousNumber: p.anonymousNumber,
    };
  }
  const entry = p.personaSlug ? personaBySlug(p.personaSlug) : undefined;
  return {
    kind: "named",
    slug: p.personaSlug,
    name: entry?.name ?? p.personaSlug ?? "Unknown",
    avatar: avatarFor(p.personaSlug),
    anonymousNumber: null,
  };
}
