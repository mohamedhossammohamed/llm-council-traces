#!/usr/bin/env python3
# Fast two-pass index: headers/salvos then blob-level secret sweep.
import json, os, re, sys, time

ARCHIVE = "/Users/mohammedhossam/quantum_debate_full_archive.local.txt"
SPANFILE = "/tmp/council_spans.json"

HDR_RE = re.compile(
    rb"=+ ROUND (\d+) \| ([0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2})Z? ?UTC?"
    rb" \| agents=([0-9]+)/([0-9]+)"
)
SALVO_RE = re.compile(rb"# POSITION OF COUNCILOR ([^\n#]{1,60})")
COMBINED = re.compile(
    rb"(?P<ork>sk-or-v1-[0-9a-zA-Z]{16,})"
    rb"|(?P<ghp>gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,})"
    rb"|(?P<ggl>AIza[0-9A-Za-z_\-]{10,})"
    rb"|(?P<aws>AKIA[0-9A-Z]{16})"
    rb"|(?P<slk>xox[baprs]-[A-Za-z0-9\-]{10,})"
    rb"|(?P<pk>-----BEGIN [A-Z ]*PRIVATE KEY-----)"
    rb"|(?P<eml>[A-Za-z0-9._%+\-]+@(gmail|hotmail|outlook|icloud|yahoo)\.[a-z]{2,})"
)
DASH = chr(8212)


def do_spans():
    t0 = time.time()
    filesize = os.path.getsize(ARCHIVE)
    headers = []
    salvos = []
    with open(ARCHIVE, "rb") as f:
        tail = b""
        base = 0
        cur = -1
        while True:
            chunk = f.read(32 << 20)
            if not chunk:
                break
            window = tail + chunk
            wbase = base - len(tail)
            for m in HDR_RE.finditer(window):
                off = wbase + m.start()
                if not headers or off > headers[-1][0]:
                    headers.append((off, int(m.group(1)), m.group(2).decode(),
                                    int(m.group(3)), int(m.group(4))))
                    salvos.append([])
                    cur = len(headers) - 1
            for m in SALVO_RE.finditer(window):
                moff = wbase + m.start()
                while cur >= 0 and headers[cur][0] > moff:
                    cur -= 1
                if cur >= 0:
                    name = m.group(1).decode("utf-8", "replace").strip(" -" + DASH + chr(9))
                    lst = salvos[cur]
                    if len(lst) < 64 and (not lst or lst[-1] != name):
                        lst.append(name)
            tail = window[-512:]
            base += len(chunk)
    spans = [{"off": h[0], "r": h[1], "ts": h[2], "a": [h[3], h[4]],
              "s": salvos[i]} for i, h in enumerate(headers)]
    data = {"file_size": filesize, "spans": spans}
    try:
        with open(SPANFILE) as f:
            old = json.load(f)
        if old.get("secret_hard") is not None:
            data["secret_hard"] = old["secret_hard"]
    except Exception:
        pass
    with open(SPANFILE, "w") as f:
        json.dump(data, f)
    print(json.dumps({"headers": len(headers), "secs": round(time.time() - t0, 1)}))


def do_secrets():
    t0 = time.time()
    hits = {}
    with open(ARCHIVE, "rb") as f:
        prev = b""
        while True:
            chunk = f.read(32 << 20)
            if not chunk:
                break
            buf = prev + chunk
            for m in COMBINED.finditer(buf):
                kind = m.lastgroup
                lst = hits.setdefault(kind, [])
                if len(lst) < 6:
                    lst.append(m.group(0)[:48].decode("utf-8", "replace"))
            prev = buf[-128:]
    with open(SPANFILE) as f:
        data = json.load(f)
    data["secret_hard"] = hits
    with open(SPANFILE, "w") as f:
        json.dump(data, f)
    print(json.dumps({"secs": round(time.time() - t0, 1), "HITS": hits}))


if __name__ == "__main__":
    {"spans": do_spans, "secrets": do_secrets}[sys.argv[1]]()
