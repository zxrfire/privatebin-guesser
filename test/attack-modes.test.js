import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, pbkdf2Sync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../bin/privatebin-guesser.js', import.meta.url));
const url = `https://example.org/?0123456789abcdef#${'1'.repeat(32)}`;

function encryptedPaste(password) {
  const iv = Buffer.alloc(16, 9);
  const salt = Buffer.alloc(8, 11);
  const adata = [[iv.toString('base64'), salt.toString('base64'), 1000, 256, 128, 'aes', 'gcm', 'none'], 'plaintext', 0, 0];
  const derived = pbkdf2Sync(Buffer.concat([Buffer.alloc(32), Buffer.from(password)]), salt, 1000, 32, 'sha256');
  const cipher = createCipheriv('aes-256-gcm', derived, iv);
  cipher.setAAD(Buffer.from(JSON.stringify(adata)));
  const ct = Buffer.concat([cipher.update(Buffer.from('{"paste":"test"}')), cipher.final(), cipher.getAuthTag()]).toString('base64');
  return { v: 2, adata, ct };
}

for (const [name, password, options, stage] of [
  ['rules', 'Word1', ['--mode', 'rules'], 'word variations'],
  ['alnum', 'a', ['--mode', 'alnum', '--max-length', '1'], 'alphanumeric'],
  ['special', ' ', ['--mode', 'special', '--max-length', '1'], 'with symbols'],
  ['mask', 'A0!', ['--mask', 'A0?s'], 'mask A0?s']
]) {
  test(`${name} mode finds a known password`, () => {
    const directory = mkdtempSync(join(tmpdir(), 'privatebin-guesser-mode-'));
    try {
      const pasteFile = join(directory, 'paste.json');
      const wordlist = join(directory, 'words.txt');
      writeFileSync(pasteFile, JSON.stringify(encryptedPaste(password)));
      writeFileSync(wordlist, 'Word\n');
      const result = spawnSync(process.execPath, [cli, '--url', url, '--paste-file', pasteFile,
        '--wordlist', wordlist, '--max-candidates', '100', ...options], { encoding: 'utf8', timeout: 15_000 });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, new RegExp(`Stage: ${stage.replace(/[?]/g, '\\?')}`));
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
}
