import { useLayoutEffect, useRef } from "react";
import type { RoomView } from "./operations";
import { TargetReactions } from "./RoomFun";
import type { InteractionKind } from "./live";
type Player = RoomView["participants"][number];
function DealtCard({
  player,
  value,
  hidden,
  animateDeal,
}: {
  player: Player;
  value: string | null;
  hidden: boolean;
  animateDeal: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const card = ref.current;
    const seat = document.querySelector(
      `[data-player-seat="${player.id}"] .seat-avatar`,
    );
    if (
      !animateDeal ||
      !card ||
      !seat ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const from = seat.getBoundingClientRect(),
      to = card.getBoundingClientRect();
    const dx = from.left + from.width / 2 - to.left - to.width / 2;
    const dy = from.top + from.height / 2 - to.top - to.height / 2;
    const tilt = dx < 0 ? -15 : 15;
    const animation = card.animate(
      [
        {
          transform: `translate(${dx}px,${dy}px) rotate(${tilt}deg) scale(.72)`,
          opacity: 0.25,
        },
        {
          transform: `translate(${dx * 0.38}px,${dy * 0.38 - 30}px) rotate(${tilt * 0.6}deg) scale(1.08)`,
          opacity: 1,
          offset: 0.55,
        },
        { transform: "translateY(3px) rotate(-2deg) scale(.97)", offset: 0.88 },
        { transform: "translate(0,0) rotate(0) scale(1)", opacity: 1 },
      ],
      { duration: 520, easing: "cubic-bezier(.22,.68,.3,1)" },
    );
    return () => animation.cancel();
  }, [player.id, animateDeal]);
  return (
    <div className="table-played-card" data-card-player={player.id} ref={ref}>
      <div
        className={`vote-card voted ${hidden ? "card-hidden" : "card-open"}`}
        data-vote-value={hidden ? "hidden" : (value ?? "")}
        aria-label={`Карта ${player.name}: ${hidden ? "скрыта" : value}`}
      >
        <span>{hidden ? "♠" : value === "coffee" ? "☕" : value}</span>
      </div>
      <small title={player.name}>{player.name}</small>
    </div>
  );
}
export function PokerTable({
  room,
  optimisticVote,
  busy,
  reveal,
  send,
}: {
  room: RoomView;
  optimisticVote: string | null;
  busy: boolean;
  reveal: () => void;
  send: (kind: InteractionKind, targetId?: string) => void;
}) {
  const players = room.participants.filter((p) => !p.isObserving);
  const revealed = room.currentRound.status === "REVEALED";
  const voted = players.filter(
    (p) => p.hasVoted || (p.id === room.me && optimisticVote !== null),
  );
  return (
    <div
      className={`table-arena ${players.length > 6 ? "many-players" : ""}`}
      aria-label="Игровой стол"
    >
      <div className="poker-table">
        <div className="table-center">
          <span className="felt-mark" aria-hidden="true">
            ♠
          </span>
          <span className="eyebrow">
            {revealed ? "ОЦЕНКИ ОТКРЫТЫ" : "ГОЛОСОВАНИЕ"}
          </span>
          <strong>
            {revealed
              ? "Обсудим оценки?"
              : voted.length
                ? "Карты на столе"
                : "Выберите свою оценку"}
          </strong>
          <div className="table-cards" aria-label="Карты в центре стола">
            {voted.map((p) => (
              <DealtCard
                key={room.currentRound.id + ":" + p.id}
                player={p}
                animateDeal={!revealed}
                hidden={!revealed && p.id !== room.me}
                value={
                  p.id === room.me && optimisticVote !== null
                    ? optimisticVote
                    : p.vote
                }
              />
            ))}
          </div>
          {!voted.length && <p>Карты появятся здесь после выбора</p>}
          {room.myRole === "FACILITATOR" && !revealed && (
            <button
              className="button small reveal-button"
              disabled={busy || !voted.length}
              onClick={reveal}
            >
              Раскрыть оценки
            </button>
          )}
        </div>
      </div>
      <div className="seats">
        {players.map((p, index) => {
          const angle =
            -Math.PI / 2 + (index * 2 * Math.PI) / Math.max(players.length, 1);
          const x = 50 + 43 * Math.cos(angle),
            y = 50 + 38 * Math.sin(angle);
          const ready =
            p.hasVoted || (p.id === room.me && optimisticVote !== null);
          return (
            <div
              className={`seat perimeter-seat ${ready ? "seat-ready" : ""}`}
              style={{ left: `${x}%`, top: `${y}%` }}
              data-player-seat={p.id}
              key={p.id}
            >
              {p.id === room.me ? (
                <div className="seat-avatar self-avatar">
                  {p.name.slice(0, 1).toUpperCase()}
                  <i className={ready ? "ready-dot" : ""} />
                </div>
              ) : (
                <details className="seat-menu">
                  <summary
                    aria-label={`Взаимодействовать: ${p.name}`}
                    title={`Реакции для ${p.name}`}
                  >
                    <span className="seat-avatar">
                      {p.name.slice(0, 1).toUpperCase()}
                      <i className={ready ? "ready-dot" : ""} />
                    </span>
                  </summary>
                  <TargetReactions id={p.id} name={p.name} send={send} />
                </details>
              )}
              <strong title={p.name}>
                {p.name}
                {p.id === room.me ? " · вы" : ""}
              </strong>
              <small>
                {ready
                  ? "Карта на столе"
                  : p.role === "FACILITATOR"
                    ? "Ведущий"
                    : "Выбирает карту"}
              </small>
            </div>
          );
        })}
      </div>
    </div>
  );
}
