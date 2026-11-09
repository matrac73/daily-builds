/**
 * Pure, immutable table model.
 *
 * A table is `{ rows: string[][], aligns: Align[] }` where `rows[0]` is the
 * header row and every row has exactly `aligns.length` cells.
 * Every function returns a new table and never mutates its input.
 *
 * @typedef {'none' | 'left' | 'center' | 'right'} Align
 * @typedef {{ rows: string[][], aligns: Align[] }} Table
 */

export const ALIGNS = Object.freeze(['none', 'left', 'center', 'right']);

export const MIN_SIZE = 1;
export const MAX_SIZE = 50;

const clampSize = (n) => {
  const value = Math.trunc(Number(n));
  if (!Number.isFinite(value)) return MIN_SIZE;
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, value));
};

const assertIndex = (index, length, what) => {
  if (!Number.isInteger(index) || index < 0 || index >= length) {
    throw new RangeError(`${what} index ${index} is out of range (0..${length - 1})`);
  }
};

const assertAlign = (align) => {
  if (!ALIGNS.includes(align)) {
    throw new TypeError(`Unknown alignment "${align}" (expected one of ${ALIGNS.join(', ')})`);
  }
};

/**
 * Create an empty table. `rowCount` includes the header row.
 * Sizes are clamped to [MIN_SIZE, MAX_SIZE].
 * @returns {Table}
 */
export function createTable(rowCount, colCount) {
  const rows = clampSize(rowCount);
  const cols = clampSize(colCount);
  return {
    rows: Array.from({ length: rows }, () => Array(cols).fill('')),
    aligns: Array(cols).fill('none'),
  };
}

/**
 * Build a table from raw rows, padding ragged rows with empty cells.
 * @param {string[][]} rows
 * @param {Align[]} [aligns]
 * @returns {Table}
 */
export function fromRows(rows, aligns = []) {
  if (!Array.isArray(rows) || rows.length === 0) return createTable(1, 1);
  const cols = Math.max(MIN_SIZE, ...rows.map((row) => row.length));
  return {
    rows: rows.map((row) => Array.from({ length: cols }, (_, c) => String(row[c] ?? ''))),
    aligns: Array.from({ length: cols }, (_, c) => (ALIGNS.includes(aligns[c]) ? aligns[c] : 'none')),
  };
}

export const rowCount = (table) => table.rows.length;
export const colCount = (table) => table.aligns.length;

/** Resize the table, keeping existing content that still fits. */
export function resizeTable(table, newRowCount, newColCount) {
  const rows = clampSize(newRowCount);
  const cols = clampSize(newColCount);
  return {
    rows: Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => table.rows[r]?.[c] ?? ''),
    ),
    aligns: Array.from({ length: cols }, (_, c) => table.aligns[c] ?? 'none'),
  };
}

export function setCell(table, row, col, value) {
  assertIndex(row, rowCount(table), 'Row');
  assertIndex(col, colCount(table), 'Column');
  return {
    rows: table.rows.map((cells, r) =>
      r === row ? cells.map((cell, c) => (c === col ? String(value) : cell)) : [...cells],
    ),
    aligns: [...table.aligns],
  };
}

/** Insert an empty row so that it ends up at `index` (0..rowCount). */
export function insertRow(table, index) {
  assertIndex(index, rowCount(table) + 1, 'Row');
  if (rowCount(table) >= MAX_SIZE) return table;
  const rows = table.rows.map((cells) => [...cells]);
  rows.splice(index, 0, Array(colCount(table)).fill(''));
  return { rows, aligns: [...table.aligns] };
}

/** Delete the row at `index`. The last remaining row cannot be deleted. */
export function deleteRow(table, index) {
  assertIndex(index, rowCount(table), 'Row');
  if (rowCount(table) <= MIN_SIZE) return table;
  return {
    rows: table.rows.filter((_, r) => r !== index).map((cells) => [...cells]),
    aligns: [...table.aligns],
  };
}

/** Insert an empty column so that it ends up at `index` (0..colCount). */
export function insertColumn(table, index) {
  assertIndex(index, colCount(table) + 1, 'Column');
  if (colCount(table) >= MAX_SIZE) return table;
  const withCell = (list, value) => [...list.slice(0, index), value, ...list.slice(index)];
  return {
    rows: table.rows.map((cells) => withCell(cells, '')),
    aligns: withCell(table.aligns, 'none'),
  };
}

/** Delete the column at `index`. The last remaining column cannot be deleted. */
export function deleteColumn(table, index) {
  assertIndex(index, colCount(table), 'Column');
  if (colCount(table) <= MIN_SIZE) return table;
  const without = (list) => list.filter((_, c) => c !== index);
  return {
    rows: table.rows.map(without),
    aligns: without(table.aligns),
  };
}

export function setColumnAlign(table, col, align) {
  assertIndex(col, colCount(table), 'Column');
  assertAlign(align);
  return {
    rows: table.rows.map((cells) => [...cells]),
    aligns: table.aligns.map((a, c) => (c === col ? align : a)),
  };
}

/** Apply the same alignment to every column. */
export function setTableAlign(table, align) {
  assertAlign(align);
  return {
    rows: table.rows.map((cells) => [...cells]),
    aligns: table.aligns.map(() => align),
  };
}
