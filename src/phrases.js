// Motivational phrases, escalating with the combo of consecutive hits.

export const PHRASES = Object.freeze([
  Object.freeze(['faster', 'do it', 'make it', 'go on', 'come on', 'keep going', 'push it']),
  Object.freeze(['FASTER!', 'DO IT NOW!', 'MAKE IT WORK!', 'SHIP IT!', 'NO BREAKS!', 'MOVE IT!']),
  Object.freeze(['FASTER!!!', 'DO IT. NOW.', 'NO EXCUSES!!', 'MAKE IT HAPPEN!!', 'HARDER!!!', 'SHIP IT YESTERDAY!']),
]);

/** Every `hitsPerTier` hits in a combo unlock the next, louder tier. */
export function tierForCombo(combo, tierCount = PHRASES.length, hitsPerTier = 3) {
  if (combo < 1) return 0;
  return Math.min(tierCount - 1, Math.floor((combo - 1) / hitsPerTier));
}

/** Random picker that never returns the same phrase twice in a row. */
export function createPhrasePicker({ phrases = PHRASES, random = Math.random } = {}) {
  let last = null;
  return {
    pick(tier) {
      const pool = phrases[Math.max(0, Math.min(phrases.length - 1, tier))];
      const choices = pool.length > 1 ? pool.filter((p) => p !== last) : pool;
      last = choices[Math.floor(random() * choices.length) % choices.length];
      return last;
    },
  };
}

/** Counts hits that land within `windowMs` of each other. */
export function createCombo({ windowMs = 1800 } = {}) {
  let count = 0;
  let lastHit = -Infinity;
  return {
    hit(now) {
      count = now - lastHit <= windowMs ? count + 1 : 1;
      lastHit = now;
      return count;
    },
    get count() {
      return count;
    },
  };
}
