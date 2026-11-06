// HTTP request handler for the `/kudo` Slack slash command.
import { executeCommand } from './kudos.js';
import { verifySlackSignature, toSlackResponse } from './slack.js';

const MAX_BODY_BYTES = 64 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Payload too large'));
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

// Builds the request handler. `signingSecret` may be omitted only when
// `insecure` is set, which is meant for local curl testing.
export function createApp({ store, signingSecret, insecure = false, persist = async () => {} }) {
  // Serialise commands so concurrent requests never interleave store writes.
  let queue = Promise.resolve();

  return async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true });
    if (req.method !== 'POST' || req.url !== '/slack/commands') return send(res, 404, { error: 'Not found' });

    let rawBody;
    try {
      rawBody = await readBody(req);
    } catch {
      return send(res, 413, { error: 'Payload too large' });
    }

    const verified =
      insecure ||
      verifySlackSignature({
        signingSecret,
        timestamp: req.headers['x-slack-request-timestamp'],
        signature: req.headers['x-slack-signature'],
        rawBody,
        nowSeconds: Math.floor(Date.now() / 1000),
      });
    if (!verified) return send(res, 401, { error: 'Invalid Slack signature' });

    const form = new URLSearchParams(rawBody);
    const userId = form.get('user_id');
    if (!userId) return send(res, 400, { error: 'Missing user_id' });

    const job = queue.then(async () => {
      const result = executeCommand(store, userId, form.get('text') ?? '');
      if (result.changed) await persist(store);
      return result;
    });
    queue = job.catch(() => {});

    try {
      send(res, 200, toSlackResponse(await job));
    } catch (err) {
      console.error(err);
      send(res, 200, { response_type: 'ephemeral', text: ':boom: Something went wrong, please try again.' });
    }
  };
}
