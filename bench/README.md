# Local performance check

Benchmarked on Windows with a Ryzen 7 9800X3D against the saved PrivateBin paste with 100,000 PBKDF2-HMAC-SHA256 iterations. Each measurement tested 200 wrong candidates. The serial crypto measurements used 20 warm-up attempts; the parallel and CLI measurements did not. This was a short comparison on a shared machine, not a controlled hardware benchmark.

| Runtime / operation | Throughput |
| --- | ---: |
| Node 24.14, PBKDF2 only | 103/s |
| Node 24.14, full wrong-password check | 103/s |
| Python 3.11.4, PBKDF2 only | 55/s |
| Python 3.11.4, full wrong-password check | 56/s |
| Node, two parallel PBKDF2 jobs | 199/s |
| Node, four parallel PBKDF2 jobs | 270/s |

The CLI itself took 1.98 s for 200 wrong candidates with `--workers 1`, and 1.03 s with `--workers 2`. The two runtimes use different OpenSSL versions on this machine (Node: 3.5.5; Python: 1.1.1u), so this comparison does not isolate language overhead. The close Node PBKDF2-only and full-check results show that key derivation dominates this workload.

The scripts in this directory reproduce the crypto measurements. `python.py` additionally needs the `cryptography` package. All benchmarks use the saved fixture and make no network requests. Run benchmarks one at a time, since concurrent runs compete for CPU.

## GPU backend check

On the same machine, the RTX 5090 GPU backend checked 1,000 wrong ASCII wordlist entries from the saved paste in 1.44 s (about 694/s), using batches of 256. The two-worker CPU CLI took 5.25 s (about 190/s) on the same entries. These timings include CLI and GPU worker startup. The optional GPU packages were installed in the repository's `.venv`, leaving system Python untouched. This is one bounded local run; rates depend on batch size, paste iteration count, and other work on the machine.

An exhaustive four-letter lowercase GPU search with batches of 1024 found `test` in the saved paste after 337,920 checked candidates in 127.89 s (about 2,642/s). The standalone acceptance test repeated that search successfully in 126.07 s. Its 260-second limit is roughly twice the measured time and applies only to this machine's RTX 5090.
