import base64
import re
import sys
import zlib

path = sys.argv[1]
data = open(path, "rb").read()

out = []
for match in re.finditer(rb"stream\r?\n(.*?)endstream", data, re.S):
    raw = match.group(1)
    # Locate the stream's dictionary to learn which filters were applied.
    head = data[max(0, match.start() - 400):match.start()]
    if b"ASCII85Decode" not in head:
        continue
    try:
        body = base64.a85decode(raw.strip(), adobe=True)
        body = zlib.decompress(body)
    except Exception:
        continue

    text = []
    for tok in re.finditer(rb"\((?:\\.|[^\\()])*\)|TJ|Tj|T\*|TD|Td|ET", body, re.S):
        s = tok.group(0)
        if s in (b"T*", b"TD", b"Td", b"ET"):
            text.append("\n")
        elif s.startswith(b"("):
            inner = s[1:-1]
            inner = re.sub(rb"\\([()\\])", rb"\1", inner)
            text.append(inner.decode("latin-1"))
    out.append("".join(text))

print("\n\n===== PAGE BREAK =====\n\n".join(out))
