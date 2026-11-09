# Markdown Table Generator

Type your data into an editable grid and get a clean, ready-to-paste GitHub Flavored Markdown table, with a live preview.

No framework, no build step, no dependencies: plain HTML, CSS and ES modules.

## Features

- **Create a table** with a given number of rows and columns (1–50 each); resizing keeps the data that still fits.
- **Edit every cell** directly in an HTML grid. The first row is the header.
- **Live Markdown output** that updates as you type, with pipes (`|`) escaped automatically.
- **Live preview** rendered *from the generated Markdown*, so you see exactly what GitHub will display.
- **Copy to clipboard** in one click (with a fallback for `file://` and other non-secure origins).
- **Insert rows and columns** above/below/left/right of the selected cell, and **delete** any row or column.
- **Align** the selected column or the whole table to the left, center, right (or default).
- **Aligned source**: optionally pad the Markdown so the columns line up in a plain-text editor, or emit a compact version.
- **Import** an existing Markdown table to edit it.
- Your table is **saved in `localStorage`**, so a page reload does not lose your work.
- Keyboard friendly (`Enter`/`↓`, `Shift+Enter`/`↑`, `Tab`), light and dark themes.

> Markdown only supports alignment **per column**, so the app offers column and whole-table alignment.
> Per-cell or per-row alignment cannot be expressed in a Markdown table and is intentionally not offered.

## Quick start

The app is a static site: serve the repository root with any static file server and open it.

```bash
git clone <this-repo-url> markdown-table-generator
cd markdown-table-generator
python -m http.server 8000
# then open http://localhost:8000
```

Or, with Node.js: `npx http-server -p 8000 .`

ES modules are not loaded from `file://` URLs by browsers, so use a local server rather than double-clicking `index.html`.
Every path is relative, so the app also works when published in a sub-folder (e.g. GitHub Pages).

## Usage

1. Set **Rows** and **Columns**, then click **Apply size**.
2. Type in the cells. Click a cell to select it; the toolbar acts on the selected cell's row and column.
3. Use **Column** alignment buttons (`—` default, `⇤` left, `↔` center, `⇥` right) for the selected column, or **Table** ones for every column.
4. Click **Copy** and paste the result into your README, issue or wiki.

Example output for a 3-column table with left / right / center alignment:

```markdown
| Name  | Age |   City   |
| :---- | --: | :------: |
| Ada   |  36 |  London  |
| Linus |  54 | Helsinki |
```

The same table with **Align source** unchecked:

```markdown
| Name | Age | City |
| :-- | --: | :-: |
| Ada | 36 | London |
| Linus | 54 | Helsinki |
```

The core logic is plain JavaScript and can be reused outside the browser:

```js
import { fromRows, setColumnAlign } from './src/table.js';
import { toMarkdown, parseMarkdownTable } from './src/markdown.js';

const table = setColumnAlign(fromRows([['Tool', 'Stars'], ['marked', '33k']]), 1, 'right');
console.log(toMarkdown(table));
// | Tool   | Stars |
// | ------ | ----: |
// | marked |   33k |

parseMarkdownTable('a | b\n--- | :-:\n1 | 2');
// { rows: [['a', 'b'], ['1', '2']], aligns: ['none', 'center'] }
```

## Project structure

```
.
├── index.html          # Page markup (served as-is)
├── style.css           # Styles, light and dark themes
├── app.js              # UI: rendering, events, clipboard, persistence
├── src/
│   ├── table.js        # Pure, immutable table model (resize, insert/delete, alignment)
│   └── markdown.js     # Table → GFM Markdown and GFM Markdown → table
├── test/
│   ├── table.test.js
│   └── markdown.test.js
├── package.json        # Only used for `npm test`; no dependencies
└── LICENSE
```

## Tests

The model and the Markdown conversion are covered by unit tests using Node's built-in test runner (Node.js 20+), no install needed:

```bash
npm test
# or
node --test
```

## License

[MIT](./LICENSE) © 2026 Mathieu Ract

> Built autonomously by [Claude Code](https://claude.com/claude-code) from the [florinpop17/app-ideas](https://github.com/florinpop17/app-ideas/blob/master/Projects/2-Intermediate/Markdown-Table-Generator.md) idea bank.
