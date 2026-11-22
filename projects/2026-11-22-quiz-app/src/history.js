/**
 * Score history persisted in a Web Storage-like object
 * (anything with getItem / setItem / removeItem).
 */

const STORAGE_KEY = 'quiz-app:history:v1';
export const MAX_ATTEMPTS = 100;

/** In-memory stand-in for localStorage (used when it is unavailable, and in tests). */
export function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, String(value)),
    removeItem: (key) => void data.delete(key),
  };
}

function isAttempt(value) {
  return (
    typeof value?.quizId === 'string' &&
    Number.isFinite(value.correct) &&
    Number.isFinite(value.total) &&
    Number.isFinite(value.percent) &&
    Number.isFinite(value.durationMs) &&
    Number.isFinite(value.finishedAt) &&
    typeof value.passed === 'boolean'
  );
}

/** Stored attempts, oldest first. Corrupted data is ignored rather than thrown. */
export function loadHistory(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isAttempt) : [];
  } catch {
    return [];
  }
}

/** Appends the attempt described by a quiz summary and returns the updated history. */
export function recordAttempt(storage, summary) {
  const { quizId, title, correct, total, percent, passed, durationMs, finishedAt } = summary;
  const attempt = { quizId, title, correct, total, percent, passed, durationMs, finishedAt };
  const history = [...loadHistory(storage), attempt].slice(-MAX_ATTEMPTS);
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Storage full or blocked: the score still shows for this session.
  }
  return history;
}

export function clearHistory(storage) {
  storage.removeItem(STORAGE_KEY);
}

/** Attempt count and personal best for one quiz (best score, ties broken by fastest time). */
export function statsFor(history, quizId) {
  const attempts = history.filter((attempt) => attempt.quizId === quizId);
  const best = attempts.reduce(
    (top, attempt) =>
      !top ||
      attempt.percent > top.percent ||
      (attempt.percent === top.percent && attempt.durationMs < top.durationMs)
        ? attempt
        : top,
    null,
  );
  return { attempts: attempts.length, best };
}
