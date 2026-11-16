/**
 * Regex-driven validators for the sign-up form.
 *
 * Each validator answers "is it valid?" with a single regular expression
 * (see PATTERNS), then explains a failure with human-readable messages.
 * The module has no DOM dependency, so it runs unchanged in Node and browsers.
 */

/** ASCII punctuation except the hyphen, which the password rule counts separately. */
const SYMBOL_CLASS = "!-,./:-@\\[-`{-~";

export const PASSWORD_RULES = Object.freeze({ capitals: 5, symbols: 6, hyphens: 2 });

const PASSWORD_LENGTH = PASSWORD_RULES.capitals + PASSWORD_RULES.symbols + PASSWORD_RULES.hyphens;

/** Lookahead asserting that the whole string holds exactly `count` characters of `charClass`. */
const exactly = (count, charClass) =>
  `(?=(?:[^${charClass}]*[${charClass}]){${count}}[^${charClass}]*$)`;

export const PATTERNS = Object.freeze({
  // Three lookaheads count each character family; the body forbids anything else.
  password: new RegExp(
    "^" +
      exactly(PASSWORD_RULES.capitals, "A-Z") +
      exactly(PASSWORD_RULES.symbols, SYMBOL_CLASS) +
      exactly(PASSWORD_RULES.hyphens, "\\-") +
      `[A-Z\\-${SYMBOL_CLASS}]{${PASSWORD_LENGTH}}$`,
  ),
  // Letters of any alphabet, and nothing else.
  username: /^\p{L}+$/u,
  // Gmail's own rules: 6–30 letters, digits or dots; no leading, trailing or doubled dot.
  email: /^(?!.*\.\.)[a-z0-9][a-z0-9.]{4,28}[a-z0-9]@gmail\.com$/i,
});

const COUNTERS = Object.freeze({
  capitals: /[A-Z]/g,
  symbols: new RegExp(`[${SYMBOL_CLASS}]`, "g"),
  hyphens: /-/g,
  others: new RegExp(`[^A-Z\\-${SYMBOL_CLASS}]`, "gu"),
});

const LABELS = Object.freeze({
  capitals: ["capital letter", "capital letters"],
  symbols: ["symbol", "symbols"],
  hyphens: ["hyphen", "hyphens"],
});

const matches = (value, pattern) => value.match(pattern) ?? [];

const describeCharacter = (char) => (/\s/.test(char) ? "space" : `"${char}"`);

/**
 * @param {string} value
 * @returns {{ valid: boolean, errors: string[], checks: { id: string, count: number, required: number, ok: boolean }[] }}
 *   `checks` reports progress on every rule, so a UI can show a live checklist.
 */
export function validatePassword(value) {
  const checks = Object.entries(PASSWORD_RULES).map(([id, required]) => {
    const count = matches(value, COUNTERS[id]).length;
    return { id, count, required, ok: count === required };
  });
  const others = [...new Set(matches(value, COUNTERS.others))];
  checks.push({ id: "others", count: others.length, required: 0, ok: others.length === 0 });

  const valid = PATTERNS.password.test(value);
  const errors = [];
  if (value === "") {
    errors.push("Enter a password.");
  } else if (!valid) {
    for (const { id, count, required, ok } of checks) {
      if (ok || id === "others") continue;
      const [singular, plural] = LABELS[id];
      errors.push(`Use exactly ${required} ${plural} (found ${count} ${count === 1 ? singular : plural}).`);
    }
    if (others.length > 0) {
      const shown = others.slice(0, 5).map(describeCharacter).join(", ");
      const more = others.length > 5 ? ", …" : "";
      errors.push(`Remove characters that are not capitals, symbols or hyphens: ${shown}${more}.`);
    }
  }
  return { valid, errors, checks };
}

/**
 * @param {string} value
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateUsername(value) {
  const valid = PATTERNS.username.test(value);
  const errors = [];
  if (value === "") {
    errors.push("Enter a username.");
  } else if (!valid) {
    if (/\s/.test(value)) errors.push("Usernames cannot contain spaces.");
    if (/[^\p{L}\s]/u.test(value)) errors.push("Use letters only: no digits, symbols or punctuation.");
  }
  return { valid, errors };
}

function diagnoseEmail(value) {
  if (value === "") return "Enter your Gmail address.";
  if (/\s/.test(value)) return "Email addresses cannot contain spaces.";

  const parts = value.split("@");
  if (parts.length !== 2 || parts[0] === "" || parts[1] === "") {
    return "Enter a complete address, like name@gmail.com.";
  }
  const [local, domain] = parts;
  if (!/^gmail\.com$/i.test(domain)) return "Only @gmail.com addresses are accepted.";
  if (/[^a-z0-9.]/i.test(local)) return "Use only letters, digits and dots before @gmail.com.";
  if (/^\.|\.$|\.\./.test(local)) return "Dots cannot start, end or repeat before @gmail.com.";
  return "The part before @gmail.com must be 6 to 30 characters long.";
}

/**
 * @param {string} value
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateEmail(value) {
  const valid = PATTERNS.email.test(value);
  return { valid, errors: valid ? [] : [diagnoseEmail(value)] };
}

/**
 * Validates the whole form at once.
 * @param {{ password?: string, username?: string, email?: string }} values
 */
export function validateForm({ password = "", username = "", email = "" } = {}) {
  const fields = {
    password: validatePassword(password),
    username: validateUsername(username),
    email: validateEmail(email),
  };
  return { valid: Object.values(fields).every((field) => field.valid), fields };
}

const CAPITALS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SYMBOLS = "!\"#$%&'()*+,./:;<=>?@[\\]^_`{|}~";

/** Uniform integer in [0, max) from the platform CSPRNG (rejection sampling avoids modulo bias). */
function secureRandomInt(max) {
  const limit = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return buffer[0] % max;
}

/**
 * Builds a random password that satisfies the password rule.
 * @param {(max: number) => number} [randomInt] returns an integer in [0, max)
 */
export function generatePassword(randomInt = secureRandomInt) {
  const pick = (alphabet) => alphabet[randomInt(alphabet.length)];
  const chars = [
    ...Array.from({ length: PASSWORD_RULES.capitals }, () => pick(CAPITALS)),
    ...Array.from({ length: PASSWORD_RULES.symbols }, () => pick(SYMBOLS)),
    ..."-".repeat(PASSWORD_RULES.hyphens),
  ];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
