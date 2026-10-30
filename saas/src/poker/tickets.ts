import { createHmac, timingSafeEqual } from "node:crypto";
function secret() {
  const key = process.env.JWT_SECRET;
  if (!key || key.length < 32)
    throw new Error("JWT_SECRET must contain at least 32 characters");
  return key;
}
export function issueTicket(roomId: string, participantId: string) {
  const body = Buffer.from(
    JSON.stringify({ roomId, participantId, exp: Date.now() + 60_000 }),
  ).toString("base64url");
  return (
    body + "." + createHmac("sha256", secret()).update(body).digest("base64url")
  );
}
export function readTicket(
  token: string,
): { roomId: string; participantId: string; exp: number } | null {
  try {
    const [body, sig, extra] = token.split(".");
    if (!body || !sig || extra || token.length > 1500) return null;
    const expected = createHmac("sha256", secret()).update(body).digest();
    const actual = Buffer.from(sig, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return null;
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    if (
      typeof p.roomId !== "string" ||
      typeof p.participantId !== "string" ||
      typeof p.exp !== "number" ||
      p.exp <= Date.now()
    )
      return null;
    return p;
  } catch {
    return null;
  }
}
