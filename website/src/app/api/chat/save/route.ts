import { NextResponse } from "next/server";
import { saveConversation, type StoredMessage } from "@/lib/chat/store";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { messages?: StoredMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const messages = body.messages ?? [];
  if (!messages.length) return NextResponse.json({ error: "empty" }, { status: 400 });
  if (messages.length > 30) return NextResponse.json({ error: "too long" }, { status: 400 });
  for (const m of messages) {
    if (!["user", "assistant"].includes(m.role) || typeof m.content !== "string" || m.content.length > 8000) {
      return NextResponse.json({ error: "invalid message" }, { status: 400 });
    }
  }
  const conv = saveConversation(messages);
  return NextResponse.json({ id: conv.id, url: `/chat/c/${conv.id}` });
}
