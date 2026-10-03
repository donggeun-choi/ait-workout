import { Button, ListRow, TextArea } from "@toss/tds-mobile";
import { File as PlatformFile } from "@apps-in-toss/web-framework";
import { useEffect, useState } from "react";
import type { Exercise, Routine, Saved, Session } from "./workout-model";
import {
  backupJson,
  comparePeriods,
  exerciseTrend,
  mergeBackup,
  parseBackup,
  sessionsCsv,
  validSession,
  validSet,
  workoutDay,
} from "./workout-model";
const uid = () => crypto.randomUUID();
type Props = { data: Saved; persist: (next: Saved) => Promise<boolean> };
export function RecordActions({
  data,
  persist,
  session,
  onChange,
  onClose,
  onEditingChange,
}: Props & {
  onEditingChange?: (value: boolean) => void;
  session: Session;
  onChange: (session: Session) => void;
  onClose: () => void;
}) {
  const [edit, setEdit] = useState<Session | null>(null);
  useEffect(() => {
    onEditingChange?.(!!edit);
    return () => onEditingChange?.(false);
  }, [edit, onEditingChange]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!edit || !validSession(edit)) {
      setMessage(
        "날짜와 모든 세트의 무게 0~2,000kg · 횟수 1~999회를 확인해 주세요.",
      );
      return;
    }
    setBusy(true);
    const next = {
      ...data,
      sessions: data.sessions.map((s) => (s.id === edit.id ? edit : s)),
    };
    if (await persist(next)) {
      onChange(edit);
      setEdit(null);
      setMessage("수정했어요.");
    } else
      setMessage("저장하지 못했어요. 원본은 유지돼요. 다시 시도해 주세요.");
    setBusy(false);
  }
  return (
    <section className="personal-tools">
      {edit ? (
        <>
          <h3>기록 수정</h3>
          <label>
            운동 날짜
            <input
              type="date"
              value={
                Number.isFinite(Date.parse(edit.date))
                  ? workoutDay(edit.date)
                  : ""
              }
              onChange={(e) =>
                setEdit({
                  ...edit,
                  date: e.target.value
                    ? `${e.target.value}T12:00:00+09:00`
                    : "",
                })
              }
            />
          </label>
          {edit.exercises.map((ex, i) => (
            <div key={ex.id}>
              <strong>{ex.name}</strong>
              {ex.sets.map((row, j) => (
                <div className="personal-input-row" key={row.id}>
                  <span>{j + 1}세트</span>
                  {(["weight", "reps"] as const).map((field) => (
                    <input
                      key={field}
                      aria-label={`${ex.name} ${j + 1}세트 ${field === "weight" ? "무게 kg" : "횟수"}`}
                      type="number"
                      value={row[field]}
                      onChange={(e) =>
                        setEdit({
                          ...edit,
                          exercises: edit.exercises.map((x, k) =>
                            k === i
                              ? {
                                  ...x,
                                  sets: x.sets.map((r, n) =>
                                    n === j
                                      ? { ...r, [field]: e.target.value }
                                      : r,
                                  ),
                                }
                              : x,
                          ),
                        })
                      }
                    />
                  ))}
                  <Button
                    size="small"
                    onClick={() =>
                      setEdit({
                        ...edit,
                        exercises: edit.exercises
                          .map((x, k) =>
                            k === i
                              ? { ...x, sets: x.sets.filter((_, n) => n !== j) }
                              : x,
                          )
                          .filter((x) => x.sets.length),
                      })
                    }
                  >
                    삭제
                  </Button>
                </div>
              ))}
            </div>
          ))}
          <TextArea
            variant="box"
            label="메모"
            value={edit.note}
            onChange={(e) => setEdit({ ...edit, note: e.target.value })}
          />
          <Button disabled={busy} onClick={() => void save()}>
            수정 저장
          </Button>
          <Button
            onClick={() => {
              if (confirm("수정 중인 내용을 버릴까요?")) setEdit(null);
            }}
          >
            수정 취소
          </Button>
        </>
      ) : (
        <>
          <Button
            size="small"
            onClick={() => setEdit(structuredClone(session))}
          >
            기록 수정
          </Button>
          <Button
            size="small"
            onClick={() => {
              if (
                !confirm(
                  `${workoutDay(session.date)} ${session.name} 기록을 삭제할까요? 공개 인증은 별도로 남아 있어요.`,
                )
              )
                return;
              setBusy(true);
              void persist({
                ...data,
                sessions: data.sessions.filter((s) => s.id !== session.id),
              }).then((ok) => {
                setBusy(false);
                if (ok) onClose();
                else setMessage("삭제하지 못했어요. 다시 시도해 주세요.");
              });
            }}
            disabled={busy}
          >
            기록 삭제
          </Button>
          <Button
            size="small"
            onClick={() => {
              const name = prompt("루틴 이름", session.name);
              if (!name?.trim()) return;
              const routine: Routine = {
                id: uid(),
                name: name.trim(),
                exercises: session.exercises.map((x) => ({
                  ...x,
                  id: uid(),
                  sets: x.sets.map((row) => ({
                    ...row,
                    id: uid(),
                    done: false,
                  })),
                })),
              };
              void persist({
                ...data,
                routines: [...(data.routines ?? []), routine],
              }).then((ok) =>
                setMessage(
                  ok
                    ? "내 루틴에 저장했어요."
                    : "저장하지 못했어요. 다시 시도해 주세요.",
                ),
              );
            }}
          >
            이 구성을 루틴으로 저장
          </Button>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
export function PersonalRoutines({
  data,
  persist,
  onStart,
  catalog,
  onEditingChange,
}: Props & {
  onEditingChange?: (value: boolean) => void;
  onStart: (routine: Routine) => void;
  catalog: { name: string; muscle: string; weight: string }[];
}) {
  const [edit, setEdit] = useState<Routine | null>(null);
  useEffect(() => {
    onEditingChange?.(!!edit);
    return () => onEditingChange?.(false);
  }, [edit, onEditingChange]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="personal-tools">
      <h2>내 루틴</h2>
      {(data.routines ?? []).map((r) => (
        <div key={r.id}>
          <ListRow
            as="button"
            contents={
              <ListRow.Texts
                type="2RowTypeA"
                top={r.name}
                bottom={`${r.exercises.length}개 운동 · ${r.exercises.reduce((n, x) => n + x.sets.length, 0)}세트`}
              />
            }
            onClick={() => onStart(r)}
          />
          <Button size="small" onClick={() => setEdit(structuredClone(r))}>
            편집
          </Button>
          <Button
            size="small"
            onClick={() => {
              if (confirm(`${r.name} 루틴을 삭제할까요? 운동 기록은 유지돼요.`))
                void persist({
                  ...data,
                  routines: data.routines?.filter((x) => x.id !== r.id),
                }).then((ok) => {
                  if (!ok) setMessage("삭제하지 못했어요.");
                });
            }}
          >
            삭제
          </Button>
        </div>
      ))}
      <Button
        size="small"
        onClick={() => setEdit({ id: uid(), name: "", exercises: [] })}
      >
        루틴 만들기
      </Button>
      {edit && (
        <div className="personal-editor">
          <label>
            루틴 이름
            <input
              value={edit.name}
              maxLength={60}
              onChange={(e) => setEdit({ ...edit, name: e.target.value })}
            />
          </label>
          {edit.exercises.map((ex, i) => (
            <div key={ex.id}>
              <h3>{ex.name}</h3>
              <div className="personal-input-row">
                <label>
                  세트 수
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={ex.sets.length}
                    onChange={(e) => {
                      const count = Math.min(
                        30,
                        Math.max(1, Number(e.target.value) || 1),
                      );
                      setEdit({
                        ...edit,
                        exercises: edit.exercises.map((x, k) =>
                          k === i
                            ? {
                                ...x,
                                sets: Array.from({ length: count }, (_, j) => ({
                                  ...(x.sets[j] ?? x.sets[0]),
                                  id: x.sets[j]?.id ?? uid(),
                                  done: false,
                                })),
                              }
                            : x,
                        ),
                      });
                    }}
                  />
                </label>
                {(["weight", "reps"] as const).map((field) => (
                  <label key={field}>
                    {field === "weight" ? "기본 무게 kg" : "기본 횟수"}
                    <input
                      type="number"
                      value={ex.sets[0]?.[field] ?? ""}
                      onChange={(e) =>
                        setEdit({
                          ...edit,
                          exercises: edit.exercises.map((x, k) =>
                            k === i
                              ? {
                                  ...x,
                                  sets: x.sets.map((row) => ({
                                    ...row,
                                    [field]: e.target.value,
                                  })),
                                }
                              : x,
                          ),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <label>
                휴식
                <select
                  value={ex.restSeconds ?? 90}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      exercises: edit.exercises.map((x, k) =>
                        k === i
                          ? { ...x, restSeconds: Number(e.target.value) }
                          : x,
                      ),
                    })
                  }
                >
                  {[0, 60, 90, 120].map((n) => (
                    <option key={n} value={n}>
                      {n ? `${n}초` : "끄기"}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                size="small"
                disabled={i === 0}
                onClick={() => {
                  const items = [...edit.exercises];
                  [items[i - 1], items[i]] = [items[i], items[i - 1]];
                  setEdit({ ...edit, exercises: items });
                }}
              >
                위로 이동
              </Button>
              <Button
                size="small"
                disabled={i === edit.exercises.length - 1}
                onClick={() => {
                  const items = [...edit.exercises];
                  [items[i + 1], items[i]] = [items[i], items[i + 1]];
                  setEdit({ ...edit, exercises: items });
                }}
              >
                아래로 이동
              </Button>
              <Button
                size="small"
                onClick={() =>
                  setEdit({
                    ...edit,
                    exercises: edit.exercises.filter((_, k) => k !== i),
                  })
                }
              >
                종목 삭제
              </Button>
            </div>
          ))}
          <label>
            종목 추가
            <select
              value=""
              onChange={(e) => {
                const x = catalog.find((x) => x.name === e.target.value);
                if (x)
                  setEdit({
                    ...edit,
                    exercises: [
                      ...edit.exercises,
                      {
                        id: uid(),
                        name: x.name,
                        muscle: x.muscle,
                        restSeconds: 90,
                        sets: Array.from({ length: 3 }, () => ({
                          id: uid(),
                          weight: x.weight,
                          reps: "10",
                          done: false,
                        })),
                      },
                    ],
                  });
              }}
            >
              <option value="">종목 선택</option>
              {catalog.map((x) => (
                <option key={x.name}>{x.name}</option>
              ))}
            </select>
          </label>
          <Button
            disabled={busy}
            onClick={() => {
              if (
                !edit.name.trim() ||
                !edit.exercises.length ||
                !edit.exercises.every((x) => x.sets.every(validSet))
              ) {
                setMessage(
                  "이름과 종목 1개 이상, 유효한 무게·횟수를 입력해 주세요.",
                );
                return;
              }
              setBusy(true);
              void persist({
                ...data,
                routines: [
                  ...(data.routines ?? []).filter((x) => x.id !== edit.id),
                  { ...edit, name: edit.name.trim() },
                ],
              }).then((ok) => {
                setBusy(false);
                if (ok) {
                  setEdit(null);
                  setMessage("루틴을 저장했어요.");
                } else setMessage("저장하지 못했어요. 다시 시도해 주세요.");
              });
            }}
          >
            루틴 저장
          </Button>
          <Button
            onClick={() => {
              if (confirm("루틴 변경 내용을 버릴까요?")) setEdit(null);
            }}
          >
            취소
          </Button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
export function ExerciseTrends({ sessions }: { sessions: Session[] }) {
  const [period, setPeriod] = useState(28);
  const comparison = comparePeriods(sessions, period, Date.now());
  const names = [
    ...new Set(sessions.flatMap((s) => s.exercises.map((x) => x.name))),
  ];
  const [name, setName] = useState("");
  const selected = names.includes(name) ? name : names[0];
  const rows = selected ? exerciseTrend(sessions, selected) : [];
  return (
    <section className="personal-tools">
      <h2>기간 비교</h2>
      <label>
        비교 기간
        <select
          value={period}
          onChange={(e) => setPeriod(Number(e.target.value))}
        >
          {[7, 28, 84].map((n) => (
            <option key={n} value={n}>
              {n}일
            </option>
          ))}
        </select>
      </label>
      {comparison.comparable ? (
        <p>
          최근 {period}일 {comparison.current.workouts}회 ·{" "}
          {comparison.current.sets}세트 ·{" "}
          {comparison.current.volume.toLocaleString()}kg
          <br />
          이전 {period}일 {comparison.previous.workouts}회 ·{" "}
          {comparison.previous.sets}세트 ·{" "}
          {comparison.previous.volume.toLocaleString()}kg
        </p>
      ) : (
        <p>같은 길이의 두 기간에 기록이 있어야 비교할 수 있어요.</p>
      )}
      <p>운동량은 무게 × 횟수의 합이며 운동 강도나 칼로리가 아니에요.</p>
      <h2>종목별 추이</h2>
      {names.length ? (
        <>
          <label>
            종목
            <select value={selected} onChange={(e) => setName(e.target.value)}>
              {names.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <p>완료 세트 기준 · 맨몸 운동은 세트와 횟수로 확인해요.</p>
          <div className="trend-table">
            <table>
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>세트</th>
                  <th>횟수 합</th>
                  <th>최고 kg</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    <td>{workoutDay(row.date)}</td>
                    <td>{row.sets}</td>
                    <td>{row.reps}</td>
                    <td>{row.maxWeight}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p>운동을 저장하면 종목별 변화를 볼 수 있어요.</p>
      )}
    </section>
  );
}
export function DataManagement({
  data,
  persist,
  reservedNames = [],
}: Props & { reservedNames?: string[] }) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [incoming, setIncoming] = useState<Saved | null>(null);
  const [message, setMessage] = useState("");
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);
  function exportFile(content: string, name: string, type: string) {
    setOutput(content);
    if (PlatformFile.saveBase64.isSupported()) {
      const bytes = new TextEncoder().encode(content);
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      void PlatformFile.saveBase64({
        data: btoa(binary),
        fileName: name,
        mimeType: type,
      })
        .then(() => setMessage("백업 파일을 저장했어요."))
        .catch(() =>
          setMessage(
            "파일을 저장하지 못했어요. 아래 내용을 복사해 보관해 주세요.",
          ),
        );
      return;
    }
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage(
      "파일 저장을 지원하지 않는 환경에서는 아래 내용을 복사해 보관해 주세요.",
    );
  }
  const preview = incoming ? mergeBackup(data, incoming, reservedNames) : null;
  return (
    <section className="personal-tools">
      <Button size="small" onClick={() => setOpen(!open)}>
        {open ? "데이터 관리 닫기" : "백업·데이터 관리"}
      </Button>
      {open && (
        <>
          <h2>백업·복원</h2>
          <p>
            이 기기에 저장한 개인 기록이에요. 계정 동기화는 제공하지 않아요.
            JSON은 복원용, CSV는 열람용이에요. 진행 중인 운동은 백업에서
            제외돼요.
          </p>
          <Button
            size="small"
            onClick={() =>
              exportFile(
                backupJson(data),
                "workout-backup.json",
                "application/json",
              )
            }
          >
            JSON 백업
          </Button>
          <Button
            size="small"
            onClick={() =>
              exportFile(
                sessionsCsv(data.sessions),
                "workout-records.csv",
                "text/csv;charset=utf-8",
              )
            }
          >
            CSV 내보내기
          </Button>
          {output && (
            <TextArea
              variant="box"
              label="내보낸 내용 · 복사해 보관"
              value={output}
              readOnly
            />
          )}
          <label>
            JSON 백업 파일
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                setIncoming(null);
                if (file)
                  void file
                    .text()
                    .then(setRaw)
                    .catch(() => setMessage("파일을 읽지 못했어요."));
              }}
            />
          </label>
          <TextArea
            variant="box"
            label="JSON 붙여넣기"
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              setIncoming(null);
            }}
          />
          <Button
            size="small"
            onClick={() => {
              try {
                setIncoming(parseBackup(raw));
                setMessage("");
              } catch {
                setMessage(
                  "지원하지 않거나 손상된 백업이에요. 기존 기록은 바뀌지 않았어요.",
                );
              }
            }}
          >
            복원 미리보기
          </Button>
          {incoming && preview && (
            <>
              <p>
                {incoming.sessions.length}개 기록 ·{" "}
                {incoming.sessions.map((s) => workoutDay(s.date)).sort()[0] ??
                  "기간 없음"}{" "}
                ~{" "}
                {incoming.sessions
                  .map((s) => workoutDay(s.date))
                  .sort()
                  .slice(-1)[0] ?? ""}
              </p>
              <p>
                같은 항목 {preview.duplicates}개 · 충돌 {preview.conflicts}개.
                충돌은 현재 기기의 기록을 유지해요. 같은 이름의 종목은 추가하지
                않아요. 진행 중인 운동도 유지해요.
              </p>
              <Button
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  const snapshot = { ...data };
                  delete snapshot.preImportBackup;
                  void persist({
                    ...preview.data,
                    preImportBackup: JSON.stringify(snapshot),
                  }).then((ok) => {
                    setBusy(false);
                    if (ok) {
                      setIncoming(null);
                      setMessage(
                        "기존 기록과 병합했어요. 복원 직전 백업을 보관했어요.",
                      );
                    } else
                      setMessage("복원하지 못했어요. 기존 기록은 유지돼요.");
                  });
                }}
              >
                기존 기록과 병합
              </Button>
            </>
          )}
          {data.preImportBackup && (
            <Button
              size="small"
              onClick={() =>
                exportFile(
                  JSON.stringify(
                    { version: 1, data: JSON.parse(data.preImportBackup!) },
                    null,
                    2,
                  ),
                  "workout-before-import.json",
                  "application/json",
                )
              }
            >
              복원 직전 백업 내보내기
            </Button>
          )}
          <Button
            size="small"
            disabled={busy}
            onClick={() => {
              if (
                confirm(
                  "이 기기의 모든 운동 기록·초안·내 루틴·사용자 종목을 삭제할까요? 공개 인증은 별도로 남아 있어요. 먼저 JSON 백업을 권장해요.",
                )
              ) {
                setBusy(true);
                void persist({ sessions: [], draft: null }).then((ok) => {
                  setBusy(false);
                  setMessage(
                    ok
                      ? "개인 데이터를 삭제했어요."
                      : "삭제하지 못했어요. 기존 데이터를 유지해요.",
                  );
                });
              }
            }}
          >
            개인 데이터 전체 삭제
          </Button>
          {message && <p role="status">{message}</p>}
        </>
      )}
    </section>
  );
}
export function CustomExerciseCreator({
  data,
  persist,
  catalog,
  onAdded,
}: Props & {
  catalog: { name: string }[];
  onAdded: (exercise: Exercise) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [muscle, setMuscle] = useState("기타");
  const [mode, setMode] = useState<"weight" | "bodyweight">("weight");
  const [message, setMessage] = useState("");
  return (
    <section className="personal-tools">
      <Button size="small" onClick={() => setOpen(!open)}>
        사용자 종목 등록
      </Button>
      {open && (
        <>
          <label>
            종목 이름
            <input
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            부위
            <select value={muscle} onChange={(e) => setMuscle(e.target.value)}>
              {["가슴", "등", "하체", "어깨", "팔", "복근", "기타"].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label>
            기록 방식
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
            >
              <option value="weight">무게와 횟수</option>
              <option value="bodyweight">맨몸 · 횟수</option>
            </select>
          </label>
          <Button
            size="small"
            onClick={() => {
              const normalized = name
                .normalize("NFKC")
                .trim()
                .replace(/\s+/g, " ");
              if (
                !normalized ||
                catalog.some(
                  (x) =>
                    x.name
                      .normalize("NFKC")
                      .replace(/\s+/g, "")
                      .toLocaleLowerCase() ===
                    normalized.replace(/\s+/g, "").toLocaleLowerCase(),
                )
              ) {
                setMessage(
                  "이름을 입력해 주세요. 같은 이름은 기존 종목을 사용해 주세요.",
                );
                return;
              }
              const custom = { id: uid(), name: normalized, muscle, mode };
              void persist({
                ...data,
                customExercises: [...(data.customExercises ?? []), custom],
              }).then((ok) => {
                if (ok) {
                  onAdded({
                    id: uid(),
                    name: normalized,
                    muscle,
                    sets: Array.from({ length: 3 }, () => ({
                      id: uid(),
                      weight: "0",
                      reps: "10",
                      done: false,
                    })),
                  });
                  setOpen(false);
                  setName("");
                } else setMessage("저장하지 못했어요. 다시 시도해 주세요.");
              });
            }}
          >
            등록하고 추가
          </Button>
          {message && <p role="status">{message}</p>}
        </>
      )}
    </section>
  );
}
