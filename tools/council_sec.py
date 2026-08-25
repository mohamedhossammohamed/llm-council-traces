#!/usr/bin/env python3
# Anchor-prefiltered secret sweep: fast bytes.find, verify hits with regex.
import json, os, re, time

ARCHIVE = "/Users/mohammedhossam/quantum_debate_full_archive.local.txt"
SPANFILE = "/tmp/council_spans.json"

ANCHORS = [
    ("openrouter_key", b"sk-or-v1-", re.compile(rb"sk-or-v1-[0-9a-zA-Z]{16,}")),
    ("github_pat", b"ghp_", re.compile(rb"ghp_[A-Za-z0-9]{30,}")),
    ("github_pat2", b"github_pat_", re.compile(rb"github_pat_[A-Za-z0-9_]{20,}")),
    ("google_api", b"AIza", re.compile(rb"AIza[0-9A-Za-z_\-]{10,}")),
    ("aws_key", b"AKIA", re.compile(rb"AKIA[0-9A-Z]{16}")),
    ("slack_token", b"xoxb-", re.compile(rb"xox[baprs]-[A-Za-z0-9\-]{10,}")),
    ("private_key", b"-----BEGIN ", re.compile(rb"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("email_gmail", b"@gmail.", re.compile(rb"[A-Za-z0-9._%+\-]+@gmail\.[a-z]{2,}")),
    ("email_other", b"@hotmail.", None),
]

def main():
    t0 = time.time()
    hits = {}
    sizes = os.path.getsize(ARCHIVE)
    with open(ARCHIVE, "rb") as f:
        prev = b""
        while True:
            chunk = f.read(64 << 20)
            if not chunk:
                break
            buf = prev + chunk
            for name, anchor, rx in ANCHORS:
                start = 0
                while True:
                    i = buf.find(anchor, start)
                    if i < 0:
                        break
                    lo = max(0, i - 90)
                    hi = min(len(buf), i + 140)
                    ctx = buf[lo:hi]
                    ok = True
                    if rx is not None:
                        ok = rx.search(ctx) is not None
                    if ok:
                        lst = hits.setdefault(name, [])
                        if len(lst) < 6:
                            lst.append(ctx[max(0, i - lo - 8): max(0, i - lo) + 52].decode("utf-8", "replace"))
                    start = i + 1
            prev = buf[-256:]
    with open(SPANFILE) as f:
        data = json.load(f)
    data["secret_hard"] = hits
    data["secret_scan_bytes"] = sizes
    with open(SPANFILE, "w") as f:
        json.dump(data, f)
    print(json.dumps({"secs": round(time.time() - t0, 1), "HITS": hits}, indent=1))

main()
