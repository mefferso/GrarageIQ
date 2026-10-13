// PUBLIC configuration only. OAuth Client IDs are intentionally public identifiers.
// Follow README.md to create a Google OAuth web client and paste its Client ID below.
// NEVER put a Google client secret, private key, Apps Script secret, or service-account key here.
window.GARAGEIQ_CONFIG = {
  googleClientId: "955576856989-m7i76k8286v64nup1dcmtdl2rkf93b8r.apps.googleusercontent.com",
  spreadsheetId: "1-8WtnxqP_FGZtWXFut6OV4fU5IrhMefzfU6obzW-3PM",
  // Persistent auth is activated only once both settings below are configured.
  workerApiUrl: "", // e.g. https://garageiq-api.YOUR-SUBDOMAIN.workers.dev
  firebaseConfig: { apiKey:"", authDomain:"", projectId:"", appId:"" }
};
