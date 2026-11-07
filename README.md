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

`all` tries the wordlist, case changes and common suffixes, alphanumeric combinations, then printable ASCII combinations containing at least one symbol. `--max-length` sets the longest generated candidate. `--max-candidates` limits each generated stage, so a full keyspace may remain untested. The program shows keyspace size, progress, and approximate stage time while it runs. The wordlist stage always reads the whole file.

You can also choose one stage with `--mode rules`, `--mode alnum`, or `--mode special`. A mask narrows the search when you know a pattern:

```powershell
node bin/privatebin-guesser.js --url 'https://privatebin.example/?0123456789abcdef#YOUR_KEY' --mask '?u?l?l?l?d?d' --max-candidates 10000
```

Mask tokens are `?l` (lowercase), `?u` (uppercase), `?d` (digit), `?s` (symbol, including space), `?a` (all printable ASCII), and `??` (literal question mark). The mask above searches one uppercase letter, three lowercase letters, and two digits. These modes follow the same broad progression documented by [John the Ripper](https://www.openwall.com/john/doc/MODES.shtml) and [hashcat](https://hashcat.net/wiki/doku.php?id=mask_attack); this project implements a small, CPU-based subset.

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
```

The acceptance test uses encrypted paste data downloaded from the sample URL supplied by the project owner. It reads that checked-in fixture and tests one deliberately wrong candidate through the CLI without making a network request, so it still works after the original paste expires.
