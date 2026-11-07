import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parsePasteUrl, preparePaste, tryPassword } from '../src/privatebin.js';
import { readFileSync } from 'node:fs';

const sampleUrl = 'https://privatebin.net/?e4fe47e5dfd1541c#25KyynW3uZifNxDTwWoTdEguRs5VSsTzqDJkWr2ZCvsZ';
const pasteFile = fileURLToPath(new URL('./fixtures/sample.paste.json', import.meta.url));
const cliFile = fileURLToPath(new URL('../bin/privatebin-guesser.js', import.meta.url));

test('CLI checks a downloaded PrivateBin paste without a network request', () => {
  const paste = JSON.parse(readFileSync(pasteFile, 'utf8'));
  const { key } = parsePasteUrl(sampleUrl);
  const prepared = preparePaste(paste);
  assert.equal(paste.v, 2);
  assert.equal(tryPassword(key, prepared, 'deliberately-wrong-acceptance-password-938204'), null);

  const directory = mkdtempSync(join(tmpdir(), 'privatebin-guesser-test-'));
  try {
    const wordlist = join(directory, 'words.txt');
    writeFileSync(wordlist, 'deliberately-wrong-acceptance-password-938204\n');
    const result = spawnSync(process.execPath, [cliFile, '--url', sampleUrl, '--paste-file', pasteFile, '--wordlist', wordlist], {
      encoding: 'utf8', timeout: 15_000
    });
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stdout, /No match among 1 candidate/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('all stages run in order and honor per-stage limits', () => {
  const directory = mkdtempSync(join(tmpdir(), 'privatebin-guesser-test-'));
  try {
    const wordlist = join(directory, 'words.txt');
    writeFileSync(wordlist, 'deliberately-wrong-acceptance-password-938204\n');
    const result = spawnSync(process.execPath, [cliFile, '--url', sampleUrl, '--paste-file', pasteFile,
      '--wordlist', wordlist, '--mode', 'all', '--max-length', '1', '--max-candidates', '2'],
    { encoding: 'utf8', timeout: 15_000 });
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /wordlist: tested 1 candidate/);
    assert.match(result.stderr, /word variations: tested 2 candidate/);
    assert.match(result.stderr, /alphanumeric: tested 2 candidate/);
    assert.match(result.stderr, /with symbols: tested 2 candidate/);
    assert.match(result.stdout, /No match among 7 candidate/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
