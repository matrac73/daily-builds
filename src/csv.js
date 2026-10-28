// CSV import/export and normalisation of deal-sourcing exports into deal objects.

/** Canonical deal fields and the column headers (normalised) that map to them. */
export const COLUMN_ALIASES = {
  name: ['name', 'nom', 'cible', 'target', 'societe', 'company', 'entreprise', 'projet', 'project', 'codename'],
  sector: ['sector', 'secteur', 'industry', 'industrie', 'activite', 'activity', 'vertical'],
  country: ['country', 'pays', 'geo', 'geographie', 'geography', 'region', 'zone'],
  revenue: ['revenue', 'revenues', 'ca', 'chiffredaffaires', 'chiffreaffaires', 'sales', 'turnover', 'ventes'],
  ebitda: ['ebitda', 'ebe', 'excedentbrutdexploitation', 'ebitdaretraite', 'adjustedebitda'],
  growth: ['growth', 'croissance', 'croissanceca', 'revenuegrowth', 'cagr', 'tcam'],
  netDebt: ['netdebt', 'dettenette', 'dettefinancierenette', 'dfn', 'debt', 'dette'],
  description: ['description', 'commentaire', 'comment', 'comments', 'notes', 'note', 'pitch', 'resume'],
};

const NUMERIC_FIELDS = ['revenue', 'ebitda', 'growth', 'netDebt'];

/** Lowercase, strip accents, drop "(units)" and every non-alphanumeric character. */
export function normalizeHeader(header) {
  return String(header)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Pick ';' or ',' depending on which one appears most in the first line (outside quotes). */
export function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0].replace(/"[^"]*"/g, '');
  const count = (ch) => firstLine.split(ch).length - 1;
  if (count('\t') > count(';') && count('\t') > count(',')) return '\t';
  return count(';') > count(',') ? ';' : ',';
}

/** RFC 4180-ish parser: quoted fields, escaped quotes, CRLF, BOM. Returns an array of rows. */
export function parseCsv(text, delimiter = detectDelimiter(text)) {
  const src = text.replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/**
 * Parse numbers written the French or English way: "1 234,5", "1,234.5", "12 %", "3.2x", "-4,0 M€".
 * Returns null for empty / non-numeric cells ("n.a.", "-", "NC").
 */
export function parseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value == null) return null;
  let s = String(value).trim().replace(/[\s  ]/g, '');
  const negative = /^\(.*\)$/.test(s);
  s = s.replace(/[^0-9,.\-]/g, '');
  if (!/\d/.test(s)) return null;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // The right-most separator is the decimal one, the other is a thousands separator.
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma > -1) {
    s = s.split(',').length > 2 ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (s.split('.').length > 2) {
    s = s.replace(/\./g, '');
  }
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -Math.abs(n) : n;
}

/** Map each canonical field to the index of the first matching column, or -1. */
export function mapColumns(headerRow) {
  const normalized = headerRow.map(normalizeHeader);
  const mapping = {};
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    mapping[field] = normalized.findIndex((h) => aliases.includes(h));
  }
  return mapping;
}

/**
 * Turn parsed CSV rows (header first) into deal objects.
 * Amounts are kept in the unit of the source (M€ expected), growth in percent.
 */
export function rowsToDeals(rows) {
  if (rows.length === 0) return { deals: [], warnings: ['Empty file'], mapping: {} };
  const [header, ...body] = rows;
  const mapping = mapColumns(header);
  const warnings = [];

  for (const required of ['name', 'revenue']) {
    if (mapping[required] === -1) warnings.push(`No column found for "${required}"`);
  }
  if (mapping.name === -1 || mapping.revenue === -1) return { deals: [], warnings, mapping };

  const deals = [];
  body.forEach((cells, index) => {
    const cell = (field) => (mapping[field] === -1 ? '' : (cells[mapping[field]] ?? '').trim());
    const deal = { id: `d${index + 1}` };
    for (const field of Object.keys(COLUMN_ALIASES)) {
      deal[field] = NUMERIC_FIELDS.includes(field) ? parseNumber(cell(field)) : cell(field);
    }
    if (!deal.name || deal.revenue == null) {
      warnings.push(`Row ${index + 2} skipped: missing name or revenue`);
      return;
    }
    deals.push(deal);
  });
  return { deals, warnings, mapping };
}

function escapeCsvCell(value) {
  const s = value == null ? '' : String(value);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialise objects to a ';'-separated CSV (opens cleanly in a French Excel). */
export function toCsv(records, columns) {
  const lines = [columns.map((c) => escapeCsvCell(c.label)).join(';')];
  for (const record of records) {
    lines.push(columns.map((c) => escapeCsvCell(c.value(record))).join(';'));
  }
  return lines.join('\r\n');
}
