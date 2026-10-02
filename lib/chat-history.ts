import type { ChatMessage } from "@/lib/providers";

export const CHAT_ARCHIVES_STORAGE_KEY = "xiaoman-chat-archives-v1";

export type ChatArchive = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
};

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<ChatMessage>;
  return (message.role === "user" || message.role === "assistant") && typeof message.content === "string";
}

function isChatArchive(value: unknown): value is ChatArchive {
  if (!value || typeof value !== "object") return false;
  const archive = value as Partial<ChatArchive>;
  return typeof archive.id === "string"
    && typeof archive.title === "string"
    && typeof archive.createdAt === "string"
    && typeof archive.updatedAt === "string"
    && Array.isArray(archive.messages)
    && archive.messages.every(isChatMessage);
}

export function readChatArchives(): ChatArchive[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CHAT_ARCHIVES_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isChatArchive).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } catch {
    return [];
  }
}

export function writeChatArchives(archives: ChatArchive[]): ChatArchive[] {
  const next = [...archives].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  if (typeof window === "undefined") return next;
  try {
    window.localStorage.setItem(CHAT_ARCHIVES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private browsing or a full storage quota should not interrupt the conversation.
  }
  return next;
}

export function upsertChatArchive(archive: ChatArchive): ChatArchive[] {
  const current = readChatArchives();
  const next = current.some((item) => item.id === archive.id)
    ? current.map((item) => item.id === archive.id ? archive : item)
    : [archive, ...current];
  return writeChatArchives(next);
}
