import assert from 'node:assert/strict';
import { test } from 'node:test';

import { escapeHtml, html, raw } from '../src/lib/html.js';

test('escapeHtml neutralises markup characters', () => {
  assert.equal(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`), '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;');
});

test('html escapes interpolated values', () => {
  const title = '<script>alert(1)</script>';
  assert.equal(String(html`<h1>${title}</h1>`), '<h1>&lt;script&gt;alert(1)&lt;/script&gt;</h1>');
});

test('html composes nested templates and arrays without double escaping', () => {
  const items = ['a&b', 'c'].map((item) => html`<li>${item}</li>`);
  assert.equal(String(html`<ul>${items}</ul>`), '<ul><li>a&amp;b</li><li>c</li></ul>');
});

test('html renders null, undefined and false as nothing but keeps 0', () => {
  assert.equal(String(html`[${null}${undefined}${false}${0}]`), '[0]');
});

test('raw opts a trusted string out of escaping', () => {
  assert.equal(String(html`<b>${raw('<i>ok</i>')}</b>`), '<b><i>ok</i></b>');
});
