#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { parsePasteUrl, fetchPaste, preparePaste, tryPasswordAsync } from '../src/privatebin.js';
import { ALNUM, PRINTABLE, combinations, charsetSize, maskCandidates, maskSize, parseMask, wordVariants } from '../src/candidates.js';

function usage() {
  return `Usage: privatebin-guesser --url <PrivateBin URL> --wordlist <file> [--mode wordlist|rules|all]
       privatebin-guesser --url <PrivateBin URL> --mode alnum|special [--max-length 6]
       privatebin-guesser --url <PrivateBin URL> --mask '?u?l?l?l?d?d'

Options:
  --wordlist FILE          UTF-8 file with one candidate per line
  --mode MODE              wordlist (default), rules, alnum, special, all, or mask
  --mask PATTERN           Mask tokens: ?l lower, ?u upper, ?d digit, ?s symbol, ?a printable, ?? literal ?
  --max-length N           Maximum length for alnum/special modes (default 6, max 12)
  --max-candidates N       Per generated stage limit (default 10000)
  --workers N              Parallel crypto jobs (default 2, max 4)
  --paste-file FILE        Use saved encrypted paste instead of fetching
  --save FILE              Save encrypted response; refuses to overwrite

All mode runs wordlist, word variations, alphanumeric, then passwords with symbols.
The paste is fetched once; all guesses are tested offline.
`;
}

function positiveInteger(value, option, maximum) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) throw new Error(`${option} must be an integer from 1 to ${maximum}.`);
  return number;
}

function argumentsFrom(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (!['--url', '--wordlist', '--mode', '--mask', '--max-length', '--max-candidates', '--workers', '--paste-file', '--save'].includes(arg) || !argv[i + 1]) throw new Error(`Invalid argument: ${arg}`);
    if (args[arg.slice(2)] !== undefined) throw new Error(`Repeated option: ${arg}`);
    args[arg.slice(2)] = argv[++i];
  }
  if (!args.url) throw new Error('--url is required.');
  args.mode ??= args.mask ? 'mask' : 'wordlist';
  if (!['wordlist', 'rules', 'alnum', 'special', 'all', 'mask'].includes(args.mode)) throw new Error('Invalid --mode.');
  if (['wordlist', 'rules', 'all'].includes(args.mode) && !args.wordlist) throw new Error(`--wordlist is required for ${args.mode} mode.`);
  if (args.mode === 'mask' && !args.mask) throw new Error('--mask is required for mask mode.');
  if (args.mask && args.mode !== 'mask') throw new Error('--mask requires mask mode.');
  if (args.save && args['paste-file']) throw new Error('--save cannot be used with --paste-file.');
  args.maxLength = positiveInteger(args['max-length'] ?? '6', '--max-length', 12);
  args.maxCandidates = positiveInteger(args['max-candidates'] ?? '10000', '--max-candidates', 1_000_000_000);
  args.workers = positiveInteger(args.workers ?? '2', '--workers', 4);
  return args;
}

async function* words(file) {
  const input = createReadStream(file);
  const lines = createInterface({ input, crlfDelay: Infinity });
  try { for await (const word of lines) yield word; }
  finally { lines.close(); input.destroy(); }
}

async function* variants(file) {
  for await (const word of words(file)) {
    for (const candidate of wordVariants(word)) if (candidate !== word) yield candidate;
  }
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

  let total = 0;
  const started = performance.now();
  async function runStage(name, candidates, limit, keyspace) {
    console.error(`${name}: ${keyspace === undefined ? 'streaming candidates' : `${keyspace} possible candidates`}${limit === Infinity ? '' : `; trying at most ${limit}`}.`);
    let count = 0;
    const stageStarted = performance.now();
    let nextProgress = 1000;
    const iterator = candidates[Symbol.asyncIterator]?.() ?? candidates[Symbol.iterator]();
    try {
      while (count < limit) {
        const batch = [];
        while (batch.length < args.workers && count + batch.length < limit) {
          const next = await iterator.next();
          if (next.done) break;
          batch.push(next.value);
        }
        if (!batch.length) break;
        const results = await Promise.all(batch.map(password => tryPasswordAsync(key, prepared, password)));
        count += batch.length;
        total += batch.length;
        const winner = results.findIndex(result => result !== null);
        if (winner >= 0) {
          console.log(`Password found: ${batch[winner]}`);
          console.log(`Stage: ${name}. Tested ${total} candidate(s) in ${((performance.now() - started) / 1000).toFixed(2)} s.`);
          return true;
        }
        if (count >= nextProgress) {
          const seconds = (performance.now() - stageStarted) / 1000;
          const rate = count / seconds;
          const target = keyspace === undefined ? limit : Math.min(limit, Number(keyspace));
          const eta = Number.isFinite(target) ? `; about ${((target - count) / rate).toFixed(0)} s to stage limit` : '';
          console.error(`${name}: tested ${count} candidate(s); ${rate.toFixed(1)}/s${eta}.`);
          nextProgress += 1000;
        }
      }
    } finally { await iterator.return?.(); }
    const truncated = count >= limit && (keyspace === undefined || BigInt(count) < keyspace);
    console.error(`${name}: tested ${count} candidate(s)${truncated ? ' (stage limit reached)' : ''}.`);
    return false;
  }

  if (['wordlist', 'all'].includes(args.mode) && await runStage('wordlist', words(args.wordlist), Infinity)) return;
  if (['rules', 'all'].includes(args.mode) && await runStage('word variations', variants(args.wordlist), args.maxCandidates)) return;
  if (['alnum', 'all'].includes(args.mode) && await runStage('alphanumeric', combinations(ALNUM, args.maxLength), args.maxCandidates, charsetSize(ALNUM, args.maxLength))) return;
  if (['special', 'all'].includes(args.mode) && await runStage('with symbols', combinations(PRINTABLE, args.maxLength, true), args.maxCandidates, charsetSize(PRINTABLE, args.maxLength, true))) return;
  if (args.mode === 'mask') {
    const positions = parseMask(args.mask);
    if (await runStage(`mask ${args.mask}`, maskCandidates(positions), args.maxCandidates, maskSize(positions))) return;
  }
  console.log(`No match among ${total} candidate(s) in ${((performance.now() - started) / 1000).toFixed(2)} s.`);
  process.exitCode = 2;
}

main().catch(error => { console.error(`Error: ${error.message}`); process.exitCode = 1; });
