import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(
  new URL("../src/record-storage.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
});
const { createRecordStorage } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);
function web(raw = null) {
  return {
    getItem: () => raw,
    setItem: (_, value) => {
      raw = value;
    },
  };
}
test("native record takes precedence without overwriting legacy data", async () => {
  const legacy = web("old");
  const store = createRecordStorage(
    "key",
    { getItem: async () => "native", setItem: async () => {} },
    legacy,
  );
  assert.deepEqual(await store.read(), { raw: "native", migrate: false });
  assert.equal(legacy.getItem(), "old");
});
test("missing native record returns legacy for validation before migration", async () => {
  let writes = 0;
  const store = createRecordStorage(
    "key",
    {
      getItem: async () => null,
      setItem: async () => {
        writes++;
      },
    },
    web("legacy"),
  );
  assert.deepEqual(await store.read(), { raw: "legacy", migrate: true });
  assert.equal(writes, 0);
});
test("native read failure does not silently fallback to stale legacy", async () => {
  const store = createRecordStorage(
    "key",
    {
      getItem: async () => {
        throw Error("offline");
      },
      setItem: async () => {},
    },
    web("old"),
  );
  await assert.rejects(store.read(), /offline/);
});
test("writes remain ordered and a failed write can be retried", async () => {
  const calls = [];
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const store = createRecordStorage(
    "key",
    {
      getItem: async () => null,
      setItem: async (_, value) => {
        calls.push(value);
        if (value === "first") {
          await gate;
          throw Error("full");
        }
      },
    },
    web(),
  );
  const first = store.write("first");
  const failed = assert.rejects(first, /full/);
  const second = store.write("second");
  await Promise.resolve();
  await Promise.resolve();
  release();
  await failed;
  await second;
  assert.deepEqual(calls, ["first", "second"]);
});
test("browser read and write work without native APIs", async () => {
  const store = createRecordStorage("key", null, web("old"));
  await store.write("new");
  assert.deepEqual(await store.read(), { raw: "new", migrate: false });
});
