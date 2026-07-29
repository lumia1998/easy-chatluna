import assert from "node:assert/strict";
import test from "node:test";
import { updateNestedObject } from "../src/lib/utils.ts";

test("creates missing nested objects without mutating the source", () => {
  const source = { untouched: true };
  const result = updateNestedObject(
    source,
    "config.postHandler.variables.foo",
    "bar",
  );
  assert.deepEqual(result, {
    untouched: true,
    config: { postHandler: { variables: { foo: "bar" } } },
  });
  assert.deepEqual(source, { untouched: true });
});

test("creates arrays for numeric path segments", () => {
  const result = updateNestedObject({}, "world_lores.0.content", "hello");
  assert.deepEqual(result, { world_lores: [{ content: "hello" }] });
});

test("rejects prototype pollution paths", () => {
  assert.throws(
    () => updateNestedObject({}, "__proto__.polluted", true),
    /无效的嵌套字段路径/,
  );
});
