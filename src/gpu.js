import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tryDerivedKey, tryPasswordAsync } from './privatebin.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultPython = resolve(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const worker = resolve(root, 'gpu/worker.py');

export class GpuBackend {
  constructor(key, prepared) {
    this.key = key;
    this.prepared = prepared;
    this.python = process.env.PRIVATEBIN_GPU_PYTHON || defaultPython;
    this.pending = [];
    this.stderr = '';
  }

  async start() {
    if (!existsSync(this.python)) throw new Error(`GPU Python not found: ${this.python}. Create the project .venv and install the GPU dependencies.`);
    if (this.prepared.salt.length > 51) throw new Error('GPU backend supports salts up to 51 bytes.');
    this.child = spawn(this.python, [worker], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stderr.on('data', chunk => { this.stderr = (this.stderr + chunk).slice(-4000); });
    createInterface({ input: this.child.stdout }).on('line', line => {
      const pending = this.pending.shift();
      if (!pending) return;
      try { pending.resolve(JSON.parse(line)); } catch (error) { pending.reject(error); }
    });
    this.child.on('error', error => this.failAll(error));
    this.child.on('exit', code => this.failAll(new Error(`GPU worker exited (${code}): ${this.stderr.trim()}`)));
    const ready = await this.request({ key: this.key.toString('base64'), salt: this.prepared.salt.toString('base64'), iterations: this.prepared.iterations });
    if (!ready.ready) throw new Error('GPU worker failed to initialize.');
    this.device = ready.device;
    return this;
  }

  failAll(error) {
    for (const pending of this.pending.splice(0)) pending.reject(error);
  }

  request(value) {
    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject });
      this.child.stdin.write(`${JSON.stringify(value)}\n`, error => { if (error) this.failAll(error); });
    });
  }

  async tryBatch(candidates) {
    const results = Array(candidates.length).fill(null);
    const gpuCandidates = [];
    const gpuIndexes = [];
    for (let index = 0; index < candidates.length; index++) {
      if (Buffer.byteLength(candidates[index], 'utf8') > 224 || /[^\x00-\x7f]/.test(candidates[index])) {
        results[index] = await tryPasswordAsync(this.key, this.prepared, candidates[index]);
      } else {
        gpuCandidates.push(candidates[index]);
        gpuIndexes.push(index);
      }
    }
    if (!gpuCandidates.length) return results;
    const reply = await this.request({ candidates: gpuCandidates });
    const keys = Buffer.from(reply.keys, 'base64');
    if (keys.length !== gpuCandidates.length * 32) throw new Error('GPU worker returned an invalid key batch.');
    for (let index = 0; index < gpuCandidates.length; index++) {
      results[gpuIndexes[index]] = tryDerivedKey(this.prepared, keys.subarray(index * 32, index * 32 + this.prepared.keyBits / 8));
    }
    return results;
  }

  close() {
    if (this.child && !this.child.killed) this.child.kill();
  }
}
