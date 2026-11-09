/**
 * Conversion between the table model (see table.js) and GitHub Flavored
 * Markdown (GFM) tables, in both directions.
 */

import { fromRows } from './table.js';

const MIN_COL_WIDTH = 3;

/** Width of a string in user-perceived characters (code points). */
const textWidth = (text) => [...text].length;

/**
 * Make arbitrary text safe to put inside a GFM table cell:
 * pipes are escaped and line breaks become `<br>`.
 */
export function escapeCell(text) {
  return String(text)
    .trim()
    .replace(/\r\n|\r|\n/g, '<br>')
    .replace(/\|/g, '\\|');
}

function padCell(text, width, align) {
  const gap = width - textWidth(text);
  if (gap <= 0) return text;
  if (align === 'right') return ' '.repeat(gap) + text;
  if (align === 'center') {
    const left = Math.floor(gap / 2);
    return ' '.repeat(left) + text + ' '.repeat(gap - left);
  }
  return text + ' '.repeat(gap);
}

function delimiter(align, width) {
  switch (align) {
    case 'left':
      return ':' + '-'.repeat(width - 1);
    case 'right':
      return '-'.repeat(width - 1) + ':';
    case 'center':
      return ':' + '-'.repeat(width - 2) + ':';
    default:
      return '-'.repeat(width);
  }
}

const formatRow = (cells) => `| ${cells.join(' | ')} |`;

/**
 * Render a table as a GFM table. The first row is used as the header.
 * @param {import('./table.js').Table} table
 * @param {{ pretty?: boolean }} [options] `pretty` pads columns so the
 *   source lines up nicely in a plain-text editor (default: true).
 * @returns {string}
 */
export function toMarkdown(table, { pretty = true } = {}) {
  const rows = table.rows.map((cells) => cells.map(escapeCell));
  const widths = table.aligns.map((_, c) =>
    pretty ? Math.max(MIN_COL_WIDTH, ...rows.map((cells) => textWidth(cells[c]))) : MIN_COL_WIDTH,
  );
  const render = (cells) =>
    formatRow(cells.map((cell, c) => (pretty ? padCell(cell, widths[c], table.aligns[c]) : cell)));

  const [header, ...body] = rows;
  return [
    render(header),
    formatRow(table.aligns.map((align, c) => delimiter(align, widths[c]))),
    ...body.map(render),
  ].join('\n');
}

/** Split a table line on unescaped pipes, dropping the optional outer pipes. */
function splitRow(line) {
  let content = line.trim();
  if (content.startsWith('|')) content = content.slice(1);
  if (content.endsWith('|') && !content.endsWith('\\|')) content = content.slice(0, -1);
  return content.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

const DELIMITER_CELL = /^:?-+:?$/;

function parseAlign(cell) {
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');
  if (left && right) return 'center';
  if (left) return 'left';
  if (right) return 'right';
  return 'none';
}

/**
 * Parse the first GFM table found in `text`.
 * Body rows are padded or truncated to the header width, as GFM does.
 * @param {string} text
 * @returns {import('./table.js').Table | null} null when no table is found.
 */
export function parseMarkdownTable(text) {
  const lines = String(text).split(/\r\n|\r|\n/);
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!lines[i].includes('|')) continue;
    const header = splitRow(lines[i]);
    const delimiters = splitRow(lines[i + 1]);
    if (delimiters.length !== header.length || !delimiters.every((d) => DELIMITER_CELL.test(d))) {
      continue;
    }
    const body = [];
    for (let j = i + 2; j < lines.length && lines[j].trim() !== ''; j++) {
      const cells = splitRow(lines[j]);
      body.push(Array.from({ length: header.length }, (_, c) => cells[c] ?? ''));
    }
    return fromRows([header, ...body], delimiters.map(parseAlign));
  }
  return null;
}
