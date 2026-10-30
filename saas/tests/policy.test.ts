import { describe, it, expect, vi, afterEach } from "vitest";
import {
  visibleVote,
  canManage,
  canVote,
  invitationUsable,
  csvCell,
} from "../src/poker/policy";
import { issueTicket, readTicket } from "../src/poker/tickets";
process.env.JWT_SECRET = "test-only-secret-not-for-production-123456789";
afterEach(() => vi.useRealTimers());
describe("Room visibility and permissions", () => {
  it("does not disclose another participant vote before reveal", () => {
    expect(visibleVote("13", false, false)).toBeNull();
    expect(visibleVote("13", false, true)).toBe("13");
    expect(visibleVote("13", true, false)).toBe("13");
  });
  it("distinguishes participants, observers and facilitators", () => {
    expect(canManage("PARTICIPANT")).toBe(false);
    expect(canManage("FACILITATOR")).toBe(true);
    expect(canVote("OBSERVER")).toBe(false);
    expect(canVote("PARTICIPANT")).toBe(true);
  });
  it("rejects expired, revoked and exhausted invitations", () => {
    const invite = {
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60000),
      useCount: 0,
      maxUses: 1,
    };
    expect(invitationUsable(invite)).toBe(true);
    expect(invitationUsable({ ...invite, useCount: 1 })).toBe(false);
    expect(invitationUsable({ ...invite, revokedAt: new Date() })).toBe(false);
    expect(invitationUsable({ ...invite, expiresAt: new Date(0) })).toBe(false);
  });
  it("neutralizes spreadsheet formulas and escapes quotes in CSV", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("ordinary")).toBe('"ordinary"');
  });
  it("accepts only unmodified, unexpired SSE tickets", () => {
    const token = issueTicket("room-a", "actor-a");
    expect(readTicket(token)?.participantId).toBe("actor-a");
    expect(readTicket(token.replace("a", "b") + "x")).toBeNull();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 61000);
    expect(readTicket(token)).toBeNull();
  });
});
