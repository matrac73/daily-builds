import { ConversionError, csvToJson, jsonToCsv, parseCsv } from './converter.js';

const PREVIEW_ROW_LIMIT = 100;
// Excel only detects UTF-8 in CSV files that start with a byte order mark.
const FORMATS = {
  json: { label: 'JSON', mime: 'application/json', prefix: '' },
  csv: { label: 'CSV', mime: 'text/csv', prefix: '﻿' },
};
const SAMPLE = [
  { id: 1, name: 'Ada Lovelace', role: 'Mathematician', active: true, note: 'Wrote the "first program"' },
  { id: 2, name: 'Grace Hopper', role: 'Rear admiral, computer scientist', active: true, note: null },
  { id: 3, name: 'Alan Turing', role: 'Cryptanalyst', active: false, note: 'Born in London, UK' },
];

const byId = (id) => document.getElementById(id);
const boxes = { json: byId('json-input'), csv: byId('csv-input') };
const filePickers = { json: byId('json-file'), csv: byId('csv-file') };
const fileNames = { json: byId('json-name'), csv: byId('csv-name') };
const delimiterSelect = byId('delimiter');
const status = byId('status');
const preview = byId('preview');
const previewTable = byId('preview-table');
const previewSummary = byId('preview-summary');

function showStatus(kind, message) {
  status.dataset.kind = kind;
  status.textContent = message;
  status.hidden = false;
}

function buildRow(cellTag, values) {
  const row = document.createElement('tr');
  row.append(
    ...values.map((value) => {
      const cell = document.createElement(cellTag);
      cell.textContent = value;
      return cell;
    }),
  );
  return row;
}

/** Renders the CSV box as a table, or hides the preview if it cannot be parsed. */
function renderPreview() {
  let rows;
  try {
    rows = parseCsv(boxes.csv.value, delimiterSelect.value);
  } catch {
    rows = [];
  }
  preview.hidden = rows.length === 0;
  if (rows.length === 0) return;

  const [header, ...data] = rows.map((row) => row.map((field) => field.value));
  const shown = data.slice(0, PREVIEW_ROW_LIMIT);
  const head = document.createElement('thead');
  const body = document.createElement('tbody');
  head.append(buildRow('th', header));
  body.append(...shown.map((values) => buildRow('td', values)));
  previewTable.replaceChildren(head, body);

  const rowCount = `${data.length} row${data.length === 1 ? '' : 's'}`;
  previewSummary.textContent =
    shown.length < data.length ? `— first ${shown.length} of ${rowCount}` : `— ${rowCount}`;
}

function convert(source, target, run) {
  try {
    boxes[target].value = run(boxes[source].value, { delimiter: delimiterSelect.value });
    showStatus('success', `${FORMATS[source].label} converted to ${FORMATS[target].label}.`);
  } catch (error) {
    if (!(error instanceof ConversionError)) throw error;
    showStatus('warning', error.message);
    boxes[source].focus();
  }
  renderPreview();
}

async function loadFile(format, file) {
  try {
    boxes[format].value = await file.text();
    showStatus('success', `Loaded ${file.name}.`);
  } catch {
    showStatus('warning', `Could not read ${file.name}: the file is missing or unreadable.`);
  }
  renderPreview();
}

const actions = {
  toCsv: () => convert('json', 'csv', jsonToCsv),
  toJson: () => convert('csv', 'json', csvToJson),

  clear() {
    boxes.json.value = '';
    boxes.csv.value = '';
    status.hidden = true;
    renderPreview();
    boxes.json.focus();
  },

  sample() {
    boxes.json.value = JSON.stringify(SAMPLE, null, 2);
    actions.toCsv();
  },

  open: (format) => filePickers[format].click(),

  async copy(format) {
    const { label } = FORMATS[format];
    if (boxes[format].value === '') {
      showStatus('warning', `Nothing to copy: the ${label} box is empty.`);
      return;
    }
    try {
      await navigator.clipboard.writeText(boxes[format].value);
      showStatus('success', `${label} copied to the clipboard.`);
    } catch {
      showStatus('warning', 'Copy failed: the browser denied access to the clipboard.');
    }
  },

  save(format) {
    const { label, mime, prefix } = FORMATS[format];
    const text = boxes[format].value;
    if (text.trim() === '') {
      showStatus('warning', `Nothing to save: the ${label} box is empty.`);
      return;
    }
    const name = fileNames[format].value.trim() || `data.${format}`;
    try {
      const url = URL.createObjectURL(new Blob([prefix, text], { type: `${mime};charset=utf-8` }));
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url));
      showStatus('success', `Saved ${label} as ${name}.`);
    } catch (error) {
      showStatus('warning', `Saving ${name} failed: ${error.message}`);
    }
  },
};

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (button) actions[button.dataset.action](button.dataset.format);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    actions.toCsv();
  }
});

Object.entries(filePickers).forEach(([format, picker]) => {
  picker.addEventListener('change', () => {
    const [file] = picker.files;
    if (file) loadFile(format, file);
    picker.value = '';
  });
});

boxes.csv.addEventListener('input', renderPreview);
delimiterSelect.addEventListener('change', renderPreview);
