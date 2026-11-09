import {
  ALIGNS,
  colCount,
  createTable,
  deleteColumn,
  deleteRow,
  fromRows,
  insertColumn,
  insertRow,
  resizeTable,
  rowCount,
  setCell,
  setColumnAlign,
  setTableAlign,
} from './src/table.js';
import { parseMarkdownTable, toMarkdown } from './src/markdown.js';

const STORAGE_KEY = 'markdown-table-generator:v1';

const ALIGN_LABELS = { none: 'Default', left: 'Left', center: 'Center', right: 'Right' };
const ALIGN_ICONS = { none: '—', left: '⇤', center: '↔', right: '⇥' };

const $ = (selector) => document.querySelector(selector);

const els = {
  grid: $('#grid'),
  rowsInput: $('#rows-input'),
  colsInput: $('#cols-input'),
  selectionLabel: $('#selection-label'),
  markdown: $('#markdown-output'),
  preview: $('#preview'),
  pretty: $('#pretty-input'),
  copyBtn: $('#copy-btn'),
  copyStatus: $('#copy-status'),
  importInput: $('#import-input'),
  importError: $('#import-error'),
};

const defaultState = () => ({
  table: fromRows(
    [
      ['Feature', 'Status', 'Notes'],
      ['Live preview', 'Done', 'Updates as you type'],
      ['Copy to clipboard', 'Done', 'One click'],
    ],
    ['left', 'center', 'none'],
  ),
  pretty: true,
});

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.table?.rows)) {
      return { table: fromRows(saved.table.rows, saved.table.aligns), pretty: saved.pretty !== false };
    }
  } catch {
    // Unavailable or corrupted storage: fall back to the default table.
  }
  return defaultState();
}

const state = { ...loadState(), selection: { row: 0, col: 0 } };

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ table: state.table, pretty: state.pretty }));
  } catch {
    // Storage may be full or disabled (private mode); persistence is optional.
  }
}

/* ---------- Rendering ---------- */

function renderGrid() {
  const { table } = state;
  const fragment = document.createDocumentFragment();
  table.rows.forEach((cells, r) => {
    const tr = document.createElement('tr');
    cells.forEach((value, c) => {
      const td = document.createElement(r === 0 ? 'th' : 'td');
      const input = document.createElement('input');
      input.type = 'text';
      input.value = value;
      input.dataset.row = r;
      input.dataset.col = c;
      input.style.textAlign = table.aligns[c] === 'none' ? '' : table.aligns[c];
      input.setAttribute('aria-label', `${r === 0 ? 'Header' : `Row ${r}`}, column ${c + 1}`);
      if (r === 0) input.placeholder = `Header ${c + 1}`;
      td.append(input);
      tr.append(td);
    });
    fragment.append(tr);
  });
  els.grid.replaceChildren(fragment);
  els.rowsInput.value = rowCount(table);
  els.colsInput.value = colCount(table);
  renderSelection();
}

function renderSelection() {
  const { row, col } = state.selection;
  for (const input of els.grid.querySelectorAll('input')) {
    const r = Number(input.dataset.row);
    const c = Number(input.dataset.col);
    input.parentElement.classList.toggle('in-row', r === row);
    input.parentElement.classList.toggle('in-col', c === col);
    input.parentElement.classList.toggle('selected', r === row && c === col);
  }
  els.selectionLabel.textContent = `${row === 0 ? 'Header' : `Row ${row}`} · Column ${col + 1}`;

  const columnAlign = state.table.aligns[col];
  const allSame = state.table.aligns.every((a) => a === state.table.aligns[0]);
  for (const button of document.querySelectorAll('.align-group button')) {
    const active =
      button.dataset.scope === 'column'
        ? button.dataset.align === columnAlign
        : allSame && button.dataset.align === state.table.aligns[0];
    button.setAttribute('aria-pressed', String(active));
  }
}

function appendCellText(parent, text) {
  text.split('<br>').forEach((line, i) => {
    if (i > 0) parent.append(document.createElement('br'));
    parent.append(line);
  });
}

function renderOutput() {
  const markdown = toMarkdown(state.table, { pretty: state.pretty });
  els.markdown.value = markdown;
  els.markdown.rows = Math.min(20, rowCount(state.table) + 2);

  // The preview is rendered from the generated Markdown itself, so it shows
  // exactly what a GFM renderer will make of the output.
  const parsed = parseMarkdownTable(markdown);
  const table = document.createElement('table');
  parsed.rows.forEach((cells, r) => {
    const tr = document.createElement('tr');
    cells.forEach((text, c) => {
      const cell = document.createElement(r === 0 ? 'th' : 'td');
      if (parsed.aligns[c] !== 'none') cell.style.textAlign = parsed.aligns[c];
      appendCellText(cell, text);
      tr.append(cell);
    });
    (r === 0 ? table.createTHead() : table.tBodies[0] ?? table.createTBody()).append(tr);
  });
  els.preview.replaceChildren(table);
}

function render() {
  renderGrid();
  renderOutput();
}

/* ---------- State updates ---------- */

function focusCell(row, col) {
  els.grid.querySelector(`input[data-row="${row}"][data-col="${col}"]`)?.focus();
}

/** Replace the table, keep the selection in range, re-render and persist. */
function commit(table, selection = state.selection) {
  state.table = table;
  state.selection = {
    row: Math.min(selection.row, rowCount(table) - 1),
    col: Math.min(selection.col, colCount(table) - 1),
  };
  render();
  save();
}

const structuralActions = {
  'row-above': ({ row, col }) => [insertRow(state.table, row), { row, col }],
  'row-below': ({ row, col }) => [insertRow(state.table, row + 1), { row: row + 1, col }],
  'row-delete': ({ row, col }) => [deleteRow(state.table, row), { row, col }],
  'col-left': ({ row, col }) => [insertColumn(state.table, col), { row, col }],
  'col-right': ({ row, col }) => [insertColumn(state.table, col + 1), { row, col: col + 1 }],
  'col-delete': ({ row, col }) => [deleteColumn(state.table, col), { row, col }],
};

/* ---------- Events ---------- */

function buildAlignButtons() {
  for (const group of document.querySelectorAll('.align-group')) {
    const scope = group.dataset.scope;
    for (const align of ALIGNS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.scope = scope;
      button.dataset.align = align;
      button.textContent = ALIGN_ICONS[align];
      button.title = `${ALIGN_LABELS[align]} alignment for the ${scope === 'column' ? 'selected column' : 'whole table'}`;
      button.setAttribute('aria-label', button.title);
      group.append(button);
    }
  }
}

els.grid.addEventListener('input', (event) => {
  const { row, col } = event.target.dataset;
  state.table = setCell(state.table, Number(row), Number(col), event.target.value);
  renderOutput();
  save();
});

els.grid.addEventListener('focusin', (event) => {
  if (!event.target.matches('input')) return;
  state.selection = { row: Number(event.target.dataset.row), col: Number(event.target.dataset.col) };
  renderSelection();
});

els.grid.addEventListener('keydown', (event) => {
  if (!event.target.matches('input')) return;
  const up = event.key === 'ArrowUp' || (event.key === 'Enter' && event.shiftKey);
  const down = event.key === 'ArrowDown' || (event.key === 'Enter' && !event.shiftKey);
  if (!up && !down) return;
  event.preventDefault();
  const { row, col } = state.selection;
  focusCell(up ? Math.max(0, row - 1) : Math.min(rowCount(state.table) - 1, row + 1), col);
});

$('#structure-toolbar').addEventListener('click', (event) => {
  const action = structuralActions[event.target.closest('button')?.dataset.action];
  if (!action) return;
  const [table, selection] = action(state.selection);
  commit(table, selection);
  focusCell(state.selection.row, state.selection.col);
});

for (const group of document.querySelectorAll('.align-group')) {
  group.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const { scope, align } = button.dataset;
    commit(
      scope === 'column'
        ? setColumnAlign(state.table, state.selection.col, align)
        : setTableAlign(state.table, align),
    );
  });
}

$('#size-form').addEventListener('submit', (event) => {
  event.preventDefault();
  commit(resizeTable(state.table, els.rowsInput.value, els.colsInput.value));
});

$('#clear-btn').addEventListener('click', () => {
  commit(createTable(rowCount(state.table), colCount(state.table)), { row: 0, col: 0 });
  focusCell(0, 0);
});

$('#import-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const table = parseMarkdownTable(els.importInput.value);
  if (!table) {
    els.importError.textContent = 'No Markdown table found (a header row followed by a | --- | row).';
    return;
  }
  els.importError.textContent = '';
  els.importInput.value = '';
  commit(table, { row: 0, col: 0 });
});

els.pretty.addEventListener('change', () => {
  state.pretty = els.pretty.checked;
  renderOutput();
  save();
});

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard API is unavailable on insecure origins (e.g. file://).
    els.markdown.select();
    if (!document.execCommand('copy')) throw new Error('Copy failed');
  }
}

let copyTimer;
els.copyBtn.addEventListener('click', async () => {
  let message;
  try {
    await copyToClipboard(els.markdown.value);
    message = 'Copied!';
  } catch {
    message = 'Press Ctrl+C';
    els.markdown.select();
  }
  els.copyBtn.textContent = message;
  els.copyStatus.textContent = message === 'Copied!' ? 'Markdown copied to clipboard' : 'Copy failed, text selected';
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    els.copyBtn.textContent = 'Copy';
    els.copyStatus.textContent = '';
  }, 1500);
});

buildAlignButtons();
els.pretty.checked = state.pretty;
render();
