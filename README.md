# JSON2CSV

Paste JSON, get a spreadsheet-ready CSV — and back — in a dependency-free web app that runs entirely in your browser.

## Features

- **JSON → CSV**: converts a flat object or an array of flat objects. The header is the union of all keys, so rows with missing keys still line up.
- **CSV → JSON**: the reverse conversion, with a hand-written parser that handles quoted fields, escaped quotes, embedded line breaks and LF/CRLF/CR line endings.
- **Lossless round trip**: strings that look like another type (`"42"`, `"true"`, `""`) are quoted on the way out and only unquoted fields are type-inferred on the way back, so `JSON → CSV → JSON` returns the original data.
- **Clear warnings**: empty input, invalid JSON, nested structures (with the offending item and key), unclosed quotes, duplicate columns and overlong rows.
- **Files**: open a `.json` / `.csv` file into either box, and save either box under the file name of your choice (CSV is saved with a UTF-8 BOM so Excel reads accents correctly).
- **Extras**: comma, semicolon or tab delimiter, live table preview of the CSV, copy to clipboard, sample data, `Ctrl` + `Enter` to convert, light and dark themes.
- **Private**: no server, no tracking, no third-party code — the data never leaves the page.

## Quick start

No build step and no dependencies. ES modules need to be served over HTTP, so start any static server from the repository root:

```bash
git clone <this-repo-url> json2csv-app
cd json2csv-app
python -m http.server 8000
```

Then open <http://localhost:8000>. (`npx serve .` works just as well.)

## Usage

1. Paste JSON into the left box (or click **Open…** / **Load sample**).
2. Click **Convert JSON → CSV**. The CSV appears in the right box with a table preview below.
3. Click **Save** to download it, or **Copy** to put it on the clipboard.
4. To go the other way, paste CSV on the right and click **Convert CSV → JSON**.
5. **Clear** empties both boxes.

### Example

```json
[
  { "id": 1, "name": "Ada Lovelace", "note": "Wrote the \"first program\"" },
  { "id": 2, "name": "Grace Hopper", "note": null }
]
```

becomes

```csv
id,name,note
1,Ada Lovelace,"Wrote the ""first program"""
2,Grace Hopper,
```

### Conversion rules

| JSON value            | CSV field           |
| --------------------- | ------------------- |
| `null` or missing key | empty               |
| `true` / `42`         | `true` / `42`       |
| `"hello"`             | `hello`             |
| `""`, `"42"`, `"true"` | `""`, `"42"`, `"true"` (quoted to stay strings) |
| text with delimiter, quote or line break | quoted, quotes doubled |
| nested object or array | not supported — reported as a warning |

### Using the converter as a module

The core logic has no DOM dependency and can be imported anywhere:

```js
import { jsonToCsv, csvToJson } from './src/converter.js';

jsonToCsv('[{"a":1,"b":"x;y"}]', { delimiter: ';' }); // 'a;b\n1;"x;y"'
csvToJson('a,b\n1,hello');                            // '[\n  {\n    "a": 1,\n    "b": "hello"\n  }\n]'
```

Both functions throw a `ConversionError` with a human-readable message when the input cannot be converted.

## Project structure

```
index.html              Page markup
styles.css              Layout and light/dark themes
src/converter.js        Pure conversion logic (jsonToCsv, csvToJson, parseCsv)
src/app.js              DOM wiring: buttons, files, preview, status messages
tests/converter.test.js Unit tests for the conversion logic
```

## Tests

The tests use the Node.js built-in test runner (Node 20+), no install required:

```bash
npm test
```

## License

[MIT](./LICENSE) © 2026 Mathieu Ract

> Built autonomously by [Claude Code](https://claude.com/claude-code) from the [florinpop17/app-ideas](https://github.com/florinpop17/app-ideas/blob/master/Projects/1-Beginner/JSON2CSV-App.md) idea bank.
