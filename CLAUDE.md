@AGENTS.md

# Retro — Claude guide

Internal retrospective tool for Cloudchipr, prototyped solo. Replaces EasyRetro. This file is what a fresh Claude session needs to know before touching the code.

## What this is

A real-time, anonymous-persona retro board. One active retro at a time. Three columns (Went well, To improve, Action items). Two phases (writing → voting), an admin who clicks the irreversible buttons, and a slot-machine persona picker that hides who's who. See `PRD.md` for the full product spec and `TECH_PLAN.md` for the architecture rationale (both are "as-built" notes — the README is the operational truth).

## Where things live

| Path | What |
|---|---|
| `server.ts` | Custom Next.js server that also mounts Socket.IO on the same port. |
| `src/server/handlers.ts` | All Socket.IO event handlers. Long file, single source of real-time truth. |
| `src/server/types.ts` | Client↔server socket event shapes. |
| `src/server/state.ts` | Tiny in-memory presence tracker (who's connected). |
| `src/db/schema.ts` | Drizzle schema. Postgres dialect. |
| `src/db/migrations/` | Drizzle-generated SQL migrations. |
| `src/lib/sessions.ts`, `src/lib/personas-server.ts` | Server helpers used by both REST routes and socket handlers. |
| `src/lib/personas.ts` | The persona pool (slug + name + avatar path + description). |
| `src/lib/retroStore.ts` | Zustand store for the board page. |
| `src/lib/socket.ts` | Singleton socket.io-client instance. |
| `src/app/api/...` | REST endpoints: session start/get/end/delete, persona reserve/confirm/anonymous, ClickUp prefill + push. |
| `src/app/r/[id]/page.tsx` | Retro board page (server component, hands off to client `RetroBoard`). |
| `src/app/page.tsx` | Landing page (active retro + past retros + start dialog). |
| `src/components/retro/` | The UI: `Board`, `ColumnView`, `Card`, `Comments`, `ActionItemsColumn`, `RichEditor`, `RichView`, `PersonaPicker`, `ProgressBanner`, `RoleSwitcher`, `CancelRetroButton`, `LobbyListener`. |
| `public/avatars/` | One image per persona, plus `_anonymous.svg` and `_placeholder.svg` fallbacks. |
| `personas-list.md` | Human-readable mirror of `personas.ts`. |

## Stack at a glance

- Next.js 16 (App Router) + TypeScript, run via a custom `server.ts` so Socket.IO can share the port.
- Tailwind v4 + Radix primitives.
- Drizzle ORM + PostgreSQL.
- Socket.IO for real-time. Mutations are persisted to DB first, then broadcast to the retro room.
- Tiptap for the rich-text editor used in Action items.
- `tsx` to run the TS entry point.
- Zustand on the client for per-board state.

## How the real-time flow works

1. Client opens `/r/:id`. Server-rendered page checks if this `clientId` cookie has a participant row; if not, the `PersonaPicker` modal is shown.
2. Once confirmed, the page mounts `RetroBoard`, which fetches a full snapshot from `GET /api/sessions/:id` and connects the socket.
3. The socket emits `join { sessionId }`. Server places the socket in the room `retro:{sessionId}` and emits `presence.snapshot` to that user.
4. Any mutation event is handled in `handlers.ts`. The handler validates, writes to Postgres, then fans out via `io.to(room).emit(...)`.
5. The client reducer is the Zustand store in `retroStore.ts`. Socket events feed it; React renders.

Lobby (landing page) is a separate broadcast: every socket auto-joins `"lobby"` on connect, and the start/end APIs broadcast `lobby.session_started` / `lobby.session_ended` so the landing page can `router.refresh()`.

## Privacy boundaries (these matter)

Several things are intentionally kept secret from clients, with the server doing the filtering:

- **Other authors' card text during the writing phase.** Server emits two payload variants per `card.upserted`: the author socket gets full text, others get `{ text: null, richText: null, hasText: true }`.
- **Voter identities.** `vote.changed` ships counts only; `likeVoters` and `dislikeVoters` are always empty arrays. Same for the initial snapshot in `/api/sessions/:id`.
- **The admin's identity.** `presence.snapshot`, `role.changed`, and `/api/sessions/:id` redact `adminClientId` to `null` for non-admins. Other participants' `role` field is reported as `"participant"` to everyone except themselves.
- **Anonymous personas** are intentionally indistinguishable (same `_anonymous.svg` icon, only the trailing number differs).

If a change touches the network payloads or the participant list rendering, sanity-check that none of the above leaks back in.

## Conventions

- **Don't add backwards-compat shims**: rename / delete freely.
- **One-line imperative commit messages**, no Co-Authored-By.
- **Branch names use `_`, not `/`**, e.g. `add_discussed_toggle`.
- **Avoid emojis** in code, commits, and chat output.
- **Don't use em-dashes** in commits or file contents; use a comma or regular hyphen.
- **Do not push without an explicit ask**. Leave work committed but unpushed.
- **Don't change git config** without an ask.
- The `tsx server.ts` entry runs in both dev and prod. After dev edits to anything imported by `src/server/`, **restart the server** — tsx doesn't HMR the entry point. API routes and React components hot-reload normally.

## How to run it locally

```bash
docker compose up -d              # Postgres on :5432
npm install
npm run db:migrate                # apply schema
npm run dev                       # http://localhost:3000
```

To test the multiplayer flow you need at least two browser identities (normal + incognito). Each gets its own `clientId` cookie.

## When you're stuck

- For "what does the product do" → `PRD.md`
- For "why is the architecture this way" → `TECH_PLAN.md`
- For "what's actually deployed" → `README.md`
- For "what persona has avatar X" → `personas-list.md`
- For the live persona pool → `src/lib/personas.ts` (single source of truth)
