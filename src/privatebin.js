import { createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { inflateSync } from 'node:zlib';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function decodeBase58(value) {
  if (!value || typeof value !== 'string') throw new Error('Missing PrivateBin fragment key.');
  let number = 0n;
  for (const character of value) {
    const digit = ALPHABET.indexOf(character);
    if (digit < 0) throw new Error('Invalid base58 fragment key.');
    number = number * 58n + BigInt(digit);
  }
  const bytes = [];
  while (number > 0n) {
    bytes.unshift(Number(number % 256n));
    number /= 256n;
  }
  const leadingZeroes = value.match(/^1*/)[0].length;
  return Buffer.concat([Buffer.alloc(leadingZeroes), Buffer.from(bytes)]);
}

export function parsePasteUrl(input) {
  let url;
  try { url = new URL(input); } catch { throw new Error('Invalid URL.'); }
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('PrivateBin URL must use HTTP or HTTPS.');
  if (url.username || url.password) throw new Error('URL credentials are not supported.');
  let id = url.searchParams.get('pasteid');
  if (!id && /^[a-f0-9]{16}$/i.test(url.search.slice(1))) id = url.search.slice(1);
  if (!id || !/^[a-f0-9]{16}$/i.test(id)) throw new Error('URL must contain a 16-character PrivateBin paste ID.');
  const fragment = decodeURIComponent(url.hash.slice(1)).replace(/^-/, '');
  const key = decodeBase58(fragment);
  if (key.length !== 32) throw new Error('PrivateBin fragment key must decode to 32 bytes.');
  url.hash = '';
  url.search = '';
  url.searchParams.set('pasteid', id);
  return { fetchUrl: url.toString(), key, id };
}

function base64(value, field) {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error(`Invalid ${field} encoding.`);
  }
  return Buffer.from(value, 'base64');
}

export function preparePaste(paste) {
  if (paste?.v !== 2 || !Array.isArray(paste.adata) || !Array.isArray(paste.adata[0]) || typeof paste.ct !== 'string') {
    throw new Error('Only PrivateBin format v2 pastes are supported.');
  }
  const spec = paste.adata[0];
  const [iv64, salt64, iterations, keyBits, tagBits, algorithm, mode, compression] = spec;
  if (algorithm !== 'aes' || mode !== 'gcm' || !['none', 'zlib'].includes(compression) ||
      !Number.isSafeInteger(iterations) || iterations < 1 || iterations > 10_000_000 ||
      ![128, 192, 256].includes(keyBits) || !Number.isSafeInteger(tagBits) || tagBits < 96 || tagBits > 128 || tagBits % 8 !== 0) {
    throw new Error('Unsupported PrivateBin encryption settings.');
  }
  const iv = base64(iv64, 'IV');
  const salt = base64(salt64, 'salt');
  const ciphertext = base64(paste.ct, 'ciphertext');
  const tagBytes = tagBits / 8;
  if (!iv.length || !salt.length || ciphertext.length <= tagBytes) throw new Error('Incomplete encrypted paste.');
  return { iv, salt, iterations, keyBits, tagBytes, compression,
    ciphertext: ciphertext.subarray(0, -tagBytes), tag: ciphertext.subarray(-tagBytes),
    aad: Buffer.from(JSON.stringify(paste.adata), 'utf8') };
}

export async function fetchPaste(fetchUrl) {
  const response = await fetch(fetchUrl, {
    headers: { 'X-Requested-With': 'JSONHttpRequest', 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new Error(`PrivateBin returned HTTP ${response.status}.`);
  const paste = await response.json();
  if (paste.status !== 0) throw new Error(`PrivateBin refused the paste: ${paste.message || 'unknown error'}`);
  return paste;
}

export function tryPassword(key, prepared, password) {
  const phrase = Buffer.concat([key, Buffer.from(password, 'utf8')]);
  const derived = pbkdf2Sync(phrase, prepared.salt, prepared.iterations, prepared.keyBits / 8, 'sha256');
  try {
    const decipher = createDecipheriv(`aes-${prepared.keyBits}-gcm`, derived, prepared.iv, { authTagLength: prepared.tagBytes });
    decipher.setAAD(prepared.aad);
    decipher.setAuthTag(prepared.tag);
    const raw = Buffer.concat([decipher.update(prepared.ciphertext), decipher.final()]);
    return prepared.compression === 'zlib' ? inflateSync(raw) : raw;
  } catch (error) {
    if (error.code === 'ERR_OSSL_EVP_BAD_DECRYPT' || /authenticate data|bad decrypt/i.test(error.message)) return null;
    throw error;
  }
}
