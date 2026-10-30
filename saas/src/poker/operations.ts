import { randomBytes, createHash } from "node:crypto";
import { prisma, HttpError } from "wasp/server";
import type { Prisma } from "@prisma/client";
import type {
  GetDashboard,
  CreateTeam,
  CreateRoom,
  CreateInvitation,
  JoinInvitation,
  CreateDemo,
  GetRoomState,
  MutateRoom,
  SetParticipantRole,
  RevokeInvitation,
  UpdateProfile,
} from "wasp/server/operations";
import { z } from "zod";
import { canManage, canVote, invitationUsable, visibleVote } from "./policy";
import { issueTicket } from "./tickets";
import { calculateStatistics, type Statistics } from "./statistics";
import { notifyRoom, publishInteraction, type InteractionKind } from "./live";

type Tx = Prisma.TransactionClient;
type AuthContext = {
  user?: {
    id: string;
    email?: string | null;
    username?: string | null;
    name?: string;
  } | null;
};
type RoomArgs = { roomId: string; guestToken?: string };
export type RoomView = {
  id: string;
  name: string;
  revision: number;
  isDemo: boolean;
  me: string;
  myRole: string;
  participants: {
    id: string;
    name: string;
    role: string;
    isObserving: boolean;
    hasVoted: boolean;
    vote: string | null;
  }[];
  currentRound: {
    id: string;
    number: number;
    title: string;
    status: string;
    deck: string[];
    statistics: Statistics | null;
  };
  history: {
    id: string;
    number: number;
    title: string;
    votes: { name: string; value: string }[];
    statistics: Statistics;
  }[];
  invitations: {
    id: string;
    expiresAt: string;
    useCount: number;
    maxUses: number;
  }[];
  streamTicket?: string;
};
export type Dashboard = {
  teams: {
    id: string;
    name: string;
    role: string;
    invitations: {
      id: string;
      expiresAt: string;
      useCount: number;
      maxUses: number;
    }[];
    members: { id: string; name: string; role: string }[];
    rooms: { id: string; name: string }[];
  }[];
};
const roomArgs = z.object({
  roomId: z.string().uuid(),
  guestToken: z.string().min(40).max(128).optional(),
});
const nameSchema = z.string().trim().min(2, "Минимум 2 символа").max(80);
const roleSchema = z.enum(["PARTICIPANT", "OBSERVER"]);
const windows = new Map<string, { count: number; until: number }>();
export function digest(s: string) {
  return createHash("sha256").update(s).digest("hex");
}
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success)
    throw new HttpError(400, r.error.issues[0]?.message ?? "Неверные данные");
  return r.data;
}
function requireUser(ctx: AuthContext) {
  if (!ctx.user) throw new HttpError(401, "Войдите в аккаунт");
  return ctx.user;
}
function rate(key: string, max = 120, ms = 60_000) {
  const now = Date.now();
  if (windows.size > 10000)
    for (const [k, v] of windows) if (v.until <= now) windows.delete(k);
  const w = windows.get(key);
  if (!w || w.until <= now) {
    windows.set(key, { count: 1, until: now + ms });
    return;
  }
  if (++w.count > max)
    throw new HttpError(429, "Слишком много запросов. Попробуйте позже.");
}
async function transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: "Serializable",
        timeout: 10000,
      });
    } catch (e) {
      if (
        i >= 3 ||
        !(e && typeof e === "object" && "code" in e && e.code === "P2034")
      )
        throw e;
    }
  }
}
async function teamAccess(
  tx: Tx,
  teamId: string,
  userId: string,
  management = false,
) {
  const m = await tx.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
  if (!m || (management && !["OWNER", "ADMIN"].includes(m.role)))
    throw new HttpError(403, "Недостаточно прав в команде");
  return m;
}
async function actor(tx: Tx, raw: RoomArgs, ctx: AuthContext) {
  const room = await tx.room.findUnique({ where: { id: raw.roomId } });
  if (!room) throw new HttpError(404, "Комната не найдена");
  if (room.expiresAt && room.expiresAt <= new Date())
    throw new HttpError(410, "Срок комнаты истёк");
  if (ctx.user && !raw.guestToken) {
    if (room.teamId) await teamAccess(tx, room.teamId, ctx.user.id);
    const existing = await tx.participant.findUnique({
      where: { roomId_userId: { roomId: room.id, userId: ctx.user.id } },
    });
    if (existing?.revokedAt) throw new HttpError(403, "Доступ отозван");
    if (existing) return existing;
    if (!room.teamId) throw new HttpError(403, "Войдите в демо по приглашению");
    const p = await tx.participant.create({
      data: {
        roomId: room.id,
        userId: ctx.user.id,
        name: ctx.user.name || ctx.user.username || "Участник",
      },
    });
    await tx.room.update({
      where: { id: room.id },
      data: { revision: { increment: 1 } },
    });
    return p;
  }
  if (!raw.guestToken)
    throw new HttpError(401, "Войдите в аккаунт или используйте приглашение");
  const p = await tx.participant.findUnique({
    where: { guestTokenHash: digest(raw.guestToken) },
  });
  if (
    !p ||
    p.roomId !== room.id ||
    p.revokedAt ||
    !p.guestExpiresAt ||
    p.guestExpiresAt <= new Date()
  )
    throw new HttpError(403, "Гостевой доступ истёк");
  if (p.invitationId) {
    const inv = await tx.invitation.findUnique({
      where: { id: p.invitationId },
    });
    if (!inv || inv.revokedAt) throw new HttpError(403, "Приглашение отозвано");
  }
  return p;
}
export async function viewForParticipant(
  tx: Tx,
  roomId: string,
  participantId: string,
): Promise<RoomView> {
  const room = await tx.room.findUnique({
    where: { id: roomId },
    include: {
      invitations: {
        where: { revokedAt: null },
        orderBy: { createdAt: "desc" },
        take: 30,
      },
      participants: {
        where: { revokedAt: null },
        orderBy: { joinedAt: "asc" },
      },
      rounds: {
        orderBy: { number: "desc" },
        include: {
          votes: { include: { participant: { select: { name: true } } } },
        },
      },
    },
  });
  if (!room || (room.expiresAt && room.expiresAt <= new Date()))
    throw new HttpError(410, "Комната недоступна");
  const me = room.participants.find((p) => p.id === participantId);
  if (!me) throw new HttpError(403, "Доступ отозван");
  if (me.userId && room.teamId) await teamAccess(tx, room.teamId, me.userId);
  if (!me.userId && (!me.guestExpiresAt || me.guestExpiresAt <= new Date()))
    throw new HttpError(403, "Гостевой доступ истёк");
  if (me.invitationId) {
    const inv = await tx.invitation.findUnique({
      where: { id: me.invitationId },
    });
    if (!inv || inv.revokedAt) throw new HttpError(403, "Приглашение отозвано");
  }
  const round = room.rounds[0];
  if (!round) throw new HttpError(409, "В комнате нет раунда");
  return {
    id: room.id,
    name: room.name,
    revision: room.revision,
    isDemo: room.isDemo,
    me: me.id,
    myRole: me.role,
    participants: room.participants
      .filter(
        (p) =>
          !!p.userId || (!!p.guestExpiresAt && p.guestExpiresAt > new Date()),
      )
      .map((p) => {
        const v = round.votes.find((v) => v.participantId === p.id);
        return {
          id: p.id,
          name: p.name,
          role: p.role,
          isObserving: p.isObserving || !canVote(p.role),
          hasVoted: !!v,
          vote: visibleVote(
            v?.value,
            round.status === "REVEALED",
            p.id === me.id,
          ),
        };
      }),
    currentRound: {
      id: round.id,
      number: round.number,
      title: round.title,
      status: round.status,
      deck: round.deck.split(","),
      statistics:
        round.status === "REVEALED"
          ? calculateStatistics(round.votes.map((v) => v.value))
          : null,
    },
    invitations: canManage(me.role)
      ? room.invitations.map((i) => ({
          id: i.id,
          expiresAt: i.expiresAt.toISOString(),
          useCount: i.useCount,
          maxUses: i.maxUses,
        }))
      : [],
    history: room.rounds
      .filter((r) => r.status === "REVEALED")
      .map((r) => ({
        id: r.id,
        number: r.number,
        title: r.title,
        statistics: calculateStatistics(r.votes.map((v) => v.value)),
        votes: r.votes.map((v) => ({
          name: v.participant.name,
          value: v.value,
        })),
      })),
  };
}
export const getDashboard: GetDashboard<void, Dashboard> = async (_, ctx) => {
  const user = requireUser(ctx);
  const members = await prisma.teamMember.findMany({
    where: { userId: user.id },
    include: {
      team: {
        include: {
          invitations: {
            where: { revokedAt: null },
            take: 30,
            orderBy: { createdAt: "desc" },
          },
          rooms: { orderBy: { createdAt: "desc" }, take: 50 },
          members: {
            include: { user: { select: { name: true, username: true } } },
          },
        },
      },
    },
  });
  return {
    teams: members.map((m) => ({
      id: m.team.id,
      name: m.team.name,
      role: m.role,
      invitations: ["OWNER", "ADMIN"].includes(m.role)
        ? m.team.invitations.map((i) => ({
            id: i.id,
            expiresAt: i.expiresAt.toISOString(),
            useCount: i.useCount,
            maxUses: i.maxUses,
          }))
        : [],
      members: m.team.members.map((x) => ({
        id: x.userId,
        name: x.user.name || x.user.username || "Участник",
        role: x.role,
      })),
      rooms: m.team.rooms.map((r) => ({ id: r.id, name: r.name })),
    })),
  };
};
export const createTeam: CreateTeam<{ name: string }, { id: string }> = async (
  raw,
  ctx,
) => {
  const user = requireUser(ctx);
  const { name } = parse(z.object({ name: nameSchema }), raw);
  rate("team:" + user.id, 10, 3600_000);
  return prisma.team.create({
    data: { name, members: { create: { userId: user.id, role: "OWNER" } } },
    select: { id: true },
  });
};
export const updateProfile: UpdateProfile<{ name: string }, void> = async (
  raw,
  ctx,
) => {
  const user = requireUser(ctx);
  const { name } = parse(z.object({ name: nameSchema.max(30) }), raw);
  await transaction(async (tx) => {
    const rooms = await tx.participant.findMany({
      where: { userId: user.id },
      select: { roomId: true },
    });
    await tx.user.update({ where: { id: user.id }, data: { name } });
    await tx.participant.updateMany({
      where: { userId: user.id },
      data: { name },
    });
    await tx.room.updateMany({
      where: { id: { in: rooms.map((p) => p.roomId) } },
      data: { revision: { increment: 1 } },
    });
  });
};
export const createRoom: CreateRoom<
  { teamId: string; name: string; taskTitle?: string },
  { id: string }
> = async (raw, ctx) => {
  const user = requireUser(ctx);
  const args = parse(
    z.object({
      teamId: z.string().uuid(),
      name: nameSchema,
      taskTitle: z.string().trim().min(1).max(200).optional(),
    }),
    raw,
  );
  rate("room:" + user.id, 20, 3600_000);
  return transaction(async (tx) => {
    await teamAccess(tx, args.teamId, user.id);
    return tx.room.create({
      data: {
        teamId: args.teamId,
        name: args.name,
        participants: {
          create: {
            userId: user.id,
            name: user.name || user.username || "Ведущий",
            role: "FACILITATOR",
          },
        },
        rounds: { create: { number: 1, title: args.taskTitle || args.name } },
      },
      select: { id: true },
    });
  });
};
export const createInvitation: CreateInvitation<
  {
    teamId?: string;
    roomId?: string;
    guestToken?: string;
    role?: "PARTICIPANT" | "OBSERVER";
  },
  { token: string; id: string }
> = async (raw, ctx) => {
  const args = parse(
    z
      .object({
        teamId: z.string().uuid().optional(),
        roomId: z.string().uuid().optional(),
        guestToken: z.string().max(128).optional(),
        role: roleSchema.default("PARTICIPANT"),
      })
      .refine((a) => !!a.teamId !== !!a.roomId, "Укажите команду или комнату"),
    raw,
  );
  rate(
    "invite:" + (ctx.user?.id || digest(args.guestToken ?? "anon")),
    30,
    3600_000,
  );
  const token = randomBytes(32).toString("hex");
  return transaction(async (tx) => {
    if (args.teamId)
      await teamAccess(tx, args.teamId, requireUser(ctx).id, true);
    if (args.roomId) {
      const p = await actor(
        tx,
        { roomId: args.roomId, guestToken: args.guestToken },
        ctx,
      );
      if (!canManage(p.role))
        throw new HttpError(403, "Только ведущий может приглашать");
    }
    const inv = await tx.invitation.create({
      data: {
        tokenHash: digest(token),
        teamId: args.teamId,
        roomId: args.roomId,
        role: args.role,
        expiresAt: new Date(Date.now() + 7 * 86400_000),
        maxUses: args.teamId ? 1 : 20,
      },
    });
    return { token, id: inv.id };
  });
};
export const revokeInvitation: RevokeInvitation<
  { id: string; guestToken?: string },
  void
> = async (raw, ctx) => {
  const { id, guestToken } = parse(
    z.object({
      id: z.string().uuid(),
      guestToken: z.string().max(128).optional(),
    }),
    raw,
  );
  await transaction(async (tx) => {
    const inv = await tx.invitation.findUnique({ where: { id } });
    if (!inv) throw new HttpError(404);
    if (inv.teamId) await teamAccess(tx, inv.teamId, requireUser(ctx).id, true);
    if (inv.roomId) {
      const p = await actor(tx, { roomId: inv.roomId, guestToken }, ctx);
      if (!canManage(p.role)) throw new HttpError(403);
    }
    await tx.invitation.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    if (inv.roomId)
      await tx.room.update({
        where: { id: inv.roomId },
        data: { revision: { increment: 1 } },
      });
  });
};
export const joinInvitation: JoinInvitation<
  { token: string; name?: string },
  { roomId?: string; teamId?: string; guestToken?: string }
> = async (raw, ctx) => {
  const args = parse(
    z.object({
      token: z.string().length(64),
      name: nameSchema.max(30).optional(),
    }),
    raw,
  );
  rate("join:" + digest(args.token), 40, 60_000);
  return transaction(async (tx) => {
    const inv = await tx.invitation.findUnique({
      where: { tokenHash: digest(args.token) },
    });
    if (!inv || !invitationUsable(inv))
      throw new HttpError(410, "Приглашение истекло или отозвано");
    if (inv.teamId) {
      const user = requireUser(ctx);
      const existing = await tx.teamMember.findUnique({
        where: { userId_teamId: { userId: user.id, teamId: inv.teamId } },
      });
      if (existing) return { teamId: inv.teamId };
      await tx.teamMember.create({
        data: { teamId: inv.teamId, userId: user.id },
      });
      await tx.invitation.update({
        where: { id: inv.id },
        data: { useCount: { increment: 1 } },
      });
      return { teamId: inv.teamId };
    }
    if (!inv.roomId) throw new HttpError(410);
    const room = await tx.room.findUnique({ where: { id: inv.roomId } });
    if (!room || (room.expiresAt && room.expiresAt <= new Date()))
      throw new HttpError(410);
    // External room invitees remain guests unless they are already team members.
    if (
      ctx.user &&
      room.teamId &&
      (await tx.teamMember.findUnique({
        where: { userId_teamId: { userId: ctx.user.id, teamId: room.teamId } },
      }))
    ) {
      const p = await actor(tx, { roomId: room.id }, ctx);
      return { roomId: p.roomId };
    }
    if (!args.name) throw new HttpError(400, "Введите имя для гостевого входа");
    const guestToken = randomBytes(32).toString("hex");
    await tx.participant.create({
      data: {
        roomId: room.id,
        name: args.name,
        role: inv.role,
        isObserving: inv.role === "OBSERVER",
        invitationId: inv.id,
        guestTokenHash: digest(guestToken),
        guestExpiresAt: new Date(
          Math.min(
            Date.now() + 86400_000,
            room.expiresAt?.getTime() ?? Infinity,
          ),
        ),
      },
    });
    await tx.invitation.update({
      where: { id: inv.id },
      data: { useCount: { increment: 1 } },
    });
    await tx.room.update({
      where: { id: room.id },
      data: { revision: { increment: 1 } },
    });
    return { roomId: room.id, guestToken };
  });
};
export const createDemo: CreateDemo<
  { name: string; taskTitle?: string },
  { roomId: string; guestToken: string }
> = async (raw) => {
  const { name, taskTitle } = parse(
    z.object({
      name: nameSchema.max(30),
      taskTitle: z.string().trim().min(1).max(200).optional(),
    }),
    raw,
  );
  rate("demo-global", 30, 15 * 60_000);
  const guestToken = randomBytes(32).toString("hex");
  const room = await prisma.room.create({
    data: {
      name: "Демонстрационная комната",
      isDemo: true,
      expiresAt: new Date(Date.now() + 3600_000),
      participants: {
        create: {
          name,
          role: "FACILITATOR",
          guestTokenHash: digest(guestToken),
          guestExpiresAt: new Date(Date.now() + 3600_000),
        },
      },
      rounds: {
        create: { number: 1, title: taskTitle || "Вход через Google" },
      },
    },
  });
  return { roomId: room.id, guestToken };
};
export const getRoomState: GetRoomState<RoomArgs, RoomView> = async (
  raw,
  ctx,
) => {
  const args = parse(roomArgs, raw);
  return transaction(async (tx) => {
    const p = await actor(tx, args, ctx);
    return {
      ...(await viewForParticipant(tx, args.roomId, p.id)),
      streamTicket: issueTicket(args.roomId, p.id),
    };
  });
};
type Mutation = RoomArgs & {
  type:
    | "vote"
    | "amend"
    | "reveal"
    | "next"
    | "revote"
    | "rename"
    | "renameTask"
    | "observe"
    | "interact";
  roundId?: string;
  value?: string;
  title?: string;
  name?: string;
  observing?: boolean;
  targetId?: string;
  reaction?: InteractionKind;
};
export const mutateRoom: MutateRoom<Mutation, RoomView | void> = async (
  raw,
  ctx,
) => {
  const args = parse(
    roomArgs.extend({
      type: z.enum([
        "vote",
        "amend",
        "reveal",
        "next",
        "revote",
        "rename",
        "renameTask",
        "observe",
        "interact",
      ]),
      roundId: z.string().uuid().optional(),
      value: z.string().max(6).optional(),
      title: z.string().trim().min(1).max(200).optional(),
      name: nameSchema.max(30).optional(),
      observing: z.boolean().optional(),
      targetId: z.string().uuid().optional(),
      reaction: z
        .enum(["plane", "heart", "clap", "laugh", "fire", "party"])
        .optional(),
    }),
    raw,
  );
  rate("mutate:" + (ctx.user?.id || digest(args.guestToken ?? "anon")));
  if (args.type === "interact")
    rate(
      "fun:" + (ctx.user?.id || digest(args.guestToken ?? "anon")),
      6,
      10_000,
    );
  let interaction:
    | { senderId: string; targetId: string; kind: InteractionKind }
    | undefined;
  const result = await transaction(async (tx) => {
    const p = await actor(tx, args, ctx);
    const r = await tx.round.findFirst({
      where: { roomId: args.roomId },
      orderBy: { number: "desc" },
    });
    if (!r) throw new HttpError(409);
    if (!["rename", "interact"].includes(args.type) && args.roundId !== r.id)
      throw new HttpError(409, "Раунд уже изменился. Обновите комнату.");
    if (args.type === "interact") {
      if (!args.reaction || (args.reaction === "plane" && !args.targetId))
        throw new HttpError(400, "Выберите участника и реакцию");
      const target = await tx.participant.findFirst({
        where: {
          id: args.targetId || p.id,
          roomId: args.roomId,
          revokedAt: null,
        },
      });
      if (
        !target ||
        (!target.userId &&
          (!target.guestExpiresAt || target.guestExpiresAt <= new Date()))
      )
        throw new HttpError(404, "Участник уже вышел");
      if (
        target.invitationId &&
        (await tx.invitation.findUnique({ where: { id: target.invitationId } }))
          ?.revokedAt
      )
        throw new HttpError(403, "Приглашение отозвано");
      interaction = {
        senderId: p.id,
        targetId: target.id,
        kind: args.reaction,
      };
      return;
    }
    if (args.type === "vote" || args.type === "amend") {
      if (!canVote(p.role) || p.isObserving)
        throw new HttpError(403, "Наблюдатель не голосует");
      if (
        (args.type === "vote" && r.status !== "OPEN") ||
        (args.type === "amend" && r.status !== "REVEALED")
      )
        throw new HttpError(409, "Состояние голосования изменилось");
      if (!args.value || !r.deck.split(",").includes(args.value))
        throw new HttpError(400, "Выберите карту из колоды");
      await tx.vote.upsert({
        where: {
          roundId_participantId: { roundId: r.id, participantId: p.id },
        },
        create: { roundId: r.id, participantId: p.id, value: args.value },
        update: { value: args.value },
      });
    } else if (args.type === "observe") {
      if (!canVote(p.role) || args.observing === undefined)
        throw new HttpError(403);
      await tx.participant.update({
        where: { id: p.id },
        data: { isObserving: args.observing },
      });
      if (args.observing)
        await tx.vote.deleteMany({
          where: { roundId: r.id, participantId: p.id },
        });
    } else if (args.type === "rename") {
      if (!args.name) throw new HttpError(400);
      await tx.participant.update({
        where: { id: p.id },
        data: { name: args.name },
      });
    } else {
      if (!canManage(p.role))
        throw new HttpError(403, "Это действие доступно ведущему");
      if (args.type === "renameTask") {
        if (!args.title) throw new HttpError(400, "Введите название задачи");
        await tx.round.update({
          where: { id: r.id },
          data: { title: args.title },
        });
      }
      if (args.type === "reveal") {
        if (
          r.status !== "OPEN" ||
          !(await tx.vote.count({ where: { roundId: r.id } }))
        )
          throw new HttpError(409, "Сначала выберите хотя бы одну оценку");
        await tx.round.update({
          where: { id: r.id },
          data: { status: "REVEALED", revealedAt: new Date() },
        });
      }
      if (args.type === "next" || args.type === "revote") {
        if (r.status !== "REVEALED")
          throw new HttpError(
            409,
            "Сначала раскройте результаты текущего раунда",
          );
        await tx.round.create({
          data: {
            roomId: args.roomId,
            number: r.number + 1,
            title:
              args.type === "revote"
                ? r.title
                : args.title || `Задача ${r.number + 1}`,
            deck: r.deck,
          },
        });
      }
    }
    await tx.room.update({
      where: { id: args.roomId },
      data: { revision: { increment: 1 } },
    });
    if (args.type === "vote" || args.type === "amend")
      return viewForParticipant(tx, args.roomId, p.id);
  });
  if (interaction) publishInteraction(args.roomId, interaction);
  else notifyRoom(args.roomId);
  return result;
};
export const setParticipantRole: SetParticipantRole<
  RoomArgs & { participantId: string; role: string },
  void
> = async (raw, ctx) => {
  const args = parse(
    roomArgs.extend({
      participantId: z.string().uuid(),
      role: z.enum(["FACILITATOR", "PARTICIPANT", "OBSERVER", "REMOVED"]),
    }),
    raw,
  );
  await transaction(async (tx) => {
    const p = await actor(tx, args, ctx);
    if (!canManage(p.role)) throw new HttpError(403);
    const target = await tx.participant.findUnique({
      where: { id: args.participantId },
    });
    if (!target || target.roomId !== args.roomId) throw new HttpError(404);
    if (p.id === target.id)
      throw new HttpError(400, "Сначала назначьте другого ведущего");
    if (args.role === "FACILITATOR" && !target.userId)
      throw new HttpError(400, "Назначить ведущим можно участника с аккаунтом");
    await tx.participant.update({
      where: { id: target.id },
      data:
        args.role === "REMOVED"
          ? { revokedAt: new Date() }
          : { role: args.role, isObserving: args.role === "OBSERVER" },
    });
    if (args.role === "OBSERVER" || args.role === "REMOVED") {
      const current = await tx.round.findFirst({
        where: { roomId: args.roomId },
        orderBy: { number: "desc" },
      });
      if (current)
        await tx.vote.deleteMany({
          where: { roundId: current.id, participantId: target.id },
        });
    }
    await tx.room.update({
      where: { id: args.roomId },
      data: { revision: { increment: 1 } },
    });
  });
};
