import { NextResponse } from "next/server";
import { getActiveSession } from "@/lib/sessions";

export async function GET() {
  const session = await getActiveSession();
  return NextResponse.json({ session });
}
