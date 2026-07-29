import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test from "node:test";
import { db } from "../src/lib/database.ts";
import {
  createCharacterPreset,
  createMainPreset,
  deletePreset,
  getPreset,
} from "../src/lib/preset-store.ts";
import {
  mutatePreset,
  restorePresetVersion,
} from "../src/lib/preset-mutation-queue.ts";
import type { RawPreset } from "../src/types/preset.ts";

test("creates, restores, and deletes preset versions atomically", async () => {
  await db.delete();
  await db.open();
  const presetId = await createMainPreset("baseline");
  const baseline = await getPreset(presetId);
  assert.ok(baseline);

  await mutatePreset(
    presetId,
    (latest) => ({
      preset: {
        ...(latest.preset as RawPreset),
        keywords: ["generated"],
      },
      changedFields: ["keywords"],
    }),
    {
      expectedRevision: baseline.revision,
      version: { label: "AI 生成版本", source: "ai-generation" },
    },
  );

  const versions = await db.presetVersions
    .where("presetId")
    .equals(presetId)
    .toArray();
  assert.equal(versions.length, 2);
  const initial = versions.find((version) => version.source === "initial");
  const generated = versions.find(
    (version) => version.source === "ai-generation",
  );
  assert.ok(initial);
  assert.ok(generated);
  assert.equal((generated.preset as RawPreset).keywords[0], "generated");

  await assert.rejects(
    mutatePreset(
      presetId,
      (latest) => ({ preset: latest.preset, changedFields: [] }),
      { expectedRevision: baseline.revision },
    ),
    /生成期间预设已变化/,
  );

  await mutatePreset(presetId, (latest) => ({
    preset: { ...(latest.preset as RawPreset), keywords: ["manual"] },
    changedFields: ["keywords"],
  }));
  assert.equal((await getPreset(presetId))?.activeVersionId, undefined);

  await restorePresetVersion(presetId, initial.id);
  const restored = await getPreset(presetId);
  assert.equal((restored?.preset as RawPreset).keywords[0], "baseline");
  assert.equal(restored?.activeVersionId, initial.id);
  assert.equal(
    await db.presetVersions.where("presetId").equals(presetId).count(),
    3,
  );

  await db.agentChats.put({
    id: `main:${presetId}`,
    messages: [],
    updatedAt: Date.now(),
  });
  await deletePreset(presetId);
  assert.equal(await db.presets.get(presetId), undefined);
  assert.equal(await db.agentChats.get(`main:${presetId}`), undefined);
  assert.equal(
    await db.presetVersions.where("presetId").equals(presetId).count(),
    0,
  );
  await db.delete();
});

test("escapes character names embedded in XML attribute examples", async () => {
  await db.delete();
  await db.open();
  const presetId = await createCharacterPreset("O'Reilly & 小葵");
  const preset = await getPreset(presetId);
  assert.equal(preset?.type, "character");
  assert.match(
    preset?.type === "character" ? preset.preset.input : "",
    /name='O&apos;Reilly &amp; 小葵'/,
  );
  await db.delete();
});
