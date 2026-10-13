# GarageIQ — Persistent Google Login (GitHub Pages stays the host)

This replaces the unreliable browser-only Google Sheets OAuth with a **durable Firebase login** plus a tiny, private, authenticated Cloudflare Worker. **The site remains https://mefferso.github.io/GrarageIQ/** and your Google Sheet remains the only data store.

## Why this is necessary
Google's browser OAuth token client does not issue browser refresh tokens and cannot promise silent renewal across reloads. A GitHub Secret cannot fix browser OAuth. Firebase Authentication persists a Google **sign-in session**, while a Worker uses a restricted service account to access the spreadsheet safely. No Sheets OAuth popup per refresh.

**Cost:** Firebase Authentication (Google provider) supports the no-cost Spark tier; Cloudflare Workers Free supports 100,000 requests per day. Neither requires upgrading to Firebase Blaze / Cloud Functions. Deploying the Worker and completing the setup must be done by the account owner; no one should paste Google private keys into ChatGPT or GitHub.

## 1. Enable Firebase Authentication (Google)
1. Visit https://console.firebase.google.com/ → **Add project** → choose **your existing GarageIQ Google Cloud project**.
2. Keep the **Spark (free)** plan.
3. Firebase console → **Build → Authentication → Get started**.
4. **Sign-in method → Google → Enable**, set project support email, and Save.
5. **Authentication → Settings → Authorized domains** → add `mefferso.github.io` (bare domain, no https:// or path).
6. Project settings (gear) → General → **Your apps → Add app (Web </>)**, nickname **GarageIQ**. **Do not choose Firebase Hosting**.
7. Copy only these public web-config values: `apiKey`, `authDomain`, `projectId`, `appId` (never any client secret or service account key).
8. Edit `config.js` in GitHub and fill `firebaseConfig` with those values; keep `workerApiUrl` blank for now.

> Firebase Google sign-in persists locally and automatically refreshes Firebase ID tokens. A deliberately chosen **Sign out** button will end the session; browser storage clearing/privacy mode can also end it.

## 2. Create a service account ONLY for your existing maintenance spreadsheet
1. https://console.cloud.google.com/iam-admin/serviceaccounts (select the **GarageIQ** Google project).
2. **Create service account** → name `garageiq-sheets`. Grant no project-wide roles. Finish.
3. Copy its generated email (ending `.iam.gserviceaccount.com`).
4. Open **Car Maintenance records** → Share → grant **Editor** access to that specific service account email. This is the only spreadsheet it needs.
5. On the service-account details → Keys → Add key → Create new key → **JSON**. Save the JSON file privately. **Never put the JSON or private key into this repository or a chat.** If org policy forbids keys, use a keyless backend such as Google Cloud Run instead.
6. The Sheets API is already enabled in your project.

## 3. Create the free Cloudflare Worker from this repo
1. Sign up/sign in at https://dash.cloudflare.com/ (Workers Free plan).
2. Go to **Workers & Pages → Create → Import a repository** (or **Connect to Git**) and authorize access to **mefferso/GrarageIQ**.
3. Select repo and deploy using the root `wrangler.toml` (Worker script: `worker/index.js`). If prompted for a deploy command, use `npx wrangler deploy`. This is a **Worker deployment**, not Cloudflare Pages hosting. Your actual website stays on GitHub Pages.
4. In Worker **Settings → Variables and Secrets**, configure:
   - `FIREBASE_PROJECT_ID` (plain text) — Firebase Project ID
   - `ALLOWED_EMAIL` (plain text) — your **exact Gmail address** that signs into Firebase
   - `SPREADSHEET_ID` (plain text) — your existing sheet ID
   - `GOOGLE_SERVICE_ACCOUNT_JSON` (**Secret / encrypted**) — paste the **entire** JSON contents from step 2 into Cloudflare's encrypted secret editor. **Never store this in GitHub.**
5. Deploy/activate the updated Worker settings.
6. Open `https://YOUR-WORKER.workers.dev/api/health`. You should get `{"ok":true,"configured":true}`. Health does not expose private data. If false, check Worker vars.
7. Note your `https://YOUR-WORKER.workers.dev` base URL.

## 4. Switch the GarageIQ website over
In `config.js`, set:
```js
window.GARAGEIQ_CONFIG = {
  googleClientId: "existing legacy client ID", // safe to leave during migration
  spreadsheetId: "existing sheet ID",
  workerApiUrl: "https://YOUR-WORKER.workers.dev",
  firebaseConfig: {
    apiKey: "FIREBASE_WEB_API_KEY",
    authDomain: "YOUR-PROJECT.firebaseapp.com",
    projectId: "YOUR-PROJECT-ID",
    appId: "1:...:web:..."
  }
};
```
Only the values above are **public identifiers**. These are not secrets. Once all are nonempty, the website automatically activates the Firebase/Worker mode. Until then, legacy Google Sheets OAuth remains in place.

1. Visit https://mefferso.github.io/GrarageIQ/ and click **Connect Google** just once.
2. Your login should restore after a normal reload or browser restart.
3. Open the same site on your iPhone and sign in once there, too (sessions are per device/browser).
4. Try recording one **real** fill-up; the Worker should append to exactly the matching MPG tab. Do not use a fake odometer entry in the production Sheet.
5. A logged-out user cannot fetch data. The Worker verifies Firebase JWT signature, issuer, audience, expiration, and the allowlisted verified email on every data request, then uses only its own service-account access to Google Sheets.

## Important security and operational notes
- The repository and GitHub Pages site are public. The private Google Sheet is **never embedded in GitHub source**, and must stay unshared publicly.
- The Worker contains no secret literals in the source. The service-account JSON lives **only as a Cloudflare Worker encrypted secret**.
- Cloudflare Worker has CORS restricted to `https://mefferso.github.io`; importantly, **JWT validation + Gmail allowlisting** is what actually secures data access.
- The worker has write access only to Google files explicitly shared with the service account. Keep it dedicated to this task.
- Firebase holds a locally persistent sign-in session. If you're on someone else's computer, click Sign out.
- Google Sheets calls happen only through the Worker in persistent mode. It does not require the user to grant the full Sheets OAuth scope.
- Do not publish a service-account private JSON file or Google client secret; rotate/revoke promptly if exposed.
- This project has no browser offline write queue. Do not expect edits to sync without an internet connection.
- For a clean cutover, after successful live testing, remove the legacy Google OAuth code and Client ID.

## Troubleshooting
- `configured:false`: Worker variable/secret missing.
- **Firebase auth/unauthorized-domain**: add `mefferso.github.io` under Firebase Authentication authorized domains.
- **Worker "not allowed"**: `ALLOWED_EMAIL` must exactly match the Google account selected in Firebase.
- **Sheets 403**: share the actual spreadsheet with the **service account email** as Editor; verify Sheets API enabled.
- **Login works but data empty**: check the three exact MPG sheet names `MPG_335d`, `MPG_GLS 550`, `MPG_F150`.
- **Cleared cookies/local storage or Private mode**: sign in again. A normal refresh should never require a Google Sheets consent popup.
