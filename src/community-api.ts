import { appLogin } from "@apps-in-toss/web-framework";
import { workoutDay, type Session } from "./workout-model";
export type Visibility = { names: boolean; weights: boolean; reps: boolean };
export type PublicExercise = {
  name?: string;
  sets?: { weight?: number; reps?: number }[];
};
export type Snapshot = {
  workoutId: string;
  workoutDate: string;
  exerciseCount: number;
  completedSetCount: number;
  comment: string;
  visibility: Visibility;
  exercises?: PublicExercise[];
};
export type CommunityUser = {
  id: string;
  nickname: string;
  rulesAccepted: boolean;
  identityKind: "toss" | "development";
};
export type CommunityPost = Snapshot & {
  id: string;
  authorId: string;
  nickname: string;
  createdAt: string;
  cheerCount: number;
  cheeredByMe: boolean;
  isMine: boolean;
};
export type Feed = { posts: CommunityPost[]; nextCursor: string | null };
export function graphemeCount(value: string): number {
  return [
    ...new (
      Intl as typeof Intl & {
        Segmenter: new (
          locale: string,
          options: { granularity: string },
        ) => { segment(value: string): Iterable<unknown> };
      }
    ).Segmenter("ko", { granularity: "grapheme" }).segment(value),
  ].length;
}
export function publicSnapshot(
  session: Session,
  visibility: Visibility,
  comment: string,
): Snapshot {
  const completed = session.exercises.filter((e) => e.sets.some((s) => s.done));
  const result: Snapshot = {
    workoutId: session.id,
    workoutDate: workoutDay(session.date),
    exerciseCount: completed.length,
    completedSetCount: completed.reduce(
      (n, e) => n + e.sets.filter((s) => s.done).length,
      0,
    ),
    comment: comment.trim(),
    visibility: { ...visibility },
  };
  if (visibility.names || visibility.weights || visibility.reps)
    result.exercises = completed.map((e) => ({
      ...(visibility.names ? { name: e.name } : {}),
      ...(visibility.weights || visibility.reps
        ? {
            sets: e.sets
              .filter((s) => s.done)
              .map((s) => ({
                ...(visibility.weights ? { weight: Number(s.weight) } : {}),
                ...(visibility.reps ? { reps: Number(s.reps) } : {}),
              })),
          }
        : {}),
    }));
  return result;
}
export class CommunityError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function assertAccountAction(
  ownerId: string | undefined,
  nextId: string | undefined,
) {
  if (!nextId || (ownerId && ownerId !== nextId))
    throw new CommunityError(
      "ACCOUNT_CHANGED",
      "계정이 바뀌었어요. 새 계정에서 하려는 행동을 다시 확인해 주세요.",
    );
}
export function assertComposerAccount(
  ownerId: string | undefined,
  nextId: string | undefined,
) {
  if (!nextId || (ownerId && ownerId !== nextId))
    throw new CommunityError(
      "ACCOUNT_CHANGED",
      "계정이 바뀌었어요. 새 계정으로 공개할 내용을 다시 확인해 주세요.",
    );
}
let token: string | null = null;
let user: CommunityUser | null = null;
let revision = 0;
const listeners = new Set<() => void>();
function notify() {
  revision++;
  listeners.forEach((fn) => fn());
}
export const auth = {
  current: () => user,
  revision: () => revision,
  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  clear: () => {
    token = null;
    user = null;
    notify();
  },
};
export async function communityRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const capturedToken = token;
  const configuredBase = (import.meta.env.VITE_COMMUNITY_API_URL ?? "")
    .trim()
    .replace(/\/$/, "");
  if (
    configuredBase &&
    !import.meta.env.DEV &&
    !configuredBase.startsWith("https://")
  )
    throw new CommunityError(
      "CONFIGURATION",
      "커뮤니티 서버 설정을 확인해 주세요.",
    );
  const base = configuredBase || "/api/community";
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(capturedToken ? { Authorization: `Bearer ${capturedToken}` } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new CommunityError(
      "OFFLINE",
      "연결을 확인하고 다시 시도해 주세요. 작성 내용은 그대로 남아 있어요.",
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const code = data?.error?.code ?? "UNAVAILABLE";
    if (response.status === 401 && capturedToken === token) auth.clear();
    throw new CommunityError(code, errorText(code));
  }
  if (capturedToken !== token)
    throw new CommunityError(
      "ACCOUNT_CHANGED",
      "계정이 바뀌었어요. 다시 시도해 주세요.",
    );
  if (data === null && response.status !== 204)
    throw new CommunityError("UNAVAILABLE", errorText("UNAVAILABLE"));
  return data as T;
}
export function errorText(code: string) {
  return (
    (
      {
        AUTH_REQUIRED: "로그인 후 다시 시도해 주세요. 작성 내용은 유지돼요.",
        AUTH_EXPIRED: "로그인이 만료됐어요. 다시 로그인해 주세요.",
        ACCOUNT_RESTRICTED: "커뮤니티 참여가 제한된 계정이에요.",
        INVALID_PAYLOAD: "입력 내용과 글자 수를 확인해 주세요.",
        SELF_CHEER: "내 인증에는 응원할 수 없어요.",
        PROFILE_REQUIRED: "닉네임과 커뮤니티 규칙 동의를 확인해 주세요.",
        POST_HIDDEN:
          "이 운동 인증은 운영 정책에 따라 숨겨졌어요. 운영 문의처에 문의해 주세요.",
        POST_DELETED:
          "삭제한 인증이에요. 다시 올리려면 내용을 확인하고 새로 작성해 주세요.",
        IDEMPOTENCY_CONFLICT: "게시 내용이 변경됐어요. 다시 시도해 주세요.",
        POST_NOT_FOUND: "삭제되거나 숨겨진 인증이에요. 새로고침해 주세요.",
        RATE_LIMITED: "요청이 많아요. 잠시 후 다시 시도해 주세요.",
        TOSS_AUTH_UNAVAILABLE: "토스 로그인 연결을 준비 중이에요.",
        COMMUNITY_DISABLED:
          "커뮤니티 운영을 준비 중이에요. 개인 운동 기록은 계속 사용할 수 있어요.",
      } as Record<string, string>
    )[code] ?? "커뮤니티 연결을 확인할 수 없어요. 잠시 후 다시 시도해 주세요."
  );
}
let loginPending: Promise<CommunityUser> | null = null;
export async function login(): Promise<CommunityUser> {
  if (user) return user;
  if (loginPending) return loginPending;
  loginPending = performLogin();
  try {
    return await loginPending;
  } finally {
    loginPending = null;
  }
}
async function performLogin(): Promise<CommunityUser> {
  const result =
    import.meta.env.DEV && import.meta.env.VITE_COMMUNITY_DEV_AUTH === "true"
      ? await communityRequest<{ token: string; user: CommunityUser }>(
          "/auth/dev",
          "POST",
          { identity: "browser-development" },
        )
      : await communityRequest<{ token: string; user: CommunityUser }>(
          "/auth/toss",
          "POST",
          await appLogin().catch(() => {
            throw new CommunityError(
              "LOGIN_CANCELLED",
              "로그인을 완료하지 않았어요. 운동 기록과 작성 내용은 유지돼요.",
            );
          }),
        );
  token = result.token;
  user = result.user;
  notify();
  return user;
}
export async function saveProfile(nickname: string) {
  const result = await communityRequest<{ user: CommunityUser }>(
    "/me",
    "PATCH",
    { nickname: nickname.trim(), rulesAccepted: true },
  );
  user = result.user;
  notify();
}
