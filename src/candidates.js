export const LOWER = 'abcdefghijklmnopqrstuvwxyz';
export const UPPER = LOWER.toUpperCase();
export const DIGITS = '0123456789';
export const ALNUM = LOWER + UPPER + DIGITS;
export const SYMBOLS = ' ' + Array.from({ length: 94 }, (_, i) => String.fromCharCode(i + 33))
  .filter(character => !ALNUM.includes(character)).join('');
export const PRINTABLE = SYMBOLS + ALNUM;

export function* wordVariants(word) {
  const lower = word.toLowerCase();
  const base = [word, lower, word.toUpperCase(), lower.charAt(0).toUpperCase() + lower.slice(1)];
  const seen = new Set();
  for (const candidate of base) {
    if (!seen.has(candidate)) { seen.add(candidate); yield candidate; }
  }
  for (const candidate of base) {
    for (const suffix of ['1', '12', '123', '!', '1!', String(new Date().getFullYear())]) {
      const variant = candidate + suffix;
      if (!seen.has(variant)) { seen.add(variant); yield variant; }
    }
  }
  const leet = lower.replace(/a/g, '@').replace(/e/g, '3').replace(/i/g, '1').replace(/o/g, '0').replace(/s/g, '$');
  if (!seen.has(leet)) yield leet;
}

export function* combinations(charset, maxLength, requireSymbol = false) {
  for (let length = 1; length <= maxLength; length++) {
    const indexes = Array(length).fill(0);
    while (true) {
      const candidate = indexes.map(index => charset[index]).join('');
      if (!requireSymbol || [...candidate].some(character => SYMBOLS.includes(character))) yield candidate;
      let position = length - 1;
      while (position >= 0 && ++indexes[position] === charset.length) { indexes[position] = 0; position--; }
      if (position < 0) break;
    }
  }
}

const MASK_SETS = { l: LOWER, u: UPPER, d: DIGITS, s: SYMBOLS, a: PRINTABLE };

export function parseMask(mask) {
  if (!mask || typeof mask !== 'string') throw new Error('Mask must not be empty.');
  const positions = [];
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] !== '?') { positions.push(mask[i]); continue; }
    const code = mask[++i];
    if (code === '?') { positions.push('?'); continue; }
    if (!MASK_SETS[code]) throw new Error(`Invalid mask token ?${code || ''}. Use ?l, ?u, ?d, ?s, ?a, or ??.`);
    positions.push(MASK_SETS[code]);
  }
  if (positions.length > 16) throw new Error('Mask may contain at most 16 positions.');
  return positions;
}

export function maskSize(positions) {
  return positions.reduce((count, position) => count * BigInt(position.length), 1n);
}

export function* maskCandidates(positions) {
  const indexes = positions.map(() => 0);
  while (true) {
    yield positions.map((characters, i) => characters[indexes[i]]).join('');
    let position = positions.length - 1;
    while (position >= 0 && ++indexes[position] === positions[position].length) { indexes[position] = 0; position--; }
    if (position < 0) break;
  }
}

export function charsetSize(charset, maxLength, requireSymbol = false) {
  let total = 0n;
  for (let length = 1; length <= maxLength; length++) {
    const all = BigInt(charset.length) ** BigInt(length);
    total += requireSymbol ? all - BigInt(ALNUM.length) ** BigInt(length) : all;
  }
  return total;
}
