# Currency Converter

A no-build currency converter Web Component: type an amount, pick two currencies, and get the converted value instantly using live European Central Bank reference rates.

## Features

- **Instant conversion** — the result (rounded to two decimals) updates as soon as the amount, the source currency or the destination currency changes.
- **30 currencies, sorted** — both drop-downs list currencies alphabetically by code, with readable names from `Intl.DisplayNames`.
- **Input validation** — up to 9 digits, `.` or `,` as decimal separator; anything that is not a number triggers an inline, screen-reader-announced alert.
- **Swap button** — exchange source and destination in one click.
- **Live rates with offline fallback** — rates come from the free, key-less [Frankfurter API](https://frankfurter.dev/) (ECB data). If the request fails, a bundled snapshot is used and the status line says so.
- **Zero dependencies, zero build** — plain HTML, CSS and ES modules; one `<currency-converter>` custom element with Shadow DOM. Light and dark themes follow the system setting.

## Quick start

The app uses ES modules, so it must be served over HTTP (opening `index.html` from disk will not work):

```bash
git clone <this-repo-url> currency-converter
cd currency-converter
npx serve .
```

Then open the URL printed by `serve` (usually <http://localhost:3000>). Any static server works, e.g. `python -m http.server 8000`.

## Usage

Use the page as is, or drop the component into any page:

```html
<link rel="stylesheet" href="./styles.css" />
<script type="module" src="./src/components/currency-converter.js"></script>

<currency-converter amount="250" from="GBP" to="JPY"></currency-converter>
```

| Attribute | Default | Description                     |
| --------- | ------- | ------------------------------- |
| `amount`  | `1`     | Initial amount                  |
| `from`    | `USD`   | Initial source currency code    |
| `to`      | `EUR`   | Initial destination currency code |

Colours are driven by the CSS custom properties defined in `styles.css` (`--surface`, `--accent`, `--danger`, …), which inherit into the component.

The conversion logic is also usable on its own:

```js
import { parseAmount, convert, formatAmount } from './src/converter.js';
import { loadRates } from './src/rates.js';

const { rates } = await loadRates();
const amount = parseAmount('100');            // { ok: true, value: 100 }
formatAmount(convert(amount.value, 'USD', 'EUR', rates)); // e.g. "89.17"
```

## Project structure

```
index.html                           Page shell
styles.css                           Page layout and design tokens (light/dark)
src/
  converter.js                       Pure logic: parsing, conversion, rounding, formatting
  rates.js                           Rate loading (Frankfurter API) + bundled fallback snapshot
  components/currency-converter.js   <currency-converter> custom element
tests/
  converter.test.js                  Tests for the pure logic
  rates.test.js                      Tests for rate normalisation and fallback
```

## Tests

Requires Node.js 20 or later; there is nothing to install.

```bash
npm test
```

The suite covers amount parsing and the 9-digit limit, cross-rate conversion, float-safe rounding, formatting, currency sorting, API payload validation and the offline fallback (with an injected `fetch`).

## License

[MIT](./LICENSE) © 2026 Mathieu Ract

> Built autonomously by [Claude Code](https://claude.com/claude-code) from the [florinpop17/app-ideas](https://github.com/florinpop17/app-ideas/blob/master/Projects/2-Intermediate/Currency-Converter.md) idea bank.
