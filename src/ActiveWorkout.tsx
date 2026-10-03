import { useContext, useEffect, useId, useRef, useState } from "react";
import { remainingRestSeconds } from "./workout-model";
import { ActiveWorkoutContext } from "./active-workout-context";
function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "down" ? (
        <path d="m6 9 6 6 6-6" />
      ) : name === "time" ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </>
      ) : name === "skip" ? (
        <>
          <path d="m5 5 9 7-9 7V5Z" />
          <path d="M19 5v14" />
        </>
      ) : (
        <path d="m6 6 12 12M6 18 18 6" />
      )}
    </svg>
  );
}
function time(seconds: number) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
function RestDurationPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (seconds: number) => void;
}) {
  const optionsId = useId();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div
      className="rest-setting"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        className="rest-picker-trigger"
        type="button"
        ref={trigger}
        aria-label={`기본 휴식 변경, 현재 ${value ? `${value}초` : "끄기"}`}
        aria-expanded={open}
        aria-controls={optionsId}
        onClick={() => setOpen(!open)}
      >
        {value ? `${value}초` : "끄기"}
        <Icon name="down" size={14} />
      </button>
      {open && (
        <div
          id={optionsId}
          className="rest-options"
          role="group"
          aria-label="기본 휴식 선택"
        >
          <p>기본 휴식</p>
          <div>
            {[0, 60, 90, 120].map((seconds) => (
              <button
                type="button"
                key={seconds}
                aria-pressed={value === seconds}
                onClick={() => {
                  onChange(seconds);
                  setOpen(false);
                  trigger.current?.focus();
                }}
              >
                {seconds ? `${seconds}초` : "끄기"}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function RestControls() {
  const active = useContext(ActiveWorkoutContext);
  if (!active) return null;
  const { draft, now, defaultSeconds } = active;
  const remaining = remainingRestSeconds(
    draft.restUntil,
    Math.max(now, Date.now()),
  );
  return (
    <section className="rest-panel" aria-label="공유 휴식 타이머">
      <div className="rest-summary">
        <Icon name="time" />
        <strong>
          {draft.restUntil === null
            ? defaultSeconds === 0
              ? "휴식 꺼짐"
              : "휴식 대기"
            : remaining > 0
              ? time(remaining)
              : "휴식 완료"}
        </strong>
      </div>
      <RestDurationPicker value={defaultSeconds} onChange={active.onDefault} />
      <button
        className="plain-button"
        aria-label={draft.restUntil === null ? "휴식 시작" : "휴식 30초 연장"}
        disabled={draft.restUntil === null && defaultSeconds === 0}
        onClick={draft.restUntil === null ? active.onStart : active.onExtend}
      >
        {draft.restUntil === null ? "시작" : "+30초"}
      </button>
      <button
        className="plain-button"
        disabled={draft.restUntil === null}
        aria-label={remaining > 0 ? "휴식 건너뛰기" : "휴식 닫기"}
        onClick={active.onSkip}
      >
        <Icon name={remaining > 0 ? "skip" : "close"} />
      </button>
    </section>
  );
}
export function ActiveWorkoutBar({ inline = false }: { inline?: boolean }) {
  const active = useContext(ActiveWorkoutContext);
  const [expanded, setExpanded] = useState(false);
  if (!active) return null;
  const { draft, now } = active;
  const remaining = remainingRestSeconds(
    draft.restUntil,
    Math.max(now, Date.now()),
  );
  return (
    <aside
      className={`active-workout-bar ${inline ? "is-inline" : ""}`}
      aria-label="진행 중인 운동"
    >
      {expanded && (
        <div className="active-rest-panel">
          <RestControls />
        </div>
      )}
      <div className="active-workout-row">
        <button
          className="active-workout-return"
          onClick={active.onReturn}
          aria-label="운동 이어하기"
        >
          <strong>{draft.name}</strong>
          <span>
            진행 중 ·{" "}
            {time(Math.max(0, Math.floor((now - draft.started) / 1000)))}
          </span>
        </button>
        <button
          className="active-rest-trigger"
          aria-expanded={expanded}
          aria-label="공유 휴식 타이머 열기"
          onClick={() => setExpanded(!expanded)}
        >
          <Icon name="time" />
          <span>
            {draft.restUntil === null
              ? "휴식 설정"
              : remaining > 0
                ? time(remaining)
                : "휴식 완료"}
          </span>
        </button>
      </div>
    </aside>
  );
}
