# Deal Screener

**Tinder for deals: swipe through an encrypted deal database to find your next platform acquisition target from a handful of KPIs.**

Deal Screener turns a deal-sourcing spreadsheet (revenue, EBITDA, growth, net debt, sector, geography…) into a swipeable deck ranked by how well each company fits the platform profile you are looking for. It is a static web app — no server, no build step — and the database is shipped **encrypted**: colleagues unlock it with a shared passphrase and everything is decrypted in their browser only.

## Features

- **Fit score (0–100)** for every deal, computed from the profile you set: revenue range, minimum EBITDA margin, minimum growth, maximum leverage (net debt / EBITDA). Each criterion has its own weight and decays smoothly with the distance to the target; missing KPIs get a neutral score and are flagged `n.d.`.
- **Sector & geography filters** as one-click chips, built from the data.
- **Swipe deck**: drag the card, click ✕ / ♥ or use `←` / `→`; `Backspace` undoes the last swipe. A strong fit (score ≥ 80) that you like triggers an *It's a match!*.
- **Shortlist** with live scores, one-click removal and **CSV export** (`;`-separated, opens cleanly in a French Excel).
- **Encrypted dataset**: AES-256-GCM with a key derived by PBKDF2-SHA256 (310 000 iterations) from the team passphrase, via the Web Crypto API. Raw exports are git-ignored; only the `*.enc.json` vault is committed.
- **Tolerant importer**: detects `;` / `,` / tab separators, French and English headers (`CA`, `Chiffre d'affaires`, `EBE`, `Dette nette`, `Revenue`, `Net debt`…) and number formats (`1 234,5`, `1,234.5`, `12 %`, `n.a.`).
- Criteria and swipes are remembered per dataset in `localStorage`.

## Quick start

Requirements: Node.js ≥ 20 (for the packing tool and tests) and any static file server.

```bash
git clone <this repo> deal-screener
cd deal-screener
python -m http.server 8000      # or: npx serve .
```

Open <http://localhost:8000> and unlock the bundled **synthetic** demo dataset with the passphrase `screener-demo`.

> The app fetches `./data/deals.enc.json`, so it must be served over HTTP — opening `index.html` from the file system will not work.

## Using your own deals

1. Export your deal list to CSV from Excel (*File → Save as → CSV UTF-8*). One row per company. Recognised columns (case, accents and units in brackets are ignored):

   | Field        | Accepted headers (examples)                                    |
   |--------------|----------------------------------------------------------------|
   | name *       | `Cible`, `Nom`, `Société`, `Projet`, `Target`, `Company`       |
   | revenue *    | `CA (M€)`, `Chiffre d'affaires`, `Revenue`, `Sales`            |
   | ebitda       | `EBITDA (M€)`, `EBE`, `Adjusted EBITDA`                        |
   | growth       | `Croissance CA (%)`, `TCAM`, `CAGR`, `Growth`                  |
   | netDebt      | `Dette nette (M€)`, `DFN`, `Net debt`                          |
   | sector       | `Secteur`, `Activité`, `Industry`                              |
   | country      | `Pays`, `Géographie`, `Region`                                 |
   | description  | `Commentaire`, `Notes`, `Pitch`                                |

   \* required. Amounts are expected in M€, growth in %.

2. Encrypt it into the vault the app loads:

   ```bash
   node tools/pack.mjs ~/Downloads/deals.csv
   # Passphrase to share with your team: ********
   ```

   Non-interactive variant (CI, scripts):

   ```bash
   DEAL_SCREENER_PASSPHRASE='a long passphrase' node tools/pack.mjs deals.csv --out data/deals.enc.json
   ```

   `--hint "…"` stores a clear-text hint shown on the lock screen (the demo uses it to display its passphrase — never do that with real data).

3. Commit `data/deals.enc.json` only. `*.csv` / `*.xlsx` files are git-ignored so the raw export cannot leak by accident.

## Sharing it with your team

The app is plain static files, so GitHub Pages serves it as-is (*Settings → Pages → Deploy from branch → `main` / root*). All paths are relative, so it also works from a sub-folder.

Security model, honestly:

- The vault is public to anyone who can reach the site, but unreadable without the passphrase. Its protection is **exactly as strong as the passphrase**: use a long random one, share it through your internal channels, and re-pack with a new one when someone leaves.
- To also restrict *who can load the page* to your organisation's members, host the app from a **private repository** with GitHub Pages access control (GitHub Enterprise Cloud: *Pages → Visibility → Private*), which requires a GitHub login belonging to the organisation. Combine both for proprietary data.
- Never publish a real vault in a public repository: this public version only contains synthetic data.

## Scoring model

For each active criterion the deal gets a sub-score between 0 and 1:

| Criterion | 1 when…                         | Otherwise                                         |
|-----------|---------------------------------|---------------------------------------------------|
| Size      | revenue within [min, max]       | `revenue / min` below, `max / revenue` above      |
| Margin    | EBITDA margin ≥ target          | `margin / target` (0 if EBITDA ≤ 0)               |
| Growth    | growth ≥ target                 | linear decay, 0 at 10 points below the target     |
| Leverage  | net debt / EBITDA ≤ max, or net cash | `max / leverage` (0 if indebted with EBITDA ≤ 0) |

The fit score is the weighted average × 100. Leave a threshold empty or set its weight to 0 to ignore it. Sector and country selections are hard filters.

## Project structure

```
index.html            App shell (lock screen, criteria panel, deck, shortlist)
styles.css            Styles
src/
  app.js              UI: unlocking, rendering, drag & keyboard swipes, export
  scoring.js          Fit score, derived KPIs (margin, leverage), filters, ranking
  deck.js             Immutable swipe state: decide, undo, forget, shortlist
  csv.js              CSV parser/serialiser, number parsing, header mapping
  vault.js            AES-GCM + PBKDF2 seal/open (Web Crypto, browser & Node)
tools/pack.mjs        CLI: CSV export → encrypted data/deals.enc.json
data/
  demo-deals.csv      Synthetic demo dataset (fictional companies)
  deals.enc.json      Encrypted vault loaded by the app
test/                 node:test suites for csv, scoring, deck and vault
```

## Tests

```bash
npm test          # or: node --test
```

The suites cover CSV parsing edge cases (quotes, BOM, French numbers), header aliasing, every scoring rule, ranking, swipe-deck state, and the encryption round-trip including wrong passphrases and tampered data. No dependencies to install.

## License

[MIT](./LICENSE) © 2026 Mathieu Ract

> Built autonomously by [Claude Code](https://claude.com/claude-code).
