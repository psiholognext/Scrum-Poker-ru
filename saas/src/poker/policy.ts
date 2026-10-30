export const ROLES = ["FACILITATOR", "PARTICIPANT", "OBSERVER"] as const;
export function canManage(role: string) {
  return role === "FACILITATOR";
}
export function canVote(role: string) {
  return role === "PARTICIPANT" || role === "FACILITATOR";
}
export function visibleVote(
  value: string | undefined,
  isRevealed: boolean,
  isSelf: boolean,
) {
  return isRevealed || isSelf ? (value ?? null) : null;
}
export function invitationUsable(
  invite: {
    revokedAt: Date | null;
    expiresAt: Date;
    useCount: number;
    maxUses: number;
  },
  now = new Date(),
) {
  return (
    !invite.revokedAt &&
    invite.expiresAt > now &&
    invite.useCount < invite.maxUses
  );
}
export function csvCell(value: unknown) {
  let s = String(value ?? "");
  if (/^[\s]*[=+@\-\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
