import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// File-based store. Suffisant pour un déploiement single-instance / dev / Vercel
// (avec persistent storage activé). Pour multi-instance ou serverless stateless,
// remplacer par Upstash KV / Redis.

const STORE_DIR = path.join(process.cwd(), "data", "conversations");

export type StoredMessage = { role: "user" | "assistant"; content: string };

export type StoredConversation = {
  id: string;
  createdAt: number;
  messages: StoredMessage[];
  // Pré-extrait pour l'OG image et la page partagée (évite de re-parser).
  title: string;
  preview: string;
};

function ensureDir() {
  fs.mkdirSync(STORE_DIR, { recursive: true });
}

function genId(): string {
  // 9 chars base36 = ~46 bits d'entropie, suffisant pour partage.
  return crypto.randomBytes(6).toString("base64url").slice(0, 9);
}

export function saveConversation(messages: StoredMessage[]): StoredConversation {
  ensureDir();
  const firstUser = messages.find((m) => m.role === "user")?.content ?? "Conversation";
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")?.content ?? "";
  const stripMarkdown = (s: string): string =>
    s
      .replace(/<followups>[\s\S]*?<\/followups>/g, "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\|[^\n]*\|/g, "")
      .replace(/^\s*#{1,6}\s+/gm, "")
      .replace(/(\*\*|__)(.*?)\1/g, "$2")
      .replace(/(\*|_)(.*?)\1/g, "$2")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
  const conv: StoredConversation = {
    id: genId(),
    createdAt: Date.now(),
    messages: messages.slice(0, 30),
    title: firstUser.slice(0, 140).replace(/\s+/g, " ").trim(),
    preview: stripMarkdown(lastAssistant).slice(0, 280),
  };
  fs.writeFileSync(path.join(STORE_DIR, `${conv.id}.json`), JSON.stringify(conv));
  return conv;
}

export function loadConversation(id: string): StoredConversation | null {
  if (!/^[A-Za-z0-9_-]{6,12}$/.test(id)) return null;
  try {
    const raw = fs.readFileSync(path.join(STORE_DIR, `${id}.json`), "utf-8");
    return JSON.parse(raw) as StoredConversation;
  } catch {
    return null;
  }
}
