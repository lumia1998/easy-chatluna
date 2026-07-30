import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test from "node:test";
import { db } from "../src/lib/database.ts";
import { createMainPreset, getPreset } from "../src/lib/preset-store.ts";
import {
  PresetRevisionConflictError,
  withPresetTransaction,
} from "../src/lib/preset-repository.ts";
import { mutatePreset } from "../src/lib/preset-mutation-queue.ts";
import type { RawPreset } from "../src/types/preset.ts";

async function freshPreset(name: string) {
  await db.delete();
  await db.open();
  const presetId = await createMainPreset(name);
  const created = await getPreset(presetId);
  assert.ok(created);
  return { presetId, revision: created.revision ?? 1 };
}

test("stale expectedRevision raises a typed conflict and leaves data untouched", async () => {
  const { presetId, revision } = await freshPreset("conflict-baseline");

  await mutatePreset(presetId, (latest) => ({
    preset: { ...(latest.preset as RawPreset), keywords: ["user-edit"] },
    changedFields: ["keywords"],
  }));

  const afterUserEdit = await getPreset(presetId);
  assert.ok(afterUserEdit);

  await assert.rejects(
    () =>
      mutatePreset(
        presetId,
        (latest) => ({
          preset: {
            ...(latest.preset as RawPreset),
            keywords: ["ai-generated"],
          },
          changedFields: ["keywords"],
        }),
        { expectedRevision: revision },
      ),
    (error: unknown) => {
      assert.ok(
        error instanceof PresetRevisionConflictError,
        "conflict must be distinguishable from a generic write failure",
      );
      assert.equal(error.expectedRevision, revision);
      assert.equal(error.actualRevision, afterUserEdit.revision ?? 1);
      return true;
    },
  );

  const untouched = await getPreset(presetId);
  assert.ok(untouched);
  assert.deepEqual((untouched.preset as RawPreset).keywords, ["user-edit"]);
  assert.equal(untouched.revision, afterUserEdit.revision);
});

test("matching expectedRevision applies the write", async () => {
  const { presetId, revision } = await freshPreset("conflict-happy-path");

  const result = await mutatePreset(
    presetId,
    (latest) => ({
      preset: { ...(latest.preset as RawPreset), keywords: ["applied"] },
      changedFields: ["keywords"],
    }),
    { expectedRevision: revision },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.changedFields, ["keywords"]);
  const stored = await getPreset(presetId);
  assert.ok(stored);
  assert.deepEqual((stored.preset as RawPreset).keywords, ["applied"]);
});

test("a throwing mutator aborts the write without creating a version", async () => {
  const { presetId } = await freshPreset("conflict-abort");
  const before = await getPreset(presetId);
  assert.ok(before);

  await assert.rejects(
    () =>
      withPresetTransaction(
        presetId,
        () => {
          throw new Error("validation refused the generated preset");
        },
        { version: { label: "AI 生成版本", source: "ai-generation" } },
      ),
    /validation refused/,
  );

  const after = await getPreset(presetId);
  assert.ok(after);
  assert.equal(after.revision, before.revision);
  const versions = await db.presetVersions
    .where("presetId")
    .equals(presetId)
    .count();
  assert.equal(versions, 0, "an aborted write must not leave version records");
});
