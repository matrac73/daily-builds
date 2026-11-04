import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStravaLink } from '../src/strava.js';

test('parses a standard activity link', () => {
  assert.deepEqual(parseStravaLink('https://www.strava.com/activities/12345678901'), {
    kind: 'activity',
    id: '12345678901',
    pageUrl: 'https://www.strava.com/activities/12345678901',
    exportUrl: 'https://www.strava.com/activities/12345678901/export_gpx',
  });
});

test('ignores sub-pages, query strings, hashes and missing scheme', () => {
  for (const input of [
    'strava.com/activities/987654/overview',
    'https://m.strava.com/activities/987654?share_sig=abc#comments',
    '  https://www.strava.com/activities/987654/  ',
  ]) {
    assert.equal(parseStravaLink(input)?.id, '987654', input);
  }
});

test('accepts a bare activity id', () => {
  assert.equal(parseStravaLink('11223344').kind, 'activity');
});

test('parses route links with the route export endpoint', () => {
  const r = parseStravaLink('https://www.strava.com/routes/3141592653');
  assert.equal(r.kind, 'route');
  assert.equal(r.exportUrl, 'https://www.strava.com/routes/3141592653/export_gpx');
});

test('recognises mobile share short links', () => {
  assert.deepEqual(parseStravaLink('https://strava.app.link/AbCdEf'), {
    kind: 'short',
    pageUrl: 'https://strava.app.link/AbCdEf',
  });
});

test('rejects unrelated or malformed input', () => {
  for (const input of [
    '',
    null,
    'hello world',
    'https://evil.com/activities/123456',
    'https://www.strava.com/athletes/123456',
    'https://www.strava.com/activities/abc',
    '123',
  ]) {
    assert.equal(parseStravaLink(input), null, String(input));
  }
});
