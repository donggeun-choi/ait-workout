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
const {
  copySessionToDraft,
  prepareRepeat,
  previousCompletedSet,
  previousSetLabel,
  firstIncompleteSet,
  effectiveRestSeconds,
  changeDefaultRest,
  remainingRestSeconds,
  extendRest,
} = await import(
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

test("previous completed set uses latest same exercise, skips unfinished and never repeats a missing row", () => {
  const old = session();
  const latest = structuredClone(old);
  latest.date = "2026-10-02T00:00:00Z";
  latest.exercises[0].sets = [
    { id: "a", weight: "37.5", reps: "10", done: true },
    { id: "b", weight: "99", reps: "99", done: false },
    { id: "c", weight: "0", reps: "12", done: true },
  ];
  const items = [old, latest];
  const before = JSON.stringify(items);
  const name = latest.exercises[0].name;
  assert.equal(previousCompletedSet(items, name, 0).weight, "37.5");
  assert.equal(previousCompletedSet(items, name, 1).weight, "0");
  assert.equal(previousCompletedSet(items, name, 2), null);
  assert.equal(previousCompletedSet(items, name, -1), null);
  assert.equal(previousCompletedSet(items, "없는 종목", 0), null);
  assert.equal(previousCompletedSet([], name, 0), null);
  assert.equal(JSON.stringify(items), before);
});
test("first incomplete set follows current exercise order and completion cancellation", () => {
  const exercises = [
    {
      id: "x",
      sets: [
        { id: "a", done: true },
        { id: "b", done: false },
      ],
    },
    { id: "y", sets: [{ id: "c", done: false }] },
  ];
  assert.deepEqual(firstIncompleteSet(exercises), {
    exerciseId: "x",
    setId: "b",
  });
  assert.deepEqual(firstIncompleteSet([...exercises].reverse()), {
    exerciseId: "y",
    setId: "c",
  });
  exercises[0].sets[0].done = false;
  assert.deepEqual(firstIncompleteSet(exercises), {
    exerciseId: "x",
    setId: "a",
  });
  assert.equal(firstIncompleteSet([]), null);
  assert.equal(
    firstIncompleteSet([{ id: "z", sets: [{ id: "s", done: true }] }]),
    null,
  );
});

test("previous set label retains weighted bodyweight exercise load", () => {
  assert.equal(
    previousSetLabel({ weight: "10", reps: "12" }, true),
    "지난 10kg × 12회",
  );
  assert.equal(
    previousSetLabel({ weight: "0", reps: "12" }, true),
    "지난 12회",
  );
  assert.equal(
    previousSetLabel({ weight: "37.5", reps: "8" }, false),
    "지난 37.5kg × 8회",
  );
  assert.equal(previousSetLabel(null, true), "지난 기록 없음");
});

test("shared rest default preserves routine overrides and globally disables rest", () => {
  const data = {
    sessions: [],
    settings: { restSeconds: 90 },
    draft: {
      name: "Workout",
      started: 0,
      note: "",
      restUntil: 150000,
      exercises: [{ ...session().exercises[0], restSeconds: 120 }],
    },
  };
  const before = JSON.stringify(data);
  const changed = changeDefaultRest(data, 60);
  assert.equal(changed.settings.restSeconds, 60);
  assert.equal(changed.draft.exercises[0].restSeconds, 120);
  assert.equal(changed.draft.restUntil, 150000);
  assert.equal(effectiveRestSeconds(changed, changed.draft.exercises[0]), 120);
  assert.equal(
    effectiveRestSeconds(changed, {
      ...changed.draft.exercises[0],
      restSeconds: undefined,
    }),
    60,
  );
  const off = changeDefaultRest(changed, 0);
  assert.equal(off.draft.restUntil, null);
  assert.equal(effectiveRestSeconds(off, off.draft.exercises[0]), 0);
  assert.equal(JSON.stringify(data), before);
  assert.equal(changeDefaultRest({ ...data, draft: null }, 60).draft, null);
});

test("shared countdown uses wall time and extension never restarts absent rest", () => {
  assert.equal(remainingRestSeconds(100000, 80500), 20);
  assert.equal(remainingRestSeconds(100000, 101000), 0);
  assert.equal(remainingRestSeconds(null, 80000), 0);
  assert.equal(extendRest(100000, 30000, 80000), 130000);
  assert.equal(extendRest(100000, 30000, 110000), 140000);
  assert.equal(extendRest(null, 30000, 110000), null);
});
