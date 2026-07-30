import assert from "node:assert/strict";
import test from "node:test";
import {
  applyWorkspaceSource,
  detectWorkspaceFormat,
  presetToWorkspaceSource,
  renamePresetSource,
  workspaceTypeOfPreset,
} from "../src/lib/workspace-preset-import.ts";
import { buildWorkspacePreset } from "../src/lib/workspace-preset-export.ts";
import type { PresetModel } from "../src/lib/database.ts";
import type { CharacterPresetTemplate, RawPreset } from "../src/types/preset.ts";

const source = `# 小葵\n\n## 角色名\n\n小葵、葵酱\n\n## 性格\n\n友善、叛逆，保留这句原文。\n\n## 聊天风格\n\n回复简短自然，较少使用标点。`;

function characterModel(preset: CharacterPresetTemplate): PresetModel {
  return {
    id: "c1",
    name: "小葵",
    type: "character",
    lastModified: 0,
    revision: 1,
    preset,
  } as PresetModel;
}

function mainModel(preset: RawPreset): PresetModel {
  return {
    id: "m1",
    name: "小葵主预设",
    type: "main",
    lastModified: 0,
    revision: 1,
    preset,
  } as PresetModel;
}

test("round-trips workspace Markdown through a character preset", () => {
  const built = buildWorkspacePreset(
    source,
    "character",
    "tool-call",
  ) as CharacterPresetTemplate;
  const recovered = presetToWorkspaceSource(characterModel(built));
  assert.equal(recovered, source);
});

test("round-trips workspace Markdown through a main preset", () => {
  const built = buildWorkspacePreset(source, "main", "markdown") as RawPreset;
  assert.equal(presetToWorkspaceSource(mainModel(built)), source);
});

test("reconstructs Markdown for presets never authored in the workspace", () => {
  const recovered = presetToWorkspaceSource(
    characterModel({
      name: "echo",
      nick_name: ["echo", "@echo", "回声"],
      input: "{prompt}",
      system: "你是 echo。",
      personality: "冷静",
      description: "测试角色",
      chat_style: "简短",
    }),
  );
  assert.match(recovered, /^# echo\n/);
  assert.match(recovered, /## 角色名\n\necho、回声\n/);
  assert.match(recovered, /## 性格\n\n冷静\n/);
  assert.doesNotMatch(recovered, /## 兴趣/);
});

test("detects the reply format already stored in a preset", () => {
  const toolCall = buildWorkspacePreset(source, "character", "tool-call");
  const standard = buildWorkspacePreset(source, "character", "standard");
  assert.equal(
    detectWorkspaceFormat(characterModel(toolCall as CharacterPresetTemplate)),
    "tool-call",
  );
  assert.equal(
    detectWorkspaceFormat(characterModel(standard as CharacterPresetTemplate)),
    "standard",
  );
  assert.equal(
    detectWorkspaceFormat(mainModel(buildWorkspacePreset(source, "main", "koishi") as RawPreset)),
    "koishi",
  );
});

test("applyWorkspaceSource keeps fields the workspace does not own", () => {
  const model = characterModel({
    ...(buildWorkspacePreset(source, "character", "tool-call") as CharacterPresetTemplate),
    status: '心情: "平静"',
    mute_keyword: ["安静"],
  });
  const next = applyWorkspaceSource(
    model,
    source.replace("友善、叛逆", "友善、直率"),
  ) as CharacterPresetTemplate;
  assert.equal(next.status, '心情: "平静"');
  assert.deepEqual(next.mute_keyword, ["安静"]);
  assert.match(next.system, /友善、直率/);
  assert.equal(presetToWorkspaceSource(characterModel(next)).includes("友善、直率"), true);
});

test("applyWorkspaceSource preserves non-system prompts of main presets", () => {
  const built = buildWorkspacePreset(source, "main", "koishi") as RawPreset;
  const next = applyWorkspaceSource(mainModel(built), source) as RawPreset;
  assert.equal(next.prompts.length, built.prompts.length);
  assert.deepEqual(
    next.prompts.filter((message) => message.role === "assistant"),
    built.prompts.filter((message) => message.role === "assistant"),
  );
});

test("keeps {{user}} dialogue placeholders intact across a round-trip", () => {
  const withPlaceholders = `# 小葵\n\n## 对话示例\n\n{{user}}: 在干嘛\n{{char}}: 写代码呢`;
  const built = buildWorkspacePreset(
    withPlaceholders,
    "character",
    "tool-call",
  ) as CharacterPresetTemplate;
  assert.equal(presetToWorkspaceSource(characterModel(built)), withPlaceholders);
});

test("reopening an escaped literal brace does not drift further", () => {
  const literal = `# 小葵\n\n## 性格\n\n字面量 {不是变量}`;
  const first = presetToWorkspaceSource(
    characterModel(
      buildWorkspacePreset(literal, "character", "tool-call") as CharacterPresetTemplate,
    ),
  );
  const second = presetToWorkspaceSource(
    characterModel(
      buildWorkspacePreset(first, "character", "tool-call") as CharacterPresetTemplate,
    ),
  );
  assert.equal(second, first);
});

test("renames a character preset through its document so edits cannot revert it", () => {
  const built = buildWorkspacePreset(
    source,
    "character",
    "tool-call",
  ) as CharacterPresetTemplate;
  const renamed = renamePresetSource(characterModel(built), "葵葵") as
    | CharacterPresetTemplate
    | undefined;
  assert.ok(renamed);
  assert.equal(renamed.name, "葵葵");
  assert.ok(renamed.nick_name.includes("葵葵"));

  // A later workspace save re-derives the name from the document.
  const recovered = presetToWorkspaceSource(characterModel(renamed));
  assert.match(recovered, /^# 葵葵\n/);
  const resaved = applyWorkspaceSource(
    characterModel(renamed),
    recovered,
  ) as CharacterPresetTemplate;
  assert.equal(resaved.name, "葵葵");
});

test("rename keeps extra aliases listed in the document", () => {
  const built = buildWorkspacePreset(
    source,
    "character",
    "tool-call",
  ) as CharacterPresetTemplate;
  const renamed = renamePresetSource(characterModel(built), "葵葵") as CharacterPresetTemplate;
  assert.ok(renamed.nick_name.includes("葵酱"), "原有别名应保留");
  assert.ok(!renamed.nick_name.includes("小葵"), "旧主名不应残留为别名");
});

test("renames a main preset via its H1 title", () => {
  const built = buildWorkspacePreset(source, "main", "markdown") as RawPreset;
  const renamed = renamePresetSource(mainModel(built), "新主预设") as RawPreset;
  assert.equal(renamed.keywords[0], "新主预设");
  assert.match(presetToWorkspaceSource(mainModel(renamed)), /^# 新主预设\n/);
});

test("rename falls back to identity fields without a workspace document", () => {
  const plain = characterModel({
    name: "echo",
    nick_name: ["echo", "@echo"],
    input: "{prompt}",
    system: "手写的系统提示词，不应被重建覆盖。",
  });
  assert.equal(renamePresetSource(plain, "jax"), undefined);
});

test("maps preset type to workspace type", () => {
  assert.equal(workspaceTypeOfPreset(characterModel({} as CharacterPresetTemplate)), "character");
  assert.equal(workspaceTypeOfPreset(mainModel({} as RawPreset)), "main");
});
