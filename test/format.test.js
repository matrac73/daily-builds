import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, dedent, highlightPython, formatInline } from '../src/format.js';

test('escapeHtml neutralises markup', () => {
  assert.equal(escapeHtml('<img src=x onerror="a">&\''), '&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;');
});

test('dedent strips common indentation and surrounding blank lines', () => {
  const code = dedent`
    def f(x):
        return x
  `;
  assert.equal(code, 'def f(x):\n    return x');
});

test('dedent keeps backslashes and interpolated values', () => {
  const sep = ', ';
  assert.equal(dedent`
    print("\n".join(a)${sep}b)
  `, 'print("\\n".join(a), b)');
});

test('highlightPython tags keywords, builtins, strings, numbers and comments', () => {
  const html = highlightPython('def f(n):  # doc\n    return len("x") + 42');
  assert.match(html, /<span class="tok-keyword">def<\/span>/);
  assert.match(html, /<span class="tok-keyword">return<\/span>/);
  assert.match(html, /<span class="tok-builtin">len<\/span>/);
  assert.match(html, /<span class="tok-string">&quot;x&quot;<\/span>/);
  assert.match(html, /<span class="tok-number">42<\/span>/);
  assert.match(html, /<span class="tok-comment"># doc<\/span>/);
});

test('highlightPython does not treat keywords inside strings or identifiers as keywords', () => {
  const html = highlightPython('format_if = "if else"');
  assert.doesNotMatch(html, /tok-keyword/);
  assert.match(html, /tok-string/);
});

test('highlightPython escapes HTML and preserves the source text', () => {
  const code = 'x = a < b and "<b>" # <i>\n@lru_cache\ndef g(): return f"{x}"';
  const html = highlightPython(code);
  assert.doesNotMatch(html, /<b>|<i>/);
  const text = html.replace(/<[^>]+>/g, '').replaceAll('&lt;', '<').replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&');
  assert.equal(text, code);
  assert.match(html, /tok-decorator">@lru_cache/);
});

test('formatInline renders code and bold after escaping', () => {
  assert.equal(formatInline('Use `a<b` and **vite**'), 'Use <code>a&lt;b</code> and <strong>vite</strong>');
});
