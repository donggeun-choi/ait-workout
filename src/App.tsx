import {
  Asset,
  Badge,
  BottomCTA,
  Button,
  ListRow,
  TextArea,
  Top,
} from "@toss/tds-mobile";
import { useEffect, useRef, useState } from "react";
import { graniteEvent } from "@apps-in-toss/web-framework";
import "./App.css";
import { BannerAd } from "./BannerAd";
import {
  completedSetFeedback,
  recordStorage,
  usePlatformScreen,
} from "./platform";

type SetRow = { id: string; weight: string; reps: string; done: boolean };
type Exercise = { id: string; name: string; muscle: string; sets: SetRow[] };
type Session = {
  id: string;
  name: string;
  date: string;
  seconds: number;
  exercises: Exercise[];
  note: string;
};
type Draft = {
  name: string;
  started: number;
  exercises: Exercise[];
  note: string;
  restUntil: number | null;
};
type Saved = { sessions: Session[]; draft: Draft | null };
type Page = "home" | "workout" | "dashboard" | "routines";
const uid = () => crypto.randomUUID();
const catalog = [
  { name: "벤치 프레스", muscle: "가슴", weight: "40" },
  { name: "인클라인 덤벨 프레스", muscle: "가슴", weight: "16" },
  { name: "랫 풀다운", muscle: "등", weight: "35" },
  { name: "시티드 로우", muscle: "등", weight: "30" },
  { name: "스쿼트", muscle: "하체", weight: "50" },
  { name: "레그 프레스", muscle: "하체", weight: "80" },
  { name: "루마니안 데드리프트", muscle: "하체", weight: "40" },
  { name: "숄더 프레스", muscle: "어깨", weight: "20" },
  { name: "사이드 레터럴 레이즈", muscle: "어깨", weight: "5" },
  { name: "덤벨 컬", muscle: "팔", weight: "8" },
  { name: "트라이셉스 푸시다운", muscle: "팔", weight: "15" },
  { name: "크런치", muscle: "복근", weight: "0" },
];
const routines = [
  {
    name: "등 데이",
    subtitle: "등 중심",
    names: ["랫 풀다운", "시티드 로우"],
    tag: "등",
  },
  {
    name: "가슴 데이",
    subtitle: "가슴 중심",
    names: ["벤치 프레스", "인클라인 덤벨 프레스"],
    tag: "가슴",
  },
  {
    name: "푸시데이",
    subtitle: "가슴 · 어깨 · 삼두",
    names: [
      "벤치 프레스",
      "인클라인 덤벨 프레스",
      "숄더 프레스",
      "트라이셉스 푸시다운",
    ],
    tag: "푸시데이",
  },
  {
    name: "풀데이",
    subtitle: "등 · 이두",
    names: ["랫 풀다운", "시티드 로우", "덤벨 컬"],
    tag: "풀데이",
  },
  {
    name: "상체 루틴",
    subtitle: "가슴 · 등 · 어깨",
    names: ["벤치 프레스", "랫 풀다운", "시티드 로우", "숄더 프레스"],
    tag: "상체",
  },
  {
    name: "하체 루틴",
    subtitle: "하체 · 복근",
    names: ["스쿼트", "레그 프레스", "루마니안 데드리프트", "크런치"],
    tag: "하체",
  },
  {
    name: "전신 루틴",
    subtitle: "주요 근육을 골고루",
    names: ["스쿼트", "벤치 프레스", "랫 풀다운"],
    tag: "전신",
  },
];
const routineOptions: (number | null)[] = [
  null,
  ...routines.map((_, index) => index),
];
function makeExercise(name: string): Exercise {
  const item = catalog.find((x) => x.name === name)!;
  return {
    id: uid(),
    name,
    muscle: item.muscle,
    sets: Array.from({ length: 3 }, () => ({
      id: uid(),
      weight: item.weight,
      reps: "10",
      done: false,
    })),
  };
}
const dayKey = (date: string | Date) =>
  new Date(date).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
const dateLabel = (date: string | Date) =>
  new Date(date).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
const volume = (exercises: Exercise[]) =>
  exercises.reduce(
    (total, x) =>
      total +
      x.sets
        .filter((s) => s.done)
        .reduce((n, s) => n + Number(s.weight) * Number(s.reps), 0),
    0,
  );
const countSets = (exercises: Exercise[]) =>
  exercises.reduce((n, x) => n + x.sets.filter((s) => s.done).length, 0);
const number = (n: number) => Math.round(n).toLocaleString("ko-KR");
const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
function validExercises(value: unknown): value is Exercise[] {
  return (
    Array.isArray(value) &&
    value.every(
      (x) =>
        x &&
        typeof x.id === "string" &&
        typeof x.name === "string" &&
        typeof x.muscle === "string" &&
        Array.isArray(x.sets) &&
        x.sets.every(
          (s: SetRow) =>
            s &&
            typeof s.id === "string" &&
            typeof s.weight === "string" &&
            typeof s.reps === "string" &&
            typeof s.done === "boolean" &&
            Number.isFinite(Number(s.weight)) &&
            Number.isFinite(Number(s.reps)),
        ),
    )
  );
}
function load(raw: string | null): { data: Saved; error: boolean } {
  try {
    if (!raw) return { data: { sessions: [], draft: null }, error: false };
    const data = JSON.parse(raw);
    if (
      !Array.isArray(data.sessions) ||
      !data.sessions.every(
        (s: Session) =>
          s &&
          typeof s.id === "string" &&
          typeof s.name === "string" &&
          typeof s.date === "string" &&
          Number.isFinite(Date.parse(s.date)) &&
          Number.isFinite(s.seconds) &&
          typeof s.note === "string" &&
          validExercises(s.exercises),
      ) ||
      (data.draft !== null &&
        !(
          data.draft &&
          typeof data.draft.name === "string" &&
          Number.isFinite(data.draft.started) &&
          typeof data.draft.note === "string" &&
          validExercises(data.draft.exercises) &&
          (data.draft.restUntil === null ||
            Number.isFinite(data.draft.restUntil))
        ))
    )
      throw new Error("Invalid data");
    return { data, error: false };
  } catch {
    return { data: { sessions: [], draft: null }, error: true };
  }
}
function demoSessions(): Session[] {
  return [1, 3, 5, 8, 10, 12, 15, 17, 19, 22, 24, 26].map((days, i) => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    const r = routines[i % 2];
    const exercises = r.names.map(makeExercise).map((x) => ({
      ...x,
      sets: x.sets.map((s) => ({
        ...s,
        weight: String(Number(s.weight) + (12 - i) * 2.5),
        done: true,
      })),
    }));
    return {
      id: `demo-${i}`,
      name: r.name,
      date: date.toISOString(),
      seconds: 2400 + i * 60,
      exercises,
      note: "",
    };
  });
}
// Original inline SVG icons; no external artwork or Strong assets.
function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    home: (
      <>
        <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />
      </>
    ),
    workout: (
      <>
        <path d="m6 6 12 12M3 7l4-4m10 18 4-4M4 11l7-7m2 16 7-7M3 3l18 18" />
      </>
    ),
    dashboard: (
      <>
        <path d="M4 20V10m8 10V4m8 16v-7M2 21h20" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    arrow: <path d="m9 5 7 7-7 7" />,
    time: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    trophy: (
      <>
        <path d="M8 3h8v7a4 4 0 0 1-8 0ZM8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4m-4 2v6m-4 1h8" />
      </>
    ),
    search: (
      <>
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 5 5" />
      </>
    ),
    leaf: (
      <>
        <path d="M19 3c-9 0-15 3-15 9a7 7 0 0 0 7 7c6 0 8-7 8-16ZM5 19 15 9" />
      </>
    ),
  };
  return (
    <Asset.ContentIcon
      as="svg"
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        minWidth: size,
        maxWidth: size,
        minHeight: size,
        maxHeight: size,
        flexShrink: 0,
        display: "inline-block",
      }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.workout}
    </Asset.ContentIcon>
  );
}
function WorkoutApp({ initial }: { initial: ReturnType<typeof load> }) {
  const [data, setData] = useState<Saved>(initial.data);
  const [storageError, setStorageError] = useState(initial.error);
  const [page, setPage] = useState<Page>(() => {
    const tab = location.hash.slice(1);
    return tab === "workout" || tab === "dashboard" || tab === "routines"
      ? tab
      : "home";
  });
  const [selectedRoutine, setSelectedRoutine] = useState<number | null>(null);
  const [pendingRoutine, setPendingRoutine] = useState<number | null>(null);
  const [demo, setDemo] = useState(false);
  const [examples] = useState(demoSessions);
  const [now, setNow] = useState(Date.now());
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState("전체");
  const [detail, setDetail] = useState<Session | null>(null);
  const [finished, setFinished] = useState<Session | null>(null);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState(28);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const sheetAnimation = useRef<Animation | null>(null);
  const sheetClosing = useRef(false);
  const sheetBackPending = useRef(false);
  const afterSheetPage = useRef<Page | null>(null);
  const backHandler = useRef<() => void>(() => {});
  const [canGoBack, setCanGoBack] = useState(false);
  const screenKey = `${page}:${page === "workout" && !!data.draft}`;
  const sessions = demo ? examples : data.sessions;
  const draft = data.draft;
  const recentExerciseNames = [...data.sessions]
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .flatMap((session) => session.exercises.map((exercise) => exercise.name));
  const quickExercises = [
    ...new Set([...recentExerciseNames, "벤치 프레스", "랫 풀다운", "스쿼트"]),
  ]
    .map((name) => catalog.find((exercise) => exercise.name === name))
    .filter((exercise): exercise is (typeof catalog)[number] => !!exercise)
    .slice(0, 3);
  const saving = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  usePlatformScreen(page === "workout" && !!draft);
  useEffect(() => {
    mainRef.current?.toggleAttribute("inert", isSaving);
  }, [isSaving]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (initial.error) return;
    let active = true;
    void recordStorage.write(JSON.stringify(data)).then(
      () => {
        if (active) setStorageError(false);
      },
      () => {
        if (active) setStorageError(true);
      },
    );
    return () => {
      active = false;
    };
  }, [data, initial.error]);
  useEffect(() => {
    if (picker || detail || finished) {
      if (!history.state?.sheet) {
        history.pushState({ ...history.state, sheet: true }, "");
      }
      dialogRef.current?.showModal();
    } else dialogRef.current?.close();
  }, [picker, detail, finished]);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation = mainRef.current?.animate(
      [
        { opacity: 0.6, transform: "translateY(8px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 160, easing: "cubic-bezier(0.2, 0, 0, 1)" },
    );
    return () => animation?.cancel();
  }, [screenKey]);
  useEffect(
    () => () => {
      sheetAnimation.current?.cancel();
    },
    [],
  );
  useEffect(() => {
    if (!history.state?.workoutNavigation) {
      history.replaceState({ workoutNavigation: true, page, depth: 0 }, "");
    }
    setCanGoBack(history.state.depth > 0);
    const onBack = () => {
      backHandler.current();
    };
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, [page]);
  backHandler.current = () => {
    if (dialogRef.current?.open) {
      sheetBackPending.current = false;
      closeDialog();
      return;
    }
    const next = location.hash.slice(1);
    const destination: Page =
      next === "workout" || next === "dashboard" || next === "routines"
        ? next
        : "home";
    setPage(destination);
    if (history.state?.sheet) {
      history.replaceState({ ...history.state, sheet: false }, "");
    }
    if (destination === "routines") setPendingRoutine(selectedRoutine);
    setCanGoBack((history.state?.depth ?? 0) > 0);
    setError("");
    mainRef.current?.scrollTo(0, 0);
  };
  const platformBack = useRef<() => void>(() => {});
  platformBack.current = () => {
    if (dialogRef.current?.open) closeDialog();
    else if (page === "routines" && !canGoBack) leaveRoutines();
    else history.back();
  };
  const hasSheet = !!(picker || detail || finished);
  useEffect(() => {
    if (!hasSheet && !canGoBack && page !== "routines") return;
    return graniteEvent.addEventListener("backEvent", {
      onEvent: () => platformBack.current(),
      onError: () => setError("뒤로 이동하지 못했어요. 다시 시도해 주세요."),
    });
  }, [hasSheet, canGoBack, page]);
  function leaveRoutines() {
    setPendingRoutine(selectedRoutine);
    if (history.state?.depth > 0) history.back();
    else {
      history.replaceState(
        { workoutNavigation: true, page: "workout", depth: 0 },
        "",
        "#workout",
      );
      setPage("workout");
      setError("");
      mainRef.current?.scrollTo(0, 0);
    }
  }
  function navigate(next: Page) {
    setError("");
    if (next === "routines") setPendingRoutine(selectedRoutine);
    if (next !== page) {
      history.pushState(
        {
          workoutNavigation: true,
          page: next,
          depth: (history.state?.depth ?? 0) + 1,
        },
        "",
        `#${next}`,
      );
      setCanGoBack(true);
    }
    setPage(next);
    mainRef.current?.scrollTo(0, 0);
  }
  function closeDialog() {
    if (sheetClosing.current) return;
    if (history.state?.sheet) {
      if (sheetBackPending.current) return;
      sheetBackPending.current = true;
      history.back();
      return;
    }
    const sheet = dialogRef.current;
    const clear = () => {
      sheet?.close();
      if (sheet) delete sheet.dataset.closing;
      sheetClosing.current = false;
      sheetAnimation.current = null;
      setPicker(false);
      setDetail(null);
      setFinished(null);
      setQuery("");
      const next = afterSheetPage.current;
      afterSheetPage.current = null;
      if (next) navigate(next);
    };
    if (
      !sheet?.open ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      clear();
      return;
    }
    sheetClosing.current = true;
    sheet.dataset.closing = "true";
    const animation = sheet.animate(
      [
        { transform: "translateY(0)", opacity: 1 },
        { transform: "translateY(48px)", opacity: 0 },
      ],
      { duration: 150, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" },
    );
    sheetAnimation.current = animation;
    void animation.finished.then(
      () => {
        clear();
        animation.cancel();
      },
      () => {},
    );
  }
  async function persist(next: Saved) {
    if (initial.error) {
      setError(
        "저장된 기록을 읽지 못했어요. 페이지를 새로고침해 다시 시도해 주세요.",
      );
      return false;
    }
    try {
      await recordStorage.write(JSON.stringify(next));
      setData(next);
      setStorageError(false);
      return true;
    } catch {
      setStorageError(true);
      setError(
        "기기 저장 공간에 기록을 저장하지 못했어요. 저장 공간을 확인한 뒤 다시 시도해 주세요.",
      );
      return false;
    }
  }
  function updateDraft(update: (d: Draft) => Draft) {
    setData((current) =>
      current.draft ? { ...current, draft: update(current.draft) } : current,
    );
  }
  function start(names: string[], name: string) {
    setDemo(false);
    setError("");
    if (!draft)
      setData((current) => ({
        ...current,
        draft: {
          name,
          started: Date.now(),
          exercises: names.map(makeExercise),
          note: "",
          restUntil: null,
        },
      }));
    navigate("workout");
  }
  function toggleSet(exerciseId: string, row: SetRow) {
    if (
      !row.done &&
      (row.weight.trim() === "" ||
        row.reps.trim() === "" ||
        !Number.isFinite(Number(row.weight)) ||
        Number(row.weight) < 0 ||
        Number(row.weight) > 2000 ||
        !Number.isInteger(Number(row.reps)) ||
        Number(row.reps) < 1 ||
        Number(row.reps) > 999)
    ) {
      setError("무게는 0~2,000kg, 횟수는 1~999회로 입력해 주세요.");
      return;
    }
    setError("");
    if (!row.done) completedSetFeedback();
    updateDraft((d) => ({
      ...d,
      restUntil: !row.done ? Date.now() + 90000 : d.restUntil,
      exercises: d.exercises.map((x) =>
        x.id === exerciseId
          ? {
              ...x,
              sets: x.sets.map((s) =>
                s.id === row.id ? { ...s, done: !s.done } : s,
              ),
            }
          : x,
      ),
    }));
  }
  async function finish() {
    if (saving.current) return;
    if (!draft || !countSets(draft.exercises)) {
      setError("완료한 세트를 하나 이상 체크해 주세요.");
      return;
    }
    const session: Session = {
      id: uid(),
      name: draft.name,
      date: new Date().toISOString(),
      seconds: Math.max(1, Math.floor((Date.now() - draft.started) / 1000)),
      exercises: draft.exercises
        .map((x) => ({ ...x, sets: x.sets.filter((s) => s.done) }))
        .filter((x) => x.sets.length),
      note: draft.note,
    };
    saving.current = true;
    setIsSaving(true);
    if (await persist({ sessions: [session, ...data.sessions], draft: null })) {
      setError("");
      setFinished(session);
    }
    saving.current = false;
    setIsSaving(false);
  }
  const today = new Date(now);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
  const weekSessions = sessions.filter((s) => dayKey(s.date) >= dayKey(monday));
  const activeDays = new Set(weekSessions.map((s) => dayKey(s.date))).size;
  const weekVolumes = Array.from({ length: 4 }, (_, i) => {
    const start = new Date(monday);
    start.setDate(start.getDate() - (3 - i) * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return sessions
      .filter(
        (s) => dayKey(s.date) >= dayKey(start) && dayKey(s.date) < dayKey(end),
      )
      .reduce((n, s) => n + volume(s.exercises), 0);
  });
  const filtered = sessions.filter(
    (s) => Date.parse(s.date) >= now - period * 86400000,
  );
  const elapsed = draft
    ? Math.max(0, Math.floor((now - draft.started) / 1000))
    : 0;
  const rest = draft?.restUntil
    ? Math.min(90, Math.max(0, Math.ceil((draft.restUntil - now) / 1000)))
    : 0;
  function sessionRow(session: Session) {
    return (
      <button
        className="history-row"
        key={session.id}
        onClick={() => setDetail(session)}
      >
        <span className="tile-icon">
          <Icon name="workout" />
        </span>
        <span className="row-copy">
          <strong>{session.name}</strong>
          <span className="meta">
            {dateLabel(session.date)} ·{" "}
            {Math.max(1, Math.round(session.seconds / 60))}분 ·{" "}
            {countSets(session.exercises)}세트
          </span>
        </span>
        <Icon name="arrow" size={20} />
      </button>
    );
  }
  const stats = (items: Session[]) => (
    <div className="stats-grid">
      <div>
        <span className="meta">운동 횟수</span>
        <strong>{items.length}회</strong>
      </div>
      <div>
        <span className="meta">완료 세트</span>
        <strong>
          {items.reduce((n, s) => n + countSets(s.exercises), 0)}세트
        </strong>
      </div>
      <div>
        <span className="meta">총 운동량</span>
        <strong>
          {number(items.reduce((n, s) => n + volume(s.exercises), 0))}kg
        </strong>
      </div>
    </div>
  );
  function themePicker(expanded: boolean) {
    return (
      <details className="theme-picker" open={expanded || undefined}>
        <summary>
          추천 테마로 구성하기
          <Icon name="plus" size={16} />
        </summary>
        <div className="theme-options">
          {["등", "가슴", "하체", "푸시데이", "풀데이"].map((theme) => (
            <Button
              key={theme}
              size="medium"
              color="dark"
              variant="weak"
              onClick={() => {
                navigate("routines");
                setPendingRoutine(
                  routines.findIndex((routine) => routine.tag === theme),
                );
              }}
            >
              {theme}
            </Button>
          ))}
        </div>
      </details>
    );
  }
  return (
    <div className="app-shell" data-page={page}>
      <main ref={mainRef}>
        <div className="intro">
          <span className="eyebrow">
            <span className="brand-mark">
              <Icon name="leaf" size={16} />
            </span>{" "}
            운동노트
          </span>
          <button className="demo-toggle" onClick={() => setDemo(!demo)}>
            {demo ? "내 기록 보기" : "예시 보기"}
          </button>
        </div>
        {demo && (
          <div className="demo-banner">
            <Badge size="small" color="blue" variant="weak">
              예시 기록
            </Badge>
            <span>화면을 둘러보기 위한 샘플 데이터예요.</span>
          </div>
        )}
        {storageError && (
          <div className="notice" role="alert">
            {initial.error
              ? "저장된 기록을 읽지 못했어요. 기존 데이터를 보호하기 위해 저장을 멈췄어요."
              : "기기 저장이 안 되고 있어요. 새로고침 전에 다시 저장해 주세요."}
            <Button
              size="medium"
              variant="weak"
              onClick={() =>
                initial.error ? location.reload() : persist(data)
              }
            >
              다시 시도
            </Button>
          </div>
        )}
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        {page === "home" && (
          <>
            <section className="page-heading">
              <p className="meta">{dateLabel(today)}</p>
              <h1>오늘도, 한 세트씩</h1>
              <p>쌓이는 기록이 나의 변화를 만들어요.</p>
            </section>
            <section className="week-card">
              <div className="section-heading">
                <h2>이번 주 운동</h2>
                <Badge size="medium" color="blue" variant="weak">
                  {activeDays}일 완료
                </Badge>
              </div>
              <div className="week-strip">
                {days.map((d, i) => {
                  const done = sessions.some(
                    (s) => dayKey(s.date) === dayKey(d),
                  );
                  return (
                    <div
                      key={i}
                      className={`day ${dayKey(d) === dayKey(today) ? "today" : ""}`}
                    >
                      <span>
                        {["월", "화", "수", "목", "금", "토", "일"][i]}
                      </span>
                      <div className={done ? "day-bubble done" : "day-bubble"}>
                        {done ? <Icon name="check" size={19} /> : d.getDate()}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="week-footer">
                <Icon name="time" size={17} />
                <span>
                  이번 주{" "}
                  {Math.ceil(
                    weekSessions.reduce((n, s) => n + s.seconds, 0) / 60,
                  )}
                  분을 기록했어요
                </span>
              </div>
            </section>
            <section className="start-card">
              <div>
                <span className="small-label">나를 위한 시간</span>
                <h2>
                  {draft ? "이어서 기록할까요?" : "오늘의 운동을 시작해요"}
                </h2>
                <p>
                  {draft
                    ? `${draft.name} · ${countSets(draft.exercises)}세트 완료`
                    : "루틴을 고르고, 무게와 횟수만 남겨요."}
                </p>
              </div>
              <div className="workout-art">
                <Icon name="workout" size={24} />
                <span className="art-dot" />
              </div>
              <Button
                display="block"
                onClick={() =>
                  draft ? navigate("workout") : navigate("workout")
                }
              >
                {draft ? "진행 중인 운동 이어하기" : "운동 시작하기"}
              </Button>
            </section>
            <section>
              <div className="section-heading">
                <h2>최근 운동 기록</h2>
                <span className="meta">{sessions.length}개의 기록</span>
              </div>
              {sessions.length ? (
                sessions.slice(0, 3).map(sessionRow)
              ) : (
                <div className="empty-state">
                  <span className="tile-icon">
                    <Icon name="workout" size={24} />
                  </span>
                  <h3>첫 기록을 기다리고 있어요</h3>
                  <p>운동을 마치면 이곳에 차곡차곡 쌓여요.</p>
                </div>
              )}
            </section>
            <section className="tip">
              <Icon name="leaf" size={24} />
              <div>
                <strong>지난 기록이 다음 운동의 기준</strong>
                <p>무게보다 꾸준함에 집중해 보세요.</p>
              </div>
            </section>
          </>
        )}
        {page === "workout" && !draft && (
          <div className="workout-landing">
            <Top
              title={
                <Top.TitleParagraph size={22}>운동 기록</Top.TitleParagraph>
              }
              subtitleBottom={
                <Top.SubtitleParagraph size={15}>
                  오늘 할 운동을 준비해요
                </Top.SubtitleParagraph>
              }
            />
            <section className="prepared-workout" aria-label="시작할 운동">
              <p className="prepared-label">시작할 운동</p>
              <h2>
                {selectedRoutine === null
                  ? "자유 운동"
                  : routines[selectedRoutine].name}
              </h2>
              <p className="prepared-description">
                {selectedRoutine === null
                  ? "종목을 직접 추가하며 기록해요"
                  : `${routines[selectedRoutine].names.length}개 운동 · ${routines[selectedRoutine].names.length * 3}세트`}
              </p>
              {selectedRoutine !== null && (
                <div className="prepared-exercises">
                  {routines[selectedRoutine].names.map((name, i) => (
                    <div key={name}>
                      <span className="exercise-order">{i + 1}</span>
                      <span>{name}</span>
                    </div>
                  ))}
                </div>
              )}
              <ListRow
                as="button"
                type="button"
                className="routine-change-row"
                border="none"
                arrowType="right"
                withTouchEffect
                contents={
                  <ListRow.Texts
                    type="1RowTypeA"
                    top={
                      selectedRoutine === null
                        ? "추천 루틴에서 선택"
                        : "루틴 변경"
                    }
                    topProps={{ typography: "t6" }}
                  />
                }
                onClick={() => navigate("routines")}
              />
            </section>
            {themePicker(true)}
            <p className="workout-help">
              {selectedRoutine === null
                ? "운동을 시작하면 종목과 세트를 추가할 수 있어요."
                : "기본 무게와 횟수는 시작 후 조정할 수 있어요."}
            </p>
          </div>
        )}
        {page === "routines" && (
          <div className="routine-library">
            <Top
              title={
                <Top.TitleParagraph size={22}>루틴 선택</Top.TitleParagraph>
              }
              subtitleBottom={
                <Top.SubtitleParagraph size={15}>
                  오늘 할 운동에 맞는 루틴을 골라 주세요
                </Top.SubtitleParagraph>
              }
            />
            <div
              className="routine-options"
              role="radiogroup"
              aria-label="루틴 선택"
            >
              {routineOptions.map((index, optionPosition) => {
                const routine = index === null ? null : routines[index];
                const selected = pendingRoutine === index;
                return (
                  <ListRow
                    key={index ?? "free"}
                    as="button"
                    type="button"
                    className="routine-option"
                    id={`routine-option-${optionPosition}`}
                    role="radio"
                    tabIndex={selected ? 0 : -1}
                    border="none"
                    aria-checked={selected}
                    onKeyDown={(event) => {
                      const directions: Record<string, number> = {
                        ArrowDown: 1,
                        ArrowRight: 1,
                        ArrowUp: -1,
                        ArrowLeft: -1,
                      };
                      const direction = directions[event.key];
                      if (!direction) return;
                      event.preventDefault();
                      const next =
                        (optionPosition + direction + routineOptions.length) %
                        routineOptions.length;
                      setPendingRoutine(routineOptions[next]);
                      document
                        .getElementById(`routine-option-${next}`)
                        ?.focus();
                    }}
                    withTouchEffect
                    verticalPadding="large"
                    contents={
                      <ListRow.Texts
                        type="2RowTypeA"
                        top={routine?.name ?? "자유 운동"}
                        bottom={
                          routine
                            ? `${routine.subtitle} · ${routine.names.length}개 운동`
                            : "종목을 직접 추가하며 기록해요"
                        }
                        topProps={{ typography: "t6" }}
                        bottomProps={{ typography: "t6" }}
                      />
                    }
                    right={
                      <span
                        className={`routine-check ${selected ? "is-selected" : ""}`}
                        aria-hidden="true"
                      >
                        {selected && <Icon name="check" size={16} />}
                      </span>
                    }
                    onClick={() => setPendingRoutine(index)}
                  />
                );
              })}
            </div>
            {pendingRoutine !== null && (
              <section className="routine-preview">
                <h2>운동 구성</h2>
                {routines[pendingRoutine].names.map((name, i) => (
                  <ListRow
                    key={name}
                    border="none"
                    left={<span className="exercise-order">{i + 1}</span>}
                    contents={
                      <ListRow.Texts
                        type="1RowTypeA"
                        top={name}
                        topProps={{ typography: "t6" }}
                      />
                    }
                    right={<span className="routine-set-count">3세트</span>}
                  />
                ))}
                <p>무게와 횟수는 운동을 시작한 뒤 바꿀 수 있어요.</p>
              </section>
            )}
            <Button
              display="block"
              color="dark"
              variant="weak"
              onClick={leaveRoutines}
            >
              선택하지 않고 돌아가기
            </Button>
          </div>
        )}
        {page === "workout" && draft && (
          <>
            <section className="page-heading session-heading">
              <p className="live-label">
                <span /> 운동 진행 중
              </p>
              <h1>{draft.name}</h1>
              <div className="session-metrics">
                <span>
                  <Icon name="time" size={18} />
                  {clock(elapsed)}
                </span>
                <span>{countSets(draft.exercises)}세트</span>
                <span>{number(volume(draft.exercises))}kg</span>
              </div>
            </section>
            {draft.restUntil !== null && (
              <div className="rest-card" role="status">
                <div>
                  <Icon name="time" size={22} />
                  <strong>
                    {rest > 0 ? `휴식 ${clock(rest)}` : "휴식이 끝났어요"}
                  </strong>
                </div>
                <button
                  className="plain-button"
                  onClick={() =>
                    updateDraft((d) => ({ ...d, restUntil: null }))
                  }
                >
                  {rest > 0 ? "건너뛰기" : "닫기"}
                </button>
              </div>
            )}
            {draft.exercises.length === 0 && (
              <section
                className="quick-exercises"
                aria-labelledby="quick-exercises-title"
              >
                <h2 id="quick-exercises-title">첫 운동을 골라 주세요</h2>
                <p>
                  {recentExerciseNames.length
                    ? "최근 했던 운동을 바로 추가해요."
                    : "누르면 바로 세트를 기록할 수 있어요."}
                </p>
                <div className="quick-exercise-list">
                  {quickExercises.map((exercise) => (
                    <ListRow
                      key={exercise.name}
                      as="button"
                      type="button"
                      className="quick-exercise-row"
                      aria-label={`${exercise.name} 추가`}
                      withTouchEffect
                      contents={
                        <ListRow.Texts
                          type="1RowTypeA"
                          top={exercise.name}
                          topProps={{ typography: "t6" }}
                        />
                      }
                      right={
                        <span className="quick-exercise-action">
                          <span>{exercise.muscle}</span>
                          <Icon name="plus" size={16} />
                        </span>
                      }
                      onClick={() => {
                        const added = makeExercise(exercise.name);
                        updateDraft((current) =>
                          current.exercises.length
                            ? current
                            : { ...current, exercises: [added] },
                        );
                      }}
                    />
                  ))}
                </div>
                {themePicker(false)}
              </section>
            )}
            {draft.exercises.map((ex) => (
              <section className="exercise-card" key={ex.id}>
                <div className="section-heading">
                  <div>
                    <span className="meta">{ex.muscle}</span>
                    <h2>{ex.name}</h2>
                  </div>
                  <button
                    className="icon-button"
                    aria-label={`${ex.name} 삭제`}
                    onClick={() =>
                      updateDraft((d) => ({
                        ...d,
                        exercises: d.exercises.filter((x) => x.id !== ex.id),
                      }))
                    }
                  >
                    <Icon name="close" size={19} />
                  </button>
                </div>
                <div className="set-grid set-labels">
                  <span>세트</span>
                  <span>무게 kg</span>
                  <span>횟수</span>
                  <span>완료</span>
                </div>
                {ex.sets.map((s, i) => (
                  <div
                    className={`set-grid ${s.done ? "set-done" : ""}`}
                    key={s.id}
                  >
                    <span className="set-number">{i + 1}</span>
                    <input
                      aria-label={`${ex.name} ${i + 1}세트 무게`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max="2000"
                      step="0.5"
                      value={s.weight}
                      disabled={s.done}
                      onChange={(e) =>
                        updateDraft((d) => ({
                          ...d,
                          exercises: d.exercises.map((x) =>
                            x.id === ex.id
                              ? {
                                  ...x,
                                  sets: x.sets.map((row) =>
                                    row.id === s.id
                                      ? { ...row, weight: e.target.value }
                                      : row,
                                  ),
                                }
                              : x,
                          ),
                        }))
                      }
                    />
                    <input
                      aria-label={`${ex.name} ${i + 1}세트 횟수`}
                      type="number"
                      inputMode="numeric"
                      min="1"
                      max="999"
                      step="1"
                      value={s.reps}
                      disabled={s.done}
                      onChange={(e) =>
                        updateDraft((d) => ({
                          ...d,
                          exercises: d.exercises.map((x) =>
                            x.id === ex.id
                              ? {
                                  ...x,
                                  sets: x.sets.map((row) =>
                                    row.id === s.id
                                      ? { ...row, reps: e.target.value }
                                      : row,
                                  ),
                                }
                              : x,
                          ),
                        }))
                      }
                    />
                    <button
                      className={`check-button ${s.done ? "checked" : ""}`}
                      aria-label={`${ex.name} ${i + 1}세트 완료`}
                      aria-pressed={s.done}
                      onClick={() => toggleSet(ex.id, s)}
                    >
                      <Icon name="check" size={20} />
                    </button>
                  </div>
                ))}
                <button
                  className="add-set"
                  onClick={() =>
                    updateDraft((d) => ({
                      ...d,
                      exercises: d.exercises.map((x) =>
                        x.id === ex.id
                          ? {
                              ...x,
                              sets: [
                                ...x.sets,
                                {
                                  id: uid(),
                                  weight:
                                    x.sets[x.sets.length - 1]?.weight || "0",
                                  reps: x.sets[x.sets.length - 1]?.reps || "10",
                                  done: false,
                                },
                              ],
                            }
                          : x,
                      ),
                    }))
                  }
                >
                  <Icon name="plus" size={16} /> 세트 추가
                </button>
              </section>
            ))}
            {draft.exercises.length > 0 && (
              <Button
                display="block"
                variant="weak"
                onClick={() => {
                  setPicker(true);
                  setMuscle("전체");
                }}
              >
                운동 추가
              </Button>
            )}
            {(draft.exercises.length > 0 || draft.note) && (
              <div className="workout-note">
                <TextArea
                  variant="box"
                  labelOption="sustain"
                  label="운동 메모"
                  placeholder="오늘의 컨디션이나 다음 운동 목표를 남겨요"
                  value={draft.note}
                  onChange={(e) =>
                    updateDraft((d) => ({ ...d, note: e.target.value }))
                  }
                />
              </div>
            )}
            {draft.exercises.length > 0 && (
              <p className="footnote">체크한 세트만 기록에 저장돼요.</p>
            )}
          </>
        )}
        {page === "dashboard" && (
          <>
            <section className="page-heading">
              <p className="meta">기록으로 보는 나의 변화</p>
              <h1>꾸준함이 쌓이고 있어요</h1>
              <p>작은 기록에서 큰 변화를 발견해요.</p>
            </section>
            <div className="period-selector" aria-label="조회 기간">
              {[7, 28, 90].map((p) => (
                <button
                  key={p}
                  aria-pressed={p === period}
                  className={p === period ? "selected" : ""}
                  onClick={() => setPeriod(p)}
                >
                  {p === 7 ? "최근 1주" : p === 28 ? "최근 4주" : "최근 3개월"}
                </button>
              ))}
            </div>
            <section className="summary-card">
              <div className="section-heading">
                <h2>운동 요약</h2>
                <Badge size="small" color="blue" variant="weak">
                  최근 {period}일
                </Badge>
              </div>
              {stats(filtered)}
            </section>
            <section className="chart-card">
              <div className="section-heading">
                <div>
                  <h2>최근 4주 운동량</h2>
                  <p className="meta">완료한 세트의 무게 × 횟수</p>
                </div>
                <span className="meta">kg</span>
              </div>
              <div
                className="volume-chart"
                role="img"
                aria-label="최근 4주 주간 총 운동량"
              >
                {weekVolumes.map((v, i) => {
                  const max = Math.max(1, ...weekVolumes);
                  return (
                    <div className="chart-column" key={i}>
                      <span className="meta">{number(v)}</span>
                      <div className="bar-track">
                        <div
                          className={`bar ${i === 3 ? "current" : ""}`}
                          style={{
                            height: `${v ? Math.max(3, (v / max) * 100) : 0}%`,
                          }}
                        />
                      </div>
                      <span className="meta">
                        {i === 3 ? "이번 주" : `${3 - i}주 전`}
                      </span>
                    </div>
                  );
                })}
              </div>
              {!sessions.length && (
                <p className="footnote">
                  첫 운동을 기록하면 그래프가 채워져요.
                </p>
              )}
            </section>
            <section>
              <div className="section-heading">
                <h2>종목별 최고 기록</h2>
                <Icon name="trophy" size={21} />
              </div>
              <p className="meta section-description">
                선택한 기간의 최고 세트 무게예요.
              </p>
              {filtered.length ? (
                [
                  ...new Set(
                    filtered.flatMap((s) => s.exercises.map((x) => x.name)),
                  ),
                ].map((name) => {
                  const sets = filtered.flatMap((s) =>
                    s.exercises
                      .filter((x) => x.name === name)
                      .flatMap((x) => x.sets),
                  );
                  const best = sets.reduce((a, b) =>
                    Number(b.weight) > Number(a.weight) ||
                    (b.weight === a.weight && Number(b.reps) > Number(a.reps))
                      ? b
                      : a,
                  );
                  return (
                    <div className="record-row" key={name}>
                      <span>{name}</span>
                      <strong>
                        {best.weight}kg{" "}
                        <span className="meta">× {best.reps}회</span>
                      </strong>
                    </div>
                  );
                })
              ) : (
                <div className="empty-state">
                  <Icon name="trophy" size={24} />
                  <h3>나의 최고 기록을 만들어 봐요</h3>
                  <p>운동을 기록하면 종목별 기록을 확인할 수 있어요.</p>
                </div>
              )}
            </section>
            <p className="footnote">
              기록은 이 기기에 저장돼요. 기기 변경 시 자동으로 옮겨지지 않아요.
            </p>
          </>
        )}
        {page === "dashboard" && !draft && !demo && <BannerAd />}
      </main>
      {page !== "routines" && (
        <nav className="bottom-nav" aria-label="주요 메뉴">
          {(
            [
              { id: "home", label: "홈" },
              { id: "workout", label: "운동" },
              { id: "dashboard", label: "대시보드" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              aria-current={page === tab.id ? "page" : undefined}
              className={page === tab.id ? "active" : ""}
              onClick={() => navigate(tab.id)}
            >
              <span className="nav-icon">
                <Icon name={tab.id} />
              </span>
              <span>{tab.label}</span>
              {tab.id === "workout" && draft && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
      )}
      {(page === "workout" || page === "routines") && (
        <BottomCTA.Single
          disabled={isSaving}
          fixed
          takeSpace={false}
          hasSafeAreaPadding={page === "routines"}
          hasPaddingBottom={page === "routines"}
          containerStyle={{
            width: "min(100%, 480px)",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: page === "routines" ? 0 : "var(--nav-height)",
            paddingTop: 12,
            paddingBottom:
              page === "routines" ? "max(34px, var(--safe-bottom))" : 16,
            zIndex: 9,
          }}
          onClick={() => {
            if (page === "routines") {
              setSelectedRoutine(pendingRoutine);
              if (draft && !draft.exercises.length && pendingRoutine !== null) {
                const routine = routines[pendingRoutine];
                updateDraft((current) => ({
                  ...current,
                  name: routine.name,
                  exercises: routine.names.map(makeExercise),
                }));
              }
              leaveRoutines();
            } else if (draft && !draft.exercises.length) {
              setPicker(true);
              setMuscle("전체");
            } else if (draft) finish();
            else {
              const routine =
                selectedRoutine === null ? null : routines[selectedRoutine];
              start(routine?.names ?? [], routine?.name ?? "자유 운동");
            }
          }}
        >
          {page === "routines"
            ? pendingRoutine === null
              ? "자유 운동으로 선택"
              : `${routines[pendingRoutine].name} 선택`
            : draft
              ? !draft.exercises.length
                ? "다른 운동 찾기"
                : isSaving
                  ? "기록 저장 중"
                  : "운동 마치고 저장"
              : selectedRoutine === null
                ? "자유 운동 시작"
                : `${routines[selectedRoutine].name} 시작`}
        </BottomCTA.Single>
      )}
      <dialog
        ref={dialogRef}
        className="sheet"
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeDialog();
        }}
      >
        <div className="sheet-content">
          <div className="sheet-handle" />
          <div className="section-heading">
            <h2>
              {picker
                ? "운동 추가"
                : finished
                  ? "오늘의 운동 완료"
                  : "운동 기록"}
            </h2>
            <button
              className="icon-button"
              aria-label="닫기"
              onClick={closeDialog}
            >
              <Icon name="close" />
            </button>
          </div>
          {picker && (
            <>
              <label className="search-field">
                <Icon name="search" size={20} />
                <input
                  aria-label="운동 검색"
                  placeholder="운동 이름을 검색해요"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                />
              </label>
              <div className="muscle-filters">
                {["전체", "가슴", "등", "하체", "어깨", "팔", "복근"].map(
                  (m) => (
                    <button
                      key={m}
                      className={muscle === m ? "selected" : ""}
                      aria-pressed={muscle === m}
                      onClick={() => setMuscle(m)}
                    >
                      {m}
                    </button>
                  ),
                )}
              </div>
              <div className="picker-list">
                {catalog
                  .filter(
                    (x) =>
                      x.name.includes(query) &&
                      (muscle === "전체" || x.muscle === muscle),
                  )
                  .map((x) => (
                    <button
                      key={x.name}
                      className="picker-row"
                      onClick={() => {
                        if (sheetClosing.current) return;
                        updateDraft((d) => ({
                          ...d,
                          exercises: [...d.exercises, makeExercise(x.name)],
                        }));
                        closeDialog();
                      }}
                    >
                      <span>
                        <strong>{x.name}</strong>
                        <span className="meta">{x.muscle}</span>
                      </span>
                      <Icon name="plus" size={20} />
                    </button>
                  ))}
                {!catalog.some(
                  (x) =>
                    x.name.includes(query) &&
                    (muscle === "전체" || x.muscle === muscle),
                ) && (
                  <div className="empty-state">
                    <p>검색 결과가 없어요. 다른 이름으로 찾아보세요.</p>
                  </div>
                )}
              </div>
            </>
          )}
          {(detail || finished) &&
            (() => {
              const s = (detail || finished)!;
              return (
                <>
                  <div className="completion-icon">
                    <Icon name={finished ? "check" : "workout"} size={24} />
                  </div>
                  <h2 className="detail-title">{s.name}</h2>
                  <p className="meta detail-title">
                    {dateLabel(s.date)} ·{" "}
                    {Math.max(1, Math.round(s.seconds / 60))}분
                  </p>
                  {stats([s])}
                  {s.exercises.map((x) => (
                    <div className="detail-exercise" key={x.id}>
                      <strong>{x.name}</strong>
                      {x.sets.map((row, i) => (
                        <p key={row.id}>
                          <span className="meta">{i + 1}세트</span>
                          <span>
                            {row.weight}kg × {row.reps}회
                          </span>
                        </p>
                      ))}
                    </div>
                  ))}
                  {s.note && (
                    <p className="saved-note">
                      {s.note
                        .split(
                          /(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)/gu,
                        )
                        .map((part, i) =>
                          /\p{Extended_Pictographic}/u.test(part) ? (
                            <span className="tf" key={i}>
                              {part}
                            </span>
                          ) : (
                            part
                          ),
                        )}
                    </p>
                  )}
                  <Button
                    display="block"
                    onClick={() => {
                      if (finished) afterSheetPage.current = "home";
                      closeDialog();
                    }}
                  >
                    {finished ? "홈으로 돌아가기" : "확인"}
                  </Button>
                </>
              );
            })()}
        </div>
      </dialog>
    </div>
  );
}
let boot: Promise<ReturnType<typeof load>> | undefined;
function App() {
  const [initial, setInitial] = useState<ReturnType<typeof load> | null>(null);
  useEffect(() => {
    let active = true;
    boot ??= recordStorage
      .read()
      .then(async ({ raw, migrate }) => {
        const result = load(raw);
        if (migrate && raw !== null && !result.error) {
          try {
            await recordStorage.write(raw);
          } catch {
            return { ...result, error: true };
          }
        }
        return result;
      })
      .catch(() => ({ data: { sessions: [], draft: null }, error: true }));
    void boot.then((result) => {
      if (active) setInitial(result);
    });
    return () => {
      active = false;
    };
  }, []);
  return initial ? (
    <WorkoutApp initial={initial} />
  ) : (
    <div className="app-shell">
      <main role="status">운동 기록을 불러오고 있어요.</main>
    </div>
  );
}
export default App;
