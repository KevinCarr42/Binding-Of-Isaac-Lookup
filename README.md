# Isaac Item Lookup

[Check it out in your browser!](https://kevincarr42.github.io/Binding-Of-Isaac-Lookup/)

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

## Mobile & installable app (PWA)

The page is a Progressive Web App, so it can run like a native app on a phone.

- **Install it** — open the site in Chrome/Brave on Android, expand the filters
  (▼) and tap **⤓ Install app**. (The button only appears once the browser
  considers the page installable. The browser's own automatic install prompt is
  suppressed so installing is always opt-in.) Launching from the home-screen
  icon opens it in standalone mode with a black status bar that keeps the search
  bar clear of the camera/bezel.
- **Fullscreen (in-browser only)** — a `⛶` button in the search row toggles
  true fullscreen via the Fullscreen API (Android Chrome/Brave have no built-in
  menu option for this). While active it moves next to the Sort controls as an
  "Exit Fullscreen" button. The installed app hides this button — it's already
  chrome-light, so it isn't needed.
- **Zoom** — the **Zoom** control (`−` / `+` / Reset, 50–200%) scales the
  results and re-wraps the layout to fit, instead of cropping at the screen edge
  like browser pinch-zoom. The level is remembered.
- **Updates & offline** — a service worker (`sw.js`) caches everything for
  offline use. The page itself is fetched network-first, so content updates show
  on the next load when online; static assets refresh in the background. Note
  that manifest-level changes (status-bar color, display mode) only take effect
  after uninstalling and reinstalling the app.

## Refresh the data

```
pip install -r requirements.txt
python build_data.py
```

Pulls fresh EID descriptions, item pools, DLC tags, and quality ratings from
their respective upstream sources and rewrites `data/items.json`. Run this
whenever EID releases a content update.

## Files

| File                     | Purpose                                          |
|--------------------------|--------------------------------------------------|
| `index.html`             | Page shell                                       |
| `style.css`              | Dark theme, responsive grid                      |
| `app.js`                 | Search, filters, rendering, PWA/fullscreen/zoom  |
| `data/items.json`        | Generated dataset (1000+ items)                  |
| `build_data.py`          | One-shot pipeline that rebuilds `items.json`     |
| `manifest.webmanifest`   | PWA metadata (install, icon, standalone display) |
| `sw.js`                  | Service worker — offline cache + update strategy |
| `icon.svg`               | App / home-screen icon                           |
| `tests/`                 | Throwaway Playwright check scripts (not deployed) |

## Data sources

- Descriptions: [wofsauge/External-Item-Descriptions](https://github.com/wofsauge/External-Item-Descriptions)
- Item pools: [mzmmmm/Isaac_Repentance_Seed_Calculator](https://github.com/mzmmmm/Isaac_Repentance_Seed_Calculator)
- DLC tags: [Rchardon/RebirthItemTracker](https://github.com/Rchardon/RebirthItemTracker)
- Quality ratings: scraped from [tboi.com/repentance](https://tboi.com/repentance)
