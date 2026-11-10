# PrivateBin Guesser

Test the password on a PrivateBin paste you control. The program downloads the encrypted paste once. Every password check then runs on your computer using PrivateBin's PBKDF2 and AES-GCM format; no password guess is sent to the server.

## Requirements

- Node.js 20 or newer
- A complete PrivateBin paste URL, including the key after `#`
- A UTF-8 wordlist with one candidate per line for wordlist, rules, or all mode

## Use

```powershell
node bin/privatebin-guesser.js --url 'https://privatebin.example/?0123456789abcdef#YOUR_KEY' --wordlist 'C:\path\to\words.txt'
```

That runs the wordlist alone. To run the full sequence, use:

```powershell
node bin/privatebin-guesser.js --url 'https://privatebin.example/?0123456789abcdef#YOUR_KEY' --wordlist 'C:\path\to\words.txt' --mode all --max-length 4 --max-candidates 1000
```

`all` tries the wordlist, case changes and common suffixes, alphanumeric combinations, then printable ASCII combinations containing at least one symbol. `--max-length` sets the longest generated candidate. `--max-candidates` limits each generated stage, so a full keyspace may remain untested. The program shows keyspace size, progress, and approximate stage time while it runs. The wordlist stage always reads the whole file. Two crypto jobs run in parallel by default; use `--workers 1` for a lighter run or `--workers 4` for more throughput.

You can also choose one stage with `--mode rules`, `--mode alnum`, or `--mode special`. A mask narrows the search when you know a pattern:

```powershell
node bin/privatebin-guesser.js --url 'https://privatebin.example/?0123456789abcdef#YOUR_KEY' --mask '?u?l?l?l?d?d' --max-candidates 10000
```

Mask tokens are `?l` (lowercase), `?u` (uppercase), `?d` (digit), `?s` (symbol, including space), `?a` (all printable ASCII), and `??` (literal question mark). The mask above searches one uppercase letter, three lowercase letters, and two digits. These modes follow the same broad progression documented by [John the Ripper](https://www.openwall.com/john/doc/MODES.shtml) and [hashcat](https://hashcat.net/wiki/doku.php?id=mask_attack).

## Optional NVIDIA GPU backend

Create a Python virtual environment inside this repository and install the optional GPU packages into it:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r gpu\requirements.txt
```

On Linux, use `.venv/bin/python` for the second command. This leaves the system Python environment untouched. The venv is ignored by Git. The GPU backend needs an NVIDIA GPU and a compatible driver; the CPU backend needs no Python packages.

```powershell
node bin/privatebin-guesser.js --url 'https://privatebin.example/?0123456789abcdef#YOUR_KEY' --paste-file 'C:\path\to\saved.paste.json' --wordlist 'C:\path\to\words.txt' --backend gpu
```

The default GPU batch contains 1024 candidates. Use `--gpu-batch-size 128` if a batch runs too long on a display GPU. The GPU derives PBKDF2 keys; the CLI checks each derived key against the paste's AES-GCM tag. Unicode candidates and candidates longer than 224 UTF-8 bytes are checked on the CPU for correctness. `--workers` applies to the CPU backend only. To use a different venv, set `PRIVATEBIN_GPU_PYTHON` to its Python executable. An explicit GPU request reports an error if the venv or GPU is unavailable.

On Windows PowerShell, keep the URL in quotes so the `#` fragment is passed intact. A match prints the password and the number of candidates tested. Exit code `0` means a match, `2` means no match, and `1` means an input or network error. The paste's contents are not printed.

To save the encrypted data while a paste is available and test it later without any network request:

```powershell
node bin/privatebin-guesser.js --url 'https://privatebin.example/?0123456789abcdef#YOUR_KEY' --wordlist 'C:\path\to\words.txt' --save 'C:\path\to\my.paste.json'
node bin/privatebin-guesser.js --url 'https://privatebin.example/?0123456789abcdef#YOUR_KEY' --paste-file 'C:\path\to\my.paste.json' --wordlist 'C:\path\to\more-words.txt'
```

The saved file contains ciphertext and encryption settings. The fragment key remains in the URL you provide. Protect both; together with a guessed password they reveal the paste. `--save` refuses to overwrite an existing file.

The program supports PrivateBin format v2 pastes with AES-GCM and `none` or `zlib` compression. It checks candidates in wordlist order, including blank lines as empty passwords. It does not test Pastebin.com passwords. A single GET can consume a burn-after-reading paste; use a normal paste for experiments. An expired or deleted paste cannot be fetched, but an encrypted file saved earlier can still be checked offline.

PrivateBin's [encryption format](https://github.com/PrivateBin/PrivateBin/wiki/Encryption-format) and [client implementation](https://github.com/PrivateBin/PrivateBin/blob/master/js/privatebin.js) describe the format used here.

## License

Apache License 2.0. You may use, modify, and redistribute the project under its terms. Redistributions must retain the required license and attribution notices, including the credit to **zxrfire** in [NOTICE](NOTICE).

## Verify

```powershell
npm test
npm run test:gpu
npm run test:gpu:full
```

The acceptance tests use encrypted paste data downloaded from two sample URLs supplied by the project owner. One confirms a wrong candidate fails; the other finds the known password `test`. Both read checked-in fixtures without making a network request, so they still work after the originals expire.

The optional `test:gpu:full` acceptance test starts with no wordlist and exhaustively tries four-letter lowercase passwords until it finds `test`. It checks the result and allows 260 seconds, about twice the measured 128-second RTX 5090 run. Run it separately; its timing limit is specific to this machine.
