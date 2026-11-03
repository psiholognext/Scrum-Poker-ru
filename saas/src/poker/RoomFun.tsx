import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Interaction, InteractionKind } from "./live";
import type { RoomView } from "./operations";
export const reactionIcons: Record<InteractionKind, string> = {
  plane: "✈️",
  heart: "❤️",
  clap: "👏",
  laugh: "😂",
  fire: "🔥",
  party: "🎉",
};
const labels: Record<InteractionKind, string> = {
  plane: "Бумажный самолётик",
  heart: "Сердечко",
  clap: "Аплодисменты",
  laugh: "Смех",
  fire: "Огонь",
  party: "Праздник",
};
export function TargetReactions({
  id,
  name,
  send,
}: {
  id: string;
  name: string;
  send: (kind: InteractionKind, targetId?: string) => void;
}) {
  return (
    <div className="target-reactions">
      {(["plane", "heart", "clap"] as const).map((kind) => (
        <button
          key={kind}
          type="button"
          title={`${labels[kind]} → ${name}`}
          aria-label={`${labels[kind]} для ${name}`}
          onClick={() => send(kind, id)}
        >
          {reactionIcons[kind]}
        </button>
      ))}
    </div>
  );
}
type Particle = {
  event: Interaction;
  x: number;
  y: number;
  dx: number;
  dy: number;
  label: string;
};
export function RoomFun({
  events,
  room,
  send,
}: {
  events: Interaction[];
  room: RoomView;
  send: (kind: InteractionKind, targetId?: string) => void;
}) {
  const [muted, setMuted] = useState(false);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const seen = useRef(new Set<string>());
  useEffect(() => {
    setMuted(localStorage.getItem("poker-mute-fun") === "1");
  }, []);
  useEffect(() => {
    const active = new Set(events.map((e) => e.id));
    for (const id of seen.current) if (!active.has(id)) seen.current.delete(id);
    const fresh = events.filter((e) => !seen.current.has(e.id));
    fresh.forEach((e) => seen.current.add(e.id));
    if (muted) return;
    const rect = (id: string) =>
      document
        .querySelector(`[data-player-seat="${id}"]`)
        ?.getBoundingClientRect() ??
      document
        .querySelector(`[data-player-row="${id}"]`)
        ?.getBoundingClientRect();
    const point = (id: string) => {
      const r = rect(id);
      return {
        x: Math.max(
          25,
          Math.min(innerWidth - 25, r ? r.left + r.width / 2 : innerWidth / 2),
        ),
        y: Math.max(
          80,
          Math.min(innerHeight - 50, r ? r.top + 25 : innerHeight / 2),
        ),
      };
    };
    const next: Particle[] = fresh.map((event) => {
      const from = point(event.senderId),
        to = point(event.targetId);
      const sender =
        room.participants.find((p) => p.id === event.senderId)?.name ??
        "Участник";
      const target =
        room.participants.find((p) => p.id === event.targetId)?.name ??
        "участник";
      return {
        event,
        x: event.kind === "plane" ? from.x : to.x,
        y: event.kind === "plane" ? from.y : to.y,
        dx: to.x - from.x,
        dy: to.y - from.y,
        label:
          event.senderId === event.targetId
            ? `${sender}: ${reactionIcons[event.kind]}`
            : `${sender} → ${target}: ${reactionIcons[event.kind]}`,
      };
    });
    if (next.length) {
      setParticles((old) => [...old, ...next].slice(-20));
      setAnnouncement(next[next.length - 1].label);
    }
  }, [events, muted, room.participants]);
  useEffect(() => {
    if (!particles.length) return;
    const timer = setTimeout(
      () =>
        setParticles((old) =>
          old.filter((p) => Date.now() - p.event.createdAt < 2500),
        ),
      2600,
    );
    return () => clearTimeout(timer);
  }, [particles]);
  return (
    <>
      <section className="panel fun-toolbar" aria-label="Реакции команды">
        <details className="self-reactions">
          <summary>☺ Моя реакция</summary>
          <div className="reaction-picker">
            {(["heart", "clap", "laugh", "fire", "party"] as const).map(
              (kind) => (
                <button
                  type="button"
                  key={kind}
                  aria-label={`Показать реакцию: ${labels[kind]}`}
                  title={labels[kind]}
                  onClick={() => send(kind)}
                >
                  {reactionIcons[kind]}
                </button>
              ),
            )}
          </div>
        </details>
        <label className="fun-mute">
          <input
            type="checkbox"
            checked={muted}
            onChange={(e) => {
              setMuted(e.target.checked);
              localStorage.setItem(
                "poker-mute-fun",
                e.target.checked ? "1" : "0",
              );
              if (e.target.checked) setParticles([]);
            }}
          />
          Скрыть анимации
        </label>
      </section>
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
      <div className="fun-layer" aria-hidden="true">
        {!muted &&
          particles.map((p) => (
            <div
              key={p.event.id}
              data-testid="room-interaction"
              data-kind={p.event.kind}
              className={`fun-particle ${p.event.kind === "plane" ? "paper-flight" : "emoji-reaction"}`}
              style={
                {
                  left: p.x,
                  top: p.y,
                  "--flight-x": `${p.dx}px`,
                  "--flight-y": `${p.dy}px`,
                  "--flight-angle": `${(Math.atan2(p.dy, p.dx) * 180) / Math.PI + 20}deg`,
                } as CSSProperties
              }
            >
              <div className="fun-symbol">
                {p.event.kind === "plane" ? (
                  <svg viewBox="0 0 64 64" width="54" height="54">
                    <path
                      d="M3 24 60 5 40 59 28 37Z"
                      fill="#fff"
                      stroke="#b8a1ff"
                      strokeWidth="2"
                    />
                    <path
                      d="M28 37 60 5 19 30 3 24M28 37l-1 15 8-8"
                      fill="#d5c7ff"
                      stroke="#9877ef"
                      strokeWidth="2"
                    />
                  </svg>
                ) : (
                  reactionIcons[p.event.kind]
                )}
              </div>
              <small>{p.label}</small>
            </div>
          ))}
      </div>
    </>
  );
}
