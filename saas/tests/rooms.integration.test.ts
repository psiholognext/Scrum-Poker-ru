import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "./serverHarness";
import {
  createTeam,
  createRoom,
  getRoomState,
  mutateRoom,
  createInvitation,
  joinInvitation,
  revokeInvitation,
  setParticipantRole,
  createDemo,
  updateProfile,
} from "../src/poker/operations";
process.env.JWT_SECRET = "test-only-secret-not-for-production-123456789";
const demoRooms: string[] = [];
let alice: any;
let bob: any;
let outsider: any;
let team: { id: string };
let room: { id: string };
const ctx = (user?: any) => ({ user, entities: {} }) as any;
beforeAll(async () => {
  const unique = randomUUID();
  [alice, bob, outsider] = await Promise.all(
    ["Alice", "Bob", "Outsider"].map((name) =>
      prisma.user.create({
        data: {
          name,
          email: `${name}-${unique}@example.test`,
          username: `${name}-${unique}`,
        },
      }),
    ),
  );
  team = await createTeam({ name: "Security test team" }, ctx(alice));
  room = await createRoom(
    { teamId: team.id, name: "Private room" },
    ctx(alice),
  );
});
afterAll(async () => {
  await prisma.room.deleteMany({ where: { id: { in: demoRooms } } });
  if (team) await prisma.team.delete({ where: { id: team.id } });
  await prisma.user.deleteMany({
    where: { id: { in: [alice?.id, bob?.id, outsider?.id].filter(Boolean) } },
  });
  await prisma.$disconnect();
});
describe("Authenticated room operations against PostgreSQL", () => {
  it("publishes profile changes to existing room streams", async () => {
    const before = await getRoomState({ roomId: room.id }, ctx(alice));
    await updateProfile({ name: "Updated facilitator" }, ctx(alice));
    const after = await getRoomState({ roomId: room.id }, ctx(alice));
    expect(after.revision).toBeGreaterThan(before.revision);
    expect(after.participants.find((p) => p.id === after.me)?.name).toBe(
      "Updated facilitator",
    );
  });
  it("rejects anonymous and foreign-team room access", async () => {
    await expect(
      getRoomState({ roomId: room.id }, ctx()),
    ).rejects.toMatchObject({ statusCode: 401 });
    await expect(
      getRoomState({ roomId: room.id }, ctx(outsider)),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
  it("supports a single-use team invitation but requires an account", async () => {
    const invite = await createInvitation({ teamId: team.id }, ctx(alice));
    await expect(
      joinInvitation({ token: invite.token, name: "Guest" }, ctx()),
    ).rejects.toMatchObject({ statusCode: 401 });
    await joinInvitation({ token: invite.token }, ctx(bob));
    await expect(
      joinInvitation({ token: invite.token }, ctx(outsider)),
    ).rejects.toMatchObject({ statusCode: 410 });
  });
  it("uses authenticated identity and hides every foreign vote", async () => {
    const a = await getRoomState({ roomId: room.id }, ctx(alice));
    const b = await getRoomState({ roomId: room.id }, ctx(bob));
    await Promise.all([
      mutateRoom(
        {
          roomId: room.id,
          type: "vote",
          roundId: a.currentRound.id,
          value: "13",
        },
        ctx(alice),
      ),
      mutateRoom(
        {
          roomId: room.id,
          type: "vote",
          roundId: a.currentRound.id,
          value: "5",
          userId: a.me,
        } as any,
        ctx(bob),
      ),
    ]);
    const beforeReveal = await getRoomState({ roomId: room.id }, ctx(bob));
    expect(
      beforeReveal.participants.find((p) => p.id === a.me)?.vote,
    ).toBeNull();
    expect(beforeReveal.participants.find((p) => p.id === a.me)?.hasVoted).toBe(
      true,
    );
    expect(beforeReveal.participants.find((p) => p.id === b.me)?.vote).toBe(
      "5",
    );
    expect(beforeReveal.history).toEqual([]);
    await expect(
      mutateRoom(
        { roomId: room.id, type: "reveal", roundId: a.currentRound.id },
        ctx(bob),
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    await mutateRoom(
      { roomId: room.id, type: "reveal", roundId: a.currentRound.id },
      ctx(alice),
    );
    const after = await getRoomState({ roomId: room.id }, ctx(bob));
    expect(after.participants.find((p) => p.id === a.me)?.vote).toBe("13");
    expect(after.history[0].votes).toHaveLength(2);
    await expect(
      mutateRoom(
        {
          roomId: room.id,
          type: "vote",
          roundId: a.currentRound.id,
          value: "8",
        },
        ctx(bob),
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
  it("preserves revealed history and rejects stale-round writes", async () => {
    const before = await getRoomState({ roomId: room.id }, ctx(alice));
    await mutateRoom(
      {
        roomId: room.id,
        type: "next",
        roundId: before.currentRound.id,
        title: "Second task",
      },
      ctx(alice),
    );
    const after = await getRoomState({ roomId: room.id }, ctx(bob));
    expect(after.currentRound.number).toBe(2);
    expect(after.history[0].votes).toHaveLength(2);
    expect(after.participants.every((p) => !p.hasVoted)).toBe(true);
    await expect(
      mutateRoom(
        {
          roomId: room.id,
          type: "vote",
          roundId: before.currentRound.id,
          value: "3",
        },
        ctx(bob),
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
  it("prevents observer votes and cross-room role changes", async () => {
    const b = await getRoomState({ roomId: room.id }, ctx(bob));
    await setParticipantRole(
      { roomId: room.id, participantId: b.me, role: "OBSERVER" },
      ctx(alice),
    );
    await expect(
      mutateRoom(
        {
          roomId: room.id,
          type: "vote",
          roundId: b.currentRound.id,
          value: "3",
        },
        ctx(bob),
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      setParticipantRole(
        { roomId: room.id, participantId: b.me, role: "FACILITATOR" },
        ctx(bob),
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
  it("supports guest-hosted demos without granting access to a team", async () => {
    const demo = await createDemo({ name: "Demo host" }, ctx());
    demoRooms.push(demo.roomId);
    const inv = await createInvitation(
      { roomId: demo.roomId, guestToken: demo.guestToken },
      ctx(),
    );
    const guest = await joinInvitation(
      { token: inv.token, name: "Guest viewer" },
      ctx(),
    );
    const view = await getRoomState(
      { roomId: demo.roomId, guestToken: guest.guestToken },
      ctx(outsider),
    );
    expect(view.myRole).toBe("PARTICIPANT");
    await revokeInvitation({ id: inv.id, guestToken: demo.guestToken }, ctx());
    await expect(
      getRoomState(
        { roomId: demo.roomId, guestToken: guest.guestToken },
        ctx(),
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
  it("scopes guest access and immediately honors invitation revocation", async () => {
    const inv = await createInvitation({ roomId: room.id }, ctx(alice));
    const guest = await joinInvitation(
      { token: inv.token, name: "Invited guest" },
      ctx(),
    );
    const view = await getRoomState(
      { roomId: room.id, guestToken: guest.guestToken },
      ctx(),
    );
    expect(view.myRole).toBe("PARTICIPANT");
    await expect(
      mutateRoom(
        {
          roomId: room.id,
          guestToken: guest.guestToken,
          type: "reveal",
          roundId: view.currentRound.id,
        },
        ctx(),
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    await revokeInvitation({ id: inv.id }, ctx(alice));
    await expect(
      getRoomState({ roomId: room.id, guestToken: guest.guestToken }, ctx()),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
