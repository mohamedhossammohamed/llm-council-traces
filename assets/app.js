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

/* ---------- narrator: persona voices + spoken story ---------- */
const Narr = (() => {
  const synth = window.speechSynthesis;
  if (!synth) return { available: false };

  let roster = [];
  function loadVoices() {
    const all = synth.getVoices();
    if (!all.length) return false;
    const pref = all.filter((v) => /^en(-|_)/i.test(v.lang));
    const pool = (pref.length ? pref : all).filter((v) => !v.localService || true);
    roster = [];
    for (const v of pool) {
      if (!roster.some((x) => x.name === v.name)) roster.push(v);
      if (roster.length >= 6) break;
    }
    return roster.length > 0;
  }
  loadVoices();
  synth.onvoiceschanged = loadVoices;

  let queue = [];
  let qi = 0;
  let mode = "idle";          // idle | round | story
  let keepalive = 0;
  const cue = document.createElement("div");
  cue.className = "narr-cue";
  cue.innerHTML = "<span class=eq><i></i><i></i><i></i></span><span id=narr-label></span>";
  cue.hidden = true;
  document.body.appendChild(cue);
  const label = () => document.getElementById("narr-label");

  function speakPart(part, onDone) {
    const u = new SpeechSynthesisUtterance(part.text);
    const v = roster[part.voice % roster.length];
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = part.rate || 0.98;
    u.pitch = part.pitch || 1.0;
    u.onend = () => onDone();
    u.onerror = (ev) => { if (ev.error !== "interrupted" && ev.error !== "canceled") onDone(); else onDone(); };
    synth.speak(u);
  }

  function pump() {
    if (mode === "idle") return;
    if (qi >= queue.length) {
      const fin = onFinish;
      stopAll();
      if (fin) fin();
      return;
    }
    speakPart(queue[qi], () => {
      qi += 1;
      pump();
    });
  }

  let onFinish = null;

  function start(parts, m, fin) {
    cancel();
    queue = parts.filter((p) => p.text && p.text.trim());
    qi = 0;
    mode = m;
    onFinish = fin || null;
    cue.hidden = false;
    clearInterval(keepalive);
    keepalive = setInterval(() => { if (synth.speaking) synth.resume(); }, 9000);
    pump();
  }

  function cancel() {
    synth.cancel();
    queue = []; qi = 0; mode = "idle";
    clearInterval(keepalive);
    cue.hidden = true;
    document.getElementById("listen-btn").classList.remove("on");
    document.getElementById("story-btn").classList.remove("on");
  }
  function stopAll() { cancel(); }

  function togglePause() {
    if (synth.paused) synth.resume(); else if (synth.speaking) synth.pause();
  }

  /* markdown-ish text to clean speech text */
  function spoken(text) {
    let t = text.split("$").join(" ");
    t = t.split("**").join("").split("*").join("");
    t = t.split("`").join("");
    t = t.split("#").join(" ");
    t = t.split("_").join(" ");
    while (t.indexOf("  ") >= 0) t = t.split("  ").join(" ");
    return t.trim();
  }

  function chunk(text, n) {
    const words = spoken(text).split(" ");
    const out = [];
    let cur = [];
    for (const w of words) {
      cur.push(w);
      const L = cur.join(" ").length;
      const endsSentence = /[.!?]$/.test(w);
      if ((endsSentence && L > n * 0.55) || L > n) {
        out.push(cur.join(" "));
        cur = [];
      }
    }
    if (cur.length) out.push(cur.join(" "));
    return out;
  }

  function bodyParts(body, voiceBase) {
    const MARK = "--- agent ";
    const segs = [];
    let from = 0;
    for (;;) {
      const i = body.indexOf(MARK, from);
      if (i < 0) { segs.push(body.slice(from)); break; }
      const nl = body.indexOf(String.fromCharCode(10), i);
      if (nl < 0) { segs.push(body.slice(0, i)); break; }
      segs.push(body.slice(from, i));
      from = nl + 1;
    }
    const parts = [];
    segs.forEach((seg, si) => {
      const vs = voiceBase + si;
      for (const piece of chunk(seg, 210)) {
        parts.push({
          text: piece,
          voice: vs,
          rate: 0.97,
          pitch: 0.9 + ((si * 37) % 5) * 0.05,
        });
      }
    });
    return parts;
  }

  async function narrateRound(seq) {
    const e = state.bySeq[seq];
    try {
      const rec = await fetchRound(seq);
      const intro = "Round " + e.r + ". " +
        new Date(e.ts + "Z").toUTCString().slice(5, 22) + ", universal time. " +
        (e.a ? e.a[0] + " of " + e.a[1] + " councilor papers landed. " : "") +
        (e.s ? spoken(e.s) : "");
      const parts = [{ text: intro, voice: 0, rate: 0.96, pitch: 0.9 }]
        .concat(bodyParts(rec.body, 1));
      start(parts, "round", null);
    } catch (err) {
      label().textContent = "could not fetch this round";
      setTimeout(() => { cue.hidden = true; }, 2500);
    }
  }

  async function narrateStory(fromSeq) {
    let seq = fromSeq;
    const step = () => {
      if (mode !== "story") return;
      seq += 1;
      if (seq >= state.bySeq.length) { cancel(); return; }
      run();
    };
    const run = async () => {
      const e = state.bySeq[seq];
      scrubber.value = seq;
      scrubLabel.textContent = "Round " + e.r;
      cosmos && cosmos.focus(seq, false);
      if (readerEl.hidden || currentSeq !== seq) openRound(seq);
      label().textContent = "Story · Round " + e.r;
      let rec;
      try { rec = await fetchRound(seq); }
      catch (err) { setTimeout(step, 1500); return; }
      const intro = "Round " + e.r + ". " + (e.s ? spoken(e.s) : "");
      start([{ text: intro, voice: 0, rate: 0.94, pitch: 0.88 }]
        .concat(bodyParts(rec.body, 1)), "story", step);
    };
    mode = "story";
    run();
  }

  return {
    available: true,
    narrateRound,
    narrateStory,
    cancel,
    togglePause,
    get active() { return mode !== "idle"; },
    get mode() { return mode; },
    setLabel(t) { label().textContent = t; },
  };
})();
window.narrStop = () => Narr.available && Narr.cancel();

document.getElementById("listen-btn").addEventListener("click", function () {
  if (!Narr.available) { this.title = "No speech synthesis in this browser"; return; }
  if (Narr.active && Narr.mode === "round") { Narr.cancel(); return; }
  this.classList.add("on");
  Narr.setLabel("Reading round " + state.bySeq[currentSeq].r);
  Narr.narrateRound(currentSeq);
});
document.getElementById("story-btn").addEventListener("click", function () {
  if (!Narr.available) { this.title = "No speech synthesis in this browser"; return; }
  if (Narr.active && Narr.mode === "story") { Narr.cancel(); return; }
  this.classList.add("on");
  const from = readerEl.hidden ? +scrubber.value : currentSeq;
  Narr.narrateStory(Math.max(0, from));
});
addEventListener("beforeunload", () => { if (Narr.available) speechSynthesis.cancel(); });
