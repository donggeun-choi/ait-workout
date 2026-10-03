import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const modelSource = await readFile(
  new URL("../src/workout-model.ts", import.meta.url),
  "utf8",
);
const source = (
  await readFile(new URL("../src/community-api.ts", import.meta.url), "utf8")
)
  .replace(
    /import \{ appLogin \} from "@apps-in-toss\/web-framework";/,
    'const appLogin = async () => ({authorizationCode:"",referrer:"DEFAULT"});',
  )
  .replace(
    /import \{ workoutDay, type Session \} from "\.\/workout-model";/,
    modelSource,
  )
  .replaceAll("import.meta.env", "({DEV:false})");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
});
const {
  publicSnapshot,
  graphemeCount,
  assertComposerAccount,
  assertAccountAction,
} = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);
const session = {
  id: "workout",
  date: "2026-10-01T09:32:00Z",
  name: "private routine",
  seconds: 3900,
  note: "secret note",
  exercises: [
    {
      id: "e",
      name: "벤치 프레스",
      muscle: "가슴",
      sets: [
        { id: "done", weight: "60", reps: "8", done: true },
        { id: "pending", weight: "80", reps: "3", done: false },
      ],
    },
  ],
};
test("default snapshot carries only public date and counts; private data never leaks", () => {
  const before = structuredClone(session);
  const snapshot = publicSnapshot(
    session,
    { names: false, weights: false, reps: false },
    " 좋아요 ",
  );
  assert.deepEqual(snapshot, {
    workoutId: "workout",
    workoutDate: "2026-10-01",
    exerciseCount: 1,
    completedSetCount: 1,
    comment: "좋아요",
    visibility: { names: false, weights: false, reps: false },
  });
  assert.deepEqual(session, before);
  assert.ok(!JSON.stringify(snapshot).includes("secret"));
});
test("each disclosure option is independent and excludes unfinished sets", () => {
  assert.deepEqual(
    publicSnapshot(session, { names: false, weights: true, reps: false }, "")
      .exercises,
    [{ sets: [{ weight: 60 }] }],
  );
  assert.deepEqual(
    publicSnapshot(session, { names: true, weights: false, reps: true }, "")
      .exercises,
    [{ name: "벤치 프레스", sets: [{ reps: 8 }] }],
  );
  assert.deepEqual(
    publicSnapshot(session, { names: true, weights: false, reps: false }, "")
      .exercises,
    [{ name: "벤치 프레스" }],
  );
});
test("visible character counts preserve composed Korean, emoji family and combining marks", () => {
  assert.equal(graphemeCount("가👨‍👩‍👧‍👦e\u0301"), 3);
  assert.equal(graphemeCount("👍🏽".repeat(100)), 100);
});

test("composer allows same-account reauthentication and rejects switching or missing accounts", () => {
  assert.doesNotThrow(() => assertComposerAccount("original", "original"));
  assert.doesNotThrow(() => assertComposerAccount(undefined, "first-login"));
  assert.throws(() => assertComposerAccount("original", "other"), {
    code: "ACCOUNT_CHANGED",
  });
  assert.throws(() => assertComposerAccount("original", undefined), {
    code: "ACCOUNT_CHANGED",
  });
});

test("public workout date uses Korean calendar day across UTC midnight", () => {
  assert.equal(
    publicSnapshot(
      { ...session, date: "2026-10-02T16:00:00Z" },
      { names: false, weights: false, reps: false },
      "",
    ).workoutDate,
    "2026-10-03",
  );
});
test("account actions reject stale withdrawal confirmation after reauthentication as another user", () => {
  assert.doesNotThrow(() => assertAccountAction(undefined, "first-login"));
  assert.doesNotThrow(() => assertAccountAction("owner", "owner"));
  assert.throws(() => assertAccountAction("owner", "different-account"), {
    code: "ACCOUNT_CHANGED",
  });
});
