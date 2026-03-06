// Utility functions for calculating poker statistics
export function calculateStatistics(votes: (string | null | undefined)[]) {
  // Filter out null/undefined votes and convert to numbers (except '?' values)
  const numericVotes = votes
    .filter((value): value is string => value !== null && value !== undefined)
    .filter((value) => value !== '?')
    .map((value) => (value === '1/2' ? 0.5 : Number.parseFloat(value)))
    .filter((value) => !Number.isNaN(value))

  // Calculate mode (most common value)
  const voteCount = votes
    .filter((value): value is string => value !== null && value !== undefined)
    .reduce(
      (accumulator, current) => {
        accumulator[current] = (accumulator[current] || 0) + 1
        return accumulator
      },
      {} as Record<string, number>,
    )

  const mode = Object.entries(voteCount).sort((a, b) => b[1] - a[1])[0]?.[0] || null

  // Calculate average (excluding '?' values)
  const average = numericVotes.length
    ? (numericVotes.reduce((a, b) => a + b, 0) / numericVotes.length).toFixed(1)
    : null

  // Calculate median
  const sortedVotes = [...numericVotes].sort((a, b) => a - b)
  const median = sortedVotes.length
    ? sortedVotes.length % 2 === 0
      ? ((sortedVotes[sortedVotes.length / 2 - 1] + sortedVotes[sortedVotes.length / 2]) / 2).toFixed(1)
      : sortedVotes[Math.floor(sortedVotes.length / 2)].toFixed(1)
    : null

  return {
    mode,
    average,
    median,
    distribution: voteCount,
    totalVotes: votes.filter((value) => value !== null && value !== undefined).length,
  }
}

// Memoized version for better performance
const statsCache = new Map<string, ReturnType<typeof calculateStatistics>>()

export function calculateStatisticsMemo(votes: (string | null | undefined)[]) {
  const key = JSON.stringify(votes.sort())

  if (statsCache.has(key)) {
    return statsCache.get(key)!
  }

  const result = calculateStatistics(votes)

  // Keep cache size reasonable
  if (statsCache.size > 100) {
    const firstKey = statsCache.keys().next().value
    if (firstKey) {
      statsCache.delete(firstKey)
    }
  }

  statsCache.set(key, result)
  return result
}
