/**
 * Score persistence. `storage` is anything with getItem/setItem (localStorage
 * in the browser, a stub in tests). Storage failures never break the game.
 */

export const STORAGE_KEY = 'shell-game:score';

export const emptyScore = () => ({ played: 0, wins: 0 });

const isCount = (n) => Number.isInteger(n) && n >= 0;

export function loadScore(storage) {
  try {
    const raw = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');
    if (raw && isCount(raw.played) && isCount(raw.wins) && raw.wins <= raw.played) {
      return { played: raw.played, wins: raw.wins };
    }
  } catch {
    // Corrupted or unavailable storage: start fresh.
  }
  return emptyScore();
}

export function saveScore(storage, score) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify({ played: score.played, wins: score.wins }));
  } catch {
    // Private mode / quota exceeded: the score simply won't persist.
  }
}

/** Win rate as a whole percentage, or null when no game was played. */
export function winRate({ played, wins }) {
  return played === 0 ? null : Math.round((wins / played) * 100);
}
