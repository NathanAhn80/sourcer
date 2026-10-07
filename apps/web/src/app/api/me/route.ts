import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export async function GET(request: Request) {
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json({ error: { code: "unauthorized", message: "Invalid API key" } }, { status: 401 });
  }
  return NextResponse.json({
    data: { id: user.id, email: user.email, createdAt: user.createdAt },
  });
}
