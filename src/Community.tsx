import {
  Asset,
  BottomCTA,
  Button,
  ListRow,
  Switch,
  Tab,
  TextArea,
  TextField,
  Top,
} from "@toss/tds-mobile";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { Session } from "./workout-model";
import {
  CommunityError,
  auth,
  communityRequest,
  graphemeCount,
  login,
  publicSnapshot,
  saveProfile,
  type CommunityPost,
  type Feed,
  type Snapshot,
  type Visibility,
} from "./community-api";
import "./community.css";
const message = (error: unknown) =>
  error instanceof Error ? error.message : "다시 시도해 주세요.";
function useAccount() {
  useSyncExternalStore(auth.subscribe, auth.revision);
  return auth.current();
}
function Modal({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    document.dispatchEvent(
      new CustomEvent("community-overlay-change", { detail: true }),
    );
    const handleBack = (event: Event) => {
      const detail = (event as CustomEvent<{ handled: boolean }>).detail;
      if (detail?.handled) return;
      if (detail) detail.handled = true;
      onClose();
    };
    document.addEventListener("community-back", handleBack);
    return () => {
      element?.close();
      document.dispatchEvent(
        new CustomEvent("community-overlay-change", { detail: false }),
      );
      document.removeEventListener("community-back", handleBack);
    };
    // Modal lifetime controls native history interception.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <dialog
      ref={dialog}
      className="community-overlay"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
function CommunityPolicy() {
  const [policy, setPolicy] = useState<{
    rules: string[];
    retentionDays: number;
    policyUrl: string | null;
    operatorContact: string | null;
  } | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void communityRequest<NonNullable<typeof policy>>("/policy")
      .then((value) => {
        if (active) {
          setPolicy(value);
          setError("");
        }
      })
      .catch((reason) => {
        if (active) setError(message(reason));
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  if (error)
    return (
      <div>
        <p role="status">운영 정책을 불러오지 못했어요. {error}</p>
        <Button
          variant="weak"
          size="small"
          onClick={() => setAttempt((n) => n + 1)}
        >
          정책 다시 보기
        </Button>
      </div>
    );
  if (!policy) return <p role="status">운영 정책을 확인하고 있어요.</p>;
  return (
    <div className="community-policy">
      {policy.rules.map((rule) => (
        <p key={rule}>{rule}</p>
      ))}
      <p>
        신고·운영 기록은 {policy.retentionDays}일 보관해요. 개인 기기의 운동
        기록은 커뮤니티 서버로 동기화하지 않아요.
      </p>
      <p>운영 문의: {policy.operatorContact || "운영 문의처 준비 중"}</p>
      {policy.policyUrl && /^https:\/\//.test(policy.policyUrl) ? (
        <a href={policy.policyUrl} target="_blank" rel="noreferrer">
          개인정보 처리 안내 보기
        </a>
      ) : (
        <p>개인정보 처리 안내를 준비 중이에요.</p>
      )}
    </div>
  );
}
function CloseIcon() {
  return (
    <Asset.ContentIcon
      as="svg"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      aria-hidden="true"
    >
      <path d="m6 6 12 12M18 6 6 18" />
    </Asset.ContentIcon>
  );
}
function Preview({ snapshot }: { snapshot: Snapshot }) {
  return (
    <div className="community-preview">
      <p>
        {snapshot.workoutDate} · {snapshot.exerciseCount}개 종목 ·{" "}
        {snapshot.completedSetCount}세트 완료
      </p>
      {snapshot.exercises?.map((e, i) => (
        <p key={i}>
          {e.name ?? `종목 ${i + 1}`}
          {e.sets?.map((s, j) => (
            <span className="community-set" key={j}>
              {j + 1}세트 {s.weight !== undefined ? `${s.weight}kg` : ""}
              {s.weight !== undefined && s.reps !== undefined ? " · " : ""}
              {s.reps !== undefined ? `${s.reps}회` : ""}
            </span>
          ))}
        </p>
      ))}
      {snapshot.comment && <p>{snapshot.comment}</p>}
    </div>
  );
}
export function ShareWorkout({
  session,
  onClose,
  onPublished,
}: {
  session: Session;
  onClose(): void;
  onPublished(): void;
}) {
  const account = useAccount();
  const [comment, setComment] = useState("");
  const [nickname, setNickname] = useState(account?.nickname ?? "");
  const [agreed, setAgreed] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>({
    names: false,
    weights: false,
    reps: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lastAccount = useRef(account?.id);
  useEffect(() => {
    if (
      account?.id &&
      lastAccount.current &&
      account.id !== lastAccount.current
    ) {
      setComment("");
      setNickname(account.nickname);
      setAgreed(false);
      setVisibility({ names: false, weights: false, reps: false });
      request.current = null;
    }
    if (account?.id) lastAccount.current = account.id;
  }, [account?.id, account?.nickname]);
  const request = useRef<{ payload: string; id: string } | null>(null);
  const mounted = useRef(true);
  const entryLogin = useRef<Promise<unknown> | null>(null);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    entryLogin.current ??= login();
    void entryLogin.current.catch((error) => {
      if (!active) return;
      if (error instanceof CommunityError && error.code === "LOGIN_CANCELLED")
        onClose();
      else setError(message(error));
    });
    return () => {
      active = false;
      mounted.current = false;
    };
    // Entry login is one attempt; subsequent reauthentication belongs to publish.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const snapshot = publicSnapshot(session, visibility, comment);
  async function publish() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (graphemeCount(comment) > 100)
        throw new Error("소감은 100자까지 적어 주세요.");
      const nextAccount = await login();
      if (!mounted.current) return;
      if (!nextAccount.rulesAccepted || !nextAccount.nickname) {
        const length = graphemeCount(nickname.trim());
        if (length < 2 || length > 12 || !agreed)
          throw new Error(
            "2~12자 닉네임과 커뮤니티 규칙 동의를 확인해 주세요.",
          );
        await saveProfile(nickname);
      }
      if (!mounted.current) return;
      const payload = JSON.stringify(snapshot);
      if (request.current?.payload !== payload)
        request.current = { payload, id: crypto.randomUUID() };
      await communityRequest("/posts", "POST", {
        ...snapshot,
        idempotencyKey: request.current.id,
      });
      if (mounted.current) onPublished();
    } catch (e) {
      if (mounted.current) setError(message(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <Modal onClose={onClose}>
      <section
        className="community-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="운동 인증 작성"
      >
        <div className="community-sheet-scroll">
          <div className="community-sheet-heading">
            <h2>운동 인증하기</h2>
            <Button
              variant="weak"
              size="small"
              aria-label="인증 작성 닫기"
              onClick={onClose}
            >
              <CloseIcon />
            </Button>
          </div>
          <p>앱 사용자 누구나 볼 수 있어요. 개인 메모는 공개하지 않아요.</p>
          <CommunityPolicy />
          {(!account?.rulesAccepted || !account.nickname) && (
            <>
              <TextField
                variant="box"
                label="서비스 닉네임"
                labelOption="sustain"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                help="2~12자 · 이름, 연락처 등 개인정보는 피해주세요"
              />
              <p>
                욕설·혐오, 광고·도배, 개인정보 노출을 금지해요. 위반 인증은
                숨기고 참여를 제한할 수 있어요.
              </p>
              <ListRow
                contents={
                  <ListRow.Texts
                    type="1RowTypeA"
                    top="커뮤니티 규칙에 동의해요"
                  />
                }
                right={
                  <Switch
                    aria-label="커뮤니티 규칙 동의"
                    checked={agreed}
                    onChange={(_, value) => setAgreed(value)}
                  />
                }
              />
            </>
          )}
          <TextArea
            variant="box"
            label="한 줄 소감 (선택)"
            labelOption="sustain"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            help={`${graphemeCount(comment)}/100자`}
            hasError={graphemeCount(comment) > 100}
          />
          {(
            [
              ["names", "종목명 공개"],
              ["weights", "무게 공개"],
              ["reps", "횟수 공개"],
            ] as const
          ).map(([key, label]) => (
            <ListRow
              key={key}
              contents={<ListRow.Texts type="1RowTypeA" top={label} />}
              right={
                <Switch
                  aria-label={label}
                  checked={visibility[key]}
                  onChange={(_, value) =>
                    setVisibility((v) => ({ ...v, [key]: value }))
                  }
                />
              }
            />
          ))}
          <p>무게와 횟수로 운동 종목을 추정할 수도 있어요.</p>
          <h3>공개 미리보기</h3>
          <p>{account?.nickname || nickname || "서비스 닉네임"}</p>
          <Preview snapshot={snapshot} />
          {account?.identityKind === "development" && (
            <p>개발용 테스트 계정이에요.</p>
          )}
          {error && (
            <p role="alert" className="community-error">
              {error}
            </p>
          )}
        </div>
        <BottomCTA.Single
          fixed={false}
          hasSafeAreaPadding
          containerStyle={{ paddingBottom: "max(34px, var(--safe-bottom))" }}
          onClick={() => void publish()}
          disabled={busy || graphemeCount(comment) > 100}
        >
          {busy ? "올리는 중" : "인증 올리기"}
        </BottomCTA.Single>
      </section>
    </Modal>
  );
}
export function Community({
  sessions,
  onWorkout,
  onShare,
  refreshKey = 0,
  initialTab = "latest",
}: {
  sessions: Session[];
  onWorkout(): void;
  onShare(session: Session): void;
  refreshKey?: number;
  initialTab?: "latest" | "mine";
}) {
  const account = useAccount();
  const [tab, setTab] = useState(initialTab === "mine" ? 1 : 0);
  const [feed, setFeed] = useState<Feed>({ posts: [], nextCursor: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState<CommunityPost | null>(null);
  const [settings, setSettings] = useState(false);
  const [blocks, setBlocks] = useState<{ id: string; nickname: string }[]>([]);
  const [withdraw, setWithdraw] = useState(false);
  const [notice, setNotice] = useState("");
  const serial = useRef(0);
  const actionLock = useRef(false);
  async function load(append = false) {
    const generation = ++serial.current;
    setBusy(true);
    setError("");
    try {
      if (tab === 1 && !auth.current()) {
        setFeed({ posts: [], nextCursor: null });
        return;
      }
      const result = await communityRequest<Feed>(
        `${tab === 1 ? "/me/posts" : "/feed"}${append && feed.nextCursor ? `?cursor=${encodeURIComponent(feed.nextCursor)}` : ""}`,
      );
      if (generation === serial.current)
        setFeed((previous) => ({
          ...result,
          posts: append
            ? [
                ...previous.posts,
                ...result.posts.filter(
                  (p) => !previous.posts.some((old) => old.id === p.id),
                ),
              ]
            : result.posts,
        }));
    } catch (e) {
      if (generation === serial.current) setError(message(e));
    } finally {
      if (generation === serial.current) setBusy(false);
    }
  }
  const accountId = account?.id;
  // Loading is intentionally keyed by route/account; feed cursor changes must not trigger automatic refresh.
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    setFeed({ posts: [], nextCursor: null });
    void load();
    return () => {
      serial.current++;
    };
  }, [tab, accountId, refreshKey]); // Account changes discard every prior response.
  /* eslint-enable react-hooks/exhaustive-deps */
  async function action(fn: () => Promise<void>) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    try {
      await login();
      await fn();
    } catch (e) {
      setError(message(e));
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }
  async function cheer(post: CommunityPost) {
    await action(async () => {
      if (auth.current()?.id === post.authorId)
        throw new Error("내 인증에는 응원할 수 없어요.");
      const result = await communityRequest<{ post: CommunityPost }>(
        `/posts/${post.id}/cheer`,
        "PUT",
        { active: !post.cheeredByMe },
      );
      setFeed((f) => ({
        ...f,
        posts: f.posts.map((p) => (p.id === post.id ? result.post : p)),
      }));
    });
  }
  async function remove(path: string, method: string, body?: unknown) {
    if (!menu) return;
    const target = menu;
    await action(async () => {
      await communityRequest(path, method, body);
      setFeed((f) => ({
        ...f,
        posts: f.posts.filter(
          (p) =>
            p.id !== target.id &&
            (body && "active" in (body as object)
              ? p.authorId !== target.authorId
              : true),
        ),
      }));
      setMenu(null);
    });
  }
  return (
    <section className="community">
      <Top
        title={
          <Top.TitleParagraph size={22}>함께 이어가는 운동</Top.TitleParagraph>
        }
      />
      {notice && <p role="status">{notice}</p>}
      <Tab onChange={setTab}>
        <Tab.Item selected={tab === 0}>최신 인증</Tab.Item>
        <Tab.Item selected={tab === 1}>내 인증</Tab.Item>
      </Tab>
      <div className="community-actions">
        <Button
          variant="weak"
          size="small"
          disabled={busy}
          onClick={() => void load()}
        >
          새로고침
        </Button>
        <Button
          variant="weak"
          size="small"
          disabled={busy}
          onClick={() =>
            void action(async () => {
              const result = await communityRequest<{
                users: { id: string; nickname: string }[];
              }>("/blocks");
              setBlocks(result.users);
              setSettings(true);
            })
          }
        >
          계정·차단 관리
        </Button>
      </div>
      {!account && (
        <p>
          인증은 로그인 없이 볼 수 있어요. 응원·게시·신고·차단할 때 로그인해요.
          로그아웃 상태에서는 차단 필터가 적용되지 않아요.
        </p>
      )}
      {account?.identityKind === "development" && (
        <p>개발용 테스트 계정 · 운영 커뮤니티가 아니에요.</p>
      )}
      {tab === 1 && !account && (
        <Button disabled={busy} onClick={() => void action(async () => {})}>
          로그인하고 내 인증 보기
        </Button>
      )}
      {error && (
        <p role="alert" className="community-error">
          {error}
        </p>
      )}
      {busy && <p role="status">불러오는 중이에요.</p>}
      {!busy && !feed.posts.length && !error && (
        <>
          <p>
            {tab === 1
              ? "아직 올린 운동 인증이 없어요"
              : "아직 운동 인증이 없어요"}
          </p>
          <Button variant="weak" onClick={onWorkout}>
            운동 기록하기
          </Button>
        </>
      )}
      {tab === 1 && sessions.length > 0 && (
        <details>
          <summary>저장한 운동 인증하기</summary>
          {sessions.slice(0, 20).map((s) => (
            <ListRow
              key={s.id}
              contents={
                <ListRow.Texts
                  type="2RowTypeA"
                  top={s.name}
                  bottom={s.date.slice(0, 10)}
                />
              }
              right={
                <Button variant="weak" size="small" onClick={() => onShare(s)}>
                  인증하기
                </Button>
              }
            />
          ))}
        </details>
      )}
      {feed.posts.map((post) => (
        <article className="community-post" key={post.id}>
          <div className="community-post-heading">
            <h3>{post.nickname}</h3>
            <Button
              variant="weak"
              size="small"
              aria-label={`${post.nickname} 인증 메뉴`}
              disabled={busy}
              onClick={() => setMenu(post)}
            >
              더보기
            </Button>
          </div>
          <Preview snapshot={post} />
          <Button
            variant={post.cheeredByMe ? "fill" : "weak"}
            size="small"
            disabled={busy || post.isMine}
            aria-pressed={post.cheeredByMe}
            onClick={() => void cheer(post)}
          >
            {post.isMine
              ? "받은 응원"
              : post.cheeredByMe
                ? "응원 취소"
                : "응원하기"}{" "}
            {post.cheerCount}
          </Button>
        </article>
      ))}
      {feed.nextCursor && (
        <Button variant="weak" disabled={busy} onClick={() => void load(true)}>
          더 보기
        </Button>
      )}
      {menu && (
        <Modal onClose={() => setMenu(null)}>
          <section
            className="community-sheet community-menu"
            role="dialog"
            aria-modal="true"
            aria-label="인증 메뉴"
          >
            <div className="community-sheet-heading">
              <h2>인증 메뉴</h2>
              <Button
                variant="weak"
                size="small"
                aria-label="메뉴 닫기"
                onClick={() => setMenu(null)}
              >
                <CloseIcon />
              </Button>
            </div>
            {menu.isMine ? (
              <>
                <p>공개 인증만 삭제해요. 개인 운동 기록은 그대로 남아요.</p>
                <Button
                  color="danger"
                  disabled={busy}
                  onClick={() => void remove(`/posts/${menu.id}`, "DELETE")}
                >
                  인증 삭제하기
                </Button>
              </>
            ) : (
              <>
                <p>신고하면 이 인증을 내 화면에서 숨겨요.</p>
                {(
                  [
                    ["abuse", "욕설·혐오"],
                    ["spam", "광고·도배"],
                    ["privacy", "개인정보 노출"],
                    ["other", "기타"],
                  ] as const
                ).map(([reason, label]) => (
                  <Button
                    variant="weak"
                    key={reason}
                    disabled={busy}
                    onClick={() =>
                      void remove(`/posts/${menu.id}/report`, "POST", {
                        reason,
                      })
                    }
                  >
                    {label} 신고
                  </Button>
                ))}
                <Button
                  variant="weak"
                  disabled={busy}
                  onClick={() =>
                    void remove(`/blocks/${menu.authorId}`, "PUT", {
                      active: true,
                    })
                  }
                >
                  이 작성자 차단
                </Button>
              </>
            )}
            {error && <p role="alert">{error}</p>}
          </section>
        </Modal>
      )}
      {settings && (
        <Modal
          onClose={() => {
            setSettings(false);
            setWithdraw(false);
          }}
        >
          <section
            className="community-sheet community-menu"
            role="dialog"
            aria-modal="true"
            aria-label="계정 및 차단 관리"
          >
            <div className="community-sheet-heading">
              <h2>계정·차단 관리</h2>
              <Button
                variant="weak"
                size="small"
                aria-label="계정 관리 닫기"
                onClick={() => {
                  setSettings(false);
                  setWithdraw(false);
                }}
              >
                <CloseIcon />
              </Button>
            </div>
            <p>{account?.nickname || "닉네임 미설정"}</p>
            <CommunityPolicy />
            {!blocks.length && <p>차단한 사용자가 없어요.</p>}
            {blocks.map((person) => (
              <ListRow
                key={person.id}
                contents={
                  <ListRow.Texts type="1RowTypeA" top={person.nickname} />
                }
                right={
                  <Button
                    variant="weak"
                    size="small"
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        await communityRequest(`/blocks/${person.id}`, "PUT", {
                          active: false,
                        });
                        setBlocks((b) => b.filter((p) => p.id !== person.id));
                      })
                    }
                  >
                    차단 해제
                  </Button>
                }
              />
            ))}
            <Button
              variant="weak"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await communityRequest("/auth/session", "DELETE");
                  auth.clear();
                  setSettings(false);
                })
              }
            >
              로그아웃
            </Button>
            {withdraw ? (
              <>
                <p>
                  탈퇴하면 공개 인증·응원·차단 정보가 삭제돼요. 이 기기의 개인
                  운동 기록은 삭제하지 않아요.
                </p>
                <Button
                  color="danger"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      const result = await communityRequest<{
                        ok: true;
                        remoteDisconnected: boolean;
                      }>("/me", "DELETE");
                      setNotice(
                        result.remoteDisconnected
                          ? "커뮤니티에서 탈퇴했어요. 이 기기의 개인 운동 기록은 그대로 남아요."
                          : "커뮤니티 데이터는 삭제했어요. 토스 앱의 연결 관리에서 로그인 연결도 해제해 주세요. 이 기기의 개인 운동 기록은 그대로 남아요.",
                      );
                      auth.clear();
                      setSettings(false);
                      setWithdraw(false);
                    })
                  }
                >
                  커뮤니티 탈퇴 확정
                </Button>
                <Button variant="weak" onClick={() => setWithdraw(false)}>
                  취소
                </Button>
              </>
            ) : (
              <Button variant="weak" onClick={() => setWithdraw(true)}>
                커뮤니티 탈퇴
              </Button>
            )}
            {error && <p role="alert">{error}</p>}
          </section>
        </Modal>
      )}
    </section>
  );
}
