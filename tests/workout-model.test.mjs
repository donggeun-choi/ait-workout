import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(
  new URL("../src/workout-model.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
});
const { copySessionToDraft, prepareRepeat } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

const session = () => ({
  id: "session",
  name: "상체",
  date: "2026-10-01T00:00:00Z",
  seconds: 3600,
  note: "원본 메모",
  exercises: [
    {
      id: "exercise",
      name: "벤치 프레스",
      muscle: "가슴",
      sets: [
        { id: "set1", weight: "60", reps: "8", done: true },
        { id: "set2", weight: "70", reps: "5", done: false },
      ],
    },
  ],
});
const idFactory = () => {
  let n = 0;
  return () => `new-${++n}`;
};

test("repeat copies completed values with new identities and no completion or private note", () => {
  const original = session();
  const before = JSON.stringify(original);
  const draft = copySessionToDraft(original, 1234, idFactory());
  assert.deepEqual(draft, {
    name: "상체",
    started: 1234,
    note: "",
    restUntil: null,
    exercises: [
      {
        id: "new-1",
        name: "벤치 프레스",
        muscle: "가슴",
        sets: [{ id: "new-2", weight: "60", reps: "8", done: false }],
      },
    ],
  });
  draft.exercises[0].sets[0].weight = "65";
  assert.equal(JSON.stringify(original), before);
});

test("repeat leaves an existing workout draft untouched", () => {
  const data = {
    sessions: [session()],
    draft: {
      name: "継続",
      started: 1,
      note: "メモ",
      restUntil: 99,
      exercises: [],
    },
  };
  assert.equal(prepareRepeat(data, session(), 1234, idFactory()), data);
});

test("repeat preserves history and uses an independent draft", () => {
  const original = session();
  const data = { sessions: [original], draft: null };
  const next = prepareRepeat(data, original, 1234, idFactory());
  assert.equal(next.sessions, data.sessions);
  assert.equal(data.draft, null);
  assert.equal(next.draft.started, 1234);
});

test("repeat excludes empty exercises and keeps order, bodyweight and decimal strings", () => {
  const original = session();
  original.exercises.unshift({
    id: "empty",
    name: "제외",
    muscle: "등",
    sets: [],
  });
  original.exercises.push({
    id: "body",
    name: "크런치",
    muscle: "복근",
    sets: [{ id: "body-set", weight: "0", reps: "20", done: true }],
  });
  original.exercises[1].sets[0].weight = "62.5";
  const draft = copySessionToDraft(original, 1, idFactory());
  assert.deepEqual(
    draft.exercises.map((x) => x.name),
    ["벤치 프레스", "크런치"],
  );
  assert.equal(draft.exercises[0].sets[0].weight, "62.5");
  assert.equal(draft.exercises[1].sets[0].weight, "0");
});
