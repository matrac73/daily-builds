# CSV2JSON

A two-way CSV ⇄ JSON converter that runs entirely in your browser, built on a hand-written RFC 4180 parser — no dependencies, no build step, no upload.

## Features

- **CSV → JSON**: paste CSV, click **Convert to JSON**, get a pretty-printed array of objects.
- **JSON → CSV**: paste an array of flat objects (or a single object), click **Convert to CSV**.
- **Real CSV parsing**: quoted fields, embedded delimiters, doubled quotes (`""`), line breaks inside quotes, CRLF line endings, byte order marks.
- **Clear warnings**: empty input, unclosed quotes, rows that do not match the header (with line numbers), duplicate headers, invalid or nested JSON.
- **Type detection** (optional): unquoted `42`, `true`, `null` and empty fields become JSON numbers, booleans and `null`; quoted fields such as `"42"` always stay strings, and values like `007` or very long IDs are never mangled.
- **Lossless round-trips**: JSON → CSV → JSON gives back the same values with the same types.
- **Delimiter choice**: comma, semicolon, tab or pipe.
- **Open / Save files**: load a `.csv` or `.json` file into its text box and save either box under the file name you choose.
- **Clear** button, light and dark themes, responsive layout, keyboard and screen-reader friendly.

No conversion library is used: the CSV reader and writer live in `src/csv.js`.

## Quick start

The app is plain HTML, CSS and ES modules. ES modules need to be served over HTTP, so start any static server from the repository root:

```sh
git clone <repository-url> csv2json
cd csv2json
npx serve .
```

Then open the URL printed by the server (for example <http://localhost:3000>). `python -m http.server` works just as well. The project can also be published as-is on GitHub Pages.

## Usage

Paste this in the **CSV** box and click **Convert to JSON →**:

```csv
name,age,member,note
Ada,36,true,
"Torvalds, Linus",28,false,"He said ""hi"""
```

The **JSON** box receives:

```json
[
  {
    "name": "Ada",
    "age": 36,
    "member": true,
    "note": null
  },
  {
    "name": "Torvalds, Linus",
    "age": 28,
    "member": false,
    "note": "He said \"hi\""
  }
]
```

Click **← Convert to CSV** to go the other way. Rules worth knowing:

| Situation | Behaviour |
| --- | --- |
| First CSV line | Used as the header (property names); names must be unique and non-empty |
| Blank lines | Skipped |
| Unquoted empty field | `null` (or `""` when type detection is off) |
| Quoted field, e.g. `"42"` or `""` | Always a string |
| Objects with different keys | The CSV header is the union of all keys; missing values are left empty |
| Nested objects or arrays | Rejected with a warning |

To work with files, click **Open CSV** / **Open JSON** to pick a file, and **Save CSV** / **Save JSON** to download the box content under the name typed in the file-name field. Browsers cannot read or write arbitrary paths, so opening uses the system file picker and saving goes to your downloads folder.

### Using the converter from code

The core is DOM-free and can be imported directly:

```js
import { csvToJson, jsonToCsv } from './src/converter.js';

csvToJson('id;label\n1;"a;b"', { delimiter: ';' });
// '[\n  {\n    "id": 1,\n    "label": "a;b"\n  }\n]'

jsonToCsv('[{"id":1,"label":"a,b"}]');
// 'id,label\n1,"a,b"'
```

Both functions throw a `ConversionError` with a user-readable message when the input is empty or invalid.

## Project structure

```
index.html              Page markup
styles.css              Styling (light and dark themes)
app.js                  DOM wiring: buttons, warnings, file open/save
src/csv.js              RFC 4180 CSV parser and field formatter
src/converter.js        csvToJson / jsonToCsv, validation and type detection
tests/csv.test.js       Parser and formatter tests
tests/converter.test.js Conversion, warning and round-trip tests
```

## Tests

The core logic is covered by Node's built-in test runner (Node 20 or later, no install needed):

```sh
npm test
```

## License

[MIT](./LICENSE) © 2026 Mathieu Ract

> Built autonomously by [Claude Code](https://claude.com/claude-code) from the [florinpop17/app-ideas](https://github.com/florinpop17/app-ideas/blob/master/Projects/1-Beginner/CSV2JSON-App.md) idea bank.
