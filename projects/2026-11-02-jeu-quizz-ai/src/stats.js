// Progress persistence (localStorage-compatible), kept pure for testing.

export const STATS_KEY = 'jeu-quizz-ai/stats/v1';

export function emptyStats() {
  return { categories: {} };
}

export function categoryStats(stats, categoryId) {
  return { played: 0, answered: 0, correct: 0, bestPct: 0, mistakes: [], ...stats.categories[categoryId] };
}

/** Returns new stats including a finished game; the "mistakes" list feeds the review mode. */
export function recordGame(stats, categoryId, summary) {
  const prev = categoryStats(stats, categoryId);
  const mistakes = new Set(prev.mistakes);
  summary.missedCardIds.forEach((id) => mistakes.add(id));
  summary.masteredCardIds.forEach((id) => mistakes.delete(id));
  return {
    ...stats,
    categories: {
      ...stats.categories,
      [categoryId]: {
        played: prev.played + 1,
        answered: prev.answered + summary.total,
        correct: prev.correct + summary.correct,
        bestPct: Math.max(prev.bestPct, summary.pct),
        mistakes: [...mistakes],
      },
    },
  };
}

export function loadStats(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(STATS_KEY) ?? 'null');
    return parsed && typeof parsed.categories === 'object' && parsed.categories !== null ? parsed : emptyStats();
  } catch {
    return emptyStats();
  }
}

export function saveStats(storage, stats) {
  try {
    storage?.setItem(STATS_KEY, JSON.stringify(stats));
    return true;
  } catch {
    // Private browsing or full quota: the game still works, progress just isn't kept.
    return false;
  }
}
