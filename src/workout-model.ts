export type SetRow = {
  id: string;
  weight: string;
  reps: string;
  done: boolean;
};
export type Exercise = {
  id: string;
  name: string;
  muscle: string;
  sets: SetRow[];
  restSeconds?: number;
};
export type Session = {
  id: string;
  name: string;
  date: string;
  seconds: number;
  exercises: Exercise[];
  note: string;
};
export type Draft = {
  name: string;
  started: number;
  exercises: Exercise[];
  note: string;
  restUntil: number | null;
};
export type Routine = { id: string; name: string; exercises: Exercise[] };
export type CustomExercise = {
  id: string;
  name: string;
  muscle: string;
  mode: "weight" | "bodyweight";
};
export type Saved = {
  sessions: Session[];
  draft: Draft | null;
  routines?: Routine[];
  customExercises?: CustomExercise[];
  settings?: { restSeconds: number };
  preImportBackup?: string;
};

export function copySessionToDraft(
  session: Session,
  started: number,
  makeId: () => string,
): Draft {
  return {
    name: session.name,
    started,
    note: "",
    restUntil: null,
    exercises: session.exercises
      .filter((exercise) => exercise.sets.some((set) => set.done))
      .map((exercise) => ({
        id: makeId(),
        name: exercise.name,
        muscle: exercise.muscle,
        sets: exercise.sets
          .filter((set) => set.done)
          .map((set) => ({
            id: makeId(),
            weight: set.weight,
            reps: set.reps,
            done: false,
          })),
      })),
  };
}

export function prepareRepeat(
  data: Saved,
  session: Session,
  started: number,
  makeId: () => string,
): Saved {
  return data.draft
    ? data
    : { ...data, draft: copySessionToDraft(session, started, makeId) };
}

export function validSet(row: SetRow) {
  return (
    row.weight.trim() !== "" &&
    row.reps.trim() !== "" &&
    Number.isFinite(Number(row.weight)) &&
    Number(row.weight) >= 0 &&
    Number(row.weight) <= 2000 &&
    Number.isInteger(Number(row.reps)) &&
    Number(row.reps) >= 1 &&
    Number(row.reps) <= 999
  );
}
export function validSession(s: Session) {
  try {
    return (
      !!s &&
      typeof s.id === "string" &&
      typeof s.name === "string" &&
      typeof s.note === "string" &&
      typeof s.date === "string" &&
      Number.isFinite(Date.parse(s.date)) &&
      Number.isFinite(s.seconds) &&
      s.seconds >= 0 &&
      Array.isArray(s.exercises) &&
      s.exercises.length > 0 &&
      s.exercises.every(
        (x) =>
          typeof x.id === "string" &&
          typeof x.name === "string" &&
          typeof x.muscle === "string" &&
          Array.isArray(x.sets) &&
          x.sets.length > 0 &&
          x.sets.every(
            (row) =>
              typeof row.id === "string" &&
              row.done === true &&
              typeof row.weight === "string" &&
              typeof row.reps === "string" &&
              validSet(row),
          ),
      )
    );
  } catch {
    return false;
  }
}
export function previousExercise(sessions: Session[], name: string) {
  for (const session of [...sessions].sort(
    (a, b) => Date.parse(b.date) - Date.parse(a.date),
  )) {
    const exercise = session.exercises.find(
      (x) => x.name === name && x.sets.some((row) => row.done),
    );
    if (exercise) return { session, exercise };
  }
  return null;
}
export function fillPrevious(
  exercise: Exercise,
  sessions: Session[],
): Exercise {
  const previous = previousExercise(
    sessions,
    exercise.name,
  )?.exercise.sets.filter((row) => row.done);
  if (!previous?.length) return exercise;
  return {
    ...exercise,
    sets: exercise.sets.map((row, i) =>
      row.done
        ? row
        : {
            ...row,
            weight: row.weight.trim()
              ? row.weight
              : previous[i % previous.length].weight,
            reps: row.reps.trim()
              ? row.reps
              : previous[i % previous.length].reps,
          },
    ),
  };
}
export function exerciseTrend(sessions: Session[], name: string) {
  return [...sessions]
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
    .flatMap((s) => {
      const rows = s.exercises
        .filter((x) => x.name === name)
        .flatMap((x) => x.sets.filter((row) => row.done));
      return rows.length
        ? [
            {
              date: s.date,
              sets: rows.length,
              reps: rows.reduce((n, row) => n + Number(row.reps), 0),
              maxWeight: Math.max(...rows.map((row) => Number(row.weight))),
              volume: rows.reduce(
                (n, row) => n + Number(row.weight) * Number(row.reps),
                0,
              ),
            },
          ]
        : [];
    });
}
const normalizedName = (name: string) =>
  name.normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase();
const uniqueIds = (items: { id: string }[]) =>
  new Set(items.map((x) => x.id)).size === items.length;
export function validMetadata(data: Saved) {
  try {
    return (
      (data.settings === undefined ||
        (!!data.settings &&
          [0, 60, 90, 120].includes(data.settings.restSeconds))) &&
      (data.routines === undefined ||
        (Array.isArray(data.routines) &&
          uniqueIds(data.routines) &&
          data.routines.every(
            (r) =>
              typeof r.id === "string" &&
              typeof r.name === "string" &&
              r.name.trim().length > 0 &&
              Array.isArray(r.exercises) &&
              r.exercises.length > 0 &&
              r.exercises.every(
                (x) =>
                  typeof x.id === "string" &&
                  typeof x.name === "string" &&
                  typeof x.muscle === "string" &&
                  (x.restSeconds === undefined ||
                    [0, 60, 90, 120].includes(x.restSeconds)) &&
                  Array.isArray(x.sets) &&
                  x.sets.length > 0 &&
                  x.sets.every(
                    (row) =>
                      typeof row.id === "string" &&
                      typeof row.done === "boolean" &&
                      typeof row.weight === "string" &&
                      typeof row.reps === "string" &&
                      validSet(row),
                  ),
              ),
          ))) &&
      (data.customExercises === undefined ||
        (Array.isArray(data.customExercises) &&
          uniqueIds(data.customExercises) &&
          new Set(data.customExercises.map((x) => normalizedName(x.name)))
            .size === data.customExercises.length &&
          data.customExercises.every(
            (x) =>
              typeof x.id === "string" &&
              typeof x.name === "string" &&
              x.name.trim().length > 0 &&
              typeof x.muscle === "string" &&
              ["weight", "bodyweight"].includes(x.mode),
          ))) &&
      (data.preImportBackup === undefined ||
        typeof data.preImportBackup === "string")
    );
  } catch {
    return false;
  }
}
export function parseBackup(raw: string): Saved {
  const envelope = JSON.parse(raw);
  if (
    envelope.version !== 1 ||
    !envelope.data ||
    !Array.isArray(envelope.data.sessions) ||
    !envelope.data.sessions.every(validSession) ||
    !validMetadata(envelope.data)
  )
    throw new Error("지원하지 않거나 손상된 백업이에요.");
  const data: Saved = { ...envelope.data, draft: null };
  delete data.preImportBackup;
  return data;
}
export function mergeBackup(
  local: Saved,
  incoming: Saved,
  reservedNames: string[] = [],
) {
  let duplicates = 0,
    conflicts = 0;
  const sessions = [...local.sessions];
  for (const session of incoming.sessions) {
    const existing = sessions.find((x) => x.id === session.id);
    if (existing) {
      if (JSON.stringify(existing) === JSON.stringify(session)) duplicates++;
      else conflicts++;
    } else sessions.push(structuredClone(session));
  }
  const mergeItems = <T extends { id: string }>(a: T[] = [], b: T[] = []) => {
    const merged = [...a];
    for (const item of b) {
      const existing = merged.find((old) => old.id === item.id);
      if (existing) {
        if (JSON.stringify(existing) === JSON.stringify(item)) duplicates++;
        else conflicts++;
      } else merged.push(structuredClone(item));
    }
    return merged;
  };
  const customExercises = [...(local.customExercises ?? [])];
  const names = new Set(
    [...reservedNames, ...customExercises.map((x) => x.name)].map(
      normalizedName,
    ),
  );
  for (const item of incoming.customExercises ?? []) {
    const existing = customExercises.find((x) => x.id === item.id);
    if (existing) {
      if (JSON.stringify(existing) === JSON.stringify(item)) duplicates++;
      else conflicts++;
    } else if (names.has(normalizedName(item.name))) conflicts++;
    else {
      customExercises.push(structuredClone(item));
      names.add(normalizedName(item.name));
    }
  }
  return {
    data: {
      ...local,
      sessions: sessions.sort(
        (a, b) => Date.parse(b.date) - Date.parse(a.date),
      ),
      routines: mergeItems(local.routines, incoming.routines),
      customExercises,
    },
    duplicates,
    conflicts,
  };
}
export function backupJson(data: Saved) {
  const portable = { ...data, draft: null };
  delete portable.preImportBackup;
  return JSON.stringify(
    { version: 1, exportedAt: new Date().toISOString(), data: portable },
    null,
    2,
  );
}
export function sessionsCsv(sessions: Session[]) {
  const cell = (value: string) =>
    '"' +
    (/^[\s]*[=+@-]/.test(value) ? "'" + value : value).replace(/"/g, '""') +
    '"';
  return (
    "\uFEFF" +
    [
      ["날짜", "운동", "종목", "세트", "무게 kg", "횟수", "메모"],
      ...sessions.flatMap((s) =>
        s.exercises.flatMap((x) =>
          x.sets
            .filter((row) => row.done)
            .map((row, i) => [
              workoutDay(s.date),
              s.name,
              x.name,
              String(i + 1),
              row.weight,
              row.reps,
              s.note,
            ]),
        ),
      ),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n")
  );
}
export function comparePeriods(sessions: Session[], days: number, now: number) {
  const interval = days * 86400000;
  const summarize = (from: number, to: number) => {
    const records = sessions.filter(
      (s) => Date.parse(s.date) >= from && Date.parse(s.date) < to,
    );
    const rows = records.flatMap((s) =>
      s.exercises.flatMap((x) => x.sets.filter((row) => row.done)),
    );
    return {
      workouts: records.length,
      sets: rows.length,
      volume: rows.reduce(
        (n, row) => n + Number(row.weight) * Number(row.reps),
        0,
      ),
    };
  };
  const current = summarize(now - interval, now + 1),
    previous = summarize(now - 2 * interval, now - interval);
  return {
    current,
    previous,
    comparable: current.workouts > 0 && previous.workouts > 0,
  };
}
export function workoutDay(date: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}
