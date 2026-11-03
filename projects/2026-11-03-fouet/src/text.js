// Text helpers: decide what the whip types and which elements it can type into.

const TEXT_INPUT_TYPES = new Set(['', 'text', 'search']);

/**
 * Pad `phrase` with spaces so it reads naturally between `before` and `after`.
 * "Write tests" + "faster" -> " faster" ; "" + "faster" -> "faster".
 */
export function spacedPhrase(before, after, phrase) {
  const lead = before.length > 0 && !/\s$/.test(before) ? ' ' : '';
  const trail = after.length > 0 && !/^\s/.test(after) ? ' ' : '';
  return lead + phrase + trail;
}

/** Insert `phrase` into `value` over the [start, end) selection. */
export function insertPhrase(value, start, end, phrase) {
  const before = value.slice(0, start);
  const after = value.slice(end);
  const text = spacedPhrase(before, after, phrase);
  return { value: before + text + after, caret: before.length + text.length, text };
}

/** True if the whip is allowed to type into this element. */
export function isWhippable(el) {
  if (!el || el.disabled || el.readOnly) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName === 'INPUT') {
    return TEXT_INPUT_TYPES.has((el.getAttribute('type') || '').toLowerCase());
  }
  return false;
}

/** Walk up from the element under the lash tip to the closest whippable zone. */
export function findWhippable(el) {
  for (let node = el; node; node = node.parentElement) {
    if (isWhippable(node)) return node;
  }
  return null;
}
