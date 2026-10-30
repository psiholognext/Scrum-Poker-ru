import type { RoomStream } from "wasp/server/api";
import { prisma } from "wasp/server";
import { readTicket } from "./tickets";
import { viewForParticipant } from "./operations";
import { subscribeRoom, roomInteractions } from "./live";
const streams = new Map<string, number>();

export const roomStream: RoomStream = async (req, res) => {
  const header = req.headers.authorization ?? "";
  const ticket = header.startsWith("Bearer ")
    ? readTicket(header.slice(7))
    : null;
  if (!ticket || ticket.roomId !== req.params.roomId) {
    res.status(401).end();
    return;
  }
  if ((streams.get(ticket.participantId) ?? 0) >= 4) {
    res.status(429).end();
    return;
  }
  streams.set(
    ticket.participantId,
    (streams.get(ticket.participantId) ?? 0) + 1,
  );
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-store",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  let closed = false;
  let busy = false;
  let revision = -1;
  let pending = false;
  const openedAt = Date.now();
  const seen = new Set<string>();
  const send = async () => {
    if (closed) return;
    if (busy) {
      pending = true;
      return;
    }
    busy = true;
    try {
      if (Date.now() >= ticket.exp) {
        res.write("event: renew\ndata: {}\n\n");
        res.end();
        return;
      }
      const view = await prisma.$transaction(
        (tx) => viewForParticipant(tx, ticket.roomId, ticket.participantId),
        { isolationLevel: "RepeatableRead" },
      );
      if (view.revision !== revision) {
        revision = view.revision;
        if (!res.write(`event: state\ndata: ${JSON.stringify(view)}\n\n`)) {
          res.end();
          return;
        }
      } else res.write(": heartbeat\n\n");
      const events = roomInteractions(ticket.roomId);
      const active = new Set(events.map((e) => e.id));
      for (const id of seen) if (!active.has(id)) seen.delete(id);
      for (const event of events)
        if (event.createdAt >= openedAt && !seen.has(event.id)) {
          seen.add(event.id);
          if (
            !res.write(`event: interaction\ndata: ${JSON.stringify(event)}\n\n`)
          ) {
            res.end();
            return;
          }
        }
    } catch {
      if (!closed) {
        res.write("event: denied\ndata: {}\n\n");
        res.end();
      }
    } finally {
      busy = false;
      if (pending && !closed) {
        pending = false;
        void send();
      }
    }
  };
  const unsubscribe = subscribeRoom(ticket.roomId, () => {
    void send();
  });
  const timer = setInterval(send, 1500);
  res.on("close", () => {
    closed = true;
    clearInterval(timer);
    unsubscribe();
    const count = (streams.get(ticket.participantId) ?? 1) - 1;
    if (count <= 0) streams.delete(ticket.participantId);
    else streams.set(ticket.participantId, count);
  });
  await send();
};
