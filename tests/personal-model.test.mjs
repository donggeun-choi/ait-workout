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
const m = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);
const session = {
  id: "s",
  name: "운동",
  date: "2026-10-01T00:00:00Z",
  seconds: 10,
  note: "private",
  exercises: [
    {
      id: "e",
      name: "크런치",
      muscle: "복근",
      sets: [{ id: "r", weight: "0", reps: "20", done: true }],
    },
  ],
};
test("backup rejects invalid completed ranges and unsupported versions", () => {
  assert.throws(() =>
    m.parseBackup(
      JSON.stringify({ version: 99, data: { sessions: [], draft: null } }),
    ),
  );
  assert.throws(() =>
    m.parseBackup(
      JSON.stringify({
        version: 1,
        data: {
          sessions: [
            {
              ...session,
              exercises: [
                {
                  ...session.exercises[0],
                  sets: [{ id: "r", weight: "-1", reps: "0", done: true }],
                },
              ],
            },
          ],
          draft: null,
        },
      }),
    ),
  );
});
test("merge retains local conflicts and draft, appends new records and deduplicates exact IDs", () => {
  const local = { sessions: [session], draft: { name: "active" } };
  const incoming = {
    sessions: [
      { ...session, note: "conflict" },
      { ...session, id: "new" },
    ],
    draft: null,
  };
  const result = m.mergeBackup(local, incoming);
  assert.equal(result.data.sessions[0].note, "private");
  assert.equal(result.data.sessions.length, 2);
  assert.equal(result.conflicts, 1);
  assert.equal(result.data.draft, local.draft);
  assert.equal(
    m.mergeBackup(local, { sessions: [session], draft: null }).duplicates,
    1,
  );
});
test("previous fill respects edited values and bodyweight history", () => {
  const ex = {
    ...session.exercises[0],
    sets: [{ id: "new", weight: "", reps: "12", done: false }],
  };
  const filled = m.fillPrevious(ex, [session]);
  assert.equal(filled.sets[0].weight, "0");
  assert.equal(filled.sets[0].reps, "12");
  assert.equal(ex.sets[0].weight, "");
});
test("exercise trends use completed real rows and provide bodyweight reps", () => {
  const result = m.exerciseTrend([session], "크런치");
  assert.equal(result[0].reps, 20);
  assert.equal(result[0].maxWeight, 0);
  assert.equal(result[0].sets, 1);
});
test("validators return false for untrusted null rows and formula CSV stays inert", () => {
  assert.equal(m.validSession({ ...session, exercises: [null] }), false);
  assert.equal(m.validMetadata({ routines: [null] }), false);
  assert.match(
    m.sessionsCsv([{ ...session, note: '=HYPERLINK("bad")' }]),
    /\'=HYPERLINK/,
  );
});
test("same length period comparison never treats absent baseline as progress", () => {
  const now = Date.parse("2026-10-03T00:00:00Z");
  assert.equal(m.comparePeriods([session], 7, now).comparable, false);
  const old = { ...session, id: "old", date: "2026-09-24T00:00:00Z" };
  const result = m.comparePeriods([old, session], 7, now);
  assert.equal(result.comparable, true);
  assert.equal(result.current.sets, 1);
  assert.equal(result.previous.sets, 1);
});
