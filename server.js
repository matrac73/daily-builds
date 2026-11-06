// Entry point: serves the `/kudo` slash command over HTTP.
import { createServer } from 'node:http';
import { createApp } from './src/app.js';
import { loadStore, saveStore } from './src/fileStore.js';

const port = Number(process.env.PORT ?? 3000);
const dataFile = process.env.KUDOS_DATA_FILE ?? 'data/kudos.json';
const signingSecret = process.env.SLACK_SIGNING_SECRET;
const insecure = process.env.KUDOS_INSECURE === '1';

if (!signingSecret && !insecure) {
  console.error('Set SLACK_SIGNING_SECRET (or KUDOS_INSECURE=1 for local testing only).');
  process.exit(1);
}

const store = await loadStore(dataFile);
const handler = createApp({ store, signingSecret, insecure, persist: (s) => saveStore(dataFile, s) });

createServer(handler).listen(port, () => {
  console.log(`Kudos bot listening on http://localhost:${port}/slack/commands (data: ${dataFile})`);
  if (insecure) console.warn('WARNING: Slack signature verification is disabled.');
});
