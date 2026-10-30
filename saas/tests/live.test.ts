import { describe, it, expect, vi, afterEach } from "vitest";
import {
  publishInteraction,
  roomInteractions,
  subscribeRoom,
  notifyRoom,
} from "../src/poker/live";
afterEach(() => vi.useRealTimers());
describe("private transient room events", () => {
  it("notifies only subscribers in the selected room and detaches listeners", () => {
    const a = vi.fn(),
      b = vi.fn();
    const offA = subscribeRoom("events-a", a),
      offB = subscribeRoom("events-b", b);
    const event = publishInteraction("events-a", {
      senderId: "sender",
      targetId: "target",
      kind: "plane",
    });
    expect(a).toHaveBeenCalledOnce();
    expect(b).not.toHaveBeenCalled();
    expect(roomInteractions("events-a")).toContainEqual(event);
    expect(roomInteractions("events-b")).toEqual([]);
    offA();
    offB();
    notifyRoom("events-a");
    expect(a).toHaveBeenCalledOnce();
  });
  it("bounds the replay buffer and expires old animations", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-30T20:00:00Z"));
    for (let i = 0; i < 40; i++)
      publishInteraction("events-cap", {
        senderId: "sender",
        targetId: "target",
        kind: "heart",
      });
    expect(roomInteractions("events-cap")).toHaveLength(30);
    vi.advanceTimersByTime(6001);
    expect(roomInteractions("events-cap")).toEqual([]);
  });
});
