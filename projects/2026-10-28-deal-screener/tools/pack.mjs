#!/usr/bin/env node
// Encrypt a deal-sourcing CSV export into the vault file loaded by the web app.
//
//   node tools/pack.mjs <deals.csv> [--out data/deals.enc.json] [--hint "text shown on the lock screen"]
//
// The passphrase is read from DEAL_SCREENER_PASSPHRASE, or asked interactively.
// The optional hint is stored in clear text: never put the passphrase itself there for real data.
// Only the encrypted output is meant to be committed: raw exports stay on your machine.

import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { parseCsv, rowsToDeals } from '../src/csv.js';
import { seal } from '../src/vault.js';

const MIN_PASSPHRASE_LENGTH = 12;

async function askPassphrase() {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return (await rl.question('Passphrase to share with your team: ')).trim();
  } finally {
    rl.close();
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: 'string', short: 'o', default: 'data/deals.enc.json' },
      hint: { type: 'string' },
    },
  });
  if (positionals.length !== 1) {
    console.error('Usage: node tools/pack.mjs <deals.csv> [--out data/deals.enc.json] [--hint "..."]');
    process.exit(2);
  }

  const { deals, warnings, mapping } = rowsToDeals(parseCsv(await readFile(positionals[0], 'utf8')));
  for (const [field, index] of Object.entries(mapping)) {
    console.error(`  ${field.padEnd(12)} ${index === -1 ? '(not found)' : `column ${index + 1}`}`);
  }
  for (const warning of warnings) console.error(`  ! ${warning}`);
  if (deals.length === 0) {
    console.error('No deal could be read: check the column headers (see README).');
    process.exit(1);
  }

  const passphrase = process.env.DEAL_SCREENER_PASSPHRASE ?? (await askPassphrase());
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    console.error(`  ! Passphrase shorter than ${MIN_PASSPHRASE_LENGTH} characters: fine for a demo, weak for real data.`);
  }

  const vault = await seal({ packedAt: new Date().toISOString(), deals }, passphrase);
  if (values.hint) vault.hint = values.hint;
  await writeFile(values.out, JSON.stringify(vault) + '\n');
  console.error(`Encrypted ${deals.length} deals into ${values.out}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
