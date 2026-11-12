/**
 * A hand-written CSV reader and writer following RFC 4180:
 * quoted fields, doubled quotes as escapes, and line breaks inside quotes.
 */

/** An error whose message is safe to show to the user as a warning. */
export class ConversionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConversionError';
  }
}

/**
 * @typedef {{ text: string, quoted: boolean }} Field
 * @typedef {{ fields: Field[], line: number }} Record
 */

/**
 * Splits CSV text into records. Each field remembers whether it was quoted,
 * so callers can tell the string "42" apart from the number 42.
 * Completely blank lines are skipped.
 *
 * @param {string} text
 * @param {string} delimiter a single character
 * @returns {Record[]}
 */
export function parseCsv(text, delimiter = ',') {
  const records = [];
  let fields = [];
  let buffer = '';
  let quoted = false;
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;
  let quoteLine = 1;

  const endField = () => {
    fields.push({ text: buffer, quoted });
    buffer = '';
    quoted = false;
  };
  const endRecord = () => {
    endField();
    const blank = fields.length === 1 && fields[0].text === '' && !fields[0].quoted;
    if (!blank) records.push({ fields, line: recordLine });
    fields = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char !== '"') {
        if (char === '\n') line++;
        buffer += char;
      } else if (next === '"') {
        buffer += '"';
        i++;
      } else {
        inQuotes = false;
        const atFieldEnd =
          next === undefined || next === delimiter || next === '\n' || next === '\r';
        if (!atFieldEnd) {
          throw new ConversionError(
            `Line ${line}: unexpected character "${next}" after a closing quote.`,
          );
        }
      }
      continue;
    }

    if (char === '"') {
      if (buffer !== '' || quoted) {
        throw new ConversionError(
          `Line ${line}: unexpected quote inside an unquoted field. ` +
            'Wrap the whole field in quotes and double any quote inside it.',
        );
      }
      inQuotes = true;
      quoted = true;
      quoteLine = line;
    } else if (char === delimiter) {
      endField();
    } else if (char === '\n') {
      endRecord();
      line++;
      recordLine = line;
    } else if (char === '\r' && next === '\n') {
      // The line break is handled when the "\n" is reached.
    } else {
      buffer += char;
    }
  }

  if (inQuotes) {
    throw new ConversionError(`Line ${quoteLine}: a quoted field is never closed.`);
  }
  if (buffer !== '' || quoted || fields.length > 0) endRecord();

  return records;
}

/**
 * Serialises one field, quoting it when the CSV syntax requires it
 * or when the caller forces it.
 *
 * @param {string} text
 * @param {string} delimiter
 * @param {boolean} [forceQuotes]
 * @returns {string}
 */
export function formatField(text, delimiter = ',', forceQuotes = false) {
  const mustQuote =
    forceQuotes || text.includes(delimiter) || /["\r\n]/.test(text) || /^\s|\s$/.test(text);
  return mustQuote ? `"${text.replaceAll('"', '""')}"` : text;
}
