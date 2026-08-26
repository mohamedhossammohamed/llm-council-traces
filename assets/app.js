import * as THREE from "./vendor/three.module.min.js";

const REPO_RAW = "https://raw.githubusercontent.com/mohamedhossammohamed/llm-council-traces/main/data/rounds/";
const MANIFEST_URL = "data/manifest.json";

export const state = {
  manifest: null,
  bySeq: [],
  topics: [],
  activeTopic: null,
  selected: null,
  playing: false,
};

export const KW_META = [
  ["everett", "Many-Worlds / Everettian"],
  ["bohm", "Bohmian / Pilot-Wave"],
  ["grw", "GRW / Objective Collapse"],
  ["decoherence", "Decoherence"],
  ["bell", "Bell & Non-Locality"],
  ["born", "Born Rule"],
  ["copenhagen", "Copenhagen"],
  ["qbism", "QBism"],
  ["superdet", "Superdeterminism"],
  ["wigner", "Wigner & Friends"],
  ["histories", "Consistent Histories"],
  ["thermal", "Thermal Interpretation"],
  ["relational", "Relational QM"],
  ["tsvf", "Two-State Vector"],
  ["modal", "Modal Interpretations"],
  ["transactional", "Transactional"],
];

export const kwColor = new Map(KW_META.map(([k], i) => {
  const hue = (i * 137.508) % 360;
  return [k, new THREE.Color().setHSL(hue / 360, 0.72, 0.62)];
}));
export const kwHueCss = new Map(KW_META.map(([k], i) => {
  const hue = (i * 137.508) % 360;
  return [k, "hsl(" + hue.toFixed(0) + ",72%,64%)"];
}));

export function dominantKW(entry) {
  let best = null, bestN = 0;
  for (const [k, n] of Object.entries(entry.k || {})) {
    if (n > bestN) { best = k; bestN = n; }
  }
  return best;
}

const chunkCache = new Map();
const cacheOrder = [];
export async function fetchRound(seq) {
  if (chunkCache.has(seq)) return chunkCache.get(seq);
  const e = state.bySeq[seq];
  const res = await fetch(REPO_RAW + e.f);
  if (!res.ok) throw new Error("fetch failed " + res.status);
  const buf = await res.arrayBuffer();
  let text;
  if ("DecompressionStream" in window) {
    const ds = new DecompressionStream("gzip");
    const stream = new Response(buf).body.pipeThrough(ds);
    text = await new Response(stream).text();
  } else {
    throw new Error("This browser cannot decompress the archive.");
  }
  const rec = JSON.parse(text);
  chunkCache.set(seq, rec);
  cacheOrder.push(seq);
  while (cacheOrder.length > 6) {
    const old = cacheOrder.shift();
    chunkCache.delete(old);
  }
  return rec;
}

export async function boot() {
  const res = await fetch(MANIFEST_URL);
  if (!res.ok) throw new Error("manifest unavailable");
  state.manifest = await res.json();
  state.bySeq = state.manifest.rounds;
  document.getElementById("about-count").textContent =
    state.manifest.count.toLocaleString();
  const first = new Date(state.bySeq[0].ts + "Z");
  const last = new Date(state.bySeq[state.bySeq.length - 1].ts + "Z");
  const days = ((last - first) / 36e5).toFixed(1);
  const mb = Math.round(state.manifest.total_gz_bytes / 1e6);
  document.getElementById("hero-stats").textContent =
    state.manifest.count.toLocaleString() + " rounds · " +
    days + " hours of continuous debate · " + mb + " MB of verbatim transcript · zero retractions";
  const scr = document.getElementById("scrubber");
  scr.max = state.bySeq.length - 1;
  buildTopicRail();
}

function buildTopicRail() {
  const rail = document.getElementById("topic-rail");
  const totals = state.manifest.keywords || {};
  for (const [key, label] of KW_META) {
    if (!totals[key]) continue;
    const b = document.createElement("button");
    b.className = "chip";
    b.dataset.kw = key;
    b.innerHTML = "<span class=dot style=background:" + kwHueCss.get(key) + "></span>" +
      label + "<span class=n>·" + totals[key].toLocaleString() + "</span>";
    b.addEventListener("click", () => toggleTopic(key));
    rail.appendChild(b);
  }
  state.topics = [...rail.children];
}

function toggleTopic(key) {
  state.activeTopic = state.activeTopic === key ? null : key;
  for (const c of state.topics) c.classList.toggle("on", c.dataset.kw === state.activeTopic);
  window.dispatchEvent(new CustomEvent("topic-filter", { detail: state.activeTopic }));
}

/* ---------- Three.js cosmos ---------- */
function initCosmos() {
  const canvas = document.getElementById("cosmos");
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (e) {
    document.getElementById("boot-error").hidden = false;
    return null;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05070d, 0.0016);
  const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 1, 6000);
  camera.position.set(0, 320, 900);

  const N = state.bySeq.length;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const size = new Float32Array(N);
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < N; i++) {
    const e = state.bySeq[i];
    const t = i / (N - 1);
    const r = 90 + Math.pow(t, 0.72) * 1150;
    const a = i * GOLDEN;
    const y = (Math.sin(t * Math.PI * 2.2 + 0.6) * 46) * (0.4 + t);
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = Math.sin(a) * r;
    const dk = dominantKW(e);
    const c = (dk && kwColor.get(dk)) || new THREE.Color(0x8a94ab);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    size[i] = Math.min(26, 5 + Math.sqrt(e.b) * 0.16);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("psize", new THREE.BufferAttribute(size, 1));

  const tex = makeStarTexture();
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: tex }, uDim: { value: 1 } },
    vertexShader: `
      attribute float psize; varying vec3 vC;
      void main(){ vC = color;
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = psize * (340.0 / -mv.z);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `
      uniform sampler2D uTex; uniform float uDim; varying vec3 vC;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord);
        gl_FragColor = vec4(vC, 1.0) * t * uDim; }`,
    vertexColors: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  scene.add(points);

  // ambient dust
  const dn = 900, dp = new Float32Array(dn * 3);
  for (let i = 0; i < dn; i++) {
    dp[i * 3] = (Math.random() - 0.5) * 4200;
    dp[i * 3 + 1] = (Math.random() - 0.5) * 1600;
    dp[i * 3 + 2] = (Math.random() - 0.5) * 4200;
  }
  const dgeo = new THREE.BufferGeometry();
  dgeo.setAttribute("position", new THREE.BufferAttribute(dp, 3));
  const dust = new THREE.Points(dgeo, new THREE.PointsMaterial({
    color: 0x39435f, size: 2.2, transparent: true, opacity: 0.55, depthWrite: false,
  }));
  scene.add(dust);

  /* orbit controls — hand rolled */
  let theta = 0.4, phi = 1.12, radius = 980;
  let tTheta = theta, tPhi = phi, tRadius = radius;
  let dragging = false, px = 0, py = 0;
  let focusIdx = -1;

  function applyCam() {
    theta += (tTheta - theta) * 0.08;
    phi += (tPhi - phi) * 0.08;
    radius += (tRadius - radius) * 0.08;
    camera.position.set(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta)
    );
    if (focusIdx >= 0) {
      const i = focusIdx;
      camera.lookAt(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    } else {
      camera.lookAt(0, 0, 0);
    }
  }

  canvas.addEventListener("pointerdown", (e) => {
    dragging = true; px = e.clientX; py = e.clientY;
    canvas.classList.add("grabbing"); canvas.setPointerCapture(e.pointerId);
  });
  addEventListener("pointerup", () => { dragging = false; canvas.classList.remove("grabbing"); });
  addEventListener("pointermove", (e) => {
    if (!dragging) return;
    tTheta += (e.clientX - px) * 0.004;
    tPhi = Math.max(0.18, Math.min(Math.PI - 0.18, tPhi + (e.clientY - py) * 0.003));
    px = e.clientX; py = e.clientY;
    focusIdx = -1;
  });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    tRadius = Math.max(140, Math.min(2600, tRadius * (1 + Math.sign(e.deltaY) * 0.09)));
  }, { passive: false });

  /* picking */
  const ray = new THREE.Raycaster();
  ray.params.Points.threshold = 14;
  const ndc = new THREE.Vector2();
  let hovered = -1;
  const tip = document.getElementById("tooltip");

  function pick(e) {
    ndc.x = (e.clientX / innerWidth) * 2 - 1;
    ndc.y = -(e.clientY / innerHeight) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    const hitI = ray.intersectObject(points)[0];
    return hitI ? hitI.index : -1;
  }
  canvas.addEventListener("pointermove", (e) => {
    if (dragging) { tip.hidden = true; return; }
    hovered = pick(e);
    if (hovered < 0) { tip.hidden = true; return; }
    const en = state.bySeq[hovered];
    tip.innerHTML = "<div class=tt-h>Round " + en.r + "</div>" +
      "<div class=tt-d>" + en.ts.replace(" ", " · ") + " UTC · " +
      (en.a ? en.a[0] + "/" + en.a[1] + " agents" : "") + "</div>" +
      "<div class=tt-p>" + esc(en.p.slice(0, 150)) + "…</div>";
    tip.style.left = Math.min(innerWidth - 310, e.clientX + 16) + "px";
    tip.style.top = (e.clientY + 14) + "px";
    tip.hidden = false;
  });
  canvas.addEventListener("click", (e) => {
    const i = pick(e);
    if (i >= 0) openRound(i);
  });

  /* highlight filter */
  const baseCol = Float32Array.from(col);
  addEventListener("topic-filter", (ev) => {
    const kw = ev.detail;
    const arr = geo.attributes.color.array;
    for (let i = 0; i < N; i++) {
      const on = !kw || (state.bySeq[i].k || {})[kw];
      const f = on ? 1 : 0.16;
      arr[i * 3] = baseCol[i * 3] * f;
      arr[i * 3 + 1] = baseCol[i * 3 + 1] * f;
      arr[i * 3 + 2] = baseCol[i * 3 + 2] * f;
    }
    geo.attributes.color.needsUpdate = true;
  });

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let spin = 0.00022;

  function frame() {
    requestAnimationFrame(frame);
    if (!dragging && !reduced && !state.playing) tTheta += spin;
    if (state.playing) tourStep();
    applyCam();
    renderer.render(scene, camera);
  }
  frame();

  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  renderer.setSize(innerWidth, innerHeight);

  return {
    focus(i, closeup) {
      focusIdx = i;
      if (closeup) {
        const e = state.bySeq[i];
        const a2 = i * GOLDEN;
        tTheta = a2 + 0.0001;
        tPhi = 1.25;
        tRadius = 260;
      }
    },
    unfocus() { focusIdx = -1; tRadius = Math.max(tRadius, 900); },
    setScrubHighlight(i) { focusIdx = i; },
  };
}

function makeStarTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.28, "rgba(255,255,255,.85)");
  grad.addColorStop(0.62, "rgba(255,255,255,.18)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}


/* ---------- reader ---------- */
const readerEl = document.getElementById("reader");
const bodyEl = document.getElementById("reader-body");
let currentSeq = -1;

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function md(src) {
  const lines = src.split(/\n/);
  let html = "", para = [], listBuf = null;
  const flushP = () => {
    if (para.length) { html += "<p>" + inline(para.join(" ")) + "</p>"; para = []; }
  };
  const flushL = () => {
    if (listBuf) { html += "<ul>" + listBuf.map((li) => "<li>" + inline(li) + "</li>").join("") + "</ul>"; listBuf = null; }
  };
  const inline = (s) => {
    s = esc(s);
    s = s.replace(/\$\$([^$]+)\$\$/g, "<span class=math>$1</span>");
    s = s.replace(/\$([^$]+)\$/g, "<span class=math>$1</span>");
    s = s.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    return s;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^--- agent \d+ -+\s*$/.test(line)) {
      flushP(); flushL();
      const n = (line.match(/\d+/) || [""])[0];
      html += "<div class=salto-divider>Address " + n + "</div>";
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) { flushP(); flushL(); html += "<h" + h[1].length + ">" + inline(h[2]) + "</h" + h[1].length + ">"; continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { flushP(); flushL(); html += "<hr>"; continue; }
    const bq = line.match(/^>\s?(.*)/);
    if (bq) { flushP(); flushL(); html += "<blockquote><p>" + inline(bq[1]) + "</p></blockquote>"; continue; }
    const li = line.match(/^\s*[-*+]\s+(.*)/) || line.match(/^\s*\d+[.)]\s+(.*)/);
    if (li) { flushP(); (listBuf = listBuf || []).push(li[1]); continue; }
    if (!line.trim()) { flushP(); flushL(); continue; }
    para.push(line.trim());
  }
  flushP(); flushL();
  return html;
}

async function openRound(seq, push) {
  currentSeq = seq;
  state.selected = seq;
  const e = state.bySeq[seq];
  document.getElementById("reader-meta").innerHTML =
    "<div class=rm-t>Round " + e.r + "</div>" +
    "<div class=rm-d>" + e.ts + " UTC · " + (e.a ? e.a[0] + " of " + e.a[1] + " agents landed · " : "") +
      (e.c ? e.c.length + " addresses" : "") + "</div>";
  bodyEl.innerHTML = "<p class=next-cue><span class=spin>✦</span> unsealing the transcript…</p>";
  readerEl.hidden = false;
  requestAnimationFrame(() => readerEl.classList.add("open"));
  try {
    const rec = await fetchRound(seq);
    if (currentSeq !== seq) return;
    renderInto(rec);
  } catch (err) {
    bodyEl.innerHTML = "<p class=next-cue>This round could not be fetched — the network or browser refused. Try again.</p>";
  }
  scrubber.value = seq;
  scrubLabel.textContent = "Round " + e.r;
  const sumEl = document.getElementById("reader-summary");
  if (e.s) { sumEl.textContent = e.s; sumEl.hidden = false; } else { sumEl.hidden = true; }
  if (push !== false) location.hash = "#/r/" + seq;
  window.dispatchEvent(new CustomEvent("round-open", { detail: seq }));
}

function renderInto(rec) {
  bodyEl.innerHTML =
    md(rec.body) +
    "<div id=next-sentinel class=next-cue>— end of round " + rec.round + " —</div>";
  bodyEl.scrollTop = 0;
  attachNextSentinel();
}

function attachNextSentinel() {
  const sent = document.getElementById("next-sentinel");
  if (!sent || !("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && currentSeq >= 0 && currentSeq < state.bySeq.length - 1) {
      io.disconnect();
      appendNext(currentSeq + 1);
    }
  }, { root: bodyEl, rootMargin: "500px" });
  io.observe(sent);
}

async function appendNext(seq) {
  const cue = document.createElement("div");
  cue.className = "next-cue";
  cue.innerHTML = "<span class=spin>✦</span> summoning round " + state.bySeq[seq].r + "…";
  bodyEl.appendChild(cue);
  try {
    const rec = await fetchRound(seq);
    currentSeq = seq;
    state.selected = seq;
    location.hash = "#/r/" + seq;
    cue.remove();
    bodyEl.insertAdjacentHTML("beforeend", "<hr>" +
      md(rec.body) + "<div id=next-sentinel class=next-cue>— end of round " + rec.round + " —</div>");
    attachNextSentinel();
    window.dispatchEvent(new CustomEvent("round-open", { detail: seq }));
  } catch (e) {
    cue.textContent = "could not fetch next round";
  }
}

function closeReader() {
  if (window.narrStop) window.narrStop();
  readerEl.classList.remove("open");
  setTimeout(() => { readerEl.hidden = true; }, 450);
  currentSeq = -1;
  location.hash = "#/";
  cosmos && cosmos.unfocus();
}

/* ---------- search ---------- */
const searchEl = document.getElementById("search");
const resultsEl = document.getElementById("search-results");
let selIdx = -1, hits = [];

searchEl.addEventListener("input", () => {
  const q = searchEl.value.trim().toLowerCase();
  resultsEl.hidden = !q;
  if (!q) return;
  hits = [];
  for (let i = 0; i < state.bySeq.length && hits.length < 60; i++) {
    const e = state.bySeq[i];
    if (("round " + e.r).includes(q) || e.ts.includes(q) ||
        (e.p && e.p.toLowerCase().includes(q))) hits.push(i);
  }
  selIdx = -1;
  resultsEl.innerHTML = hits.map((i) => {
    const e = state.bySeq[i];
    return "<li role=option data-i=" + i + "><div class=sr-t>Round " + e.r +
      " — " + e.ts.split(" ")[0] + "</div><div class=sr-p>" + esc(e.p.slice(0, 120)) + "…</div></li>";
  }).join("") || "<li><div class=sr-p>Nothing in the ledger matches.</div></li>";
});
resultsEl.addEventListener("click", (e) => {
  const li = e.target.closest("li[data-i]");
  if (li) { openRound(+li.dataset.i); resultsEl.hidden = true; searchEl.blur(); }
});
searchEl.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") { selIdx = Math.min(hits.length - 1, selIdx + 1); markSel(); }
  else if (e.key === "ArrowUp") { selIdx = Math.max(0, selIdx - 1); markSel(); }
  else if (e.key === "Enter" && selIdx >= 0) { openRound(hits[selIdx]); resultsEl.hidden = true; }
  else if (e.key === "Escape") { resultsEl.hidden = true; }
});
function markSel() {
  [...resultsEl.children].forEach((el, i) => el.classList.toggle("sel", i === selIdx));
}

/* ---------- timeline / tour ---------- */
const scrubber = document.getElementById("scrubber");
const scrubLabel = document.getElementById("scrub-label");
let tourTimer = 0;

scrubber.addEventListener("input", () => {
  stopTour();
  const i = +scrubber.value;
  scrubLabel.textContent = "Round " + state.bySeq[i].r;
  cosmos && cosmos.setScrubHighlight(i);
});
scrubber.addEventListener("change", () => openRound(+scrubber.value));

document.getElementById("play-btn").addEventListener("click", function () {
  state.playing = !state.playing;
  this.textContent = state.playing ? "❚❚" : "▶";
  if (state.playing) startTour(); else stopTour();
});

function startTour() {
  let i = +scrubber.value;
  tourTimer = setInterval(() => {
    i = (i + 1) % state.bySeq.length;
    scrubber.value = i;
    scrubLabel.textContent = "Round " + state.bySeq[i].r;
    cosmos && cosmos.focus(i, false);
    if (!readerEl.hidden) closeReader();
  }, 1400);
}
function stopTour() { clearInterval(tourTimer); }

/* ---------- list fallback ---------- */
function showList() {
  const lv = document.getElementById("listview");
  const ol = document.getElementById("round-list");
  if (!ol.children.length) {
    for (let i = 0; i < state.bySeq.length; i++) {
      const e = state.bySeq[i];
      const li = document.createElement("li");
      li.innerHTML = "<div class=rl-t>Round " + e.r + "</div><div class=rl-d>" +
        e.ts + " UTC — " + esc(e.p.slice(0, 90)) + "…</div>";
      li.addEventListener("click", () => { lv.hidden = true; openRound(i); });
      ol.appendChild(li);
    }
  }
  lv.hidden = false;
}
document.getElementById("show-list").addEventListener("click", showList);

/* ---------- wiring ---------- */
let cosmos = null;

function route() {
  const m = location.hash.match(/^#\/r\/(\d+)/);
  if (m) {
    const seq = Math.max(0, Math.min(state.bySeq.length - 1, +m[1]));
    if (seq !== currentSeq) openRound(seq, false);
  } else if (!readerEl.hidden) {
    closeReader();
  }
}

async function main() {
  await boot();
  document.getElementById("enter-btn").disabled = false;
  cosmos = initCosmos();

  document.getElementById("enter-btn").addEventListener("click", () => {
    document.getElementById("hero").classList.add("gone");
    document.getElementById("topbar").hidden = false;
    document.getElementById("timeline").hidden = false;
  });
  document.getElementById("about-btn").addEventListener("click", () => {
    document.getElementById("about-panel").hidden = false;
  });
  document.getElementById("about-close").addEventListener("click", () => {
    document.getElementById("about-panel").hidden = true;
  });
  document.getElementById("reader-close").addEventListener("click", closeReader);
  document.getElementById("prev-btn").addEventListener("click", () =>
    currentSeq > 0 && openRound(currentSeq - 1));
  document.getElementById("next-btn").addEventListener("click", () =>
    currentSeq < state.bySeq.length - 1 && openRound(currentSeq + 1));

  addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if (currentSeq >= 0) {
      if (e.key === "ArrowRight") openRound(Math.min(state.bySeq.length - 1, currentSeq + 1));
      if (e.key === "ArrowLeft") openRound(Math.max(0, currentSeq - 1));
      if (e.key === "Escape") closeReader();
    } else if (e.key === "/") { e.preventDefault(); searchEl.focus(); }
  });

  addEventListener("hashchange", route);
  route();
  if (currentSeq >= 0) {
    document.getElementById("hero").classList.add("gone");
    document.getElementById("topbar").hidden = false;
    document.getElementById("timeline").hidden = false;
  }
}

main().catch((err) => {
  console.error(err);
  document.getElementById("boot-error").hidden = false;
});


/* ---------- narrator v2: one universal neural voice, prose only ---------- */
const Narr = (() => {
  const CAST_KEY = "qc-voice";
  function currentVoice() {
    try { return localStorage.getItem(CAST_KEY) || "af_heart"; }
    catch (e) { return "af_heart"; }
  }
  const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
  const synth = window.speechSynthesis || null;
  if (!synth) return { available: false };

  let tts = null;
  let loadingPromise = null;

  function engine() {
    if (tts) return Promise.resolve(tts);
    if (!loadingPromise) {
      label("summoning the voice · 86 MB once");
      loadingPromise = import("https://esm.sh/kokoro-js@1.2.1")
        .then((mod) => mod.KokoroTTS.from_pretrained(MODEL, {
          dtype: "q8f16", device: "wasm",
          progress_callback: (p) => {
            if (p && p.status === "progress" && p.total) {
              const pct = Math.round((p.loaded / p.total) * 100);
              if (pct % 10 === 0) label("summoning the voice · " + pct + "%");
            }
          },
        }))
        .then((t) => { tts = t; return t; })
        .catch((e) => { loadingPromise = null; throw e; });
    }
    return loadingPromise;
  }

  /* ---- prose cleaning: read the text and nothing but the text ---- */
  function stripProse(body) {
    const keep = [];
    for (let raw of body.split(String.fromCharCode(10))) {
      const t = raw.trim();
      if (!t) continue;
      if (t.charAt(0) === "#") continue;                       // headers
      if (t.indexOf("--- agent ") === 0) continue;             // machine dividers
      if (/^(-{3,}|={3,}|\*{3,})$/.test(t)) continue;          // rules
      if (t.charAt(0) === "|" || t.charAt(0) === "+") continue;// tables
      if (t.length > 30 && t.charAt(0) === "*" && t.endsWith("*")) continue; // stage directions
      if (/^\[(edit|citation|note)/i.test(t)) continue;
      keep.push(t.replace(/^>\s?/, ""));
    }
    let text = keep.join(String.fromCharCode(10));
    while (true) {                                             // drop $math$ spans
      const i = text.indexOf("$");
      if (i < 0) break;
      let j = text.indexOf("$", i + 1);
      if (j < 0) { text = text.slice(0, i); break; }
      text = text.slice(0, i) + " " + text.slice(j + 1);
    }
    for (const ch of ["**", "*", "`", "_", "#", "\(", "\)", "\["]) {
      text = text.split(ch).join("");
    }
    while (text.indexOf("  ") >= 0) text = text.split("  ").join(" ");
    return text.trim();
  }

  function chunk(text, n) {
    const out = [];
    let cur = "";
    for (const w of text.split(" ")) {
      cur += (cur ? " " : "") + w;
      const L = cur.length;
      const end = /[.!?][")]?$/.test(w);
      if ((end && L > n * 0.55) || L > n) { out.push(cur); cur = ""; }
    }
    if (cur) out.push(cur);
    return out.filter((s) => s.trim().length > 1);
  }

  /* ---- playback state ---- */
  let mode = "idle";
  let parts = [];
  let pi = 0;
  let onFinish = null;
  const audio = new Audio();
  audio.preload = "auto";
  const bufs = new Map();
  let storyRound = -1;
  let genToken = 0;

  const cue = document.createElement("div");
  cue.className = "narr-cue";
  cue.innerHTML = "<span class=eq><i></i><i></i><i></i></span><span id=narr-label></span>";
  cue.hidden = true;
  document.body.appendChild(cue);
  function label(t) {
    const el = document.getElementById("narr-label");
    if (el && t !== undefined) el.textContent = t;
    return el;
  }

  function wavUrl(raw) {
    const sr = raw.sampling_rate || 24000;
    const n = raw.audio.length;
    const buf = new ArrayBuffer(44 + n * 2);
    const v = new DataView(buf);
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); ws(8, "WAVE");
    ws(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, 1, true); v.setUint32(24, sr, true);
    v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    ws(36, "data"); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) {
      let s = Math.max(-1, Math.min(1, raw.audio[i]));
      v.setInt16(44 + i * 2, s < 0 ? s * 32768 : s * 32767, true);
    }
    return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  }

  function reset() {
    genToken += 1;
    audio.pause();
    parts = []; pi = 0; bufs.clear(); onFinish = null; mode = "idle";
    cue.hidden = true;
    document.getElementById("listen-btn").classList.remove("on");
    document.getElementById("story-btn").classList.remove("on");
  }

  async function synthPart(i, token) {
    if (bufs.has(i)) return bufs.get(i);
    const t = await tts.create(parts[i], { voice: currentVoice() });
    if (token !== genToken) throw new Error("cancelled");
    const url = wavUrl(t);
    bufs.set(i, url);
    return url;
  }

  async function pump(token) {
    while (mode !== "idle" && pi < parts.length) {
      let url;
      try {
        url = await synthPart(pi, token);
      } catch (e) {
        if (mode === "idle") return;
        pi += 1;
        continue;
      }
      if (mode === "story" && storyRound > 0) {
        label("Story · Round " + storyRound);
      } else if (mode === "round" && currentSeq >= 0) {
        label("Reading round " + state.bySeq[currentSeq].r);
      }
      await new Promise((res) => {
        audio.src = url;
        audio.onended = res;
        audio.play().catch(() => {
          const resume = () => { audio.play().catch(res); };
          document.addEventListener("click", resume, { once: true });
          label("tap anywhere to continue");
          setTimeout(res, 12000);
        });
      });
      if (mode === "idle" || token !== genToken) return;
      pi += 1;
      const nextIdx = pi;
      if (nextIdx < parts.length) synthPart(nextIdx, token).catch(() => {});
    }
    if (mode !== "idle") {
      const fin = onFinish;
      reset();
      if (fin) fin();
    }
  }

  /* ---- public API ---- */
  async function narrateRound(seq) {
    const token = ++genToken;
    mode = "round";
    cue.hidden = false;
    document.getElementById("listen-btn").classList.add("on");
    try {
      await engine();
    } catch (e) {
      fallbackSpeak(seq, token);
      return;
    }
    const e = state.bySeq[seq];
    let rec;
    try { rec = await fetchRound(seq); }
    catch (err) { label("could not fetch this round"); setTimeout(() => { if (mode !== "idle") reset(); }, 2500); return; }
    if (token !== genToken) return;
    const intro = "Round " + e.r + ". " +
      new Date(e.ts + "Z").toUTCString().slice(5, 22) + ", universal time. " +
      (e.a ? e.a[0] + " of " + e.a[1] + " councilor papers. " : "") +
      (e.s ? stripProse(e.s) : "");
    parts = chunk(intro, 700).concat(chunk(stripProse(rec.body), 700));
    pi = 0; bufs.clear();
    pump(token);
  }

  async function narrateStory(fromSeq) {
    const token = ++genToken;
    mode = "story";
    cue.hidden = false;
    document.getElementById("story-btn").classList.add("on");
    try { await engine(); }
    catch (e) { fallbackSpeak(Math.max(0, fromSeq), token, true); return; }
    let seq = Math.max(0, fromSeq);
    const step = () => {
      seq += 1;
      if (seq >= state.bySeq.length) { reset(); return; }
      runRound();
    };
    const runRound = async () => {
      if (mode !== "story" || token !== genToken) return;
      const e = state.bySeq[seq];
      scrubber.value = seq;
      scrubLabel.textContent = "Round " + e.r;
      cosmos && cosmos.focus(seq, false);
      if (readerEl.hidden || currentSeq !== seq) openRound(seq);
      label("Story · Round " + e.r);
      let rec;
      try { rec = await fetchRound(seq); }
      catch (err) { setTimeout(step, 2000); return; }
      if (token !== genToken || mode !== "story") return;
      const intro = "Round " + e.r + ". " + (e.s ? stripProse(e.s) : "");
      parts = chunk(intro, 700).concat(chunk(stripProse(rec.body), 700));
      pi = 0; bufs.clear();
      storyRound = e.r;
      onFinish = step;
      pump(token);
    };
    runRound();
  }

  /* system-voice fallback: same clean prose, lesser voice */
  function fallbackSpeak(seq, token, story) {
    const pool = synth.getVoices().filter((v) => /^en/i.test(v.lang));
    const v = pool.find((x) => /samantha|daniel|google uk english female|aria/i.test(x.name)) ||
              pool[0] || synth.getVoices()[0];
    const runOne = (text, cont) => {
      if (mode === "idle" || token !== genToken) return;
      for (const piece of chunk(text, 220)) {
        const u = new SpeechSynthesisUtterance(piece);
        if (v) u.voice = v;
        u.rate = 1.0;
        synth.speak(u);
      }
      const wait = setInterval(() => {
        if (!synth.speaking) { clearInterval(wait); cont(); }
      }, 400);
    };
    mode = story ? "story" : "round";
    cue.hidden = false;
    const stepSeq = () => {
      const e = state.bySeq[seq];
      label((story ? "Story·fallback · R" : "Fallback voice · R") + e.r);
      fetchRound(seq).then((rec) => {
        if (mode === "idle" || token !== genToken) return;
        runOne("Round " + e.r + ". " + (e.s ? stripProse(e.s) : "") + " " +
               stripProse(rec.body), () => {
          seq += 1;
          if (story && seq < state.bySeq.length && mode !== "idle") stepSeq();
          else reset();
        });
      }).catch(() => reset());
    };
    stepSeq();
  }

  return {
    available: true,
    narrateRound,
    narrateStory,
    async synthSample(text, voice) {
      await engine();
      return wavUrl(await tts.create(text, { voice }));
    },
    showCue(msg) { cue.hidden = false; label(msg || "…"); },
    hideCueIfIdle() { if (mode === "idle") cue.hidden = true; },
    cancel: reset,
    togglePause() { if (audio.paused && audio.src) audio.play(); else audio.pause(); },
    get active() { return mode !== "idle"; },
    get mode() { return mode; },
    setLabel(t) { label(t); },
  };
})();
window.narrStop = () => Narr.available && Narr.cancel();

document.getElementById("listen-btn").addEventListener("click", function () {
  if (Narr.active && Narr.mode === "round") { Narr.cancel(); return; }
  if (currentSeq < 0) return;
  Narr.narrateRound(currentSeq);
});
document.getElementById("story-btn").addEventListener("click", function () {
  if (Narr.active && Narr.mode === "story") { Narr.cancel(); return; }
  const from = readerEl.hidden ? +scrubber.value : currentSeq;
  Narr.narrateStory(from);
});
addEventListener("beforeunload", () => { Narr.cancel(); });

/* ---------- voice casting: audition before you commit ---------- */
const Cast = (() => {
  const CANDIDATES = [
    ["af_heart", "female · warm lead"],
    ["af_bella", "female · bright"],
    ["af_nova", "female · smooth"],
    ["af_sky", "female · light"],
    ["af_nicole", "female · soft whisper"],
    ["am_michael", "male · calm newsroom"],
    ["am_adam", "male · grounded"],
    ["am_fenrir", "male · commanding"],
    ["bf_emma", "british · measured"],
    ["bm_george", "british · gravitas"],
  ];
  const SAMPLE = "Let me state my allegiance before the knives come out, because ambiguity " +
    "is the disease this council exists to cure. Where, precisely, in the equations, does " +
    "the collapse operator live? Not in the interpretation section of your textbook. Show me the term.";
  const panel = document.getElementById("cast-panel");
  const list = document.getElementById("cast-list");
  const audio = new Audio();
  let busyVoice = null;

  function stored() {
    try { return localStorage.getItem("qc-voice") || "af_heart"; }
    catch (e) { return "af_heart"; }
  }

  function build() {
    list.innerHTML = "";
    for (const [id, tag] of CANDIDATES) {
      const li = document.createElement("li");
      li.dataset.v = id;
      if (id === stored()) li.classList.add("cast-on");
      li.innerHTML = "<span class=cv-name>" + id +
        "<span class=cv-tag>" + tag + "</span></span>" +
        "<button class=\"btn icon\" data-play=" + id + " aria-label=\"audition " + id + "\">▶</button>" +
        "<button class=\"btn icon\" data-cast=" + id + " aria-label=\"cast " + id + "\" title=\"Cast this voice\">✓</button>";
      list.appendChild(li);
    }
  }

  async function audition(id) {
    Narr.cancel();
    busyVoice = id;
    try {
      Narr.showCue("casting " + id + " · first time loads the model");
      const url = await Narr.synthSample(SAMPLE, id);
      if (busyVoice !== id) { Narr.hideCueIfIdle(); return; }
      audio.src = url;
      audio.play().catch(() => {});
    } catch (e) {
      Narr.setLabel("voice engine unavailable");
    } finally {
      setTimeout(() => { if (!Narr.active) Narr.hideCueIfIdle(); }, 1200);
    }
  }

  function cast(id) {
    try { localStorage.setItem("qc-voice", id); } catch (e) {}
    [...list.children].forEach((li) =>
      li.classList.toggle("cast-on", li.dataset.v === id));
  }

  list.addEventListener("click", (e) => {
    const play = e.target.closest("[data-play]");
    if (play) { audition(play.dataset.play); return; }
    const pick = e.target.closest("[data-cast]");
    if (pick) { cast(pick.dataset.cast); }
  });
  document.getElementById("cast-btn").addEventListener("click", () => {
    build();
    panel.hidden = false;
  });
  document.getElementById("cast-close").addEventListener("click", () => {
    panel.hidden = true;
  });

  return { currentVoice };
})();

/* ---------- copy whole round ---------- */
document.getElementById("copy-btn").addEventListener("click", function () {
  const text = window.__qcRoundText || "";
  if (!text) return;
  const done = () => {
    const prevTitle = this.title;
    this.classList.add("copied");
    this.title = "Copied";
    setTimeout(() => { this.classList.remove("copied"); this.title = prevTitle; }, 1400);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done.bind(this)).catch(() => fallbackCopy(text, this));
  } else {
    fallbackCopy(text, this);
  }
});
function fallbackCopy(text, btn) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); } catch (e) {}
  document.body.removeChild(ta);
  if (btn) {
    btn.classList.add("copied");
    setTimeout(() => btn.classList.remove("copied"), 1400);
  }
}
