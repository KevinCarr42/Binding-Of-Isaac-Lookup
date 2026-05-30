const TYPES = ["collectible", "trinket", "card", "pill"];
const DLCS = ["rebirth", "afterbirth", "afterbirth+", "repentance"];
const QUALITIES = [0, 1, 2, 3, 4];
const NO_POOL = "no item pool (pickups/trinkets/etc)";

const VIEW_TOGGLES = [
  ["showIcons", "Icons"],
  ["showTags", "Tags"],
  ["showQuality", "Quality"],
  ["showFavHate", "Fav / Hate"],
  ["showDescription", "Description"],
  ["iconOnly", "Icon only"],
];
const DEFAULT_VIEW = Object.fromEntries(VIEW_TOGGLES.map(([k]) => [k, k !== "iconOnly"]));

const SORT_KEYS = [
  ["quality", "Quality"],
  ["name", "Name"],
  ["dlc", "DLC"],
  ["type", "Type"],
];

const LS_FAVS = "boi-favorites";
const LS_HATED = "boi-poop";
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
  hated: new Set(),
  favOnly: false,
  hateOnly: false,
  collapsed: false,
  view: { ...DEFAULT_VIEW },
  sort: [],  // [{key, dir: "asc"|"desc"}, ...] — array order = priority
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
  fView: document.getElementById("f-view"),
  fSort: document.getElementById("f-sort"),
  filters: document.getElementById("filters"),
  favOnly: document.getElementById("fav-only"),
  hateOnly: document.getElementById("hate-only"),
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
    const hated = JSON.parse(localStorage.getItem(LS_HATED) || "[]");
    if (Array.isArray(hated)) state.hated = new Set(hated);
  } catch {
  }
  try {
    const ui = JSON.parse(localStorage.getItem(LS_UI) || "{}");
    if (typeof ui.collapsed === "boolean") state.collapsed = ui.collapsed;
    if (typeof ui.favOnly === "boolean") state.favOnly = ui.favOnly;
    if (typeof ui.hateOnly === "boolean") state.hateOnly = ui.hateOnly;
    if (ui.view && typeof ui.view === "object") {
      for (const [k] of VIEW_TOGGLES) {
        if (typeof ui.view[k] === "boolean") state.view[k] = ui.view[k];
      }
    }
    if (Array.isArray(ui.sort)) state.sort = sanitizeSort(ui.sort);
  } catch {
  }
  try {
    const presets = JSON.parse(localStorage.getItem(LS_PRESETS) || "{}");
    if (presets && typeof presets === "object") {
      for (const [name, raw] of Object.entries(presets)) {
        state.presets[name] = migratePreset(raw);
      }
    }
  } catch {
  }
}

function sanitizeSort(arr) {
  const keys = new Set(SORT_KEYS.map(([k]) => k));
  const seen = new Set();
  const out = [];
  for (const e of arr) {
    if (!e || typeof e !== "object") continue;
    if (!keys.has(e.key) || seen.has(e.key)) continue;
    const dir = e.dir === "desc" ? "desc" : "asc";
    out.push({ key: e.key, dir });
    seen.add(e.key);
  }
  return out;
}

function migratePreset(raw) {
  // Old format: { q, type, dlc, ... } flat. New: { filters, view, sort }.
  if (!raw || typeof raw !== "object") return { filters: {} };
  if (raw.filters || raw.view || raw.sort) {
    return {
      filters: raw.filters || {},
      view: raw.view && typeof raw.view === "object" ? raw.view : undefined,
      sort: Array.isArray(raw.sort) ? sanitizeSort(raw.sort) : undefined,
    };
  }
  return { filters: raw };
}

function saveFavorites() {
  localStorage.setItem(LS_FAVS, JSON.stringify([...state.favorites]));
}

function saveHated() {
  localStorage.setItem(LS_HATED, JSON.stringify([...state.hated]));
}

function saveUI() {
  localStorage.setItem(LS_UI, JSON.stringify({
    collapsed: state.collapsed,
    favOnly: state.favOnly,
    hateOnly: state.hateOnly,
    view: state.view,
    sort: state.sort,
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
    hateOnly: state.hateOnly,
  };
}

function capturePreset() {
  return {
    filters: captureFilters(),
    view: { ...state.view },
    sort: state.sort.map(e => ({ ...e })),
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

function applyFilterSnap(snap) {
  state.q = snap.q || "";
  state.type = new Set(snap.type || []);
  state.dlc = new Set(snap.dlc || []);
  state.pool = deserializePool(snap.pool);
  state.quality = new Set(snap.quality || []);
  state.favOnly = !!snap.favOnly;
  state.hateOnly = !!snap.hateOnly;
  els.q.value = state.q;
  els.favOnly.classList.toggle("on", state.favOnly);
  els.favOnly.setAttribute("aria-pressed", state.favOnly ? "true" : "false");
  els.hateOnly.classList.toggle("on", state.hateOnly);
  els.hateOnly.setAttribute("aria-pressed", state.hateOnly ? "true" : "false");
}

function applyViewSnap(snap) {
  const src = snap && typeof snap === "object" ? snap : DEFAULT_VIEW;
  for (const [k] of VIEW_TOGGLES) {
    state.view[k] = typeof src[k] === "boolean" ? src[k] : DEFAULT_VIEW[k];
  }
  syncViewChips();
}

function applySortSnap(snap) {
  state.sort = sanitizeSort(Array.isArray(snap) ? snap : []);
  syncSortChips();
}

function applyPreset(preset) {
  const p = preset || {};
  applyFilterSnap(p.filters || {});
  applyViewSnap(p.view);
  applySortSnap(p.sort);
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

function buildView() {
  for (const [key, label] of VIEW_TOGGLES) {
    const b = document.createElement("button");
    b.className = "chip view-chip";
    b.type = "button";
    b.textContent = label;
    b.dataset.viewKey = key;
    b.addEventListener("click", () => {
      state.view[key] = !state.view[key];
      syncViewChips();
      saveUI();
      render();
    });
    els.fView.appendChild(b);
  }
  syncViewChips();
}

function syncViewChips() {
  for (const b of els.fView.querySelectorAll(".view-chip")) {
    const on = !!state.view[b.dataset.viewKey];
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  }
}

function buildSort() {
  for (const [key, label] of SORT_KEYS) {
    const b = document.createElement("button");
    b.className = "chip sort-chip";
    b.type = "button";
    b.dataset.sortKey = key;
    b.dataset.label = label;
    b.addEventListener("click", () => cycleSort(key));
    els.fSort.appendChild(b);
  }
  syncSortChips();
}

function cycleSort(key) {
  const i = state.sort.findIndex(e => e.key === key);
  if (i < 0) state.sort.push({ key, dir: "asc" });
  else if (state.sort[i].dir === "asc") state.sort[i] = { key, dir: "desc" };
  else state.sort.splice(i, 1);
  syncSortChips();
  saveUI();
  render();
}

function syncSortChips() {
  for (const b of els.fSort.querySelectorAll(".sort-chip")) {
    const key = b.dataset.sortKey;
    const idx = state.sort.findIndex(e => e.key === key);
    b.classList.toggle("on", idx >= 0);
    b.replaceChildren();
    const label = document.createElement("span");
    label.textContent = b.dataset.label;
    b.appendChild(label);
    if (idx >= 0) {
      const arrow = document.createElement("span");
      arrow.className = "sort-dir";
      arrow.textContent = state.sort[idx].dir === "asc" ? "↑" : "↓";
      b.appendChild(arrow);
      const badge = document.createElement("span");
      badge.className = "sort-prio";
      badge.textContent = String(idx + 1);
      b.appendChild(badge);
    }
  }
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

function card(item, forceFull = false) {
  const v = forceFull ? DEFAULT_VIEW : state.view;
  const li = document.createElement("li");
  li.className = "card";

  const head = document.createElement("div");
  head.className = "card-head";
  if (v.showIcons && item.icon) {
    const ico = document.createElement("span");
    ico.className = "card-icon";
    ico.style.backgroundImage = `url("data/icons/${item.icon.sheet}")`;
    ico.style.backgroundPosition = `-${item.icon.x}px -${item.icon.y}px`;
    ico.style.width = `${item.icon.w}px`;
    ico.style.height = `${item.icon.h}px`;
    head.appendChild(ico);
  }
  const name = document.createElement("span");
  name.className = "card-name";
  name.textContent = item.name;
  head.appendChild(name);
  if (v.showQuality && item.quality !== null && item.quality !== undefined) {
    const q = document.createElement("span");
    q.className = "card-quality";
    q.textContent = "★".repeat(item.quality + 1);
    q.title = `Quality ${item.quality}`;
    head.appendChild(q);
  }
  if (v.showFavHate) {
    const key = favKey(item);
    const fav = document.createElement("button");
    fav.className = "fav-btn" + (state.favorites.has(key) ? " on" : "");
    fav.type = "button";
    fav.textContent = "★";
    fav.title = "Toggle favorite";
    fav.setAttribute("aria-pressed", state.favorites.has(key) ? "true" : "false");
    fav.addEventListener("click", (e) => {
      e.stopPropagation();
      if (state.favorites.has(key)) state.favorites.delete(key);
      else state.favorites.add(key);
      saveFavorites();
      fav.classList.toggle("on");
      fav.setAttribute("aria-pressed", state.favorites.has(key) ? "true" : "false");
      if (state.favOnly) render();
    });
    head.appendChild(fav);
    const hate = document.createElement("button");
    hate.className = "hate-btn" + (state.hated.has(key) ? " on" : "");
    hate.type = "button";
    hate.textContent = "💩";
    hate.title = "Toggle hated";
    hate.setAttribute("aria-pressed", state.hated.has(key) ? "true" : "false");
    hate.addEventListener("click", (e) => {
      e.stopPropagation();
      if (state.hated.has(key)) state.hated.delete(key);
      else state.hated.add(key);
      saveHated();
      hate.classList.toggle("on");
      hate.setAttribute("aria-pressed", state.hated.has(key) ? "true" : "false");
      if (state.hateOnly) render();
    });
    head.appendChild(hate);
  }
  li.appendChild(head);

  if (v.showTags) {
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
  }

  if (v.showDescription) {
    const desc = document.createElement("div");
    desc.className = "desc";
    desc.appendChild(renderDescription(item.description));
    li.appendChild(desc);
  }

  return li;
}

function tile(item) {
  const li = document.createElement("li");
  li.className = "tile";
  li.title = item.name;
  if (item.icon) {
    const ico = document.createElement("span");
    ico.className = "card-icon";
    ico.style.backgroundImage = `url("data/icons/${item.icon.sheet}")`;
    ico.style.backgroundPosition = `-${item.icon.x}px -${item.icon.y}px`;
    ico.style.width = `${item.icon.w}px`;
    ico.style.height = `${item.icon.h}px`;
    li.appendChild(ico);
  } else {
    const txt = document.createElement("span");
    txt.className = "tile-name";
    txt.textContent = item.name;
    li.appendChild(txt);
  }
  li.addEventListener("click", () => openModal(item));
  return li;
}

const TYPE_ORDER = Object.fromEntries(TYPES.map((t, i) => [t, i]));
const DLC_ORDER = Object.fromEntries(DLCS.map((d, i) => [d, i]));

function compareSort(a, b) {
  for (const { key, dir } of state.sort) {
    let cmp = 0;
    if (key === "quality") {
      const aq = a.quality, bq = b.quality;
      const aNull = aq === null || aq === undefined;
      const bNull = bq === null || bq === undefined;
      if (aNull && bNull) cmp = 0;
      else if (aNull) cmp = 1;       // nulls last regardless of direction
      else if (bNull) cmp = -1;
      else cmp = aq - bq;
      if (cmp !== 0 && !aNull && !bNull && dir === "desc") cmp = -cmp;
    } else if (key === "name") {
      cmp = a.name.localeCompare(b.name);
      if (dir === "desc") cmp = -cmp;
    } else if (key === "dlc") {
      cmp = (DLC_ORDER[a.dlc] ?? 99) - (DLC_ORDER[b.dlc] ?? 99);
      if (dir === "desc") cmp = -cmp;
    } else if (key === "type") {
      cmp = (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99);
      if (dir === "desc") cmp = -cmp;
    }
    if (cmp !== 0) return cmp;
  }
  return 0;
}

function filtered() {
  const terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
  const out = [];
  for (const it of state.items) {
    if (state.favOnly && !state.favorites.has(favKey(it))) continue;
    if (state.hateOnly && !state.hated.has(favKey(it))) continue;
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
  if (state.sort.length) out.sort(compareSort);
  return out;
}

let modalEl = null;

function openModal(item) {
  closeModal();
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.addEventListener("click", closeModal);  // any click that bubbles here closes; fav/hate stop propagation
  const wrap = document.createElement("ul");
  wrap.className = "modal-card-wrap";
  wrap.appendChild(card(item, true));
  overlay.appendChild(wrap);
  document.body.appendChild(overlay);
  modalEl = overlay;
}

function closeModal() {
  if (modalEl) {
    modalEl.remove();
    modalEl = null;
  }
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

function render() {
  const results = filtered();
  els.results.replaceChildren();
  els.results.classList.toggle("grid-tiles", state.view.iconOnly);
  const renderOne = state.view.iconOnly ? tile : card;
  const frag = document.createDocumentFragment();
  for (const it of results) frag.appendChild(renderOne(it));
  els.results.appendChild(frag);
  const total = results.length;
  els.status.textContent = total === 0
    ? "No matches."
    : `${total} match${total === 1 ? "" : "es"}.`;
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

els.hateOnly.addEventListener("click", () => {
  state.hateOnly = !state.hateOnly;
  els.hateOnly.classList.toggle("on", state.hateOnly);
  els.hateOnly.setAttribute("aria-pressed", state.hateOnly ? "true" : "false");
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
  state.presets[name] = capturePreset();
  savePresets();
  repopulatePresetSelect(name);
});

els.presetSelect.addEventListener("change", () => {
  const name = els.presetSelect.value;
  if (!name || !state.presets[name]) {
    els.presetDelete.hidden = true;
    return;
  }
  applyPreset(state.presets[name]);
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
  applyPreset({});
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
  buildView();
  buildSort();
  repopulatePresetSelect();
  if (state.favOnly) {
    els.favOnly.classList.add("on");
    els.favOnly.setAttribute("aria-pressed", "true");
  }
  if (state.hateOnly) {
    els.hateOnly.classList.add("on");
    els.hateOnly.setAttribute("aria-pressed", "true");
  }
  if (state.collapsed) {
    els.filters.classList.add("collapsed");
    els.toggleFilters.textContent = "▼";
    els.toggleFilters.title = "Show filters";
    els.toggleFilters.setAttribute("aria-pressed", "false");
  }
  render();
})();
