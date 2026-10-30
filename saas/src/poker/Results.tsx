import type { Statistics } from "./statistics";
export function Results({
  stats,
  compact = false,
}: {
  stats: Statistics;
  compact?: boolean;
}) {
  return (
    <section
      className={"poker-results " + (compact ? "compact" : "")}
      aria-label="Результаты голосования"
    >
      <div className="result-metrics">
        <div>
          <small>Средняя оценка</small>
          <strong data-testid="vote-average">{stats.average ?? "—"}</strong>
        </div>
        <div>
          <small>Медиана</small>
          <strong data-testid="vote-median">{stats.median ?? "—"}</strong>
        </div>
        <div>
          <small>Популярная оценка</small>
          <strong>{stats.mode ?? "—"}</strong>
        </div>
      </div>
      {!compact && (
        <>
          <p className="result-caption">
            Распределение голосов · {stats.totalVotes}
            {stats.numericVotes !== stats.totalVotes
              ? " · ? и перерыв не входят в среднее"
              : ""}
          </p>
          <div className="vote-distribution">
            {Object.entries(stats.distribution).map(([value, count]) => (
              <div key={value}>
                <b>{value === "coffee" ? "☕" : value}</b>
                <span className="distribution-track">
                  <i
                    style={{
                      width: `${stats.totalVotes ? (count / stats.totalVotes) * 100 : 0}%`,
                    }}
                  />
                </span>
                <small>
                  {count} ·{" "}
                  {stats.totalVotes
                    ? Math.round((count / stats.totalVotes) * 100)
                    : 0}
                  %
                </small>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
