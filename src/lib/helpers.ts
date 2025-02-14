import { Statement } from "better-sqlite3";

type Levels = "high" | "medium" | "low";

export function determineShard<
  R extends Record<"high" | "medium" | "low", Statement<unknown[], unknown> | Levels>,
>(score: number, result: R): R[keyof R] {
  if (score >= 0.7) return result.high as R[keyof R];
  if (score >= 0.3) return result.medium as R[keyof R];
  return result.low as R[keyof R];
}
