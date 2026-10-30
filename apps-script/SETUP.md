# Connected manager and attendance app

This is a Google Apps Script HtmlService web app bound to the supplied workbook. It reads the existing employee/report tabs and writes app attendance, progress, schedules, and `AMC_Reports`. AMC PDFs and signature/stamp images are kept in the script owner's private Google Drive folder `Rushabh Workday AMC Reports`. It uses Google Apps Script services for email OTP, Sheets, Drive, and Docs; it needs no paid OTP or server service. It does not run or merge the package's legacy setup functions and does not clear existing tabs.

## Deploy

1. The bound project is live at `https://script.google.com/macros/s/AKfycbycroZZeGiM-rll2ItTlryk2ZB7C2WMgze4mx7ZW5ccJDKnWofuI7fsDxhOMJIc54H6/exec`. It executes as the owner and allows anyone with the link to reach the sign-in page; no Google sign-in is required, but the email must be registered and active in Employees to receive an OTP. App data and actions require email OTP for an active employee listed in the Employees sheet; manager-only actions also require Manager or Admin role. For a fresh setup, use a separate project and add `Code.gs`, `App.html`, `Styles.html`, and `Client.html` from this folder. Do not paste into the legacy candidate project.
2. In Apps Script **Project Settings → Script properties**, add the values below. Keep provider keys here; never put them in HTML or a spreadsheet cell.
3. The bound project timezone is India Standard Time (Kolkata). Check-in may use the configured check-in window. Check-out has no time-window restriction; it is recorded after the employee submits the daily report. GPS and geofence readings are optional/advisory. Set office coordinates if you want location status captured.
4. Run `setupConnectedAppSheets_` once from the editor and authorize the project. It creates `App_Attendance`, `App_Progress`, and `AMC_Reports` if absent. It does not clear existing tabs.
5. After adding the Google Drive and Google Docs scopes, run `authorizeAmcServices_` once from the Apps Script editor as the deploying account and approve the Google consent screen. This creates the private AMC folder and moves a temporary authorization document to Trash. The first AMC PDF save will fail until this one-time owner authorization is complete. Employees can preview their own PDF in the app; managers can see the team AMC report list. The PDF contains the server timestamp, selected site/product/visit details, inspection checks, technician signature, optional customer signature, stamp photo, and optional GPS.
6. For a fresh team deployment, use **Deploy → New deployment → Web app**, execute as the project owner, and set access to **Anyone** (including users not signed into Google). This only exposes the OTP entrypoint. Keep employee access controlled by active emails in the Employees sheet and manager roles in that sheet. If Google Workspace blocks anonymous deployments, the Workspace admin must permit external web apps or the app must be deployed from an account that allows them.

## Where information is stored

- Work records are saved in the connected Google Sheet, not just on the phone: `App_Attendance`, `App_Progress`, `App_Schedule`, `App_Tasks`, and `App_Requests`. First use creates the app-specific tabs without clearing existing data. Task completion location is stored in extra columns in `App_Tasks` when the employee allows GPS.
- Sign-in, sign-out, and other audited events are appended to `App_Activity_Log`; active session token hashes are in `App_Sessions`. The browser keeps the session token locally so refresh does not sign the employee out, plus the last-open section. It does not locally store the team's work history.
- Signed AMC PDFs and their embedded signature/stamp images are stored in the Apps Script owner's private Google Drive folder `Rushabh Workday AMC Reports`. AMC visit metadata is also saved in `AMC_Reports` in the connected Sheet.
- AMC PDF page layout is built in `Code.gs` by `applyAmcDocumentLayout_`. Optional Script Properties `AMC_COMPANY_NAME`, `AMC_COMPANY_ADDRESS`, `AMC_COMPANY_CONTACT`, and `AMC_REPORT_FOOTER` customize the repeating header and footer; leave them unset to use the defaults. Product, branch, visit number, signatures, stamp, and GPS remain report data entered by the employee.
- The app reads employee roster/settings and can include matching older `GPS_Attendance` and `Report_Data` rows in manager history. Those existing tabs are not replaced. The installable PWA caches only its static app shell; it does not cache employee records or sync work offline.

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
| `CHECKOUT_START` | *(unused)* | Checkout is allowed any time after check-in and daily-report submission. |
| `CHECKOUT_END` | *(unused)* | Checkout is allowed any time after check-in and daily-report submission. |

The maintenance helpers ending in `_` are intentionally hidden from browser calls; run them only from the Apps Script editor. The deployment needs an `Employees` sheet with `Employee Name`, `Employee ID`, a unique `Email` or `Email (optional, for reminders)` column, and `Designation` (or `Role`). The package already has name, ID, designation, and an optional email column; fill each active employee's email. Mobile number is no longer required. `Active` or `Status` and `Start Date` / `End Date` columns are optional. Manager designation must equal `Manager` or `Admin` (case-insensitive); all other users get employee access. The manager picker includes historical employee rows if the ID and name exist.

For a public source copy, set `SS_ID` in Script Properties to your spreadsheet ID; the ID is omitted from this repository copy. Its `Settings → Manager Email` value is accepted for the single manager row when that row has no email filled in. For multiple managers, put each manager's email in their own Employees row to keep the account mapping unambiguous. On the live workbook, add staff addresses in `Employees` column F (`Email (optional, for reminders)`) and set managers' column C Designation to `Manager` or `Admin`.

## What it does

- Employees receive email OTP via `MailApp`, and the server resolves identity from the verified email. The browser cannot supply an employee ID for attendance or personal progress writes.
- Check-in requests GPS only when the employee taps the button; GPS is optional and geofence/accuracy are advisory. Check-in may honor its configured time window. After check-in, the app opens the employee's schedule. Checkout may be initiated any time after check-in; it opens a daily-report dialog and saves the report and checkout together after submission. One check-in and one checkout are allowed per employee per local work date.
- Daily progress is append-only in `App_Progress`.
- Managers get team-wide daily counts for check-ins, reports, and blocked reports, plus employee rows and selectable date-range detail. The view combines app attendance/progress with matching legacy `GPS_Attendance` and `Report_Data` rows when those tabs exist, matched by employee ID. Historical detail is read-only.
- Managers can assign shifts for active employees and review the next 60 days of team schedules. Employees see only their own upcoming schedules. The first saved shift creates `App_Schedule`.
- Managers can set the office geofence from **Team view → Attendance fence**, either capturing the current device GPS after tapping the button or entering coordinates manually. Location is optional; any available coordinates are recorded with a status and do not block attendance.
- Day Buddy is shown above all employee views. It is a local rule-based helper that reads the current signed-in user's own data through ownership-filtered server endpoints; it is not a generative AI service.
- Employees can create product-specific AMC reports for the 88 branches in the uploaded visit lists or enter a new branch. The app captures engineer signature, optional customer/manager signature, stamp photo, and optional GPS; generates and saves a PDF in the owner's Drive; previews and prints it in-app. Managers can review the team AMC list. The first save needs Drive/Docs authorization by the Apps Script owner.
- Site reports have separate **AMC report** and **Service report** forms. AMC accepts CCTV and/or Biometric System only; AMC engineer/customer signatures and branch stamp are required. Service reports cover UPS, Computer, Printer, Digital Signage, Home Automation and Other, with category-specific inspection checklists, equipment details, complaint, diagnosis, work done, materials, status, recommendations and optional GPS. Service engineer/customer signatures remain required, while the service stamp photo is optional. Service PDFs and history are saved separately in `App_Service_Reports`; AMC records remain in `AMC_Reports`.
- The installable static PWA in `../app/` opens this connected Apps Script workspace directly through `connected.html`. The Apps Script page is the authenticated application and writes to Sheets; the static PWA does not copy, cache, or synchronize employee data itself. The legacy `index.html` and `lite.html` screens remain device-only personal logs and must not be used as official attendance or progress reports.

## Cost, quota, and limits

Apps Script and Sheets may be usable within Google's free account quotas, but quotas and availability are controlled by Google and can change. This project has no dedicated server. Email delivery is subject to the deploying Google account's `MailApp` recipient quota (currently 100/day for consumer accounts and 1,500/day for Workspace accounts); Google can change these limits. Email OTP verifies the mailbox, not the employee's phone number.

After sign-in, the browser stores its session token locally and the Apps Script project stores only a hash in `App_Sessions`. Sessions persist across refreshes, expire after eight hours without user activity, and are revoked on sign-out or account deactivation. Keep devices private; signing out removes the server-side session. The app refreshes visible-page data about every ten minutes and when returning to the app; background refresh does not reset the eight-hour idle timer. Browser storage must be enabled for refresh-safe sign-in. There is no IP/device abuse control here. Keep the employee allowlist current, remove access by deactivating an employee or removing their email, and rotate exposed provider credentials. Geo checks are a practical attendance signal, not proof against mocked device location.

The app does not live-track employees or send background arrival/exit alerts. Browser location is requested only when the manager taps the fence GPS button or an employee taps an attendance action. Background geofencing needs native Android background-location access; it is not provided by this PWA.

## References

- [Apps Script web apps](https://developers.google.com/apps-script/guides/web)
- [HTML Service client/server calls](https://developers.google.com/apps-script/guides/html/communication)
- [HTML Service restrictions](https://developers.google.com/apps-script/guides/html/restrictions)




## Live schedule workflow

The deployed app includes an employee My schedule view plus manager shift assignment and team schedule list. The schedule handlers require an authenticated session; only manager/admin users can create and list team schedules, and each employee can read their own upcoming schedules. A manager login is required for end-to-end UI testing; no test schedule is written automatically.

The productivity workflows use `App_Tasks` and `App_Requests`, created on first use without clearing data. Managers assign tasks with priority and due date; employees update task status and notes. Leave requests are manager-approved records. A one-day shift-change request updates the employee's one matching schedule row only when approved; a missing or duplicate match blocks approval. Weekly team reporting is available in Team view. Managers can enable a daily 6 PM scheduled-team exception digest and Monday 8 AM weekly report; Apps Script triggers and mail use the deploying account's quotas and project time zone. Daily digests exclude approved leave and require assigned schedules to identify expected attendance.

## CRM and stock workflow

Managers and admins see **CRM & stock** automatically. From that screen they can register products (SKU/barcode, category, HSN/SAC, MRP, sale price, GST rate, reorder level and preferred vendor), customers, vendors, and grant/revoke the combined CRM and stock workspace for selected active employees. Employee grants are recorded in `App_Commerce_Access` and checked by the server on every commerce request. The **CRM & follow-ups** tab is the sales pipeline: add leads, set product interest, source, stage, owner, next action and follow-up date, then use Call or WhatsApp to contact them manually. Managers can see and assign all leads; an employee sees and edits only leads assigned to them, and new employee-created leads are assigned to that employee.

On first CRM use, the app creates `App_CRM_Leads` in the connected spreadsheet. Lead edits update the same row; stage options are New, Contacted, Qualified, Quote sent, Won and Lost. Open leads require a next action and follow-up date. The dashboard lists overdue, due-today and next-seven-day follow-ups. In the CRM tab, a manager can select **Enable daily lead reminders** to install a once-daily 9 AM Apps Script trigger. It emails the assigned employee and managers about overdue or due open leads, once per lead per day. It does not send email or WhatsApp messages to customers. The trigger runs in the Apps Script project time zone and uses the script owner's mail quota; check **Project Settings → Time zone** and authorize the trigger if Google requests it. Phone links open the device dialer or WhatsApp; enter a country code for WhatsApp links.

On first use the app creates `App_Products`, `App_Customers`, `App_Vendors`, `App_Stock_Movements`, `App_Sales_Invoices`, `App_Sales_Lines`, and `App_Commerce_Access`. Receive stock by scanning/searching a product, entering a whole-number quantity, vendor, cost and supplier bill reference. Internal issues are separately recorded. Sales bills validate available stock, deduct it under a script lock, calculate GST from the product rate, save the invoice PDF to the owner's Drive folder `Rushabh Workday Bills`, and record the invoice and movements in Sheets. Barcode camera scanning uses the mobile rear camera when the browser supports `BarcodeDetector`; manual barcode entry remains available.

Supplier bill OCR is a draft aid: it extracts text and may suggest the invoice number and a vendor GSTIN match. It does not post quantities; the employee must review the bill, select each catalog product and enter its quantity before saving stock. If OCR reports a setup error, the script owner must enable Drive API v3 under Apps Script Services, enable the Google Drive API in the linked Cloud project if prompted, run `authorizeCommerceOcr_` in the Apps Script editor, approve access, then deploy a new version. That helper checks API access only. OCR text is temporary and the converted document is trashed after extraction.

Company name, address, contact and GSTIN for bills are set in **CRM & stock → Company bill details**. The bill currently calculates GST as a single amount using the catalog rate and prints HSN/SAC where entered; it does not determine place of supply or split CGST/SGST versus IGST. Validate those settings and tax treatment with your accountant before using the output as a statutory GST tax invoice.

Current stock is calculated from the movement ledger rather than manually overwritten. Low-stock cards show products at or below their reorder threshold and the preferred vendor when configured. Keep SKUs/barcodes unique and enter opening stock as a stock-in transaction so the balance starts from the correct quantity.
## Phone reminders (Firebase Cloud Messaging)

Employee phone reminders use Firebase Cloud Messaging (FCM). Managers can send check-in, check-out, daily report, and schedule reminders from Team dashboard. Employees register each phone from My day → Enable phone reminders. If a device has not registered, manager reminders fall back to email.

The Firebase project ID is configured in source, and the device setup link is fixed to the GitHub Pages host so an old Script Property cannot redirect employees back to Apps Script. The public Firebase web config and VAPID key belong in `push-config.js`. The Apps Script owner must run `authorizePushNotifications` once and approve the requested Firebase Messaging and external-request scopes. The owner account also needs the Firebase Cloud Messaging Admin role in the Firebase project; project owner access already includes this. Never put service-account private keys or OAuth tokens in GitHub. Until owner authorization succeeds, email reminders remain the fallback.
