import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, pbkdf2Sync } from 'node:crypto';
import { deflateRawSync, deflateSync } from 'node:zlib';
import { decodeBase58, parsePasteUrl, preparePaste, tryPassword } from '../src/privatebin.js';

function fixture(password, compression) {
  const key = Buffer.alloc(32, 7);
  const iv = Buffer.alloc(16, 9);
  const salt = Buffer.alloc(8, 11);
  const adata = [[iv.toString('base64'), salt.toString('base64'), 1000, 256, 128, 'aes', 'gcm', compression === 'raw-deflate' ? 'zlib' : compression], 'plaintext', 0, 0];
  const derived = pbkdf2Sync(Buffer.concat([key, Buffer.from(password)]), salt, 1000, 32, 'sha256');
  const cipher = createCipheriv('aes-256-gcm', derived, iv);
  cipher.setAAD(Buffer.from(JSON.stringify(adata)));
  const message = Buffer.from(JSON.stringify({ paste: 'test message' }));
  const payload = compression === 'raw-deflate' ? deflateRawSync(message) : compression === 'zlib' ? deflateSync(message) : message;
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final(), cipher.getAuthTag()]);
  return { key, paste: { v: 2, adata, ct: encrypted.toString('base64') } };
}

test('PrivateBin base58 fragment preserves leading zero bytes', () => {
  assert.deepEqual(decodeBase58('11'), Buffer.from([0, 0]));
  const exampleKey = '1'.repeat(32);
  assert.equal(parsePasteUrl(`https://example.org/?0123456789abcdef#${exampleKey}`).key.length, 32);
  assert.equal(parsePasteUrl(`https://example.org/?pasteid=0123456789abcdef#-${exampleKey}`).fetchUrl,
    'https://example.org/?pasteid=0123456789abcdef');
});

for (const compression of ['none', 'zlib', 'raw-deflate']) {
  test(`checks a ${compression} paste offline`, () => {
    const { key, paste } = fixture('correct horse', compression);
    const prepared = preparePaste(paste);
    assert.equal(tryPassword(key, prepared, 'wrong'), null);
    assert.equal(JSON.parse(tryPassword(key, prepared, 'correct horse').toString()).paste, 'test message');
  });
}

test('rejects unsupported encryption settings', () => {
  const { paste } = fixture('secret', 'none');
  paste.adata[0][6] = 'cbc';
  assert.throws(() => preparePaste(paste), /Unsupported/);
});
