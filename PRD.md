# Retro - Product Requirements

Internal retrospective tool. Replaces EasyRetro for our team. Anonymous participation, single active session at a time, admin-driven phases.

## Roles

> **Philosophy**: the team is flat. Admin is **not** a permission tier and not authority. It exists to make sure session-level, irreversible actions ("Start retro", "Open the board", "End retro") have a single owner, so two people don't click them simultaneously and so other users don't fire them by accident. Day-to-day contributions (cards, votes, comments, action items) are equal for everyone.

- **Participant**: writes cards, votes, comments, action items.
- **Admin**: everything a participant does, plus session-control buttons (start, advance phase, end) and unstuck overrides (edit/delete any card or comment, toggle anyone's "done" flag, force-disconnect a participant). "Force-disconnect" is not a ban: the disconnected user can rejoin freely with the same persona. Use case: clear a zombie connection. At most one admin connected per session, first-come basis. No password, no email check.

### Role switching rules

- Anyone can click "Change role" at any time.
- A participant can become admin only if the admin slot is currently free (no admin connected).
- The current admin can downgrade themselves to participant at any time, which frees the slot.
- **Admin drop**: when the admin's socket disconnects (close tab, lose network, browser crash), the slot frees instantly. Anyone connected can then click "I am admin" to claim it.
- **Admin return**: when the original admin reconnects, if the slot is still free they automatically regain admin. If someone else has already claimed it in the meantime, they return as a participant.
- The previous admin's session-control history (started the retro, advanced the phase, etc.) is preserved regardless of who currently holds the role.

## Identity (no accounts)

- On first visit, browser is assigned a stable `clientId` (UUID stored in `localStorage`).
- When the user joins a session, they go through a **persona picker** (see below) and either accept a slot-machine roll or choose to stay anonymous.
- The mapping `clientId -> persona` is stored server-side, scoped to a session. Named personas do not repeat within a session. They are reassigned (different) for the next session.
- Nicknames and avatars are public to everyone, always. Real identity is never stored or shown. Even the admin sees only personas.
- Reconnecting in the same session keeps the same persona and the same authored content.

### Persona picker flow

1. User clicks "Join" on the active retro and picks a role (Participant / Admin).
2. A dialog opens: **"Let's see who you are today..."**
3. A slot-machine animation cycles fast through random names + avatars (~1.5 seconds), then lands on a persona that the server has reserved for this client.
4. Two buttons appear:
   - **Repick** - server reserves a different persona; animation runs again. Unlimited repicks.
   - **Stay Anonymous** - swaps the user into the anonymous slot (see below) instead of a named persona.
5. A third button, **Looks good, let me in**, confirms the current persona and joins the retro.

### Anonymous personas

- "Stay Anonymous" assigns a generic persona: nickname `Anonymous 1`, `Anonymous 2`, ... numbered in join order within the session. Avatar is a single shared "mystery" icon (`public/avatars/_anonymous.png`) used for all anonymous users.
- Multiple anonymous users coexist; they look identical except for the trailing number.
- Backend treats anonymous personas as a separate kind: `persona_kind = 'named' | 'anonymous'`.

### Persona is locked for the session

Once the user clicks **Looks good, let me in** or **Stay Anonymous**, their persona is fixed for the entire session. No switching, no repicking, no "change avatar" later. They keep that exact persona on every reconnect until the retro is closed. The picker dialog is shown only once per (session, client).

### Persona pool (named)

A curated list of ~200 well-known characters drawn from:
- Comedy films (e.g. Borat, Ron Burgundy)
- Anime (e.g. Naruto, Goku, Sailor Moon)
- Cartoons (e.g. Shrek, Pikachu, SpongeBob)
- Cute/funny characters (e.g. DJ Bobol)
- Historical figures (e.g. Da Vinci, Einstein, Cleopatra, Julius Caesar, Genghis Khan)
- Mythological/iconic (e.g. Devil, Zeus)

Avatar images live in `public/avatars/<slug>.png`. Each pool entry has `{ slug, name, avatar }`. Images are provided by the user (Hakob); a generic placeholder is used for any missing image so the app never breaks on a missing file.

The shared anonymous icon at `public/avatars/_anonymous.png` is also provided by the user.

## Site Map

1. **Landing** (`/`): role picker (Participant / Admin), shows nickname once chosen, lists retros.
2. **Retro list**: one section for the active retro (if any) with a "Join" button, one section for past retros (read-only).
3. **Retro board** (`/r/:retroId`): three columns - Went Well, To Improve, Action Items (disabled).
4. **Past retro view**: same board UI, fully read-only, all controls disabled.

## Core Flow

### Pre-session

- User opens page, picks role.
- If no active retro: admin sees "Start new retro" button. Participants see "No active retro".
- If an active retro exists: "Start new retro" is hidden/disabled (only one at a time).
- "Start new retro" opens a small dialog with a **Title** input. Title is required, cannot be empty.
- **Title prefill**:
  - **v1**: a date range string, today minus 13 days through today, formatted as `YYYY-MM-DD - YYYY-MM-DD` (covers a 2-week sprint).
  - **Planned**: integrate with ClickUp. On dialog open, the server calls ClickUp and fetches the most recent sprint's name from our workspace; the input is prefilled with that name. Falls back to the date range if ClickUp is unreachable. See TECH_PLAN.md for integration details.
  - Admin can always edit the prefilled value before confirming.

### Writing phase

- Admin starts the retro. Status becomes `writing`.
- Users join, get a nickname, see the board.
- Three columns visible: Went Well, To Improve, Action Items. All three are usable.
- Each user can add cards in Went Well and To Improve.
- Authors can edit or delete their own cards at any time, in any phase (writing or voting). Deleting a card during voting cascade-removes its votes and comments. Comments authors can edit or delete their own comments at any time.
- Other users' cards are shown as one placeholder per card with the author's nickname and a blurred message body. Card counts are visible (you can tell Naruto wrote 3 cards). **Backend enforces blur**: card text is not sent to other clients until reveal.
- Each user sees the participant list with a "done" indicator next to each nickname.
- A user clicks "I'm done". They can un-click "I'm done" while still in writing phase to add more cards.
- A status banner is always visible at the top during the phase, showing progress:
  - While some users are still writing: `7 users are done, waiting for Naruto and Shrek...` (truncate after 3 names with "and N more").
  - When everyone is done: `Everyone is done`, plus the admin's "Open the board" button enabled.
- If a new user joins while everyone-else-is-done, the banner reverts to the in-progress form (they are not yet done).

### Reveal + voting phase

- Admin clicks "Open the board". Status becomes `voting`. Server sends full card content to all clients.
- Each user has a budget of **3 likes and 3 dislikes**, total across the whole board (assumed; see open question). Cannot vote on own cards.
- Comments are unlimited on any card, including the user's own. Comments are visible live to everyone (nickname + text).
- Cards auto-sort within each column by: `likes` desc, then `dislikes` asc, then creation time asc (tiebreak).
- Voting is **toggleable**: clicking the same like/dislike again removes the vote and refunds it to the user's budget. Clicking the opposite kind on a card the user already voted on flips their vote (still costs one slot of the new kind).
- Each user clicks "I'm done" when they finish voting. Same un-click rule as writing.
- Same progress banner as writing: `7 users are done, waiting for Naruto and Shrek...`, then `Everyone voted` once all are done. Admin clicks "End retro" to close.
- Phase rewind is not allowed. The admin cannot return from voting to writing. If a participant realizes they forgot a card, they have to either skip it or ask the admin to add it on their behalf and delete it later.

### Closed

- Status becomes `closed`. Retro moves to "Past retros".
- All controls (vote, comment, add card, click done) are disabled. Read-only forever.
- A new retro can be started.

## Voting rules

| Rule | Value |
|---|---|
| Likes per user per session | 3 (total, spread across up to 3 different cards) |
| Dislikes per user per session | 3 (total, spread across up to 3 different cards) |
| Votes per card per user | At most 1 (like OR dislike, not both, not multiple) |
| Votes a card can receive (total, across all users) | Unlimited |
| Vote on own card | Not allowed |
| Comments per user per card | Unlimited |
| Comments visible during voting | Yes, live |
| Sort | likes desc, dislikes asc, created asc |
| Voter visibility | Counts shown by default; hover the like/dislike icon to reveal voter personas |

## Admin powers (during a session)

In addition to phase control, the admin can override anything to keep the session unstuck:

- Edit or delete **any** card (not only their own).
- Edit or delete **any** comment.
- Toggle the "done" flag for any participant (e.g. force-mark a stuck/AFK user as done so the "everyone is done" banner can trigger).
- Force-disconnect a participant (boots their socket; their cards/votes/comments remain; they can rejoin with the same persona).
- End the retro at any phase, even if not everyone has voted.

Admin actions on other users' content are not silently masked; they are reflected in the live state everyone sees (e.g. card disappears for all). No special audit log in v1.

## Length limits

- Card text: 500 characters max.
- Comment text: 300 characters max.
- Retro title: 80 characters max.
- Nickname: assigned, not user-editable.

## Theme & visual style

- Light, dark, and system (follow OS) themes. Default: system.
- Theme is per-browser (stored in `localStorage`), not per-session.
- Visual style: clean, soft palette. No Cloudchipr branding. Restrained colors, generous spacing, subtle shadows.

## Search

- Past retros list has a simple text search over retro titles. No advanced filters in v1.

## Platform support

- v1 is desktop-only (Chrome, Firefox, Safari latest 2 versions). Mobile/tablet support deferred.

## Action Items

Action items are concrete to-dos that come out of the retro discussion. Unlike Went Well / To Improve cards (raw, anonymous opinions), action items are decisions the team commits to.

### Authoring

- "Add action item" button in the Action Items column.
- Clicking opens a **rich text editor** with: bold, italic, lists (bulleted/numbered), text color. (Library: Tiptap on top of ProseMirror; matches the look of editors users already know.)
- User writes the item, clicks "Done" to save. Editor closes. The button is shown again so they can add another.
- Each action item is its own card in the column.
- Authors can edit or delete their own action items anytime. Admin can edit or delete any.

### Visibility

- Action items are **always visible** to everyone the moment they are saved. No blur, no reveal phase. They are collaborative outcomes, not private opinions.
- Author nickname shown on each action item.

### Move to ClickUp

- A "Move to ClickUp" button at the bottom of the Action Items column pushes every action item in this retro to ClickUp as tasks.
- The exact ClickUp destination (workspace, space, list, statuses, assignees) is **TBD** - the user will specify when we get to implementation.
- After a successful push, the items are marked as "pushed" (visual badge, e.g. ClickUp icon) and the button becomes "Re-push to ClickUp" or is disabled (TBD).

### Rules

- **Who can add**: anyone in the session.
- **When**: anytime, during any phase (writing, voting, and even after the retro is closed? No - closed retros are read-only. Action items are addable during writing and voting).
- **Who can click "Move to ClickUp"**: anyone.
- **Push is one-way and one-shot**: the button pushes all action items that have not been pushed yet. Once an item has a `clickup_task_id`, it stays in ClickUp and is not re-synced if someone later edits its text in our app. Editing/deleting after push is allowed locally but does not propagate to ClickUp.
- **ClickUp destination details** (workspace, list/folder, default status, assignee policy, tag, custom fields): TBD - the user will specify when we implement this.

## Phase state machine

```
       admin starts                admin opens             admin ends
idle ----------------> writing ------------------> voting -----------> closed
                          ^                          ^
                          |                          |
                  un-click done             un-click done
                  while in phase            while in phase
```

The "Everyone is done" banner is a UI signal only. Phase advances only when the admin clicks the next-phase button.

## Past retros

- Visible to anyone hitting the site (assumption).
- Click to open: full board with cards, votes, comments, nicknames preserved.
- Every interaction disabled.

## Open questions / deferred

1. ~~**Vote budget scope**~~: resolved. 3 likes + 3 dislikes total per user per session. One vote per card per user. Cards have no cap on incoming votes.
2. ~~**Admin reclaim**~~: resolved. Slot frees on socket disconnect; anyone can claim. Original admin auto-regains if slot is still free on reconnect. See "Role switching rules".
3. ~~**Phase timeout**~~: resolved. Fully manual, no auto-advance.
4. ~~**Latecomer rule**~~: resolved. Joining mid-voting grants the full 3+3 vote budget.
5. ~~**Past retro access**~~: resolved. Anyone hitting the URL can read past retros.
6. ~~**Persona pool**~~: resolved. Curated ~200-entry list (comedy films, anime, cartoons, historical, mythological). Avatars provided by Hakob; placeholder for missing images.
7. **Export / summary**: deferred. Not in v1. May add Slack/Markdown export later if the team wants it.
8. ~~**Action items**~~: resolved. See "Action Items" section. ClickUp destination still TBD at implementation time.
9. ~~**Force-disconnect semantics**~~: resolved. Not a ban; user can rejoin with the same persona.
