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
