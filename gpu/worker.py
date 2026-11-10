"""Line-oriented GPU derivation worker, launched with the project's venv Python."""
import base64
import json
import sys
from pathlib import Path

import cupy as cp
import numpy as np


MAX_PHRASE_BYTES = 256
MAX_BATCH = 8192


def emit(value):
    sys.stdout.write(json.dumps(value, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def main():
    settings = json.loads(sys.stdin.readline())
    key = base64.b64decode(settings["key"], validate=True)
    salt = base64.b64decode(settings["salt"], validate=True)
    iterations = settings["iterations"]
    if len(key) != 32 or not (1 <= len(salt) <= 51) or not (1 <= iterations <= 10_000_000):
        raise ValueError("GPU backend requires a 32-byte key and salt of 1 to 51 bytes")
    kernel = cp.RawKernel((Path(__file__).with_name("pbkdf2.cu")).read_text(), "pbkdf2_batch",
                          options=("--std=c++11",))
    kernel.compile()
    emit({"ready": True, "device": cp.cuda.runtime.getDeviceProperties(0)["name"].decode()})
    for line in sys.stdin:
        request = json.loads(line)
        candidates = request["candidates"]
        if not (1 <= len(candidates) <= MAX_BATCH):
            raise ValueError(f"GPU batch must contain 1 to {MAX_BATCH} candidates")
        if any(not candidate.isascii() for candidate in candidates):
            raise ValueError("GPU worker accepts ASCII candidates only")
        phrases = [key + candidate.encode("utf-8") for candidate in candidates]
        if any(len(phrase) > MAX_PHRASE_BYTES for phrase in phrases):
            raise ValueError(f"GPU candidate exceeds {MAX_PHRASE_BYTES - len(key)} UTF-8 bytes")
        stride = max(map(len, phrases))
        packed = np.zeros((len(phrases), stride), dtype=np.uint8)
        lengths = np.fromiter((len(phrase) for phrase in phrases), dtype=np.int32)
        for index, phrase in enumerate(phrases):
            packed[index, :len(phrase)] = np.frombuffer(phrase, dtype=np.uint8)
        result = cp.empty((len(phrases), 32), dtype=cp.uint8)
        kernel(((len(phrases) + 127) // 128,), (128,),
               (cp.asarray(packed), cp.asarray(lengths), np.int32(stride),
                cp.asarray(np.frombuffer(salt, dtype=np.uint8)), np.int32(len(salt)),
                np.int32(iterations), np.int32(len(phrases)), result))
        emit({"keys": base64.b64encode(cp.asnumpy(result).tobytes()).decode("ascii")})


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"GPU worker: {error}", file=sys.stderr)
        sys.exit(1)
