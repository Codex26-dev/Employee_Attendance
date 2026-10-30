# Rushabh Workday PWA

This folder is a static, installable launcher for the private Google Sheets connected Rushabh Workday app. It needs no paid static hosting, application server, or special attendance hardware.

## Connected workspace

- The site root (`index.html`) and installed PWA open the connected workspace. Choose **Open connected workspace** and sign in with the registered work email and email OTP.
- The connected workspace is hosted by Google Apps Script and writes attendance and progress to the configured Google Sheet. Anyone with the connected workspace link can open the OTP screen; only active employee emails in the Employees sheet can receive a code. The Apps Script deployment audience is configured as anonymous link access, so keep the employee allowlist current.
- Attendance writes are checked server-side against the configured time window, location accuracy, and 150 m geofence. Progress reports and the manager dashboard are available after sign-in.
- A network connection is needed for sign-in and Sheet sync. The PWA caches its small launcher shell only; it does not cache Sheet rows, OTPs, or work records.

## Public static hosting

The static files in this folder are ready to publish as the root of a public GitHub Pages repository. The repository contains the launcher and front-end source, including the Apps Script deployment URL, but no Sheet rows, employee email list, OTPs, or Script Properties. Keep the Apps Script deployment audience restricted as configured; do not add Sheet data or authentication secrets to this repository.

To host without a paid server:

1. Create a public GitHub repository and copy the contents of this folder to its root.
2. In repository **Settings → Pages**, publish from the `main` branch and `/ (root)`.
3. Open the generated HTTPS site on the phone. Use the browser's **Install app** or **Add to Home Screen** action.

GitHub Pages is static hosting. The Google Apps Script deployment remains the backend and data access layer.

## Local-only screens

`lite.html` remains a personal, device-only version. It saves to that browser's local storage and does not sync to Sheets. Use the site root or `connected.html` for the company workspace. Never treat local-only entries as official attendance or reports.

## Files

- `index.html` — routes the site root to the connected workspace
- `connected.html`, `connected.css` — connected-workspace PWA launcher
- `manifest.webmanifest` — install metadata; launches the connected workspace
- `sw.js` — caches the static shell only
- `lite.html`, `app.js`, `app.css` — legacy personal local-only screen
- `assets/app-icon.svg` — app icon
## Phone reminders (Firebase Cloud Messaging)

Employee phone reminders use Firebase Cloud Messaging (FCM). Managers can send check-in, check-out, daily report, and schedule reminders from Team dashboard. Employees register each phone from My day → Enable phone reminders. If a device has not registered, manager reminders fall back to email.

FCM still needs Firebase project setup and a one-time Apps Script owner authorization. Set Script Properties `FCM_PROJECT_ID` and `PUSH_SETUP_URL`; populate the public Firebase web config and VAPID key in `push-config.js`; enable Firebase Cloud Messaging API and grant the Apps Script owner the Firebase Cloud Messaging Admin role. In Apps Script, run `authorizePushNotifications` once as the owner, then push source and deploy a new web app version. Never put service-account private keys or OAuth tokens in GitHub.
