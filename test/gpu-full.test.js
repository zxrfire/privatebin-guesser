import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const url = 'https://privatebin.net/?ae47a6ef557ab284#CsWwk2FBrHzjbfbrbKSFN3NNwnWXBSE66Bs3LxU6Yr9G';
// IMPORTANT: Time-based tests are flaky. GPU load, driver scheduling, thermal limits,
// and other work on this shared machine can change the runtime without a code regression.
// Keep this slow performance check opt-in; the regular GPU tests verify correctness.
// The 260-second budget is about twice the measured 128-second RTX 5090 run.
const budgetMs = 260_000;

test('GPU finds test by exhaustive lowercase search of four-letter passwords', () => {
  const started = performance.now();
  const child = spawnSync(process.execPath, ['bin/privatebin-guesser.js', '--url', url,
    '--paste-file', 'test/fixtures/known-test.paste.json', '--mask', '?l?l?l?l',
    '--max-candidates', '456976', '--backend', 'gpu', '--gpu-batch-size', '1024'],
  { encoding: 'utf8', timeout: budgetMs, maxBuffer: 2 * 1024 * 1024 });
  const elapsed = performance.now() - started;
  assert.equal(child.status, 0, child.stderr?.slice(-2000) || child.error?.message);
  assert.match(child.stdout, /Password found: test/);
  assert.match(child.stdout, /Stage: mask \?l\?l\?l\?l\. Tested 337920 candidate\(s\)/);
  assert.ok(elapsed < budgetMs, `GPU search took ${(elapsed / 1000).toFixed(1)} s, budget ${budgetMs / 1000} s`);
});
