import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WrongPassphraseError, open, seal } from '../src/vault.js';

const FAST = { iterations: 1000 };
const payload = { deals: [{ id: 'd1', name: 'Alpha', revenue: 42 }], meta: { label: 'é ✓' } };

test('seal/open round-trips any JSON value', async () => {
  const vault = await seal(payload, 'correct horse', FAST);
  assert.deepEqual(await open(vault, 'correct horse'), payload);
});

test('the vault does not leak the plaintext and is salted', async () => {
  const a = await seal(payload, 'pw', FAST);
  const b = await seal(payload, 'pw', FAST);
  assert.ok(!JSON.stringify(a).includes('Alpha'));
  assert.notEqual(a.data, b.data);
  assert.notEqual(a.salt, b.salt);
  assert.equal(a.iterations, 1000);
});

test('a wrong passphrase or tampered data is rejected', async () => {
  const vault = await seal(payload, 'right', FAST);
  await assert.rejects(open(vault, 'wrong'), WrongPassphraseError);
  const tampered = { ...vault, data: vault.data.slice(0, -4) + (vault.data.endsWith('AAA=') ? 'BBB=' : 'AAA=') };
  await assert.rejects(open(tampered, 'right'), WrongPassphraseError);
});

test('unknown formats and empty passphrases are refused', async () => {
  await assert.rejects(open({ v: 99 }, 'x'), /Unsupported/);
  await assert.rejects(seal(payload, ''), /passphrase/);
});
