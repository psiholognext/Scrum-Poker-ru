import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useAuth } from "wasp/client/auth";
import {
  useQuery,
  getDashboard,
  createTeam,
  createRoom,
  createInvitation,
  joinInvitation,
  createDemo,
  getRoomState,
  mutateRoom,
  setParticipantRole,
  revokeInvitation,
  updateProfile,
} from "wasp/client/operations";
import type { RoomView } from "./operations";
import { csvCell } from "./policy";
import { Results } from "./Results";

function errorText(e: unknown) {
  return e instanceof Error ? e.message : "Не удалось выполнить действие";
}
function guestKey(room: string) {
  return "poker-guest:" + room;
}
function rememberGuest(room: string, token?: string) {
  if (token) sessionStorage.setItem(guestKey(room), token);
}
function ErrorBox({ error }: { error: string }) {
  return error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : null;
}
async function copy(text: string) {
  await navigator.clipboard.writeText(text);
}

export function LandingPage() {
  return (
    <main>
      <section className="hero">
        <div>
          <p className="eyebrow">МЕНЬШЕ СПОРОВ · БОЛЬШЕ ОБЩЕГО ПОНИМАНИЯ</p>
          <h1>
            Хороший спринт
            <br />
            начинается <em>за одним столом.</em>
          </h1>
          <p className="lead">
            Оценивайте задачи вместе с командой. Приватные комнаты, независимые
            голоса и история решений — в одном месте.
          </p>
          <div className="actions">
            <Link className="button" to="/signup">
              Создать команду <span>↗</span>
            </Link>
            <Link className="button secondary" to="/demo">
              Попробовать без регистрации
            </Link>
          </div>
          <p className="muted">
            Гостям достаточно приглашения. Ведущий управляет раундом.
          </p>
        </div>
        <div className="hero-table panel">
          <div className="hero-people">
            <span>А</span>
            <span>М</span>
            <span>К</span>
          </div>
          <div className="mini-table">
            <small>ЗАДАЧА #12</small>
            <strong>
              Один раунд.
              <br />
              Общее решение.
            </strong>
            <div className="demo-cards">
              {["3", "5", "8"].map((v) => (
                <div key={v}>
                  {v}
                  <small>♠</small>
                </div>
              ))}
            </div>
            <span className="live-badge">● Команда на связи</span>
          </div>
        </div>
      </section>
      <section className="feature-grid">
        <article className="panel">
          <b>01</b>
          <h2>Одна команда</h2>
          <p>Общий кабинет, участники и приглашения с ограниченным сроком.</p>
        </article>
        <article className="panel">
          <b>02</b>
          <h2>Честная оценка</h2>
          <p>
            Значения голосов закрыты до команды ведущего. Каждый думает
            самостоятельно.
          </p>
        </article>
        <article className="panel">
          <b>03</b>
          <h2>История решений</h2>
          <p>Задачи и раунды сохраняются. Результаты можно выгрузить в CSV.</p>
        </article>
      </section>
    </main>
  );
}

export function DashboardPage() {
  const { data, error, isLoading, refetch } = useQuery(getDashboard);
  const { data: user, refetch: refetchUser } = useAuth();
  const navigate = useNavigate();
  const [teamName, setTeamName] = useState("");
  const [roomName, setRoomName] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<{ url: string; id: string } | null>(
    null,
  );
  const [profile, setProfile] = useState("");
  const active = data?.teams.find((t) => t.id === selected) ?? data?.teams[0];
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      await refetch();
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  if (isLoading) return <main className="loading">Загружаем ваш кабинет…</main>;
  return (
    <main className="workspace">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ВАШЕ РАБОЧЕЕ ПРОСТРАНСТВО</p>
          <h1>
            С возвращением, {user?.name || user?.username?.split("@")[0]}.
          </h1>
          <p className="muted">Команды, комнаты и результаты ваших встреч.</p>
        </div>
        <span className="badge">Команд: {data?.teams.length ?? 0}</span>
      </div>
      <ErrorBox error={message || (error ? errorText(error) : "")} />
      <div className="dashboard-grid">
        <aside className="panel sidebar">
          <h2>Мои команды</h2>
          {data?.teams.map((t) => (
            <button
              className={"team-link " + (active?.id === t.id ? "active" : "")}
              key={t.id}
              onClick={() => {
                setSelected(t.id);
                setInvite(null);
              }}
            >
              <span>{t.name}</span>
              <small>
                {t.role === "OWNER"
                  ? "Владелец"
                  : t.role === "ADMIN"
                    ? "Администратор"
                    : "Участник"}
              </small>
            </button>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const t = await createTeam({ name: teamName });
                setSelected(t.id);
                setTeamName("");
              });
            }}
          >
            <label>
              Новая команда
              <input
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                minLength={2}
                maxLength={80}
                required
                placeholder="Например, Product Team"
              />
            </label>
            <button disabled={busy} className="button secondary full">
              Создать команду
            </button>
          </form>
          <hr />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await updateProfile({ name: profile });
                await refetchUser();
              });
            }}
          >
            <label>
              Имя для новых комнат
              <input
                value={profile}
                placeholder={user?.name || "Ваше имя"}
                minLength={2}
                maxLength={30}
                required
                onChange={(e) => setProfile(e.target.value)}
              />
            </label>
            <button disabled={busy} className="button subtle full">
              Сохранить имя
            </button>
          </form>
        </aside>
        <section>
          {active ? (
            <>
              <div className="panel team-heading">
                <div>
                  <p className="eyebrow">КОМАНДА</p>
                  <h2>{active.name}</h2>
                  <p className="muted">Участников: {active.members.length}</p>
                </div>
                {["OWNER", "ADMIN"].includes(active.role) && (
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const x = await createInvitation({ teamId: active.id });
                        setInvite({
                          url: location.origin + "/invite/" + x.token,
                          id: x.id,
                        });
                      })
                    }
                  >
                    Пригласить в команду
                  </button>
                )}
              </div>
              {invite && (
                <div className="panel invite-panel">
                  <p>Одноразовое приглашение действует 7 дней.</p>
                  <input
                    readOnly
                    value={invite.url}
                    onFocus={(e) => e.target.select()}
                  />
                  <div className="actions">
                    <button
                      className="button small"
                      onClick={() => run(() => copy(invite.url))}
                    >
                      Копировать
                    </button>
                    <button
                      className="button subtle small"
                      onClick={() =>
                        run(async () => {
                          await revokeInvitation({ id: invite.id });
                          setInvite(null);
                        })
                      }
                    >
                      Отозвать
                    </button>
                  </div>
                </div>
              )}
              <div className="panel">
                <h2>Комнаты</h2>
                <form
                  className="inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(async () => {
                      const r = await createRoom({
                        teamId: active.id,
                        name: roomName,
                        taskTitle,
                      });
                      navigate("/room/" + r.id);
                    });
                  }}
                >
                  <input
                    required
                    minLength={2}
                    maxLength={80}
                    placeholder="Название комнаты"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                  />
                  <input
                    aria-label="Название первой задачи"
                    placeholder="Название первой задачи"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    required
                    maxLength={200}
                  />
                  <button className="button" disabled={busy}>
                    Создать комнату
                  </button>
                </form>
                <div className="room-list">
                  {active.rooms.map((r) => (
                    <Link key={r.id} to={"/room/" + r.id}>
                      <span className="room-symbol">♠</span>
                      <div>
                        <strong>{r.name}</strong>
                        <small>Участники команды и приглашённые гости</small>
                      </div>
                      <span>↗</span>
                    </Link>
                  ))}
                  {active.rooms.length === 0 && (
                    <p className="empty">
                      Создайте первую комнату и начните оценку задач.
                    </p>
                  )}
                </div>
              </div>
              <div className="panel">
                <h2>Участники команды</h2>
                {active.members.map((m) => (
                  <div className="member-row" key={m.id}>
                    <span>{m.name}</span>
                    <small>
                      {m.role === "OWNER"
                        ? "Владелец"
                        : m.role === "ADMIN"
                          ? "Администратор"
                          : "Участник"}
                    </small>
                  </div>
                ))}
                {active.invitations.length > 0 && (
                  <details>
                    <summary>Приглашения команды</summary>
                    {active.invitations.map((i) => (
                      <div className="member-row" key={i.id}>
                        <small>
                          До {new Date(i.expiresAt).toLocaleDateString("ru")} ·{" "}
                          {i.useCount}/{i.maxUses}
                        </small>
                        <button
                          className="button subtle small"
                          onClick={() =>
                            run(() => revokeInvitation({ id: i.id }))
                          }
                        >
                          Отозвать
                        </button>
                      </div>
                    ))}
                  </details>
                )}
              </div>
            </>
          ) : (
            <div className="panel empty">
              <h2>Здесь начнётся ваша команда</h2>
              <p>Создайте команду слева или откройте приглашение коллеги.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export function InvitePage() {
  const { token = "" } = useParams();
  const { data: user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await joinInvitation({
        token,
        name: name || user?.name || user?.username || undefined,
      });
      if (r.roomId) {
        rememberGuest(r.roomId, r.guestToken);
        navigate("/room/" + r.roomId);
      } else navigate("/app");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  function save() {
    sessionStorage.setItem("pendingInvite", "/invite/" + token);
  }
  return (
    <main className="auth-wrap">
      <section className="panel auth-panel">
        <p className="eyebrow">ВАС ПРИГЛАСИЛИ</p>
        <h1>Присоединяйтесь к команде</h1>
        <p className="muted">
          Для приглашения в комнату достаточно имени. Для вступления в команду
          нужен подтверждённый аккаунт.
        </p>
        <ErrorBox error={error} />
        <form onSubmit={join}>
          <label>
            Как вас представить?
            <input
              autoComplete="nickname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              maxLength={30}
              required={!user}
            />
          </label>
          <button className="button full" disabled={busy}>
            {busy ? "Подключаемся…" : "Принять приглашение"}
          </button>
        </form>
        {!user && (
          <p className="auth-links">
            <Link to="/login" onClick={save}>
              Войти
            </Link>{" "}
            ·{" "}
            <Link to="/signup" onClick={save}>
              Создать аккаунт
            </Link>
          </p>
        )}
      </section>
    </main>
  );
}
export function DemoPage() {
  const [name, setName] = useState("");
  const [taskTitle, setTaskTitle] = useState("Вход через Google");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  return (
    <main className="auth-wrap">
      <section className="panel auth-panel">
        <p className="eyebrow">ПОПРОБУЙТЕ БЕЗ РЕГИСТРАЦИИ</p>
        <h1>Один стол. Одна команда.</h1>
        <p className="muted">
          Демонстрационная комната доступна один час. Для постоянных комнат и
          команд создайте аккаунт.
        </p>
        <ErrorBox error={error} />
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const r = await createDemo({ name, taskTitle });
              rememberGuest(r.roomId, r.guestToken);
              navigate("/room/" + r.roomId);
            } catch (e) {
              setError(errorText(e));
              setBusy(false);
            }
          }}
        >
          <label>
            Ваше имя
            <input
              required
              minLength={2}
              maxLength={30}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Название задачи
            <input
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              required
              maxLength={200}
            />
          </label>
          <button className="button full" disabled={busy}>
            Открыть демо-комнату
          </button>
        </form>
      </section>
    </main>
  );
}

function useRoomState(roomId: string, guestToken?: string) {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    const abort = new AbortController();
    let denied = false;
    const accept = (v: RoomView) =>
      setRoom((old) => (!old || v.revision >= old.revision ? v : old));
    async function refresh() {
      const v = await getRoomState({ roomId, guestToken });
      if (!abort.signal.aborted) accept(v);
    }
    refreshRef.current = refresh;
    async function connect() {
      while (!abort.signal.aborted && !denied) {
        try {
          const v = await getRoomState({ roomId, guestToken });
          if (abort.signal.aborted) return;
          accept(v);
          setError("");
          const r = await fetch("/api/poker-stream/" + roomId, {
            headers: { Authorization: "Bearer " + v.streamTicket },
            signal: abort.signal,
            cache: "no-store",
          });
          if (!r.ok || !r.body) throw new Error("Нет соединения с комнатой");
          setConnected(true);
          const reader = r.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (!abort.signal.aborted) {
            const chunk = await reader.read();
            if (chunk.done) break;
            buffer += decoder.decode(chunk.value, { stream: true });
            let end;
            while ((end = buffer.indexOf("\n\n")) >= 0) {
              const packet = buffer.slice(0, end);
              buffer = buffer.slice(end + 2);
              const event = packet
                .split("\n")
                .find((x) => x.startsWith("event:"))
                ?.slice(6)
                .trim();
              const data = packet
                .split("\n")
                .find((x) => x.startsWith("data:"))
                ?.slice(5)
                .trim();
              if (event === "denied") {
                denied = true;
                setError("Доступ к комнате истёк или отозван");
              }
              if (event === "state" && data) accept(JSON.parse(data));
            }
          }
        } catch (e) {
          if (abort.signal.aborted) return;
          setError(errorText(e));
        }
        setConnected(false);
        if (!denied && !abort.signal.aborted)
          await new Promise((r) => setTimeout(r, 2000));
      }
    }
    setRoom(null);
    connect();
    return () => abort.abort();
  }, [roomId, guestToken]);
  return { room, error, connected, refresh: () => refreshRef.current() };
}

export function RoomPage() {
  const { roomId = "" } = useParams();
  const guestToken = sessionStorage.getItem(guestKey(roomId)) || undefined;
  const { room, error, connected, refresh } = useRoomState(roomId, guestToken);
  const [mutationError, setMutationError] = useState("");
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [editingVote, setEditingVote] = useState(false);
  useEffect(() => {
    setEditingTitle(null);
    setEditingVote(false);
  }, [room?.currentRound.id]);
  const [invite, setInvite] = useState<{ url: string; id: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const manager = room?.myRole === "FACILITATOR";
  const revealed = room?.currentRound.status === "REVEALED";
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setMutationError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setMutationError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  function csv() {
    if (!room) return;
    const rows = [
      ["Раунд", "Задача", "Участник", "Оценка"],
      ...room.history.flatMap((r) =>
        r.votes.map((v) => [r.number, r.title, v.name, v.value]),
      ),
    ];
    const content =
      "\uFEFF" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "scrum-poker-history.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  if (!room)
    return (
      <main className="workspace">
        <ErrorBox error={error} />
        <p>
          {error
            ? "Откройте действующее приглашение или войдите в аккаунт."
            : "Подключаемся к комнате…"}
        </p>
        <Link to="/app">Мой кабинет</Link>
      </main>
    );
  const me = room.participants.find((p) => p.id === room.me);
  return (
    <main className="workspace room-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {room.isDemo ? "ДЕМОНСТРАЦИЯ · СРОК 1 ЧАС" : "КОМНАТА КОМАНДЫ"}
          </p>
          <h1>{room.name}</h1>
        </div>
        <span className={"badge " + (connected ? "online" : "")}>
          {connected ? "● В сети" : "○ Переподключение"}
        </span>
      </div>
      <ErrorBox error={mutationError || error} />
      <div className="room-layout">
        <section>
          <div className="round-heading panel">
            <div>
              <small className="eyebrow">
                РАУНД {room.currentRound.number}
              </small>
              {editingTitle !== null ? (
                <form
                  className="inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(async () => {
                      await mutateRoom({
                        roomId,
                        guestToken,
                        type: "renameTask",
                        roundId: room.currentRound.id,
                        title: editingTitle,
                      });
                      setEditingTitle(null);
                    });
                  }}
                >
                  <input
                    aria-label="Название текущей задачи"
                    required
                    maxLength={200}
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                  />
                  <button className="button small" disabled={busy}>
                    Сохранить название
                  </button>
                  <button
                    type="button"
                    className="button subtle small"
                    onClick={() => setEditingTitle(null)}
                  >
                    Отмена
                  </button>
                </form>
              ) : (
                <>
                  <h2>{room.currentRound.title}</h2>
                  {manager && (
                    <button
                      className="button subtle small"
                      onClick={() => setEditingTitle(room.currentRound.title)}
                    >
                      Изменить название задачи
                    </button>
                  )}
                </>
              )}
            </div>
            <span className="muted">
              {
                room.participants.filter((p) => !p.isObserving && p.hasVoted)
                  .length
              }{" "}
              из {room.participants.filter((p) => !p.isObserving).length}{" "}
              проголосовали
            </span>
          </div>
          <div className="poker-table">
            <div className="table-center">
              <span className="eyebrow">
                {revealed ? "РЕЗУЛЬТАТЫ ОТКРЫТЫ" : "ОЦЕНИТЕ НЕЗАВИСИМО"}
              </span>
              <strong>
                {revealed ? "Обсудим оценки?" : "Каждый голос важен"}
              </strong>
              <p>
                {revealed
                  ? "Перед следующим раундом согласуйте решение."
                  : "Чужие оценки скрыты до раскрытия."}
              </p>
              {manager && !revealed && (
                <button
                  className="button"
                  disabled={busy || !room.participants.some((p) => p.hasVoted)}
                  onClick={() =>
                    run(() =>
                      mutateRoom({
                        roomId,
                        guestToken,
                        type: "reveal",
                        roundId: room.currentRound.id,
                      }),
                    )
                  }
                >
                  Раскрыть оценки
                </button>
              )}
            </div>
            <div className="seats">
              {room.participants
                .filter((p) => !p.isObserving)
                .map((p) => (
                  <div className="seat" key={p.id}>
                    <div className={"vote-card " + (p.hasVoted ? "voted" : "")}>
                      {p.vote ?? (p.hasVoted ? "✓" : "—")}
                    </div>
                    <strong>
                      {p.name}
                      {p.id === room.me ? " · вы" : ""}
                    </strong>
                    <small>
                      {p.role === "FACILITATOR"
                        ? "Ведущий"
                        : p.role === "OBSERVER"
                          ? "Наблюдатель"
                          : p.hasVoted
                            ? "Готово"
                            : "Выбирает карту"}
                    </small>
                  </div>
                ))}
            </div>
          </div>
          {room.currentRound.statistics && (
            <div className="panel">
              <Results stats={room.currentRound.statistics} />
            </div>
          )}
          <div className="actions room-controls">
            {room.myRole !== "OBSERVER" && (
              <button
                className="button subtle small"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    mutateRoom({
                      roomId,
                      guestToken,
                      type: "observe",
                      roundId: room.currentRound.id,
                      observing: !me?.isObserving,
                    }),
                  )
                }
              >
                {me?.isObserving
                  ? "Вернуться к голосованию"
                  : "Стать наблюдателем"}
              </button>
            )}
            {revealed && !me?.isObserving && room.myRole !== "OBSERVER" && (
              <button
                className="button secondary small"
                disabled={busy}
                onClick={() => setEditingVote((v) => !v)}
              >
                {editingVote ? "Закончить изменение" : "Изменить свою оценку"}
              </button>
            )}
            {revealed && manager && (
              <button
                className="button secondary small"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    mutateRoom({
                      roomId,
                      guestToken,
                      type: "revote",
                      roundId: room.currentRound.id,
                    }),
                  )
                }
              >
                Переголосовать эту задачу
              </button>
            )}
          </div>
          {(!revealed || editingVote) &&
            room.myRole !== "OBSERVER" &&
            !me?.isObserving && (
              <section className="deck panel">
                <p>
                  Ваша оценка{" "}
                  <small>
                    {revealed
                      ? "Изменение сразу увидит вся команда"
                      : "Она видна только вам до раскрытия"}
                  </small>
                </p>
                <div>
                  {room.currentRound.deck.map((v) => (
                    <button
                      className={
                        "playing-card " + (me?.vote === v ? "selected" : "")
                      }
                      disabled={busy}
                      key={v}
                      onClick={() =>
                        run(() =>
                          mutateRoom({
                            roomId,
                            guestToken,
                            type: revealed ? "amend" : "vote",
                            roundId: room.currentRound.id,
                            value: v,
                          }),
                        )
                      }
                    >
                      {v === "coffee" ? "☕" : v}
                      <small>♠</small>
                    </button>
                  ))}
                </div>
              </section>
            )}
          {revealed && manager && (
            <form
              className="panel inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await mutateRoom({
                    roomId,
                    guestToken,
                    type: "next",
                    roundId: room.currentRound.id,
                    title,
                  });
                  setTitle("");
                });
              }}
            >
              <input
                value={title}
                required
                maxLength={200}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Название следующей задачи"
              />
              <button className="button" disabled={busy}>
                Следующая задача →
              </button>
            </form>
          )}
        </section>
        <aside>
          <section className="panel">
            <h2>
              Участники{" "}
              <span className="muted">{room.participants.length}</span>
            </h2>
            {room.participants.map((p) => (
              <div className="participant-row" key={p.id}>
                <span className="avatar">
                  {p.name.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <strong>{p.name}</strong>
                  {manager && p.id !== room.me ? (
                    <select
                      aria-label={"Роль " + p.name}
                      value={p.role}
                      disabled={busy}
                      onChange={(e) =>
                        run(() =>
                          setParticipantRole({
                            roomId,
                            guestToken,
                            participantId: p.id,
                            role: e.target.value,
                          }),
                        )
                      }
                    >
                      <option value="PARTICIPANT">Участник</option>
                      <option value="OBSERVER">Наблюдатель</option>
                      <option value="FACILITATOR">Ведущий</option>
                      <option value="REMOVED">Удалить из комнаты</option>
                    </select>
                  ) : (
                    <small>
                      {p.isObserving
                        ? "Наблюдатель"
                        : p.role === "FACILITATOR"
                          ? "Ведущий"
                          : "Участник"}
                    </small>
                  )}
                </div>
              </div>
            ))}
            {manager && (
              <button
                className="button secondary full"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const i = await createInvitation({
                      roomId,
                      guestToken,
                    } as Parameters<typeof createInvitation>[0]);
                    setInvite({
                      url: location.origin + "/invite/" + i.token,
                      id: i.id,
                    });
                    setCopied(false);
                  })
                }
              >
                Пригласить гостей
              </button>
            )}
            {invite && (
              <div className="invite-panel">
                <p className="muted">
                  Ссылка на 7 дней, до 20 входов. Гостевой доступ — до 24 часов.
                </p>
                <input
                  readOnly
                  value={invite.url}
                  onFocus={(e) => e.target.select()}
                />
                <button
                  className="button small full"
                  onClick={() =>
                    run(async () => {
                      await copy(invite.url);
                      setCopied(true);
                    })
                  }
                >
                  {copied ? "Скопировано" : "Копировать ссылку"}
                </button>
                <button
                  className="button subtle small full"
                  onClick={() =>
                    run(async () => {
                      await revokeInvitation({ id: invite.id, guestToken });
                      setInvite(null);
                    })
                  }
                >
                  Отозвать приглашение
                </button>
              </div>
            )}
            {manager && room.invitations.length > 0 && (
              <details>
                <summary>Приглашения ({room.invitations.length})</summary>
                {room.invitations.map((i) => (
                  <div className="member-row" key={i.id}>
                    <small>
                      {i.useCount}/{i.maxUses} входов · до{" "}
                      {new Date(i.expiresAt).toLocaleDateString("ru")}
                    </small>
                    <button
                      className="button subtle small"
                      onClick={() =>
                        run(() => revokeInvitation({ id: i.id, guestToken }))
                      }
                    >
                      Отозвать
                    </button>
                  </div>
                ))}
              </details>
            )}
          </section>
          <section className="panel">
            <div className="section-heading">
              <h2>История раундов</h2>
              <button
                className="button subtle small"
                disabled={!room.history.length}
                onClick={csv}
              >
                CSV ↓
              </button>
            </div>
            {!room.history.length && (
              <p className="muted">Здесь появятся раскрытые раунды.</p>
            )}
            {room.history.map((r) => (
              <details key={r.id}>
                <summary>
                  #{r.number} · {r.title}
                </summary>
                <Results stats={r.statistics} compact />
                {r.votes.map((v, i) => (
                  <div className="member-row" key={i}>
                    <span>{v.name}</span>
                    <b>{v.value}</b>
                  </div>
                ))}
              </details>
            ))}
          </section>
        </aside>
      </div>
    </main>
  );
}
