import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
export type InteractionKind =
  | "plane"
  | "heart"
  | "clap"
  | "laugh"
  | "fire"
  | "party";
export type Interaction = {
  id: string;
  senderId: string;
  targetId: string;
  kind: InteractionKind;
  createdAt: number;
};
const bus = new EventEmitter();
bus.setMaxListeners(0);
const recent = new Map<string, Interaction[]>();
const ttl = 6000;
export function subscribeRoom(roomId: string, listener: () => void) {
  bus.on(roomId, listener);
  return () => {
    bus.off(roomId, listener);
  };
}
export function notifyRoom(roomId: string) {
  bus.emit(roomId);
}
export function publishInteraction(
  roomId: string,
  input: Omit<Interaction, "id" | "createdAt">,
) {
  const now = Date.now();
  for (const [id, events] of recent)
    if (!events.some((e) => e.createdAt > now - ttl)) recent.delete(id);
  if (recent.size >= 1000 && !recent.has(roomId))
    recent.delete(recent.keys().next().value!);
  const event = { ...input, id: randomUUID(), createdAt: now };
  recent.set(roomId, [...roomInteractions(roomId), event].slice(-30));
  notifyRoom(roomId);
  return event;
}
export function roomInteractions(roomId: string) {
  return (recent.get(roomId) ?? []).filter(
    (e) => e.createdAt > Date.now() - ttl,
  );
}
