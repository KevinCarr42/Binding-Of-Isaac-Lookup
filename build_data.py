"""Fetch EID descriptions + pools + DLC tags + quality, merge to data/items.json.

Run whenever upstream sources change. No other moving parts.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

import requests

EID_BASE = "https://raw.githubusercontent.com/wofsauge/External-Item-Descriptions/master/descriptions"
POOLS_URL = "https://raw.githubusercontent.com/wofsauge/External-Item-Descriptions/master/features/eid_xmldata_rep%2B.lua"
RIT_URL = "https://raw.githubusercontent.com/Rchardon/RebirthItemTracker/master/items_rep.json"
TBOI_URL = "https://tboi.com/repentance"
TBOI_CSS_URL = "https://tboi.com/assets/main.css"
TBOI_IMG_BASE = "https://tboi.com/images"

OUT_PATH = Path(__file__).parent / "data" / "items.json"
RAW_DIR = Path(__file__).parent / "data" / "raw"
ICONS_DIR = Path(__file__).parent / "data" / "icons"

# div.item classes on tboi.com are <base> <position>. Base picks the spritesheet
# (and default sprite size); position picks the (x, y) within it and may
# override width/height. The per-item <p class="r-itemid">XID: N</p> identifies
# (type, id). We resolve sprites by intersecting the div's classes with the maps
# parsed out of main.css.
ITEMID_LABELS = {
    "ItemID": "collectible",
    "TrinketID": "trinket",
    "CardID": "card",
    "PillID": "pill",
}

DLC_MAP = {
    "Rebirth": "rebirth",
    "Afterbirth": "afterbirth",
    "Booster Pack #1": "afterbirth+",
    "Booster Pack #2": "afterbirth+",
    "Booster Pack #3": "afterbirth+",
    "Booster Pack #4": "afterbirth+",
    "Booster Pack #5": "afterbirth+",
    "Afterbirth+": "afterbirth+",
    "Antibirth": "repentance",
    "Repentance": "repentance",
}

# (file_path, [(anchor, item_type), ...]) — first file wins for "first folder seen"
EID_TABLES: list[tuple[str, list[tuple[str, str]]]] = [
    ("ab+/en_us.lua", [
        ("EID.descriptions[languageCode].collectibles=", "collectible"),
        ("EID.descriptions[languageCode].trinkets=", "trinket"),
        ("EID.descriptions[languageCode].cards=", "card"),
        ("EID.descriptions[languageCode].pills=", "pill"),
    ]),
    ("rep/en_us.lua", [
        ("local repCollectibles", "collectible"),
        ("local repTrinkets", "trinket"),
        ("local repCards", "card"),
        ("local repPills", "pill"),
    ]),
    ("rep+/en_us.lua", [
        ("local collectibles ", "collectible"),
        ("local trinkets ", "trinket"),
        ("local cards ", "card"),
    ]),
]

ENTRY_RE = re.compile(
    r'\{\s*"(\d+)"\s*,\s*"((?:\\.|[^"\\])*)"\s*,\s*"((?:\\.|[^"\\])*)"\s*\}'
)


@dataclass
class Item:
    id: int
    type: str
    name: str
    description: str
    first_folder: str
    quality: int | None = None
    dlc: str = "repentance"
    pools: list[str] = field(default_factory=list)
    icon: dict | None = None


def fetch(url: str, save_as: str | None = None) -> str:
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    if save_as:
        path = RAW_DIR / save_as
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(r.text, encoding="utf-8")
    return r.text


def extract_table_body(text: str, anchor: str) -> str:
    idx = text.find(anchor)
    if idx == -1:
        return ""
    brace = text.find("{", idx)
    if brace == -1:
        return ""
    depth, i, n = 0, brace, len(text)
    while i < n:
        c = text[i]
        if c == '"':
            i += 1
            while i < n:
                if text[i] == "\\":
                    i += 2
                    continue
                if text[i] == '"':
                    break
                i += 1
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return text[brace:i + 1]
        i += 1
    return text[brace:]


def unescape_lua(s: str) -> str:
    return s.replace('\\"', '"').replace("\\\\", "\\")


def parse_eid() -> dict[tuple[str, int], Item]:
    items: dict[tuple[str, int], Item] = {}
    for folder, tables in EID_TABLES:
        url = f"{EID_BASE}/{folder}"
        try:
            text = fetch(url, save_as=f"eid/{folder}")
        except requests.HTTPError as e:
            print(f"  skip {folder}: {e}")
            continue
        for anchor, item_type in tables:
            body = extract_table_body(text, anchor)
            if not body:
                continue
            count_new = 0
            count_upd = 0
            for m in ENTRY_RE.finditer(body):
                iid = int(m.group(1))
                name = unescape_lua(m.group(2))
                desc = unescape_lua(m.group(3))
                key = (item_type, iid)
                if key in items:
                    items[key].name = name
                    items[key].description = desc
                    count_upd += 1
                else:
                    items[key] = Item(
                        id=iid, type=item_type, name=name, description=desc,
                        first_folder=folder.split("/")[0],
                    )
                    count_new += 1
            print(f"  {folder} :: {item_type:11s}  +{count_new} new, {count_upd} updated")
    return items


def fetch_pools() -> dict[int, list[str]]:
    """Parse EID's auto-generated EID.XMLItemPools table.

    Structure: a list of pools, each pool a list of {itemId, weight}; pool name
    follows in a trailing Lua comment, e.g. `}}, -- treasure`. Membership only —
    weights are dropped.
    """
    text = fetch(POOLS_URL, save_as="eid_xmldata_rep+.lua")
    m = re.search(r"EID\.XMLItemPools\s*=\s*\{", text)
    if not m:
        raise RuntimeError("EID.XMLItemPools not found in pools source")
    
    start = m.end() - 1
    depth, i, n = 0, start, len(text)
    while i < n:
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                break
        i += 1
    else:
        raise RuntimeError("Unterminated EID.XMLItemPools table")
    body = text[start:end]
    
    pools: dict[int, list[str]] = {}
    i, n = 1, len(body)  # skip outer {
    while i < n:
        if body[i] != "{":
            i += 1
            continue
        d, s = 0, i
        while i < n:
            if body[i] == "{":
                d += 1
            elif body[i] == "}":
                d -= 1
                if d == 0:
                    break
            i += 1
        pool_body = body[s:i + 1]
        j = i + 1
        while j < n and body[j] in ", \t":
            j += 1
        if body[j:j + 2] == "--":
            k = body.find("\n", j)
            name = body[j + 2:k].strip()
        else:
            name = ""
        if name:
            seen: set[int] = set()
            for iid_str in re.findall(r"\{\s*(\d+)\s*,", pool_body):
                iid = int(iid_str)
                if iid in seen:
                    continue
                seen.add(iid)
                pools.setdefault(iid, []).append(name)
        i = j
    return pools


def fetch_dlc() -> dict[int, str]:
    text = fetch(RIT_URL, save_as="items_rep.json")
    data = json.loads(text)
    out: dict[int, str] = {}
    for key, val in data.items():
        try:
            iid = int(key)
        except ValueError:
            continue
        if iid < 1 or not isinstance(val, dict):
            continue
        intro = val.get("introduced_in")
        if intro in DLC_MAP:
            out[iid] = DLC_MAP[intro]
    return out


def parse_quality(html: str) -> dict[int, int]:
    out: dict[int, int] = {}
    for chunk in html.split('<div onclick=""'):
        id_m = re.search(r"ItemID:\s*(\d+)", chunk)
        q_m = re.search(r"Quality:\s*(\d+)", chunk)
        if id_m and q_m:
            out[int(id_m.group(1))] = int(q_m.group(1))
    return out


def parse_sprite_css(css: str) -> tuple[dict[str, dict], dict[str, dict]]:
    """Return (base_classes, position_classes) from tboi's main.css.

    base_classes: cls -> {sheet, w, h} — picks which spritesheet and default size
    position_classes: cls -> {x, y, w?, h?} — picks crop within a sheet
    """
    bases: dict[str, dict] = {}
    base_re = re.compile(
        r"\.([a-z][a-z0-9-]+)\{([^}]*background:url\(\"?\.\./images/([^)\"]+\.png)\"?\)[^}]*)\}"
    )
    for m in base_re.finditer(css):
        cls, body, sheet = m.group(1), m.group(2), m.group(3)
        w = int(wm.group(1)) if (wm := re.search(r"width:(\d+)px", body)) else None
        h = int(hm.group(1)) if (hm := re.search(r"height:(\d+)px", body)) else None
        bases[cls] = {"sheet": sheet, "w": w, "h": h}

    positions: dict[str, dict] = {}
    pos_re = re.compile(
        r"\.([a-z][a-z0-9-]+)\{([^}]*background-position:(-?\d+)(?:px)?\s+(-?\d+)(?:px)?[^}]*)\}"
    )
    for m in pos_re.finditer(css):
        cls, body, x, y = m.group(1), m.group(2), int(m.group(3)), int(m.group(4))
        rec: dict = {"x": -x, "y": -y}  # CSS uses negative offsets; flip to crop origin
        if wm := re.search(r"width:(\d+)(?:px)?(?=[;}]|$)", body):
            rec["w"] = int(wm.group(1))
        if hm := re.search(r"height:(\d+)(?:px)?(?=[;}]|$)", body):
            rec["h"] = int(hm.group(1))
        positions[cls] = rec
    return bases, positions


ICON_LI_RE = re.compile(
    r'<li[^>]*>\s*<a>\s*<div onclick="" class="([^"]+)"></div>\s*<span>\s*'
    r'<p class="item-title">[^<]*</p>\s*'
    r'<p class="r-itemid">(ItemID|TrinketID|CardID|PillID):\s*(\d+)</p>',
    re.DOTALL,
)


def parse_icons(html: str, css: str) -> dict[tuple[str, int], dict]:
    bases, positions = parse_sprite_css(css)
    out: dict[tuple[str, int], dict] = {}
    miss_base = miss_pos = 0
    for m in ICON_LI_RE.finditer(html):
        classes = m.group(1).split()
        item_type = ITEMID_LABELS[m.group(2)]
        iid = int(m.group(3))
        # Browser-style cascade: when a div carries multiple base classes
        # (e.g. "rep-item rep-trink" on Repentance trinkets), the last one in
        # the class list wins — same as CSS source order on tboi.com.
        base = next((c for c in reversed(classes) if c in bases), None)
        pos = next((c for c in classes if c in positions), None)
        if base is None:
            miss_base += 1
            continue
        if pos is None:
            miss_pos += 1
            continue
        b, p = bases[base], positions[pos]
        out[(item_type, iid)] = {
            "sheet": b["sheet"],
            "x": p["x"],
            "y": p["y"],
            "w": p.get("w") or b["w"],
            "h": p.get("h") or b["h"],
        }
    if miss_base or miss_pos:
        print(f"  warn: {miss_base} items missing base class, {miss_pos} missing position")
    return out


def download_sheets(sheets: set[str]) -> None:
    ICONS_DIR.mkdir(parents=True, exist_ok=True)
    for name in sorted(sheets):
        path = ICONS_DIR / name
        if path.exists():
            continue
        r = requests.get(f"{TBOI_IMG_BASE}/{name}", timeout=30)
        r.raise_for_status()
        path.write_bytes(r.content)
        print(f"  downloaded {name} ({len(r.content):,} bytes)")


def dlc_for_item(item: Item, rit_dlc: dict[int, str]) -> str:
    if item.type == "collectible" and item.id in rit_dlc:
        return rit_dlc[item.id]
    if item.first_folder == "ab+":
        return "afterbirth+"
    return "repentance"


def main() -> None:
    print("Fetching EID Lua descriptions...")
    items = parse_eid()
    print(f"  total: {len(items)} items")
    
    print("Fetching item pools...")
    pools = fetch_pools()
    print(f"  {len(pools)} collectibles assigned to pools")
    
    print("Fetching DLC tags (RebirthItemTracker)...")
    rit_dlc = fetch_dlc()
    print(f"  {len(rit_dlc)} DLC-tagged entries from RIT")
    
    print("Fetching tboi.com page...")
    tboi_html = fetch(TBOI_URL, save_as="tboi_repentance.html")
    quality = parse_quality(tboi_html)
    print(f"  {len(quality)} quality entries scraped")

    print("Fetching tboi.com sprite stylesheet...")
    tboi_css = fetch(TBOI_CSS_URL, save_as="tboi_main.css")
    icons = parse_icons(tboi_html, tboi_css)
    print(f"  {len(icons)} item icons mapped")

    print("Downloading sprite sheets...")
    download_sheets({rec["sheet"] for rec in icons.values()})

    by_type: dict[str, int] = {}
    output: list[dict] = []
    for item in sorted(items.values(), key=lambda x: (x.type, x.id)):
        if not item.name:
            continue  # EID placeholder for removed/unused IDs
        if item.type == "collectible":
            item.pools = pools.get(item.id, [])
            item.quality = quality.get(item.id)
        item.dlc = dlc_for_item(item, rit_dlc)
        item.icon = icons.get((item.type, item.id))
        by_type[item.type] = by_type.get(item.type, 0) + 1
        output.append({
            "id": item.id,
            "type": item.type,
            "name": item.name,
            "description": item.description,
            "quality": item.quality,
            "dlc": item.dlc,
            "pools": item.pools,
            "icon": item.icon,
        })
    
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    
    print()
    print(f"Wrote {OUT_PATH} ({OUT_PATH.stat().st_size:,} bytes)")
    for t, n in sorted(by_type.items()):
        print(f"  {t:12s} {n}")


if __name__ == "__main__":
    main()
