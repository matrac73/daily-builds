import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickMimeType, extensionFor, videoFileName } from '../src/video.js';

test('pickMimeType prefers MP4, falls back to WebM, or null', () => {
  assert.equal(pickMimeType(() => true), 'video/mp4;codecs=avc1.640028');
  assert.equal(pickMimeType((m) => m.startsWith('video/webm')), 'video/webm;codecs=vp9');
  assert.equal(pickMimeType((m) => m === 'video/webm'), 'video/webm');
  assert.equal(pickMimeType(() => false), null);
});

test('extensionFor maps containers to file extensions', () => {
  assert.equal(extensionFor('video/mp4;codecs=avc1'), 'mp4');
  assert.equal(extensionFor('video/webm;codecs=vp9'), 'webm');
});

test('videoFileName slugifies titles safely', () => {
  assert.equal(videoFileName('Chamonix → Lac Blanc (démo)', 'video/mp4'), '3d-strava-chamonix-lac-blanc-demo.mp4');
  assert.equal(videoFileName('', 'video/webm'), '3d-strava-activite.webm');
  assert.equal(videoFileName('../../etc/passwd', 'video/webm'), '3d-strava-etc-passwd.webm');
  assert.ok(videoFileName('x'.repeat(200), 'video/mp4').length < 80);
});
