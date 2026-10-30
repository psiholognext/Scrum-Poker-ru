export const DEFAULT_DECK = [
  "0",
  "1/2",
  "1",
  "2",
  "3",
  "5",
  "8",
  "13",
  "21",
  "34",
  "55",
  "89",
  "?",
];
export type Statistics = {
  mode: string | null;
  average: string | null;
  median: string | null;
  distribution: Record<string, number>;
  totalVotes: number;
  numericVotes: number;
};
// Preserve the original poker calculations, including half points and unknown votes.
// Work on copies so calculating a result cannot reorder the participants' votes.
export function calculateStatistics(
  votes: readonly (string | null | undefined)[],
): Statistics {
  const values = votes.filter(
    (v): v is string => v !== null && v !== undefined,
  );
  const numeric = values
    .map((v) => (v === "1/2" ? 0.5 : Number(v)))
    .filter((n, i) => values[i] !== "" && Number.isFinite(n));
  const distribution: Record<string, number> = {};
  for (const v of values) distribution[v] = (distribution[v] ?? 0) + 1;
  const mode =
    Object.entries(distribution).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const sorted = [...numeric].sort((a, b) => a - b);
  return {
    mode,
    distribution,
    totalVotes: values.length,
    numericVotes: numeric.length,
    average: numeric.length
      ? (numeric.reduce((a, b) => a + b, 0) / numeric.length).toFixed(1)
      : null,
    median: sorted.length
      ? (sorted.length % 2
          ? sorted[Math.floor(sorted.length / 2)]
          : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        ).toFixed(1)
      : null,
  };
}
