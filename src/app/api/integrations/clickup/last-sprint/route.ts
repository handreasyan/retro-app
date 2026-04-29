import { NextResponse } from "next/server";
import { getLastSprint } from "@/lib/clickup";
import { format, subDays } from "date-fns";

export async function GET() {
  const fromClickup = await getLastSprint();
  if (fromClickup) return NextResponse.json({ source: "clickup", ...fromClickup });
  const today = new Date();
  const start = subDays(today, 13);
  const fallbackName = `${format(start, "yyyy-MM-dd")} - ${format(today, "yyyy-MM-dd")}`;
  return NextResponse.json({
    source: "fallback",
    name: fallbackName,
    startedAt: start.toISOString(),
    endedAt: today.toISOString(),
  });
}
