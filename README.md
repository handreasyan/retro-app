# Retro

Internal retrospective tool for Cloudchipr. See `PRD.md` for the product spec and `TECH_PLAN.md` for the architecture.

## Project status

| Area | State |
|---|---|
| Backend + real-time + database | Done. All 22 tasks from the original build plan complete. |
| Persona pool | 158 named personas, every entry has a real avatar in `public/avatars/`. |
| Frontend / responsive UI | Done. Mobile-friendly: columns collapse on small screens, picker fits narrow viewports. |
| Multi-user real-time | Wired end-to-end (Socket.IO rooms, presence, blur boundary, voting, comments, action items). |
| Demo deployment | Render (free Web Service) + Neon (free Postgres) from `handreasyan/retro-app`. See [Current demo deployment](#current-demo-deployment). |
| ClickUp integration | Code complete, no-ops without env vars. Will light up once SRE provides the four `CLICKUP_*` envs. |
| Production deploy | Pending. SRE-side. Needs DNS `retro.cloudchipr.com`, managed Postgres, ClickUp envs. |
| Mobile-native app | Out of scope. |

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 · Radix-based components · Drizzle ORM · PostgreSQL · Socket.IO · Tiptap.

A custom `server.ts` runs both the Next.js HTTP handler and Socket.IO on a single port.

## Features

- One active retro at a time. Anyone can join, anyone can claim the admin slot if it's free.
- Persona slot machine on join: pick from 158 named characters (Naruto, Iron Man, Cleopatra, Tony Soprano, ...) or stay anonymous. Locked for the session.
- Three columns: Went well, To improve, Action items.
- Writing phase blurs other authors' cards server-side until the admin opens the board (text never leaves the server).
- Voting phase: 3 likes / 3 dislikes per user, toggle on the same kind to clear, click the opposite kind to flip. Hover the like icon to see who voted. Cards stay in creation order during voting; sort by likes once everyone is done.
- Action items use a rich-text editor (bold, italic, underline, lists, color) and can be pushed to ClickUp as tasks (when configured).
- Real-time progress banner with avatars of who's done and who's still pending.
- Auto-prompt for admin: when everyone clicks "I'm done", a dialog asks the admin to advance.
- Admin identity is private. Even other participants don't see who has the admin slot.
- Light, dark, and system themes (per browser).
- Cancel retro from the landing page or the board (admin only). Hard-deletes the session and force-disconnects everyone with a redirect to landing.
- ClickUp integration for retro title prefill (last sprint name) and pushing action items as tasks. Both no-op gracefully without env vars.
- Lobby socket: the landing page updates live when retros start or end.

## Prerequisites

- Node 20+ (tested on 22)
- Docker (for the local Postgres container)

## First-time setup

```bash
cp .env.example .env
docker compose up -d              # Postgres on :5432
npm install
npm run db:migrate                # apply schema
npm run dev                       # http://localhost:3000
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the custom server (Next + Socket.IO) on :3000 |
| `npm run build` | Build Next.js for production |
| `npm start` | Run the production server (uses `tsx server.ts`) |
| `npm run db:generate` | Generate a new SQL migration from `src/db/schema.ts` |
| `npm run db:migrate` | Apply pending migrations to the database |
| `npm run db:push` | (Dev shortcut) push schema directly without a migration file |

## Environment variables

| Var | Notes |
|---|---|
| `DATABASE_URL` | Postgres connection string. Defaults to the docker-compose container. |
| `PORT` | HTTP port. Default `3000`. |
| `CLICKUP_API_TOKEN` | Optional. Without it, ClickUp features no-op gracefully. |
| `CLICKUP_SPRINTS_FOLDER_ID` | ClickUp Folder ID containing sprint Lists; used to prefill the retro title. |
| `CLICKUP_ACTION_ITEM_LIST_ID` | ClickUp List ID where action items are pushed. The Move-to-ClickUp button is hidden until both this and the token are set. |
| `CLICKUP_ACTION_ITEM_STATUS` | Optional. Initial status for pushed tasks. |

If you flip any ClickUp env on a running server, restart the dev process for the socket-side handlers to pick it up. Other env-reading code re-reads on every request.

## Browser storage

Almost nothing is persisted client-side:

- **`localStorage["retro:theme"]`**: `light` / `dark` / `system`. A global preference, kept across retros and sessions.
- **`sessionStorage["retro:flash"]`**: a single-shot toast message (e.g. "Admin canceled the retro") set just before redirecting to the landing page; cleared as soon as the landing page reads it.
- **`clientId` cookie**: a UUID issued by the server on first visit (httpOnly, 1-year). Lets the server recognize you across reconnects and pages. Not retro-specific.

No retro-specific data (personas, votes, comments) is cached locally. Everything renders from the server on each request.

## Persona images

Avatars live under `public/avatars/<slug>.<ext>`. The pool is defined in `src/lib/personas.ts`; each entry's `avatar` field is the exact filename so extensions can vary (`.jpg`, `.webp`, `.avif`, etc).

`personas-list.md` is the human-readable mirror of the pool. Add a new persona by:

1. Drop a square image into `public/avatars/<slug>.<ext>`.
2. Add a `{ slug, name, avatar, description }` entry to `src/lib/personas.ts`.
3. Restart the dev server so socket handlers pick up the new pool.

## Persona rotation

The slot machine prefers personas that have been used the least. While more than 80% of the pool sits at the lowest pick count, the picker only draws from those least-used entries. Once the floor empties out, it bumps to the next level. Computed live from the `participants` table on each `reserve` call.

## Mobile / desktop

The app is responsive: the three-column board collapses to a single column on small screens, the persona picker fits inside narrow viewports, and avatars/buttons remain tappable. That said, the team primarily runs retros from laptops, so layout polish trades off in that direction.

## Testing locally with multiple users

The product is multiplayer; you cannot exercise it from a single browser session. Open at least two distinct browser identities:

- **Window A**: regular Chrome window.
- **Window B**: Chrome incognito window, or a different browser (Safari/Firefox).

Each window has its own `clientId` cookie, which is what the server uses to identify a user.

A useful flow:

1. In Window A, click **Start new retro**, enter a title, you become admin and the persona picker appears. Roll the slot machine, click **Looks good, let me in**.
2. In Window B, refresh the landing page, click **Join retro**, pick a persona.
3. Switch between windows: type cards (other window sees blurred placeholders), click **I'm done** in both, then in the admin window click **Open the board** (or accept the auto-prompt).
4. Vote, comment, push action items.

## Deployment

Run as a single Node process. Sticky sessions are required if scaling beyond one instance (Socket.IO).

```bash
npm run build
NODE_ENV=production DATABASE_URL=... PORT=3000 npm start
```

### Current demo deployment

Live at: **https://retro-app-e584.onrender.com/**

The pre-launch demo is hosted free on a personal account so the team can try it before SRE wires the production version.

| Layer | Service | Plan | Notes |
|---|---|---|---|
| App (Next.js + Socket.IO) | Render Web Service | Free | Sleeps after 15 min idle, ~30-60 s cold start. Region: Ohio (US East). |
| Database | Neon Postgres | Free | 0.5 GB storage cap, autoscaling. Region: AWS US East 1 (N. Virginia). |
| Source | GitHub `handreasyan/retro-app` | Public | Render auto-redeploys on push to `main`. |

Render service settings:

- Runtime: Node
- Branch: `main`
- Build command: `npm install --include=dev && npm run build`
- Start command: `npm run db:migrate && npm start`
- Env vars: `DATABASE_URL` only (Neon connection string with `?sslmode=require`)

Once promoted to the production environment, the SRE-side version should:

- Build a static artifact (compile `server.ts` into `dist/`) so `tsx` is no longer a runtime dependency.
- Run on the company's normal Node infra with a managed Postgres.
- Be reachable at `retro.cloudchipr.com` via DNS.
- Have the four ClickUp env vars set so the title-prefill and action-item push features light up.

### Future: production target

DNS: `retro.cloudchipr.com` -> the container.
