#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { parsePasteUrl, fetchPaste, preparePaste, tryPassword } from '../src/privatebin.js';

function usage() {
  return `Usage: privatebin-guesser --url <PrivateBin URL> --wordlist <file> [--save <file>]
       privatebin-guesser --url <PrivateBin URL> --paste-file <file> --wordlist <file>

Fetches a PrivateBin v2 paste once, then tests wordlist passwords offline.
--save stores the encrypted JSON for later offline runs. Treat it and the URL as sensitive.
The password and decrypted paste are never sent to the server.
`;
}

function argumentsFrom(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (!['--url', '--wordlist', '--paste-file', '--save'].includes(arg) || !argv[i + 1]) throw new Error(`Invalid argument: ${arg}`);
    args[arg.slice(2)] = argv[++i];
  }
  if (!args.url || !args.wordlist) throw new Error('Both --url and --wordlist are required.');
  if (args.save && args['paste-file']) throw new Error('--save cannot be used with --paste-file.');
  return args;
}

async function main() {
  const args = argumentsFrom(process.argv.slice(2));
  if (args.help) { process.stdout.write(usage()); return; }
  const { fetchUrl, key } = parsePasteUrl(args.url);
  const paste = args['paste-file'] ? JSON.parse(await readFile(args['paste-file'], 'utf8')) : await fetchPaste(fetchUrl);
  const prepared = preparePaste(paste);
  if (args.save) {
    await writeFile(args.save, `${JSON.stringify(paste)}\n`, { flag: 'wx', mode: 0o600 });
    console.error(`Encrypted paste saved to ${args.save}`);
  }
  let count = 0;
  const start = performance.now();
  const lines = createInterface({ input: createReadStream(args.wordlist), crlfDelay: Infinity });
  try {
    for await (const password of lines) {
      count++;
      const plaintext = tryPassword(key, prepared, password);
      if (plaintext !== null) {
        console.log(`Password found: ${password}`);
        console.log(`Tested ${count} candidate(s) in ${((performance.now() - start) / 1000).toFixed(2)} s.`);
        return;
      }
    }
  } finally { lines.close(); }
  console.log(`No match among ${count} candidate(s) in ${((performance.now() - start) / 1000).toFixed(2)} s.`);
  process.exitCode = 2;
}

main().catch(error => { console.error(`Error: ${error.message}`); process.exitCode = 1; });
