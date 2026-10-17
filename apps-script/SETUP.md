# Connected manager and attendance app

This is a Google Apps Script HtmlService web app bound to the supplied workbook. It reads the existing `Employees`, `Report_Data`, and `GPS_Attendance` tabs and appends new app entries to `App_Attendance`, `App_Progress`, and (on first schedule) `App_Schedule`. It uses Google Apps Script `MailApp` for email OTP; it needs no MSG91 credentials. It does not run or merge the package's legacy setup functions and does not clear existing tabs.

## Deploy

1. The bound project is live at `https://script.google.com/macros/s/AKfycbycroZZeGiM-rll2ItTlryk2ZB7C2WMgze4mx7ZW5ccJDKnWofuI7fsDxhOMJIc54H6/exec`, deployed as Version 7 on Oct 17, 2026. It executes as the owner and requires a signed-in Google account. OTP is still limited to an active employee email. For a fresh setup, use a separate project and add `Code.gs`, `App.html`, `Styles.html`, and `Client.html` from this folder. Do not paste into the legacy candidate project.
2. In Apps Script **Project Settings → Script properties**, add the values below. Keep provider keys here; never put them in HTML or a spreadsheet cell.
3. The bound project timezone is set to India Standard Time (Kolkata). Its attendance windows are configured as 08:30–11:00 and 17:30–23:00, geofence radius 150 m, max location accuracy 100 m. Set `OFFICE_LATITUDE` and `OFFICE_LONGITUDE` to the actual office/site center before attendance can succeed.
4. Run `setupConnectedAppSheets` once from the editor and authorize the project. It creates two app-specific tabs if absent. If either tab already exists with different headers, it stops without changing it.
5. For a fresh team deployment, use **Deploy → New deployment → Web app**, execute as the project owner, and require Google-account access. Do not choose anonymous `Anyone` access for a team workspace.

## Try the interface now

Open `Preview.html` in a desktop browser. Sign in as `manager@rushabh.demo` with preview code `246810` to inspect the dashboard, manager employee picker, and report history. Sign in as `rohan@rushabh.demo` with the same code to see the employee flow. Preview data is in memory only; it sends no email, requests no real GPS, and does not write to Sheets. Use the Apps Script deployment above for real email OTP and Sheet writes.

### Required Script Properties

| Property | Example | Notes |
|---|---:|---|
| `OFFICE_LATITUDE` | `19.0760` | Office center latitude |
| `OFFICE_LONGITUDE` | `72.8777` | Office center longitude |
| `GEOFENCE_RADIUS_METERS` | `150` | Maximum allowed distance |
| `MAX_LOCATION_ACCURACY_METERS` | `100` | Reject less precise browser readings |
| `CHECKIN_START` | `08:30` | Local server time, inclusive |
| `CHECKIN_END` | `11:00` | Local server time, inclusive |
| `CHECKOUT_START` | `17:30` | Local server time, inclusive |
| `CHECKOUT_END` | `23:00` | Local server time, inclusive |

The deployment needs an `Employees` sheet with `Employee Name`, `Employee ID`, a unique `Email` or `Email (optional, for reminders)` column, and `Designation` (or `Role`). The package already has name, ID, designation, and an optional email column; fill each active employee's email. Mobile number is no longer required. `Active` or `Status` and `Start Date` / `End Date` columns are optional. Manager designation must equal `Manager` or `Admin` (case-insensitive); all other users get employee access. The manager picker includes historical employee rows if the ID and name exist.

For a public source copy, set `SS_ID` in Script Properties to your spreadsheet ID; the ID is omitted from this repository copy. Its `Settings → Manager Email` value is accepted for the single manager row when that row has no email filled in. For multiple managers, put each manager's email in their own Employees row to keep the account mapping unambiguous. On the live workbook, add staff addresses in `Employees` column F (`Email (optional, for reminders)`) and set managers' column C Designation to `Manager` or `Admin`.

## What it does

- Employees receive email OTP via `MailApp`, and the server resolves identity from the verified email. The browser cannot supply an employee ID for attendance or personal progress writes.
- Check-in and check-out request GPS only when the employee taps the button. The server checks the configured time window, location accuracy, and geofence, then appends a timestamped row. It enforces one check-in and one check-out per employee per local work date.
- Daily progress is append-only in `App_Progress`.
- Managers get team-wide daily counts for check-ins, reports, and blocked reports, plus employee rows and selectable date-range detail. The view combines app attendance/progress with matching legacy `GPS_Attendance` and `Report_Data` rows when those tabs exist, matched by employee ID. Historical detail is read-only.
- Managers can assign shifts for active employees and review the next 60 days of team schedules. Employees see only their own upcoming schedules. The first saved shift creates `App_Schedule`.
- Managers can set the office geofence from **Team view → Attendance fence**, either capturing the current device GPS after tapping the button or entering coordinates manually. Saving updates `OFFICE_LATITUDE`, `OFFICE_LONGITUDE`, and `GEOFENCE_RADIUS_METERS` in Script Properties immediately; the next punch uses them. The GPS-accuracy threshold and attendance windows remain in Script Properties.
- The installable static PWA in `../app/` opens this connected Apps Script workspace directly through `connected.html`. The Apps Script page is the authenticated application and writes to Sheets; the static PWA does not copy, cache, or synchronize employee data itself. The legacy `index.html` and `lite.html` screens remain device-only personal logs and must not be used as official attendance or progress reports.

## Cost, quota, and limits

Apps Script and Sheets may be usable within Google's free account quotas, but quotas and availability are controlled by Google and can change. This project has no dedicated server. Email delivery is subject to the deploying Google account's `MailApp` recipient quota (currently 100/day for consumer accounts and 1,500/day for Workspace accounts); Google can change these limits. Email OTP verifies the mailbox, not the employee's phone number.

Apps Script CacheService is used for short-lived OTP-attempt counters and six-hour sessions. Cache entries can be evicted, so this is a lightweight internal deployment, not a durable authentication system. There is no IP/device abuse control here. Use a restricted deployment audience, keep the employee list current, and rotate exposed provider credentials. Geo checks are a practical attendance signal, not proof against mocked device location.

The app does not live-track employees or send background arrival/exit alerts. Browser location is requested only when the manager taps the fence GPS button or an employee taps an attendance action. Background geofencing needs native Android background-location access; it is not provided by this PWA.

## References

- [Apps Script web apps](https://developers.google.com/apps-script/guides/web)
- [HTML Service client/server calls](https://developers.google.com/apps-script/guides/html/communication)
- [HTML Service restrictions](https://developers.google.com/apps-script/guides/html/restrictions)




## Live schedule workflow

The deployed app includes an employee My schedule view plus manager shift assignment and team schedule list. The schedule handlers require an authenticated session; only manager/admin users can create and list team schedules, and each employee can read their own upcoming schedules. A manager login is required for end-to-end UI testing; no test schedule is written automatically.

The productivity workflows use `App_Tasks` and `App_Requests`, created on first use without clearing data. Managers assign tasks with priority and due date; employees update task status and notes. Leave requests are manager-approved records. A one-day shift-change request updates the employee's one matching schedule row only when approved; a missing or duplicate match blocks approval. Weekly team reporting is available in Team view. Managers can enable a daily 6 PM scheduled-team exception digest and Monday 8 AM weekly report; Apps Script triggers and mail use the deploying account's quotas and project time zone. Daily digests exclude approved leave and require assigned schedules to identify expected attendance.

