import { readFileSync } from 'node:fs';
import { pbkdf2 } from 'node:crypto';
import { promisify } from 'node:util';
import { performance } from 'node:perf_hooks';
import { parsePasteUrl, preparePaste } from '../src/privatebin.js';

const derive = promisify(pbkdf2);
const url = 'https://privatebin.net/?ae47a6ef557ab284#CsWwk2FBrHzjbfbrbKSFN3NNwnWXBSE66Bs3LxU6Yr9G';
const paste = JSON.parse(readFileSync(new URL('../test/fixtures/known-test.paste.json', import.meta.url)));
const { key } = parsePasteUrl(url);
const prepared = preparePaste(paste);
const phrase = Buffer.concat([key, Buffer.from('wrong')]);
const attempts = 200;

for (const concurrency of [2, 4]) {
  let next = 0;
  const start = performance.now();
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next++ < attempts) {
      await derive(phrase, prepared.salt, prepared.iterations, prepared.keyBits / 8, 'sha256');
    }
  }));
  const seconds = (performance.now() - start) / 1000;
  console.log(JSON.stringify({ runtime: 'Node', name: 'parallel PBKDF2', concurrency,
    attempts, seconds, attemptsPerSecond: attempts / seconds }));
}
