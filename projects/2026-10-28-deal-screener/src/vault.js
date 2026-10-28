// Passphrase-based encryption of the deal database (AES-256-GCM, key derived with PBKDF2-SHA256).
// Uses the Web Crypto API, available both in browsers and in Node >= 20, so the same module
// powers the packing CLI and the static web app.

export const VAULT_VERSION = 1;
export const DEFAULT_ITERATIONS = 310_000;

export class WrongPassphraseError extends Error {
  constructor() {
    super('Wrong passphrase or corrupted data file');
    this.name = 'WrongPassphraseError';
  }
}

const subtle = () => globalThis.crypto.subtle;

function toBase64(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(b64) {
  return Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
}

async function deriveKey(passphrase, salt, iterations) {
  const material = await subtle().importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypt any JSON-serialisable value into a self-describing vault object. */
export async function seal(value, passphrase, { iterations = DEFAULT_ITERATIONS } = {}) {
  if (!passphrase) throw new Error('A passphrase is required');
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, iterations);
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  return {
    v: VAULT_VERSION,
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: toBase64(ciphertext),
  };
}

/** Decrypt a vault produced by seal(). Throws WrongPassphraseError if authentication fails. */
export async function open(vault, passphrase) {
  if (vault?.v !== VAULT_VERSION || vault.kdf !== 'PBKDF2-SHA256') {
    throw new Error('Unsupported data file format');
  }
  const key = await deriveKey(passphrase, fromBase64(vault.salt), vault.iterations);
  let plaintext;
  try {
    plaintext = await subtle().decrypt({ name: 'AES-GCM', iv: fromBase64(vault.iv) }, key, fromBase64(vault.data));
  } catch {
    throw new WrongPassphraseError();
  }
  return JSON.parse(new TextDecoder().decode(plaintext));
}
