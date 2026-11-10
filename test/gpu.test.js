import test from 'node:test';
import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { GpuBackend } from '../src/gpu.js';
import { parsePasteUrl, preparePaste } from '../src/privatebin.js';

const url = 'https://privatebin.net/?ae47a6ef557ab284#CsWwk2FBrHzjbfbrbKSFN3NNwnWXBSE66Bs3LxU6Yr9G';
const fixture = new URL('./fixtures/known-test.paste.json', import.meta.url);

test('GPU PBKDF2 agrees with Node and verifies saved paste', async () => {
  const { key } = parsePasteUrl(url);
  const prepared = preparePaste(JSON.parse(await readFile(fixture, 'utf8')));
  const gpu = await new GpuBackend(key, prepared).start();
  try {
    const candidates = ['', 'wrong', 'test', 'password1', 'x'.repeat(40)];
    const reply = await gpu.request({ candidates });
    const keys = Buffer.from(reply.keys, 'base64');
    for (let i = 0; i < candidates.length; i++) {
      const expected = pbkdf2Sync(Buffer.concat([key, Buffer.from(candidates[i])]), prepared.salt, prepared.iterations, 32, 'sha256');
      assert.deepEqual(keys.subarray(i * 32, i * 32 + 32), expected, `candidate ${i}`);
    }
    const results = await gpu.tryBatch([...candidates, 'pässword']);
    assert.deepEqual(results.map(result => result !== null), [false, false, true, false, false, false]);
  } finally { gpu.close(); }
});

test('GPU CLI finds test in downloaded paste without network', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'privatebin-gpu-test-'));
  try {
    const wordlist = join(directory, 'words.txt');
    await writeFile(wordlist, 'wrong\ntest\n');
    const child = spawnSync(process.execPath, ['bin/privatebin-guesser.js', '--url', url,
      '--paste-file', 'test/fixtures/known-test.paste.json', '--wordlist', wordlist,
      '--backend', 'gpu', '--gpu-batch-size', '2'], { encoding: 'utf8', timeout: 120000 });
    assert.equal(child.status, 0, child.stderr);
    assert.match(child.stdout, /Password found: test/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
