import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { verifySlackSignature } from '../src/slack.js';
import { KudoStore } from '../src/kudos.js';
import { loadStore, saveStore } from '../src/fileStore.js';

const SECRET = 'test-signing-secret';

function sign(body, timestamp, secret = SECRET) {
  return `v0=${createHmac('sha256', secret).update(`v0:${timestamp}:${body}`).digest('hex')}`;
}

describe('verifySlackSignature', () => {
  const now = 1_800_000_000;
  const rawBody = 'user_id=U1&text=list';

  test('accepts a valid signature', () => {
    const signature = sign(rawBody, now);
    assert.equal(verifySlackSignature({ signingSecret: SECRET, timestamp: String(now), signature, rawBody, nowSeconds: now }), true);
  });
  test('rejects tampered bodies, wrong secrets and stale timestamps', () => {
    const signature = sign(rawBody, now);
    const base = { signingSecret: SECRET, timestamp: String(now), signature, rawBody, nowSeconds: now };
    assert.equal(verifySlackSignature({ ...base, rawBody: 'user_id=U2&text=list' }), false);
    assert.equal(verifySlackSignature({ ...base, signature: sign(rawBody, now, 'other') }), false);
    assert.equal(verifySlackSignature({ ...base, nowSeconds: now + 301 }), false);
    assert.equal(verifySlackSignature({ ...base, signature: 'v0=short' }), false);
    assert.equal(verifySlackSignature({ ...base, timestamp: undefined }), false);
  });
});

describe('HTTP app', () => {
  let server;
  let url;
  let dir;
  let dataFile;
  const store = new KudoStore();

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'kudos-'));
    dataFile = join(dir, 'nested', 'kudos.json');
    server = createServer(createApp({ store, signingSecret: SECRET, persist: (s) => saveStore(dataFile, s) }));
    await new Promise((resolve) => server.listen(0, resolve));
    url = `http://localhost:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  });

  async function slash(userId, text, { secret = SECRET } = {}) {
    const body = new URLSearchParams({ user_id: userId, text, command: '/kudo' }).toString();
    const ts = String(Math.floor(Date.now() / 1000));
    const res = await fetch(`${url}/slack/commands`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-slack-request-timestamp': ts,
        'x-slack-signature': sign(body, ts, secret),
      },
      body,
    });
    return { status: res.status, json: await res.json() };
  }

  test('rejects unsigned requests', async () => {
    const { status } = await slash('UA', 'list', { secret: 'wrong' });
    assert.equal(status, 401);
  });

  test('handles a full add → list flow and persists to disk', async () => {
    const added = await slash('UA', 'add <@UB|bob> fixed the build');
    assert.equal(added.status, 200);
    assert.equal(added.json.response_type, 'in_channel');

    const listed = await slash('UC', 'list *');
    assert.equal(listed.json.response_type, 'ephemeral');
    assert.match(listed.json.text, /fixed the build/);

    const saved = JSON.parse(await readFile(dataFile, 'utf8'));
    assert.equal(saved.kudos.length, 1);
    assert.equal((await loadStore(dataFile)).kudos[0].recipient, 'UB');
  });

  test('serialises concurrent commands so every kudo gets a unique id', async () => {
    await Promise.all(Array.from({ length: 10 }, (_, i) => slash('UA', `add @UB parallel ${i}`)));
    const ids = store.kudos.map((k) => k.id);
    assert.equal(new Set(ids).size, ids.length);
    const saved = JSON.parse(await readFile(dataFile, 'utf8'));
    assert.equal(saved.kudos.length, store.kudos.length);
  });

  test('exposes a health check and 404s elsewhere', async () => {
    assert.equal((await fetch(`${url}/health`)).status, 200);
    assert.equal((await fetch(`${url}/nope`)).status, 404);
  });

  test('loadStore returns an empty store when the file is missing', async () => {
    const empty = await loadStore(join(dir, 'missing.json'));
    assert.equal(empty.kudos.length, 0);
  });
});
