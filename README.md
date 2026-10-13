# GarageIQ

Personal fuel-cost and MPG dashboard for three vehicles, deployed on GitHub Pages and backed by a private Google spreadsheet.

## Current features
- Select BMW 335d, Mercedes GLS550, or Ford F-150.
- Load and preserve original Fuelly history from three MPG tabs; no re-import.
- Google OAuth and Google Sheets API remain unchanged; reconnecting after refresh is expected.
- Add fuel-ups and edit existing records in place, with a live sheet re-read before saving.
- Validate odometer sequence, date order, duplicate mileage, gallons, and fuel price.
- Calculate multi-partial-fill MPG using distance from the last complete baseline and all intervening partial gallons.
- Keep missed-fill intervals out of calculated MPG until a new baseline is established.
- Preserve historical Fuelly MPG when editing metadata only.
- Show selectable all-time, 1-year, 3-year, or 5-year ranges, rolling weighted 5/10/20-fill MPG, price and cost charts, spend and gallons, and cost per mile.
- PWA installable shell, responsive mobile controls, and editing in expandable 9-row fuel history pages.
- CSV backup export of the selected vehicle’s full loaded history (A–Q, original column order).
- Native date picker where supported, with US short-date fallback.
- GitHub Actions validates JavaScript and MPG tests before building SHA-versioned static assets and three PNG install icons.

## Data / safety
Spreadsheet ID and OAuth client ID are public identifiers, not secrets. Never add a client secret or export private spreadsheet data into this public repository.

The app reads and writes only:
- `MPG_335d`
- `MPG_GLS 550`
- `MPG_F150`

Maintenance tabs are not touched. The initial Google OAuth flow is intentional, and no Firebase or Cloudflare backend is used.

When editing older fuel-ups, subsequent historical MPG values are *not* automatically rewritten; this avoids silently changing imported records. If you change mileage/gallons of older entries, review subsequent MPG manually. Google Sheets API writes are not transactional across simultaneous clients, so a concurrency race remains possible.

The date-range filter applies to selected-vehicle metrics and charts; vehicle cards show lifetime values. Fuel cost per mile uses recorded purchases divided by recorded miles in the selected period, and therefore should be understood as a logged-data estimate, not a full vehicle ownership cost.

## Testing
Run `node --check app.js && node --check sw.js && node --check config.js && node --test tests/*.test.cjs` locally; the GitHub Pages workflow also runs these before deployment. No live Google Sheets writes are part of automated tests. A signed-in production read/edit/write and phone-browser smoke test remain owner-only and are not yet confirmed.

## Pages deployment
The `main` branch hosts the source. `.github/workflows/pages.yml` tests the code, invokes `scripts/build_pages.py`, then publishes the `_site` artifact. The generated site uses the commit SHA to version JS, CSS, favicon, and manifest assets; iOS/Android PNG icons are rendered from `icon.svg` during each build. Existing service-worker behavior does not serve a stale cached application shell.

> A complete signed-in dashboard screenshot has not been added: it requires a real browser capture after the owner connects Google, and must not expose private fuel records in a public repository.

## Later phase
Maintenance visualization and mileage-triggered reminders are deliberately not enabled.
