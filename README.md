# Isaac Item Lookup

A static single-page app for looking up Binding of Isaac items, trinkets, cards,
and pills while playing on a platform without mods (e.g., PlayStation). Source
data comes from the External Item Descriptions (EID) Steam Workshop mod.

## Use it

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>. Type in the search bar; toggle the filter
chips (Type / DLC / Quality / Pool) to narrow down. Filters within a group
are OR, across groups are AND.

Fully offline-capable once loaded — `data/items.json` is bundled.

## Refresh the data

```
pip install -r requirements.txt
python build_data.py
```

Pulls fresh EID descriptions, item pools, DLC tags, and quality ratings from
their respective upstream sources and rewrites `data/items.json`. Run this
whenever EID releases a content update.

## Files

| File              | Purpose                                          |
|-------------------|--------------------------------------------------|
| `index.html`      | Page shell                                       |
| `style.css`       | Dark theme, responsive grid                      |
| `app.js`          | Search, filters, rendering                       |
| `data/items.json` | Generated dataset (1000+ items)                  |
| `build_data.py`   | One-shot pipeline that rebuilds `items.json`     |

## Data sources

- Descriptions: [wofsauge/External-Item-Descriptions](https://github.com/wofsauge/External-Item-Descriptions)
- Item pools: [mzmmmm/Isaac_Repentance_Seed_Calculator](https://github.com/mzmmmm/Isaac_Repentance_Seed_Calculator)
- DLC tags: [Rchardon/RebirthItemTracker](https://github.com/Rchardon/RebirthItemTracker)
- Quality ratings: scraped from [tboi.com/repentance](https://tboi.com/repentance)
