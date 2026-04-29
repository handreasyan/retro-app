function required(name: string, fallback?: string) {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const env = {
  DATABASE_URL: required("DATABASE_URL", "postgres://retro:retro@localhost:5432/retro"),
  PORT: Number(process.env.PORT ?? 3000),
  NODE_ENV: process.env.NODE_ENV ?? "development",
  CLICKUP_API_TOKEN: process.env.CLICKUP_API_TOKEN ?? "",
  CLICKUP_SPRINTS_FOLDER_ID: process.env.CLICKUP_SPRINTS_FOLDER_ID ?? "",
  CLICKUP_ACTION_ITEM_LIST_ID: process.env.CLICKUP_ACTION_ITEM_LIST_ID ?? "",
  CLICKUP_ACTION_ITEM_STATUS: process.env.CLICKUP_ACTION_ITEM_STATUS ?? "",
};
