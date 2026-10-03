import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(
  new URL("../src/save-state.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
});
const { createSaveTracker } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

test("older save results cannot mark newer input saved or failed", () => {
  const tracker = createSaveTracker();
  const first = tracker.begin();
  const second = tracker.begin();
  assert.equal(tracker.resolve(first), "saving");
  assert.equal(tracker.reject(second), "error");
  const third = tracker.begin();
  assert.equal(tracker.reject(first), "saving");
  assert.equal(tracker.resolve(third), "saved");
});

test("failed save can be retried without editing the input", () => {
  const tracker = createSaveTracker();
  assert.equal(tracker.reject(tracker.begin()), "error");
  const retry = tracker.begin();
  assert.equal(tracker.status(), "saving");
  assert.equal(tracker.resolve(retry), "saved");
});

test("draft write results cannot overwrite completion save status", () => {
  const tracker = createSaveTracker();
  const draft = tracker.begin();
  const completion = tracker.begin();
  assert.equal(tracker.resolve(completion), "saved");
  assert.equal(tracker.reject(draft), "saved");
});
