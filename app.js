const TYPES = ["collectible", "trinket", "card", "pill"];
const DLCS = ["rebirth", "afterbirth", "afterbirth+", "repentance"];
const QUALITIES = [0, 1, 2, 3, 4];
const RESULT_CAP = 200;

const state = {
  items: [],
  q: "",
  type: new Set(),
  dlc: new Set(),
  pool: new Set(),
  quality: new Set(),
};

const els = {
  q: document.getElementById("q"),
  results: document.getElementById("results"),
  status: document.getElementById("status"),
  fType: document.getElementById("f-type"),
  fDlc: document.getElementById("f-dlc"),
  fPool: document.getElementById("f-pool"),
  fQuality: document.getElementById("f-quality"),
};

function chip(label, group, value) {
  const b = document.createElement("button");
  b.className = "chip";
  b.type = "button";
  b.textContent = label;
  b.dataset.group = group;
  b.dataset.value = value;
  b.addEventListener("click", () => {
    const set = state[group];
    if (set.has(value)) {
      set.delete(value);
      b.classList.remove("on");
    } else {
      set.add(value);
      b.classList.add("on");
    }
    render();
  });
  return b;
}

function buildFilters(pools) {
  for (const t of TYPES) els.fType.appendChild(chip(t, "type", t));
  for (const d of DLCS) els.fDlc.appendChild(chip(d, "dlc", d));
  for (const q of QUALITIES) els.fQuality.appendChild(chip("★".repeat(q + 1), "quality", String(q)));
  for (const p of pools) els.fPool.appendChild(chip(p, "pool", p));
}

function renderDescription(text) {
  const frag = document.createDocumentFragment();
  const lines = text.split("#");
  lines.forEach((line, i) => {
    if (i > 0) frag.appendChild(document.createElement("br"));
    let last = 0;
    const re = /\{\{([^}]+)\}\}/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      if (m.index > last) frag.appendChild(document.createTextNode(line.slice(last, m.index)));
      const span = document.createElement("span");
      span.className = "icon-chip";
      span.textContent = m[1];
      frag.appendChild(span);
      last = m.index + m[0].length;
    }
    if (last < line.length) frag.appendChild(document.createTextNode(line.slice(last)));
  });
  return frag;
}

function card(item) {
  const li = document.createElement("li");
  li.className = "card";

  const head = document.createElement("div");
  head.className = "card-head";
  const name = document.createElement("span");
  name.className = "card-name";
  name.textContent = item.name;
  head.appendChild(name);
  if (item.quality !== null && item.quality !== undefined) {
    const q = document.createElement("span");
    q.className = "card-quality";
    q.textContent = "★".repeat(item.quality + 1);
    q.title = `Quality ${item.quality}`;
    head.appendChild(q);
  }
  li.appendChild(head);

  const meta = document.createElement("div");
  meta.className = "card-meta";
  const tType = document.createElement("span");
  tType.className = "tag tag-type";
  tType.textContent = item.type;
  meta.appendChild(tType);
  const tDlc = document.createElement("span");
  tDlc.className = "tag";
  tDlc.textContent = item.dlc;
  meta.appendChild(tDlc);
  for (const p of item.pools) {
    const tp = document.createElement("span");
    tp.className = "tag";
    tp.textContent = p;
    meta.appendChild(tp);
  }
  li.appendChild(meta);

  const desc = document.createElement("div");
  desc.className = "desc";
  desc.appendChild(renderDescription(item.description));
  li.appendChild(desc);

  return li;
}

function filtered() {
  const terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
  const out = [];
  for (const it of state.items) {
    if (state.type.size && !state.type.has(it.type)) continue;
    if (state.dlc.size && !state.dlc.has(it.dlc)) continue;
    if (state.quality.size && !state.quality.has(String(it.quality))) continue;
    if (state.pool.size) {
      let hit = false;
      for (const p of it.pools) if (state.pool.has(p)) { hit = true; break; }
      if (!hit) continue;
    }
    if (terms.length) {
      const hay = it._idx;
      let all = true;
      for (const t of terms) if (!hay.includes(t)) { all = false; break; }
      if (!all) continue;
    }
    out.push(it);
  }
  return out;
}

function render() {
  const results = filtered();
  els.results.replaceChildren();
  const slice = results.slice(0, RESULT_CAP);
  const frag = document.createDocumentFragment();
  for (const it of slice) frag.appendChild(card(it));
  els.results.appendChild(frag);
  const total = results.length;
  if (total === 0) {
    els.status.textContent = "No matches.";
  } else if (total > RESULT_CAP) {
    els.status.textContent = `Showing ${RESULT_CAP} of ${total} matches. Refine to narrow down.`;
  } else {
    els.status.textContent = `${total} match${total === 1 ? "" : "es"}.`;
  }
}

let debounceId = 0;
els.q.addEventListener("input", () => {
  clearTimeout(debounceId);
  debounceId = setTimeout(() => {
    state.q = els.q.value;
    render();
  }, 120);
});

(async function init() {
  els.status.textContent = "Loading items...";
  try {
    const r = await fetch("data/items.json");
    state.items = await r.json();
  } catch (e) {
    els.status.textContent = "Failed to load data/items.json. Run build_data.py first.";
    return;
  }
  for (const it of state.items) it._idx = (it.name + " " + it.description).toLowerCase();
  const poolSet = new Set();
  for (const it of state.items) for (const p of it.pools) poolSet.add(p);
  const pools = [...poolSet].sort();
  buildFilters(pools);
  render();
})();
