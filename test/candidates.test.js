import test from 'node:test';
import assert from 'node:assert/strict';
import { ALNUM, PRINTABLE, SYMBOLS, charsetSize, combinations, maskCandidates, maskSize, parseMask, wordVariants } from '../src/candidates.js';

test('word variations include case changes, suffixes, and substitutions', () => {
  const candidates = [...wordVariants('Password')];
  assert.ok(candidates.includes('Password'));
  assert.ok(candidates.includes('PASSWORD'));
  assert.ok(candidates.includes('Password123'));
  assert.ok(candidates.includes('p@$$w0rd'));
  assert.equal(new Set(candidates).size, candidates.length);
});

test('alphanumeric and symbol stages cover distinct short keyspaces', () => {
  const alnum = [...combinations(ALNUM, 1)];
  const special = [...combinations(PRINTABLE, 1, true)];
  assert.equal(alnum.length, 62);
  assert.deepEqual(special, [...SYMBOLS]);
  assert.equal(charsetSize(ALNUM, 2), 62n + 62n ** 2n);
  assert.equal(charsetSize(PRINTABLE, 1, true), BigInt(SYMBOLS.length));
});

test('mask enumerates literal and variable positions', () => {
  const positions = parseMask('A?d?s');
  assert.equal(maskSize(positions), 10n * BigInt(SYMBOLS.length));
  assert.equal([...maskCandidates(parseMask('X?d'))].join(','), 'X0,X1,X2,X3,X4,X5,X6,X7,X8,X9');
  assert.deepEqual([...maskCandidates(parseMask('??'))], ['?']);
  assert.throws(() => parseMask('?x'), /Invalid mask token/);
});
