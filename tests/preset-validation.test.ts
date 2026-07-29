import assert from "node:assert/strict";
import test from "node:test";
import {
  isCharacterPresetTemplate,
  isRawPreset,
  isWorldLore,
} from "../src/types/preset.ts";
import { stripSensitivePresetKeys } from "../src/lib/preset-sanitizer.ts";

test("validates complete main preset structures", () => {
  assert.equal(
    isRawPreset({
      keywords: ["demo"],
      prompts: [{ role: "system", content: "hello" }],
      world_lores: [
        {
          keywords: ["foo", /bar/i],
          content: "lore",
          tokenLimit: 100,
          enabled: true,
        },
      ],
      config: {
        postHandler: {
          prefix: "",
          postfix: "",
          variables: { foo: "bar" },
        },
      },
    }),
    true,
  );
  assert.equal(isRawPreset({ keywords: "demo", prompts: [] }), false);
  assert.equal(
    isRawPreset({ keywords: ["demo"], prompts: [{ role: "tool", content: 1 }] }),
    false,
  );
});

test("validates character preset field types", () => {
  assert.equal(
    isCharacterPresetTemplate({
      name: "demo",
      nick_name: ["demo"],
      input: "{prompt}",
      system: "system",
      personality: "calm",
    }),
    true,
  );
  assert.equal(
    isCharacterPresetTemplate({
      name: "demo",
      nick_name: "demo",
      input: {},
      system: null,
    }),
    false,
  );
});

test("validates world lore values instead of key presence", () => {
  assert.equal(isWorldLore({ keywords: "foo", content: "bar" }), true);
  assert.equal(isWorldLore({ keywords: [42], content: "bar" }), false);
  assert.equal(isWorldLore({ keywords: [], content: "bar", order: NaN }), false);
});

test("removes sensitive preset keys case-insensitively", () => {
  assert.deepEqual(
    stripSensitivePresetKeys({
      API_KEY: "secret",
      Authorization: "Bearer secret",
      nested: { Access_Token: "secret", content: "safe" },
    }),
    { nested: { content: "safe" } },
  );
});
