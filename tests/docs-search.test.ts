import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createChatLunaDocsSearchIndex,
  loadChatLunaDocsSearchIndex,
  searchChatLunaDocs,
  tokenizeChatLunaDocs,
  type ChatLunaDocChunk,
  type ChatLunaDocsIndexPayload,
} from "../src/lib/docs-search.ts";

const INDEX_PATH = new URL(
  "../public/data/chatluna-doc-index.json",
  import.meta.url,
);

async function loadRealIndex() {
  const payload = JSON.parse(
    await readFile(INDEX_PATH, "utf8"),
  ) as ChatLunaDocsIndexPayload;
  return loadChatLunaDocsSearchIndex(payload.index);
}

test("tokenizes Chinese bigrams and preserves technical tokens", () => {
  const tokens = tokenizeChatLunaDocs("向量数据库 OpenAI qdrant/v1");
  assert.ok(tokens.includes("向量"));
  assert.ok(tokens.includes("数据"));
  assert.ok(tokens.includes("openai"));
  assert.ok(tokens.includes("qdrant/v1"));
  assert.ok(tokens.includes("qdrant"));
});

test("serializes and reloads a docs index", () => {
  const chunks: ChatLunaDocChunk[] = [
    {
      id: "openai",
      sourcePath: "docs/guide/configure-model-platform/openai.md",
      sourceCommit: "a".repeat(40),
      title: "OpenAI",
      heading: "配置",
      url: "https://chatluna.chat/guide/configure-model-platform/openai.html",
      provenanceUrl: "https://github.com/ChatLunaLab/doc/blob/commit/docs/openai.md",
      text: "填写 API key 并保存。",
    },
  ];
  const original = createChatLunaDocsSearchIndex(chunks);
  const restored = loadChatLunaDocsSearchIndex(original.toJSON());
  assert.equal(searchChatLunaDocs(restored, "OpenAI 配置")[0]?.id, "openai");
});

test("ranks official guide pages for common user intents", async () => {
  const index = await loadRealIndex();
  const cases = [
    ["怎么配置 OpenAI 模型", "docs/guide/configure-model-platform/openai.md"],
    ["向量数据库怎么配置", "docs/guide/configure-vector-database/introduction.md"],
    ["怎么写预设", "docs/guide/preset-system/write-preset.md"],
    ["长期记忆插件", "docs/ecosystem/plugin/long-term-memory.md"],
  ] as const;

  for (const [query, expectedPath] of cases) {
    const results = searchChatLunaDocs(index, query);
    assert.equal(results[0]?.sourcePath, expectedPath, query);
  }
});

test("returns no source for an absent technical entity", async () => {
  const index = await loadRealIndex();
  assert.deepEqual(searchChatLunaDocs(index, "qdrant"), []);
});
