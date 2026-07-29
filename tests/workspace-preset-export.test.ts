import assert from "node:assert/strict";
import test from "node:test";
import { load } from "js-yaml";
import {
  buildWorkspacePreset,
  serializeWorkspacePreset,
  workspaceExportFileName,
} from "../src/lib/workspace-preset-export.ts";
import {
  isCharacterPresetTemplate,
  isRawPreset,
  type CharacterPresetTemplate,
  type RawPreset,
} from "../src/types/preset.ts";
import { analyzeTemplate } from "../src/lib/prompt-template.ts";

const source = `# 小葵预设\n\n## 角色名\n\n小葵\n\n## 性格\n\n友善、叛逆，保留这句原文。`;

test("fills main preset templates without rewriting the Markdown source", () => {
  for (const format of ["markdown", "koishi"] as const) {
    const preset = buildWorkspacePreset(source, "main", format) as RawPreset;
    assert.ok(isRawPreset(preset));
    assert.match(preset.prompts[0].content, /友善、叛逆，保留这句原文。/);
    assert.match(preset.format_user_prompt ?? "", /\{prompt\}/);
    if (format === "koishi") {
      assert.ok(preset.prompts.filter((message) => message.role === "assistant").every((message) => /^<message>[\s\S]*<\/message>$/.test(message.content)));
    } else {
      assert.doesNotMatch(preset.prompts[0].content, /<img\s/);
    }
  }
});

test("fills character templates in tool and XML formats", () => {
  for (const format of ["tool-call", "standard"] as const) {
    const preset = buildWorkspacePreset(source, "character", format) as CharacterPresetTemplate;
    assert.ok(isCharacterPresetTemplate(preset));
    assert.equal(preset.name, "小葵");
    assert.match(preset.system, /友善、叛逆，保留这句原文。/);
    if (format === "tool-call") {
      assert.match(preset.input, /character_reply/);
      assert.doesNotMatch(preset.input, /<action>/);
    } else {
      for (const tag of ["status", "think", "action", "output", "message"]) {
        assert.match(preset.input, new RegExp(`<${tag}>`));
      }
    }
  }
});

test("serializes a valid YAML preset and normalizes the file extension", () => {
  assert.ok(isRawPreset(load(serializeWorkspacePreset(source, "main", "markdown"))));
  assert.equal(workspaceExportFileName("角色草稿.md"), "角色草稿.yml");
  assert.equal(workspaceExportFileName("../../CON?.md"), ".._.._CON_.yml");
});

test("escapes literal braces and parses H1-H3 character aliases", () => {
  const input = `# 角色草稿\n\n### 角色名\n\n名称：小葵\n触发昵称：葵葵、@Aoi\n\n## 代码\n\n{ "age": 18 }\n\n当前日期：{date}`;
  const preset = buildWorkspacePreset(
    input,
    "character",
    "tool-call",
  ) as CharacterPresetTemplate;
  assert.equal(preset.name, "小葵");
  assert.ok(preset.nick_name.includes("葵葵"));
  assert.ok(preset.nick_name.includes("@Aoi"));
  assert.match(preset.system, /\{\{ "age": 18 \}\}/);
  assert.match(preset.system, /当前日期：\{date\}/);
  assert.equal(
    analyzeTemplate(preset.system, "character-system").filter(
      (range) => range.kind === "error" || range.kind === "unknown",
    ).length,
    0,
  );
});
