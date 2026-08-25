# The Quantum Council

An interactive archive of **1,819 rounds** of a self-interrogating LLM council debating
quantum foundations, held August 22-23, 2026. Every position paper is preserved verbatim.

**Read it live:** https://mohamedhossammohamed.github.io/llm-council-traces/

## What happened here

A perpetual debate harness fired wave after wave of councilor agents at measurement,
locality, realism and the Born rule. There was only ever one councilor - ox-alpha -
cross-examining its own Everettian positions round after round: 12,500+ addresses,
about 2 GB of transcript, zero retractions.

## The site

- **Cosmos view** - every round is a star in a phyllotaxis galaxy. Size = length,
  hue = the interpretation under examination that round (Bohmian, GRW, QBism, ...).
  Drag to orbit, scroll to zoom, click to read.
- **Reader** - full parchment-style transcript with seamless next-round scrolling.
  Shareable links: #/r/1234
- **Topic rail** - filter the galaxy by interpretation.
- **Tour** - press play and travel the debate chronologically.
- No build step, no framework, no tracking. Three.js is the only dependency (vendored).

## Data layout

    data/
      manifest.json              - per-round metadata, previews, topic keyword vectors
      rounds/round-NNNNN.json.gz - one gzipped JSON per unique round body
    tools/
      council_build.py           - segmentation pipeline (spans / emit / manifest)
      council_fast.py            - fast header indexer + secret sweep helpers
      council_sec.py             - anchor-prefiltered secret scanner

The source archive was split on ROUND headers; 6 exact duplicate blocks from burner
restarts were dropped by content hash. A secrets gate (API keys, tokens, private keys,
personal emails) ran clean over all 2.18 GB before publication.

## Rebuilding

    python3 tools/council_build.py spans    # index round headers
    python3 tools/council_build.py emit     # slice, dedup, gzip (resumable)
    python3 tools/council_build.py manifest # write data/manifest.json

## License

Code: MIT. Transcript text: published as archival material.
