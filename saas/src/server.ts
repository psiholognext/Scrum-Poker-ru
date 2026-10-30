import { isIP } from "node:net";
import { prisma, type MiddlewareConfigFn } from "wasp/server";

export const middleware: MiddlewareConfigFn = (config) => {
  const windows = new Map<string, { count: number; until: number }>();
  config.set("poker-rate-limit", (req, res, next) => {
    const remote = req.socket.remoteAddress ?? "unknown";
    const forwarded = String(req.headers["x-forwarded-for"] ?? "")
      .split(",")[0]
      .trim();
    const ip =
      ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote) &&
      isIP(forwarded)
        ? forwarded
        : remote;
    const auth = req.path.startsWith("/auth/");
    const demo = req.path.includes("create-demo");
    const limit = auth ? 60 : demo ? 10 : 500;
    const duration = auth || demo ? 600000 : 60000;
    const key = (auth ? "auth:" : demo ? "demo:" : "api:") + ip;
    const now = Date.now();
    if (windows.size > 10000)
      for (const [k, v] of windows) if (v.until <= now) windows.delete(k);
    const w = windows.get(key);
    if (!w || w.until <= now) {
      windows.set(key, { count: 1, until: now + duration });
      next();
      return;
    }
    if (++w.count > limit) {
      res.set("Retry-After", String(Math.ceil((w.until - now) / 1000)));
      res
        .status(429)
        .json({ message: "Слишком много запросов. Попробуйте позже." });
      return;
    }
    next();
  });
  return config;
};
export async function setup() {
  const timer = setInterval(async () => {
    try {
      await prisma.room.deleteMany({
        where: { isDemo: true, expiresAt: { lt: new Date() } },
      });
      await prisma.participant.updateMany({
        where: {
          guestExpiresAt: { lt: new Date() },
          guestTokenHash: { not: null },
        },
        data: { guestTokenHash: null },
      });
    } catch {
      console.error("Scheduled cleanup failed");
    }
  }, 3600000);
  timer.unref();
}
