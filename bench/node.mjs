import { readFileSync } from 'node:fs';
import { pbkdf2Sync } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { parsePasteUrl, preparePaste, tryPassword } from '../src/privatebin.js';

const url = 'https://privatebin.net/?ae47a6ef557ab284#CsWwk2FBrHzjbfbrbKSFN3NNwnWXBSE66Bs3LxU6Yr9G';
const paste = JSON.parse(readFileSync(new URL('../test/fixtures/known-test.paste.json', import.meta.url)));
const { key } = parsePasteUrl(url);
const prepared = preparePaste(paste);
const n = 200;
const phrase = Buffer.concat([key, Buffer.from('wrong')]);

function measure(name, operation) {
  for (let i = 0; i < 20; i++) operation(i);
  const start = performance.now();
  for (let i = 0; i < n; i++) operation(i);
  const seconds = (performance.now() - start) / 1000;
  console.log(JSON.stringify({ runtime: 'Node', name, attempts: n, seconds, attemptsPerSecond: n / seconds }));
}

measure('PBKDF2 only', () => pbkdf2Sync(phrase, prepared.salt, prepared.iterations, prepared.keyBits / 8, 'sha256'));
measure('full wrong-password check', () => tryPassword(key, prepared, 'wrong'));
