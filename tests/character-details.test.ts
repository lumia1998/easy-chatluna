import assert from "node:assert/strict";
import test from "node:test";
import {
  appendPreservedRoleDraft,
  buildPreservedRoleDraftBlock,
  createEmptyAIRoleDraft,
  insertPreservedRoleDraftPrompt,
  toAIRoleDraftFields,
} from "../src/lib/ai/character-details.ts";

test("preserves user-authored role fields verbatim", () => {
  const draft = {
    ...createEmptyAIRoleDraft(),
    personality: "  外冷内热，不要替我改标点。  ",
    hobbies: "写代码\n听音乐",
    chat_behavior: "只在被点名时回复；\n不要主动总结。",
  };

  const block = buildPreservedRoleDraftBlock(draft);

  assert.ok(block.includes(draft.personality));
  assert.ok(block.includes(draft.hobbies));
  assert.ok(block.includes(draft.chat_behavior));
  assert.ok(!block.includes("角色描述:"));
});

test("appends the immutable role block without changing generated system text", () => {
  const draft = {
    ...createEmptyAIRoleDraft(),
    personality: "保留我的原句",
  };
  const generatedSystem = "模型生成的格式与运行规则。  ";

  const result = appendPreservedRoleDraft(generatedSystem, draft);

  assert.ok(result.startsWith(generatedSystem.trimEnd()));
  assert.ok(result.includes("性格:\n保留我的原句"));
});

test("normalizes missing role fields without changing supplied values", () => {
  const normalized = toAIRoleDraftFields({
    hobbies: "原样兴趣",
    chat_behavior: "原样行为",
  });

  assert.equal(normalized.hobbies, "原样兴趣");
  assert.equal(normalized.chat_behavior, "原样行为");
  assert.equal(normalized.personality, "");
});

test("inserts the preserved role prompt before conversation examples", () => {
  const draft = {
    ...createEmptyAIRoleDraft(),
    personality: "用户原始性格",
  };
  const prompts = [
    { role: "system" as const, content: "格式规则" },
    { role: "user" as const, content: "示例问题" },
    { role: "assistant" as const, content: "示例回答" },
  ];

  const result = insertPreservedRoleDraftPrompt(prompts, draft);

  assert.equal(result[0], prompts[0]);
  assert.equal(result[1]?.role, "system");
  assert.ok(result[1]?.content.includes("用户原始性格"));
  assert.equal(result[2], prompts[1]);
});
