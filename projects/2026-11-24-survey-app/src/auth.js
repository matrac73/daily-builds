// Account rules and password hashing (PBKDF2 via the Web Crypto API, which
// exists both in browsers and in Node).

import { SurveyError } from './survey.js';

export const ROLES = Object.freeze({
  COORDINATOR: 'coordinator',
  RESPONDENT: 'respondent',
});

const PBKDF2_ITERATIONS = 210_000;
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,23}$/;
const MIN_PASSWORD_LENGTH = 8;

const toHex = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16));

/** Usernames are case-insensitive: "Ada" and "ada" are the same account. */
export function normalizeUsername(username) {
  return String(username ?? '').trim().toLowerCase();
}

export function validateCredentials(username, password) {
  if (!USERNAME_PATTERN.test(normalizeUsername(username))) {
    throw new SurveyError(
      'Usernames are 3–24 characters: letters, digits, dots, dashes or underscores.',
    );
  }
  if (String(password ?? '').length < MIN_PASSWORD_LENGTH) {
    throw new SurveyError(`Passwords need at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
}

async function derive(password, salt, iterations) {
  const { subtle } = globalThis.crypto;
  const key = await subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return toHex(new Uint8Array(bits));
}

/** Returns a self-describing record: `{ salt, hash, iterations }`. */
export async function hashPassword(password) {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return {
    salt: toHex(salt),
    hash: await derive(password, salt, PBKDF2_ITERATIONS),
    iterations: PBKDF2_ITERATIONS,
  };
}

export async function verifyPassword(password, record) {
  const candidate = await derive(password, fromHex(record.salt), record.iterations);
  // Constant-time comparison: never bail out on the first differing character.
  let difference = candidate.length ^ record.hash.length;
  for (let i = 0; i < candidate.length; i += 1) {
    difference |= candidate.charCodeAt(i) ^ record.hash.charCodeAt(i % record.hash.length);
  }
  return difference === 0;
}
