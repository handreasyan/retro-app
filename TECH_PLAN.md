# Retro - Technical Plan

Companion to `PRD.md`. Stack choices, data model, real-time approach, and the security boundary that keeps unrevealed cards hidden.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 15 (App Router) + TypeScript | Single framework, SSR for past retros, RSC for static parts |
| Styling | Tailwind + shadcn/ui | Fast, consistent, easy to theme |
| Realtime | Socket.IO over the same Next.js server (custom server) | One process to deploy, simple auth via `clientId` cookie, rooms per retro |
| DB | PostgreSQL | Standard, durable, fits the relational shape |
| ORM | Drizzle | Lighter than Prisma, type-safe, easy migrations |
| State on client | Zustand + Socket.IO event handlers | No need for heavy state libs |
| Hosting | Single Docker container (Next.js + Socket.IO + Postgres separate) | SRE deploys|

Alternatives considered: Convex (great DX, vendor lockin), Supabase (overkill, we don't need auth), Pusher/Ably (extra moving part for an internal tool).

## Architecture

```
Browser  <--HTTP-->  Next.js (RSC, REST routes for non-realtime ops)
   |                      |
   |<---WebSocket------>  Socket.IO server (same Node process, custom server.ts)
                          |
                          v
                       Postgres (Drizzle)
```

- One Node process serves both HTTP and WebSocket. No separate realtime service.
- Socket.IO rooms: one room per active retro (`retro:{id}`). Server is the source of truth for who is in the room.
- Postgres holds the durable record. Socket.IO is a fan-out layer; every state change is persisted before broadcast.

## Identity

- First request sets a `clientId` cookie (UUID, httpOnly, 1-year). Same `clientId` is also kept in `localStorage` as a fallback.
- A `client` row is created on first sight. No PII.
- Per session, a `participant` row links `clientId` to a session-scoped `nickname` and `role` (`participant` | `admin`).
- Reconnect logic: socket connects with `clientId` -> server looks up `participant` for the active session -> rejoins the room with the same nickname and same authored content.

## Data model (Drizzle)

```ts
sessions
  id uuid pk
  status enum('idle','writing','voting','closed')  // idle exists only conceptually; rows are created on start
  created_at, started_at, ended_at
  admin_client_id uuid fk -> clients.id nullable  // null when slot is free

clients
  id uuid pk
  created_at

participants
  id uuid pk
  session_id fk
  client_id fk
  persona_kind enum('named','anonymous')
  persona_slug text nullable          // set when persona_kind='named'; FK in spirit to personas.ts
  anonymous_number int nullable       // set when persona_kind='anonymous'; 1, 2, 3, ...
  role enum('participant','admin')
  is_done_writing bool default false
  is_done_voting bool default false
  joined_at
  unique(session_id, client_id)
  unique(session_id, persona_slug) where persona_kind='named'
  unique(session_id, anonymous_number) where persona_kind='anonymous'

persona_reservations  // ephemeral; rows live during the picker dialog only
  id uuid pk
  session_id fk
  client_id fk
  persona_slug text
  expires_at timestamp                // ~30s, refreshed on each repick
  unique(session_id, persona_slug)

cards
  id uuid pk
  session_id fk
  author_participant_id fk
  column enum('went_well','to_improve','action_item')
  text text                     // plain text for went_well / to_improve
  rich_text jsonb nullable      // Tiptap doc JSON for action_item; null for other columns
  pushed_to_clickup_at timestamp nullable  // for action items only
  clickup_task_id text nullable            // for action items only
  created_at
  updated_at
  deleted_at nullable

votes
  id uuid pk
  session_id fk
  card_id fk
  voter_participant_id fk
  kind enum('like','dislike')
  created_at
  unique(card_id, voter_participant_id)  // one vote per user per card; toggling like/dislike replaces

comments
  id uuid pk
  session_id fk
  card_id fk
  author_participant_id fk
  text text
  created_at
```

Constraints enforced in code:
- Vote insert checks `voter_participant_id != card.author_participant_id` (no self-vote).
- Vote insert checks the voter has fewer than 3 of that `kind` in this session.
- Card create allowed only when session is `writing`.
- Vote/comment create allowed only when session is `voting`.

## The blur boundary (critical)

Goal: while a session is in `writing`, no client can see another participant's card text, no matter how clever they are with devtools.

Rules enforced server-side:
- `GET /retro/:id` and the socket "join" event return cards with `text` only for the requesting participant's own cards. Other cards return `{ id, author_nickname, column, has_text: true }`.
- `card.created` and `card.updated` socket events broadcast only metadata to everyone except the author. The author gets the full text echoed back for confirmation.
- When the admin advances the session to `voting`, the server emits a `phase.changed` event followed by a `cards.revealed` event carrying the full card list with text. This is the only path that exposes text.
- Any attempt to fetch a single card by id during `writing` for a card the requester does not own returns `403`.

Frontend just renders what the server gives it: blurred boxes for placeholder rows, real text for full rows. The blur is cosmetic; the security is the absence of data.

## Real-time events

Server -> client (room-scoped):
- `participant.joined`, `participant.left`
- `participant.done_changed` (writing or voting flag flipped)
- `card.created`, `card.updated`, `card.deleted` (text omitted in writing phase for non-authors)
- `vote.changed` (card id, like count, dislike count, like_voters: persona[], dislike_voters: persona[]) - voter list always sent so the client can render the hover tooltip
- `comment.created`
- `phase.changed` (`writing` | `voting` | `closed`)
- `cards.revealed` (full cards, sent on writing -> voting transition)

Client -> server:
- `card.create`, `card.update`, `card.delete`
- `vote.cast` (like | dislike | clear)
- `comment.create`
- `done.set` (true | false)
- Admin only: `session.start`, `session.advance`, `session.end`
- `role.change` (claim admin or downgrade to participant)

### Admin slot logic

- `sessions.admin_client_id` is nullable. Null = slot free.
- Setting admin: server checks `admin_client_id IS NULL` and updates atomically. If race, the loser stays a participant and gets an error.
- Releasing admin: on the admin's socket `disconnect` event, server sets `admin_client_id = NULL` and broadcasts `role.changed` to the room so the "I am admin" button re-enables for everyone.
- Reconnect: when a `clientId` reconnects, if `admin_client_id IS NULL` and this client was the admin earlier in the session, server reassigns admin to them automatically.
- Manual downgrade: admin clicks "Change role" -> server sets `admin_client_id = NULL` and broadcasts.

## Sort

Sorting is client-side. Server returns cards in any order; clients sort by `likes` desc, `dislikes` asc, `created_at` asc on each `vote.changed`.

## Persona pool

- Hardcoded TS module: `src/lib/personas.ts` exports `personas: { slug: string; name: string; avatar: string }[]`.
- Avatars served from `public/avatars/<slug>.png`. Anonymous icon at `public/avatars/_anonymous.png`. Generic `public/avatars/_placeholder.png` for missing files (frontend `<img onError>` swap).
- The `participants` table stores `persona_slug` for named personas (not the full row), so future edits to names/images apply retroactively to past retros.

### Picker server flow (slot machine)

1. Client opens picker -> `POST /api/personas/reserve` with `{ sessionId, clientId }`.
2. Server picks a random persona that is **not** already in `participants` (committed) and **not** in `persona_reservations` (held by another picker). Inserts a `persona_reservations` row with `expires_at = now() + 30s`. Returns the persona to the client.
3. Client plays the slot-machine animation, the final cell is the reserved persona.
4. **Repick**: `POST /api/personas/reserve` again. Server deletes the previous reservation for this `(sessionId, clientId)` and creates a new one for a different persona. Idempotent.
5. **Stay Anonymous**: `POST /api/personas/anonymous` -> server allocates the next free `anonymous_number` for the session (`max(anonymous_number) + 1`, gap-filling first), creates the participant row, removes any reservation. Returns the participant.
6. **Confirm named**: `POST /api/personas/confirm` -> server promotes the reservation into a `participants` row atomically (insert + delete reservation in a transaction). Returns the participant.
7. Reservations expire after 30s if the user walks away mid-picker; a small cron sweeps expired rows. If a user holds a reservation longer than 30s and then clicks Confirm, server falls back to a fresh pick if the reservation has expired.

### Pool exhaustion

- Named pool of ~200 vs. team of ~10-20: exhaustion is essentially impossible. If it ever happens, server returns 409 from `reserve` and the dialog shows "All named personas are taken, please go anonymous". No numeric suffixes (keeps things clean).

## Past retros

- `/` lists past sessions ordered by `ended_at` desc.
- `/r/:id` for a closed session uses the same board component with a `readOnly` flag. All input handlers no-op.

## Deployment notes (for SRE)

- Single Docker image, Next.js with custom `server.ts` to mount Socket.IO.
- Postgres managed separately (RDS, CloudSQL).
- Env vars: `DATABASE_URL`, `PORT`, `COOKIE_SECRET`.
- Sticky sessions required if we ever scale beyond one instance (Socket.IO). For an internal tool of one team, one instance is fine.
- DNS:

## Action items

- Stored in the same `cards` table with `column='action_item'`.
- Body is rich text. We persist the **Tiptap JSON document** in `rich_text`, not HTML, so we can re-render and edit losslessly. We also denormalize a plain-text version into `text` for search and ClickUp titles.
- Editor: Tiptap with extensions: `StarterKit` (bold/italic/lists/headings), `Color`, `TextStyle`, `Underline`. No image/embed support in v1.
- Visibility: action items are **never blurred**. They bypass the writing-phase reveal logic. They are pushed live to all clients on create/update.
- Push to ClickUp:
  - Endpoint: `POST /api/integrations/clickup/push-action-items` body `{ retroId }`. Anyone in the session can call it.
  - Server fetches all action items for the retro that have `clickup_task_id IS NULL`, creates one ClickUp task per item, stores the returned `clickup_task_id` and `pushed_to_clickup_at`. Items already pushed are skipped.
  - Broadcasts updated cards over the socket so everyone sees the "pushed" badge.
  - Idempotency: the endpoint is safe to call repeatedly. Each item is pushed at most once. Editing or deleting an item after push does not propagate to ClickUp.
  - Destination (list ID, status, assignee, etc.) is TBD; left as env vars `CLICKUP_ACTION_ITEM_LIST_ID`, `CLICKUP_ACTION_ITEM_STATUS`, etc.

## ClickUp integration (title prefill)

Goal: when the admin opens the "Start new retro" dialog, prefill the title with the most recent sprint name from our ClickUp workspace.

### Approach

- **Server-side fetch only.** The ClickUp API token never leaves the backend. Frontend hits our own endpoint, backend talks to ClickUp.
- Endpoint: `GET /api/integrations/clickup/last-sprint` -> `{ name: string, startedAt: string, endedAt: string } | null`.
- Cached in memory for 60s to avoid hammering ClickUp on every dialog open.
- Falls back to a date-range string (today minus 13 days through today) if ClickUp returns nothing or errors.

### How "last sprint" is identified

ClickUp models sprints as **Lists** inside a "Sprints" Folder, each with `start_date` and `due_date` set. The most recent sprint = the list whose `due_date` is the largest value <= now.

Pseudocode:
```ts
const lists = await clickup.getLists(SPRINTS_FOLDER_ID); // GET /folder/{folder_id}/list
const completed = lists
  .filter(l => l.due_date && Number(l.due_date) <= Date.now())
  .sort((a, b) => Number(b.due_date) - Number(a.due_date));
return completed[0] ?? null;
```

### Configuration (env vars)

- `CLICKUP_API_TOKEN` - personal API token (or OAuth app token) with read access to the workspace.
- `CLICKUP_SPRINTS_FOLDER_ID` - the folder that contains sprint lists.
- `CLICKUP_TIMEOUT_MS` - default 3000.

> SRE will provide these. From the user, we need: ClickUp workspace name, sprints folder ID (or a screenshot of the folder layout so we can find the right one).

### Failure modes

- API down or 5xx -> log, return null, frontend shows the date-range fallback.
- Token invalid (401) -> log loudly, return null. The retro can still start, just without the auto-prefill.
- No completed sprints found -> return null, fallback.

## Open technical questions

1. Do we need an audit log of admin actions? Default: no.
2. Retention policy for past retros? Default: keep forever.
3. Migration tool: Drizzle Kit is the default; confirm SRE is OK running migrations on deploy.
4. Backup: standard Postgres backup, no app-level requirement.

## Build order (proposed)

1. Repo scaffold: Next.js + TS + Tailwind + shadcn/ui + Drizzle + Postgres in Docker Compose.
2. Identity: `clientId` cookie, `clients` table.
3. Session lifecycle: start, list, get. Admin claim logic.
4. Participant join: nickname assignment, participants table, real-time presence.
5. Writing phase: card CRUD, blur boundary, done toggling, "everyone done" banner.
6. Phase transition: admin advances to voting, `cards.revealed` event.
7. Voting phase: votes with budget enforcement, comments, live sort.
8. Close + past retros view.
9. Polish: empty states, error toasts, reconnection UX.
10. Action items (after spec is provided).
