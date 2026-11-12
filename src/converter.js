/**
 * CSV <-> JSON conversion for flat (non-nested) records.
 *
 * The two directions are designed to round-trip: an unquoted CSV field that
 * looks like a JSON literal (number, true, false, null, or nothing at all)
 * becomes that literal, while a quoted field always stays a string. When
 * writing CSV, strings that would otherwise be mistaken for a literal are
 * quoted.
 */

import { ConversionError, formatField, parseCsv } from './csv.js';

const JSON_NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/;
const BYTE_ORDER_MARK = '﻿';

/**
 * Reads an unquoted CSV field as a JSON literal, or returns undefined when
 * the field is plain text.
 */
function readLiteral(text) {
  if (text === '' || text === 'null') return null;
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (JSON_NUMBER.test(text)) {
    const number = Number(text);
    // Long digit strings (IDs, card numbers) would silently lose precision.
    const lossy = !Number.isFinite(number) || (/^-?\d+$/.test(text) && !Number.isSafeInteger(number));
    if (!lossy) return number;
  }
  return undefined;
}

function requireContent(text, label) {
  const content = text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text;
  if (content.trim() === '') {
    throw new ConversionError(`The ${label} box is empty. Paste some ${label} first.`);
  }
  return content;
}

function readHeader(record) {
  const names = record.fields.map((field) => field.text);
  const seen = new Set();
  names.forEach((name, index) => {
    if (name.trim() === '') {
      throw new ConversionError(`Line ${record.line}: column ${index + 1} has no header name.`);
    }
    if (seen.has(name)) {
      throw new ConversionError(`Line ${record.line}: the header "${name}" appears more than once.`);
    }
    seen.add(name);
  });
  return names;
}

/**
 * Converts CSV text (first line = header) to a pretty-printed JSON array of objects.
 *
 * @param {string} csvText
 * @param {{ delimiter?: string, inferTypes?: boolean }} [options]
 *   inferTypes: turn unquoted numbers, booleans and empty fields into JSON
 *   numbers, booleans and null. When false every value is a string.
 * @returns {string}
 * @throws {ConversionError} when the text is empty or not valid CSV
 */
export function csvToJson(csvText, { delimiter = ',', inferTypes = true } = {}) {
  const [header, ...records] = parseCsv(requireContent(csvText, 'CSV'), delimiter);
  const names = readHeader(header);

  const rows = records.map(({ fields, line }) => {
    if (fields.length !== names.length) {
      throw new ConversionError(
        `Line ${line}: expected ${names.length} field${names.length === 1 ? '' : 's'} ` +
          `to match the header, but found ${fields.length}.`,
      );
    }
    // Object.fromEntries defines own properties, so a "__proto__" header is safe.
    return Object.fromEntries(
      fields.map(({ text, quoted }, index) => {
        const literal = inferTypes && !quoted ? readLiteral(text) : undefined;
        return [names[index], literal === undefined ? text : literal];
      }),
    );
  });

  return JSON.stringify(rows, null, 2);
}

function parseJsonRows(jsonText) {
  let data;
  try {
    data = JSON.parse(requireContent(jsonText, 'JSON'));
  } catch (error) {
    if (error instanceof ConversionError) throw error;
    throw new ConversionError(`Invalid JSON: ${error.message}`);
  }

  const rows = Array.isArray(data) ? data : [data];
  rows.forEach((row, index) => {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      throw new ConversionError(
        Array.isArray(data)
          ? `Item ${index + 1} is not an object. Expected an array of flat objects.`
          : 'Expected a JSON object or an array of flat objects.',
      );
    }
    for (const [key, value] of Object.entries(row)) {
      if (value !== null && typeof value === 'object') {
        throw new ConversionError(
          `Item ${index + 1}, "${key}": nested objects and arrays are not supported.`,
        );
      }
    }
  });
  return rows;
}

/**
 * Converts a JSON array of flat objects (or a single flat object) to CSV.
 * The header is the union of all keys, in order of first appearance;
 * missing keys and null become empty fields.
 *
 * @param {string} jsonText
 * @param {{ delimiter?: string }} [options]
 * @returns {string}
 * @throws {ConversionError} when the text is empty, not valid JSON, or nested
 */
export function jsonToCsv(jsonText, { delimiter = ',' } = {}) {
  const rows = parseJsonRows(jsonText);
  const names = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  if (names.length === 0) {
    throw new ConversionError('The JSON contains no properties to convert.');
  }

  const formatValue = (value) => {
    if (value === null || value === undefined) return '';
    if (typeof value !== 'string') return String(value);
    // Quote strings that would read back as a number, boolean or null.
    return formatField(value, delimiter, readLiteral(value) !== undefined);
  };

  const lines = [
    names.map((name) => formatField(name, delimiter)),
    ...rows.map((row) => names.map((name) => formatValue(Object.hasOwn(row, name) ? row[name] : null))),
  ];
  return lines.map((fields) => fields.join(delimiter)).join('\n');
}
