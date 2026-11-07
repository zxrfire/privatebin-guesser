import base64
import hashlib
import json
import pathlib
import time

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

root = pathlib.Path(__file__).resolve().parents[1]
paste = json.loads((root / 'test/fixtures/known-test.paste.json').read_text())
spec = paste['adata'][0]
salt = base64.b64decode(spec[1])
iv = base64.b64decode(spec[0])
ciphertext = base64.b64decode(paste['ct'])
aad = json.dumps(paste['adata'], separators=(',', ':')).encode()
alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
fragment = 'CsWwk2FBrHzjbfbrbKSFN3NNwnWXBSE66Bs3LxU6Yr9G'
number = 0
for char in fragment:
    number = number * 58 + alphabet.index(char)
key = number.to_bytes(32, 'big')
phrase = key + b'wrong'
n = 200


def measure(name, operation):
    for i in range(20):
        operation(i)
    start = time.perf_counter()
    for i in range(n):
        operation(i)
    seconds = time.perf_counter() - start
    print(json.dumps({'runtime': 'Python', 'name': name, 'attempts': n,
                      'seconds': seconds, 'attemptsPerSecond': n / seconds}))


def derive(_):
    return hashlib.pbkdf2_hmac('sha256', phrase, salt, spec[2], dklen=spec[3] // 8)


def check(_):
    derived = derive(0)
    try:
        AESGCM(derived).decrypt(iv, ciphertext, aad)
    except InvalidTag:
        pass


measure('PBKDF2 only', derive)
measure('full wrong-password check', check)
