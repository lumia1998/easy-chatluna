import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test from "node:test";
import { db } from "../src/lib/database.ts";
import {
  createWorkspaceChat,
  deleteWorkspaceChat,
  getOrCreateWorkspaceChat,
  saveWorkspaceChatMessages,
  summarizeWorkspaceChatTitle,
} from "../src/lib/workspace-chat-store.ts";

test("summarizes workspace chat titles deterministically", () => {
  assert.equal(
    summarizeWorkspaceChatTitle("  如何配置向量数据库并启用长期记忆？请给步骤。  "),
    "如何配置向量数据库并启用长期记忆",
  );
  assert.equal(
    summarizeWorkspaceChatTitle("这是一个超过二十二个字符并且没有句号的长问题标题示例"),
    "这是一个超过二十二个字符并且没有句号的长问题…",
  );
});

test("appends concurrent messages and never recreates a deleted chat", async () => {
  await db.delete();
  await db.open();
  const id = await createWorkspaceChat();
  await Promise.all([
    saveWorkspaceChatMessages(id, [
      { id: "user-1", role: "user", content: "第一条消息" },
    ]),
    saveWorkspaceChatMessages(id, [
      { id: "assistant-1", role: "assistant", content: "第一条回答" },
    ]),
  ]);
  const stored = await db.workspaceChats.get(id);
  assert.deepEqual(
    new Set(stored?.messages.map((message) => message.id)),
    new Set(["user-1", "assistant-1"]),
  );

  await deleteWorkspaceChat(id);
  assert.equal(
    await saveWorkspaceChatMessages(id, [
      { id: "late", role: "assistant", content: "迟到回答" },
    ]),
    false,
  );
  assert.equal(await db.workspaceChats.get(id), undefined);
  await db.delete();
});

test("restores the explicitly selected conversation when it still exists", async () => {
  await db.delete();
  await db.open();
  const selectedId = await createWorkspaceChat();
  await createWorkspaceChat();
  assert.equal(await getOrCreateWorkspaceChat(selectedId), selectedId);
  await db.delete();
});
