import { Flame, Heart, Laugh, PartyPopper, Send, Sparkles } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
const reactionArt = {
  plane: Send,
  heart: Heart,
  clap: Sparkles,
  laugh: Laugh,
  fire: Flame,
  party: PartyPopper,
};
function ReactionIcon({ kind }: { kind: InteractionKind }) {
  const Icon = reactionArt[kind];
  return (
    <Icon
      aria-hidden="true"
      className={`reaction-art reaction-${kind}`}
      size={19}
      strokeWidth={1.8}
    />
  );
}
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
          onClick={(event) => {
            send(kind, id);
            event.currentTarget.closest("details")?.removeAttribute("open");
          }}
        >
          <ReactionIcon kind={kind} />
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
function motionSeed(id: string) {
  let state = 2166136261;
  for (const char of id)
    state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    return (state >>> 0) / 4294967296;
  };
}

function flyPlane(node: HTMLElement, symbol: HTMLElement, p: Particle) {
  const random = motionSeed(p.event.id);
  const distance = Math.hypot(p.dx, p.dy);
  const ux = distance > 1 ? p.dx / distance : 0;
  const uy = distance > 1 ? p.dy / distance : -1;
  const turn = (random() > 0.5 ? 1 : -1) * (110 + random() * 90);
  const retreat = 58 + random() * 40;
  const end = { x: p.dx, y: p.dy };
  const bound = (x: number, y: number) => ({
    x: Math.max(24 - p.x, Math.min(innerWidth - 24 - p.x, x)),
    y: Math.max(30 - p.y, Math.min(innerHeight - 32 - p.y, y)),
  });
  // The first control point points away from the destination. The second
  // swings around it, so the approach visibly changes heading.
  const first = bound(-ux * retreat - uy * turn, -uy * retreat + ux * turn);
  const second = bound(
    end.x + ux * 70 - uy * turn * 0.48,
    end.y + uy * 70 + ux * turn * 0.48,
  );
  const duration = 2050 + random() * 430;
  const travel: Keyframe[] = [];
  const attitude: Keyframe[] = [];
  let heading = 0;
  for (let index = 0; index <= 48; index++) {
    const t = index / 48;
    const u = 1 - t;
    const x =
      3 * u * u * t * first.x + 3 * u * t * t * second.x + t ** 3 * end.x;
    const y =
      3 * u * u * t * first.y + 3 * u * t * t * second.y + t ** 3 * end.y;
    const vx =
      u * u * first.x +
      2 * u * t * (second.x - first.x) +
      t * t * (end.x - second.x);
    const vy =
      u * u * first.y +
      2 * u * t * (second.y - first.y) +
      t * t * (end.y - second.y);
    const direction = (Math.atan2(vy, vx) * 180) / Math.PI + 45;
    heading = index
      ? heading + ((((direction - heading + 540) % 360) + 360) % 360) - 180
      : direction;
    const depth = Math.sin(t * Math.PI);
    const bank = Math.sin(t * Math.PI * 2) * 46 * depth * Math.sign(turn);
    travel.push({
      offset: t * 0.91,
      transform: `translate3d(${x}px,${y}px,0) scale(${0.76 + depth * 0.46})`,
      opacity: Math.min(1, 0.2 + t * 12),
    });
    attitude.push({
      offset: t * 0.91,
      transform: `perspective(240px) rotateZ(${heading}deg) rotateY(${bank}deg) rotateX(${depth * 22}deg)`,
    });
  }
  travel.push({
    offset: 1,
    transform: `translate3d(${end.x}px,${end.y}px,0) scale(.5)`,
    opacity: 0,
  });
  attitude.push({ ...attitude[attitude.length - 1], offset: 1 });
  return [
    node.animate(travel, { duration, fill: "both" }),
    symbol.animate(attitude, { duration, fill: "both" }),
  ];
}

const reactionMotion = {
  heart: { height: 65, lift: 1.45, tilt: 12 },
  clap: { height: 47, lift: 1.3, tilt: 25 },
  laugh: { height: 86, lift: 1.25, tilt: 32 },
  fire: { height: 116, lift: 1.15, tilt: 9 },
  party: { height: 100, lift: 1.55, tilt: 48 },
};

function InteractionParticle({ particle: p }: { particle: Particle }) {
  const element = useRef<HTMLDivElement>(null);
  const symbol = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = element.current;
    const icon = symbol.current;
    if (!node || !icon) return;
    let animations: Animation[];
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      animations = [
        node.animate(
          [
            { opacity: 0 },
            { opacity: 1, offset: 0.2 },
            { opacity: 1, offset: 0.8 },
            { opacity: 0 },
          ],
          { duration: 1500, fill: "both" },
        ),
      ];
    } else if (p.event.kind === "plane") {
      animations = flyPlane(node, icon, p);
    } else {
      const random = motionSeed(p.event.id);
      const { height, lift, tilt } = reactionMotion[p.event.kind];
      const drift = (random() - 0.5) * 56;
      const rise = height * (0.8 + random() * 0.4);
      animations = [
        node.animate(
          [
            { transform: "translateY(8px) scale(.35)", opacity: 0 },
            {
              transform: `translate(${drift * 0.3}px,-24px) scale(${lift}) rotate(${tilt}deg)`,
              opacity: 1,
              offset: 0.22,
            },
            {
              transform: `translate(${-drift * 0.25}px,${-rise * 0.55}px) scale(.95) rotate(${-tilt * 0.7}deg)`,
              opacity: 1,
              offset: 0.53,
            },
            {
              transform: `translate(${drift}px,${-rise}px) scale(.64) rotate(${tilt * 0.45}deg)`,
              opacity: 0,
            },
          ],
          { duration: 1550 + random() * 650, easing: "ease-out", fill: "both" },
        ),
      ];
    }
    return () => animations.forEach((animation) => animation.cancel());
  }, [p]);

  return (
    <div
      ref={element}
      data-testid="room-interaction"
      data-kind={p.event.kind}
      data-motion-id={p.event.id}
      className="fun-particle"
      style={{ left: p.x, top: p.y }}
    >
      <div ref={symbol} className="fun-symbol">
        {p.event.kind === "plane" ? (
          <svg viewBox="0 0 64 64" width="54" height="54">
            <path
              d="M3 24 60 5 40 59 28 37Z"
              fill="#fff"
              stroke="#a8c8ef"
              strokeWidth="2"
            />
            <path
              d="M28 37 60 5 19 30 3 24M28 37l-1 15 8-8"
              fill="#c9ddff"
              stroke="#7996c3"
              strokeWidth="2"
            />
            <path d="M28 37 60 5 40 59Z" fill="#e3edff" />
          </svg>
        ) : (
          <ReactionIcon kind={p.event.kind} />
        )}
      </div>
      <small>{p.label}</small>
    </div>
  );
}

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
                  <ReactionIcon kind={kind} />
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
            <InteractionParticle key={p.event.id} particle={p} />
          ))}
      </div>
    </>
  );
}
