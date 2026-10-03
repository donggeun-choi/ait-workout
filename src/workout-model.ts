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
export type Saved = { sessions: Session[]; draft: Draft | null };

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
