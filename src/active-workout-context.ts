import { createContext } from "react";
import type { Draft } from "./workout-model";

type ActiveWorkout = {
  draft: Draft;
  now: number;
  defaultSeconds: number;
  onReturn(): void;
  onDefault(seconds: number): void;
  onStart(): void;
  onExtend(): void;
  onSkip(): void;
};

export const ActiveWorkoutContext = createContext<ActiveWorkout | null>(null);
