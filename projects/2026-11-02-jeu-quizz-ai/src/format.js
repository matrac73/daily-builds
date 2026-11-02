// Text helpers: HTML escaping, a tiny Python syntax highlighter and inline markup.

export function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Template tag that strips the common indentation so code can be indented in data files. */
export function dedent(strings, ...values) {
  const raw = typeof strings === 'string' ? strings : String.raw({ raw: strings.raw }, ...values);
  const lines = raw.replace(/\r\n/g, '\n').replace(/^(?:[ \t]*\n)+/, '').replace(/\s+$/, '').split('\n');
  const indents = lines.filter((line) => line.trim()).map((line) => line.match(/^ */)[0].length);
  const cut = indents.length ? Math.min(...indents) : 0;
  return lines.map((line) => line.slice(cut)).join('\n');
}

const KEYWORDS = new Set(
  ('and as assert async await break class continue def del elif else except finally for from global if ' +
    'import in is lambda nonlocal not or pass raise return try while with yield None True False').split(' '),
);
const BUILTINS = new Set(
  ('abs all any bool dict enumerate float int isinstance len list map max min open print range ' +
    'reversed self set sorted str sum super tuple zip').split(' '),
);

const TOKEN =
  /(#[^\n]*)|([rbfuRBFU]{0,2}(?:"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'))|(@[A-Za-z_][\w.]*)|(\b\d[\d_]*(?:\.\d+)?(?:e-?\d+)?\b)|([A-Za-z_]\w*)/g;

const span = (cls, text) => `<span class="tok-${cls}">${escapeHtml(text)}</span>`;

/** Returns safe HTML with <span class="tok-*"> around Python tokens. */
export function highlightPython(code) {
  let html = '';
  let last = 0;
  for (const match of code.matchAll(TOKEN)) {
    const [text, comment, string, decorator, number, word] = match;
    html += escapeHtml(code.slice(last, match.index));
    if (comment) html += span('comment', text);
    else if (string) html += span('string', text);
    else if (decorator) html += span('decorator', text);
    else if (number) html += span('number', text);
    else if (KEYWORDS.has(word)) html += span('keyword', text);
    else if (BUILTINS.has(word)) html += span('builtin', text);
    else html += escapeHtml(text);
    last = match.index + text.length;
  }
  return html + escapeHtml(code.slice(last));
}

/** Escapes text then renders `code` and **bold** spans. */
export function formatInline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}
