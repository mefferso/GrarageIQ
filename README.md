# GarageIQ
Progressive web app for fuel economy analytics backed by your existing private Google Sheet.

## New: Persistent Google login

The Firebase Authentication and secure Cloudflare Worker implementation is committed, but not activated until the account-owner setup is complete. See [PERSISTENT_LOGIN_SETUP.md](./PERSISTENT_LOGIN_SETUP.md). GarageIQ remains hosted on GitHub Pages. Until configured, the original Sheets OAuth connection stays usable.

## Implemented
- BMW 335d, GLS550, and F-150 individual dashboards
- Live charts, recent fill-ups, cost, and weighted MPG
- New fill-up form with date, odometer, gallons, price, notes, and partial/missed flags
- Official Google Sheets API for reading and appending to existing MPG tabs
- Google OAuth access tokens only in memory; no private fuel records in this public repository
- Installable PWA shell; online connection required for reading/saving records

## One-time setup (required)
1. Open https://console.cloud.google.com/ and create/select a Google Cloud project.
2. Enable **Google Sheets API** under APIs & Services → Library.
3. Configure Google Auth Platform / OAuth consent screen. External + Testing is sufficient for personal use. Add your own Google account as a test user; authorize Google Sheets scope.
4. Create an **OAuth Client ID**, type **Web application**.
5. Add Authorized JavaScript origin **https://mefferso.github.io** (origin only, no repository path).
6. Copy the **client ID** (not a client secret!) into `config.js` under `googleClientId` and commit the change. Client IDs are public and safe in client-side code.
7. GitHub repository → **Settings → Pages** → Deploy from a branch → **main** → **/(root)** → Save.
8. Visit https://mefferso.github.io/GrarageIQ/ , press Connect Google, choose the Google account with editing rights on the sheet, and approve.

OAuth uses the Sheets scope to modify your private spreadsheet, but it does *not* make your sheet public. The Google account determines who can read/write.

## Data mappings
The configured Google spreadsheet holds the original Fuelly 17-column schema. GarageIQ only accesses MPG_335d, MPG_GLS 550 and MPG_F150. Maintenance tabs are untouched.

Price is per gallon. Fuel cost = gallons × price. A complete fill-up estimates MPG from miles since the previous odometer divided by gallons. Partial/missed entries get zero MPG and are excluded from trend averages. Weighted average MPG uses recorded miles and gallons for valid full fuel-ups. We will improve multi-partial-fill calculations in a later version.

Dates are saved as ISO text, preserving the spreadsheet date format. Records append to the existing sheet, with a live mileage/duplicate pre-check. Concurrent same-time entries are not transactionally locked.

This PWA caches its user interface but does **not** cache personal fuel records or support offline writes yet.

## Next
- Improve tank segment logic for partial fills.
- Add historical correction/editing UI.
- Add separate mileage-based Google Apps Script maintenance alerts.
