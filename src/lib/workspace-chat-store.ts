import {
  db,
  type WorkspaceChatMessage,
} from "@/lib/database";

export function summarizeWorkspaceChatTitle(message: string): string {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (!normalized) return "新对话";
  const firstSentence = normalized.split(/[。！？!?\n]/, 1)[0].trim();
  const candidate = firstSentence || normalized;
  return candidate.length > 22 ? `${candidate.slice(0, 22)}…` : candidate;
}

export async function createWorkspaceChat(): Promise<string> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.workspaceChats.add({
    id,
    title: "新对话",
    messages: [],
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function deleteWorkspaceChat(id: string): Promise<void> {
  await db.workspaceChats.delete(id);
}

export async function getOrCreateWorkspaceChat(
  preferredId?: string | null,
): Promise<string> {
  return db.transaction("rw", db.workspaceChats, async () => {
    if (preferredId && (await db.workspaceChats.get(preferredId))) {
      return preferredId;
    }
    const latest = await db.workspaceChats.orderBy("updatedAt").last();
    if (latest) return latest.id;
    const id = crypto.randomUUID();
    const now = Date.now();
    await db.workspaceChats.add({
      id,
      title: "新对话",
      messages: [],
      createdAt: now,
      updatedAt: now,
    });
    return id;
  });
}

export async function saveWorkspaceChatMessages(
  conversationId: string,
  messages: WorkspaceChatMessage[],
): Promise<boolean> {
  return db.transaction("rw", db.workspaceChats, async () => {
    const current = await db.workspaceChats.get(conversationId);
    if (!current) return false;
    const existingIds = new Set(current.messages.map((message) => message.id));
    const appended = messages.filter((message) => !existingIds.has(message.id));
    if (appended.length === 0) return true;
    const nextMessages = [...current.messages, ...appended];
    const firstUserMessage = nextMessages.find(
      (message) => message.role === "user",
    );
    await db.workspaceChats.update(conversationId, {
      title: firstUserMessage
        ? summarizeWorkspaceChatTitle(firstUserMessage.content)
        : current.title,
      messages: nextMessages,
      updatedAt: Date.now(),
    });
    return true;
  });
}
