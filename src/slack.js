// Slack request verification and response shaping (Node only).
import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_CLOCK_SKEW_SECONDS = 60 * 5;

// Verifies the `X-Slack-Signature` header as documented at
// https://api.slack.com/authentication/verifying-requests-from-slack
export function verifySlackSignature({ signingSecret, timestamp, signature, rawBody, nowSeconds }) {
  if (!signingSecret || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > MAX_CLOCK_SKEW_SECONDS) return false;

  const expected = `v0=${createHmac('sha256', signingSecret).update(`v0:${timestamp}:${rawBody}`).digest('hex')}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Converts an executeCommand result into a Slack slash-command response.
export function toSlackResponse({ text, visibility }) {
  return { response_type: visibility, text };
}
