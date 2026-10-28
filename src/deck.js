// Swipe deck state: immutable helpers so the UI can persist, undo and test decisions easily.

export const LIKE = 'like';
export const PASS = 'pass';

/** Score from which a like triggers the "match" celebration. */
export const MATCH_THRESHOLD = 80;

export function emptyDeck() {
  return { decisions: {}, history: [] };
}

/** Record a verdict for a deal id. */
export function decide(deck, id, verdict) {
  if (verdict !== LIKE && verdict !== PASS) throw new Error(`Unknown verdict: ${verdict}`);
  return { decisions: { ...deck.decisions, [id]: verdict }, history: [...deck.history, id] };
}

/** Cancel the latest decision. */
export function undo(deck) {
  if (deck.history.length === 0) return deck;
  const history = deck.history.slice(0, -1);
  const { [deck.history.at(-1)]: _removed, ...decisions } = deck.decisions;
  return { decisions, history };
}

/** Remove a deal from the shortlist (and from the history) without touching other decisions. */
export function forget(deck, id) {
  const { [id]: _removed, ...decisions } = deck.decisions;
  return { decisions, history: deck.history.filter((h) => h !== id) };
}

/** Ranked entries not yet swiped, best first. */
export function remaining(ranked, deck) {
  return ranked.filter((entry) => !(entry.deal.id in deck.decisions));
}

/** Liked entries, kept in ranking order. */
export function shortlist(ranked, deck) {
  return ranked.filter((entry) => deck.decisions[entry.deal.id] === LIKE);
}

/** Make sure data restored from storage has the expected shape. */
export function restoreDeck(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.history) || typeof raw.decisions !== 'object') {
    return emptyDeck();
  }
  return { decisions: { ...raw.decisions }, history: [...raw.history] };
}
