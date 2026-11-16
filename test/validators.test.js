import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  PATTERNS,
  generatePassword,
  validateEmail,
  validateForm,
  validatePassword,
  validateUsername,
} from "../validators.js";

const VALID_PASSWORD = "ABCDE!@#$%^--";

describe("validatePassword", () => {
  test("accepts 5 capitals, 6 symbols and 2 hyphens", () => {
    const result = validatePassword(VALID_PASSWORD);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
    assert.ok(result.checks.every((check) => check.ok));
  });

  test("accepts the characters in any order", () => {
    for (const value of ["-A!B@C#D$E%^-", "!@#-$%^-ABCDE", "--ABCDE!!!!!!", "A.B/C_D~E`-\\-"]) {
      assert.equal(validatePassword(value).valid, true, value);
    }
  });

  test("rejects an empty password", () => {
    assert.deepEqual(validatePassword("").errors, ["Enter a password."]);
  });

  test("reports each count that is off", () => {
    const result = validatePassword("ABCD!@#$%^&-");
    assert.equal(result.valid, false);
    assert.deepEqual(result.errors, [
      "Use exactly 5 capital letters (found 4 capital letters).",
      "Use exactly 6 symbols (found 7 symbols).",
      "Use exactly 2 hyphens (found 1 hyphen).",
    ]);
  });

  test("rejects too many of a family even when the others are right", () => {
    assert.equal(validatePassword("ABCDEF!@#$%^--").valid, false);
    assert.equal(validatePassword("ABCDE!@#$%^---").valid, false);
  });

  test("rejects and names disallowed characters", () => {
    const result = validatePassword("ABCDE!@#$%^-- a1a");
    assert.equal(result.valid, false);
    assert.deepEqual(result.errors, [
      'Remove characters that are not capitals, symbols or hyphens: space, "a", "1".',
    ]);
  });

  test("does not count lowercase, digits or non-ASCII characters as symbols", () => {
    for (const value of ["abcde!@#$%^--", "ABCDE123456--", "ABCDE€€€€€€--", "ÀBCDE!@#$%^--"]) {
      assert.equal(validatePassword(value).valid, false, value);
    }
  });

  test("exposes live progress for every rule", () => {
    const { checks } = validatePassword("AB!-x");
    assert.deepEqual(checks, [
      { id: "capitals", count: 2, required: 5, ok: false },
      { id: "symbols", count: 1, required: 6, ok: false },
      { id: "hyphens", count: 1, required: 2, ok: false },
      { id: "others", count: 1, required: 0, ok: false },
    ]);
  });
});

describe("validateUsername", () => {
  test("accepts letters only, in any alphabet", () => {
    for (const value of ["ada", "GraceHopper", "José", "Łukasz", "Юрий", "x"]) {
      assert.equal(validateUsername(value).valid, true, value);
    }
  });

  test("rejects an empty username", () => {
    assert.deepEqual(validateUsername("").errors, ["Enter a username."]);
  });

  test("rejects spaces", () => {
    assert.deepEqual(validateUsername("ada lovelace").errors, ["Usernames cannot contain spaces."]);
    assert.equal(validateUsername(" ada").valid, false);
    assert.equal(validateUsername("ada\t").valid, false);
  });

  test("rejects digits, symbols and punctuation", () => {
    for (const value of ["ada99", "ada_lovelace", "ada-l", "ada.l", "ada!"]) {
      assert.deepEqual(
        validateUsername(value).errors,
        ["Use letters only: no digits, symbols or punctuation."],
        value,
      );
    }
  });

  test("reports spaces and other characters together", () => {
    assert.equal(validateUsername("ada 99").errors.length, 2);
  });
});

describe("validateEmail", () => {
  test("accepts gmail.com addresses", () => {
    for (const value of ["ada.lovelace@gmail.com", "grace1906@gmail.com", "ABCDEF@GMAIL.COM", "a.b.c.d@gmail.com"]) {
      assert.deepEqual(validateEmail(value), { valid: true, errors: [] }, value);
    }
  });

  const rejected = [
    ["", "Enter your Gmail address."],
    ["ada lovelace@gmail.com", "Email addresses cannot contain spaces."],
    ["adalovelace", "Enter a complete address, like name@gmail.com."],
    ["@gmail.com", "Enter a complete address, like name@gmail.com."],
    ["adalovelace@", "Enter a complete address, like name@gmail.com."],
    ["ada@love@gmail.com", "Enter a complete address, like name@gmail.com."],
    ["adalovelace@yahoo.com", "Only @gmail.com addresses are accepted."],
    ["adalovelace@gmail.com.evil.io", "Only @gmail.com addresses are accepted."],
    ["adalovelace@notgmail.com", "Only @gmail.com addresses are accepted."],
    ["adalovelace@gmailxcom", "Only @gmail.com addresses are accepted."],
    ["ada_lovelace@gmail.com", "Use only letters, digits and dots before @gmail.com."],
    ["ada+news@gmail.com", "Use only letters, digits and dots before @gmail.com."],
    [".adalovelace@gmail.com", "Dots cannot start, end or repeat before @gmail.com."],
    ["adalovelace.@gmail.com", "Dots cannot start, end or repeat before @gmail.com."],
    ["ada..lovelace@gmail.com", "Dots cannot start, end or repeat before @gmail.com."],
    ["ada@gmail.com", "The part before @gmail.com must be 6 to 30 characters long."],
    [`${"a".repeat(31)}@gmail.com`, "The part before @gmail.com must be 6 to 30 characters long."],
  ];

  for (const [value, message] of rejected) {
    test(`rejects ${JSON.stringify(value)}`, () => {
      assert.deepEqual(validateEmail(value), { valid: false, errors: [message] });
    });
  }

  test("accepts the 6 and 30 character boundaries", () => {
    assert.equal(validateEmail("abcdef@gmail.com").valid, true);
    assert.equal(validateEmail(`${"a".repeat(30)}@gmail.com`).valid, true);
  });
});

describe("validateForm", () => {
  test("is valid only when every field is valid", () => {
    const values = { password: VALID_PASSWORD, username: "ada", email: "ada.lovelace@gmail.com" };
    assert.equal(validateForm(values).valid, true);

    for (const field of Object.keys(values)) {
      const result = validateForm({ ...values, [field]: "nope 1" });
      assert.equal(result.valid, false, field);
      assert.equal(result.fields[field].valid, false, field);
    }
  });

  test("treats missing fields as empty", () => {
    const result = validateForm();
    assert.equal(result.valid, false);
    assert.deepEqual(result.fields.username.errors, ["Enter a username."]);
  });
});

describe("regex and error messages agree", () => {
  const samples = ["", " ", "a", "A", "-", "!", "ab cd", "abc123", VALID_PASSWORD, "ada.lovelace@gmail.com", "a@b", "é"];

  test("a value is valid exactly when it has no errors", () => {
    for (const value of samples) {
      for (const validate of [validatePassword, validateUsername, validateEmail]) {
        const { valid, errors } = validate(value);
        assert.equal(valid, errors.length === 0, `${validate.name}(${JSON.stringify(value)})`);
      }
    }
  });

  test("patterns are stateless, so repeated calls give the same answer", () => {
    for (const pattern of Object.values(PATTERNS)) assert.equal(pattern.global, false);
    assert.equal(validatePassword(VALID_PASSWORD).valid, validatePassword(VALID_PASSWORD).valid);
  });
});

describe("generatePassword", () => {
  test("always produces a valid password", () => {
    for (let i = 0; i < 200; i++) {
      const password = generatePassword();
      assert.equal(validatePassword(password).valid, true, password);
    }
  });

  test("is deterministic for a given random source", () => {
    assert.equal(generatePassword(() => 0), "AAAA!!!!!!--A");
  });

  test("varies between calls", () => {
    const passwords = new Set(Array.from({ length: 20 }, () => generatePassword()));
    assert.ok(passwords.size > 1);
  });
});
