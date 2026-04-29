import { env } from "./env";

const CLICKUP_API = "https://api.clickup.com/api/v2";

type FetchOpts = { signal?: AbortSignal };

async function clickup<T>(path: string, init: RequestInit & FetchOpts = {}): Promise<T> {
  const res = await fetch(`${CLICKUP_API}${path}`, {
    ...init,
    headers: {
      "Authorization": env.CLICKUP_API_TOKEN,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ClickUp ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

let lastSprintCache: { value: { name: string; startedAt: string; endedAt: string } | null; at: number } | null = null;
const LAST_SPRINT_TTL_MS = 60_000;

export async function getLastSprint(): Promise<{ name: string; startedAt: string; endedAt: string } | null> {
  if (!env.CLICKUP_API_TOKEN || !env.CLICKUP_SPRINTS_FOLDER_ID) return null;
  if (lastSprintCache && Date.now() - lastSprintCache.at < LAST_SPRINT_TTL_MS) {
    return lastSprintCache.value;
  }
  try {
    type ListResp = { lists: Array<{ id: string; name: string; start_date?: string | null; due_date?: string | null }> };
    const data = await clickup<ListResp>(`/folder/${env.CLICKUP_SPRINTS_FOLDER_ID}/list`);
    const completed = data.lists
      .filter((l) => l.due_date && Number(l.due_date) <= Date.now())
      .sort((a, b) => Number(b.due_date) - Number(a.due_date));
    const top = completed[0];
    const value = top
      ? {
          name: top.name,
          startedAt: top.start_date ? new Date(Number(top.start_date)).toISOString() : "",
          endedAt: top.due_date ? new Date(Number(top.due_date)).toISOString() : "",
        }
      : null;
    lastSprintCache = { value, at: Date.now() };
    return value;
  } catch (err) {
    console.error("ClickUp last-sprint failed:", err);
    return null;
  }
}

export async function createTask(opts: { name: string; description?: string }): Promise<{ id: string } | null> {
  if (!env.CLICKUP_API_TOKEN || !env.CLICKUP_ACTION_ITEM_LIST_ID) return null;
  try {
    type CreateResp = { id: string };
    const body: Record<string, unknown> = { name: opts.name };
    if (opts.description) body.description = opts.description;
    if (env.CLICKUP_ACTION_ITEM_STATUS) body.status = env.CLICKUP_ACTION_ITEM_STATUS;
    const data = await clickup<CreateResp>(`/list/${env.CLICKUP_ACTION_ITEM_LIST_ID}/task`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return { id: data.id };
  } catch (err) {
    console.error("ClickUp create-task failed:", err);
    return null;
  }
}
