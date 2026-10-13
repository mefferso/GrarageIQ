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
- PWA installable shell, responsive mobile controls, and editing in recent-fill history.

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
Source was syntax-checked and calculation cases exercised without touching spreadsheet data. A signed-in production read/edit/write and phone/browser smoke test remain necessary before considering the new workflow fully verified.

## Later phase
Maintenance visualization and mileage-triggered reminders are deliberately not enabled.
