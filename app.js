const TYPES = ["collectible", "trinket", "card", "pill"];
const DLCS = ["rebirth", "afterbirth", "afterbirth+", "repentance"];
const QUALITIES = [0, 1, 2, 3, 4];
const RESULT_CAP = 200;
const NO_POOL = "no item pool (pickups/trinkets/etc)";

const LS_FAVS = "boi-favorites";
const LS_UI = "boi-ui";
const LS_PRESETS = "boi-presets";

const state = {
  items: [],
  q: "",
  type: new Set(),
  dlc: new Set(),
  pool: new Set(),
  quality: new Set(),
  favorites: new Set(),
  favOnly: false,
  collapsed: false,
  presets: {},
};

const els = {
  q: document.getElementById("q"),
  results: document.getElementById("results"),
  status: document.getElementById("status"),
  fType: document.getElementById("f-type"),
  fDlc: document.getElementById("f-dlc"),
  fPool: document.getElementById("f-pool"),
  poolAll: document.getElementById("pool-all"),
  poolNone: document.getElementById("pool-none"),
  fQuality: document.getElementById("f-quality"),
  filters: document.getElementById("filters"),
  favOnly: document.getElementById("fav-only"),
  toggleFilters: document.getElementById("toggle-filters"),
  presetSelect: document.getElementById("preset-select"),
  presetSave: document.getElementById("preset-save"),
  presetDelete: document.getElementById("preset-delete"),
  presetClear: document.getElementById("preset-clear"),
};

function favKey(item) {
  return `${item.type}:${item.id}`;
}

function loadPrefs() {
  try {
    const favs = JSON.parse(localStorage.getItem(LS_FAVS) || "[]");
    if (Array.isArray(favs)) state.favorites = new Set(favs);
  } catch {
  }
  try {
    const ui = JSON.parse(localStorage.getItem(LS_UI) || "{}");
    if (typeof ui.collapsed === "boolean") state.collapsed = ui.collapsed;
    if (typeof ui.favOnly === "boolean") state.favOnly = ui.favOnly;
  } catch {
  }
  try {
    const presets = JSON.parse(localStorage.getItem(LS_PRESETS) || "{}");
    if (presets && typeof presets === "object") state.presets = presets;
  } catch {
  }
}

function saveFavorites() {
  localStorage.setItem(LS_FAVS, JSON.stringify([...state.favorites]));
}

function saveUI() {
  localStorage.setItem(LS_UI, JSON.stringify({
    collapsed: state.collapsed,
    favOnly: state.favOnly,
  }));
}

function savePresets() {
  localStorage.setItem(LS_PRESETS, JSON.stringify(state.presets));
}

function captureFilters() {
  return {
    q: state.q,
    type: [...state.type],
    dlc: [...state.dlc],
    pool: [...state.pool],
    quality: [...state.quality],
    favOnly: state.favOnly,
  };
}

function deserializePool(raw) {
  // Accepts old bare-string entries and (transitional) [name, mode] tuples.
  const s = new Set();
  if (!Array.isArray(raw)) return s;
  for (const e of raw) {
    if (typeof e === "string") s.add(e);
    else if (Array.isArray(e) && typeof e[0] === "string") s.add(e[0]);
  }
  return s;
}

function syncChipStates() {
  for (const btn of document.querySelectorAll(".chip[data-group]")) {
    const group = btn.dataset.group;
    const value = btn.dataset.value;
    const set = state[group];
    const on = !!(set && set.has(value));
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }
}

function applyFilters(snap) {
  state.q = snap.q || "";
  state.type = new Set(snap.type || []);
  state.dlc = new Set(snap.dlc || []);
  state.pool = deserializePool(snap.pool);
  state.quality = new Set(snap.quality || []);
  state.favOnly = !!snap.favOnly;
  els.q.value = state.q;
  els.favOnly.classList.toggle("on", state.favOnly);
  els.favOnly.setAttribute("aria-pressed", state.favOnly ? "true" : "false");
  saveUI();
  syncChipStates();
  render();
}

function repopulatePresetSelect(selectName) {
  const target = selectName ?? els.presetSelect.value;
  els.presetSelect.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "— Load preset —";
  els.presetSelect.appendChild(placeholder);
  for (const name of Object.keys(state.presets).sort()) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    els.presetSelect.appendChild(opt);
  }
  if (target && state.presets[target]) {
    els.presetSelect.value = target;
    els.presetDelete.hidden = false;
  } else {
    els.presetSelect.value = "";
    els.presetDelete.hidden = true;
  }
}

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
      b.setAttribute("aria-pressed", "false");
    } else {
      set.add(value);
      b.classList.add("on");
      b.setAttribute("aria-pressed", "true");
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
  els.fPool.appendChild(chip(NO_POOL, "pool", NO_POOL));
}

function setAllPools(on) {
  state.pool = on
    ? new Set([...els.fPool.querySelectorAll(".chip[data-group=pool]")].map(b => b.dataset.value))
    : new Set();
  syncChipStates();
  render();
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
  const key = favKey(item);
  const fav = document.createElement("button");
  fav.className = "fav-btn" + (state.favorites.has(key) ? " on" : "");
  fav.type = "button";
  fav.textContent = "★";
  fav.title = "Toggle favorite";
  fav.setAttribute("aria-pressed", state.favorites.has(key) ? "true" : "false");
  fav.addEventListener("click", () => {
    if (state.favorites.has(key)) state.favorites.delete(key);
    else state.favorites.add(key);
    saveFavorites();
    fav.classList.toggle("on");
    fav.setAttribute("aria-pressed", state.favorites.has(key) ? "true" : "false");
    if (state.favOnly) render();
  });
  head.appendChild(fav);
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
    if (state.favOnly && !state.favorites.has(favKey(it))) continue;
    if (state.type.size && !state.type.has(it.type)) continue;
    if (state.dlc.size && !state.dlc.has(it.dlc)) continue;
    if (state.quality.size && !state.quality.has(String(it.quality))) continue;
    if (state.pool.size) {
      // Empty pools list counts as membership in the virtual (none) pool.
      const poolList = it.pools.length === 0 ? [NO_POOL] : it.pools;
      let hit = false;
      for (const p of poolList) if (state.pool.has(p)) {
        hit = true;
        break;
      }
      if (!hit) continue;
    }
    if (terms.length) {
      const hay = it._idx;
      let all = true;
      for (const t of terms) if (!hay.includes(t)) {
        all = false;
        break;
      }
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

els.favOnly.addEventListener("click", () => {
  state.favOnly = !state.favOnly;
  els.favOnly.classList.toggle("on", state.favOnly);
  els.favOnly.setAttribute("aria-pressed", state.favOnly ? "true" : "false");
  saveUI();
  render();
});

els.toggleFilters.addEventListener("click", () => {
  state.collapsed = !state.collapsed;
  els.filters.classList.toggle("collapsed", state.collapsed);
  els.toggleFilters.textContent = state.collapsed ? "▼" : "▲";
  els.toggleFilters.title = state.collapsed ? "Show filters" : "Hide filters";
  els.toggleFilters.setAttribute("aria-pressed", state.collapsed ? "false" : "true");
  saveUI();
});

els.presetSave.addEventListener("click", () => {
  const raw = window.prompt("Save current filters as:");
  const name = (raw || "").trim();
  if (!name) return;
  if (state.presets[name] && !window.confirm(`Overwrite preset "${name}"?`)) return;
  state.presets[name] = captureFilters();
  savePresets();
  repopulatePresetSelect(name);
});

els.presetSelect.addEventListener("change", () => {
  const name = els.presetSelect.value;
  if (!name || !state.presets[name]) {
    els.presetDelete.hidden = true;
    return;
  }
  applyFilters(state.presets[name]);
  els.presetDelete.hidden = false;
});

els.presetDelete.addEventListener("click", () => {
  const name = els.presetSelect.value;
  if (!name) return;
  if (!window.confirm(`Delete preset "${name}"?`)) return;
  delete state.presets[name];
  savePresets();
  repopulatePresetSelect("");
});

els.presetClear.addEventListener("click", () => {
  applyFilters({});
  repopulatePresetSelect("");
});

els.poolAll.addEventListener("click", () => setAllPools(true));
els.poolNone.addEventListener("click", () => setAllPools(false));

(async function init() {
  els.status.textContent = "Loading items...";
  loadPrefs();
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
  repopulatePresetSelect();
  if (state.favOnly) {
    els.favOnly.classList.add("on");
    els.favOnly.setAttribute("aria-pressed", "true");
  }
  if (state.collapsed) {
    els.filters.classList.add("collapsed");
    els.toggleFilters.textContent = "▼";
    els.toggleFilters.title = "Show filters";
    els.toggleFilters.setAttribute("aria-pressed", "false");
  }
  render();
})();
