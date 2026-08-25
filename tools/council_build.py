#!/usr/bin/env python3
# Build public llm-council-traces data from the local archive.
import gzip, hashlib, json, os, re, sys, time

ARCHIVE = "/Users/mohammedhossam/quantum_debate_full_archive.local.txt"
REPO = "/Users/mohammedhossam/projects/llm-council-traces"
DATA = os.path.join(REPO, "data")
SPANFILE = "/tmp/council_spans.json"
ENTRIESFILE = "/tmp/council_emit_entries.json"

HDR_RE = re.compile(
    rb"=+ ROUND (\d+) \| ([0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2})Z? ?UTC?"
    rb" \| agents=([0-9]+)/([0-9]+)"
)
SALVO_RE = re.compile(rb"# POSITION OF COUNCILOR ([^\n#]{1,60})")

KEYWORDS = [
    ("copenhagen", [b"Copenhagen"]),
    ("everett", [b"Many-Worl", b"Many Worl", b"Everett", b"Everettian"]),
    ("bohm", [b"Bohm", b"pilot wave", b"pilot-wave", b"de Broglie"]),
    ("grw", [b"GRW", b"CSL", b"collapse model", b"objective collapse"]),
    ("qbism", [b"QBism", b"QBist"]),
    ("relational", [b"relational quantum", b"Rovelli"]),
    ("superdet", [b"superdetermin", b"t Hooft"]),
    ("transactional", [b"transactional"]),
    ("histories", [b"Consistent Histor", b"decoherent histor"]),
    ("modal", [b"modal interpretation"]),
    ("thermal", [b"Thermal Interpretation", b"Allori"]),
    ("tsvf", [b"Two-State Vector", b"two-state vector"]),
    ("wigner", [b"Wigner"]),
    ("born", [b"Born rule"]),
    ("bell", [b"Bell"]),
    ("decoherence", [b"decoheren"]),
]
KW_PATTERNS = [(k, [re.compile(p) for p in pats]) for k, pats in KEYWORDS]

SECRET_HARD = [
    ("openrouter_key", re.compile(rb"sk-or-v1-[0-9a-zA-Z]{16,}")),
    ("github_pat", re.compile(rb"gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}")),
    ("google_api", re.compile(rb"AIza[0-9A-Za-z_\-]{10,}")),
    ("aws_key", re.compile(rb"AKIA[0-9A-Z]{16}")),
    ("slack_token", re.compile(rb"xox[baprs]-[A-Za-z0-9\-]{10,}")),
    ("private_key", re.compile(rb"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
]
SECRET_SOFT = [
    ("generic_sk", re.compile(rb"\bsk-[A-Za-z0-9]{20,}")),
    ("bearer", re.compile(rb"Bearer\s+[A-Za-z0-9._\-]{25,}")),
    ("email", re.compile(rb"[A-Za-z0-9._%+\-]+@(gmail|hotmail|outlook|icloud|yahoo)\.[a-z]{2,}")),
    ("apikey_kv", re.compile(rb"(?i)api[_-]?key[" + bytes([39]) + rb"]?\s*[:=]\s*[" + bytes([39]) + rb"]?[A-Za-z0-9_\-]{12,}")),
]

DASH = chr(8212)
NLB = bytes([10])


def cmd_spans():
    t0 = time.time()
    filesize = os.path.getsize(ARCHIVE)
    headers = []
    salvos_by_round = []
    hard_hits = {}
    soft_counts = {}
    with open(ARCHIVE, "rb") as f:
        tail = b""
        base = 0
        cur = -1
        while True:
            chunk = f.read(16 << 20)
            if not chunk:
                break
            window = tail + chunk
            wbase = base - len(tail)
            for m in HDR_RE.finditer(window):
                off = wbase + m.start()
                if not headers or off > headers[-1][0]:
                    headers.append((off, int(m.group(1)), m.group(2).decode(),
                                    int(m.group(3)), int(m.group(4))))
                    salvos_by_round.append([])
                    cur = len(headers) - 1
            for m in SALVO_RE.finditer(window):
                moff = wbase + m.start()
                while cur >= 0 and headers[cur][0] > moff:
                    cur -= 1
                if cur >= 0:
                    name = m.group(1).decode("utf-8", "replace").strip(" -" + DASH + chr(9))
                    lst = salvos_by_round[cur]
                    if len(lst) < 64 and (not lst or lst[-1] != name):
                        lst.append(name)
            for ln in window.split(NLB):
                for pid, rx in SECRET_HARD:
                    mm = rx.search(ln)
                    if mm:
                        hard_hits.setdefault(pid, [])
                        if len(hard_hits[pid]) < 6:
                            hard_hits[pid].append(mm.group(0)[:50].decode("utf-8", "replace"))
                for pid, rx in SECRET_SOFT:
                    if rx.search(ln):
                        soft_counts[pid] = soft_counts.get(pid, 0) + 1
            tail = window[-512:]
            base += len(chunk)

    spans = [{"off": h[0], "r": h[1], "ts": h[2], "a": [h[3], h[4]],
              "s": salvos_by_round[i]} for i, h in enumerate(headers)]
    with open(SPANFILE, "w") as f:
        json.dump({"file_size": filesize, "spans": spans,
                   "secret_hard": hard_hits, "secret_soft_counts": soft_counts}, f)
    print(json.dumps({"headers": len(headers), "secs": round(time.time() - t0, 1),
                      "HARD_HITS": hard_hits, "soft_counts": soft_counts}, indent=1))
    if hard_hits:
        print("SECRETS DETECTED - DO NOT PUBLISH")
        sys.exit(2)



def kw_vector(body_bytes):
    hits = {}
    for key, rxs in KW_PATTERNS:
        n = 0
        for rx in rxs:
            n += len(rx.findall(body_bytes))
        if n:
            hits[key] = min(n, 99)
    return hits


def cmd_emit():
    t0 = time.time()
    with open(SPANFILE) as f:
        meta = json.load(f)
    spans, filesize = meta["spans"], meta["file_size"]
    os.makedirs(os.path.join(DATA, "rounds"), exist_ok=True)

    entries = []
    if os.path.exists(ENTRIESFILE):
        with open(ENTRIESFILE) as f:
            entries = json.load(f)["entries"]
    seen = set(e["sha"] for e in entries)
    kept = len(entries)
    dupes = raw_b = gz_b = 0

    def emit(seq, sp, body):
        nonlocal raw_b, gz_b
        text = body.decode("utf-8", "replace")
        digest = hashlib.sha1(body).hexdigest()[:12]
        fname = "round-" + format(seq, "05d") + ".json.gz"
        payload = json.dumps({
            "seq": seq, "round": sp["r"], "ts": sp["ts"], "agents": sp["a"],
            "salvos": sp["s"], "body": text,
        }, ensure_ascii=False).encode("utf-8")
        gz = gzip.compress(payload, 1)
        with open(os.path.join(DATA, "rounds", fname), "wb") as gf:
            gf.write(gz)
        raw_b += len(payload)
        gz_b += len(gz)
        preview = " ".join(text.split())[:200]
        return {"seq": seq, "r": sp["r"], "ts": sp["ts"], "a": sp["a"],
                "c": sp["s"], "f": fname, "b": len(gz), "sha": digest,
                "p": preview, "k": kw_vector(body)}

    with open(ARCHIVE, "rb") as f:
        for idx, sp in enumerate(spans):
            if idx < kept:
                continue
            end = spans[idx + 1]["off"] if idx + 1 < len(spans) else filesize
            f.seek(sp["off"])
            block = f.read(end - sp["off"])
            nl = block.index(NLB) + 1
            body = block[nl:]
            digest = hashlib.sha1(body).hexdigest()[:12]
            if digest in seen:
                dupes += 1
                continue
            seen.add(digest)
            entries.append(emit(kept, sp, body))
            kept += 1
            if time.time() - t0 > 95:
                with open(ENTRIESFILE, "w") as mf:
                    json.dump({"entries": entries}, mf)
                print("CHECKPOINT seq=" + str(kept) + " dupes=" + str(dupes))
                return

    with open(ENTRIESFILE, "w") as mf:
        json.dump({"entries": entries}, mf)
    print(json.dumps({"kept": kept, "dupes": dupes,
                      "raw_MB": round(raw_b / 1e6, 1), "gz_MB": round(gz_b / 1e6, 1),
                      "secs": round(time.time() - t0, 1)}, indent=1))


def cmd_manifest():
    with open(ENTRIESFILE) as f:
        entries = json.load(f)["entries"]
    kw_tot = {}
    for e in entries:
        for k, v in e["k"].items():
            kw_tot[k] = kw_tot.get(k, 0) + v
    total_gz = sum(e["b"] for e in entries)
    man = {
        "title": "The Quantum Council",
        "description": "Complete transcript of a perpetual LLM council debate on quantum foundations.",
        "count": len(entries),
        "total_gz_bytes": total_gz,
        "keywords": kw_tot,
        "rounds": entries,
    }
    with open(os.path.join(DATA, "manifest.json"), "w") as f:
        json.dump(man, f, ensure_ascii=False)
    print(json.dumps({"entries": len(entries), "kw_totals": kw_tot,
                      "total_gz_MB": round(total_gz / 1e6, 1)}, indent=1))


if __name__ == "__main__":
    {"spans": cmd_spans, "emit": cmd_emit, "manifest": cmd_manifest}[sys.argv[1]]()
