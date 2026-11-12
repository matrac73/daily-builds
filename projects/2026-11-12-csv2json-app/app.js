import { csvToJson, jsonToCsv } from './src/converter.js';

const byId = (id) => document.getElementById(id);

const status = byId('status');
const delimiter = byId('delimiter');
const inferTypes = byId('infer-types');

const panes = {
  csv: {
    label: 'CSV',
    mimeType: 'text/csv',
    text: byId('csv-text'),
    fileName: byId('csv-file-name'),
    fileInput: byId('csv-file-input'),
  },
  json: {
    label: 'JSON',
    mimeType: 'application/json',
    text: byId('json-text'),
    fileName: byId('json-file-name'),
    fileInput: byId('json-file-input'),
  },
};

function showStatus(kind, message) {
  status.dataset.kind = kind;
  status.textContent = message;
  status.hidden = false;
}

function hideStatus() {
  status.hidden = true;
  status.textContent = '';
}

/** Runs a conversion and shows its result, or its error as a warning. */
function convert(source, target, run) {
  try {
    target.text.value = run(source.text.value);
    showStatus('success', `Converted ${source.label} to ${target.label}.`);
  } catch (error) {
    if (error.name !== 'ConversionError') throw error;
    showStatus('warning', error.message);
    source.text.focus();
  }
}

async function openFile(pane) {
  const [file] = pane.fileInput.files;
  if (!file) return;
  try {
    pane.text.value = await file.text();
    pane.fileName.value = file.name;
    showStatus('success', `Loaded ${file.name}.`);
  } catch {
    showStatus('warning', `Could not read ${file.name}. The file may have been moved or deleted.`);
  } finally {
    // Allow picking the same file again.
    pane.fileInput.value = '';
  }
}

function saveFile(pane) {
  const name = pane.fileName.value.trim();
  if (pane.text.value.trim() === '') {
    showStatus('warning', `The ${pane.label} box is empty. There is nothing to save.`);
    return;
  }
  if (name === '') {
    showStatus('warning', `Enter a file name for the ${pane.label} file first.`);
    pane.fileName.focus();
    return;
  }
  try {
    const url = URL.createObjectURL(new Blob([pane.text.value], { type: pane.mimeType }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
    showStatus('success', `Saved ${name} to your downloads.`);
  } catch (error) {
    showStatus('warning', `Could not save ${name}: ${error.message}`);
  }
}

byId('to-json').addEventListener('click', () => {
  convert(panes.csv, panes.json, (csv) =>
    csvToJson(csv, { delimiter: delimiter.value, inferTypes: inferTypes.checked }),
  );
});

byId('to-csv').addEventListener('click', () => {
  convert(panes.json, panes.csv, (json) => jsonToCsv(json, { delimiter: delimiter.value }));
});

byId('clear').addEventListener('click', () => {
  panes.csv.text.value = '';
  panes.json.text.value = '';
  hideStatus();
});

byId('options').addEventListener('submit', (event) => event.preventDefault());

for (const [key, pane] of Object.entries(panes)) {
  byId(`${key}-open`).addEventListener('click', () => pane.fileInput.click());
  byId(`${key}-save`).addEventListener('click', () => saveFile(pane));
  pane.fileInput.addEventListener('change', () => openFile(pane));
}
