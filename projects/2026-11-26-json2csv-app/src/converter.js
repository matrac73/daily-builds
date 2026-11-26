/**
 * Dependency-free JSON <-> CSV conversion.
 *
 * The two directions are designed to round-trip losslessly for flat data:
 * strings that could be mistaken for another type ("42", "true", "") are
 * quoted on the way out, and only unquoted fields are type-inferred on the
 * way back in.
 */

/** Error raised for any problem the user can fix by editing their input. */
export class ConversionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConversionError';
  }
}

const JSON_NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/;
const BYTE_ORDER_MARK = /^﻿/;

/** Interprets an unquoted CSV field: empty is null, then booleans, numbers, text. */
function inferValue(text) {
  if (text === '') return null;
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (JSON_NUMBER.test(text)) return Number(text);
  return text;
}

function formatField(value, delimiter) {
  if (value === null) return '';
  if (typeof value !== 'string') return String(value);

  const needsQuotes =
    inferValue(value) !== value || /["\r\n]/.test(value) || value.includes(delimiter);
  return needsQuotes ? `"${value.replaceAll('"', '""')}"` : value;
}

function parseJsonRows(text) {
  if (text.trim() === '') {
    throw new ConversionError('There is no JSON to convert: the input is empty.');
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new ConversionError(`Invalid JSON: ${error.message}`);
  }

  const rows = Array.isArray(data) ? data : [data];
  if (rows.length === 0) {
    throw new ConversionError('The JSON array is empty: there is nothing to convert.');
  }

  rows.forEach((row, index) => {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      throw new ConversionError(
        `Item ${index + 1} is not an object. Expected an object or an array of flat objects.`,
      );
    }
    const nestedKey = Object.keys(row).find(
      (key) => row[key] !== null && typeof row[key] === 'object',
    );
    if (nestedKey !== undefined) {
      throw new ConversionError(
        `Nested structures are not supported: item ${index + 1} has a nested value in "${nestedKey}".`,
      );
    }
  });

  return rows;
}

/**
 * Converts JSON text (a flat object or an array of flat objects) to CSV.
 * The header is the union of all keys, in order of first appearance; keys
 * missing from a row produce empty fields.
 *
 * @param {string} text
 * @param {{ delimiter?: string, eol?: string }} [options]
 * @returns {string}
 */
export function jsonToCsv(text, { delimiter = ',', eol = '\n' } = {}) {
  const rows = parseJsonRows(text);
  const headers = [...new Set(rows.flatMap(Object.keys))];
  if (headers.length === 0) {
    throw new ConversionError('The JSON objects have no properties: there is nothing to convert.');
  }

  const toLine = (values) => values.map((value) => formatField(value, delimiter)).join(delimiter);
  const dataLines = rows.map((row) =>
    toLine(headers.map((key) => (Object.hasOwn(row, key) ? row[key] : null))),
  );

  return [toLine(headers), ...dataLines].join(eol);
}

/**
 * Parses CSV text into rows of fields. Each field keeps track of whether it
 * was quoted so callers can tell `""` (empty string) from an empty field.
 * Handles escaped quotes, delimiters and line breaks inside quoted fields,
 * and LF, CRLF or CR line endings. Blank lines are skipped.
 *
 * @param {string} text
 * @param {string} [delimiter]
 * @returns {{ value: string, quoted: boolean }[][]}
 */
export function parseCsv(text, delimiter = ',') {
  const source = text.replace(BYTE_ORDER_MARK, '');
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  let insideQuotes = false;

  const endField = () => {
    row.push({ value, quoted });
    value = '';
    quoted = false;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];

    if (insideQuotes) {
      if (char !== '"') {
        value += char;
      } else if (source[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        insideQuotes = false;
      }
    } else if (char === '"' && value === '' && !quoted) {
      insideQuotes = true;
      quoted = true;
    } else if (char === delimiter) {
      endField();
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      endRow();
    } else {
      value += char;
    }
  }

  if (insideQuotes) {
    throw new ConversionError('Invalid CSV: a quoted field is never closed.');
  }
  if (value !== '' || quoted || row.length > 0) endRow();

  const isBlank = (fields) => fields.length === 1 && fields[0].value === '' && !fields[0].quoted;
  return rows.filter((fields) => !isBlank(fields));
}

/**
 * Converts CSV text (first row = header) to a JSON array of objects.
 * Unquoted fields are type-inferred (empty -> null, true/false, numbers);
 * quoted fields always stay strings. Short rows are padded with null.
 *
 * @param {string} text
 * @param {{ delimiter?: string, indent?: number }} [options]
 * @returns {string}
 */
export function csvToJson(text, { delimiter = ',', indent = 2 } = {}) {
  if (text.trim() === '') {
    throw new ConversionError('There is no CSV to convert: the input is empty.');
  }

  const [headerRow, ...dataRows] = parseCsv(text, delimiter);
  const headers = headerRow.map((field) => field.value);

  if (headers.includes('')) {
    throw new ConversionError('Invalid CSV: the header row contains an empty column name.');
  }
  const duplicate = headers.find((name, index) => headers.indexOf(name) !== index);
  if (duplicate !== undefined) {
    throw new ConversionError(`Invalid CSV: the column "${duplicate}" appears more than once.`);
  }

  const records = dataRows.map((fields, index) => {
    if (fields.length > headers.length) {
      throw new ConversionError(
        `Invalid CSV: row ${index + 2} has ${fields.length} fields but the header has ${headers.length}.`,
      );
    }
    return Object.fromEntries(
      headers.map((name, column) => {
        const field = fields[column];
        if (field === undefined) return [name, null];
        return [name, field.quoted ? field.value : inferValue(field.value)];
      }),
    );
  });

  return JSON.stringify(records, null, indent);
}
