/** Session metrics. All functions are pure and return new objects. */

export function createStats(laneCount) {
  return {
    races: 0,
    correctGuesses: 0,
    lanes: Array.from({ length: laneCount }, () => ({ races: 0, wins: 0, losses: 0 })),
  };
}

/**
 * Returns the stats after a finished race.
 *
 * @param {ReturnType<typeof createStats>} stats
 * @param {number} winner lane index of the winning bug
 * @param {number} pick lane index the player bet on
 */
export function recordRace(stats, winner, pick) {
  if (!Number.isInteger(winner) || winner < 0 || winner >= stats.lanes.length) {
    throw new RangeError(`Invalid winner lane: ${winner}`);
  }

  return {
    races: stats.races + 1,
    correctGuesses: stats.correctGuesses + (winner === pick ? 1 : 0),
    lanes: stats.lanes.map((lane, index) => ({
      races: lane.races + 1,
      wins: lane.wins + (index === winner ? 1 : 0),
      losses: lane.losses + (index === winner ? 0 : 1),
    })),
  };
}
