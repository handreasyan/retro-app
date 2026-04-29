import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export async function GET() {
  return NextResponse.json({
    titlePrefillConfigured: !!(env.CLICKUP_API_TOKEN && env.CLICKUP_SPRINTS_FOLDER_ID),
    actionItemPushConfigured: !!(env.CLICKUP_API_TOKEN && env.CLICKUP_ACTION_ITEM_LIST_ID),
  });
}
