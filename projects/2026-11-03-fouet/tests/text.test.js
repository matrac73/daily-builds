import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findWhippable, insertPhrase, isWhippable, spacedPhrase } from '../src/text.js';
import { bookmarkletHref } from '../src/bookmarklet.js';

/** Minimal stand-in for a DOM element. */
function el(tagName, { type, parent = null, ...props } = {}) {
  return { tagName, parentElement: parent, getAttribute: (n) => (n === 'type' ? type ?? null : null), ...props };
}

test('spacedPhrase adds spaces only where needed', () => {
  assert.equal(spacedPhrase('', '', 'faster'), 'faster');
  assert.equal(spacedPhrase('write tests', '', 'faster'), ' faster');
  assert.equal(spacedPhrase('write tests ', '', 'faster'), 'faster');
  assert.equal(spacedPhrase('go', 'now', 'faster'), ' faster ');
  assert.equal(spacedPhrase('line\n', ' tail', 'DO IT'), 'DO IT');
});

test('insertPhrase appends at the caret and returns the new caret', () => {
  const r = insertPhrase('Refactor billing', 16, 16, 'faster');
  assert.equal(r.value, 'Refactor billing faster');
  assert.equal(r.caret, r.value.length);
});

test('insertPhrase replaces the selection in the middle of text', () => {
  const r = insertPhrase('do the thing', 3, 6, 'FASTER!');
  assert.equal(r.value, 'do FASTER! thing');
  assert.equal(r.caret, 'do FASTER!'.length);
  assert.equal(r.text, 'FASTER!');
});

test('isWhippable accepts text fields and contenteditable only', () => {
  assert.ok(isWhippable(el('TEXTAREA')));
  assert.ok(isWhippable(el('INPUT')));
  assert.ok(isWhippable(el('INPUT', { type: 'search' })));
  assert.ok(isWhippable(el('DIV', { isContentEditable: true })));
  assert.equal(isWhippable(el('INPUT', { type: 'password' })), false);
  assert.equal(isWhippable(el('INPUT', { type: 'checkbox' })), false);
  assert.equal(isWhippable(el('TEXTAREA', { disabled: true })), false);
  assert.equal(isWhippable(el('INPUT', { readOnly: true })), false);
  assert.equal(isWhippable(el('P')), false);
  assert.equal(isWhippable(null), false);
});

test('findWhippable walks up to the closest editable ancestor', () => {
  const editor = el('DIV', { isContentEditable: true });
  const span = el('SPAN', { parent: el('B', { parent: editor }) });
  assert.equal(findWhippable(span), editor);
  assert.equal(findWhippable(el('P', { parent: el('BODY') })), null);
  assert.equal(findWhippable(null), null);
});

test('bookmarklet embeds the absolute module URL and toggles an existing whip', () => {
  const href = bookmarkletHref('https://example.github.io/fouet/src/fouet.js');
  assert.ok(href.startsWith('javascript:'));
  const code = decodeURIComponent(href.slice('javascript:'.length));
  assert.ok(code.includes('import("https://example.github.io/fouet/src/fouet.js")'));
  assert.ok(code.includes('window.__fouet'));
  assert.doesNotThrow(() => new Function(code));
});

test('bookmarklet refuses non-http module URLs', () => {
  assert.throws(() => bookmarkletHref('file:///C:/fouet/src/fouet.js'), /http\(s\)/);
});
