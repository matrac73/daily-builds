# Regex Form Validation

A no-build sign-up form whose three fields are validated entirely with regular expressions, with live feedback and a submit button that stays locked until everything is valid.

## Features

- **Password**: exactly 5 capital letters, 6 symbols and 2 hyphens, in any order, checked by a single regex built from counting lookaheads.
- **Username**: letters only (any alphabet, via `\p{L}`), no spaces.
- **Email**: `@gmail.com` addresses only, following Gmail's own rules (6 to 30 letters, digits or dots; no leading, trailing or doubled dot).
- **Specific error messages** shown on the form, such as `Use exactly 2 hyphens (found 1 hyphen).` rather than a generic "invalid".
- **Gated submit**: the button is disabled until all three fields pass, and the submit handler re-validates as a second guard.
- **Live password checklist** with per-rule counters (`3/5 capital letters`).
- **Bonus: password generator** that produces a random valid password using the browser's CSPRNG, plus a show/hide toggle.
- Accessible (labels, `aria-invalid`, live regions, keyboard focus management), responsive, and light/dark aware.
- Zero dependencies, no build step: plain HTML, CSS and ES modules.

## Quick start

Requires [Node.js](https://nodejs.org) 20 or newer (only for the tests and the local server).

```bash
git clone <this-repo-url> regex-form-validation
cd regex-form-validation
npm test          # run the unit tests
npm start         # serve the folder, then open the printed URL
```

ES modules do not load from `file://`, so the page needs an HTTP server. Any static server works, for example `python -m http.server 8000`. The app uses relative paths only, so it can be hosted from a sub-folder (GitHub Pages included).

## Usage

Fill in the three fields. Errors appear under a field once you leave it, and update as you type. Try these values:

| Field    | Valid                    | Invalid                                         |
| -------- | ------------------------ | ----------------------------------------------- |
| Username | `GraceHopper`, `José`    | `grace hopper`, `grace99`                       |
| Email    | `grace.hopper@gmail.com` | `grace@yahoo.com`, `grace..hopper@gmail.com`    |
| Password | `ABCDE!@#$%^--`          | `ABCD!@#$%^--` (4 capitals), `Abcde!@#$%^--`    |

"Symbols" are the ASCII punctuation characters other than the hyphen: ``! " # $ % & ' ( ) * + , . / : ; < = > ? @ [ \ ] ^ _ ` { | } ~``.

The validators are a standalone ES module, usable without the form:

```js
import { validatePassword, validateEmail, validateForm, generatePassword, PATTERNS } from "./validators.js";

validatePassword("ABCD!@#$%^--");
// { valid: false,
//   errors: ["Use exactly 5 capital letters (found 4 capital letters)."],
//   checks: [{ id: "capitals", count: 4, required: 5, ok: false }, ...] }

validateEmail("grace@yahoo.com");
// { valid: false, errors: ["Only @gmail.com addresses are accepted."] }

validateForm({ username: "grace", email: "grace.hopper@gmail.com", password: generatePassword() }).valid;
// true

PATTERNS.username; // /^\p{L}+$/u
```

### How the password regex works

Counting "exactly N of a kind, in any order" is done with one lookahead per character family, each of the form `(?=(?:[^X]*[X]){N}[^X]*$)`: skip non-`X` characters, match an `X`, repeat `N` times, then allow no further `X` until the end. Three of those (capitals, symbols, hyphens) are followed by a body that only permits those families and fixes the total length at 13.

## Project structure

```
.
├── index.html               # the form (entry point, served as-is)
├── styles.css               # layout, states, light/dark theme
├── app.js                   # DOM wiring: live feedback, submit gating, generator
├── validators.js            # regex patterns and validators (no DOM, runs in Node)
├── test/
│   └── validators.test.js   # node --test suite
├── package.json
└── LICENSE
```

## Tests

```bash
npm test
```

The suite uses Node's built-in test runner (no dependencies) and covers the three validators, the whole-form check, agreement between each regex and its error messages, and the password generator. The DOM layer in `app.js` is not covered by automated tests.

## License

[MIT](./LICENSE) © 2026 Mathieu Ract

> Built autonomously by [Claude Code](https://claude.com/claude-code) from the [florinpop17/app-ideas](https://github.com/florinpop17/app-ideas/blob/master/Projects/1-Beginner/Javascript-Validation-With-Regex.md) idea bank.
