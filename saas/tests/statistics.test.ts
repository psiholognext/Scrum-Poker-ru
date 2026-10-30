import { describe, it, expect } from "vitest";
import { calculateStatistics } from "../src/poker/statistics";
describe("original poker statistics", () => {
  it("handles fractions, zero, unknown votes and coffee without mutating votes", () => {
    const votes = ["8", "1/2", "0", "?", "coffee", null, "8"];
    const before = [...votes];
    expect(calculateStatistics(votes)).toEqual({
      average: "4.1",
      median: "4.3",
      mode: "8",
      distribution: { "8": 2, "1/2": 1, "0": 1, "?": 1, coffee: 1 },
      totalVotes: 6,
      numericVotes: 4,
    });
    expect(votes).toEqual(before);
  });
  it("returns no numeric result for empty or unknown-only votes", () => {
    expect(calculateStatistics([])).toMatchObject({
      average: null,
      median: null,
      mode: null,
      totalVotes: 0,
    });
    expect(calculateStatistics(["?", "coffee"])).toMatchObject({
      average: null,
      median: null,
      totalVotes: 2,
    });
  });
});
